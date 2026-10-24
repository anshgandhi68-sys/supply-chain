/**
 * PHP Composer Manifest and Lockfile Parser
 * Supports composer.lock (exact resolved versions) and composer.json (declared dependencies)
 */

import { DependencyPackage, ParsedManifestResult } from '../types';

export function parseComposerManifest(
  content: string,
  filePath: string = 'composer.lock'
): ParsedManifestResult {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';

  if (fileName === 'composer.json') {
    return parseComposerJson(content, filePath);
  }

  return parseComposerLock(content, filePath);
}

/**
 * Parses PHP composer.lock
 */
export function parseComposerLock(
  content: string,
  filePath: string = 'composer.lock'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const json = JSON.parse(content);

    const extractPackages = (list: unknown, isDirect: boolean) => {
      if (!Array.isArray(list)) return;
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const entry = item as { name?: string; version?: string };
        if (entry.name && entry.version) {
          // Strip "v" prefix if present for clean semver (e.g. "v1.2.3" -> "1.2.3")
          const cleanVersion = entry.version.replace(/^v/i, '').trim();
          packages.push({
            name: entry.name.toLowerCase(),
            version: cleanVersion,
            ecosystem: 'Packagist',
            isDirect,
            manifestPath: filePath,
            rawSpecifier: entry.version,
            isExactVersion: true,
            specifierType: 'exact',
            resolvedFromLockfile: true,
          });
        }
      }
    };

    extractPackages(json.packages, true);
    extractPackages(json['packages-dev'], false);

    if (packages.length === 0 && content.trim().length > 0) {
      parseErrors.push('Failed to parse packages from composer.lock.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse composer.lock: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'Packagist',
    isLockfile: true,
    packages,
    parseErrors,
  };
}

/**
 * Parses PHP composer.json declared dependencies
 */
export function parseComposerJson(
  content: string,
  filePath: string = 'composer.json'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const json = JSON.parse(content);

    const extractDeps = (depsObj: unknown, isDirect: boolean) => {
      if (!depsObj || typeof depsObj !== 'object') return;
      for (const [name, spec] of Object.entries(depsObj as Record<string, unknown>)) {
        if (name === 'php' || typeof spec !== 'string') continue;
        const cleanVer = (spec as string).replace(/^[><=~!^ ]+/, '').replace(/^v/i, '').trim();
        const isExact = /^[0-9]+\.[0-9]+(\.[0-9]+)?$/.test(spec.trim());

        packages.push({
          name: name.toLowerCase(),
          version: cleanVer,
          ecosystem: 'Packagist',
          isDirect,
          manifestPath: filePath,
          rawSpecifier: spec,
          isExactVersion: isExact,
          specifierType: isExact ? 'exact' : 'range',
          resolvedFromLockfile: false,
        });
      }
    };

    extractDeps(json.require, true);
    extractDeps(json['require-dev'], false);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse composer.json: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'Packagist',
    isLockfile: false,
    packages,
    parseErrors,
  };
}
