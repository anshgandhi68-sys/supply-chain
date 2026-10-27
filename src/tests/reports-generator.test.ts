import { describe, it, expect } from 'vitest';
import { generateMarkdownReport, generateHtmlReport, isDemoScan } from '../lib/reports';
import { ScanResult } from '../lib/types';

describe('Security Audit Report Engine', () => {
  const mockResult: ScanResult = {
    repository: {
      owner: 'sentinel-security',
      repo: 'supply-chain-demo',
      fullName: 'sentinel-security/supply-chain-demo',
      defaultBranch: 'main',
      resolvedCommitSha: 'a1b2c3d4e5f6',
    },
    scannedAt: '2026-10-27T12:00:00.000Z',
    scannerVersion: '2.0.0',
    scanVerdict: 'complete_with_findings',
    findings: [
      {
        id: 'GHSA-35jh-r3h4-6jhm',
        title: 'Command Injection in lodash',
        category: 'dependency_vulnerability',
        severity: 'high',
        severityRationale: 'Injection via template',
        repository: 'sentinel-security/supply-chain-demo',
        filePath: 'package-lock.json',
        observedValue: 'lodash@4.17.20',
        evidenceSnippet: 'lodash: 4.17.20',
        detectionSource: 'OSV',
        recommendedAction: 'Upgrade to 4.17.21',
        confidence: 'confirmed',
        limitations: 'Static',
        verificationStatus: 'unverified',
        fixedVersion: '4.17.21',
      },
    ],
    timeline: [],
    stats: {
      totalFindings: 1,
      criticalCount: 0,
      highCount: 1,
      mediumCount: 0,
      lowCount: 0,
      infoCount: 0,
      confirmedCount: 1,
      potentialRiskCount: 0,
      versionUnverifiedCount: 0,
      unknownCount: 0,
      filesScanned: 2,
      dependenciesScanned: 3,
      workflowsScanned: 1,
    },
    coverage: {
      commitSha: 'a1b2c3d4e5f6',
      filesDiscovered: 2,
      filesAnalyzed: 2,
      filesSkipped: 0,
      manifestsDetected: ['package-lock.json'],
      lockfilesDetected: ['package-lock.json'],
      dependenciesDiscovered: 3,
      exactVersionsResolved: 3,
      unresolvedRanges: 0,
      unsupportedManifests: [],
      parserErrors: [],
      upstreamFailures: [],
      scanTruncated: false,
      vulnerabilitySources: ['OSV'],
      workflowFilesAnalyzed: 1,
      analyzersCompleted: [],
      durationMs: 150,
    },
    manifestsFound: ['package-lock.json'],
    workflowsFound: ['.github/workflows/ci.yml'],
    warnings: [],
    errors: [],
  };

  it('correctly labels simulated demo data in the report', () => {
    expect(isDemoScan(mockResult)).toBe(true);

    const markdown = generateMarkdownReport(mockResult);
    expect(markdown).toContain('CONTROLLED DEMONSTRATION TEST FIXTURE');
    expect(markdown).toContain('Executive Summary');
    expect(markdown).toContain('Command Injection in lodash');
    expect(markdown).toContain('Limitations');
  });

  it('labels live scan data accurately without demo warning', () => {
    const liveResult: ScanResult = {
      ...mockResult,
      repository: {
        owner: 'expressjs',
        repo: 'express',
        fullName: 'expressjs/express',
        defaultBranch: 'master',
        resolvedCommitSha: '998877665544',
      },
    };

    expect(isDemoScan(liveResult)).toBe(false);

    const markdown = generateMarkdownReport(liveResult);
    expect(markdown).toContain('LIVE REPOSITORY AUDIT');
    expect(markdown).not.toContain('CONTROLLED DEMONSTRATION TEST FIXTURE');
    expect(markdown).toContain('expressjs/express');
  });

  it('generates well-formed HTML reports', () => {
    const html = generateHtmlReport(mockResult);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Supply Chain Sentinel 2.0 Security Report');
    expect(html).toContain('Command Injection in lodash');
    expect(html).toContain('CONTROLLED DEMONSTRATION FIXTURE');
  });
});
