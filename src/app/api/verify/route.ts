import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkflowFix, verifyDependencyRemediation } from '@/lib/verifier';

export async function POST(req: NextRequest) {
  try {
    // Check Content-Length before full body buffering
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Payload too large. Request body exceeds the 5MB limit.' },
        { status: 413 }
      );
    }

    const body = await req.json();

    // 1. Dependency Upgrade Verification
    if (body.type === 'dependency' || (body.packageName && body.proposedVersion)) {
      const { packageName, currentVersion, proposedVersion, ecosystem, advisoryId } = body;
      if (!packageName || !proposedVersion) {
        return NextResponse.json(
          { error: 'packageName and proposedVersion are required for dependency remediation verification.' },
          { status: 400 }
        );
      }

      const result = await verifyDependencyRemediation(
        packageName,
        currentVersion || '*',
        proposedVersion,
        ecosystem || 'npm',
        advisoryId || ''
      );

      return NextResponse.json(result);
    }

    // 2. Workflow Fix Verification
    const { beforeYaml, afterYaml, fixtureName } = body;

    if (!beforeYaml || !afterYaml) {
      return NextResponse.json(
        { error: 'Both beforeYaml and afterYaml must be provided for deterministic fix verification.' },
        { status: 400 }
      );
    }

    const verification = verifyWorkflowFix(
      beforeYaml,
      afterYaml,
      fixtureName || 'Custom Workflow Verification'
    );

    return NextResponse.json(verification);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Verification engine failure: ${msg}` },
      { status: 500 }
    );
  }
}
