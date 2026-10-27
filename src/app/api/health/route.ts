import { NextResponse } from 'next/server';
import { SCANNER_VERSION } from '@/lib/scanner';

export async function GET() {
  const startTime = Date.now();
  let osvStatus: 'reachable' | 'unreachable' = 'reachable';
  let osvLatencyMs = 0;

  try {
    const osvStart = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const osvRes = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: [{ package: { name: 'lodash', ecosystem: 'npm' }, version: '4.17.20' }] }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    osvLatencyMs = Date.now() - osvStart;

    if (!osvRes.ok) {
      osvStatus = 'unreachable';
    }
  } catch {
    osvStatus = 'unreachable';
  }

  const memory = process.memoryUsage();

  const healthData = {
    status: osvStatus === 'reachable' ? 'healthy' : 'degraded',
    service: 'Supply Chain Sentinel',
    scannerVersion: SCANNER_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      rssMb: Math.round(memory.rss / 1024 / 1024),
    },
    integrations: {
      osvDatabase: {
        status: osvStatus,
        latencyMs: osvLatencyMs,
        endpoint: 'https://api.osv.dev/v1/querybatch',
      },
      githubApi: {
        status: 'configured',
        hostsAllowed: ['github.com', 'api.github.com', 'raw.githubusercontent.com'],
        fallbackTokenConfigured: Boolean(process.env.GITHUB_API_TOKEN),
      },
      clerkAuth: {
        status: Boolean(process.env.CLERK_SECRET_KEY || process.env.CLERK_JWT_KEY) ? 'configured' : 'unconfigured',
        provider: process.env.AUTH_PROVIDER || (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) ? 'managed' : 'local'),
        hasSecretKey: Boolean(process.env.CLERK_SECRET_KEY),
        hasJwtPublicKey: Boolean(process.env.CLERK_JWT_KEY),
        hasCustomIssuer: Boolean(process.env.CLERK_ISSUER),
        hasCustomAudience: Boolean(process.env.CLERK_AUDIENCE),
      },
      upstashRedis: {
        status: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ? 'configured' : 'unconfigured',
        isDistributed: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
        fallbackMode: 'local-sliding-window',
      },
      database: {
        status: (await import('@/lib/auth/workspace-service')).getStorageStatus().connectionState,
        isDurable: (await import('@/lib/auth/workspace-service')).getStorageStatus().isDurable,
        backend: (await import('@/lib/auth/workspace-service')).getStorageStatus().backend,
      },
    },
    storage: (await import('@/lib/auth/workspace-service')).getStorageStatus(),
    rateLimiting: (await import('@/lib/rate-limiter')).getRateLimiterStatus(),
    metrics: (await import('@/lib/rate-limiter')).getSystemMetrics(),
    checksDurationMs: Date.now() - startTime,
  };

  return NextResponse.json(healthData, {
    status: healthData.status === 'healthy' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}
