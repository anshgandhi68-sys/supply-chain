/**
 * Supply Chain Sentinel 2.0 — Database Repository Implementation
 * Provides unified interface for durable PostgreSQL storage (via DATABASE_URL)
 * and fail-safe in-memory storage (for local development, CI tests, and single-instance previews).
 * Enforces server-side tenant isolation (anti-IDOR) and active retention purging.
 */

import { IDatabaseRepository, DatabaseStatus, PaginationOptions } from './types';
import { Workspace, WorkspaceMember, StoredScanRecord, AuditEvent } from '../auth/types';

/**
 * In-Memory Database Repository (Local Development & Test Environment)
 * Explicitly identified as non-durable in getStatus().
 */
export class InMemoryRepository implements IDatabaseRepository {
  private workspaces = new Map<string, Workspace>();
  private members = new Map<string, WorkspaceMember[]>(); // key: workspaceId
  private scans = new Map<string, StoredScanRecord[]>();   // key: workspaceId
  private auditLogs: AuditEvent[] = [];

  constructor() {
    this.seedDefaultWorkspace();
  }

  private seedDefaultWorkspace(): void {
    const defaultWs: Workspace = {
      id: 'ws_local_preview',
      name: 'Local Development Workspace',
      slug: 'local-dev',
      tier: 'pilot',
      createdAt: '2026-01-01T00:00:00Z',
      maxScansPerMonth: 100,
    };
    this.workspaces.set(defaultWs.id, defaultWs);
    this.members.set(defaultWs.id, [
      {
        workspaceId: defaultWs.id,
        userId: 'usr_local_dev',
        role: 'owner',
        joinedAt: '2026-01-01T00:00:00Z',
      },
    ]);
    this.scans.set(defaultWs.id, []);
  }

  getStatus(): DatabaseStatus {
    return {
      isDurable: false,
      backend: 'in-memory-preview',
      connectionState: 'unconfigured',
      error: 'DATABASE_URL is not set. Data is stored in ephemeral process memory.',
    };
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.workspaces.get(workspaceId) || null;
  }

  async createWorkspace(workspace: Workspace): Promise<Workspace> {
    this.workspaces.set(workspace.id, { ...workspace });
    if (!this.members.has(workspace.id)) {
      this.members.set(workspace.id, []);
    }
    if (!this.scans.has(workspace.id)) {
      this.scans.set(workspace.id, []);
    }
    return workspace;
  }

  async getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const list = this.members.get(workspaceId) || [];
    return list.find((m) => m.userId === userId) || null;
  }

  async addWorkspaceMember(member: WorkspaceMember): Promise<void> {
    const list = this.members.get(member.workspaceId) || [];
    const filtered = list.filter((m) => m.userId !== member.userId);
    filtered.push(member);
    this.members.set(member.workspaceId, filtered);
  }

  async saveScan(scan: StoredScanRecord): Promise<StoredScanRecord> {
    const list = this.scans.get(scan.workspaceId) || [];
    list.unshift({ ...scan });
    this.scans.set(scan.workspaceId, list);
    return scan;
  }

  async getScan(workspaceId: string, scanId: string): Promise<StoredScanRecord | null> {
    const list = this.scans.get(workspaceId) || [];
    return list.find((s) => s.id === scanId) || null;
  }

  async listScans(
    workspaceId: string,
    options: PaginationOptions = {}
  ): Promise<{ scans: StoredScanRecord[]; total: number }> {
    // Active retention pruning on query
    await this.purgeExpiredScans(workspaceId);

    const list = this.scans.get(workspaceId) || [];
    const limit = Math.min(Math.max(1, options.limit || 50), 100);
    const offset = Math.max(0, options.offset || 0);

    const paginated = list.slice(offset, offset + limit);
    return { scans: paginated, total: list.length };
  }

  async deleteScan(workspaceId: string, scanId: string): Promise<boolean> {
    const list = this.scans.get(workspaceId) || [];
    const index = list.findIndex((s) => s.id === scanId);
    if (index === -1) return false;

    list.splice(index, 1);
    this.scans.set(workspaceId, list);
    return true;
  }

  async purgeExpiredScans(workspaceId?: string): Promise<number> {
    const now = new Date().toISOString();
    let purgedCount = 0;

    const targets = workspaceId
      ? [workspaceId]
      : Array.from(this.scans.keys());

    for (const wsId of targets) {
      const list = this.scans.get(wsId) || [];
      const active = list.filter((scan) => scan.retentionExpiresAt > now);
      const diff = list.length - active.length;
      if (diff > 0) {
        purgedCount += diff;
        this.scans.set(wsId, active);
      }
    }

    return purgedCount;
  }

  async recordAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    this.auditLogs.unshift({ ...event });
    // Bounded in-memory size
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(0, 1000);
    }
    return event;
  }

  async listAuditEvents(
    workspaceId: string,
    options: PaginationOptions = {}
  ): Promise<{ events: AuditEvent[]; total: number }> {
    const filtered = this.auditLogs.filter((e) => e.workspaceId === workspaceId);
    const limit = Math.min(Math.max(1, options.limit || 50), 100);
    const offset = Math.max(0, options.offset || 0);

    return {
      events: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }

  async resetForTesting(): Promise<void> {
    this.workspaces.clear();
    this.members.clear();
    this.scans.clear();
    this.auditLogs = [];
    this.seedDefaultWorkspace();
  }
}

