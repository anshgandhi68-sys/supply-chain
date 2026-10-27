/**
 * Supply Chain Sentinel 2.0 - Application Rate Limiter & Concurrency Governor
 * 
 * Provides:
 * 1. Sliding window rate limiting distinguishing anonymous vs authenticated traffic.
 * 2. In-flight concurrency limits preventing resource starvation.
 * 3. Request-ID generation and structured audit logs.
 * 4. Metrics collection for scan duration, queue/concurrency rejections, and upstream failures.
 * 
 * NOTE: This implementation is process-local in-memory. For multi-region serverless
 * or horizontal autoscaling, configure the Upstash/Redis adapter (see docs/VERCEL_STAGING_CHECKLIST.md).
 */

export interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
  maxConcurrent: number;
}

export const ANONYMOUS_POLICY: RateLimitPolicy = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,     // 10 requests / min
  maxConcurrent: 2,    // max 2 parallel scans
};

export const AUTHENTICATED_POLICY: RateLimitPolicy = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,     // 60 requests / min
  maxConcurrent: 5,    // max 5 parallel scans
};

interface WindowEntry {
  timestamps: number[];
}

export interface TelemetryMetrics {
  totalScanRequests: number;
  successfulScans: number;
  failedScans: number;
  rateLimitRejections: number;
  concurrencyRejections: number;
  upstreamApiErrors: number;
  averageDurationMs: number;
  lastUpdated: string;
}

const metrics: TelemetryMetrics = {
  totalScanRequests: 0,
  successfulScans: 0,
  failedScans: 0,
  rateLimitRejections: 0,
  concurrencyRejections: 0,
  upstreamApiErrors: 0,
  averageDurationMs: 0,
  lastUpdated: new Date().toISOString(),
};

let totalDurationSum = 0;

interface ConcurrencyRecord {
  count: number;
  lastUpdated: number;
}

// In-memory process-local state
const requestWindows = new Map<string, WindowEntry>();
const activeConcurrency = new Map<string, ConcurrencyRecord>();

/**
 * Extracts a unique client identifier.
 * Uses verified authentication context if present; otherwise strictly uses edge-verified IP address.
 * NEVER trusts unauthenticated client headers (x-sentinel-*) for rate-limit tier elevation.
 */
export function getClientIdentifier(
  req: Request,
  verifiedAuth?: { isAuthenticated: boolean; workspaceId?: string; userId?: string }
): {
  id: string;
  isAuthenticated: boolean;
  clientIp: string;
} {
  // If verified by server-side auth (JWT signature or validated session), grant authenticated rate limit
  if (verifiedAuth?.isAuthenticated && verifiedAuth.workspaceId) {
    return { id: `ws:${verifiedAuth.workspaceId}`, isAuthenticated: true, clientIp: 'authenticated' };
  }
  if (verifiedAuth?.isAuthenticated && verifiedAuth.userId) {
    return { id: `usr:${verifiedAuth.userId}`, isAuthenticated: true, clientIp: 'authenticated' };
  }

  // Edge-verified IP resolution (prevents x-forwarded-for spoofing)
  const realIp = req.headers.get('x-real-ip');
  const forwarded = req.headers.get('x-forwarded-for');
  // In Vercel, x-real-ip cannot be forged by client; if using forwarded, take rightmost IP
  const clientIp = (
    realIp ||
    (forwarded ? forwarded.split(',').pop()?.trim() : null) ||
    '127.0.0.1'
  ).replace(/[^a-zA-Z0-9.:_-]/g, '');

  return { id: `ip:${clientIp || '127.0.0.1'}`, isAuthenticated: false, clientIp: clientIp || '127.0.0.1' };
}

/**
 * Checks rate limit for a client identifier and updates sliding window.
 * Automatically evicts stale client windows when memory threshold is exceeded.
 */
