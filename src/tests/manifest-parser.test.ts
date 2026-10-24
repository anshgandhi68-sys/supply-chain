import { describe, it, expect } from 'vitest';
import {
  parsePackageLockJson,
  parsePackageJson,
  classifyNpmSpecifier,
  reconcileWithLockfile,
} from '../lib/manifests/package-json';
import { parseYarnLock } from '../lib/manifests/yarn-lock';
import { parseRequirementsTxt } from '../lib/manifests/requirements';
import { parseGoMod } from '../lib/manifests/gomod';
import fs from 'fs';
import path from 'path';

describe('Dependency Manifest Parsers & Specifier Classification', () => {
  const fixturesDir = path.join(process.cwd(), 'src', 'fixtures');

  it('parses package-lock.json v2 with exact versions', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'sample-package-lock.json'), 'utf8');
    const result = parsePackageLockJson(content, 'package-lock.json');

    expect(result.isLockfile).toBe(true);
    expect(result.ecosystem).toBe('npm');
    expect(result.packages.length).toBe(3);

    const lodash = result.packages.find((p) => p.name === 'lodash');
    expect(lodash).toBeDefined();
    expect(lodash?.version).toBe('4.17.20');
    expect(lodash?.isExactVersion).toBe(true);
    expect(lodash?.resolvedFromLockfile).toBe(true);

    const axios = result.packages.find((p) => p.name === 'axios');
    expect(axios).toBeDefined();
    expect(axios?.version).toBe('0.21.1');
    expect(axios?.isExactVersion).toBe(true);
  });

  it('parses package.json manifests and distinguishes exact vs range specifiers', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'sample-package.json'), 'utf8');
    const result = parsePackageJson(content, 'package.json');

    expect(result.isLockfile).toBe(false);
    expect(result.packages.length).toBe(3);
    for (const pkg of result.packages) {
      expect(pkg.resolvedFromLockfile).toBe(false);
    }
  });

  it('accurately classifies exact versions, ranges, aliases, workspaces, and local links', () => {
    // Exact semver
    const exact = classifyNpmSpecifier('1.2.3');
    expect(exact.type).toBe('exact');
    expect(exact.isExact).toBe(true);
    expect(exact.cleanVersion).toBe('1.2.3');

    // Caret range
    const caret = classifyNpmSpecifier('^5.2.0');
    expect(caret.type).toBe('range');
    expect(caret.isExact).toBe(false);
    expect(caret.cleanVersion).toBe('5.2.0');

    // Tilde range
    const tilde = classifyNpmSpecifier('~1.2.0');
    expect(tilde.type).toBe('range');
    expect(tilde.isExact).toBe(false);
    expect(tilde.cleanVersion).toBe('1.2.0');

    // Inequality range
    const ineq = classifyNpmSpecifier('>=1.0.0 <2.0.0');
    expect(ineq.type).toBe('range');
    expect(ineq.isExact).toBe(false);

    // npm alias
    const alias = classifyNpmSpecifier('npm:eslint-plugin-react-hooks@^5.2.0');
    expect(alias.type).toBe('alias');
    expect(alias.realPackageName).toBe('eslint-plugin-react-hooks');
    expect(alias.isExact).toBe(false);
    expect(alias.cleanVersion).toBe('5.2.0');

    // Local link
    const link = classifyNpmSpecifier('link:./scripts/eslint-rules');
    expect(link.type).toBe('local_link');
    expect(link.isExact).toBe(false);

    // Workspace
    const ws = classifyNpmSpecifier('workspace:*');
    expect(ws.type).toBe('workspace');
    expect(ws.isExact).toBe(false);

    // Git dependency
    const git = classifyNpmSpecifier('git+https://github.com/foo/bar.git#v1.0.0');
    expect(git.type).toBe('git');
    expect(git.isExact).toBe(false);
  });

  it('parses yarn.lock v1 and extracts exact resolved versions', () => {
    const yarnV1 = [
      '# yarn lockfile v1',
      '',
      '"@babel/core@^7.11.1", "@babel/core@^7.0.0":',
      '  version "7.24.5"',
      '  resolved "https://registry.yarnpkg.com/@babel/core/-/core-7.24.5.tgz"',
      '',
      'body-parser@^2.3.0:',
      '  version "2.4.0"',
      '  resolved "https://registry.yarnpkg.com/body-parser/-/body-parser-2.4.0.tgz"',
      '',
      'undici@5.28.4:',
      '  version "5.28.4"',
      '  resolved "https://registry.yarnpkg.com/undici/-/undici-5.28.4.tgz"',
    ].join('\n');

    const result = parseYarnLock(yarnV1, 'yarn.lock');
    expect(result.isLockfile).toBe(true);
    expect(result.packages.length).toBe(3);

    const babel = result.packages.find((p) => p.name === '@babel/core');
    expect(babel).toBeDefined();
    expect(babel?.version).toBe('7.24.5');
    expect(babel?.isExactVersion).toBe(true);
    expect(babel?.resolvedFromLockfile).toBe(true);

    const bp = result.packages.find((p) => p.name === 'body-parser');
    expect(bp?.version).toBe('2.4.0');

    // Test resolution map
    expect(result.specifierResolutionMap.get('@babel/core@^7.11.1')).toBe('7.24.5');
    expect(result.specifierResolutionMap.get('body-parser@^2.3.0')).toBe('2.4.0');
  });

  it('parses yarn.lock v2+ (Yarn Berry) format and ignores metadata headers', () => {
    const yarnBerry = [
      '__metadata:',
      '  version: 6',
      '  cacheKey: 8',
      '',
      '"@babel/core@npm:^7.11.1, @babel/core@npm:^7.0.0":',
      '  version: 7.24.5',
      '  resolution: "@babel/core@npm:7.24.5"',
      '  dependencies:',
      '    "@babel/compat-data": "npm:^7.24.4"',
      '',
      '"lodash@npm:^4.17.20":',
      '  version: 4.17.21',
      '  resolution: "lodash@npm:4.17.21"',
    ].join('\n');

    const result = parseYarnLock(yarnBerry, 'yarn.lock');
    expect(result.isLockfile).toBe(true);
    expect(result.packages.length).toBe(2);

    // Ensure __metadata is not treated as a dependency package
    expect(result.packages.find((p) => p.name.includes('metadata'))).toBeUndefined();

    const lodash = result.packages.find((p) => p.name === 'lodash');
    expect(lodash).toBeDefined();
    expect(lodash?.version).toBe('4.17.21');
    expect(lodash?.isExactVersion).toBe(true);
    expect(lodash?.resolvedFromLockfile).toBe(true);

    const babel = result.packages.find((p) => p.name === '@babel/core');
    expect(babel).toBeDefined();
    expect(babel?.version).toBe('7.24.5');

    // Test Berry resolution map with @npm: prefix stripped
    expect(result.specifierResolutionMap.get('lodash@^4.17.20')).toBe('4.17.21');
    expect(result.specifierResolutionMap.get('@babel/core@^7.11.1')).toBe('7.24.5');
  });

  it('reconciles package.json declared dependencies with lockfile exact versions', () => {
    const pkgJsonText = JSON.stringify({
      dependencies: {
        'body-parser': '^2.3.0',
        'eslint-plugin-react-internal': 'link:./scripts/eslint-rules',
        'aliased-pkg': 'npm:target-pkg@^1.0.0',
      },
    });

    const parsedJson = parsePackageJson(pkgJsonText, 'package.json');
    expect(parsedJson.packages[0].isExactVersion).toBe(false);
    expect(parsedJson.packages[0].resolvedFromLockfile).toBe(false);

    const lockPackages = [
      {
        name: 'body-parser',
        version: '2.4.0',
        ecosystem: 'npm' as const,
        isDirect: true,
        manifestPath: 'package-lock.json',
        isExactVersion: true,
        resolvedFromLockfile: true,
      },
      {
        name: 'target-pkg',
        version: '1.2.0',
        ecosystem: 'npm' as const,
        isDirect: true,
        manifestPath: 'package-lock.json',
        isExactVersion: true,
        resolvedFromLockfile: true,
      },
    ];

    const reconciled = reconcileWithLockfile(parsedJson.packages, lockPackages);
    const bp = reconciled.find((p) => p.name === 'body-parser');
    expect(bp?.version).toBe('2.4.0');
    expect(bp?.isExactVersion).toBe(true);
    expect(bp?.resolvedFromLockfile).toBe(true);

    const localLink = reconciled.find((p) => p.name === 'eslint-plugin-react-internal');
    expect(localLink?.specifierType).toBe('local_link');
    expect(localLink?.isExactVersion).toBe(false);

    const aliased = reconciled.find((p) => p.name === 'aliased-pkg');
    expect(aliased?.version).toBe('1.2.0');
    expect(aliased?.resolvedFromLockfile).toBe(true);
  });

  it('parses Python requirements.txt with pinned and loose versions', () => {
    const reqText = [
      '# Dependencies',
      'requests==2.25.1',
      'urllib3>=1.26.4',
      'flask===2.0.1',
      'pytest',
    ].join('\n');

    const result = parseRequirementsTxt(reqText);
    expect(result.packages.length).toBe(3);

    const requestsPkg = result.packages.find((p) => p.name === 'requests');
    expect(requestsPkg?.version).toBe('2.25.1');
    expect(requestsPkg?.lineNumber).toBe(2);

    const flaskPkg = result.packages.find((p) => p.name === 'flask');
    expect(flaskPkg?.version).toBe('2.0.1');
    expect(flaskPkg?.lineNumber).toBe(4);
  });

  it('parses Go go.mod files', () => {
    const goModText = [
      'module example.com/myrepo',
      '',
      'go 1.21',
      '',
      'require (',
      '    github.com/gin-gonic/gin v1.7.0',
      '    golang.org/x/crypto v0.14.0 // indirect',
      ')',
      '',
      'require github.com/stretchr/testify v1.8.4',
    ].join('\n');

    const result = parseGoMod(goModText);
    expect(result.packages.length).toBe(3);

    const gin = result.packages.find((p) => p.name === 'github.com/gin-gonic/gin');
    expect(gin?.version).toBe('1.7.0');
    expect(gin?.isDirect).toBe(true);

    const crypto = result.packages.find((p) => p.name === 'golang.org/x/crypto');
    expect(crypto?.version).toBe('0.14.0');
    expect(crypto?.isDirect).toBe(false);
  });
});
