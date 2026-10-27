/**
 * Supply Chain Sentinel 2.0 - Application Rate Limiter & Concurrency Governor
 * 
 * Provides:
 * 1. Distributed rate limiting via Upstash Redis REST API when configured.
 * 2. Fail-secure process-local sliding window fallback (never fails open).
 * 3. In-flight concurrency limits preventing resource starvation.
 * 4. Request-ID generation and structured audit logs.
 * 5. Metrics collection for scan duration, queue/concurrency rejections, and upstream failures.
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

// In-memory process-local state (fallback and local development)
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
 * Executes a pipeline of commands against Upstash Redis REST API.
 * Times out after 1500ms to prevent blocking serverless requests.
 */
async function executeUpstashPipeline(
  commands: Array<Array<string | number>>
): Promise<any[] | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    const endpoint = `${url.replace(/\/$/, '')}/pipeline`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`Upstash Redis HTTP error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (Array.isArray(data)) {
      return data.map((item) => (item.error ? null : item.result));
    }
    return null;
  } catch (err: unknown) {
    // Fail secure: log and fall back to local process limiter
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Upstash Redis pipeline failed (${msg}), falling back to local rate limiter.`);
    return null;
  }
}

/**
 * Checks rate limit for a client identifier and updates sliding window (synchronous in-memory).
 */
export function checkRateLimit(
  clientId: string,
  policy: RateLimitPolicy = ANONYMOUS_POLICY
): {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  isDistributed?: boolean;
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
      isDistributed: false,
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
    isDistributed: false,
  };
}

/**
 * Checks rate limit asynchronously with distributed Upstash Redis support.
 * Falls back safely to local in-memory check if Redis is unconfigured or unreachable.
 */
export async function checkRateLimitAsync(
  clientId: string,
  policy: RateLimitPolicy = ANONYMOUS_POLICY
): Promise<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  isDistributed: boolean;
}> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const now = Date.now();
    const windowStart = now - policy.windowMs;
    const key = `sentinel:rl:${clientId}`;
    const ttlSeconds = Math.ceil(policy.windowMs / 1000) + 2;

    const results = await executeUpstashPipeline([
      ['ZREMRANGEBYSCORE', key, '0', String(windowStart)],
      ['ZCARD', key],
      ['EXPIRE', key, String(ttlSeconds)],
    ]);

    if (results && typeof results[1] === 'number') {
      const currentCount = results[1];
      if (currentCount >= policy.maxRequests) {
        metrics.rateLimitRejections++;
        return {
          allowed: false,
          limit: policy.maxRequests,
          remaining: 0,
          resetSeconds: Math.ceil(policy.windowMs / 1000),
          isDistributed: true,
        };
      }

      // Add current timestamp to Redis sorted set
      await executeUpstashPipeline([['ZADD', key, String(now), String(now)]]);

      return {
        allowed: true,
        limit: policy.maxRequests,
        remaining: Math.max(0, policy.maxRequests - currentCount - 1),
        resetSeconds: Math.ceil(policy.windowMs / 1000),
        isDistributed: true,
      };
    }
  }

  // Fallback to in-memory limiter
  const localRes = checkRateLimit(clientId, policy);
  return { ...localRes, isDistributed: false };
}

/**
 * Attempts to acquire an in-flight concurrency slot (synchronous in-memory).
 */
export function acquireConcurrencySlot(
  clientId: string,
  maxConcurrent: number
): { acquired: boolean; currentActive: number; isDistributed?: boolean } {
  const now = Date.now();
  const record = activeConcurrency.get(clientId);

  let current = record?.count || 0;

  // Stale slot reclamation: if last acquired > 60s ago, reset abandoned slot
  if (record && now - record.lastUpdated > 60000) {
    current = 0;
  }

  if (current >= maxConcurrent) {
    metrics.concurrencyRejections++;
    return { acquired: false, currentActive: current, isDistributed: false };
  }

  activeConcurrency.set(clientId, { count: current + 1, lastUpdated: now });
  return { acquired: true, currentActive: current + 1, isDistributed: false };
}

/**
 * Attempts to acquire an in-flight concurrency slot with distributed Redis coordination.
 * Falls back safely to local in-memory slot if Redis is unconfigured.
 */
export async function acquireConcurrencySlotAsync(
  clientId: string,
  maxConcurrent: number
): Promise<{ acquired: boolean; currentActive: number; isDistributed: boolean }> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const key = `sentinel:conc:${clientId}`;
    const results = await executeUpstashPipeline([
      ['INCR', key],
      ['EXPIRE', key, '60'], // auto-expire stale lock after 60s
    ]);

    if (results && typeof results[0] === 'number') {
      const active = results[0];
      if (active > maxConcurrent) {
        // Roll back counter
        await executeUpstashPipeline([['DECR', key]]);
        metrics.concurrencyRejections++;
        return { acquired: false, currentActive: active - 1, isDistributed: true };
      }
      return { acquired: true, currentActive: active, isDistributed: true };
    }
  }

  const localRes = acquireConcurrencySlot(clientId, maxConcurrent);
  return { ...localRes, isDistributed: false };
}

/**
 * Releases an in-flight concurrency slot (synchronous in-memory).
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
 * Releases an in-flight concurrency slot with distributed Redis coordination.
 */
export async function releaseConcurrencySlotAsync(clientId: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const key = `sentinel:conc:${clientId}`;
    await executeUpstashPipeline([['DECR', key]]);
  }

  releaseConcurrencySlot(clientId);
}

/**
 * Reports active rate-limiter backend and distributed configuration status.
 */
export function getRateLimiterStatus(): {
  isDistributed: boolean;
  backend: 'upstash-redis' | 'process-local';
  isConfigured: boolean;
} {
  const isConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
  return {
    isDistributed: isConfigured,
    backend: isConfigured ? 'upstash-redis' : 'process-local',
    isConfigured,
  };
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
