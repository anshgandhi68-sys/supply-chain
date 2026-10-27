/**
 * Parser for npm package.json and package-lock.json (v1, v2, and v3)
 * Rigorously classifies declared specifiers (exact, ranges, aliases, workspaces, local links)
 * and distinguishes exact locked versions from unverified ranges.
 */

import { DependencyPackage, DependencySpecifierType, ParsedManifestResult } from '../types';

export interface SpecifierClassification {
  type: DependencySpecifierType;
  isExact: boolean;
  cleanVersion: string;
  realPackageName?: string;
}

/**
 * Classifies npm version specifiers safely:
 * - Exact: e.g. "1.2.3", "v1.2.3", "=1.2.3"
 * - Ranges: e.g. "^5.2.0", "~1.2.0", ">=1.0.0", "*", "latest"
 * - Aliases: e.g. "npm:target-pkg@^1.2.3"
 * - Local links: e.g. "link:./local-path", "file:../foo"
 * - Workspaces: e.g. "workspace:*", "workspace:^1.0.0"
 * - Git: e.g. "git+https://...", "github:org/repo"
 */
export function classifyNpmSpecifier(spec: string): SpecifierClassification {
  const trimmed = spec.trim();

  // Local file / link dependencies (internal code, NOT registry packages)
  if (
    trimmed.startsWith('link:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/')
  ) {
    return {
      type: 'local_link',
      isExact: false,
      cleanVersion: trimmed,
    };
  }

  // Monorepo workspaces
  if (trimmed.startsWith('workspace:')) {
    return {
      type: 'workspace',
      isExact: false,
      cleanVersion: trimmed,
    };
  }

  // Git URLs and repositories
  if (
    trimmed.startsWith('git:') ||
    trimmed.startsWith('git+') ||
    trimmed.startsWith('github:') ||
    trimmed.includes('.git') ||
    (trimmed.includes('://') && !trimmed.startsWith('npm:'))
  ) {
    return {
      type: 'git',
      isExact: false,
      cleanVersion: trimmed,
    };
  }

  // npm: package aliases, e.g. "npm:eslint-plugin-react-hooks@^5.2.0"
  if (trimmed.startsWith('npm:')) {
    const aliasContent = trimmed.slice(4).trim();
    const lastAt = aliasContent.lastIndexOf('@');
    if (lastAt > 0) {
      const realPackageName = aliasContent.slice(0, lastAt);
      const targetSpec = aliasContent.slice(lastAt + 1);
      const sub = classifyNpmSpecifier(targetSpec);
      return {
        type: 'alias',
        isExact: sub.isExact,
        cleanVersion: sub.cleanVersion,
        realPackageName,
      };
    } else {
      return {
        type: 'alias',
        isExact: false,
        cleanVersion: aliasContent,
        realPackageName: aliasContent,
      };
    }
  }

  // Exact semver: 1.2.3 or 1.2.3-alpha.1
  const exactRegex = /^[=v]?\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;
  const exactMatch = trimmed.match(exactRegex);
  if (exactMatch) {
    return {
      type: 'exact',
      isExact: true,
      cleanVersion: exactMatch[1],
    };
  }

  // Declared range (caret, tilde, inequality, wildcard)
  const cleanVersion = trimmed.replace(/^[~^=v><\s]+/, '').split(/\s+/)[0] || trimmed;
  return {
    type: 'range',
    isExact: false,
    cleanVersion,
  };
}

