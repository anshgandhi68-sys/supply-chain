/**
 * Multi-Ecosystem Manifest and Lockfile Dispatcher
 * Dispatches file content to appropriate ecosystem parsers for JavaScript/TypeScript,
 * Python, Rust, Go, PHP, Ruby, Java, and .NET.
 */

import { ParsedManifestResult } from '../types';
import { parsePackageLockJson, parsePackageJson, reconcileWithLockfile } from './package-json';
import { parseYarnLock, ParsedYarnLockResult } from './yarn-lock';
import { parsePnpmLock, ParsedPnpmLockResult } from './pnpm-lock';
import { parsePythonManifest, parseRequirementsTxt, parsePipfileLock, parsePoetryLock, parsePyprojectToml } from './python';
import { parseCargoManifest, parseCargoLock, parseCargoToml } from './cargo';
import { parseComposerManifest, parseComposerLock, parseComposerJson } from './composer';
import { parseRubyManifest, parseGemfileLock, parseGemfile } from './ruby';
import { parseMavenPom } from './maven';
import { parseNuGetManifest, parsePackagesLockJson, parseCsProj } from './nuget';
import { parseGoManifest, parseGoSum, parseGoMod } from './gosum';

export {
  parsePackageLockJson,
  parsePackageJson,
  reconcileWithLockfile,
  parseYarnLock,
  parsePnpmLock,
  parsePythonManifest,
  parseRequirementsTxt,
  parsePipfileLock,
  parsePoetryLock,
  parsePyprojectToml,
  parseCargoManifest,
  parseCargoLock,
  parseCargoToml,
  parseComposerManifest,
  parseComposerLock,
  parseComposerJson,
  parseRubyManifest,
  parseGemfileLock,
  parseGemfile,
  parseMavenPom,
  parseNuGetManifest,
  parsePackagesLockJson,
  parseCsProj,
  parseGoManifest,
  parseGoSum,
  parseGoMod,
};

export type { ParsedYarnLockResult, ParsedPnpmLockResult };

export function parseManifest(
  filePathOrContent: string,
  contentOrFilePath: string
): ParsedManifestResult | null {
  let filePath = filePathOrContent;
  let content = contentOrFilePath;

  // Polymorphic argument order detection
  if (filePathOrContent.includes('\n') && !contentOrFilePath.includes('\n')) {
    content = filePathOrContent;
    filePath = contentOrFilePath;
  }

  const normalized = filePath.toLowerCase();

  // JavaScript / TypeScript Lockfiles
  if (normalized.endsWith('package-lock.json')) {
    return parsePackageLockJson(content, filePath);
  }
  if (normalized.endsWith('yarn.lock')) {
    return parseYarnLock(content, filePath);
  }
  if (normalized.endsWith('pnpm-lock.yaml') || normalized.endsWith('pnpm-lock.yml')) {
    return parsePnpmLock(content, filePath);
  }
  if (normalized.endsWith('package.json')) {
    return parsePackageJson(content, filePath);
  }

  // Python
  if (
    normalized.endsWith('requirements.txt') ||
    normalized.includes('requirements/') ||
    normalized.endsWith('pipfile.lock') ||
    normalized.endsWith('poetry.lock') ||
    normalized.endsWith('pyproject.toml')
  ) {
    return parsePythonManifest(content, filePath);
  }

  // Rust
  if (normalized.endsWith('cargo.lock') || normalized.endsWith('cargo.toml')) {
    return parseCargoManifest(content, filePath);
  }

  // PHP
  if (normalized.endsWith('composer.lock') || normalized.endsWith('composer.json')) {
    return parseComposerManifest(content, filePath);
  }

  // Ruby
  if (normalized.endsWith('gemfile.lock') || normalized.endsWith('gemfile')) {
    return parseRubyManifest(content, filePath);
  }

  // Java / JVM
  if (normalized.endsWith('pom.xml')) {
    return parseMavenPom(content, filePath);
  }

  // .NET
  if (normalized.endsWith('packages.lock.json') || normalized.endsWith('.csproj') || normalized.endsWith('.fsproj')) {
    return parseNuGetManifest(content, filePath);
  }

  // Go
  if (normalized.endsWith('go.sum') || normalized.endsWith('go.mod')) {
    return parseGoManifest(content, filePath);
  }

  return null;
}

/**
 * Unified manifest dispatcher accepting (content, filePath)
 */
export function detectAndParseManifest(
  content: string,
  filePath: string
): ParsedManifestResult | null {
  return parseManifest(filePath, content);
}

export const parsePomXml = parseMavenPom;
export const parseNugetPackagesLock = parsePackagesLockJson;
export const parseCsproj = parseCsProj;

