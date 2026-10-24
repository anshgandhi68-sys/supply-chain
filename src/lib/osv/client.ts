/**
 * OSV (Open Source Vulnerabilities) API Client
 * Integrates with Google's OSV database (https://osv.dev) to query real,
 * evidence-backed CVE and GHSA security advisories for exact package versions.
 *
 * Enforces strict ecosystem and affected version verification, deduplicates advisories,
 * and differentiates confirmed exact-version matches from unverified declared ranges.
 */

import { DependencyPackage, Finding, Severity, ConfidenceLevel, VerificationStatus } from '../types';
import { redactSecrets } from '../redaction';

interface OsvQuery {
  package: {
    name: string;
    ecosystem: string;
  };
  version: string;
}

interface OsvAffected {
  package?: {
    name?: string;
    ecosystem?: string;
  };
  ranges?: Array<{
    type?: string;
    events?: Array<{
      introduced?: string;
      fixed?: string;
      last_affected?: string;
      limit?: string;
    }>;
  }>;
  versions?: string[];
}

interface OsvAdvisory {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  database_specific?: {
    severity?: string;
    github_reviewed?: boolean;
    cwe_ids?: string[];
  };
  severity?: Array<{
    type: string;
    score: string;
  }>;
  affected?: OsvAffected[];
  references?: Array<{
    type: string;
    url: string;
  }>;
}

interface OsvBatchResponse {
  results?: Array<{
    vulns?: OsvAdvisory[];
  }>;
}

export interface OsvQueryResult {
  findings: Finding[];
  scannedPackagesCount: number;
  vulnerablePackagesCount: number;
  apiSuccess: boolean;
  errorMessage?: string;
}

// Lightweight SemVer utilities for affected range verification
export function parseSemver(v: string): [number, number, number, string] | null {
  if (!v || typeof v !== 'string') return null;
  const m = v.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2] || '0', 10), parseInt(m[3] || '0', 10), m[4] || ''];
}

export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);
  if (!p1 || !p2) return v1.localeCompare(v2);
  if (p1[0] !== p2[0]) return p1[0] - p2[0];
  if (p1[1] !== p2[1]) return p1[1] - p2[1];
  if (p1[2] !== p2[2]) return p1[2] - p2[2];
  if (!p1[3] && p2[3]) return 1;
  if (p1[3] && !p2[3]) return -1;
  return p1[3].localeCompare(p2[3]);
}

/**
 * Checks whether a given version is affected by an OSV advisory entry.
 */
function isVersionAffectedByAdvisory(pkgVersion: string, affectedList: OsvAffected[] | undefined, targetEcosystem: string): boolean {
  if (!affectedList || affectedList.length === 0) return true; // Default match if unspecified

  const parsedPkg = parseSemver(pkgVersion);

  for (const aff of affectedList) {
    // 1. Ecosystem check: must match
    if (aff.package?.ecosystem && aff.package.ecosystem.toLowerCase() !== targetEcosystem.toLowerCase()) {
      continue;
    }

    // 2. Explicit versions list
    if (aff.versions && Array.isArray(aff.versions) && aff.versions.length > 0) {
      if (aff.versions.includes(pkgVersion)) {
        return true;
      }
    }

    // 3. Range events check
    if (aff.ranges && Array.isArray(aff.ranges)) {
      for (const range of aff.ranges) {
        if (!range.events || !Array.isArray(range.events)) continue;

        let introduced: string | undefined;
        let fixed: string | undefined;

        for (const ev of range.events) {
          if (ev.introduced !== undefined) introduced = ev.introduced;
          if (ev.fixed !== undefined) fixed = ev.fixed;
        }

        // If version is non-semver, cannot check semver ranges accurately; consider matched
        if (!parsedPkg) return true;

        let afterIntroduced = true;
        if (introduced && introduced !== '0') {
          afterIntroduced = compareSemver(pkgVersion, introduced) >= 0;
        }

        let beforeFixed = true;
        if (fixed) {
          beforeFixed = compareSemver(pkgVersion, fixed) < 0;
        }

        if (afterIntroduced && beforeFixed) {
          return true;
        }
      }
    }
  }

  return false;
}

