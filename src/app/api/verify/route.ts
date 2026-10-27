import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkflowFix, verifyDependencyRemediation } from '@/lib/verifier';
import { readJsonBodyWithLimit } from '@/lib/api-payload';

export async function POST(req: NextRequest) {
  try {
    const { data: body, error, status } = await readJsonBodyWithLimit<any>(req);
    if (error || !body) {
      return NextResponse.json({ error }, { status: status || 400 });
    }

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
