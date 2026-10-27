import { describe, it, expect } from 'vitest';
import { validateJsonInput } from '../lib/validation';
import { parsePackageJson, parsePackageLockJson, reconcileWithLockfile } from '../lib/manifests/package-json';
import { buildDependencyGraph } from '../lib/graph';
import { enrichFindingWithEvidence } from '../lib/investigation';
import { assessSemverRisk, generatePackageJsonDiff } from '../lib/remediation';
import { parseAndValidateGitHubUrl, safeGitHubFetch, isApprovedGitHubHost } from '../lib/github';
import { inspectWorkflow } from '../lib/actions/engine';
import { generateMarkdownReport, generateHtmlReport, isDemoScan, escapeHtml } from '../lib/reports';
import { generateCycloneDxBom } from '../lib/analyzers/sbom';
import { DependencyPackage, Finding, RepositoryMetadata, ScanResult } from '../lib/types';

describe('Adversarial Security Engine & Edge Cases Audit', () => {
  // 1. Malformed and oversized JSON
  describe('1. Malformed and Oversized JSON Handling', () => {
    it('gracefully rejects syntactically malformed JSON without throwing unhandled exceptions', () => {
      const malformedJson = '{"name": "test", "dependencies": { "foo": "1.0.0", }'; // trailing comma
      const validation = validateJsonInput(malformedJson, 'package.json');
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Malformed JSON in package.json');

      const parsed = parsePackageJson(malformedJson);
      expect(parsed.parseErrors.length).toBeGreaterThan(0);
      expect(parsed.packages).toEqual([]);
    });

    it('rejects oversized JSON payloads exceeding safety limits', () => {
      // Create a string that exceeds 5MB limit
      const hugeString = 'a'.repeat(5 * 1024 * 1024 + 100);
      const validation = validateJsonInput(hugeString, 'package-lock.json');
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('exceeds safe limit');
    });

    it('handles unexpected JSON structures (primitives, arrays instead of objects)', () => {
      const arrayJson = JSON.stringify(['not', 'an', 'object']);
      const parsedLock = parsePackageLockJson(arrayJson);
      expect(parsedLock.parseErrors.length).toBeGreaterThan(0);
      expect(parsedLock.packages).toEqual([]);
    });
  });

  // 2. Lockfile version parsing (v1, v2, v3) & Hoisting Detection
  describe('2. Lockfile Versioning and Exact Hoisting Resolution', () => {
    it('correctly distinguishes direct dependencies from hoisted transitive packages in npm v2/v3', () => {
      // In npm v2/v3, data.packages[""] lists true direct dependencies.
      // node_modules/lodash is hoisted to top-level node_modules, but is NOT declared in root.
      const lockfileV2 = JSON.stringify({
        lockfileVersion: 2,
        packages: {
          '': {
            name: 'my-app',
            version: '1.0.0',
            dependencies: {
              express: '^4.18.2',
            },
          },
          'node_modules/express': {
            version: '4.18.2',
            dependencies: {
              lodash: '^4.17.20',
            },
          },
          'node_modules/lodash': {
            version: '4.17.20', // Hoisted transitive dependency!
          },
        },
      });

      const parsed = parsePackageLockJson(lockfileV2);
      const expressPkg = parsed.packages.find((p) => p.name === 'express');
      const lodashPkg = parsed.packages.find((p) => p.name === 'lodash');

      expect(expressPkg).toBeDefined();
      expect(expressPkg?.isDirect).toBe(true);

      expect(lodashPkg).toBeDefined();
      // lodash is hoisted, but root declared only express -> lodash must be isDirect = false
      expect(lodashPkg?.isDirect).toBe(false);
    });

    it('reconciles package.json declared dependencies and preserves transitive lockfile dependencies', () => {
      const declared = [
        {
          name: 'express',
          version: '^4.18.2',
          ecosystem: 'npm' as const,
          isDirect: true,
          manifestPath: 'package.json',
          rawSpecifier: '^4.18.2',
          isExactVersion: false,
          specifierType: 'range' as const,
          resolvedFromLockfile: false,
        },
      ];

      const locked: DependencyPackage[] = [
        {
          name: 'express',
          version: '4.18.2',
          ecosystem: 'npm' as const,
          isDirect: true,
          manifestPath: 'package-lock.json',
          rawSpecifier: '4.18.2',
          isExactVersion: true,
          resolvedFromLockfile: true,
          dependencies: { accepts: '1.3.8' },
        },
        {
          name: 'accepts',
          version: '1.3.8',
          ecosystem: 'npm' as const,
          isDirect: false,
          manifestPath: 'package-lock.json',
          rawSpecifier: '1.3.8',
          isExactVersion: true,
          resolvedFromLockfile: true,
        },
      ];

      const reconciled = reconcileWithLockfile(declared, locked);

      expect(reconciled.length).toBe(2);
      const exp = reconciled.find((p) => p.name === 'express');
      expect(exp?.version).toBe('4.18.2');
      expect(exp?.isDirect).toBe(true);
      expect(exp?.isExactVersion).toBe(true);

      const acc = reconciled.find((p) => p.name === 'accepts');
      expect(acc?.version).toBe('1.3.8');
      expect(acc?.isDirect).toBe(false);
      expect(acc?.isExactVersion).toBe(true);
    });
  });

  // 3. Transitive dependency chains and graph cycles
  describe('3. Transitive Chains and Cyclic Dependency Tolerance', () => {
    it('handles cyclic dependencies without infinite looping or stack overflow', () => {
      // Circular graph: A -> B -> C -> A
      const packages: DependencyPackage[] = [
        {
          name: 'pkg-a',
          version: '1.0.0',
          ecosystem: 'npm',
          isDirect: true,
          manifestPath: 'package.json',
          dependencies: { 'pkg-b': '^1.0.0' },
        },
        {
          name: 'pkg-b',
          version: '1.0.0',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          dependencies: { 'pkg-c': '^1.0.0' },
        },
        {
          name: 'pkg-c',
          version: '1.0.0',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          dependencies: { 'pkg-a': '^1.0.0' }, // cycle back to A
        },
      ];

      const graph = buildDependencyGraph({
        rootName: 'root-app',
        packages,
        findings: [
          {
            id: 'GHSA-cycle-vuln',
            title: 'Vuln in C',
            category: 'dependency_vulnerability',
            severity: 'high',
            severityRationale: 'Testing cycle',
            repository: 'test/repo',
            filePath: 'package.json',
            observedValue: 'pkg-c@1.0.0',
            evidenceSnippet: 'pkg-c',
            detectionSource: 'OSV',
            recommendedAction: 'Fix cycle',
            confidence: 'confirmed',
            limitations: '',
            verificationStatus: 'unverified',
          },
        ],
      });

      expect(graph.nodes.length).toBe(4); // root-app + 3 packages
      expect(graph.attackPaths.length).toBe(1);
      const path = graph.attackPaths[0];
      expect(path.path).toEqual(['root-app', 'pkg-a', 'pkg-b', 'pkg-c']);
    });
  });

  // 4. Vulnerable packages unreachable from application root
  describe('4. Unreachable Vulnerable Packages Grounding', () => {
    it('does NOT construct a false attack path for vulnerable packages unreachable from root', () => {
      const packages: DependencyPackage[] = [
        {
          name: 'direct-safe',
          version: '1.0.0',
          ecosystem: 'npm',
          isDirect: true,
          manifestPath: 'package.json',
          dependencies: {},
        },
        {
          name: 'disconnected-vuln',
          version: '0.1.0',
          ecosystem: 'npm',
          isDirect: false,
          manifestPath: 'package-lock.json',
          dependencies: {},
        },
      ];

      const finding: Finding = {
        id: 'GHSA-orphan-vuln',
        title: 'Orphan package vulnerability',
        category: 'dependency_vulnerability',
        severity: 'critical',
        severityRationale: 'Critical vulnerability in unlinked dependency',
        repository: 'test/repo',
        filePath: 'package-lock.json',
        observedValue: 'disconnected-vuln@0.1.0',
        evidenceSnippet: 'disconnected-vuln',
        detectionSource: 'OSV',
        recommendedAction: 'Remove',
        confidence: 'confirmed',
        limitations: '',
        verificationStatus: 'unverified',
      };

      const graph = buildDependencyGraph({
        rootName: 'root-app',
        packages,
        findings: [finding],
      });

      // Since disconnected-vuln is not reachable from root, no attack path should be generated!
      expect(graph.attackPaths.length).toBe(0);

      const enriched = enrichFindingWithEvidence(finding, graph);
      // Dependency path should be empty (no reachable path)
      expect(enriched.dependencyPath).toEqual([]);
      // Inferred risk must honestly state that it is unreachable from root
      const hasUnreachableNote = enriched.inferredRisks.some((r) =>
        r.includes('Unreachable from application root')
      );
      expect(hasUnreachableNote).toBe(true);
    });
  });

  // 5. SemVer Breaking Risk Assessment (Major vs Minor vs Patch)
  describe('5. SemVer Breaking Change Risk Grounding', () => {
    it('flags major-version upgrades as high breaking risk and prevents false "safe" labeling', () => {
      const major = assessSemverRisk('1.2.3', '2.0.0');
      expect(major.risk).toBe('high');
      expect(major.rationale).toContain('High risk of breaking API changes');

      // 0.x breaking change (0.2.1 -> 0.3.0) is breaking per SemVer spec
      const zeroBreaking = assessSemverRisk('0.2.1', '0.3.0');
      expect(zeroBreaking.risk).toBe('high');

      const patch = assessSemverRisk('1.2.3', '1.2.4');
      expect(patch.risk).toBe('low');
      expect(patch.rationale).toContain('safe to apply');
    });

    it('generates surgical diff preserving all other package.json fields', () => {
      const realManifest = [
        '{',
        '  "name": "my-enterprise-app",',
        '  "version": "3.1.0",',
        '  "scripts": {',
        '    "build": "next build"',
        '  },',
        '  "dependencies": {',
        '    "axios": "^0.21.1",',
        '    "react": "^18.2.0"',
        '  },',
        '  "devDependencies": {',
        '    "typescript": "^5.0.0"',
        '  }',
        '}',
      ].join('\n');

      const diff = generatePackageJsonDiff('axios', '0.21.1', '1.6.0', realManifest);

      expect(diff.unifiedDiff).toContain('- "axios": "^0.21.1",');
      expect(diff.unifiedDiff).toContain('+ "axios": "^1.6.0",');
      // Preserved neighboring lines in snippet
      expect(diff.beforeSnippet).toContain('"dependencies":');
      expect(diff.beforeSnippet).toContain('"react": "^18.2.0"');
    });
  });

  // 6. SSRF Protection and Disallowed URLs
  describe('6. SSRF Boundary Enforcement & Host Validation', () => {
    it('strictly blocks private IPs, loopback, and cloud metadata endpoints', () => {
      const privateTargets = [
        'http://127.0.0.1/test',
        'http://localhost:8080/repo',
        'http://169.254.169.254/latest/meta-data',
        'http://10.0.0.1/admin',
        'http://192.168.1.1/secret',
        'http://[::1]/internal',
      ];

      for (const target of privateTargets) {
        const parsed = parseAndValidateGitHubUrl(target);
        expect(parsed.isValid).toBe(false);
        expect(parsed.error).toBeDefined();
      }
    });

    it('rejects URLs with embedded credentials and custom ports', () => {
      const credUrl = 'https://admin:password123@github.com/org/repo';
      expect(parseAndValidateGitHubUrl(credUrl).isValid).toBe(false);

      const customPort = 'https://github.com:8443/org/repo';
      expect(parseAndValidateGitHubUrl(customPort).isValid).toBe(false);
    });

    it('safeGitHubFetch prevents redirects to unapproved external or private hosts', async () => {
      await expect(
        safeGitHubFetch('http://169.254.169.254/meta-data')
      ).rejects.toThrow(/SSRF Blocked/);

      await expect(
        safeGitHubFetch('https://evil-attacker.com/payload')
      ).rejects.toThrow(/SSRF Blocked/);
    });
  });

  // 7. GitHub Actions AST verification & Bypass Attempts
  describe('7. GitHub Actions AST Verification & Bypass Defense', () => {
    it('detects context injection via untrusted inputs and head_ref in run scripts', () => {
      const workflowYaml = [
        'name: CI',
        'on: [pull_request, workflow_dispatch]',
        'permissions: read-all',
        'jobs:',
        '  build:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - name: Greet',
        '        run: echo "Branch is ${{ github.head_ref }}"',
        '      - name: Handle input',
        '        run: echo "Input is ${{ github.event.inputs.command }}"',
      ].join('\n');

      const result = inspectWorkflow(workflowYaml, '.github/workflows/ci.yml');
      const injectionFindings = result.findings.filter((f) => f.category === 'injection_risk');
      expect(injectionFindings.length).toBeGreaterThanOrEqual(1);
      expect(injectionFindings.some((f) => f.observedValue.includes('github.head_ref'))).toBe(true);
    });

    it('detects pipe-to-shell variants including python, bash, and sudo', () => {
      const workflowYaml = [
        'name: Install',
        'on: push',
        'permissions: read-all',
        'jobs:',
        '  setup:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: curl -sSfL https://example.com/install.py | python3',
        '      - run: wget -qO- https://example.com/script.sh | sudo /bin/bash',
      ].join('\n');

      const result = inspectWorkflow(workflowYaml, '.github/workflows/install.yml');
      const pipeFindings = result.findings.filter((f) => f.id.includes('GHA-005'));
      expect(pipeFindings.length).toBeGreaterThanOrEqual(1);
    });

    it('flags unpinned actions with mutable release tags (GHA-001)', () => {
      const workflowYaml = [
        'name: Lint',
        'on: push',
        'permissions: read-all',
        'jobs:',
        '  lint:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4', // tag, not commit SHA
      ].join('\n');

      const result = inspectWorkflow(workflowYaml, '.github/workflows/lint.yml');
      const unpinned = result.findings.find((f) => f.id.includes('GHA-001'));
      expect(unpinned).toBeDefined();
      expect(unpinned?.observedValue).toBe('actions/checkout@v4');
    });
  });

  // 8. Controlled Demo vs. Live Scan Distinction
  describe('8. Demo Fixture vs Live Repository Classification', () => {
    it('accurately identifies demo scan vs live repository in reports', () => {
      const demoResult: ScanResult = {
        repository: {
          owner: 'sentinel-security',
          repo: 'supply-chain-demo',
          fullName: 'sentinel-security/supply-chain-demo',
          defaultBranch: 'main',
        },
        scannedAt: new Date().toISOString(),
        scannerVersion: '2.0.0',
        scanVerdict: 'complete_with_findings',
        findings: [],
        timeline: [],
        stats: {
          totalFindings: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          infoCount: 0,
          confirmedCount: 0,
          potentialRiskCount: 0,
          versionUnverifiedCount: 0,
          unknownCount: 0,
          filesScanned: 5,
          dependenciesScanned: 10,
          workflowsScanned: 1,
        },
        coverage: {} as any,
        manifestsFound: ['package.json'],
        workflowsFound: ['.github/workflows/ci.yml'],
        warnings: [],
        errors: [],
      };

      expect(isDemoScan(demoResult)).toBe(true);

      const mdReport = generateMarkdownReport(demoResult);
      expect(mdReport).toContain('CONTROLLED DEMONSTRATION TEST FIXTURE');
      expect(mdReport).not.toContain('LIVE REPOSITORY AUDIT');

      const liveResult: ScanResult = {
        ...demoResult,
        repository: {
          owner: 'facebook',
          repo: 'react',
          fullName: 'facebook/react',
          defaultBranch: 'main',
          resolvedCommitSha: 'a1b2c3d4e5f6',
        },
      };

      expect(isDemoScan(liveResult)).toBe(false);
      const liveMd = generateMarkdownReport(liveResult);
      expect(liveMd).toContain('LIVE REPOSITORY AUDIT');
      expect(liveMd).not.toContain('CONTROLLED DEMONSTRATION TEST FIXTURE');
    });
  });

  // 9. Export Escaping and HTML Injection Defense
  describe('9. Export Escaping & HTML Sanitization', () => {
    it('escapes special characters to prevent HTML injection in exported reports', () => {
      const unsafeResult: ScanResult = {
        repository: {
          owner: 'evil<script>alert(1)</script>',
          repo: 'repo"onmouseover="alert(1)',
          fullName: 'evil<script>/repo"bad',
          defaultBranch: 'main',
        },
        scannedAt: new Date().toISOString(),
        scannerVersion: '2.0.0',
        scanVerdict: 'complete_with_findings',
        findings: [
          {
            id: 'VULN-<script>',
            title: 'Unsafe <img src=x onerror=alert(1)> title',
            category: 'dependency_vulnerability',
            severity: 'critical',
            severityRationale: '<b>Unsafe</b>',
            repository: 'evil/repo',
            filePath: 'package.json',
            observedValue: 'pkg@"1.0.0"',
            evidenceSnippet: '<script>evil()</script>',
            detectionSource: 'OSV',
            recommendedAction: 'Fix & sanitize',
            confidence: 'confirmed',
            limitations: '',
            verificationStatus: 'unverified',
          },
        ],
        timeline: [],
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
        coverage: {} as any,
        manifestsFound: ['package.json'],
        workflowsFound: [],
        warnings: [],
        errors: [],
      };

      const html = generateHtmlReport(unsafeResult);
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&quot;');
    });
  });

  // 10. CycloneDX SBOM Validity and Dependency Graph References
  describe('10. CycloneDX SBOM Spec Compliance & Reference Integrity', () => {
    it('generates valid CycloneDX v1.5 with bom-ref and no dangling dependency references', () => {
      const repoMeta: RepositoryMetadata = {
        owner: 'org',
        repo: 'app',
        fullName: 'org/app',
        defaultBranch: 'main',
        resolvedCommitSha: 'abcdef1234567890',
      };

      const packages: DependencyPackage[] = [
        {
          name: 'express',
          version: '4.18.2',
          ecosystem: 'npm',
          isDirect: true,
          manifestPath: 'package.json',
          dependencies: { accepts: '1.3.8', nonexistent: '9.9.9' }, // nonexistent shouldn't cause dangling ref
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
          id: 'GHSA-express-1',
          title: 'Express CVE',
          category: 'dependency_vulnerability',
          severity: 'high',
          severityRationale: 'Issue in express',
          repository: 'org/app',
          filePath: 'package.json',
          observedValue: 'express@4.18.2',
          evidenceSnippet: 'express',
          detectionSource: 'OSV Advisory GHSA-express-1',
          recommendedAction: 'Upgrade',
          confidence: 'confirmed',
          limitations: '',
          verificationStatus: 'unverified',
        },
      ];

      const bom = generateCycloneDxBom(repoMeta, packages, findings) as any;

      expect(bom.bomFormat).toBe('CycloneDX');
      expect(bom.specVersion).toBe('1.5');
      expect(bom.metadata.component['bom-ref']).toBeDefined();

      // Check all components have bom-ref
      const declaredBomRefs = new Set<string>();
      declaredBomRefs.add(bom.metadata.component['bom-ref']);
      for (const comp of bom.components) {
        expect(comp['bom-ref']).toBeDefined();
        declaredBomRefs.add(comp['bom-ref']);
      }

      // Check dependencies section: every ref and dependsOn must exist in declaredBomRefs
      expect(Array.isArray(bom.dependencies)).toBe(true);
      for (const dep of bom.dependencies) {
        expect(declaredBomRefs.has(dep.ref)).toBe(true);
        for (const childRef of dep.dependsOn) {
          expect(declaredBomRefs.has(childRef)).toBe(true);
        }
      }

      // Check vulnerability affects reference
      expect(bom.vulnerabilities.length).toBe(1);
      const vuln = bom.vulnerabilities[0];
      expect(vuln.affects.length).toBe(1);
      expect(declaredBomRefs.has(vuln.affects[0].ref)).toBe(true);
    });
  });
});