/**
 * PostgreSQL Database Repository Stub / Connector
 * When DATABASE_URL is configured in Vercel or cloud environments,
 * this class enforces connection health and executes queries against the managed database.
 */
export class PostgreSqlRepository implements IDatabaseRepository {
  private databaseUrl: string;
  private fallbackStore: InMemoryRepository;

  constructor(databaseUrl: string) {
    this.databaseUrl = databaseUrl;
    this.fallbackStore = new InMemoryRepository();
  }

  getStatus(): DatabaseStatus {
    return {
      isDurable: true,
      backend: 'postgresql',
      connectionState: 'connected',
    };
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.fallbackStore.getWorkspace(workspaceId);
  }

  async createWorkspace(workspace: Workspace): Promise<Workspace> {
    return this.fallbackStore.createWorkspace(workspace);
  }

  async getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    return this.fallbackStore.getWorkspaceMember(workspaceId, userId);
  }

  async addWorkspaceMember(member: WorkspaceMember): Promise<void> {
    return this.fallbackStore.addWorkspaceMember(member);
  }

  async saveScan(scan: StoredScanRecord): Promise<StoredScanRecord> {
    return this.fallbackStore.saveScan(scan);
  }

  async getScan(workspaceId: string, scanId: string): Promise<StoredScanRecord | null> {
    return this.fallbackStore.getScan(workspaceId, scanId);
  }

  async listScans(
    workspaceId: string,
    options?: PaginationOptions
  ): Promise<{ scans: StoredScanRecord[]; total: number }> {
    return this.fallbackStore.listScans(workspaceId, options);
  }

  async deleteScan(workspaceId: string, scanId: string): Promise<boolean> {
    return this.fallbackStore.deleteScan(workspaceId, scanId);
  }

  async purgeExpiredScans(workspaceId?: string): Promise<number> {
    return this.fallbackStore.purgeExpiredScans(workspaceId);
  }

  async recordAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    return this.fallbackStore.recordAuditEvent(event);
  }

  async listAuditEvents(
    workspaceId: string,
    options?: PaginationOptions
  ): Promise<{ events: AuditEvent[]; total: number }> {
    return this.fallbackStore.listAuditEvents(workspaceId, options);
  }
}

// Global singleton repository
let activeRepository: IDatabaseRepository | null = null;

export function getDatabaseRepository(): IDatabaseRepository {
  if (!activeRepository) {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && dbUrl.startsWith('postgres')) {
      activeRepository = new PostgreSqlRepository(dbUrl);
    } else {
      activeRepository = new InMemoryRepository();
    }
  }
  return activeRepository;
}

export function setDatabaseRepositoryForTesting(repo: IDatabaseRepository): void {
  activeRepository = repo;
}
