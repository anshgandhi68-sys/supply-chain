import { describe, it, expect } from 'vitest';
import { buildDependencyGraph } from '../lib/graph';
import { DependencyPackage, Finding } from '../lib/types';

describe('Dependency Attack Graph Engine', () => {
  it('constructs a multi-tier dependency graph with direct and transitive nodes', () => {
    const packages: DependencyPackage[] = [
      {
        name: 'axios',
        version: '0.21.1',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
        dependencies: {
          'follow-redirects': '^1.10.0',
        },
      },
      {
        name: 'follow-redirects',
        version: '1.14.0',
        ecosystem: 'npm',
        isDirect: false,
        manifestPath: 'package-lock.json',
      },
      {
        name: 'lodash',
        version: '4.17.20',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
      },
    ];

    const findings: Finding[] = [
      {
        id: 'CVE-2020-28168',
        title: 'Axios SSRF in follow-redirects',
        category: 'dependency_vulnerability',
        severity: 'high',
        severityRationale: 'Insecure redirect handling',
        repository: 'demo/app',
        filePath: 'package-lock.json',
        observedValue: 'axios@0.21.1',
        evidenceSnippet: 'axios: 0.21.1',
        detectionSource: 'OSV: CVE-2020-28168',
        recommendedAction: 'Upgrade axios to 0.21.2',
        confidence: 'confirmed',
        limitations: 'Static detection only',
        verificationStatus: 'unverified',
        fixedVersion: '0.21.2',
      },
    ];

    const graph = buildDependencyGraph({
      rootName: 'enterprise-app',
      rootVersion: '2.0.0',
      packages,
      findings,
    });

    expect(graph.totalPackages).toBe(3);
    expect(graph.directCount).toBe(2);
    expect(graph.transitiveCount).toBe(1);
    expect(graph.vulnerableCount).toBe(1);

    // Verify root node
    const root = graph.nodes.find((n) => n.isRoot);
    expect(root).toBeDefined();
    expect(root?.depth).toBe(0);

    // Verify direct vs transitive depths
    const axiosNode = graph.nodes.find((n) => n.name === 'axios');
    const followNode = graph.nodes.find((n) => n.name === 'follow-redirects');
    expect(axiosNode?.depth).toBe(1);
    expect(followNode?.depth).toBe(2);
    expect(axiosNode?.children).toContain('follow-redirects');
    expect(followNode?.parents).toContain('axios');

    // Verify edges
    const directEdge = graph.edges.find((e) => e.source === 'root-app' && e.target === 'axios');
    const transEdge = graph.edges.find((e) => e.source === 'axios' && e.target === 'follow-redirects');
    expect(directEdge).toBeDefined();
    expect(directEdge?.isTransitive).toBe(false);
    expect(transEdge).toBeDefined();
    expect(transEdge?.isTransitive).toBe(true);
  });

  it('safely handles cyclic dependencies without infinite recursion', () => {
    const packages: DependencyPackage[] = [
      {
        name: 'pkg-a',
        version: '1.0.0',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
        dependencies: { 'pkg-b': '1.0.0' },
      },
      {
        name: 'pkg-b',
        version: '1.0.0',
        ecosystem: 'npm',
        isDirect: false,
        manifestPath: 'package-lock.json',
        dependencies: { 'pkg-a': '1.0.0' }, // cycle!
      },
    ];

    const graph = buildDependencyGraph({
      rootName: 'cyclic-app',
      packages,
    });

    expect(graph.totalPackages).toBe(2);
    expect(graph.maxDepth).toBeGreaterThanOrEqual(1);
  });

  it('calculates blast radius based on dependents', () => {
    const packages: DependencyPackage[] = [
      {
        name: 'core-utils',
        version: '1.0.0',
        ecosystem: 'npm',
        isDirect: false,
        manifestPath: 'package-lock.json',
      },
      {
        name: 'service-a',
        version: '1.0.0',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
        dependencies: { 'core-utils': '1.0.0' },
      },
      {
        name: 'service-b',
        version: '1.0.0',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
        dependencies: { 'core-utils': '1.0.0' },
      },
    ];

    const graph = buildDependencyGraph({
      rootName: 'multi-service-app',
      packages,
    });

    const coreNode = graph.nodes.find((n) => n.name === 'core-utils');
    expect(coreNode?.parents.length).toBe(2);
    expect(coreNode?.blastRadius).toBeGreaterThanOrEqual(2);
  });

  it('traces plausible attack paths only for vulnerable nodes with supporting evidence', () => {
    const packages: DependencyPackage[] = [
      {
        name: 'web-server',
        version: '1.0.0',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
        dependencies: { 'vulnerable-lib': '0.5.0' },
      },
      {
        name: 'vulnerable-lib',
        version: '0.5.0',
        ecosystem: 'npm',
        isDirect: false,
        manifestPath: 'package-lock.json',
      },
      {
        name: 'safe-lib',
        version: '2.0.0',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
      },
    ];

    const findings: Finding[] = [
      {
        id: 'GHSA-vuln-001',
        title: 'Remote Code Execution in vulnerable-lib',
        category: 'dependency_vulnerability',
        severity: 'critical',
        severityRationale: 'RCE via prototype pollution',
        repository: 'demo/app',
        filePath: 'package-lock.json',
        observedValue: 'vulnerable-lib@0.5.0',
        evidenceSnippet: 'vulnerable-lib: 0.5.0',
        detectionSource: 'OSV: GHSA-vuln-001',
        recommendedAction: 'Upgrade to 0.5.1',
        confidence: 'confirmed',
        limitations: 'Static',
        verificationStatus: 'unverified',
        fixedVersion: '0.5.1',
      },
    ];

    const graph = buildDependencyGraph({
      rootName: 'test-app',
      packages,
      findings,
    });

    expect(graph.attackPaths.length).toBe(1);
    const ap = graph.attackPaths[0];
    expect(ap.targetPackage).toBe('vulnerable-lib');
    expect(ap.severity).toBe('critical');
    expect(ap.path).toEqual(['root-app', 'web-server', 'vulnerable-lib']);
    expect(ap.plausibilityRationale).toContain('Transitive');
    expect(ap.plausibilityRationale).toContain('web-server');

    // Ensure safe-lib is NOT flagged as an attack path
    const safeAttack = graph.attackPaths.find((p) => p.targetPackage === 'safe-lib');
    expect(safeAttack).toBeUndefined();
  });
});