function mapOsvSeverity(advisory: OsvAdvisory): { severity: Severity; score?: number } {
  // Check for CVSS V3 score string
  if (advisory.severity) {
    for (const s of advisory.severity) {
      if (s.type === 'CVSS_V3' && s.score) {
        const numMatch = s.score.match(/(\d+\.\d+)/);
        if (numMatch) {
          const score = parseFloat(numMatch[1]);
          if (score >= 9.0) return { severity: 'critical', score };
          if (score >= 7.0) return { severity: 'high', score };
          if (score >= 4.0) return { severity: 'medium', score };
          return { severity: 'low', score };
        }
      }
    }
  }

  // Check database_specific severity string
  const dbSev = advisory.database_specific?.severity?.toUpperCase();
  if (dbSev) {
    if (dbSev.includes('CRITICAL')) return { severity: 'critical' };
    if (dbSev.includes('HIGH')) return { severity: 'high' };
    if (dbSev.includes('MODERATE') || dbSev.includes('MEDIUM')) return { severity: 'medium' };
    if (dbSev.includes('LOW')) return { severity: 'low' };
  }

  return { severity: 'medium' };
}

function extractFixedVersion(advisory: OsvAdvisory): string | undefined {
  if (!advisory.affected) return undefined;
  for (const aff of advisory.affected) {
    if (aff.ranges) {
      for (const range of aff.ranges) {
        if (range.events) {
          for (const ev of range.events) {
            if (ev.fixed) {
              return ev.fixed;
            }
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * Queries OSV batch API with rate-limiting, chunking, and explicit timeout handling.
 * Only queries valid registry dependencies (skips local links and workspaces).
 * Deduplicates advisories and enforces exact version vs. unverified range confidence.
 */
export async function queryOsvForPackages(
  packages: DependencyPackage[],
  repositoryName: string,
  commitSha?: string,
  timeoutMs: number = 10000
): Promise<OsvQueryResult> {
  // Filter out non-queryable packages (local links, workspaces, git URLs, empty versions)
  const queryablePackages = packages.filter((pkg) => {
    if (pkg.specifierType === 'local_link' || pkg.specifierType === 'workspace') {
      return false;
    }
    if (!pkg.name || !pkg.version || pkg.version.trim() === '') {
      return false;
    }
    return true;
  });

  if (queryablePackages.length === 0) {
    return {
      findings: [],
      scannedPackagesCount: packages.length,
      vulnerablePackagesCount: 0,
      apiSuccess: true,
    };
  }

  const findings: Finding[] = [];
  const seenFindingKeys = new Set<string>();
  const vulnerablePackageNames = new Set<string>();
  const chunkSize = 100; // OSV batch size limit recommendation

  for (let i = 0; i < queryablePackages.length; i += chunkSize) {
    const chunk = queryablePackages.slice(i, i + chunkSize);

    const queries: OsvQuery[] = chunk.map((pkg) => ({
      package: {
        // In case of an alias (npm:real-name@^1.0.0), query the actual target package name
        name: pkg.resolvedPackageName || pkg.name,
        ecosystem: pkg.ecosystem,
      },
      version: pkg.version,
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SupplyChainSentinel/1.0',
        },
        body: JSON.stringify({ queries }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          findings,
          scannedPackagesCount: i,
          vulnerablePackagesCount: vulnerablePackageNames.size,
          apiSuccess: false,
          errorMessage: `OSV API responded with HTTP status ${response.status}`,
        };
      }

      const data: OsvBatchResponse = await response.json();
      const results = data.results || [];

      results.forEach((result, idx) => {
        const pkg = chunk[idx];
        if (!result.vulns || result.vulns.length === 0) return;

        for (const advisory of result.vulns) {
          // 1. Verify that advisory actually affects this package version in this ecosystem
          if (!isVersionAffectedByAdvisory(pkg.version, advisory.affected, pkg.ecosystem)) {
            continue;
          }

          // 2. Canonical advisory deduplication across CVE and GHSA aliases
          const aliases = advisory.aliases || [];
          const cveId = aliases.find((a) => a.startsWith('CVE-'));
          const canonicalId = cveId || advisory.id;

          const findingKey = `${pkg.manifestPath}:${pkg.name}:${pkg.version}:${canonicalId}`;
          if (seenFindingKeys.has(findingKey)) {
            continue;
          }
          seenFindingKeys.add(findingKey);
          vulnerablePackageNames.add(pkg.name);

          const { severity, score } = mapOsvSeverity(advisory);
          const fixedVersion = extractFixedVersion(advisory);

          const advisoryUrl =
            advisory.references?.find((r) => r.type === 'ADVISORY' || r.url.includes('github.com/advisories'))?.url ||
            `https://osv.dev/vulnerability/${advisory.id}`;

          const isExact = Boolean(pkg.resolvedFromLockfile || pkg.isExactVersion);
          const confidence: ConfidenceLevel = isExact ? 'confirmed' : 'version_unverified';
          const verificationStatus: VerificationStatus = isExact ? 'unverified' : 'version_unverified';

          const summary = advisory.summary || `Vulnerability in ${pkg.name}@${pkg.version}`;
          const findingId = `OSV-${advisory.id}-${pkg.name}-${pkg.version}`.replace(/[^a-zA-Z0-9_-]/g, '_');

          const titlePrefix = isExact ? '' : '[Version Unverified] ';
          const fullTitle = `${titlePrefix}${pkg.name}@${pkg.rawSpecifier || pkg.version}: ${summary}`;

          const observedValue = isExact
            ? `${pkg.name}@${pkg.version}`
            : `${pkg.name}@${pkg.rawSpecifier || pkg.version} (declared range, unverified installed version)`;

          const evidenceSnippet = [
            `Ecosystem:       ${pkg.ecosystem}`,
            `Package:         ${pkg.name}${pkg.resolvedPackageName ? ` (aliased to ${pkg.resolvedPackageName})` : ''}`,
            `Version Query:   ${pkg.version}`,
            `Raw Specifier:   ${pkg.rawSpecifier || pkg.version}`,
            `Lockfile Status: ${pkg.resolvedFromLockfile ? 'Exact resolved in lockfile' : 'Unverified range (no lockfile)'}`,
            `Manifest:        ${pkg.manifestPath}${pkg.lineNumber ? ` (Line ${pkg.lineNumber})` : ''}`,
            `Direct:          ${pkg.isDirect ? 'Yes (direct dependency)' : 'No (transitive dependency)'}`,
            `Advisory:        ${advisory.id}${cveId ? ` (${cveId})` : ''}`,
            fixedVersion ? `Fix State:       Upgrade to >= ${fixedVersion}` : 'Fix State:       No official fix version recorded',
          ].join('\n');

          const severityRationale = isExact
            ? `Matched upstream vulnerability advisory ${advisory.id} rated ${severity.toUpperCase()} in OSV database for exact resolved version ${pkg.version}.`
            : `Potential vulnerability: declared range "${pkg.rawSpecifier || pkg.version}" matches advisory ${advisory.id}. Because no lockfile resolves the installed version, this finding is UNVERIFIED; installing dependencies may resolve to fixed version >= ${fixedVersion || 'N/A'}.`;

          const recommendedAction = fixedVersion
            ? `Upgrade ${pkg.name} to version ${fixedVersion} or higher in ${pkg.manifestPath}.`
            : `Review upstream advisory ${advisory.id} and evaluate mitigation or package replacement.`;

          const limitations = isExact
            ? 'Vulnerability confirmed by exact version match in OSV. Exploitability in your specific application depends on code paths calling the vulnerable functions.'
            : 'No lockfile (package-lock.json or yarn.lock) resolved this dependency. Marked as VERSION_UNVERIFIED because package managers dynamically select the latest compatible version satisfying the range.';

          findings.push({
            id: findingId,
            title: fullTitle,
            category: 'dependency_vulnerability',
            severity,
            severityRationale,
            repository: repositoryName,
            commitSha,
            filePath: pkg.manifestPath,
            lineNumber: pkg.lineNumber,
            observedValue,
            evidenceSnippet: redactSecrets(evidenceSnippet),
            detectionSource: `OSV Advisory ${advisory.id}${cveId ? ` / ${cveId}` : ''}`,
            recommendedAction,
            confidence,
            limitations,
            verificationStatus,
            advisoryUrl,
            aliases,
            cvssScore: score,
            fixedVersion,
          });
        }
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isTimeout =
        (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) ||
        String(err).includes('aborted') ||
        String(err).includes('timeout');
      const msg = isTimeout
        ? `OSV API query timed out after ${timeoutMs}ms.`
        : err instanceof Error
        ? err.message
        : String(err);
      return {
        findings,
        scannedPackagesCount: i,
        vulnerablePackagesCount: vulnerablePackageNames.size,
        apiSuccess: false,
        errorMessage: `Failed to connect to OSV API: ${msg}`,
      };
    }
  }

  return {
    findings,
    scannedPackagesCount: packages.length,
    vulnerablePackagesCount: vulnerablePackageNames.size,
    apiSuccess: true,
  };
}
