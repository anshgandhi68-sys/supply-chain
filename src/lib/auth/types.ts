/**
 * Supply Chain Sentinel 2.0 - SaaS Workspace & Authentication Domain Model
 * Designed for clean integration with managed auth providers (Clerk, Supabase, Auth0)
 * while providing an explicit, auditable local development workspace provider.
 */

import { ScanStatusVerdict } from '../types';

export type WorkspaceRole = 'owner' | 'admin' | 'analyst' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  tier: 'free' | 'pilot' | 'enterprise';
  createdAt: string;
  maxScansPerMonth: number;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface StoredScanRecord {
  id: string;
  workspaceId: string;
  repository: string;
  commitSha?: string;
  defaultBranch?: string;
  scannedAt: string;
  scanVerdict: ScanStatusVerdict;
  stats: {
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    dependenciesScanned: number;
    workflowsScanned: number;
  };
  retentionDays: number;
  retentionExpiresAt: string;
  isDemo: boolean;
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  actorId: string;
  action:
    | 'scan_initiated'
    | 'scan_saved'
    | 'scan_deleted'
    | 'report_exported'
    | 'member_invited'
    | 'member_removed'
    | 'workspace_settings_updated';
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  timestamp: string;
}

export interface AuthContext {
  isAuthenticated: boolean;
  user?: User;
  workspace?: Workspace;
  member?: WorkspaceMember;
  isDevelopmentMode: boolean;
  authError?: string;
}

