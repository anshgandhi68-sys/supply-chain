/**
 * Parser for Yarn lockfiles (supporting Yarn v1 Classic and Yarn v2+ Berry formats)
 * Resolves exact installed versions of dependencies.
 */

import { DependencyPackage, ParsedManifestResult } from '../types';

export interface ParsedYarnLockResult extends ParsedManifestResult {
  // Map of "packageName@declaredSpecifier" -> resolved exact version
  specifierResolutionMap: Map<string, string>;
}

export function parseYarnLock(
  content: string,
  filePath: string = 'yarn.lock'
): ParsedYarnLockResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];
  const uniqueMap = new Map<string, DependencyPackage>();
  const specifierResolutionMap = new Map<string, string>();

  try {
    const lines = content.split('\n');
    let currentSpecifiers: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('#')) continue;

      // Header line declaring package specifiers, e.g.:
      // "@babel/code-frame@^7.0.0", "@babel/code-frame@^7.8.3":
      // or "react@npm:^18.0.0":
      // Header lines in Yarn lockfiles start without leading whitespace and end with ':'
      if (!line.startsWith(' ') && !line.startsWith('\t') && line.includes(':')) {
        const colonIdx = line.lastIndexOf(':');
        const header = line.slice(0, colonIdx).trim();
        // Split comma-separated specifiers
        currentSpecifiers = header
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s) => s.length > 0);
      } else if (currentSpecifiers.length > 0) {
        // Look for the version field under the current specifiers block
        // e.g. '  version "7.8.3"' or '  version: 7.8.3'
        const vMatch = line.match(/^\s+version(?::|\s)\s*["']?([^"'\s]+)["']?/);
        if (vMatch) {
          const resolvedVersion = vMatch[1].trim();

          for (const spec of currentSpecifiers) {
            // Clean specifier: remove protocol wrappers (e.g. @npm: or npm:)
            let cleanSpec = spec.replace(/@npm:/, '@').replace(/^npm:/, '');

            // For scoped packages like @babel/core@^7.0.0, find the last '@'
            const lastAt = cleanSpec.lastIndexOf('@');
            if (lastAt > 0) {
              const name = cleanSpec.slice(0, lastAt).replace(/^["']|["']$/g, '');
              const declaredRange = cleanSpec.slice(lastAt + 1).replace(/^["']|["']$/g, '');

              // Map declared specifier to resolved version
              specifierResolutionMap.set(`${name}@${declaredRange}`, resolvedVersion);
              specifierResolutionMap.set(name, resolvedVersion);

              const pkgKey = `${name}@${resolvedVersion}`;
              if (!uniqueMap.has(pkgKey)) {
                const pkg: DependencyPackage = {
                  name,
                  version: resolvedVersion,
                  ecosystem: 'npm',
                  isDirect: true,
                  manifestPath: filePath,
                  rawSpecifier: declaredRange,
                  isExactVersion: true,
                  specifierType: 'exact',
                  resolvedFromLockfile: true,
                };
                uniqueMap.set(pkgKey, pkg);
                packages.push(pkg);
              }
            }
          }
          currentSpecifiers = [];
        }
      }
    }

    if (packages.length === 0 && content.trim().length > 0) {
      parseErrors.push('Failed to parse any packages from yarn.lock. Verify file format.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Error parsing yarn.lock: ${msg}`);
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
