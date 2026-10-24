/**
 * Java Maven POM Manifest Parser
 * Parses pom.xml and extracts groupId:artifactId dependencies for Maven ecosystem
 */

import { DependencyPackage, ParsedManifestResult } from '../types';

export function parseMavenPom(
  content: string,
  filePath: string = 'pom.xml'
): ParsedManifestResult {
  const packages: DependencyPackage[] = [];
  const parseErrors: string[] = [];

  try {
    // Extract properties block for variable resolution (${property.name})
    const properties = new Map<string, string>();
    const propBlockMatch = content.match(/<properties>([\s\S]*?)<\/properties>/i);
    if (propBlockMatch) {
      const propLines = propBlockMatch[1].match(/<([a-zA-Z0-9_.-]+)>([^<]+)<\/\1>/g) || [];
      for (const pl of propLines) {
        const m = pl.match(/<([a-zA-Z0-9_.-]+)>([^<]+)<\/\1>/);
        if (m) {
          properties.set(m[1].trim(), m[2].trim());
        }
      }
    }

    // Match <dependency>...</dependency> blocks
    const depBlocks = content.match(/<dependency[\s\S]*?<\/dependency>/gi) || [];

    for (const block of depBlocks) {
      const groupMatch = block.match(/<groupId>([^<]+)<\/groupId>/i);
      const artifactMatch = block.match(/<artifactId>([^<]+)<\/artifactId>/i);
      const versionMatch = block.match(/<version>([^<]+)<\/version>/i);
      const scopeMatch = block.match(/<scope>([^<]+)<\/scope>/i);

      if (groupMatch && artifactMatch) {
        const groupId = groupMatch[1].trim();
        const artifactId = artifactMatch[1].trim();
        let rawVersion = versionMatch ? versionMatch[1].trim() : '';

        // Resolve property placeholder if any (e.g. ${log4j.version})
        if (rawVersion.startsWith('${') && rawVersion.endsWith('}')) {
          const propName = rawVersion.slice(2, -1).trim();
          if (properties.has(propName)) {
            rawVersion = properties.get(propName) || rawVersion;
          }
        }

        const canonicalName = `${groupId}:${artifactId}`;
        const isExact = /^[0-9]+\.[0-9]+/.test(rawVersion) && !rawVersion.includes('[');
        const scope = scopeMatch ? scopeMatch[1].trim().toLowerCase() : 'compile';
        const isDirect = scope !== 'test';

        packages.push({
          name: canonicalName,
          version: rawVersion || '*',
          ecosystem: 'Maven',
          isDirect,
          manifestPath: filePath,
          rawSpecifier: rawVersion || '*',
          isExactVersion: isExact,
          specifierType: isExact ? 'exact' : 'range',
          resolvedFromLockfile: false,
        });
      }
    }

    if (packages.length === 0 && content.includes('<project')) {
      // Empty or parent pom
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    parseErrors.push(`Failed to parse pom.xml: ${msg}`);
  }

  return {
    manifestPath: filePath,
    ecosystem: 'Maven',
    isLockfile: false,
    packages,
    parseErrors,
  };
}

export const parsePomXml = parseMavenPom;
