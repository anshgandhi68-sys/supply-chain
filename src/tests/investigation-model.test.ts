import { describe, it, expect } from 'vitest';
import { enrichFindingWithEvidence } from '../lib/investigation';
import { Finding, DependencyGraphData } from '../lib/types';

describe('Investigation Tri-Part Evidence Model', () => {
  it('correctly categorizes observed facts, inferred risks, and unknowns', () => {
    const finding: Finding = {
      id: 'GHSA-35jh-r3h4-6jhm',
      aliases: ['CVE-2021-23337'],
      title: 'Command Injection in lodash',
      category: 'dependency_vulnerability',
      severity: 'high',
      severityRationale: 'Command injection via template parameter',
      repository: 'sentinel-security/demo',
      filePath: 'package-lock.json',
      lineNumber: 22,
      observedValue: 'lodash@4.17.20',
      evidenceSnippet: 'node_modules/lodash: 4.17.20',
      detectionSource: 'Google OSV: GHSA-35jh-r3h4-6jhm',
      recommendedAction: 'Upgrade lodash to 4.17.21',
      confidence: 'confirmed',
      limitations: 'Static analysis only',
      verificationStatus: 'unverified',
      fixedVersion: '4.17.21',
      cvssScore: 7.4,
    };

    const mockGraph: DependencyGraphData = {
      nodes: [
        {
          id: 'root-app',
          name: 'demo-app',
          version: '1.0.0',
          ecosystem: 'npm',
          isDirect: true,
          isRoot: true,
          manifestPath: 'package.json',
          scope: 'production',
          hasVulnerability: false,
          advisoryCount: 0,
          findings: [],
          blastRadius: 3,
          parents: [],
          children: ['lodash'],
          inAttackPath: true,
          depth: 0,
        },
        {
          id: 'lodash',
          name: 'lodash',
          version: '4.17.20',
          ecosystem: 'npm',
          isDirect: true,
          isRoot: false,
          manifestPath: 'package-lock.json',
          scope: 'production',
          hasVulnerability: true,
          highestSeverity: 'high',
          advisoryCount: 1,
          findings: [finding],
          blastRadius: 2,
          parents: ['root-app'],
          children: [],
          inAttackPath: true,
          depth: 1,
        },
      ],
      edges: [
        {
          id: 'edge-root-lodash',
          source: 'root-app',
          target: 'lodash',
          isTransitive: false,
          isInAttackPath: true,
        },
      ],
      attackPaths: [
        {
          id: 'attack-path-1',
          targetPackage: 'lodash',
          targetVersion: '4.17.20',
          severity: 'high',
          path: ['root-app', 'lodash'],
          advisoryId: 'GHSA-35jh-r3h4-6jhm',
          cve: 'CVE-2021-23337',
          scope: 'production',
          blastRadius: 2,
          plausibilityRationale: 'Direct production dependency reachable from application code.',
        },
      ],
      totalPackages: 1,
      directCount: 1,
      transitiveCount: 0,
      vulnerableCount: 1,
      maxDepth: 1,
    };

    const result = enrichFindingWithEvidence(finding, mockGraph);

    // Observed Facts checks
    expect(result.observedFacts.length).toBeGreaterThan(0);
    expect(result.observedFacts.some((f) => f.includes('package-lock.json'))).toBe(true);
    expect(result.observedFacts.some((f) => f.includes('GHSA-35jh-r3h4-6jhm'))).toBe(true);
    expect(result.observedFacts.some((f) => f.includes('4.17.21'))).toBe(true);
    expect(result.observedFacts.some((f) => f.includes('CVSS Score: 7.4'))).toBe(true);

    // Inferred Risks checks
    expect(result.inferredRisks.length).toBeGreaterThan(0);
    expect(result.inferredRisks.some((r) => r.includes('Direct production dependency'))).toBe(true);
    expect(result.inferredRisks.some((r) => r.includes('Production scope'))).toBe(true);

    // Unknowns checks
    expect(result.unknowns.length).toBeGreaterThan(0);
    expect(result.unknowns.some((u) => u.includes('Runtime call-tree'))).toBe(true);

    // Blast radius and path
    expect(result.blastRadius).toBe(2);
    expect(result.dependencyPath).toEqual(['root-app', 'lodash']);
  });

  it('marks loose version ranges honestly as unverified in Unknowns', () => {
    const unverifiedFinding: Finding = {
      id: 'GHSA-test-001',
      title: 'Declared range vulnerability in foo',
      category: 'dependency_vulnerability',
      severity: 'medium',
      severityRationale: 'Range specifier declared',
      repository: 'test/repo',
      filePath: 'package.json',
      observedValue: 'foo@^1.0.0',
      evidenceSnippet: 'foo: ^1.0.0',
      detectionSource: 'OSV',
      recommendedAction: 'Provide package-lock.json',
      confidence: 'version_unverified',
      limitations: 'Lockfile missing',
      verificationStatus: 'unverified',
    };

    const result = enrichFindingWithEvidence(unverifiedFinding);
    expect(result.unknowns.some((u) => u.includes('package-lock.json was not provided'))).toBe(true);
    expect(result.observedFacts.some((f) => f.includes('Declared version range'))).toBe(true);
  });
});
