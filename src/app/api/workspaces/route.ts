import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, listWorkspaceScans } from '@/lib/auth/workspace-service';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth.isAuthenticated || !auth.user || !auth.workspace || !auth.member) {
      return NextResponse.json(
        { error: auth.authError || 'Unauthorized: Authentication required.' },
        { status: 401 }
      );
    }

    const scansResult = await listWorkspaceScans(auth.workspace.id, auth.user.id);

    return NextResponse.json({
      user: auth.user,
      workspace: auth.workspace,
      role: auth.member.role,
      isDevelopmentMode: auth.isDevelopmentMode,
      scans: scansResult.scans || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to load workspace: ${msg}` }, { status: 500 });
  }
}
