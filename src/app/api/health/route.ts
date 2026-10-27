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
