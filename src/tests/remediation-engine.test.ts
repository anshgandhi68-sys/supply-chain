import { describe, it, expect } from 'vitest';
import {
  assessSemverRisk,
  generatePackageJsonDiff,
  generateRemediationProposals,
} from '../lib/remediation';
import { Finding } from '../lib/types';

describe('Remediation Proposal & SemVer Risk Engine', () => {
  it('correctly classifies SemVer patch, minor, and major breaking risks', () => {
    // Patch: 4.17.20 -> 4.17.21 (Low Risk)
    const patch = assessSemverRisk('4.17.20', '4.17.21');
    expect(patch.risk).toBe('low');
    expect(patch.rationale).toContain('Patch version upgrade');

    // Minor: 1.2.0 -> 1.3.0 (Moderate Risk)
    const minor = assessSemverRisk('1.2.0', '1.3.0');
    expect(minor.risk).toBe('moderate');
    expect(minor.rationale).toContain('Minor version upgrade');

    // Major: 0.21.1 -> 1.6.0 (High Breaking Risk)
    const major = assessSemverRisk('0.21.1', '1.6.0');
    expect(major.risk).toBe('high');
    expect(major.rationale).toContain('Major version upgrade');
  });

  it('generates a clean unified package.json diff', () => {
    const diff = generatePackageJsonDiff('lodash', '4.17.20', '4.17.21');

    expect(diff.unifiedDiff).toContain('--- a/package.json');
    expect(diff.unifiedDiff).toContain('+++ b/package.json');
    expect(diff.unifiedDiff).toContain('-     "lodash": "4.17.20"');
    expect(diff.unifiedDiff).toContain('+     "lodash": "4.17.21"');
  });

  it('generates remediation proposals only for findings with confirmed fixedVersion', () => {
    const findings: Finding[] = [
      {
        id: 'GHSA-fixed-01',
        title: 'Fixable issue',
        category: 'dependency_vulnerability',
        severity: 'high',
        severityRationale: 'Patch exists',
        repository: 'demo/repo',
        filePath: 'package.json',
        observedValue: 'lodash@4.17.20',
        evidenceSnippet: 'lodash',
        detectionSource: 'OSV',
        recommendedAction: 'Upgrade',
        confidence: 'confirmed',
        limitations: '',
        verificationStatus: 'unverified',
        fixedVersion: '4.17.21',
      },
      {
        id: 'GHSA-unfixed-02',
        title: '0-day / Unfixed issue',
        category: 'dependency_vulnerability',
        severity: 'critical',
        severityRationale: 'No patch exists',
        repository: 'demo/repo',
        filePath: 'package.json',
        observedValue: 'unfixed-lib@1.0.0',
        evidenceSnippet: 'unfixed-lib',
        detectionSource: 'OSV',
        recommendedAction: 'Apply WAF filter',
        confidence: 'confirmed',
        limitations: '',
        verificationStatus: 'unverified',
        // fixedVersion undefined!
      },
    ];

    const proposals = generateRemediationProposals(findings);
    expect(proposals.length).toBe(1);
    expect(proposals[0].packageName).toBe('lodash');
    expect(proposals[0].proposedVersion).toBe('4.17.21');
    expect(proposals[0].breakingRisk).toBe('low');
  });
});
