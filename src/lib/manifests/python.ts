/**
 * Comprehensive Python Manifest and Lockfile Parser
 * Supports requirements.txt, Pipfile.lock, poetry.lock, and pyproject.toml
 */

import { DependencyPackage, ParsedManifestResult } from '../types';

export function parsePythonManifest(
  content: string,
  filePath: string = 'requirements.txt'
): ParsedManifestResult {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';

  if (fileName === 'pipfile.lock') {
    return parsePipfileLock(content, filePath);
  }

  if (fileName === 'poetry.lock') {
    return parsePoetryLock(content, filePath);
  }

  if (fileName === 'pyproject.toml') {
    return parsePyprojectToml(content, filePath);
  }

  return parseRequirementsTxt(content, filePath);
}

/**
 * Parses Python requirements.txt format
 */
export function parseRequirementsTxt(
  content: string,
  filePath: string = 'requirements.txt'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;

    // Ignore options like -i, -r, -f, --extra-index-url
    if (rawLine.startsWith('-')) continue;

    // Strip inline comments, environment markers (; python_version > ...), and hashes
    const cleanLine = rawLine.split('#')[0].split(';')[0].split('--hash')[0].trim();
    if (!cleanLine) continue;

    // Check exact pin: package==1.2.3 or package===1.2.3
    const exactMatch = cleanLine.match(/^([a-zA-Z0-9_.-]+)\s*==={0,1}\s*([a-zA-Z0-9_.-]+)/);
    if (exactMatch) {
      packages.push({
        name: exactMatch[1].toLowerCase(),
        version: exactMatch[2],
        ecosystem: 'PyPI',
        isDirect: true,
        manifestPath: filePath,
        lineNumber: i + 1,
        rawSpecifier: `==${exactMatch[2]}`,
        isExactVersion: true,
        specifierType: 'exact',
        resolvedFromLockfile: false, // requirements.txt without pip-compile is declared
      });
      continue;
    }

    // Check range: >=, <=, ~=, >, <, !=
    const rangeMatch = cleanLine.match(/^([a-zA-Z0-9_.-]+)\s*([><=~!^]+.*)/);
    if (rangeMatch) {
      const name = rangeMatch[1].toLowerCase();
      const rawSpecifier = rangeMatch[2].trim();
      const versionCandidate = rawSpecifier.replace(/^[><=~!^ ]+/, '').split(',')[0].trim();

      packages.push({
        name,
        version: versionCandidate,
        ecosystem: 'PyPI',
        isDirect: true,
        manifestPath: filePath,
        lineNumber: i + 1,
        rawSpecifier,
        isExactVersion: false,
        specifierType: 'range',
        resolvedFromLockfile: false,
      });
      continue;
    }

    // Bare package name without version constraint
    const bareMatch = cleanLine.match(/^([a-zA-Z0-9_.-]+)$/);
    if (bareMatch) {
      packages.push({
        name: bareMatch[1].toLowerCase(),
        version: '*',
        ecosystem: 'PyPI',
        isDirect: true,
        manifestPath: filePath,
        lineNumber: i + 1,
        rawSpecifier: '*',
        isExactVersion: false,
        specifierType: 'range',
        resolvedFromLockfile: false,
      });
    }
  }

  return {
    manifestPath: filePath,
    ecosystem: 'PyPI',
    isLockfile: false,
    packages,
    parseErrors,
  };
}

/**
 * Parses Python Pipfile.lock (JSON format)
 */
export function parsePipfileLock(
  content: string,
  filePath: string = 'Pipfile.lock'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const json = JSON.parse(content);

    const extractFromGroup = (group: unknown, isDirect: boolean) => {
      if (!group || typeof group !== 'object') return;
      for (const [name, meta] of Object.entries(group as Record<string, unknown>)) {
        if (!meta || typeof meta !== 'object') continue;
        const entry = meta as { version?: string };
        if (entry.version) {
          const rawVer = entry.version;
          const cleanVer = rawVer.replace(/^==/, '').trim();
          packages.push({
            name: name.toLowerCase(),
            version: cleanVer,
            ecosystem: 'PyPI',
            isDirect,
            manifestPath: filePath,
            rawSpecifier: rawVer,
            isExactVersion: true,
            specifierType: 'exact',
            resolvedFromLockfile: true,
          });
        }
      }
    };

    extractFromGroup(json.default, true);
    extractFromGroup(json.develop, false);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse Pipfile.lock: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'PyPI',
    isLockfile: true,
    packages,
    parseErrors,
  };
}

/**
 * Parses Python poetry.lock (TOML format)
 */
export function parsePoetryLock(
  content: string,
  filePath: string = 'poetry.lock'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const blocks = content.split('[[package]]');

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const nameMatch = block.match(/name\s*=\s*["']([^"']+)["']/);
      const versionMatch = block.match(/version\s*=\s*["']([^"']+)["']/);
      const categoryMatch = block.match(/category\s*=\s*["']([^"']+)["']/);

      if (nameMatch && versionMatch) {
        const name = nameMatch[1].toLowerCase().trim();
        const version = versionMatch[1].trim();
        const isDirect = categoryMatch ? categoryMatch[1] === 'main' : true;

        packages.push({
          name,
          version,
          ecosystem: 'PyPI',
          isDirect,
          manifestPath: filePath,
          rawSpecifier: version,
          isExactVersion: true,
          specifierType: 'exact',
          resolvedFromLockfile: true,
        });
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse poetry.lock: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'PyPI',
    isLockfile: true,
    packages,
    parseErrors,
  };
}

/**
 * Parses Python pyproject.toml declared dependencies
 */
export function parsePyprojectToml(
  content: string,
  filePath: string = 'pyproject.toml'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const lines = content.split('\n');
    let inArrayDeps = false;
    let inTableDeps = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('[')) {
        inTableDeps =
          line.includes('tool.poetry.dependencies') ||
          line.includes('project.dependencies');
        inArrayDeps = false;
        continue;
      }

      if (line.includes('dependencies = [') || line === 'dependencies=[' || (line.startsWith('dependencies') && line.includes('['))) {
        inArrayDeps = true;
        continue;
      }

      if (inArrayDeps) {
        if (line.startsWith(']')) {
          inArrayDeps = false;
          continue;
        }

        const itemMatch = line.match(/^["']([^"']+)["']/);
        if (itemMatch) {
          const spec = itemMatch[1].trim();
          const depMatch = spec.match(/^([a-zA-Z0-9_.-]+)\s*([<>=!~].*)?$/);
          if (depMatch) {
            const name = depMatch[1].toLowerCase();
            const rawVer = (depMatch[2] || '').trim();
            const isExact = /^===?[0-9]/.test(rawVer);
            const cleanVer = rawVer ? rawVer.replace(/^[><=~!^ ]+/, '') : '*';

            packages.push({
              name,
              version: cleanVer,
              ecosystem: 'PyPI',
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
        continue;
      }

      if (inTableDeps) {
        // e.g. requests = "^2.25.1" or "requests >= 2.25.1"
        const kvMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*["']([^"']+)["']/);
        if (kvMatch && kvMatch[1].toLowerCase() !== 'python') {
          const name = kvMatch[1].toLowerCase();
          const spec = kvMatch[2];
          const isExact = /^===?[0-9]/.test(spec) || /^[0-9]+\.[0-9]+\.[0-9]+$/.test(spec);

          packages.push({
            name,
            version: spec.replace(/^[><=~!^ ]+/, ''),
            ecosystem: 'PyPI',
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
    parseErrors.push(`Failed to parse pyproject.toml: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'PyPI',
    isLockfile: false,
    packages,
    parseErrors,
  };
}
