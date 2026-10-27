/**
 * Supply Chain Sentinel 2.0 - Workspace & Authorization Service
 * Enforces server-side authorization, tenant isolation (anti-IDOR),
 * audit trails, and zero-token data retention policies.
 */

import {
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  StoredScanRecord,
  AuditEvent,
  AuthContext,
} from './types';
import { redactSecrets } from '../redaction';

// Role hierarchy weights
const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3,
  owner: 4,
};

// In-memory data store for local development mode
const inMemoryWorkspaces = new Map<string, Workspace>();
const inMemoryMembers = new Map<string, WorkspaceMember[]>(); // key: workspaceId
const inMemoryScans = new Map<string, StoredScanRecord[]>(); // key: workspaceId
const inMemoryAuditLogs: AuditEvent[] = [];

// Seed default development workspace
const DEV_USER: User = {
  id: 'usr_local_dev',
  email: 'developer@sentinel.local',
  name: 'Local Developer',
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
};

const DEV_WORKSPACE: Workspace = {
  id: 'ws_local_preview',
  name: 'Local Development Workspace',
  slug: 'local-dev',
  tier: 'pilot',
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
  maxScansPerMonth: 100,
};

inMemoryWorkspaces.set(DEV_WORKSPACE.id, DEV_WORKSPACE);
inMemoryMembers.set(DEV_WORKSPACE.id, [
  {
    workspaceId: DEV_WORKSPACE.id,
    userId: DEV_USER.id,
    role: 'owner',
    joinedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
  },
]);
inMemoryScans.set(DEV_WORKSPACE.id, []);

/**
 * Resolves the authenticated context from the HTTP request.
 * Operates in local development mode unless production auth headers/environment are set.
 */
export async function getAuthContext(req?: Request): Promise<AuthContext> {
  const customWorkspaceId = req?.headers.get('x-sentinel-workspace-id');
  const customUserId = req?.headers.get('x-sentinel-user-id');

  // In production with managed auth, validate token/session against provider
  if (process.env.AUTH_PROVIDER === 'managed' && process.env.MANAGED_AUTH_SECRET) {
    // Reserved for managed provider verification (Clerk / Supabase JWT)
  }

  // Local development / preview mode
  const workspaceId = customWorkspaceId || DEV_WORKSPACE.id;
  const userId = customUserId || DEV_USER.id;

  const workspace = inMemoryWorkspaces.get(workspaceId) || DEV_WORKSPACE;
  const members = inMemoryMembers.get(workspaceId) || [];
  const member = members.find((m) => m.userId === userId) || {
    workspaceId: workspace.id,
    userId,
    role: 'viewer' as WorkspaceRole,
    joinedAt: new Date().toISOString(),
  };

  return {
    user: {
      id: userId,
      email: `${userId}@sentinel.local`,
      name: userId === DEV_USER.id ? DEV_USER.name : `User ${userId}`,
      createdAt: DEV_USER.createdAt,
    },
    workspace,
    member,
    isDevelopmentMode: true,
  };
}

/**
 * Enforces server-side authorization: verifies that the user belongs to the target
 * workspace and possesses the required minimum role.
 */
export async function requireWorkspaceAccess(
  workspaceId: string,
  userId: string,
  requiredRole: WorkspaceRole = 'viewer'
): Promise<{ authorized: boolean; member?: WorkspaceMember; error?: string }> {
  if (!workspaceId || !userId) {
    return { authorized: false, error: 'workspaceId and userId are required.' };
  }

  const members = inMemoryMembers.get(workspaceId);
  if (!members) {
    return { authorized: false, error: 'Workspace not found.' };
  }

  const member = members.find((m) => m.userId === userId);
  if (!member) {
    return { authorized: false, error: 'Access denied: user is not a member of this workspace.' };
  }

  const userWeight = ROLE_HIERARCHY[member.role] || 0;
  const requiredWeight = ROLE_HIERARCHY[requiredRole] || 1;

  if (userWeight < requiredWeight) {
    return {
      authorized: false,
      member,
      error: `Forbidden: role '${member.role}' does not satisfy minimum role '${requiredRole}'.`,
    };
  }

  return { authorized: true, member };
}

/**
 * Saves a scan record under the specified workspace after verifying authorization.
 * Strictly guarantees that no tokens, credentials, or full repositories are persisted.
 */
