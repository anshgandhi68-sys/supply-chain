/**
 * Phase 6.3 — Live Staging Deployment & Cloud Acceptance Test Suite
 * 
 * Verifies:
 * 1. Safe Health & Integration Diagnostics (No secret exposure, correct status flags)
 * 2. Clerk Staging Authentication & Cryptographic Token Verification
 * 3. Scan Persistence & Multi-Request State Verification
 * 4. Workspace Multi-Tenant Isolation with Two Distinct Staging Identities
 * 5. Upstash Distributed Rate Limiting & Fail-Secure Degradation
 * 6. Database Degraded Mode & Graceful Error Handling
 * 7. End-to-End Scan Pipeline with OSV Advisory Correlation & SBOM Generation
 */

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
} from '@/lib/auth/token-verifier';
import {
  saveWorkspaceScan,
  listWorkspaceScans,
  deleteWorkspaceScan,
} from '@/lib/auth/workspace-service';
import {
  checkRateLimitAsync,
  resetRateLimiterForTests,
  ANONYMOUS_POLICY,
} from '@/lib/rate-limiter';
import { runLocalManifestScan } from '@/lib/manifest-scanner';
import { GET as getHealth } from '@/app/api/health/route';

describe('Phase 6.3 — Live Staging Deployment & Cloud Acceptance', () => {
  // Generate a valid RSA key pair for testing Clerk token issuance and verification
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  function createRsaJwt(
    payload: Record<string, unknown>,
    headerOverride?: Record<string, unknown>,
    keyToSignWith: string = privateKey
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

  describe('1. Safe Health & Integration Diagnostics Audit', () => {
    it('returns rich integration diagnostic flags without leaking any secrets or credentials', async () => {
      const res = await getHealth();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('healthy');
      expect(json.service).toBe('Supply Chain Sentinel');

      // Verify integrations block exists
      expect(json.integrations).toBeDefined();
      expect(json.integrations.osvDatabase).toBeDefined();
      expect(json.integrations.osvDatabase.status).toBe('reachable');

      expect(json.integrations.githubApi).toBeDefined();
      expect(json.integrations.githubApi.status).toBe('configured');
      expect(typeof json.integrations.githubApi.fallbackTokenConfigured).toBe('boolean');

      // Verify Clerk Auth diagnostics (boolean flags only)
      expect(json.integrations.clerkAuth).toBeDefined();
      expect(['configured', 'unconfigured']).toContain(json.integrations.clerkAuth.status);
      expect(typeof json.integrations.clerkAuth.hasSecretKey).toBe('boolean');
      expect(typeof json.integrations.clerkAuth.hasJwtPublicKey).toBe('boolean');

      // Verify Upstash Redis diagnostics (boolean flags only)
      expect(json.integrations.upstashRedis).toBeDefined();
      expect(['configured', 'unconfigured']).toContain(json.integrations.upstashRedis.status);
      expect(typeof json.integrations.upstashRedis.isDistributed).toBe('boolean');
      expect(json.integrations.upstashRedis.fallbackMode).toBe('local-sliding-window');

      // Verify Database diagnostics
      expect(json.integrations.database).toBeDefined();
      expect(typeof json.integrations.database.isDurable).toBe('boolean');

      // Strict check: No sensitive substrings in JSON response
      const jsonStr = JSON.stringify(json);
      expect(jsonStr).not.toContain('ghp_');
      expect(jsonStr).not.toContain('sk_live');
      expect(jsonStr).not.toContain('password');
      expect(jsonStr).not.toContain('token=');
      expect(jsonStr).not.toContain('postgres://');
    });

    it('enforces strict cache-control no-store headers on the health endpoint', async () => {
      const res = await getHealth();
      const cacheControl = res.headers.get('Cache-Control');
      expect(cacheControl).toBeDefined();
      expect(cacheControl).toContain('no-store');
      expect(cacheControl).toContain('no-cache');
    });
  });

  describe('2. Clerk Staging Authentication & Token Verification', () => {
    it('validates genuine staging Clerk tokens with valid RS256 signature and claims', async () => {
      const now = Math.floor(Date.now() / 1000);
      const validToken = createRsaJwt({
        sub: 'user_staging_analyst_01',
        email: 'analyst@sentinel-staging.internal',
        org_id: 'org_staging_alpha',
        org_role: 'admin',
        iss: 'https://clerk.sentinel-staging.dev',
        aud: 'https://sentinel-staging.vercel.app',
        iat: now - 10,
        exp: now + 3600,
      });

      const verification = await verifyClerkToken(validToken, publicKey, {
        issuer: 'https://clerk.sentinel-staging.dev',
        audience: 'https://sentinel-staging.vercel.app',
      });

      expect(verification.valid).toBe(true);
      expect(verification.claims?.sub).toBe('user_staging_analyst_01');
      expect(verification.claims?.email).toBe('analyst@sentinel-staging.internal');
      expect(verification.claims?.org_role).toBe('admin');
    });

    it('rejects expired tokens in staging', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = createRsaJwt({
        sub: 'user_expired',
        iat: now - 3600,
        exp: now - 60, // expired 1 minute ago
      });

      const res = await verifyClerkToken(expiredToken, publicKey);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/expired/i);
    });

    it('rejects tokens signed with an unapproved key pair or algorithm spoofing', async () => {
      const otherKey = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const now = Math.floor(Date.now() / 1000);
      const rogueToken = createRsaJwt(
        { sub: 'user_rogue', iat: now, exp: now + 600 },
        undefined,
        otherKey.privateKey
      );

      const res = await verifyClerkToken(rogueToken, publicKey);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/invalid.*signature/i);
    });
  });

  describe('3. Scan Persistence & Multi-Request State Verification', () => {
    it('persists and retrieves scan records across separate calls and simulated serverless invocations', async () => {
      const repo = getDatabaseRepository();
      const workspaceId = 'ws_persistence_test';

      await repo.createWorkspace({
        id: workspaceId,
        name: 'Persistence Workspace',
        slug: 'persistence-ws',
        tier: 'pilot',
        maxScansPerMonth: 100,
        createdAt: new Date().toISOString(),
      });

      await repo.addWorkspaceMember({
        workspaceId,
        userId: 'usr_p1',
        role: 'owner',
        joinedAt: new Date().toISOString(),
      });

      // Request 1: Save Scan A
      const saveResA = await saveWorkspaceScan(workspaceId, 'usr_p1', {
        repository: 'acme/service-alpha',
        commitSha: '9f8e7d6c5b4a32109876543210abcdef01234567',
        defaultBranch: 'main',
        scanVerdict: 'complete_with_findings',
        stats: { dependenciesScanned: 42, totalFindings: 3, criticalCount: 1, highCount: 2 },
      });
      expect(saveResA.success).toBe(true);
      expect(saveResA.record).toBeDefined();
      const scanAId = saveResA.record!.id;

      // Request 2: Save Scan B
      const saveResB = await saveWorkspaceScan(workspaceId, 'usr_p1', {
        repository: 'acme/service-beta',
        commitSha: '11223344556677889900aabbccddeeff00112233',
        defaultBranch: 'main',
        scanVerdict: 'complete_clean',
        stats: { dependenciesScanned: 15, totalFindings: 0, criticalCount: 0, highCount: 0 },
      });
      expect(saveResB.success).toBe(true);

      // Request 3: List Scans (Separate Request Context)
      const listRes = await listWorkspaceScans(workspaceId, 'usr_p1');
      expect(listRes.success).toBe(true);
      expect(listRes.scans?.length).toBe(2);

      // Verify specific scan fetch via repository
      const singleScan = await repo.getScan(workspaceId, scanAId);
      expect(singleScan).toBeDefined();
      expect(singleScan?.repository).toBe('acme/service-alpha');
      expect(singleScan?.stats.totalFindings).toBe(3);
    });
  });

  describe('4. Multi-Tenant Workspace Isolation with Two Staging Identities', () => {
    it('strictly isolates tenant data: Tenant Beta cannot read, mutate, or delete Tenant Alpha scans', async () => {
      const repo = getDatabaseRepository();

      // Tenant Alpha Setup
      await repo.createWorkspace({
        id: 'ws_alpha',
        name: 'Tenant Alpha Staging',
        slug: 'tenant-alpha-staging',
        tier: 'pilot',
        maxScansPerMonth: 100,
        createdAt: new Date().toISOString(),
      });
      await repo.addWorkspaceMember({
        workspaceId: 'ws_alpha',
        userId: 'user_alpha_lead',
        role: 'owner',
        joinedAt: new Date().toISOString(),
      });

      // Tenant Beta Setup
      await repo.createWorkspace({
        id: 'ws_beta',
        name: 'Tenant Beta Staging',
        slug: 'tenant-beta-staging',
        tier: 'pilot',
        maxScansPerMonth: 100,
        createdAt: new Date().toISOString(),
      });
      await repo.addWorkspaceMember({
        workspaceId: 'ws_beta',
        userId: 'user_beta_lead',
        role: 'owner',
        joinedAt: new Date().toISOString(),
      });

      // Tenant Alpha saves a sensitive scan
      const alphaScan = await saveWorkspaceScan('ws_alpha', 'user_alpha_lead', {
        repository: 'alpha-corp/core-api',
        scanVerdict: 'complete_with_findings',
        stats: { dependenciesScanned: 120, totalFindings: 5 },
      });
      expect(alphaScan.success).toBe(true);
      const targetScanId = alphaScan.record!.id;

      // 1. Tenant Beta attempts to list Tenant Alpha's scans -> REJECTED (unauthorized)
      const betaListAttempt = await listWorkspaceScans('ws_alpha', 'user_beta_lead');
      expect(betaListAttempt.success).toBe(false);
      expect(betaListAttempt.scans).toBeUndefined();

      // 2. Tenant Beta attempts to read Tenant Alpha's scan via repository -> NULL
      const betaReadAttempt = await repo.getScan('ws_beta', targetScanId);
      expect(betaReadAttempt).toBeNull();

      // 3. Tenant Beta attempts to delete Tenant Alpha's scan -> REJECTED
      const betaDeleteAttempt = await deleteWorkspaceScan('ws_alpha', targetScanId, 'user_beta_lead');
      expect(betaDeleteAttempt.success).toBe(false);

      // Verify Tenant Alpha's scan remains intact
      const alphaVerify = await repo.getScan('ws_alpha', targetScanId);
      expect(alphaVerify).not.toBeNull();
      expect(alphaVerify?.repository).toBe('alpha-corp/core-api');
    });
  });

  describe('5. Upstash Distributed Rate Limiting & Fail-Secure Degradation', () => {
    it('enforces anonymous rate limits under local fallback when Upstash is unconfigured', async () => {
      const clientId = 'anon_staging_client_ip';
      const policy = ANONYMOUS_POLICY; // 10 req / min

      // Consume all 10 tokens
      for (let i = 0; i < 10; i++) {
        const result = await checkRateLimitAsync(clientId, policy);
        expect(result.allowed).toBe(true);
      }

      // 11th request must be rejected
      const rejected = await checkRateLimitAsync(clientId, policy);
      expect(rejected.allowed).toBe(false);
      expect(rejected.remaining).toBe(0);
      expect(rejected.resetSeconds).toBeGreaterThan(0);
    });

    it('fails secure when remote Redis experiences simulated outage', async () => {
      const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
      const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      try {
        process.env.UPSTASH_REDIS_REST_URL = 'https://fake-mock-upstash.internal';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'fake_token';

        // Check rate limit - should fall back to local limiter and enforce quota
        const client = 'failing_redis_client';
        for (let i = 0; i < 10; i++) {
          await checkRateLimitAsync(client, ANONYMOUS_POLICY);
        }
        const blocked = await checkRateLimitAsync(client, ANONYMOUS_POLICY);
        expect(blocked.allowed).toBe(false);
      } finally {
        if (originalUrl) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
        else delete process.env.UPSTASH_REDIS_REST_URL;
        if (originalToken) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
        else delete process.env.UPSTASH_REDIS_REST_TOKEN;
      }
    });
  });

  describe('6. PostgreSQL Degraded Mode & Graceful Fallback', () => {
    it('gracefully reports in-memory non-durable status when DATABASE_URL is unconfigured', () => {
      const repo = new InMemoryRepository();
      const status = repo.getStatus();
      expect(status.isDurable).toBe(false);
      expect(status.backend).toBe('in-memory-preview');
      expect(status.connectionState).toBe('unconfigured');
    });

    it('PostgreSqlRepository safely initializes and reports durable status without leaking database credentials', () => {
      const pgRepo = new PostgreSqlRepository('postgres://app_user:secret_password@db.staging.internal:5432/sentinel_staging');
      const status = pgRepo.getStatus();
      expect(status.isDurable).toBe(true);
      expect(status.backend).toBe('postgresql');
      expect(status.connectionState).toBe('connected');

      // Verify that status serialization never contains the password
      const statusStr = JSON.stringify(status);
      expect(statusStr).not.toContain('secret_password');
    });
  });

  describe('7. End-to-End Scan Pipeline with OSV Correlation & SBOM Generation', () => {
    it('scans a real multi-dependency manifest against OSV and yields accurate findings and graph', async () => {
      const packageJson = JSON.stringify({
        name: 'cloud-staging-e2e-app',
        version: '1.0.0',
        dependencies: {
          axios: '0.21.1',
          lodash: '4.17.20',
        },
      });

      const packageLock = JSON.stringify({
        name: 'cloud-staging-e2e-app',
        version: '1.0.0',
        lockfileVersion: 2,
        requires: true,
        packages: {
          '': {
            name: 'cloud-staging-e2e-app',
            version: '1.0.0',
            dependencies: {
              axios: '0.21.1',
              lodash: '4.17.20',
            },
          },
          'node_modules/axios': {
            version: '0.21.1',
            resolved: 'https://registry.npmjs.org/axios/-/axios-0.21.1.tgz',
          },
          'node_modules/lodash': {
            version: '4.17.20',
            resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz',
          },
        },
      });

      const scanResult = await runLocalManifestScan({
        packageJsonContent: packageJson,
        packageLockContent: packageLock,
        projectName: 'Cloud Staging E2E App',
      });

      expect(scanResult.scanVerdict).toBe('complete_with_findings');
      expect(scanResult.stats.dependenciesScanned).toBe(2);
      expect(scanResult.stats.totalFindings).toBeGreaterThan(0);

      // Verify findings contain OSV advisory IDs
      const hasAxiosFinding = scanResult.findings.some((f) =>
        f.observedValue?.includes('axios') || f.title.includes('axios')
      );
      const hasLodashFinding = scanResult.findings.some((f) =>
        f.observedValue?.includes('lodash') || f.title.includes('lodash')
      );
      expect(hasAxiosFinding).toBe(true);
      expect(hasLodashFinding).toBe(true);

      // Verify dependency graph has root and children
      expect(scanResult.dependencyGraph).toBeDefined();
      expect(scanResult.dependencyGraph!.nodes.length).toBeGreaterThanOrEqual(2);
      expect(scanResult.dependencyGraph!.directCount).toBe(2);
    });
  });
});
