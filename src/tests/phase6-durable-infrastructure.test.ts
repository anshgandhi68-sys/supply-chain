import crypto from 'node:crypto';
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
  getStorageStatus,
} from '@/lib/auth/workspace-service';
import {
  checkRateLimitAsync,
  acquireConcurrencySlotAsync,
  releaseConcurrencySlotAsync,
  getRateLimiterStatus,
  resetRateLimiterForTests,
  ANONYMOUS_POLICY,
  AUTHENTICATED_POLICY,
} from '@/lib/rate-limiter';
import { GET as getHealth } from '@/app/api/health/route';

describe('Phase 6 — Durable SaaS Infrastructure, Database & Managed Clerk Auth', () => {
  beforeEach(async () => {
    resetRateLimiterForTests();
    const repo = new InMemoryRepository();
    setDatabaseRepositoryForTesting(repo);
  });

  describe('1. Database Repository & Tenant Isolation', () => {
    it('accurately reports non-durable in-memory status when DATABASE_URL is unset', () => {
      const repo = new InMemoryRepository();
      const status = repo.getStatus();
      expect(status.isDurable).toBe(false);
      expect(status.backend).toBe('in-memory-preview');
      expect(status.connectionState).toBe('unconfigured');
    });

    it('reports durable postgresql status when initialized with PostgreSQL repository', () => {
      const repo = new PostgreSqlRepository('postgresql://user:pass@ep-cool.us-east-2.aws.neon.tech/sentinel');
      const status = repo.getStatus();
      expect(status.isDurable).toBe(true);
      expect(status.backend).toBe('postgresql');
      expect(status.connectionState).toBe('connected');
    });

    it('enforces strict tenant isolation and pagination in scan queries', async () => {
      const repo = getDatabaseRepository();
      await repo.createWorkspace({
        id: 'ws_tenant_1',
        name: 'Tenant 1',
        slug: 'tenant-1',
        tier: 'pilot',
        createdAt: new Date().toISOString(),
        maxScansPerMonth: 100,
      });

      // Insert 5 scans for Tenant 1
      for (let i = 1; i <= 5; i++) {
        await repo.saveScan({
          id: `scan_t1_${i}`,
          workspaceId: 'ws_tenant_1',
          repository: `org/repo-${i}`,
          scannedAt: new Date(Date.now() + i * 1000).toISOString(),
          scanVerdict: 'complete_clean',
          stats: {
            totalFindings: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            dependenciesScanned: 10,
            workflowsScanned: 1,
          },
          retentionDays: 30,
          retentionExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
          isDemo: false,
        });
      }

      // Query with pagination
      const page1 = await repo.listScans('ws_tenant_1', { limit: 2, offset: 0 });
      expect(page1.scans.length).toBe(2);
      expect(page1.total).toBe(5);

      const page2 = await repo.listScans('ws_tenant_1', { limit: 2, offset: 2 });
      expect(page2.scans.length).toBe(2);
      expect(page2.scans[0].id).not.toBe(page1.scans[0].id);

      // Verify that another tenant cannot see Tenant 1's scans
      const crossTenant = await repo.listScans('ws_unrelated');
      expect(crossTenant.scans.length).toBe(0);
      expect(crossTenant.total).toBe(0);
    });

    it('actively purges expired scan records from storage', async () => {
      const repo = getDatabaseRepository();
      const wsId = 'ws_purge_test';
      await repo.createWorkspace({
        id: wsId,
        name: 'Purge Workspace',
        slug: 'purge-ws',
        tier: 'pilot',
        createdAt: new Date().toISOString(),
        maxScansPerMonth: 50,
      });

      // Save an expired scan
      const expiredDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      await repo.saveScan({
        id: 'scan_expired_1',
        workspaceId: wsId,
        repository: 'org/stale-repo',
        scannedAt: new Date(Date.now() - 86400000 * 31).toISOString(),
        scanVerdict: 'complete_clean',
        stats: {
          totalFindings: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          dependenciesScanned: 5,
          workflowsScanned: 0,
        },
        retentionDays: 30,
        retentionExpiresAt: expiredDate,
        isDemo: false,
      });

      // Running listScans should automatically trigger retention purging
      const res = await repo.listScans(wsId);
      expect(res.scans.length).toBe(0);
      expect(res.total).toBe(0);
    });
  });

  describe('2. Managed Clerk Authentication & RS256 Verification', () => {
    // Generate RSA key pair for testing Clerk RS256 signatures
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    function createRsaJwt(payload: Record<string, unknown>): string {
      const headerStr = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(`${headerStr}.${payloadStr}`);
      const sig = signer.sign(privateKey, 'base64url');
      return `${headerStr}.${payloadStr}.${sig}`;
    }

    it('cryptographically verifies Clerk RS256 session token and maps organization role', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createRsaJwt({
        sub: 'user_2Nabcdef123456',
        email: 'cto@startup.com',
        org_id: 'org_2XYZ987654',
        org_role: 'org:admin',
        org_slug: 'cyber-acme',
        exp: nowSec + 3600,
        iss: 'https://clerk.cyber-acme.com',
        azp: 'http://localhost:3000',
      });

      const res = verifyClerkToken(token, publicKey, {
        issuer: 'https://clerk.cyber-acme.com',
        audience: 'http://localhost:3000',
      });

      expect(res.valid).toBe(true);
      expect(res.claims?.sub).toBe('user_2Nabcdef123456');
      expect(res.claims?.workspace_id).toBe('org_2XYZ987654');
      expect(res.claims?.role).toBe('admin');
    });

    it('rejects tampered Clerk token signature with RS256', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = createRsaJwt({
        sub: 'user_attacker',
        exp: nowSec + 3600,
      });

      // Generate a different key
      const { publicKey: otherPubKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });

      const res = verifyClerkToken(token, otherPubKey);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/invalid.*signature/i);
    });

    it('authenticates request via Clerk and auto-provisions workspace in repository', async () => {
      const originalProvider = process.env.AUTH_PROVIDER;
      const originalKey = process.env.CLERK_JWT_KEY;

      process.env.AUTH_PROVIDER = 'clerk';
      process.env.CLERK_JWT_KEY = publicKey;

      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const token = createRsaJwt({
          sub: 'user_clerk_tester',
          email: 'test@clerk.dev',
          org_id: 'org_auto_provision',
          org_role: 'org:member',
          exp: nowSec + 3600,
        });

        const req = new Request('https://sentinel.local/api/workspaces', {
          headers: { authorization: `Bearer ${token}` },
        });

        const auth = await getAuthContext(req);
        expect(auth.isAuthenticated).toBe(true);
        expect(auth.user?.id).toBe('user_clerk_tester');
        expect(auth.workspace?.id).toBe('org_auto_provision');
        expect(auth.member?.role).toBe('analyst');
      } finally {
        process.env.AUTH_PROVIDER = originalProvider;
        process.env.CLERK_JWT_KEY = originalKey;
      }
    });
  });

  describe('3. Distributed Rate Limiting & Fail-Secure Upstash Redis Fallback', () => {
    it('reports process-local status when Upstash Redis is unconfigured', () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const status = getRateLimiterStatus();
      expect(status.isDistributed).toBe(false);
      expect(status.backend).toBe('process-local');
      expect(status.isConfigured).toBe(false);
    });

    it('reports distributed status when Upstash Redis credentials are set', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://cool-redis-123.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'mock_upstash_bearer_token';

      try {
        const status = getRateLimiterStatus();
        expect(status.isDistributed).toBe(true);
        expect(status.backend).toBe('upstash-redis');
        expect(status.isConfigured).toBe(true);
      } finally {
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
      }
    });

    it('enforces sliding window rate limits asynchronously with fail-secure local fallback', async () => {
      const clientId = 'ip:192.0.2.100';

      // First 10 requests allowed
      for (let i = 0; i < 10; i++) {
        const res = await checkRateLimitAsync(clientId, ANONYMOUS_POLICY);
        expect(res.allowed).toBe(true);
      }

      // 11th request rejected
      const blockedRes = await checkRateLimitAsync(clientId, ANONYMOUS_POLICY);
      expect(blockedRes.allowed).toBe(false);
      expect(blockedRes.remaining).toBe(0);
      expect(blockedRes.resetSeconds).toBeGreaterThan(0);
    });

    it('coordinates concurrency slot acquisition and release asynchronously', async () => {
      const clientId = 'ip:198.51.100.200';
      const maxConcurrent = 2;

      const slot1 = await acquireConcurrencySlotAsync(clientId, maxConcurrent);
      expect(slot1.acquired).toBe(true);

      const slot2 = await acquireConcurrencySlotAsync(clientId, maxConcurrent);
      expect(slot2.acquired).toBe(true);

      // Third slot must be rejected
      const slot3 = await acquireConcurrencySlotAsync(clientId, maxConcurrent);
      expect(slot3.acquired).toBe(false);

      // Release slot
      await releaseConcurrencySlotAsync(clientId);

      // Now third slot succeeds
      const retrySlot = await acquireConcurrencySlotAsync(clientId, maxConcurrent);
      expect(retrySlot.acquired).toBe(true);

      // Cleanup
      await releaseConcurrencySlotAsync(clientId);
      await releaseConcurrencySlotAsync(clientId);
    });
  });

  describe('4. Health Endpoint Diagnostics & Cache Controls', () => {
    it('returns storage and rate limiter diagnostic blocks in /api/health with no-store headers', async () => {
      const res = await getHealth();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.service).toBe('Supply Chain Sentinel');
      expect(json.status).toBe('healthy');
      expect(json.storage).toBeDefined();
      expect(json.storage.backend).toBe('in-memory-preview');
      expect(json.rateLimiting).toBeDefined();
      expect(json.rateLimiting.backend).toBe('process-local');

      // Verify Cache-Control header
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });
  });
});