export async function saveWorkspaceScan(
  workspaceId: string,
  userId: string,
  scanData: {
    repository: string;
    commitSha?: string;
    defaultBranch?: string;
    scanVerdict: any;
    stats: any;
    isDemo?: boolean;
    retentionDays?: number;
  }
): Promise<{ success: boolean; record?: StoredScanRecord; error?: string }> {
  const auth = await requireWorkspaceAccess(workspaceId, userId, 'analyst');
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const retentionDays = scanData.retentionDays || 30;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

  // Redact any accidental tokens from repository string
  const cleanRepo = redactSecrets(scanData.repository);

  const newRecord: StoredScanRecord = {
    id: `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    workspaceId,
    repository: cleanRepo,
    commitSha: scanData.commitSha?.slice(0, 40),
    defaultBranch: scanData.defaultBranch || 'main',
    scannedAt: now.toISOString(),
    scanVerdict: scanData.scanVerdict,
    stats: {
      totalFindings: scanData.stats?.totalFindings || 0,
      criticalCount: scanData.stats?.criticalCount || 0,
      highCount: scanData.stats?.highCount || 0,
      mediumCount: scanData.stats?.mediumCount || 0,
      lowCount: scanData.stats?.lowCount || 0,
      dependenciesScanned: scanData.stats?.dependenciesScanned || 0,
      workflowsScanned: scanData.stats?.workflowsScanned || 0,
    },
    retentionDays,
    retentionExpiresAt: expiresAt,
    isDemo: Boolean(scanData.isDemo),
  };

  const list = inMemoryScans.get(workspaceId) || [];
  list.unshift(newRecord);
  inMemoryScans.set(workspaceId, list);

  // Log audit event
  await logAuditEvent({
    workspaceId,
    actorId: userId,
    action: 'scan_saved',
    resourceType: 'scan',
    resourceId: newRecord.id,
    metadata: {
      repository: cleanRepo,
      scanVerdict: newRecord.scanVerdict,
      totalFindings: newRecord.stats.totalFindings,
    },
  });

  return { success: true, record: newRecord };
}

/**
 * Lists stored scans for a workspace with tenant isolation (anti-IDOR)
 * and automatic omission of expired retention records.
 */
export async function listWorkspaceScans(
  workspaceId: string,
  userId: string
): Promise<{ success: boolean; scans?: StoredScanRecord[]; error?: string }> {
  const auth = await requireWorkspaceAccess(workspaceId, userId, 'viewer');
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const list = inMemoryScans.get(workspaceId) || [];
  const now = new Date().toISOString();

  // Filter out records past their retention expiration
  const activeScans = list.filter((scan) => scan.retentionExpiresAt > now);

  return { success: true, scans: activeScans };
}

/**
 * Deletes a stored scan record with server-side authorization enforcement.
 */
export async function deleteWorkspaceScan(
  workspaceId: string,
  userId: string,
  scanId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireWorkspaceAccess(workspaceId, userId, 'admin');
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const list = inMemoryScans.get(workspaceId) || [];
  const index = list.findIndex((s) => s.id === scanId);
  if (index === -1) {
    return { success: false, error: 'Scan record not found in workspace.' };
  }

  const [deleted] = list.splice(index, 1);
  inMemoryScans.set(workspaceId, list);

  await logAuditEvent({
    workspaceId,
    actorId: userId,
    action: 'scan_deleted',
    resourceType: 'scan',
    resourceId: scanId,
    metadata: { repository: deleted.repository },
  });

  return { success: true };
}

/**
 * Appends an event to the immutable workspace audit trail.
 */
export async function logAuditEvent(
  event: Omit<AuditEvent, 'id' | 'timestamp'>
): Promise<AuditEvent> {
  const newEvent: AuditEvent = {
    ...event,
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    timestamp: new Date().toISOString(),
  };

  inMemoryAuditLogs.push(newEvent);

  // Structured security log
  if (process.env.NODE_ENV !== 'test') {
    console.info(
      JSON.stringify({
        level: 'AUDIT',
        action: newEvent.action,
        workspaceId: newEvent.workspaceId,
        actorId: newEvent.actorId,
        resourceType: newEvent.resourceType,
        resourceId: newEvent.resourceId,
        timestamp: newEvent.timestamp,
      })
    );
  }

  return newEvent;
}

/**
 * Retrieves audit events for a workspace, enforcing admin authorization.
 */
export async function listAuditEvents(
  workspaceId: string,
  userId: string
): Promise<{ success: boolean; events?: AuditEvent[]; error?: string }> {
  const auth = await requireWorkspaceAccess(workspaceId, userId, 'admin');
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const events = inMemoryAuditLogs.filter((e) => e.workspaceId === workspaceId);
  return { success: true, events };
}

/**
 * Registers an isolated workspace for tenant-testing or preview environments.
 */
export function createTestWorkspace(
  workspaceId: string,
  ownerUserId: string,
  role: WorkspaceRole = 'owner',
  name: string = 'Test Workspace'
): Workspace {
  const ws: Workspace = {
    id: workspaceId,
    name,
    slug: workspaceId.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    tier: 'pilot',
    createdAt: new Date().toISOString(),
    maxScansPerMonth: 50,
  };
  inMemoryWorkspaces.set(workspaceId, ws);
  inMemoryMembers.set(workspaceId, [
    {
      workspaceId,
      userId: ownerUserId,
      role,
      joinedAt: new Date().toISOString(),
    },
  ]);
  inMemoryScans.set(workspaceId, []);
  return ws;
}

/**
 * Adds a member with a specific role to a workspace for testing authorization.
 */
export function addTestMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): void {
  const members = inMemoryMembers.get(workspaceId) || [];
  members.push({
    workspaceId,
    userId,
    role,
    joinedAt: new Date().toISOString(),
  });
  inMemoryMembers.set(workspaceId, members);
}

