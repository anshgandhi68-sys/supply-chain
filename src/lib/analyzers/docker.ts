/**
 * Dockerfile and Container Configuration Security Analyzer
 * Deterministically analyzes container definitions for root execution, unpinned base images,
 * and dangerous runtime installation instructions.
 */

import { Finding } from '../types';
import { createRedactedSnippet } from '../redaction';

export function inspectDockerfile(
  content: string,
  filePath: string = 'Dockerfile',
  repository: string = 'local/repository',
  commitSha?: string
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');

  let hasExplicitUser = false;
  let lastUserLine = -1;
  let hasFromInstruction = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;

    // Rule DOCKER-002: Unpinned mutable base image
    if (/^FROM\s+/i.test(rawLine)) {
      hasFromInstruction = true;
      const fromParts = rawLine.replace(/^FROM\s+/i, '').split(/\s+/);
      const baseImage = fromParts[0].trim();

      // Check if image tag is missing, latest, or lacking digest (@sha256:...)
      const isLatest = baseImage.endsWith(':latest');
      const hasTag = baseImage.includes(':') || baseImage.includes('@');
      const isDigestPinned = baseImage.includes('@sha256:');

      if ((!hasTag || isLatest) && baseImage.toLowerCase() !== 'scratch') {
        findings.push({
          id: `DOCKER-002-${filePath}-L${i + 1}`,
          title: `Unpinned Base Image Tag (${baseImage}) in ${filePath}`,
          category: 'docker_security',
          severity: 'medium',
          severityRationale: 'Base images referenced without an immutable digest or exact tag can change unexpectedly, introducing vulnerabilities or supply-chain drift.',
          repository,
          commitSha,
          filePath,
          lineNumber: i + 1,
          observedValue: baseImage,
          evidenceSnippet: createRedactedSnippet(content, i + 1),
          detectionSource: 'Sentinel Container Engine (DOCKER-002)',
          recommendedAction: `Pin the base image to an immutable digest, e.g.: FROM ${baseImage.split(':')[0]}@sha256:<digest>`,
          confidence: 'confirmed',
          limitations: 'Flags mutable tags and default :latest references.',
          verificationStatus: 'unverified',
        });
      }
    }

    // Rule DOCKER-003: Insecure remote script execution in RUN instruction
    if (/^RUN\s+/i.test(rawLine)) {
      if (/(?:curl|wget)\s+[^|]+\|\s*(?:sh|bash|zsh)/i.test(rawLine)) {
        findings.push({
          id: `DOCKER-003-${filePath}-L${i + 1}`,
          title: `Unverified Remote Script Execution (Pipe to Shell) in ${filePath}`,
          category: 'docker_security',
          severity: 'high',
          severityRationale: 'Piping remote web scripts directly to shell inside a container build risks executing untrusted instructions without integrity verification.',
          repository,
          commitSha,
          filePath,
          lineNumber: i + 1,
          observedValue: rawLine.slice(0, 80),
          evidenceSnippet: createRedactedSnippet(content, i + 1),
          detectionSource: 'Sentinel Container Engine (DOCKER-003)',
          recommendedAction: 'Download the tool archive or script file separately, verify its SHA256 checksum with sha256sum --check, and then run it.',
          confidence: 'confirmed',
          limitations: 'Identifies pipe-to-shell patterns inside container RUN instructions.',
          verificationStatus: 'unverified',
        });
      }
    }

    // Rule DOCKER-004: Sensitive credentials exposed in ENV or ARG instructions
    if (/^(?:ENV|ARG)\s+/i.test(rawLine)) {
      if (/(?:API_KEY|SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE_KEY)\s*=/i.test(rawLine)) {
        findings.push({
          id: `DOCKER-004-${filePath}-L${i + 1}`,
          title: `Sensitive Credential Variable in ${filePath}`,
          category: 'docker_security',
          severity: 'high',
          severityRationale: 'Environment and build argument values defined in Dockerfile are baked into container image layers and visible via docker inspect.',
          repository,
          commitSha,
          filePath,
          lineNumber: i + 1,
          observedValue: rawLine.split('=')[0].trim(),
          evidenceSnippet: createRedactedSnippet(content, i + 1),
          detectionSource: 'Sentinel Container Engine (DOCKER-004)',
          recommendedAction: 'Do not bake secrets into images using ENV or ARG. Mount secrets at build time with BuildKit (RUN --mount=type=secret) or inject runtime environment variables.',
          confidence: 'confirmed',
          limitations: 'Flags credential naming patterns in image configuration layers.',
          verificationStatus: 'unverified',
        });
      }
    }

    // Track USER instructions
    if (/^USER\s+/i.test(rawLine)) {
      const userVal = rawLine.replace(/^USER\s+/i, '').trim().toLowerCase();
      if (userVal === 'root' || userVal === '0') {
        hasExplicitUser = false;
      } else {
        hasExplicitUser = true;
      }
      lastUserLine = i + 1;
    }
  }

  // Rule DOCKER-001: Missing non-root user
  if (hasFromInstruction && !hasExplicitUser) {
    findings.push({
      id: `DOCKER-001-${filePath}-L1`,
      title: `Container Runs as Root User in ${filePath}`,
      category: 'docker_security',
      severity: 'medium',
      severityRationale: 'Running container workloads as the default root user expands attack capabilities in the event of an application or container breakout.',
      repository,
      commitSha,
      filePath,
      lineNumber: lastUserLine > 0 ? lastUserLine : 1,
      observedValue: 'No non-root USER instruction configured prior to runtime entrypoint',
      evidenceSnippet: createRedactedSnippet(content, 1),
      detectionSource: 'Sentinel Container Engine (DOCKER-001)',
      recommendedAction: 'Create a dedicated unprivileged user and group (e.g. RUN adduser -D appuser && USER appuser) before declaring the container ENTRYPOINT/CMD.',
      confidence: 'confirmed',
      limitations: 'Static analysis verifies absence of non-root USER declaration. Does not evaluate Kubernetes securityContext or runtime drop-capabilities.',
      verificationStatus: 'unverified',
    });
  }

  return findings;
}

export const scanDockerfile = inspectDockerfile;

