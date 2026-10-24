/**
 * Parser for Go go.mod files
 */

import { DependencyPackage, ParsedManifestResult } from '../types';

export function parseGoMod(
  content: string,
  filePath: string = 'go.mod'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  const lines = content.split('\n');
  let inRequireBlock = false;

  lines.forEach((rawLine, idx) => {
    let line = rawLine.trim();

    const isIndirect = rawLine.includes('// indirect');

    // Strip comments
    const commentIndex = line.indexOf('//');
    if (commentIndex >= 0) {
      line = line.substring(0, commentIndex).trim();
    }

    if (!line) return;

    if (line.startsWith('require (')) {
      inRequireBlock = true;
      return;
    }

    if (inRequireBlock && line === ')') {
      inRequireBlock = false;
      return;
    }

    // Single line: require github.com/gin-gonic/gin v1.7.0
    if (line.startsWith('require ')) {
      const parts = line.replace('require ', '').trim().split(/\s+/);
      if (parts.length >= 2) {
        packages.push({
          name: parts[0],
          version: parts[1].replace(/^v/, ''),
          ecosystem: 'Go',
          isDirect: !isIndirect,
          manifestPath: filePath,
          lineNumber: idx + 1,
        });
      }
      return;
    }

    // Inside require ( ... ) block
    if (inRequireBlock) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        packages.push({
          name: parts[0],
          version: parts[1].replace(/^v/, ''),
          ecosystem: 'Go',
          isDirect: !isIndirect,
          manifestPath: filePath,
          lineNumber: idx + 1,
        });
      }
    }
  });

  return {
    manifestPath: filePath,
    ecosystem: 'Go',
    isLockfile: false,
    packages,
    parseErrors,
  };
}
