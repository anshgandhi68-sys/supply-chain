import { describe, it, expect } from 'vitest';
import { queryOsvForPackages } from '../lib/osv/client';
import { DependencyPackage } from '../lib/types';
import { parsePackageJson } from '../lib/manifests/package-json';

describe('Dependency Vulnerability Accuracy Audit & Regression Tests', () => {
  it('never marks an unverified version range as CONFIRMED', async () => {
    // Simulated dependency from package.json without a lockfile
    const unverifiedPackage: DependencyPackage = {
      name: 'body-parser',
      version: '2.3.0',
      rawSpecifier: '^2.3.0',
      ecosystem: 'npm',
      isDirect: true,
      manifestPath: 'package.json',
      isExactVersion: false,
      specifierType: 'range',
      resolvedFromLockfile: false,
    };

    const res = await queryOsvForPackages([unverifiedPackage], 'expressjs/express');
    expect(res.apiSuccess).toBe(true);

    if (res.findings.length > 0) {
      for (const finding of res.findings) {
        // Must NOT be marked confirmed
        expect(finding.confidence).not.toBe('confirmed');
        expect(finding.confidence).toBe('version_unverified');
        expect(finding.verificationStatus).toBe('version_unverified');
        expect(finding.title).toContain('[Version Unverified]');
        expect(finding.limitations).toContain('No lockfile');
      }
    }
  });

  it('marks exact lockfile-resolved versions as CONFIRMED', async () => {
    // Simulated dependency from a lockfile
    const confirmedPackage: DependencyPackage = {
      name: 'lodash',
      version: '4.17.20',
      rawSpecifier: '4.17.20',
      ecosystem: 'npm',
      isDirect: true,
      manifestPath: 'package-lock.json',
      isExactVersion: true,
      specifierType: 'exact',
      resolvedFromLockfile: true,
    };

    const res = await queryOsvForPackages([confirmedPackage], 'test-org/test-repo');
    expect(res.apiSuccess).toBe(true);
    expect(res.findings.length).toBeGreaterThan(0);

    for (const finding of res.findings) {
      expect(finding.confidence).toBe('confirmed');
      expect(finding.verificationStatus).toBe('unverified');
      expect(finding.title).not.toContain('[Version Unverified]');
    }
  });

  it('does not query local link: or workspace: dependencies against OSV', async () => {
    const localPackages: DependencyPackage[] = [
      {
        name: 'eslint-plugin-react-internal',
        version: 'link:./scripts/eslint-rules',
        rawSpecifier: 'link:./scripts/eslint-rules',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
        isExactVersion: false,
        specifierType: 'local_link',
        resolvedFromLockfile: false,
      },
      {
        name: 'internal-core',
        version: 'workspace:*',
        rawSpecifier: 'workspace:*',
        ecosystem: 'npm',
        isDirect: true,
        manifestPath: 'package.json',
        isExactVersion: false,
        specifierType: 'workspace',
        resolvedFromLockfile: false,
      },
    ];

    const res = await queryOsvForPackages(localPackages, 'facebook/react');
    expect(res.apiSuccess).toBe(true);
    // Neither should generate false-positive findings
    expect(res.findings.length).toBe(0);
  });

  it('queries aliased packages using resolvedPackageName instead of alias key', async () => {
    const aliasedPackage: DependencyPackage = {
      name: 'eslint-plugin-react-hooks-published',
      version: '5.2.0',
      rawSpecifier: 'npm:eslint-plugin-react-hooks@^5.2.0',
      ecosystem: 'npm',
      isDirect: true,
      manifestPath: 'package.json',
      isExactVersion: false,
      specifierType: 'alias',
      resolvedFromLockfile: false,
      resolvedPackageName: 'eslint-plugin-react-hooks',
    };

    const res = await queryOsvForPackages([aliasedPackage], 'facebook/react');
    expect(res.apiSuccess).toBe(true);
    // Should NOT match MAL-2025-191488 (which was registered against the alias name)
    const malAdvisory = res.findings.find((f) => f.id.includes('MAL-2025-191488'));
    expect(malAdvisory).toBeUndefined();
  });

  it('deduplicates advisories by canonical ID for the same package version', async () => {
    const pkg: DependencyPackage = {
      name: 'minimist',
      version: '1.2.5',
      ecosystem: 'npm',
      isDirect: true,
      manifestPath: 'package-lock.json',
      isExactVersion: true,
      resolvedFromLockfile: true,
    };

    const res = await queryOsvForPackages([pkg], 'test/repo');
    expect(res.apiSuccess).toBe(true);

    // Ensure all finding IDs in the result are strictly unique
    const ids = res.findings.map((f) => f.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('respects fixed-version boundaries and does not flag fixed versions (e.g. lodash@4.17.21)', async () => {
    // lodash 4.17.20 was vulnerable to GHSA-35jh-r3h4-6jhm and GHSA-29mw-wpgm-hmr9, both fixed in 4.17.21
    const fixedPackage: DependencyPackage = {
      name: 'lodash',
      version: '4.17.21',
      ecosystem: 'npm',
      isDirect: true,
      manifestPath: 'package-lock.json',
      isExactVersion: true,
      resolvedFromLockfile: true,
    };

    const res = await queryOsvForPackages([fixedPackage], 'test/repo');
    expect(res.apiSuccess).toBe(true);

    // GHSA-35jh-r3h4-6jhm (fixed in 4.17.21) must NOT be present
    const prototypePollution = res.findings.find((f) => f.id.includes('GHSA-35jh-r3h4-6jhm'));
    expect(prototypePollution).toBeUndefined();

    // GHSA-29mw-wpgm-hmr9 (fixed in 4.17.21) must NOT be present
    const commandInjection = res.findings.find((f) => f.id.includes('GHSA-29mw-wpgm-hmr9'));
    expect(commandInjection).toBeUndefined();
  });
});

