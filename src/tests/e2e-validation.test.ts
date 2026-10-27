/**
 * Phase 3: Comprehensive End-to-End Validation Test Suite
 * Validates manifest ingestion, graph lineage, unreachable node handling,
 * remediation diff integrity, GHA adversarial bypasses, SSRF hardening,
 * export security (HTML, CSV formula injection, CycloneDX refs),
 * pre-buffering body limits, and dataset non-contamination.
 */

import { describe, it, expect } from 'vitest';
import { buildDependencyGraph } from '../lib/graph';
import { inspectWorkflow } from '../lib/actions/engine';
import { isApprovedGitHubHost, parseAndValidateGitHubUrl } from '../lib/github';
import { generatePackageJsonDiff, assessSemverRisk } from '../lib/remediation';
import { escapeHtml, generateHtmlReport } from '../lib/reports';
import { generateCycloneDxBom } from '../lib/analyzers/sbom';
import { DependencyPackage, Finding, RepositoryMetadata, ScanResult } from '../lib/types';
import { POST as scanPost } from '../app/api/scan/route';
import { POST as exportPost } from '../app/api/export/route';
import { POST as verifyPost } from '../app/api/verify/route';
import { NextRequest } from 'next/server';

describe('Phase 3: End-to-End Validation Suite', () => {
  // =========================================================================
  // Requirement 3 & 4: Ingestion & Dependency Graph Accuracy
  // =========================================================================
  describe('Dependency Graph Lineage, Hoisting, Cycles, and Unreachable Nodes', () => {
    it('accurately resolves direct, transitive, and hoisted packages across lockfile versions', () => {
      // Direct express, transitive accepts, hoisted qs
      const packages: DependencyPackage[] = [
        {
          name: 'express',
          version: '4.18.2',
          ecosystem: 'npm',
          isDirect: true,
          manifestPath: 'package.json',
          dependencies: { accepts: '1.3.8', qs: '6.11.0' },
        },
        {
          name: 'accepts',
          version: '1.3.8',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          parentPackage: 'express',
          dependencies: { mime: '1.6.0' },
        },
        {
          name: 'qs',
          version: '6.11.0',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          parentPackage: 'express',
        },
        {
          name: 'mime',
          version: '1.6.0',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          parentPackage: 'accepts',
        },
      ];

      const graph = buildDependencyGraph({
        packages,
        findings: [],
        rootName: 'test-app',
        rootVersion: '1.0.0',
        manifestPath: 'package.json',
      });

      expect(graph.nodes.length).toBe(5); // root + 4 packages
      const expressNode = graph.nodes.find((n) => n.name === 'express')!;
      const acceptsNode = graph.nodes.find((n) => n.name === 'accepts')!;
      const mimeNode = graph.nodes.find((n) => n.name === 'mime')!;

      expect(expressNode.isDirect).toBe(true);
      expect(expressNode.depth).toBe(1);
      expect(acceptsNode.isDirect).toBe(false);
      expect(acceptsNode.depth).toBe(2);
      expect(mimeNode.depth).toBe(3);
    });

    it('handles multi-parent packages correctly with shared lineage', () => {
      // debug is required by both express and send
      const packages: DependencyPackage[] = [
        {
          name: 'express',
          version: '4.18.2',
          ecosystem: 'npm',
          isDirect: true,
          manifestPath: 'package.json',
          dependencies: { debug: '2.6.9' },
        },
        {
          name: 'send',
          version: '0.18.0',
          ecosystem: 'npm',
          isDirect: true,
          manifestPath: 'package.json',
          dependencies: { debug: '2.6.9' },
        },
        {
          name: 'debug',
          version: '2.6.9',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          dependencies: { ms: '2.0.0' },
        },
        {
          name: 'ms',
          version: '2.0.0',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          parentPackage: 'debug',
        },
      ];

      const graph = buildDependencyGraph({
        packages,
        findings: [],
        rootName: 'multi-parent-app',
        rootVersion: '1.0.0',
        manifestPath: 'package.json',
      });

      const debugNode = graph.nodes.find((n) => n.name === 'debug')!;
      expect(debugNode.parents.length).toBeGreaterThanOrEqual(2);
      expect(debugNode.parents).toContain('express');
      expect(debugNode.parents).toContain('send');
    });

    it('tolerates cyclic dependency graphs without infinite recursion', () => {
      // Cycle: A -> B -> C -> A
      const packages: DependencyPackage[] = [
        {
          name: 'package-a',
          version: '1.0.0',
          ecosystem: 'npm',
          isDirect: true,
          manifestPath: 'package.json',
          dependencies: { 'package-b': '1.0.0' },
        },
        {
          name: 'package-b',
          version: '1.0.0',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          dependencies: { 'package-c': '1.0.0' },
        },
        {
          name: 'package-c',
          version: '1.0.0',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          dependencies: { 'package-a': '1.0.0' },
        },
      ];

      const graph = buildDependencyGraph({
        packages,
        findings: [],
        rootName: 'cyclic-app',
        rootVersion: '1.0.0',
        manifestPath: 'package.json',
      });

      expect(graph.nodes.length).toBe(4);
      expect(graph.maxDepth).toBeLessThanOrEqual(4);
    });

    // Requirement 5
    it('NEVER fabricates attack paths for unreachable packages', () => {
      const packages: DependencyPackage[] = [
        {
          name: 'root-dep',
          version: '1.0.0',
          ecosystem: 'npm',
          isDirect: true,
          manifestPath: 'package.json',
        },
        {
          name: 'unreachable-orphan',
          version: '0.0.1',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          // No parent, not referenced by root or root-dep
        },
      ];

      const finding: Finding = {
        id: 'GHSA-orphan-vuln',
        title: 'Critical RCE in orphan',
        category: 'dependency_vulnerability',
        severity: 'critical',
        severityRationale: 'Orphan critical test',
        repository: 'owner/repo',
        commitSha: 'abc',
        filePath: 'package-lock.json',
        observedValue: 'unreachable-orphan@0.0.1',
        evidenceSnippet: 'unreachable-orphan@0.0.1',
        detectionSource: 'OSV Advisory GHSA-orphan-vuln',
        recommendedAction: 'Upgrade',
        confidence: 'confirmed',
        limitations: 'Static',
        verificationStatus: 'unverified',
      };

      const graph = buildDependencyGraph({
        packages,
        findings: [finding],
        rootName: 'orphan-test',
        rootVersion: '1.0.0',
        manifestPath: 'package.json',
      });

      // Attack paths should NOT contain unreachable-orphan because it is disconnected from root
      const orphanPath = graph.attackPaths.find((ap) => ap.targetPackage === 'unreachable-orphan');
      expect(orphanPath).toBeUndefined();

      const orphanNode = graph.nodes.find((n) => n.name === 'unreachable-orphan')!;
      expect(orphanNode.inAttackPath).toBe(false);
    });
  });

  // =========================================================================
  // Requirement 7: Remediation Diff Generation
  // =========================================================================
  describe('Remediation Diff Generation Preserving Manifest Integrity', () => {
    it('preserves unrelated scripts, dependencies, author, engines, and formatting', () => {
      const originalPackageJson = `{
  "name": "enterprise-backend",
  "version": "2.4.1",
  "private": true,
  "description": "Production critical API gateway",
  "author": "SecOps <sec@example.com>",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "axios": "^1.2.0",
    "lodash": "^4.17.15",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}`;

      const { unifiedDiff, afterSnippet } = generatePackageJsonDiff(
        'lodash',
        '4.17.15',
        '4.17.21',
        originalPackageJson
      );

      // Verify diff updates only lodash line
      expect(unifiedDiff).toContain('- "lodash": "^4.17.15"');
      expect(unifiedDiff).toContain('+ "lodash": "^4.17.21"');

      // Verify unrelated content is preserved in afterSnippet context
      expect(afterSnippet).toContain('"axios": "^1.2.0"');
      expect(afterSnippet).toContain('"zod": "^3.22.0"');
    });

    it('generates non-destructive overrides proposal for transitive dependencies', () => {
      const manifestWithoutDirect = `{
  "name": "my-project",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.2"
  }
}`;

      const { unifiedDiff, afterSnippet } = generatePackageJsonDiff(
        'qs',
        '6.5.2',
        '6.5.3',
        manifestWithoutDirect
      );

      expect(unifiedDiff).toContain('overrides recommendation');
      expect(afterSnippet).toContain('"overrides"');
      expect(afterSnippet).toContain('"qs": "6.5.3"');
    });

    it('accurately evaluates SemVer risk categories', () => {
      expect(assessSemverRisk('4.17.15', '4.17.21').risk).toBe('low');
      expect(assessSemverRisk('1.2.0', '1.4.0').risk).toBe('moderate');
      expect(assessSemverRisk('1.2.0', '2.0.0').risk).toBe('high');
      expect(assessSemverRisk('0.4.0', '0.5.0').risk).toBe('high'); // zero-major bump
    });
  });

  // =========================================================================
  // Requirement 8: Adversarial GitHub Actions Rule Checks (GHA-001 to GHA-006)
  // =========================================================================
  describe('Adversarial GitHub Actions Security Testing', () => {
    it('flags untrusted event context injections (GHA-004) across alternate shells', () => {
      const yaml = `
name: Untrusted Context Test
on:
  issues:
    types: [opened]
jobs:
  run-pwsh:
    runs-on: ubuntu-latest
    steps:
      - name: PowerShell Step
        shell: pwsh
        run: |
          Write-Host "Title: \${{ github.event.issue.title }}"
  run-bash:
    runs-on: ubuntu-latest
    steps:
      - name: Bash Step
        run: |
          echo "PR Head: \${{ github.event.pull_request.head.ref }}"
`;
      const result = inspectWorkflow(yaml, '.github/workflows/injection.yml', 'owner/repo');
      const gha004 = result.findings.filter((f) => f.id.includes('GHA-004'));
      expect(gha004.length).toBeGreaterThanOrEqual(2);
    });

    it('flags dangerous pull_request_target with untrusted head checkout (GHA-003)', () => {
      const yaml = `
name: Dangerous Target
on: pull_request_target
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
`;
      const result = inspectWorkflow(yaml, '.github/workflows/pr-target.yml', 'owner/repo');
      expect(result.findings.some((f) => f.id.includes('GHA-003'))).toBe(true);
    });

    it('flags unpinned action tags and branches (GHA-001)', () => {
      const yaml = `
name: Pinning Test
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
      - uses: actions/setup-node@v3
`;
      const result = inspectWorkflow(yaml, '.github/workflows/pinning.yml', 'owner/repo');
      const gha001 = result.findings.filter((f) => f.id.includes('GHA-001'));
      expect(gha001.length).toBe(2);
    });

    it('flags missing top-level permissions (GHA-006) and write-all (GHA-002)', () => {
      const missingPerms = `
name: No Perms
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo ok
`;
      const resMissing = inspectWorkflow(missingPerms, '.github/workflows/missing.yml', 'owner/repo');
      expect(resMissing.findings.some((f) => f.id.includes('GHA-006'))).toBe(true);

      const writeAll = `
name: Write All
on: push
permissions: write-all
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo ok
`;
      const resWrite = inspectWorkflow(writeAll, '.github/workflows/write.yml', 'owner/repo');
      expect(resWrite.findings.some((f) => f.id.includes('GHA-002'))).toBe(true);
    });

    it('flags curl/wget piped to interpreters (GHA-005)', () => {
      const yaml = `
name: Pipe Test
on: push
jobs:
  install:
    runs-on: ubuntu-latest
    steps:
      - run: curl -sSL https://install.example.com | sudo bash
      - run: wget -qO- https://test.org/script | python3
`;
      const result = inspectWorkflow(yaml, '.github/workflows/pipe.yml', 'owner/repo');
      const gha005 = result.findings.filter((f) => f.id.includes('GHA-005'));
      expect(gha005.length).toBe(2);
    });

    it('gracefully handles malformed YAML without throwing uncaught exceptions', () => {
      const malformedYaml = `
name: Malformed
jobs:
  broken:
    runs-on: ubuntu-latest
    steps:
      - run: unclosed: { [ (
`;
      const result = inspectWorkflow(malformedYaml, '.github/workflows/broken.yml', 'owner/repo');
      expect(result.isValidYaml).toBe(false);
      expect(result.findings.some((f) => f.category === 'malformed_config')).toBe(true);
    });
  });

  // =========================================================================
  // Requirement 9: SSRF Defenses & IP Representation Hardening
  // =========================================================================
  describe('SSRF Protection & URL Validation', () => {
    it('blocks private IPv4, loopback, IPv6, and cloud metadata IPs', () => {
      expect(isApprovedGitHubHost('127.0.0.1')).toBe(false);
      expect(isApprovedGitHubHost('10.0.0.1')).toBe(false);
      expect(isApprovedGitHubHost('192.168.1.1')).toBe(false);
      expect(isApprovedGitHubHost('169.254.169.254')).toBe(false);
      expect(isApprovedGitHubHost('::1')).toBe(false);
      expect(isApprovedGitHubHost('[::1]')).toBe(false);
      expect(isApprovedGitHubHost('fe80::1')).toBe(false);
    });

    it('blocks alternate numeric IP encodings (decimal, hex, octal dwords)', () => {
      expect(isApprovedGitHubHost('2130706433')).toBe(false); // 127.0.0.1 decimal
      expect(isApprovedGitHubHost('0x7f000001')).toBe(false); // 127.0.0.1 hex
      expect(isApprovedGitHubHost('017700000001')).toBe(false); // 127.0.0.1 octal
      expect(isApprovedGitHubHost('0x7f.0.0.1')).toBe(false);
    });

    it('blocks non-GitHub domains and internal hosts', () => {
      expect(isApprovedGitHubHost('localhost')).toBe(false);
      expect(isApprovedGitHubHost('internal.ec2.aws')).toBe(false);
      expect(isApprovedGitHubHost('gitlab.com')).toBe(false);
      expect(isApprovedGitHubHost('attacker-controlled-site.com')).toBe(false);
    });

    it('only permits approved official GitHub domains', () => {
      expect(isApprovedGitHubHost('github.com')).toBe(true);
      expect(isApprovedGitHubHost('www.github.com')).toBe(true);
      expect(isApprovedGitHubHost('api.github.com')).toBe(true);
      expect(isApprovedGitHubHost('raw.githubusercontent.com')).toBe(true);
      expect(isApprovedGitHubHost('codeload.github.com')).toBe(true);
    });

    it('rejects disallowed URL schemes, credentials, and path traversal attempts', () => {
      expect(parseAndValidateGitHubUrl('file:///etc/passwd').isValid).toBe(false);
      expect(parseAndValidateGitHubUrl('gopher://127.0.0.1:6379').isValid).toBe(false);
      expect(parseAndValidateGitHubUrl('ftp://github.com/owner/repo').isValid).toBe(false);
      expect(parseAndValidateGitHubUrl('https://admin:secret@github.com/owner/repo').isValid).toBe(false);
      expect(parseAndValidateGitHubUrl('https://github.com/../..').isValid).toBe(false);
    });
  });

  // =========================================================================
  // Requirement 10: Hostile Input Escaping, CSV Injection, and CycloneDX v1.5
  // =========================================================================
  describe('Report Exporting, Hostile Input Escaping & CycloneDX Integrity', () => {
    it('escapes hostile HTML inputs preventing XSS', () => {
      const hostile = '<script>alert("XSS")</script>&<img src=x onerror=alert(1)>';
      const escaped = escapeHtml(hostile);
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
      expect(escaped).toContain('&amp;');
      expect(escaped).toContain('&quot;');
    });

    it('neutralizes CSV formula injection (DDE) by prefixing hostile characters', async () => {
      const mockResult: ScanResult = {
        scanVerdict: 'complete_clean',
        repository: {
          owner: 'test',
          repo: 'test-repo',
          fullName: 'test/test-repo',
          defaultBranch: 'main',
          stars: 1,
        },
        timeline: [],
        findings: [
          {
            id: 'GHSA-test-1',
            title: '=cmd|\' /C calc\'!A0', // Excel command execution payload
            category: 'dependency_vulnerability',
            severity: 'critical',
            severityRationale: 'Hostile CSV payload test',
            repository: 'test/test-repo',
            filePath: '+A1_calc',
            observedValue: '@SUM(1,2)',
            evidenceSnippet: '+A1_calc',
            detectionSource: 'OSV',
            recommendedAction: '-DDE_EXEC',
            confidence: 'confirmed',
            limitations: 'None',
            verificationStatus: 'verified_fixed',
          },
        ],
        manifestsFound: ['package.json'],
        workflowsFound: [],
        stats: {
          totalFindings: 1,
          criticalCount: 1,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          infoCount: 0,
          confirmedCount: 1,
          potentialRiskCount: 0,
          versionUnverifiedCount: 0,
          unknownCount: 0,
          filesScanned: 1,
          dependenciesScanned: 1,
          workflowsScanned: 0,
        },
        scannedAt: new Date().toISOString(),
        scannerVersion: '2.0.0',
        warnings: [],
        errors: [],
        coverage: {
          commitSha: 'mock',
          filesDiscovered: 1,
          filesAnalyzed: 1,
          filesSkipped: 0,
          manifestsDetected: ['package.json'],
          lockfilesDetected: [],
          dependenciesDiscovered: 1,
          exactVersionsResolved: 1,
          unresolvedRanges: 0,
          unsupportedManifests: [],
          parserErrors: [],
          upstreamFailures: [],
          scanTruncated: false,
          vulnerabilitySources: ['OSV'],
          workflowFilesAnalyzed: 0,
          analyzersCompleted: [],
          durationMs: 50,
        },
      };

      const req = new NextRequest('http://localhost:3000/api/export?format=csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: mockResult }),
      });

      const response = await exportPost(req);
      expect(response.status).toBe(200);
      const csvText = await response.text();

      // Ensure formula characters are neutralized with leading quote
      expect(csvText).toContain("\"'=cmd|' /C calc'!A0\"");
      expect(csvText).toContain("\"'+A1_calc\"");
    });

    it('guarantees CycloneDX v1.5 schema and references contain zero dangling refs', () => {
      const repoMeta: RepositoryMetadata = {
        owner: 'security',
        repo: 'app',
        fullName: 'security/app',
        defaultBranch: 'main',
        stars: 10,
      };

      const packages: DependencyPackage[] = [
        {
          name: 'express',
          version: '4.18.2',
          ecosystem: 'npm',
          isDirect: true,
          manifestPath: 'package.json',
          dependencies: { accepts: '1.3.8', 'non-existent-pkg': '9.9.9' }, // dangling dep
        },
        {
          name: 'accepts',
          version: '1.3.8',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
        },
      ];

      const findings: Finding[] = [
        {
          id: 'GHSA-vuln-1',
          title: 'Vuln in express',
          category: 'dependency_vulnerability',
          severity: 'high',
          severityRationale: 'Testing',
          repository: 'security/app',
          filePath: 'package.json',
          observedValue: 'express@4.18.2',
          evidenceSnippet: 'express@4.18.2',
          detectionSource: 'OSV Advisory GHSA-vuln-1',
          recommendedAction: 'Upgrade',
          confidence: 'confirmed',
          limitations: 'Static',
          verificationStatus: 'unverified',
        },
      ];

      const bom = generateCycloneDxBom(repoMeta, packages, findings) as any;

      expect(bom.bomFormat).toBe('CycloneDX');
      expect(bom.specVersion).toBe('1.5');
      expect(bom.components.length).toBe(2);

      const allComponentRefs = new Set([
        bom.metadata.component['bom-ref'],
        ...bom.components.map((c: any) => c['bom-ref']),
      ]);

      // Verify every single dependency reference exists in allComponentRefs
      for (const dep of bom.dependencies) {
        expect(allComponentRefs.has(dep.ref)).toBe(true);
        for (const targetRef of dep.dependsOn) {
          expect(allComponentRefs.has(targetRef)).toBe(true);
          // specifically non-existent-pkg must NOT appear
          expect(targetRef).not.toContain('non-existent-pkg');
        }
      }
    });
  });

  // =========================================================================
  // Requirement 11: Pre-Buffer Body Size Limit Verification (HTTP 413)
  // =========================================================================
  describe('Pre-Buffer Request Body Limit Verification', () => {
    it('returns HTTP 413 Payload Too Large when Content-Length exceeds 5MB on /api/scan', async () => {
      const oversizedLength = (6 * 1024 * 1024).toString(); // 6MB
      const req = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': oversizedLength,
        },
        body: JSON.stringify({ repoUrl: 'owner/repo' }),
      });

      const response = await scanPost(req);
      expect(response.status).toBe(413);
      const data = await response.json();
      expect(data.error).toContain('Payload too large');
    });

    it('returns HTTP 413 Payload Too Large on /api/export when Content-Length exceeds 5MB', async () => {
      const oversizedLength = (10 * 1024 * 1024).toString(); // 10MB
      const req = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': oversizedLength,
        },
        body: JSON.stringify({ result: {} }),
      });

      const response = await exportPost(req);
      expect(response.status).toBe(413);
    });

    it('returns HTTP 413 Payload Too Large on /api/verify when Content-Length exceeds 5MB', async () => {
      const oversizedLength = (8 * 1024 * 1024).toString(); // 8MB
      const req = new NextRequest('http://localhost:3000/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': oversizedLength,
        },
        body: JSON.stringify({ type: 'workflow' }),
      });

      const response = await verifyPost(req);
      expect(response.status).toBe(413);
    });
  });

  // =========================================================================
  // Requirement 13: Live Scan Data vs Demo Fixture Non-Contamination
  // =========================================================================
  describe('Live Scan Data Isolation from Demo Fixtures', () => {
    it('ensures live manifest scans contain ONLY scanned dependencies and no synthetic mock packages', async () => {
      const cleanPackageJson = JSON.stringify({
        name: 'clean-standalone-service',
        version: '1.0.0',
        dependencies: {
          'safe-clean-dep': '1.0.0',
        },
      });

      const cleanPackageLock = JSON.stringify({
        name: 'clean-standalone-service',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: { 'safe-clean-dep': '1.0.0' },
          },
          'node_modules/safe-clean-dep': {
            version: '1.0.0',
          },
        },
      });

      const req = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageJsonContent: cleanPackageJson,
          packageLockContent: cleanPackageLock,
          projectName: 'clean-standalone-service',
        }),
      });

      const response = await scanPost(req);
      expect(response.status).toBe(200);
      const data = await response.json();

      // Must NOT contain demo mock packages like event-stream or minimist
      const names = data.dependencyGraph?.nodes?.map((p: any) => p.name) || [];
      expect(names).not.toContain('event-stream');
      expect(names).not.toContain('flatmap-stream');
      expect(names).not.toContain('minimist');
      expect(names).toContain('safe-clean-dep');
    });
  });
});
