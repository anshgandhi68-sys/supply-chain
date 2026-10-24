/**
 * .NET NuGet Manifest and Lockfile Parser
 * Supports packages.lock.json (exact resolved versions) and .csproj (declared PackageReference)
 */

import { DependencyPackage, ParsedManifestResult } from '../types';

export function parseNuGetManifest(
  content: string,
  filePath: string = 'packages.lock.json'
): ParsedManifestResult {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';

  if (fileName.endsWith('.csproj') || fileName.endsWith('.fsproj')) {
    return parseCsProj(content, filePath);
  }

  return parsePackagesLockJson(content, filePath);
}

/**
 * Parses .NET packages.lock.json
 */
export function parsePackagesLockJson(
  content: string,
  filePath: string = 'packages.lock.json'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];
  const uniqueSet = new Set<string>();

  try {
    const json = JSON.parse(content);
    const dependenciesBlock = json.dependencies;

    if (dependenciesBlock && typeof dependenciesBlock === 'object') {
      // Loop target frameworks (e.g. net6.0, netstandard2.0)
      for (const frameworkDeps of Object.values(dependenciesBlock as Record<string, unknown>)) {
        if (!frameworkDeps || typeof frameworkDeps !== 'object') continue;

        for (const [pkgName, details] of Object.entries(frameworkDeps as Record<string, unknown>)) {
          if (!details || typeof details !== 'object') continue;
          const entry = details as { type?: string; resolved?: string };

          if (entry.resolved) {
            const version = entry.resolved.trim();
            const key = `${pkgName}@${version}`.toLowerCase();

            if (!uniqueSet.has(key)) {
              uniqueSet.add(key);
              packages.push({
                name: pkgName,
                version,
                ecosystem: 'NuGet',
                isDirect: entry.type?.toLowerCase() === 'direct',
                manifestPath: filePath,
                rawSpecifier: version,
                isExactVersion: true,
                specifierType: 'exact',
                resolvedFromLockfile: true,
              });
            }
          }
        }
      }
    }

    if (packages.length === 0 && content.trim().length > 0) {
      parseErrors.push('Failed to parse packages from packages.lock.json.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse packages.lock.json: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'NuGet',
    isLockfile: true,
    packages,
    parseErrors,
  };
}

/**
 * Parses .NET .csproj PackageReference elements
 */
export function parseCsProj(
  content: string,
  filePath: string
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const matches = content.matchAll(/<PackageReference\s+[^>]*Include=["']([^"']+)["'][^>]*Version=["']([^"']+)["'][^>]*>/gi);

    for (const match of matches) {
      const name = match[1].trim();
      const rawVersion = match[2].trim();
      const cleanVer = rawVersion.replace(/[\[\]()]/g, '').trim();
      const isExact = (rawVersion.startsWith('[') && rawVersion.endsWith(']') && !rawVersion.includes(',')) ||
        (/^[0-9]+\.[0-9]+/.test(rawVersion) && !rawVersion.includes('(') && !rawVersion.includes('[') && !rawVersion.includes('*'));

      packages.push({
        name,
        version: cleanVer,
        ecosystem: 'NuGet',
        isDirect: true,
        manifestPath: filePath,
        rawSpecifier: rawVersion,
        isExactVersion: isExact,
        specifierType: isExact ? 'exact' : 'range',
        resolvedFromLockfile: false,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse csproj file: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'NuGet',
    isLockfile: false,
    packages,
    parseErrors,
  };
}

export const parseNugetPackagesLock = parsePackagesLockJson;
export const parseCsproj = parseCsProj;