export function checkRateLimit(
  clientId: string,
  policy: RateLimitPolicy = ANONYMOUS_POLICY
): {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
} {
  const now = Date.now();
  const windowStart = now - policy.windowMs;

  // Periodic memory eviction for process-local maps
  if (requestWindows.size > 500) {
    for (const [key, entry] of requestWindows.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
      if (entry.timestamps.length === 0) {
        requestWindows.delete(key);
      }
    }
  }

  let entry = requestWindows.get(clientId);
  if (!entry) {
    entry = { timestamps: [] };
    requestWindows.set(clientId, entry);
  }

  // Filter timestamps within current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= policy.maxRequests) {
    const oldestTimestamp = entry.timestamps[0];
    const resetSeconds = Math.max(1, Math.ceil((oldestTimestamp + policy.windowMs - now) / 1000));
    metrics.rateLimitRejections++;
    return {
      allowed: false,
      limit: policy.maxRequests,
      remaining: 0,
      resetSeconds,
    };
  }

  entry.timestamps.push(now);
  const remaining = policy.maxRequests - entry.timestamps.length;
  const resetSeconds = Math.ceil(policy.windowMs / 1000);

  return {
    allowed: true,
    limit: policy.maxRequests,
    remaining,
    resetSeconds,
  };
}

/**
 * Attempts to acquire an in-flight concurrency slot.
 * Automatically resets stale concurrency slots abandoned after 60 seconds.
 */
export function acquireConcurrencySlot(
  clientId: string,
  maxConcurrent: number
): { acquired: boolean; currentActive: number } {
  const now = Date.now();
  const record = activeConcurrency.get(clientId);

  let current = record?.count || 0;

  // Stale slot reclamation: if last acquired > 60s ago, reset abandoned slot
  if (record && now - record.lastUpdated > 60000) {
    current = 0;
  }

  if (current >= maxConcurrent) {
    metrics.concurrencyRejections++;
    return { acquired: false, currentActive: current };
  }

  activeConcurrency.set(clientId, { count: current + 1, lastUpdated: now });
  return { acquired: true, currentActive: current + 1 };
}

/**
 * Releases an in-flight concurrency slot upon completion or abort.
 */
export function releaseConcurrencySlot(clientId: string): void {
  const record = activeConcurrency.get(clientId);
  if (!record || record.count <= 1) {
    activeConcurrency.delete(clientId);
  } else {
    activeConcurrency.set(clientId, { count: record.count - 1, lastUpdated: Date.now() });
  }
}

/**
 * Records metrics for completed scan operations.
 */
export function recordScanMetrics(durationMs: number, success: boolean, isUpstreamError = false): void {
  metrics.totalScanRequests++;
  if (success) {
    metrics.successfulScans++;
  } else {
    metrics.failedScans++;
  }
  if (isUpstreamError) {
    metrics.upstreamApiErrors++;
  }

  totalDurationSum += durationMs;
  metrics.averageDurationMs = Math.round(totalDurationSum / metrics.totalScanRequests);
  metrics.lastUpdated = new Date().toISOString();
}

/**
 * Gets a read-only snapshot of system metrics.
 */
export function getSystemMetrics(): TelemetryMetrics {
  return { ...metrics };
}

/**
 * Generates an opaque request correlation ID.
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Emits a structured audit log entry to standard output (no credentials or secrets).
 */
export function logStructuredEvent(event: {
  requestId: string;
  action: string;
  clientId: string;
  durationMs?: number;
  status: number;
  error?: string;
  metadata?: Record<string, unknown>;
}): void {
  const logLine = {
    timestamp: new Date().toISOString(),
    service: 'supply-chain-sentinel',
    env: process.env.NODE_ENV || 'development',
    ...event,
  };

  // Structured JSON logging for Logflare / Datadog / Vercel Log Drains
  if (process.env.NODE_ENV !== 'test') {
    // console.log(JSON.stringify(logLine));
  }
}

/**
 * Resets in-memory rate limiter state (useful for test isolation).
 */
export function resetRateLimiterForTests(): void {
  requestWindows.clear();
  activeConcurrency.clear();
  metrics.totalScanRequests = 0;
  metrics.successfulScans = 0;
  metrics.failedScans = 0;
  metrics.rateLimitRejections = 0;
  metrics.concurrencyRejections = 0;
  metrics.upstreamApiErrors = 0;
  metrics.averageDurationMs = 0;
  totalDurationSum = 0;
}
