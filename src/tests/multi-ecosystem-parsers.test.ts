import { describe, it, expect } from 'vitest';
import { parsePnpmLock } from '../lib/manifests/pnpm-lock';
import {
  parsePipfileLock,
  parsePoetryLock,
  parsePyprojectToml,
} from '../lib/manifests/python';
import { parseCargoLock, parseCargoToml } from '../lib/manifests/cargo';
import { parseComposerLock, parseComposerJson } from '../lib/manifests/composer';
import { parseGemfileLock, parseGemfile } from '../lib/manifests/ruby';
import { parsePomXml } from '../lib/manifests/maven';
import { parseNugetPackagesLock, parseCsproj } from '../lib/manifests/nuget';
import { parseGoSum } from '../lib/manifests/gosum';
import { detectAndParseManifest } from '../lib/manifests';

describe('Multi-Ecosystem Manifest & Lockfile Parsers', () => {
  describe('pnpm-lock.yaml parser', () => {
    it('parses pnpm lockfile v6/v9 format', () => {
      const pnpmLockV6 = `
lockfileVersion: '6.0'
settings:
  autoInstallPeers: true
packages:
  /@babel/core@7.24.0:
    resolution: {integrity: sha512-something}
    dependencies:
      semver: 7.6.0
  /lodash@4.17.21:
    resolution: {integrity: sha512-somethingelse}
`;
      const result = parsePnpmLock(pnpmLockV6, 'pnpm-lock.yaml');
      expect(result.isLockfile).toBe(true);
      expect(result.ecosystem).toBe('npm');
      expect(result.packages.length).toBe(2);

      const babel = result.packages.find((p) => p.name === '@babel/core');
      expect(babel).toBeDefined();
      expect(babel?.version).toBe('7.24.0');
      expect(babel?.isExactVersion).toBe(true);
      expect(babel?.resolvedFromLockfile).toBe(true);

      const lodash = result.packages.find((p) => p.name === 'lodash');
      expect(lodash).toBeDefined();
      expect(lodash?.version).toBe('4.17.21');
    });

    it('parses pnpm lockfile v5 format', () => {
      const pnpmLockV5 = `
lockfileVersion: 5.4
specifiers:
  express: ^4.18.2
packages:
  /express/4.18.2:
    resolution: {integrity: sha512-express}
`;
      const result = parsePnpmLock(pnpmLockV5, 'pnpm-lock.yaml');
      expect(result.packages.length).toBe(1);
      expect(result.packages[0].name).toBe('express');
      expect(result.packages[0].version).toBe('4.18.2');
    });
  });

  describe('Python parsers', () => {
    it('parses Pipfile.lock with exact versions', () => {
      const pipfileLock = JSON.stringify({
        _meta: { hash: { sha256: 'abc' } },
        default: {
          requests: { version: '==2.31.0', hashes: ['sha256:...'] },
          urllib3: { version: '==2.0.7' },
        },
        develop: {
          pytest: { version: '==7.4.3' },
        },
      });

      const result = parsePipfileLock(pipfileLock, 'Pipfile.lock');
      expect(result.isLockfile).toBe(true);
      expect(result.ecosystem).toBe('PyPI');
      expect(result.packages.length).toBe(3);

      const requests = result.packages.find((p) => p.name === 'requests');
      expect(requests?.version).toBe('2.31.0');
      expect(requests?.isExactVersion).toBe(true);

      const pytest = result.packages.find((p) => p.name === 'pytest');
      expect(pytest?.version).toBe('7.4.3');
    });

    it('parses poetry.lock with package declarations', () => {
      const poetryLock = `
[[package]]
name = "flask"
version = "3.0.0"
description = "A simple framework"
category = "main"

[[package]]
name = "jinja2"
version = "3.1.2"
category = "main"
`;
      const result = parsePoetryLock(poetryLock, 'poetry.lock');
      expect(result.isLockfile).toBe(true);
      expect(result.ecosystem).toBe('PyPI');
      expect(result.packages.length).toBe(2);

      const flask = result.packages.find((p) => p.name === 'flask');
      expect(flask?.version).toBe('3.0.0');
      expect(flask?.isExactVersion).toBe(true);
    });

    it('parses pyproject.toml dependencies as non-lockfile specifiers', () => {
      const pyproject = `
[project]
name = "my-project"
dependencies = [
    "httpx>=0.25.0",
    "pydantic~=2.5.0",
    "black==23.11.0"
]
`;
      const result = parsePyprojectToml(pyproject, 'pyproject.toml');
      expect(result.isLockfile).toBe(false);
      expect(result.ecosystem).toBe('PyPI');
      expect(result.packages.length).toBe(3);

      const httpx = result.packages.find((p) => p.name === 'httpx');
      expect(httpx?.isExactVersion).toBe(false);

      const black = result.packages.find((p) => p.name === 'black');
      expect(black?.isExactVersion).toBe(true);
      expect(black?.version).toBe('23.11.0');
    });
  });

  describe('Rust parsers', () => {
    it('parses Cargo.lock with exact crate versions', () => {
      const cargoLock = `
version = 3

[[package]]
name = "serde"
version = "1.0.197"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "tokio"
version = "1.36.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
`;
      const result = parseCargoLock(cargoLock, 'Cargo.lock');
      expect(result.isLockfile).toBe(true);
      expect(result.ecosystem).toBe('crates.io');
      expect(result.packages.length).toBe(2);

      const serde = result.packages.find((p) => p.name === 'serde');
      expect(serde?.version).toBe('1.0.197');
      expect(serde?.isExactVersion).toBe(true);
    });

    it('parses Cargo.toml dependencies', () => {
      const cargoToml = `
[package]
name = "sample"
version = "0.1.0"

[dependencies]
serde = "1.0"
tokio = { version = "1.36.0", features = ["full"] }
`;
      const result = parseCargoToml(cargoToml, 'Cargo.toml');
      expect(result.isLockfile).toBe(false);
      expect(result.ecosystem).toBe('crates.io');
      expect(result.packages.length).toBe(2);

      const serde = result.packages.find((p) => p.name === 'serde');
      expect(serde?.isExactVersion).toBe(false);

      const tokio = result.packages.find((p) => p.name === 'tokio');
      expect(tokio?.isExactVersion).toBe(true);
      expect(tokio?.version).toBe('1.36.0');
    });
  });

  describe('PHP Composer parsers', () => {
    it('parses composer.lock with exact versions', () => {
      const composerLock = JSON.stringify({
        packages: [
          { name: 'guzzlehttp/guzzle', version: '7.8.1' },
          { name: 'symfony/console', version: 'v6.4.0' },
        ],
        'packages-dev': [
          { name: 'phpunit/phpunit', version: '10.5.2' },
        ],
      });

      const result = parseComposerLock(composerLock, 'composer.lock');
      expect(result.isLockfile).toBe(true);
      expect(result.ecosystem).toBe('Packagist');
      expect(result.packages.length).toBe(3);

      const guzzle = result.packages.find((p) => p.name === 'guzzlehttp/guzzle');
      expect(guzzle?.version).toBe('7.8.1');
      expect(guzzle?.isExactVersion).toBe(true);

      const symfony = result.packages.find((p) => p.name === 'symfony/console');
      expect(symfony?.version).toBe('6.4.0'); // v stripped
    });

    it('parses composer.json dependencies', () => {
      const composerJson = JSON.stringify({
        require: {
          'monolog/monolog': '^3.5.0',
        },
        'require-dev': {
          'pestphp/pest': '^2.0',
        },
      });

      const result = parseComposerJson(composerJson, 'composer.json');
      expect(result.isLockfile).toBe(false);
      expect(result.packages.length).toBe(2);
      expect(result.packages[0].isExactVersion).toBe(false);
    });
  });

  describe('Ruby Gemfile parsers', () => {
    it('parses Gemfile.lock with specs', () => {
      const gemfileLock = `
GEM
  remote: https://rubygems.org/
  specs:
    rails (7.1.2)
      actioncable (= 7.1.2)
    puma (6.4.0)

PLATFORMS
  ruby

DEPENDENCIES
  puma (>= 5.0)
  rails (~> 7.1.2)
`;
      const result = parseGemfileLock(gemfileLock, 'Gemfile.lock');
      expect(result.isLockfile).toBe(true);
      expect(result.ecosystem).toBe('RubyGems');
      expect(result.packages.length).toBe(2);

      const rails = result.packages.find((p) => p.name === 'rails');
      expect(rails?.version).toBe('7.1.2');
      expect(rails?.isExactVersion).toBe(true);

      const puma = result.packages.find((p) => p.name === 'puma');
      expect(puma?.version).toBe('6.4.0');
    });

    it('parses Gemfile declarations', () => {
      const gemfile = `
source 'https://rubygems.org'
gem 'sinatra', '~> 3.0'
gem 'pg', '1.5.4'
`;
      const result = parseGemfile(gemfile, 'Gemfile');
      expect(result.isLockfile).toBe(false);
      expect(result.packages.length).toBe(2);

      const sinatra = result.packages.find((p) => p.name === 'sinatra');
      expect(sinatra?.isExactVersion).toBe(false);

      const pg = result.packages.find((p) => p.name === 'pg');
      expect(pg?.isExactVersion).toBe(true);
      expect(pg?.version).toBe('1.5.4');
    });
  });

  describe('Java Maven parser', () => {
    it('parses pom.xml and resolves property variables', () => {
      const pomXml = `
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <properties>
    <spring.version>6.1.1</spring.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-web</artifactId>
      <version>\${spring.version}</version>
    </dependency>
    <dependency>
      <groupId>com.google.guava</groupId>
      <artifactId>guava</artifactId>
      <version>32.1.3-jre</version>
    </dependency>
  </dependencies>
</project>
`;
      const result = parsePomXml(pomXml, 'pom.xml');
      expect(result.ecosystem).toBe('Maven');
      expect(result.packages.length).toBe(2);

      const spring = result.packages.find((p) => p.name === 'org.springframework:spring-web');
      expect(spring).toBeDefined();
      expect(spring?.version).toBe('6.1.1');
      expect(spring?.isExactVersion).toBe(true);

      const guava = result.packages.find((p) => p.name === 'com.google.guava:guava');
      expect(guava?.version).toBe('32.1.3-jre');
    });
  });

  describe('.NET NuGet parsers', () => {
    it('parses packages.lock.json', () => {
      const packagesLock = JSON.stringify({
        version: 1,
        dependencies: {
          'net8.0': {
            'Newtonsoft.Json': {
              type: 'Direct',
              resolved: '13.0.3',
              contentHash: '...',
            },
            'Microsoft.Extensions.Logging': {
              type: 'Direct',
              resolved: '8.0.0',
            },
          },
        },
      });

      const result = parseNugetPackagesLock(packagesLock, 'packages.lock.json');
      expect(result.isLockfile).toBe(true);
      expect(result.ecosystem).toBe('NuGet');
      expect(result.packages.length).toBe(2);

      const newtonsoft = result.packages.find((p) => p.name === 'Newtonsoft.Json');
      expect(newtonsoft?.version).toBe('13.0.3');
      expect(newtonsoft?.isExactVersion).toBe(true);
    });

    it('parses .csproj PackageReference elements', () => {
      const csproj = `
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Serilog" Version="3.1.1" />
    <PackageReference Include="AutoMapper" Version="[12.0.1]" />
  </ItemGroup>
</Project>
`;
      const result = parseCsproj(csproj, 'App.csproj');
      expect(result.isLockfile).toBe(false);
      expect(result.ecosystem).toBe('NuGet');
      expect(result.packages.length).toBe(2);

      const serilog = result.packages.find((p) => p.name === 'Serilog');
      expect(serilog?.version).toBe('3.1.1');

      const automapper = result.packages.find((p) => p.name === 'AutoMapper');
      expect(automapper?.version).toBe('12.0.1');
      expect(automapper?.isExactVersion).toBe(true);
    });
  });

  describe('Go go.sum parser', () => {
    it('parses go.sum with exact module hashes', () => {
      const goSum = `
github.com/gin-gonic/gin v1.9.1 h1:4+fr/ElT2qcKF2ZmW41So/LVn9/saLW115pURn06bZg=
github.com/gin-gonic/gin v1.9.1/go.mod h1:hPrL7YRpAp++Jpp528qnj/a1m86zPaaYTbWzg05IwFQ=
golang.org/x/crypto v0.14.0 h1:wBqGXzWJWFU28we1Ta2zZW+UqOBz10y5/27U+/JYbBE=
golang.org/x/crypto v0.14.0/go.mod h1:MVFd36DqK4Csrk2zcmW/pLO8bpk5t86vW2CekAK3pag=
`;
      const result = parseGoSum(goSum, 'go.sum');
      expect(result.isLockfile).toBe(true);
      expect(result.ecosystem).toBe('Go');
      expect(result.packages.length).toBe(2);

      const gin = result.packages.find((p) => p.name === 'github.com/gin-gonic/gin');
      expect(gin?.version).toBe('1.9.1'); // v stripped
      expect(gin?.isExactVersion).toBe(true);
    });
  });

  describe('Unified dispatcher (detectAndParseManifest)', () => {
    it('dispatches to appropriate parser by filename', () => {
      const goSumResult = detectAndParseManifest('github.com/stretchr/testify v1.8.4 h1:...', 'go.sum');
      expect(goSumResult).not.toBeNull();
      expect(goSumResult?.ecosystem).toBe('Go');

      const cargoResult = detectAndParseManifest('[[package]]\nname = "rand"\nversion = "0.8.5"', 'Cargo.lock');
      expect(cargoResult).not.toBeNull();
      expect(cargoResult?.ecosystem).toBe('crates.io');

      const unsupported = detectAndParseManifest('foo', 'unknown.xyz');
      expect(unsupported).toBeNull();
    });
  });
});
