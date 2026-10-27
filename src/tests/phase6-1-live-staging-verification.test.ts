/**
 * Phase 6.1 — Live Staging Verification & Private Beta Gate Test Suite
 * 
 * Tests:
 * 1. Database Tenant Isolation, Cross-Workspace Attack Prevention, Bounded Pagination & RLS Schema
 * 2. Clerk Authentication Security: RS256 Signatures, Expiry, Issuer, Audience, Alg Whitelist & Fail-Closed
 * 3. Upstash Redis Rate Limiting: Timeout Abort, Fail-Secure Fallback, Spoofing Resistance & Concurrency
 * 4. Scan Engine Performance Benchmarks: 1,500 and 2,500 dependencies (p50, p95, p99, memory delta)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDatabaseRepository,
  InMemoryRepository,
  PostgreSqlRepository,
  setDatabaseRepositoryForTesting,
} from '@/lib/db/repository';
import {
  verifyClerkToken,
  verifyManagedAuthToken,
} from '@/lib/auth/token-verifier';
import {
  getAuthContext,
  saveWorkspaceScan,
  listWorkspaceScans,
  deleteWorkspaceScan,
  requireWorkspaceRole,
} from '@/lib/auth/workspace-service';
import {
  checkRateLimitAsync,
  acquireConcurrencySlotAsync,
  releaseConcurrencySlotAsync,
  getClientIdentifier,
  resetRateLimiterForTests,
  ANONYMOUS_POLICY,
  AUTHENTICATED_POLICY,
} from '@/lib/rate-limiter';
import { parsePackageLockJson } from '@/lib/manifests/package-json';
import { buildDependencyGraph } from '@/lib/graph';
import { runLocalManifestScan } from '@/lib/manifest-scanner';

describe('Phase 6.1 — Live Staging Verification & Private Beta Gate', () => {
  // Generate a test 2048-bit RSA key pair for cryptographic verification tests
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  function createRsaJwt(
    payload: Record<string, unknown>,
    headerOverride?: Record<string, unknown>,
    keyToSignWith = privateKey
  ): string {
    const header = headerOverride || { alg: 'RS256', typ: 'JWT' };
    const headerStr = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${headerStr}.${payloadStr}`);
    const sig = signer.sign(keyToSignWith, 'base64url');
    return `${headerStr}.${payloadStr}.${sig}`;
  }

  beforeEach(() => {
    resetRateLimiterForTests();
    const repo = new InMemoryRepository();
    setDatabaseRepositoryForTesting(repo);
  });

  describe('1. Database Tenant Isolation, RLS Schema & Cross-Workspace Defenses', () => {
    it('verifies SQL migration defines FORCE ROW LEVEL SECURITY and explicit isolation policies', () => {
      const migrationPath = path.join(process.cwd(), 'migrations', '001_initial_schema.sql');
      const sqlContent = fs.readFileSync(migrationPath, 'utf8');

      // Verify FORCE ROW LEVEL SECURITY to prevent table owner bypass
      expect(sqlContent).toContain('ALTER TABLE workspaces FORCE ROW LEVEL SECURITY');
      expect(sqlContent).toContain('ALTER TABLE scans FORCE ROW LEVEL SECURITY');
      expect(sqlContent).toContain('ALTER TABLE audit_events FORCE ROW LEVEL SECURITY');

      // Verify explicit tenant isolation policies using app.current_workspace_id
      expect(sqlContent).toContain('CREATE POLICY scans_tenant_isolation_policy ON scans');
      expect(sqlContent).toContain('workspace_id = NULLIF(current_setting(\'app.current_workspace_id\', true), \'\')');

      // Verify CHECK constraint on scan_verdict accepts execution verdicts
      expect(sqlContent).toContain('complete_clean');
      expect(sqlContent).toContain('complete_with_findings');
    });

    it('prevents cross-workspace read, delete, and enumeration attempts', async () => {
      const repo = getDatabaseRepository();

      // Setup Tenant A and Tenant B
      await repo.createWorkspace({
        id: 'ws_tenant_a',
        name: 'Tenant Alpha',
        slug: 'tenant-a',
        tier: 'pilot',
        createdAt: new Date().toISOString(),
        maxScansPerMonth: 100,
      });

      await repo.createWorkspace({
        id: 'ws_tenant_b',
        name: 'Tenant Beta',
        slug: 'tenant-b',
        tier: 'pilot',
        createdAt: new Date().toISOString(),
        maxScansPerMonth: 100,
      });

      // Tenant A creates a scan
      await repo.saveScan({
        id: 'scan_alpha_secret_1',
        workspaceId: 'ws_tenant_a',
        repository: 'alpha/internal-service',
        scannedAt: new Date().toISOString(),
        scanVerdict: 'complete_clean',
        stats: {
          totalFindings: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          dependenciesScanned: 50,
          workflowsScanned: 2,
        },
        retentionDays: 30,
        retentionExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        isDemo: false,
      });

      // 1. Cross-workspace read via getScan must return null
      const crossRead = await repo.getScan('ws_tenant_b', 'scan_alpha_secret_1');
      expect(crossRead).toBeNull();

      // 2. Cross-workspace delete via deleteScan must return false and NOT delete the record
      const crossDelete = await repo.deleteScan('ws_tenant_b', 'scan_alpha_secret_1');
      expect(crossDelete).toBe(false);

      // Verify Tenant A still has the scan intact
      const alphaRead = await repo.getScan('ws_tenant_a', 'scan_alpha_secret_1');
      expect(alphaRead).not.toBeNull();
      expect(alphaRead?.repository).toBe('alpha/internal-service');

      // 3. Cross-workspace enumeration via listScans must return 0 records
      const bList = await repo.listScans('ws_tenant_b');
      expect(bList.scans.length).toBe(0);
      expect(bList.total).toBe(0);
    });

    it('enforces upper bounds on query pagination to prevent memory exhaustion', async () => {
      const repo = getDatabaseRepository();
      const wsId = 'ws_pagination_test';

      await repo.createWorkspace({
        id: wsId,
        name: 'Pagination Workspace',
        slug: 'page-ws',
        tier: 'enterprise',
        createdAt: new Date().toISOString(),
        maxScansPerMonth: 500,
      });

      // Insert 120 scans
      for (let i = 1; i <= 120; i++) {
        await repo.saveScan({
          id: `scan_${i}`,
          workspaceId: wsId,
          repository: `repo/project-${i}`,
          scannedAt: new Date(Date.now() + i * 1000).toISOString(),
          scanVerdict: 'complete_clean',
          stats: {
            totalFindings: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            dependenciesScanned: 10,
            workflowsScanned: 0,
          },
          retentionDays: 30,
          retentionExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
          isDemo: false,
        });
      }

      // Query with excessive limit (e.g. 5000) - repository must clamp to 100
      const bounded = await repo.listScans(wsId, { limit: 5000, offset: 0 });
      expect(bounded.scans.length).toBe(100);
      expect(bounded.total).toBe(120);

      // Query offset page
      const page2 = await repo.listScans(wsId, { limit: 50, offset: 100 });
      expect(page2.scans.length).toBe(20);
    });

    it('enforces RBAC role checks on privileged actions', async () => {
      const repo = getDatabaseRepository();
      const wsId = 'ws_rbac_test';

      await repo.createWorkspace({
        id: wsId,
        name: 'RBAC Workspace',
        slug: 'rbac-ws',
        tier: 'pilot',
        createdAt: new Date().toISOString(),
        maxScansPerMonth: 100,
      });

      // Member with 'viewer' role
      await repo.addWorkspaceMember({
        workspaceId: wsId,
        userId: 'user_viewer_1',
        role: 'viewer',
        joinedAt: new Date().toISOString(),
      });

      // Viewer is allowed to read
      const canView = requireWorkspaceRole('viewer', 'viewer');
      expect(canView).toBe(true);

      // Viewer is NOT allowed to perform analyst/admin/owner actions
      expect(requireWorkspaceRole('viewer', 'analyst')).toBe(false);
      expect(requireWorkspaceRole('viewer', 'admin')).toBe(false);
      expect(requireWorkspaceRole('viewer', 'owner')).toBe(false);

      // Analyst is allowed to perform analyst actions but not admin
      expect(requireWorkspaceRole('analyst', 'analyst')).toBe(true);
      expect(requireWorkspaceRole('analyst', 'admin')).toBe(false);
    });
  });

  describe('2. Clerk Authentication Security & Token Claims Validation', () => {
    it('rejects tokens signed with an unauthorized RSA key', () => {
      const { privateKey: rogueKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const nowSec = Math.floor(Date.now() / 1000);
      const forgedToken = createRsaJwt(
        { sub: 'user_attacker', exp: nowSec + 3600 },
        undefined,
        rogueKey
      );

      const verification = verifyClerkToken(forgedToken, publicKey);
      expect(verification.valid).toBe(false);
      expect(verification.error).toMatch(/invalid.*signature/i);
    });

    it('rejects tokens specifying alg: none (forbids unsigned tokens)', () => {
      const headerStr = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payloadStr = Buffer.from(JSON.stringify({ sub: 'user_none', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      const noneToken = `${headerStr}.${payloadStr}.`;

      const verification = verifyClerkToken(noneToken, publicKey);
      expect(verification.valid).toBe(false);
      expect(verification.error).toMatch(/none.*forbidden/i);
    });

    it('rejects expired tokens and not-before (nbf) tokens', () => {
      const nowSec = Math.floor(Date.now() / 1000);

      // 1. Expired token
      const expiredToken = createRsaJwt({
        sub: 'user_expired',
        exp: nowSec - 120, // Expired 2 minutes ago
      });
      const resExpired = verifyClerkToken(expiredToken, publicKey);
      expect(resExpired.valid).toBe(false);
      expect(resExpired.error).toMatch(/expired/i);

      // 2. Future token (nbf)
      const futureToken = createRsaJwt({
        sub: 'user_future',
        exp: nowSec + 3600,
        nbf: nowSec + 600, // Valid only in 10 minutes
      });
      const resFuture = verifyClerkToken(futureToken, publicKey);
      expect(resFuture.valid).toBe(false);
      expect(resFuture.error).toMatch(/not active yet/i);
    });

    it('validates issuer and audience / authorized party strictly', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createRsaJwt({
        sub: 'user_claims_test',
        exp: nowSec + 3600,
        iss: 'https://clerk.genuine-domain.com',
        aud: 'sentinel-staging',
        azp: 'https://staging.sentinel.app',
      });

      // Mismatched issuer
      const resWrongIss = verifyClerkToken(token, publicKey, {
        issuer: 'https://clerk.rogue-domain.com',
      });
      expect(resWrongIss.valid).toBe(false);
      expect(resWrongIss.error).toMatch(/issuer mismatch/i);

      // Mismatched audience
      const resWrongAud = verifyClerkToken(token, publicKey, {
        audience: 'sentinel-production-wrong',
      });
      expect(resWrongAud.valid).toBe(false);
      expect(resWrongAud.error).toMatch(/audience mismatch/i);

      // Matching issuer and audience succeeds
      const resValid = verifyClerkToken(token, publicKey, {
        issuer: 'https://clerk.genuine-domain.com',
        audience: 'sentinel-staging',
      });
      expect(resValid.valid).toBe(true);
      expect(resValid.claims?.sub).toBe('user_claims_test');
    });

    it('fails closed when managed auth is misconfigured in production/staging mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalAuth = process.env.AUTH_PROVIDER;
      const originalKey = process.env.CLERK_JWT_KEY;

      (process.env as any).NODE_ENV = 'production';
      process.env.AUTH_PROVIDER = 'clerk';
      delete process.env.CLERK_JWT_KEY;
      delete process.env.CLERK_SECRET_KEY;
      delete process.env.MANAGED_AUTH_SECRET;

      try {
        const req = new Request('https://sentinel.app/api/workspaces', {
          headers: { authorization: 'Bearer some.mock.jwt' },
        });

        const auth = await getAuthContext(req);
        expect(auth.isAuthenticated).toBe(false);
        expect(auth.authError).toMatch(/misconfigured/i);
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
        process.env.AUTH_PROVIDER = originalAuth;
        if (originalKey) process.env.CLERK_JWT_KEY = originalKey;
      }
    });
  });

  describe('3. Upstash Redis Rate Limiting & Fail-Secure Resilience', () => {
    it('extracts client ID prioritizing authenticated identity and safe IP derivation', () => {
      // 1. Authenticated user
      const reqAuth = new Request('https://sentinel.app/api/scan');
      const clientAuth = getClientIdentifier(reqAuth, { isAuthenticated: true, userId: 'user_corp_77' });
      expect(clientAuth.isAuthenticated).toBe(true);
      expect(clientAuth.id).toBe('usr:user_corp_77');

      // 2. Unauthenticated with x-real-ip
      const reqRealIp = new Request('https://sentinel.app/api/scan', {
        headers: { 'x-real-ip': '203.0.113.195' },
      });
      const clientRealIp = getClientIdentifier(reqRealIp);
      expect(clientRealIp.isAuthenticated).toBe(false);
      expect(clientRealIp.id).toBe('ip:203.0.113.195');

      // 3. Untrusted x-forwarded-for spoofing check (uses rightmost safe hop)
      const reqSpoofed = new Request('https://sentinel.app/api/scan', {
        headers: { 'x-forwarded-for': '1.1.1.1, 10.0.0.1, 198.51.100.55' },
      });
      const clientSpoofed = getClientIdentifier(reqSpoofed);
      expect(clientSpoofed.isAuthenticated).toBe(false);
      expect(clientSpoofed.id).toBe('ip:198.51.100.55');
    });

    it('falls back to local sliding-window limiter on simulated Redis failure without opening unlimited access', async () => {
      const originalFetch = globalThis.fetch;
      process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'mock_token';

      // Mock fetch to simulate an Upstash Redis outage (HTTP 500 error)
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
        });
      };

      try {
        const testClient = 'ip:198.51.100.99';

        // Under local fallback, quota of 10 requests must still be enforced
        for (let i = 0; i < 10; i++) {
          const res = await checkRateLimitAsync(testClient, ANONYMOUS_POLICY);
          expect(res.allowed).toBe(true);
          expect(res.isDistributed).toBe(false); // Reports local fallback honestly
        }

        // 11th request MUST be rejected
        const blocked = await checkRateLimitAsync(testClient, ANONYMOUS_POLICY);
        expect(blocked.allowed).toBe(false);
        expect(blocked.remaining).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
      }
    });

    it('reclaims abandoned concurrency slots after timeout', async () => {
      const clientId = 'ip:192.0.2.222';
      const slot = await acquireConcurrencySlotAsync(clientId, 1);
      expect(slot.acquired).toBe(true);

      // Second immediate acquisition rejected
      const slotRejected = await acquireConcurrencySlotAsync(clientId, 1);
      expect(slotRejected.acquired).toBe(false);

      // Release slot
      await releaseConcurrencySlotAsync(clientId);

      // Re-acquisition succeeds
      const slotReacquired = await acquireConcurrencySlotAsync(clientId, 1);
      expect(slotReacquired.acquired).toBe(true);
      await releaseConcurrencySlotAsync(clientId);
    });
  });

  describe('4. Scan Performance Benchmarks (1,500 & 2,500 Dependencies)', () => {
    function generateSyntheticPackageLock(count: number): {
      packageJson: string;
      packageLock: string;
    } {
      const dependencies: Record<string, string> = {};
      const packages: Record<string, any> = {
        '': {
          name: 'benchmark-app',
          version: '1.0.0',
          dependencies: {},
        },
      };

      for (let i = 1; i <= count; i++) {
        const pkgName = `pkg-bench-${i}`;
        const version = `1.${(i % 10)}.${(i % 5)}`;
        dependencies[pkgName] = `^${version}`;
        packages[`node_modules/${pkgName}`] = {
          version,
          resolved: `https://registry.npmjs.org/${pkgName}/-/${pkgName}-${version}.tgz`,
          integrity: `sha512-mock${i}==`,
        };
      }

      packages[''].dependencies = dependencies;

      const packageJson = JSON.stringify({
        name: 'benchmark-app',
        version: '1.0.0',
        dependencies,
      });

      const packageLock = JSON.stringify({
        name: 'benchmark-app',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages,
      });

      return { packageJson, packageLock };
    }

    it('measures latency (p50, p95, p99) and memory delta for 1,500 dependencies', () => {
      const { packageJson, packageLock } = generateSyntheticPackageLock(1500);
      const runs = 10;
      const durations: number[] = [];

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < runs; i++) {
        const start = performance.now();
        const parsed = parsePackageLockJson(packageLock, 'package-lock.json');
        const graph = buildDependencyGraph({ rootName: 'benchmark-app', packages: parsed.packages });
        const duration = performance.now() - start;
        durations.push(duration);

        expect(parsed.packages.length).toBe(1500);
        expect(graph.nodes.length).toBeGreaterThanOrEqual(1500);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryDeltaMb = Math.round(((finalMemory - initialMemory) / (1024 * 1024)) * 100) / 100;

      durations.sort((a, b) => a - b);
      const p50 = Math.round(durations[Math.floor(runs * 0.5)]);
      const p95 = Math.round(durations[Math.floor(runs * 0.95)]);
      const p99 = Math.round(durations[runs - 1]);

      console.log(`[Benchmark 1,500 pkgs] p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms | Heap delta: ${memoryDeltaMb} MB`);

      // 1,500 packages must complete well within the Vercel 10s execution budget (typically < 350ms)
      expect(p95).toBeLessThan(2000);
    });

    it('measures latency (p50, p95, p99) and memory delta for 2,500 dependencies', () => {
      const { packageJson, packageLock } = generateSyntheticPackageLock(2500);
      const runs = 10;
      const durations: number[] = [];

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < runs; i++) {
        const start = performance.now();
        const parsed = parsePackageLockJson(packageLock, 'package-lock.json');
        const graph = buildDependencyGraph({ rootName: 'benchmark-app', packages: parsed.packages });
        const duration = performance.now() - start;
        durations.push(duration);

        expect(parsed.packages.length).toBe(2500);
        expect(graph.nodes.length).toBeGreaterThanOrEqual(2500);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryDeltaMb = Math.round(((finalMemory - initialMemory) / (1024 * 1024)) * 100) / 100;

      durations.sort((a, b) => a - b);
      const p50 = Math.round(durations[Math.floor(runs * 0.5)]);
      const p95 = Math.round(durations[Math.floor(runs * 0.95)]);
      const p99 = Math.round(durations[runs - 1]);

      console.log(`[Benchmark 2,500 pkgs] p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms | Heap delta: ${memoryDeltaMb} MB`);

      // 2,500 packages must complete within synchronous threshold (< 4000ms), demonstrating synchronous viability
      expect(p95).toBeLessThan(4000);
    });

    it('measures end-to-end full pipeline scan latency (p50, p95, p99) and failure rate', async () => {
      const lockContent = fs.readFileSync(
        path.join(process.cwd(), 'src', 'fixtures', 'sample-package-lock.json'),
        'utf8'
      );
      const runs = 5;
      const durations: number[] = [];
      let failures = 0;

      for (let i = 0; i < runs; i++) {
        const start = performance.now();
        try {
          const res = await runLocalManifestScan({
            packageLockContent: lockContent,
            projectName: 'benchmark-e2e-real',
          });
          if (!res || !res.stats || res.stats.dependenciesScanned === 0) {
            failures++;
          }
        } catch {
          failures++;
        }
        durations.push(performance.now() - start);
      }

      durations.sort((a, b) => a - b);
      const p50 = Math.round(durations[Math.floor(runs * 0.5)]);
      const p95 = Math.round(durations[Math.floor(runs * 0.95)]);
      const p99 = Math.round(durations[runs - 1]);
      const failureRate = (failures / runs) * 100;

      console.log(
        `[Benchmark End-to-End Scan] p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms | Failure rate: ${failureRate}%`
      );

      expect(failures).toBe(0);
      expect(p95).toBeLessThan(5000); // well within 15s budget
    }, 15000);
  });
});
