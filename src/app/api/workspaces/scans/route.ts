import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthContext,
  listWorkspaceScans,
  saveWorkspaceScan,
  deleteWorkspaceScan,
} from '@/lib/auth/workspace-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workspaces/scans
 * Returns scans for the caller's authorized workspace.
 * Prevents cross-workspace IDOR.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth.isAuthenticated || !auth.user || !auth.workspace) {
      return NextResponse.json(
        { error: auth.authError || 'Unauthorized: Authentication required.' },
        { status: 401 }
      );
    }

    const targetWorkspaceId = request.nextUrl.searchParams.get('workspaceId') || auth.workspace.id;

    const result = await listWorkspaceScans(targetWorkspaceId, auth.user.id);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      workspaceId: targetWorkspaceId,
      scans: result.scans || [],
      count: result.scans?.length || 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error while retrieving scans' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/scans
 * Saves a completed scan record to the authenticated workspace.
 * Requires 'analyst' role or higher.
 * Enforces zero-token retention and 30-day default expiration.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth.isAuthenticated || !auth.user || !auth.workspace) {
      return NextResponse.json(
        { error: auth.authError || 'Unauthorized: Authentication required.' },
        { status: 401 }
      );
    }

    const body = await request.json();

    if (!body || !body.repository) {
      return NextResponse.json(
        { error: 'repository name is required to save a scan record.' },
        { status: 400 }
      );
    }

    const targetWorkspaceId = body.workspaceId || auth.workspace.id;

    const result = await saveWorkspaceScan(targetWorkspaceId, auth.user.id, {
      repository: String(body.repository),
      commitSha: body.commitSha ? String(body.commitSha) : undefined,
      defaultBranch: body.defaultBranch ? String(body.defaultBranch) : 'main',
      scanVerdict: body.scanVerdict || 'CLEAN',
      stats: body.stats || {},
      isDemo: Boolean(body.isDemo),
      retentionDays: Number(body.retentionDays) || 30,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to save scan record' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        message: 'Scan record saved successfully to workspace',
        scan: result.record,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body or internal error' },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/workspaces/scans?scanId=...
 * Deletes a scan record from the workspace.
 * Requires 'admin' role or higher.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth.isAuthenticated || !auth.user || !auth.workspace) {
      return NextResponse.json(
        { error: auth.authError || 'Unauthorized: Authentication required.' },
        { status: 401 }
      );
    }

    const scanId = request.nextUrl.searchParams.get('scanId');
    const targetWorkspaceId = request.nextUrl.searchParams.get('workspaceId') || auth.workspace.id;

    if (!scanId) {
      return NextResponse.json(
        { error: 'scanId query parameter is required' },
        { status: 400 }
      );
    }

    const result = await deleteWorkspaceScan(targetWorkspaceId, auth.user.id, scanId);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Access denied or scan not found' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      message: 'Scan record deleted successfully',
      scanId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error while deleting scan' },
      { status: 500 }
    );
  }
}
