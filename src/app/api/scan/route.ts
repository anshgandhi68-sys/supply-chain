import { NextRequest, NextResponse } from 'next/server';
import { runSupplyChainScan } from '@/lib/scanner';
import { runLocalManifestScan } from '@/lib/manifest-scanner';
import { readJsonBodyWithLimit } from '@/lib/api-payload';
import {
  getClientIdentifier,
  checkRateLimitAsync,
  acquireConcurrencySlotAsync,
  releaseConcurrencySlotAsync,
  recordScanMetrics,
  generateRequestId,
  logStructuredEvent,
  ANONYMOUS_POLICY,
  AUTHENTICATED_POLICY,
} from '@/lib/rate-limiter';
import { getAuthContext, saveWorkspaceScan } from '@/lib/auth/workspace-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const incomingRequestId = req.headers.get('x-request-id');
  const requestId = incomingRequestId || generateRequestId();
  const auth = await getAuthContext(req);
  const client = getClientIdentifier(
    req,
    auth.isAuthenticated && auth.workspace && auth.user
      ? { isAuthenticated: true, workspaceId: auth.workspace.id, userId: auth.user.id }
      : undefined
  );
  const policy = client.isAuthenticated ? AUTHENTICATED_POLICY : ANONYMOUS_POLICY;

  // 1. Sliding window rate limit check (supports distributed Upstash Redis with local fallback)
  const rateLimitResult = await checkRateLimitAsync(client.id, policy);
  if (!rateLimitResult.allowed) {
    logStructuredEvent({
      requestId,
      action: 'scan_rate_limited',
      clientId: client.id,
      durationMs: Date.now() - startTime,
      status: 429,
      error: 'Rate limit exceeded',
    });

    return NextResponse.json(
      {
        error: 'Too many scan requests. Please wait before attempting another scan.',
        retryAfter: rateLimitResult.resetSeconds,
      },
      {
        status: 429,
        headers: {
          'x-request-id': requestId,
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimitResult.resetSeconds),
          'Retry-After': String(rateLimitResult.resetSeconds),
        },
      }
    );
  }

  // 2. Concurrency slot acquisition (distributed or process-local)
  const slot = await acquireConcurrencySlotAsync(client.id, policy.maxConcurrent);
  if (!slot.acquired) {
    logStructuredEvent({
      requestId,
      action: 'scan_concurrency_rejected',
      clientId: client.id,
      durationMs: Date.now() - startTime,
      status: 429,
      error: `Concurrency limit exceeded (max: ${policy.maxConcurrent})`,
    });

    return NextResponse.json(
      {
        error: `Active scan concurrency limit reached (${policy.maxConcurrent} parallel scan(s)). Please wait for existing scans to finish.`,
        retryAfter: 3,
      },
      {
        status: 429,
        headers: {
          'x-request-id': requestId,
          'Retry-After': '3',
        },
      }
    );
  }

  try {
    const { data: body, error, status } = await readJsonBodyWithLimit<any>(req);
    if (error || !body) {
      logStructuredEvent({
        requestId,
        action: 'scan_bad_request',
        clientId: client.id,
        durationMs: Date.now() - startTime,
        status: status || 400,
        error,
      });

      return NextResponse.json(
        { error },
        {
          status: status || 400,
          headers: {
            'x-request-id': requestId,
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          },
        }
      );
    }

    let scanResult: any;

    // Direct manifest upload / paste mode
    if (body.packageJsonContent || body.packageLockContent || body.manifestContent) {
      scanResult = await runLocalManifestScan({
        packageJsonContent: body.packageJsonContent || body.manifestContent,
        packageLockContent: body.packageLockContent,
        workflowYamlContent: body.workflowYamlContent,
        projectName: body.projectName || 'Uploaded Project',
      });
    } else {
      // Remote GitHub repository or demo scan
      const repoUrl = body.repoUrl || body.repositoryUrl;
      const token = body.token || body.githubToken;
      const forceDemo = Boolean(body.forceDemo);

      if (!repoUrl && !forceDemo) {
        return NextResponse.json(
          { error: 'Repository URL or manifest content is required.' },
          {
            status: 400,
            headers: {
              'x-request-id': requestId,
              'X-RateLimit-Limit': String(rateLimitResult.limit),
              'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            },
          }
        );
      }

      scanResult = await runSupplyChainScan(repoUrl || 'demo', token, forceDemo);
    }

    const durationMs = Date.now() - startTime;
    recordScanMetrics(durationMs, true);

    // Optional workspace persistence if authenticated and requested
    if (body.saveToWorkspace && auth.isAuthenticated && auth.workspace && auth.user) {
      try {
        await saveWorkspaceScan(auth.workspace.id, auth.user.id, {
          repository: scanResult.repository?.fullName || body.projectName || 'Manual Scan',
          commitSha: scanResult.repository?.commitSha,
          defaultBranch: scanResult.repository?.defaultBranch,
          scanVerdict: scanResult.scanVerdict || 'complete_clean',
          stats: {
            totalFindings: scanResult.stats?.totalFindings || 0,
            criticalCount: scanResult.stats?.criticalCount || 0,
            highCount: scanResult.stats?.highCount || 0,
            mediumCount: scanResult.stats?.mediumCount || 0,
            lowCount: scanResult.stats?.lowCount || 0,
            dependenciesScanned: scanResult.stats?.dependenciesScanned || 0,
            workflowsScanned: scanResult.stats?.workflowsScanned || 0,
          },
          isDemo: Boolean(scanResult.isDemo),
        });
      } catch (saveErr) {
        // Log error but do not fail the scan response
        console.warn('Failed to auto-save scan to workspace:', saveErr);
      }
    }

    logStructuredEvent({
      requestId,
      action: 'scan_completed',
      clientId: client.id,
      durationMs,
      status: 200,
      metadata: {
        verdict: scanResult.summary?.verdict,
        totalFindings: scanResult.summary?.totalFindings,
        dependenciesScanned: scanResult.summary?.dependenciesScanned,
      },
    });

    return NextResponse.json(scanResult, {
      status: 200,
      headers: {
        'x-request-id': requestId,
        'X-RateLimit-Limit': String(rateLimitResult.limit),
        'X-RateLimit-Remaining': String(rateLimitResult.remaining),
      },
    });
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    const isUpstream = msg.toLowerCase().includes('github') || msg.toLowerCase().includes('network');

    recordScanMetrics(durationMs, false, isUpstream);

    logStructuredEvent({
      requestId,
      action: 'scan_failed',
      clientId: client.id,
      durationMs,
      status: 500,
      error: msg,
    });

    return NextResponse.json(
      { error: `Internal scanning error: ${msg}` },
      {
        status: 500,
        headers: {
          'x-request-id': requestId,
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
        },
      }
    );
  } finally {
    await releaseConcurrencySlotAsync(client.id);
  }
}
