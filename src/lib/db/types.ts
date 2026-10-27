/**
 * Supply Chain Sentinel 2.0 — Database Domain Types
 */

import { WorkspaceRole, StoredScanRecord, AuditEvent, Workspace, User, WorkspaceMember } from '../auth/types';

export interface DatabaseStatus {
  isDurable: boolean;
  backend: 'postgresql' | 'in-memory-preview';
  connectionState: 'connected' | 'unconfigured' | 'error';
  error?: string;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface IDatabaseRepository {
  getStatus(): DatabaseStatus;

  // Workspaces & Members
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  createWorkspace(workspace: Workspace): Promise<Workspace>;
  getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  addWorkspaceMember(member: WorkspaceMember): Promise<void>;
  
  // Scans
  saveScan(scan: StoredScanRecord): Promise<StoredScanRecord>;
  getScan(workspaceId: string, scanId: string): Promise<StoredScanRecord | null>;
  listScans(workspaceId: string, options?: PaginationOptions): Promise<{ scans: StoredScanRecord[]; total: number }>;
  deleteScan(workspaceId: string, scanId: string): Promise<boolean>;
  purgeExpiredScans(workspaceId?: string): Promise<number>;

  // Audit Events
  recordAuditEvent(event: AuditEvent): Promise<AuditEvent>;
  listAuditEvents(workspaceId: string, options?: PaginationOptions): Promise<{ events: AuditEvent[]; total: number }>;

  // Transaction support / isolation check
  resetForTesting?(): Promise<void>;
}
