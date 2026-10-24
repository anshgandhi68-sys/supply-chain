/**
 * Software Bill of Materials (SBOM) Generator
 * Produces industry-standard CycloneDX v1.5 JSON formatted SBOMs from
 * discovered and resolved dependency packages and matched security advisories.
 */

import { DependencyPackage, Finding, RepositoryMetadata, SupportedEcosystem } from '../types';

export function buildPurl(ecosystem: SupportedEcosystem, name: string, version: string): string {
  const cleanVer = encodeURIComponent(version);

  switch (ecosystem) {
    case 'npm':
      if (name.startsWith('@')) {
        const [scope, pkg] = name.split('/');
        return `pkg:npm/${encodeURIComponent(scope)}/${encodeURIComponent(pkg)}@${cleanVer}`;
      }
      return `pkg:npm/${encodeURIComponent(name)}@${cleanVer}`;
    case 'PyPI':
      return `pkg:pypi/${encodeURIComponent(name.toLowerCase())}@${cleanVer}`;
    case 'crates.io':
      return `pkg:cargo/${encodeURIComponent(name)}@${cleanVer}`;
    case 'Go':
      return `pkg:golang/${name}@${cleanVer}`;
    case 'Packagist':
      return `pkg:composer/${name}@${cleanVer}`;
    case 'RubyGems':
      return `pkg:gem/${encodeURIComponent(name)}@${cleanVer}`;
    case 'Maven': {
      const parts = name.split(':');
      if (parts.length === 2) {
        return `pkg:maven/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}@${cleanVer}`;
      }
      return `pkg:maven/${encodeURIComponent(name)}@${cleanVer}`;
    }
    case 'NuGet':
      return `pkg:nuget/${encodeURIComponent(name)}@${cleanVer}`;
    default:
      return `pkg:generic/${encodeURIComponent(name)}@${cleanVer}`;
  }
}

export function generateCycloneDxBom(
  repoMeta: RepositoryMetadata,
  packages: DependencyPackage[],
  findings: Finding[],
  scannerVersion: string = '1.0.0'
): Record<string, unknown> {
  const serialUuid = `urn:uuid:${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;
  const timestamp = new Date().toISOString();

  const components = packages.map((pkg) => {
    const purl = buildPurl(pkg.ecosystem, pkg.name, pkg.version);
    return {
      type: 'library',
      name: pkg.name,
      version: pkg.version,
      purl,
      scope: pkg.isDirect ? 'required' : 'optional',
      properties: [
        { name: 'sentinel:ecosystem', value: pkg.ecosystem },
        { name: 'sentinel:manifest', value: pkg.manifestPath },
        { name: 'sentinel:lockfile_resolved', value: String(Boolean(pkg.resolvedFromLockfile)) },
        { name: 'sentinel:exact_version', value: String(Boolean(pkg.isExactVersion)) },
      ],
    };
  });

  const dependencyVulnerabilities = findings
    .filter((f) => f.category === 'dependency_vulnerability')
    .map((f) => {
      const advisoryId = f.detectionSource.replace(/^OSV Advisory\s*/i, '').split('/')[0].trim();
      return {
        id: advisoryId,
        source: {
          name: 'OSV',
          url: f.advisoryUrl || `https://osv.dev/vulnerability/${advisoryId}`,
        },
        ratings: [
          {
            severity: f.severity,
            score: f.cvssScore,
            method: 'CVSSv3',
          },
        ],
        description: f.title,
        recommendation: f.recommendedAction,
      };
    });

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: serialUuid,
    version: 1,
    metadata: {
      timestamp,
      tools: [
        {
          vendor: 'Sentinel Security',
          name: 'Supply Chain Sentinel',
          version: scannerVersion,
        },
      ],
      component: {
        type: 'application',
        name: repoMeta.fullName,
        version: repoMeta.resolvedCommitSha || repoMeta.latestCommitSha || repoMeta.defaultBranch,
        description: repoMeta.description,
      },
    },
    components,
    vulnerabilities: dependencyVulnerabilities,
  };
}

export function generateCycloneDxSbom(
  repoMetaOrOptions:
    | RepositoryMetadata
    | { repositoryUrl: string; resolvedSha: string; packages: DependencyPackage[]; findings?: Finding[] },
  packages?: DependencyPackage[],
  findings?: Finding[],
  scannerVersion: string = '1.0.0'
): Record<string, unknown> {
  if ('packages' in repoMetaOrOptions && Array.isArray(repoMetaOrOptions.packages)) {
    const opts = repoMetaOrOptions;
    const urlParts = opts.repositoryUrl.replace(/\/+$/, '').split('/');
    const repo = urlParts.pop() || 'repo';
    const owner = urlParts.pop() || 'org';
    const meta: RepositoryMetadata = {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      defaultBranch: 'main',
      resolvedCommitSha: opts.resolvedSha,
      requestedRef: 'main',
      canonicalUrl: opts.repositoryUrl,
    };
    return generateCycloneDxBom(meta, opts.packages, opts.findings || [], scannerVersion);
  }

  return generateCycloneDxBom(
    repoMetaOrOptions as RepositoryMetadata,
    packages || [],
    findings || [],
    scannerVersion
  );
}

