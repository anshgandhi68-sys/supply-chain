/**
 * Parser for pnpm lockfiles (pnpm-lock.yaml v5, v6, and v9)
 * Uses deterministic YAML parsing to extract exact resolved package versions.
 */

import { parse as parseYaml } from 'yaml';
import { DependencyPackage, ParsedManifestResult } from '../types';

export interface ParsedPnpmLockResult extends ParsedManifestResult {
  specifierResolutionMap: Map<string, string>;
}

export function parsePnpmLock(
  content: string,
  filePath: string = 'pnpm-lock.yaml'
): ParsedPnpmLockResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];
  const uniqueMap = new Map<string, DependencyPackage>();
  const specifierResolutionMap = new Map<string, string>();

  try {
    const doc = parseYaml(content);
    if (!doc || typeof doc !== 'object') {
      return {
        manifestPath: filePath,
        ecosystem: 'npm',
        isLockfile: true,
        packages: [],
        parseErrors: ['Invalid pnpm-lock.yaml content'],
        specifierResolutionMap,
      };
    }

    // 1. Process root and importer declared dependencies to populate specifierResolutionMap
    const processDepsBlock = (depsObj: unknown, isDirect: boolean = true) => {
      if (!depsObj || typeof depsObj !== 'object') return;
      for (const [name, val] of Object.entries(depsObj as Record<string, unknown>)) {
        if (!val) continue;
        let versionStr: string | undefined;
        let specifier: string | undefined;

        if (typeof val === 'string') {
          versionStr = val;
        } else if (typeof val === 'object' && val !== null) {
          const entry = val as { version?: string; specifier?: string };
          versionStr = entry.version;
          specifier = entry.specifier;
        }

        if (versionStr) {
          // Clean version string (e.g. "4.18.2(peer@1.0)" -> "4.18.2")
          const cleanVer = versionStr.split('(')[0].replace(/^[\^~>=<]+/, '').trim();
          if (specifier) {
            specifierResolutionMap.set(`${name}@${specifier}`, cleanVer);
          }
          specifierResolutionMap.set(name, cleanVer);
        }
      }
    };

    // pnpm v5/v6 root dependencies
    processDepsBlock(doc.dependencies, true);
    processDepsBlock(doc.devDependencies, true);

    // pnpm v6/v9 importers block
    if (doc.importers && typeof doc.importers === 'object') {
      for (const importer of Object.values(doc.importers as Record<string, unknown>)) {
        if (importer && typeof importer === 'object') {
          const imp = importer as { dependencies?: unknown; devDependencies?: unknown };
          processDepsBlock(imp.dependencies, true);
          processDepsBlock(imp.devDependencies, true);
        }
      }
    }

    // 2. Process packages block containing all exact resolved dependencies
    const packagesBlock = doc.packages;
    if (packagesBlock && typeof packagesBlock === 'object') {
      for (const [rawKey, entry] of Object.entries(packagesBlock as Record<string, unknown>)) {
        // rawKey can be "/express@4.18.2" or "express@4.18.2" or "@babel/core@7.24.5(peer@1.0)"
        let cleanKey = rawKey.replace(/^\//, '').split('(')[0].trim();

        let name = '';
        let version = '';

        // For scoped packages like @babel/core@7.24.5, find last '@'
        const lastAt = cleanKey.lastIndexOf('@');
        if (lastAt > 0) {
          name = cleanKey.slice(0, lastAt);
          version = cleanKey.slice(lastAt + 1);
        } else if (cleanKey.includes('/')) {
          // pnpm v5 format: name/version or @scope/name/version
          if (cleanKey.startsWith('@')) {
            const parts = cleanKey.split('/');
            if (parts.length >= 3) {
              name = `${parts[0]}/${parts[1]}`;
              version = parts.slice(2).join('/');
            }
          } else {
            const parts = cleanKey.split('/');
            name = parts[0];
            version = parts.slice(1).join('/');
          }
        }

        if (name && version && !uniqueMap.has(`${name}@${version}`)) {
          const isDirect = specifierResolutionMap.has(name);
          const pkg: DependencyPackage = {
            name,
            version,
            ecosystem: 'npm',
            isDirect,
            manifestPath: filePath,
            isExactVersion: true,
            specifierType: 'exact',
            resolvedFromLockfile: true,
          };

          uniqueMap.set(`${name}@${version}`, pkg);
          packages.push(pkg);
        }
      }
    }

    if (packages.length === 0 && content.trim().length > 0) {
      parseErrors.push('Failed to parse packages from pnpm-lock.yaml.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Error parsing pnpm-lock.yaml: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'npm',
    isLockfile: true,
    packages,
    parseErrors,
    specifierResolutionMap,
  };
}
