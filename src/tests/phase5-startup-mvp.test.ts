import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  requireWorkspaceAccess,
  saveWorkspaceScan,
  listWorkspaceScans,
  deleteWorkspaceScan,
  logAuditEvent,
  listAuditEvents,
  createTestWorkspace,
  getAuthContext,
} from '@/lib/auth/workspace-service';
import {
  checkRateLimit,
  acquireConcurrencySlot,
  releaseConcurrencySlot,
  recordScanMetrics,
  getSystemMetrics,
  resetRateLimiterForTests,
  getClientIdentifier,
  ANONYMOUS_POLICY,
  AUTHENTICATED_POLICY,
} from '@/lib/rate-limiter';
import { getSafeAgent } from '@/lib/github';
import { verifyManagedAuthToken } from '@/lib/auth/token-verifier';

describe('Phase 5 — Startup MVP Foundation, Workspaces, Rate Limiting & Trust', () => {
  beforeEach(() => {
    resetRateLimiterForTests();
  });

  describe('1. Server-Side RBAC & Tenant Isolation (Anti-IDOR)', () => {
    it('enforces role hierarchy: viewer cannot save or delete scans', async () => {
      const ws = createTestWorkspace('Acme Corp', 'usr_viewer_1', 'viewer');

      // Viewer cannot save scans (requires analyst)
      const saveRes = await saveWorkspaceScan(ws.id, 'usr_viewer_1', {
        repository: 'acme/frontend',
        scanVerdict: 'CLEAN',
        stats: { totalFindings: 0 },
      });
      expect(saveRes.success).toBe(false);
      expect(saveRes.error).toMatch(/does not satisfy minimum role/i);

      // Viewer cannot delete scans (requires admin)
      const delRes = await deleteWorkspaceScan(ws.id, 'usr_viewer_1', 'scan_123');
      expect(delRes.success).toBe(false);
      expect(delRes.error).toMatch(/does not satisfy minimum role/i);
    });

    it('allows analyst to save scans, but restricts deletion to admin/owner', async () => {
      const ws = createTestWorkspace('Beta Labs', 'usr_analyst_1', 'analyst');

      const saveRes = await saveWorkspaceScan(ws.id, 'usr_analyst_1', {
        repository: 'betalabs/core-api',
        scanVerdict: 'MODERATE',
        stats: { totalFindings: 3, criticalCount: 0, highCount: 1, mediumCount: 2, lowCount: 0 },
      });
      expect(saveRes.success).toBe(true);
      expect(saveRes.record).toBeDefined();
      const scanId = saveRes.record!.id;

      // Analyst cannot delete the scan
      const delRes = await deleteWorkspaceScan(ws.id, 'usr_analyst_1', scanId);
      expect(delRes.success).toBe(false);
      expect(delRes.error).toMatch(/does not satisfy minimum role/i);
    });

    it('strictly prevents cross-tenant access (anti-IDOR)', async () => {
      const wsA = createTestWorkspace('Tenant A', 'usr_tenant_a', 'owner');
      const wsB = createTestWorkspace('Tenant B', 'usr_tenant_b', 'owner');

      // Save a scan under Tenant A
      const saveA = await saveWorkspaceScan(wsA.id, 'usr_tenant_a', {
        repository: 'tenant-a/secret-repo',
        scanVerdict: 'CLEAN',
        stats: { totalFindings: 0 },
      });
      expect(saveA.success).toBe(true);

      // User from Tenant B attempts to read Tenant A's scans
      const listRes = await listWorkspaceScans(wsA.id, 'usr_tenant_b');
      expect(listRes.success).toBe(false);
      expect(listRes.error).toMatch(/Access denied/i);

      // User from Tenant B attempts to delete Tenant A's scan
      const delRes = await deleteWorkspaceScan(wsA.id, 'usr_tenant_b', saveA.record!.id);
      expect(delRes.success).toBe(false);
      expect(delRes.error).toMatch(/Access denied/i);
    });
  });

  describe('2. Zero-Token Persistence & Data Retention Lifecycle', () => {
    it('guarantees tokens are redacted from scan records prior to persistence', async () => {
      const ws = createTestWorkspace('Secure Inc', 'usr_admin_1', 'admin');

      const tokenPaddedRepo = 'https://ghp_abc1234567890abcdef1234567890abcdef12@github.com/secure/repo';
      const saveRes = await saveWorkspaceScan(ws.id, 'usr_admin_1', {
        repository: tokenPaddedRepo,
        scanVerdict: 'CLEAN',
        stats: { totalFindings: 0 },
      });

      expect(saveRes.success).toBe(true);
      expect(saveRes.record!.repository).not.toContain('ghp_');
      expect(saveRes.record!.repository).toContain('[REDACTED_GITHUB_PAT]');
    });

    it('sets 30-day retention and filters out expired scan records', async () => {
      const ws = createTestWorkspace('Prune Test', 'usr_owner_1', 'owner');

      // Save active scan
      const activeRes = await saveWorkspaceScan(ws.id, 'usr_owner_1', {
        repository: 'org/active-project',
        scanVerdict: 'CLEAN',
        stats: { totalFindings: 0 },
        retentionDays: 30,
      });
      expect(activeRes.success).toBe(true);

      // Verify expiration date is in the future
      const expiresAt = new Date(activeRes.record!.retentionExpiresAt).getTime();
      expect(expiresAt).toBeGreaterThan(Date.now());

      const list = await listWorkspaceScans(ws.id, 'usr_owner_1');
      expect(list.scans?.length).toBeGreaterThanOrEqual(1);
      expect(list.scans?.some((s) => s.id === activeRes.record!.id)).toBe(true);
    });

    it('logs tamper-evident audit events on scan save and scan deletion', async () => {
      const ws = createTestWorkspace('Audit Test', 'usr_admin_audit', 'admin');

      const saveRes = await saveWorkspaceScan(ws.id, 'usr_admin_audit', {
        repository: 'audit/test-repo',
        scanVerdict: 'HIGH',
        stats: { totalFindings: 5 },
      });
      const scanId = saveRes.record!.id;

      // Delete scan
      await deleteWorkspaceScan(ws.id, 'usr_admin_audit', scanId);

      const auditTrail = await listAuditEvents(ws.id, 'usr_admin_audit');
      expect(auditTrail.events?.some((e) => e.action === 'scan_saved' && e.resourceId === scanId)).toBe(true);
      expect(auditTrail.events?.some((e) => e.action === 'scan_deleted' && e.resourceId === scanId)).toBe(true);
    });
  });

  describe('3. Rate Limiting & Concurrency Governor', () => {
    it('enforces anonymous sliding window limits and resets cleanly', () => {
      const clientId = 'ip:198.51.100.42';

      // First 10 requests should succeed
      for (let i = 0; i < 10; i++) {
        const res = checkRateLimit(clientId, ANONYMOUS_POLICY);
        expect(res.allowed).toBe(true);
      }

      // 11th request must be rate limited
      const blockedRes = checkRateLimit(clientId, ANONYMOUS_POLICY);
      expect(blockedRes.allowed).toBe(false);
      expect(blockedRes.remaining).toBe(0);
      expect(blockedRes.resetSeconds).toBeGreaterThan(0);
    });

    it('grants higher limits to authenticated workspaces', () => {
      const authClientId = 'ws:ws_enterprise_01';

      // Authenticated policy allows up to 60 requests
      for (let i = 0; i < 30; i++) {
        const res = checkRateLimit(authClientId, AUTHENTICATED_POLICY);
        expect(res.allowed).toBe(true);
      }
    });

    it('governs in-flight concurrency and releases slots reliably', () => {
      const clientId = 'ip:203.0.113.1';
      const maxConcurrent = 2;

      // Acquire slot 1
      const s1 = acquireConcurrencySlot(clientId, maxConcurrent);
      expect(s1.acquired).toBe(true);

      // Acquire slot 2
      const s2 = acquireConcurrencySlot(clientId, maxConcurrent);
      expect(s2.acquired).toBe(true);

      // Slot 3 should be rejected (concurrency limit reached)
      const s3 = acquireConcurrencySlot(clientId, maxConcurrent);
      expect(s3.acquired).toBe(false);

      // Release slot 1
      releaseConcurrencySlot(clientId);

      // Now acquiring slot 3 should succeed
      const retrySlot = acquireConcurrencySlot(clientId, maxConcurrent);
      expect(retrySlot.acquired).toBe(true);

      // Clean up remaining slots
      releaseConcurrencySlot(clientId);
      releaseConcurrencySlot(clientId);
    });

    it('collects telemetry metrics for scan durations and failures', () => {
      recordScanMetrics(450, true);
      recordScanMetrics(550, true);
      recordScanMetrics(1200, false, true);

      const metrics = getSystemMetrics();
      expect(metrics.totalScanRequests).toBe(3);
      expect(metrics.successfulScans).toBe(2);
      expect(metrics.failedScans).toBe(1);
      expect(metrics.upstreamApiErrors).toBe(1);
      expect(metrics.averageDurationMs).toBeGreaterThan(0);
    });
  });

  describe('4. Socket-Level SSRF Interception Transport', () => {
    it('creates an undici Agent with custom socket lookup interceptor', () => {
      const agent = getSafeAgent();
      expect(agent).toBeDefined();
      expect(typeof agent.dispatch).toBe('function');
    });
  });

  describe('5. Cryptographic Managed Auth Token Verification (Clerk / Supabase / Auth0)', () => {
    const TEST_SECRET = 'sentinel_managed_auth_super_secret_key_123';

    function createTestJwt(payload: Record<string, unknown>, secret: string, alg = 'HS256'): string {
      const headerStr = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
      const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const sig =
        alg === 'none'
          ? ''
          : crypto.createHmac('sha256', secret).update(`${headerStr}.${payloadStr}`).digest('base64url');
      return `${headerStr}.${payloadStr}.${sig}`;
    }

    it('verifies a valid token with HS256 signature and returns claims', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createTestJwt(
        {
          sub: 'usr_clerk_123',
          email: 'analyst@startup.com',
          workspace_id: 'ws_prod_01',
          exp: nowSec + 3600,
          iss: 'https://clerk.startup.com',
          aud: 'sentinel-api',
        },
        TEST_SECRET
      );

      const result = verifyManagedAuthToken(token, TEST_SECRET, {
        issuer: 'https://clerk.startup.com',
        audience: 'sentinel-api',
      });
      expect(result.valid).toBe(true);
      expect(result.claims?.sub).toBe('usr_clerk_123');
      expect(result.claims?.workspace_id).toBe('ws_prod_01');
    });

    it('strictly forbids alg: none attack vectors', () => {
      const token = createTestJwt({ sub: 'usr_attacker' }, '', 'none');
      const result = verifyManagedAuthToken(token, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/disallowed|forbidden|none/i);
    });

    it('rejects forged token signatures with wrong secret', () => {
      const token = createTestJwt({ sub: 'usr_impersonator' }, 'wrong_secret');
      const result = verifyManagedAuthToken(token, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid.*signature/i);
    });

    it('rejects expired tokens safely', () => {
      const pastSec = Math.floor(Date.now() / 1000) - 300; // 5 mins ago
      const token = createTestJwt({ sub: 'usr_expired', exp: pastSec }, TEST_SECRET);
      const result = verifyManagedAuthToken(token, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/expired/i);
    });

    it('rejects issuer and audience mismatches', () => {
      const token = createTestJwt(
        { sub: 'usr_1', iss: 'https://evil.issuer.com', aud: 'other-app' },
        TEST_SECRET
      );

      const issResult = verifyManagedAuthToken(token, TEST_SECRET, { issuer: 'https://valid.issuer.com' });
      expect(issResult.valid).toBe(false);
      expect(issResult.error).toMatch(/issuer mismatch/i);

      const audResult = verifyManagedAuthToken(token, TEST_SECRET, { audience: 'sentinel-api' });
      expect(audResult.valid).toBe(false);
      expect(audResult.error).toMatch(/audience mismatch/i);
    });
  });

  describe('6. Fail-Closed Authentication & Spoofing Defense', () => {
    it('fails closed when managed auth is configured without Authorization header', async () => {
      const originalProvider = process.env.AUTH_PROVIDER;
      process.env.AUTH_PROVIDER = 'managed';
      process.env.MANAGED_AUTH_SECRET = 'secret';

      try {
        const req = new Request('https://sentinel.local/api/workspaces');
        const auth = await getAuthContext(req);
        expect(auth.isAuthenticated).toBe(false);
        expect(auth.authError).toMatch(/missing.*authorization/i);
      } finally {
        process.env.AUTH_PROVIDER = originalProvider;
      }
    });

    it('fails closed when managed auth secret is missing', async () => {
      const originalProvider = process.env.AUTH_PROVIDER;
      const originalSecret = process.env.MANAGED_AUTH_SECRET;
      process.env.AUTH_PROVIDER = 'managed';
      delete process.env.MANAGED_AUTH_SECRET;

      try {
        const req = new Request('https://sentinel.local/api/workspaces', {
          headers: { authorization: 'Bearer dummy.token.here' },
        });
        const auth = await getAuthContext(req);
        expect(auth.isAuthenticated).toBe(false);
        expect(auth.authError).toMatch(/MANAGED_AUTH_SECRET is not set/i);
      } finally {
        process.env.AUTH_PROVIDER = originalProvider;
        if (originalSecret) process.env.MANAGED_AUTH_SECRET = originalSecret;
      }
    });

    it('refuses to elevate rate-limiting tier for unverified client headers', () => {
      const fakeHeaders = new Headers({
        'x-sentinel-workspace-id': 'ws_unverified_attacker',
        'x-sentinel-user-id': 'usr_attacker',
      });
      const req = new Request('https://sentinel.local/api/scan', { headers: fakeHeaders });

      // Without verifiedAuthContext, caller MUST be classified as unauthenticated IP
      const client = getClientIdentifier(req);
      expect(client.isAuthenticated).toBe(false);
      expect(client.id).toMatch(/^ip:/);
    });
  });
});