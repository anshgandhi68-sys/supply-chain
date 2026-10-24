/**
 * Parser for Python requirements.txt
 */

import { DependencyPackage, ParsedManifestResult } from '../types';

export function parseRequirementsTxt(
  content: string,
  filePath: string = 'requirements.txt'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  const lines = content.split('\n');

  lines.forEach((rawLine, idx) => {
    let line = rawLine.trim();

    // Strip inline comments
    const commentIndex = line.indexOf('#');
    if (commentIndex >= 0) {
      line = line.substring(0, commentIndex).trim();
    }

    if (!line || line.startsWith('-r') || line.startsWith('-i') || line.startsWith('--')) {
      return;
    }

    // Match exact pinned version: package==1.2.3 or package===1.2.3
    const exactMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*==={0,1}\s*([a-zA-Z0-9_.-]+)/);
    if (exactMatch) {
      packages.push({
        name: exactMatch[1],
        version: exactMatch[2],
        ecosystem: 'PyPI',
        isDirect: true,
        manifestPath: filePath,
        lineNumber: idx + 1,
      });
      return;
    }

    // Match loose version: package>=1.2.3, package~=1.2.3
    const looseMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*([><=~!^]+)\s*([a-zA-Z0-9_.-]+)/);
    if (looseMatch) {
      packages.push({
        name: looseMatch[1],
        version: looseMatch[3],
        ecosystem: 'PyPI',
        isDirect: true,
        manifestPath: filePath,
        lineNumber: idx + 1,
      });
    }
  });

  return {
    manifestPath: filePath,
    ecosystem: 'PyPI',
    isLockfile: false,
    packages,
    parseErrors,
  };
}