export function parsePackageLockJson(
  content: string,
  filePath: string = 'package-lock.json'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const data = JSON.parse(content);

    // v2/v3 package-lock format
    if (data.packages && typeof data.packages === 'object') {
      const rootPkg = data.packages[''] || {};
      const directDepNames = new Set<string>([
        ...Object.keys(rootPkg.dependencies || {}),
        ...Object.keys(rootPkg.devDependencies || {}),
        ...Object.keys(rootPkg.optionalDependencies || {}),
        ...Object.keys(rootPkg.peerDependencies || {}),
      ]);
      const hasRootMetadata = Boolean(rootPkg.dependencies || rootPkg.devDependencies || rootPkg.optionalDependencies);

      for (const [key, pkg] of Object.entries<any>(data.packages)) {
        if (!key || key === '') continue; // root project itself
        
        let name = pkg.name;
        if (!name) {
          const lastIdx = key.lastIndexOf('node_modules/');
          name = lastIdx !== -1 ? key.slice(lastIdx + 'node_modules/'.length) : key;
        }
        const version = pkg.version;

        if (name && version && typeof version === 'string') {
          // If root declared dependencies exist in lockfile, determine isDirect strictly from root dependencies.
          // Otherwise, fall back to checking if key is a shallow node_modules/ path without nested node_modules.
          const isDirect = hasRootMetadata
            ? directDepNames.has(name)
            : !key.includes('node_modules/', 13);
          const deps = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : undefined;
          const isDev = Boolean(pkg.dev);

          packages.push({
            name,
            version: version.trim(),
            ecosystem: 'npm',
            isDirect,
            manifestPath: filePath,
            rawSpecifier: version.trim(),
            isExactVersion: true,
            specifierType: 'exact',
            resolvedFromLockfile: true,
            dependencies: deps,
            dev: isDev,
            dependencyScope: isDev ? 'development' : 'production',
          });
        }
      }
    }
    // Fallback or v1 format
    else if (data.dependencies && typeof data.dependencies === 'object') {
      const traverseV1 = (deps: Record<string, any>, isDirect: boolean = true) => {
        for (const [name, info] of Object.entries(deps)) {
          if (info && typeof info.version === 'string') {
            const childDeps = info.dependencies && typeof info.dependencies === 'object'
              ? Object.fromEntries(Object.entries(info.dependencies).map(([k, v]: [string, any]) => [k, v?.version || '*']))
              : undefined;
            const isDev = Boolean(info.dev);

            packages.push({
              name,
              version: info.version.trim(),
              ecosystem: 'npm',
              isDirect,
              manifestPath: filePath,
              rawSpecifier: info.version.trim(),
              isExactVersion: true,
              specifierType: 'exact',
              resolvedFromLockfile: true,
              dependencies: childDeps,
              dev: isDev,
              dependencyScope: isDev ? 'development' : 'production',
            });
          }
          if (info && info.dependencies && typeof info.dependencies === 'object') {
            traverseV1(info.dependencies, false);
          }
        }
      };
      traverseV1(data.dependencies);
    } else {
      parseErrors.push('Unrecognized package-lock.json structure: missing packages or dependencies table.');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse package-lock.json: ${msg}`);
  }

  // Deduplicate by name and version
  const uniqueMap = new Map<string, DependencyPackage>();
  for (const pkg of packages) {
    const key = `${pkg.name}@${pkg.version}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, pkg);
    }
  }

  return {
    manifestPath: filePath,
    ecosystem: 'npm',
    isLockfile: true,
    packages: Array.from(uniqueMap.values()),
    parseErrors,
  };
}

export function parsePackageJson(
  content: string,
  filePath: string = 'package.json'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    const data = JSON.parse(content);
    const sections = [
      { key: 'dependencies', isDirect: true },
      { key: 'devDependencies', isDirect: true },
      { key: 'optionalDependencies', isDirect: false },
    ];

    for (const { key, isDirect } of sections) {
      if (data[key] && typeof data[key] === 'object') {
        for (const [declaredName, rawSpecifier] of Object.entries(data[key])) {
          if (typeof rawSpecifier === 'string') {
            const classification = classifyNpmSpecifier(rawSpecifier);

            packages.push({
              name: declaredName,
              version: classification.cleanVersion,
              ecosystem: 'npm',
              isDirect,
              manifestPath: filePath,
              rawSpecifier,
              isExactVersion: classification.isExact,
              specifierType: classification.type,
              resolvedFromLockfile: false,
              resolvedPackageName: classification.realPackageName,
            });
          }
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse package.json: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'npm',
    isLockfile: false,
    packages,
    parseErrors,
  };
}

/**
 * Reconciles declared dependencies from package.json with exact locked versions
 * from package-lock.json or yarn.lock.
 */
export function reconcileWithLockfile(
  declaredPackages: DependencyPackage[],
  lockfilePackages: DependencyPackage[],
  yarnSpecifierMap?: Map<string, string>
): DependencyPackage[] {
  // Build lookup map from lockfile: name -> lockfile package objects
  const lockfileMap = new Map<string, DependencyPackage[]>();
  for (const lp of lockfilePackages) {
    const existing = lockfileMap.get(lp.name) || [];
    existing.push(lp);
    lockfileMap.set(lp.name, existing);
  }

  const directNames = new Set<string>();

  const reconciledDirect = declaredPackages.map((dp) => {
    directNames.add(dp.name);

    // If it's a local link or workspace, preserve as-is (not from lockfile)
    if (dp.specifierType === 'local_link' || dp.specifierType === 'workspace') {
      return dp;
    }

    const queryName = dp.resolvedPackageName || dp.name;

    // Check Yarn specifier map first if available (exact specifier match)
    if (yarnSpecifierMap) {
      const specKey = `${queryName}@${dp.rawSpecifier}`;
      const resolved = yarnSpecifierMap.get(specKey) || yarnSpecifierMap.get(queryName);
      if (resolved) {
        return {
          ...dp,
          version: resolved,
          isExactVersion: true,
          resolvedFromLockfile: true,
        };
      }
    }

    // Check package-lock map
    const lockedPkgs = lockfileMap.get(queryName);
    if (lockedPkgs && lockedPkgs.length > 0) {
      const match = lockedPkgs[0];
      return {
        ...dp,
        version: match.version,
        isExactVersion: true,
        resolvedFromLockfile: true,
        dependencies: match.dependencies,
        dependencyScope: dp.dependencyScope || match.dependencyScope,
      };
    }

    return dp;
  });

  // Include transitive packages from the lockfile that were not directly declared in package.json
  const transitivePackages: DependencyPackage[] = [];
  for (const lp of lockfilePackages) {
    if (!directNames.has(lp.name)) {
      transitivePackages.push({
        ...lp,
        isDirect: false,
      });
    }
  }

  return [...reconciledDirect, ...transitivePackages];
}
