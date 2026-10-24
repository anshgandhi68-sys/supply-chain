/**
 * Ruby Bundler Manifest and Lockfile Parser
 * Supports Gemfile.lock (exact resolved versions) and Gemfile (declared dependencies)
 */

import { DependencyPackage, ParsedManifestResult } from '../types';

export function parseRubyManifest(
  content: string,
  filePath: string = 'Gemfile.lock'
): ParsedManifestResult {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';

  if (fileName === 'gemfile') {
    return parseGemfile(content, filePath);
  }

  return parseGemfileLock(content, filePath);
}

/**
 * Parses Ruby Gemfile.lock (Bundler format)
 */
export function parseGemfileLock(
  content: string,
  filePath: string = 'Gemfile.lock'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];
  const uniqueSet = new Set<string>();

  try {
    const lines = content.split('\n');
    let inSpecsSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim() === 'specs:') {
        inSpecsSection = true;
        continue;
      }

      // Exit specs section on empty line or new uppercase header (PLATFORMS, DEPENDENCIES, etc.)
      if (inSpecsSection && (/^[A-Z]/.test(line.trim()) || line.trim() === '')) {
        inSpecsSection = false;
        continue;
      }

      if (inSpecsSection) {
        // Direct gem spec lines have exactly 4 spaces indentation: e.g. "    rails (7.0.4)"
        // Sub-dependencies have 6 spaces: "      actionpack (= 7.0.4)"
        const match = line.match(/^\s{4}([a-zA-Z0-9_.-]+)\s*\(([^)]+)\)/);
        if (match) {
          const name = match[1].toLowerCase().trim();
          const version = match[2].trim();
          const key = `${name}@${version}`;

          if (!uniqueSet.has(key)) {
            uniqueSet.add(key);
            packages.push({
              name,
              version,
              ecosystem: 'RubyGems',
              isDirect: true,
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

    if (packages.length === 0 && content.trim().length > 0) {
      parseErrors.push('Failed to parse packages from Gemfile.lock.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse Gemfile.lock: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'RubyGems',
    isLockfile: true,
    packages,
    parseErrors,
  };
}

/**
 * Parses Ruby Gemfile declared dependencies
 */
export function parseGemfile(
  content: string,
  filePath: string = 'Gemfile'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      // Match gem "name", "~> 7.0.4" or gem 'name', '>= 1.2' or gem 'name'
      const gemMatch = line.match(/^gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
      if (gemMatch) {
        const name = gemMatch[1].toLowerCase().trim();
        const spec = gemMatch[2]?.trim() || '*';
        const isExact = /^[0-9]+\.[0-9]+(\.[0-9]+)?$/.test(spec);

        packages.push({
          name,
          version: spec.replace(/^[><=~!^ ]+/, ''),
          ecosystem: 'RubyGems',
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse Gemfile: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'RubyGems',
    isLockfile: false,
    packages,
    parseErrors,
  };
}
