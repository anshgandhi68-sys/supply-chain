import { NextRequest, NextResponse } from 'next/server';
import { runSupplyChainScan } from '@/lib/scanner';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const repoUrl = body.repoUrl || body.repositoryUrl;
    const token = body.token || body.githubToken;
    const forceDemo = Boolean(body.forceDemo);

    if (!repoUrl && !forceDemo) {
      return NextResponse.json(
        { error: 'Repository URL is required.' },
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
