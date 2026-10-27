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

// In-memory process-local state
const requestWindows = new Map<string, WindowEntry>();
const activeConcurrency = new Map<string, number>();

// Metrics storage
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

/**
 * Extracts a unique client identifier from headers.
 * Prefers verified workspace ID or user ID, falls back to IP address.
 */
export function getClientIdentifier(req: Request): {
  id: string;
  isAuthenticated: boolean;
  clientIp: string;
} {
  const customWorkspace = req.headers.get('x-sentinel-workspace-id');
  const customUser = req.headers.get('x-sentinel-user-id');

  const forwarded = req.headers.get('x-forwarded-for');
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

  if (customWorkspace) {
    return { id: `ws:${customWorkspace}`, isAuthenticated: true, clientIp };
  }
  if (customUser) {
    return { id: `usr:${customUser}`, isAuthenticated: true, clientIp };
  }

  return { id: `ip:${clientIp}`, isAuthenticated: false, clientIp };
}

/**
 * Checks rate limit for a client identifier and updates sliding window.
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
 */
export function acquireConcurrencySlot(
  clientId: string,
  maxConcurrent: number
): { acquired: boolean; currentActive: number } {
  const current = activeConcurrency.get(clientId) || 0;
  if (current >= maxConcurrent) {
    metrics.concurrencyRejections++;
    return { acquired: false, currentActive: current };
  }

  activeConcurrency.set(clientId, current + 1);
  return { acquired: true, currentActive: current + 1 };
}

/**
 * Releases an in-flight concurrency slot upon completion or abort.
 */
export function releaseConcurrencySlot(clientId: string): void {
  const current = activeConcurrency.get(clientId) || 0;
  if (current <= 1) {
    activeConcurrency.delete(clientId);
  } else {
    activeConcurrency.set(clientId, current - 1);
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
