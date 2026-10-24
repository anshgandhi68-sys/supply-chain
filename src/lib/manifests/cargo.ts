/**
 * Rust Manifest and Lockfile Parser
 * Supports Cargo.lock (exact resolved versions) and Cargo.toml (declared dependencies)
 */

import { DependencyPackage, ParsedManifestResult } from '../types';

export function parseCargoManifest(
  content: string,
  filePath: string = 'Cargo.lock'
): ParsedManifestResult {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';

  if (fileName === 'cargo.toml') {
    return parseCargoToml(content, filePath);
  }

  return parseCargoLock(content, filePath);
}

/**
 * Parses Rust Cargo.lock
 */
export function parseCargoLock(
  content: string,
  filePath: string = 'Cargo.lock'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];
  const uniqueSet = new Set<string>();

  try {
    const blocks = content.split('[[package]]');

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const nameMatch = block.match(/name\s*=\s*["']([^"']+)["']/);
      const versionMatch = block.match(/version\s*=\s*["']([^"']+)["']/);
      const sourceMatch = block.match(/source\s*=\s*["']([^"']+)["']/);

      if (nameMatch && versionMatch) {
        const name = nameMatch[1].trim();
        const version = versionMatch[1].trim();
        const source = sourceMatch ? sourceMatch[1] : '';

        // Exclude root workspace members if source is not set or local
        const isRegistryPkg = source.includes('registry+') || source.includes('crates.io');
        const key = `${name}@${version}`;

        if (!uniqueSet.has(key)) {
          uniqueSet.add(key);
          packages.push({
            name,
            version,
            ecosystem: 'crates.io',
            isDirect: isRegistryPkg,
            manifestPath: filePath,
            rawSpecifier: version,
            isExactVersion: true,
            specifierType: 'exact',
            resolvedFromLockfile: true,
          });
        }
      }
    }

    if (packages.length === 0 && content.trim().length > 0) {
      parseErrors.push('Failed to parse any packages from Cargo.lock.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse Cargo.lock: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'crates.io',
    isLockfile: true,
    packages,
    parseErrors,
  };
}

/**
 * Parses Rust Cargo.toml declared dependencies
 */
export function parseCargoToml(
  content: string,
  filePath: string = 'Cargo.toml'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const lines = content.split('\n');
    let inDepsSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('[')) {
        inDepsSection =
          line.includes('[dependencies') ||
          line.includes('[dev-dependencies') ||
          line.includes('[build-dependencies') ||
          line.includes('[workspace.dependencies');
        continue;
      }

      if (inDepsSection) {
        // e.g. serde = "1.0.104" or serde = { version = "1.0.104", features = ["derive"] }
        const simpleMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*["']([^"']+)["']/);
        if (simpleMatch) {
          const name = simpleMatch[1];
          const spec = simpleMatch[2];
          const isExact = /^[0-9]+\.[0-9]+\.[0-9]+$/.test(spec) && !spec.startsWith('^') && !spec.startsWith('~');

          packages.push({
            name,
            version: spec.replace(/^[><=~!^ ]+/, ''),
            ecosystem: 'crates.io',
            isDirect: true,
            manifestPath: filePath,
            lineNumber: i + 1,
            rawSpecifier: spec,
            isExactVersion: isExact,
            specifierType: isExact ? 'exact' : 'range',
            resolvedFromLockfile: false,
          });
          continue;
        }

        const inlineTableMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*\{.*version\s*=\s*["']([^"']+)["']/);
        if (inlineTableMatch) {
          const name = inlineTableMatch[1];
          const spec = inlineTableMatch[2];
          const isExact = /^[0-9]+\.[0-9]+\.[0-9]+$/.test(spec) && !spec.startsWith('^') && !spec.startsWith('~');

          packages.push({
            name,
            version: spec.replace(/^[><=~!^ ]+/, ''),
            ecosystem: 'crates.io',
            isDirect: true,
            manifestPath: filePath,
            lineNumber: i + 1,
            rawSpecifier: spec,
            isExactVersion: isExact,
            specifierType: isExact ? 'exact' : 'range',
            resolvedFromLockfile: false,
          });
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse Cargo.toml: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'crates.io',
    isLockfile: false,
    packages,
    parseErrors,
  };
}
