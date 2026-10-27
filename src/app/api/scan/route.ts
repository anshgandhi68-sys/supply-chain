import { NextRequest, NextResponse } from 'next/server';
import { runSupplyChainScan } from '@/lib/scanner';
import { runLocalManifestScan } from '@/lib/manifest-scanner';

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

    // Direct manifest upload / paste mode
    if (body.packageJsonContent || body.packageLockContent || body.manifestContent) {
      const result = await runLocalManifestScan({
        packageJsonContent: body.packageJsonContent || body.manifestContent,
        packageLockContent: body.packageLockContent,
        workflowYamlContent: body.workflowYamlContent,
        projectName: body.projectName || 'Uploaded Project',
      });
      return NextResponse.json(result);
    }

    // Remote GitHub repository or demo scan
    const repoUrl = body.repoUrl || body.repositoryUrl;
    const token = body.token || body.githubToken;
    const forceDemo = Boolean(body.forceDemo);

    if (!repoUrl && !forceDemo) {
      return NextResponse.json(
        { error: 'Repository URL or manifest content is required.' },
        { status: 400 }
      );
    }

    const result = await runSupplyChainScan(repoUrl || 'demo', token, forceDemo);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Internal scanning error: ${msg}` },
      { status: 500 }
    );
  }
}
