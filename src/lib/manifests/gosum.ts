/**
 * Go Manifest and Checksum Parser
 * Supports go.sum (exact resolved module versions) and go.mod (declared requirements)
 */

import { DependencyPackage, ParsedManifestResult } from '../types';

export function parseGoManifest(
  content: string,
  filePath: string = 'go.sum'
): ParsedManifestResult {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';

  if (fileName === 'go.mod') {
    return parseGoMod(content, filePath);
  }

  return parseGoSum(content, filePath);
}

/**
 * Parses Go go.sum file
 */
export function parseGoSum(
  content: string,
  filePath: string = 'go.sum'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];
  const uniqueSet = new Set<string>();

  try {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//')) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const modulePath = parts[0].trim();
        const rawVer = parts[1].trim();

        // Skip /go.mod hash lines (we only want module tree entries)
        if (rawVer.endsWith('/go.mod')) continue;

        const cleanVersion = rawVer.replace(/^v/, '');
        const key = `${modulePath}@${cleanVersion}`;

        if (!uniqueSet.has(key)) {
          uniqueSet.add(key);
          packages.push({
            name: modulePath,
            version: cleanVersion,
            ecosystem: 'Go',
            isDirect: true,
            manifestPath: filePath,
            rawSpecifier: rawVer,
            isExactVersion: true,
            specifierType: 'exact',
            resolvedFromLockfile: true,
          });
        }
      }
    }

    if (packages.length === 0 && content.trim().length > 0) {
      parseErrors.push('Failed to parse packages from go.sum.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse go.sum: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'Go',
    isLockfile: true,
    packages,
    parseErrors,
  };
}

/**
 * Parses Go go.mod file
 */
export function parseGoMod(
  content: string,
  filePath: string = 'go.mod'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const lines = content.split('\n');
    let inRequireBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//')) continue;

      if (line === 'require (') {
        inRequireBlock = true;
        continue;
      }

      if (inRequireBlock && line === ')') {
        inRequireBlock = false;
        continue;
      }

      // Single line require e.g. "require github.com/foo/bar v1.0.0"
      if (line.startsWith('require ') && !line.includes('(')) {
        const parts = line.replace('require ', '').trim().split(/\s+/);
        if (parts.length >= 2) {
          const mod = parts[0];
          const ver = parts[1].replace(/^v/, '');
          const isDirect = !line.includes('// indirect');

          packages.push({
            name: mod,
            version: ver,
            ecosystem: 'Go',
            isDirect,
            manifestPath: filePath,
            lineNumber: i + 1,
            rawSpecifier: parts[1],
            isExactVersion: true,
            specifierType: 'exact',
            resolvedFromLockfile: false,
          });
        }
        continue;
      }

      // Inside multiline require block
      if (inRequireBlock) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const mod = parts[0];
          const ver = parts[1].replace(/^v/, '');
          const isDirect = !line.includes('// indirect');

          packages.push({
            name: mod,
            version: ver,
            ecosystem: 'Go',
            isDirect,
            manifestPath: filePath,
            lineNumber: i + 1,
            rawSpecifier: parts[1],
            isExactVersion: true,
            specifierType: 'exact',
            resolvedFromLockfile: false,
          });
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse go.mod: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'Go',
    isLockfile: false,
    packages,
    parseErrors,
  };
}
