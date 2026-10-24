import { describe, it, expect } from 'vitest';
import { scanSecrets } from '../lib/analyzers/secrets';
import { scanDockerfile } from '../lib/analyzers/docker';
import { generateCycloneDxSbom } from '../lib/analyzers/sbom';
import { inspectWorkflow } from '../lib/actions/engine';
import { verifyDependencyRemediation } from '../lib/verifier';
import { maskSecret } from '../lib/redaction';
import { PackageScanInfo } from '../lib/types';

describe('Security Analyzers & Verification Engines', () => {
  describe('Secret Leak Detection (scanSecrets & maskSecret)', () => {
    it('masks secrets securely without exposing sensitive material', () => {
      const ghMasked = maskSecret('ghp_abcdefghijklmnopqrstuvwxyz123456');
      expect(ghMasked.startsWith('ghp_')).toBe(true);
      expect(ghMasked.endsWith('3456')).toBe(true);
      expect(ghMasked).toContain('•');
      expect(ghMasked).not.toContain('abcdefgh');

      const awsMasked = maskSecret('AKIA1234567890ABCDEF');
      expect(awsMasked.startsWith('AKIA')).toBe(true);
      expect(awsMasked.endsWith('CDEF')).toBe(true);
      expect(awsMasked).toContain('•');
      expect(awsMasked).not.toContain('1234567890');

      const shortMasked = maskSecret('short');
      expect(shortMasked).toBe('••••••••');
    });

    it('detects GitHub Personal Access Tokens and AWS access keys', () => {
      const code = `
const GH_TOKEN = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
`;
      const findings = scanSecrets(code, 'config/keys.js');
      expect(findings.length).toBe(2);

      const ghFinding = findings.find((f) => f.detectionSource.includes('SEC-001'));
      expect(ghFinding).toBeDefined();
      expect(ghFinding?.severity).toBe('critical');
      // Ensure the secret is masked in evidence and title/observedValue
      expect(ghFinding?.observedValue).not.toContain('1234567890abcdef');
      expect(ghFinding?.observedValue).toContain('•');

      const awsFinding = findings.find((f) => f.detectionSource.includes('SEC-002'));
      expect(awsFinding).toBeDefined();
      expect(awsFinding?.severity).toBe('critical');
      expect(awsFinding?.observedValue).toContain('•');
    });

    it('detects private RSA/SSH keys', () => {
      const pem = `
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+
-----END RSA PRIVATE KEY-----
`;
      const findings = scanSecrets(pem, 'id_rsa');
      expect(findings.length).toBe(1);
      expect(findings[0].detectionSource.includes('SEC-003')).toBe(true);
      expect(findings[0].severity).toBe('critical');
    });
  });

  describe('Dockerfile Security Analyzer (scanDockerfile)', () => {
    it('flags root user execution, unpinned base image, curl piping, and hardcoded secrets', () => {
      const dockerfile = `
FROM node:latest
WORKDIR /app
COPY . .
ENV GITHUB_TOKEN=ghp_secrettoken1234567890abcdef123456
RUN curl -sSL https://install.example.com | bash
RUN npm install
CMD ["node", "server.js"]
`;
      const findings = scanDockerfile(dockerfile, 'Dockerfile');
      const ruleIds = findings.map((f) => f.detectionSource);

      expect(ruleIds.some((id) => id.includes('DOCKER-001'))).toBe(true); // Root user
      expect(ruleIds.some((id) => id.includes('DOCKER-002'))).toBe(true); // latest tag
      expect(ruleIds.some((id) => id.includes('DOCKER-003'))).toBe(true); // curl pipe to bash
      expect(ruleIds.some((id) => id.includes('DOCKER-004'))).toBe(true); // secret in ENV
    });

    it('approves a hardened Dockerfile with non-root user and pinned digest/version', () => {
      const cleanDockerfile = `
FROM node:20.10.0-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
USER node
CMD ["node", "server.js"]
`;
      const findings = scanDockerfile(cleanDockerfile, 'Dockerfile');
      expect(findings.length).toBe(0);
    });
  });

  describe('CycloneDX v1.5 SBOM Generator', () => {
    it('generates valid CycloneDX v1.5 JSON with canonical Package URLs (purl)', () => {
      const pkgs: PackageScanInfo[] = [
        {
          name: 'lodash',
          version: '4.17.21',
          ecosystem: 'npm',
          isDirect: true,
          isExactVersion: true,
          resolvedFromLockfile: true,
          specifierType: 'exact',
          manifestPath: 'package-lock.json',
        },
        {
          name: 'requests',
          version: '2.31.0',
          ecosystem: 'PyPI',
          isDirect: true,
          isExactVersion: true,
          resolvedFromLockfile: true,
          specifierType: 'exact',
          manifestPath: 'Pipfile.lock',
        },
        {
          name: 'tokio',
          version: '1.36.0',
          ecosystem: 'crates.io',
          isDirect: true,
          isExactVersion: true,
          resolvedFromLockfile: true,
          specifierType: 'exact',
          manifestPath: 'Cargo.lock',
        },
      ];

      const sbom = generateCycloneDxSbom({
        repositoryUrl: 'https://github.com/org/repo',
        resolvedSha: '0123456789abcdef0123456789abcdef01234567',
        packages: pkgs,
      }) as any;

      expect(sbom.bomFormat).toBe('CycloneDX');
      expect(sbom.specVersion).toBe('1.5');
      expect(sbom.metadata.component.name).toBe('org/repo');
      expect(sbom.components.length).toBe(3);

      const lodashComp = sbom.components.find((c: any) => c.name === 'lodash');
      expect(lodashComp).toBeDefined();
      expect(lodashComp?.version).toBe('4.17.21');
      expect(lodashComp?.purl).toBe('pkg:npm/lodash@4.17.21');

      const pypiComp = sbom.components.find((c: any) => c.name === 'requests');
      expect(pypiComp?.purl).toBe('pkg:pypi/requests@2.31.0');

      const rustComp = sbom.components.find((c: any) => c.name === 'tokio');
      expect(rustComp?.purl).toBe('pkg:cargo/tokio@1.36.0');
    });
  });

  describe('GitHub Actions Rules GHA-007 and GHA-008', () => {
    it('flags GHA-007 when secrets are printed or logged in shell commands', () => {
      const yaml = `
name: Leaky CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "Deploying with key: \${{ secrets.PROD_KEY }}"
`;
      const result = inspectWorkflow(yaml, '.github/workflows/leak.yml');
      const gha007 = result.findings.find((f) => f.detectionSource.includes('GHA-007'));
      expect(gha007).toBeDefined();
      expect(gha007?.severity).toBe('high');
    });

    it('flags GHA-008 when self-hosted runner executes on public pull_request', () => {
      const yaml = `
name: Public PR Run
on: [pull_request]
jobs:
  build:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - run: npm test
`;
      const result = inspectWorkflow(yaml, '.github/workflows/self-hosted.yml');
      const gha008 = result.findings.find((f) => f.detectionSource.includes('GHA-008'));
      expect(gha008).toBeDefined();
      expect(gha008?.severity).toBe('high');
    });
  });

  describe('Fix Verification Studio: verifyDependencyRemediation', () => {
    it('verifies remediation when proposed version is outside affected advisory ranges', async () => {
      const result = await verifyDependencyRemediation({
        packageName: 'lodash',
        currentVersion: '4.17.20',
        proposedVersion: '4.17.21',
        ecosystem: 'npm',
        advisoryId: 'GHSA-35jh-r3h4-6jhm',
        affectedRanges: [
          {
            type: 'ECOSYSTEM',
            events: [
              { introduced: '0' },
              { fixed: '4.17.21' },
            ],
          },
        ],
      });

      expect(result.status).toBe('verified_remediated');
      expect(result.explanation).toContain('is outside all known affected advisory ranges');
    });

    it('rejects proposed version if it still falls within the vulnerable range', async () => {
      const result = await verifyDependencyRemediation({
        packageName: 'lodash',
        currentVersion: '4.17.19',
        proposedVersion: '4.17.20',
        ecosystem: 'npm',
        advisoryId: 'GHSA-35jh-r3h4-6jhm',
        affectedRanges: [
          {
            type: 'ECOSYSTEM',
            events: [
              { introduced: '0' },
              { fixed: '4.17.21' },
            ],
          },
        ],
      });

      expect(result.status).toBe('still_vulnerable');
      expect(result.explanation).toContain('remains vulnerable');
    });
  });
});
