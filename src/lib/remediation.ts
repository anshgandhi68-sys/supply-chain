/**
 * Supply Chain Sentinel 2.0 - Remediation Proposal Engine
 * Computes candidate fixed versions from verified advisory data,
 * evaluates semver compatibility risks (breaking changes),
 * and generates clean package diffs for security team review.
 */

import { Finding, RemediationDiff, Severity } from './types';
import { parseSemver } from './osv/client';

export interface SemverRiskAssessment {
  risk: 'low' | 'moderate' | 'high';
  rationale: string;
}

export function assessSemverRisk(current: string, proposed: string): SemverRiskAssessment {
  const pCurrent = parseSemver(current);
  const pProposed = parseSemver(proposed);

  if (!pCurrent || !pProposed) {
    return {
      risk: 'moderate',
      rationale: `Non-standard version format (${current} -> ${proposed}). Manual verification of changelog is recommended.`,
    };
  }

  const [currMajor, currMinor] = pCurrent;
  const [propMajor, propMinor] = pProposed;

  if (propMajor > currMajor || (currMajor === 0 && propMinor > currMinor)) {
    return {
      risk: 'high',
      rationale: `Major version upgrade (${current} -> ${proposed}). High risk of breaking API changes, removed functions, or altered configuration contracts.`,
    };
  }

  if (propMinor > currMinor) {
    return {
      risk: 'moderate',
      rationale: `Minor version upgrade (${current} -> ${proposed}). Backward-compatible feature additions; review changelog for deprecated APIs.`,
    };
  }

  return {
    risk: 'low',
    rationale: `Patch version upgrade (${current} -> ${proposed}). Strictly backward-compatible bug and security fixes; safe to apply.`,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function generatePackageJsonDiff(
  packageName: string,
  currentVersion: string,
  proposedVersion: string,
  manifestContent?: string
): { unifiedDiff: string; beforeSnippet: string; afterSnippet: string } {
  if (manifestContent && manifestContent.trim()) {
    const lines = manifestContent.split('\n');
    const regex = new RegExp(`^(\\s*"${escapeRegex(packageName)}"\\s*:\\s*)"([^"]+)"(.*)$`);
    const lineIndex = lines.findIndex((l) => regex.test(l));

    if (lineIndex !== -1) {
      const match = lines[lineIndex].match(regex);
      if (match) {
        const prefix = match[1];
        const oldVer = match[2];
        const suffix = match[3];

        const modifier = oldVer.startsWith('^')
          ? '^'
          : oldVer.startsWith('~')
          ? '~'
          : '';
        const newVerWithMod = `${modifier}${proposedVersion}`;

        const beforeLine = lines[lineIndex];
        const afterLine = `${prefix}"${newVerWithMod}"${suffix}`;

        // Get 2 lines of context before and after
        const start = Math.max(0, lineIndex - 2);
        const end = Math.min(lines.length, lineIndex + 3);

        const beforeSnippet = lines.slice(start, end).join('\n');
        const afterSnippetLines = [...lines.slice(start, lineIndex), afterLine, ...lines.slice(lineIndex + 1, end)];
        const afterSnippet = afterSnippetLines.join('\n');

        const unifiedDiff = [
          `--- a/package.json`,
          `+++ b/package.json`,
          `@@ -${lineIndex + 1},1 +${lineIndex + 1},1 @@`,
          `- ${beforeLine.trim()}`,
          `+ ${afterLine.trim()}`,
        ].join('\n');

        return { unifiedDiff, beforeSnippet, afterSnippet };
      }
    } else {
      // Transitive dependency not declared directly in package.json
      const beforeSnippet = `// "${packageName}" is a transitive dependency introduced by a parent package.\n// Direct line not found in package.json.`;
      const afterSnippet = `{\n  "overrides": {\n    "${packageName}": "${proposedVersion}"\n  }\n}`;
      const unifiedDiff = [
        `--- a/package.json (transitive: ${packageName})`,
        `+++ b/package.json (overrides recommendation)`,
        `@@ -dependencies @@`,
        `+   "overrides": {`,
        `+     "${packageName}": "${proposedVersion}"`,
        `+   }`,
      ].join('\n');

      return { unifiedDiff, beforeSnippet, afterSnippet };
    }
  }

  // Fallback if no manifest content supplied
  const beforeLine = `    "${packageName}": "${currentVersion}"`;
  const afterLine = `    "${packageName}": "${proposedVersion}"`;

  const beforeSnippet = `{\n  "dependencies": {\n${beforeLine}\n  }\n}`;
  const afterSnippet = `{\n  "dependencies": {\n${afterLine}\n  }\n}`;

  const unifiedDiff = [
    `--- a/package.json`,
    `+++ b/package.json`,
    `@@ -dependencies @@`,
    `- ${beforeLine}`,
    `+ ${afterLine}`,
  ].join('\n');

  return { unifiedDiff, beforeSnippet, afterSnippet };
}

export function generateRemediationProposals(
  findings: Finding[],
  manifestContent?: string
): RemediationDiff[] {
  const proposals: RemediationDiff[] = [];
  const processed = new Set<string>();

  for (const f of findings) {
    if (f.category === 'dependency_vulnerability' && f.fixedVersion) {
      let pkgName = '';
      let currVersion = '';
      if (f.observedValue && f.observedValue.includes('@')) {
        const parts = f.observedValue.split('@');
        pkgName = parts[0];
        currVersion = parts[1];
      } else {
        pkgName = f.observedValue || f.title;
        currVersion = 'unknown';
      }

      const key = `${pkgName}@${currVersion}->${f.fixedVersion}`;
      if (processed.has(key)) continue;
      processed.add(key);

      const risk = assessSemverRisk(currVersion, f.fixedVersion);
      const diff = generatePackageJsonDiff(pkgName, currVersion, f.fixedVersion, manifestContent);

      proposals.push({
        id: `rem-${pkgName}-${f.fixedVersion}`,
        packageName: pkgName,
        manifestPath: f.filePath || 'package.json',
        currentVersion: currVersion,
        proposedVersion: f.fixedVersion,
        severity: f.severity,
        advisoryId: f.id,
        breakingRisk: risk.risk,
        breakingRationale: risk.rationale,
        unifiedDiff: diff.unifiedDiff,
        beforeSnippet: diff.beforeSnippet,
        afterSnippet: diff.afterSnippet,
        isVerifiedFixed: true,
      });
    }
  }

  return proposals;
}
