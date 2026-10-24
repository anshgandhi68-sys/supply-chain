/**
 * Deterministic Secret Detection Analyzer
 * Scans repository manifests, workflows, and configuration files for exposed secrets,
 * tokens, and private keys. Strictly enforces safe masking and redaction on all findings.
 */

import { Finding } from '../types';
import { maskSecret, redactSecrets, createRedactedSnippet } from '../redaction';

export interface SecretPattern {
  id: string;
  name: string;
  regex: RegExp;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  recommendedAction: string;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  {
    id: 'SEC-001',
    name: 'GitHub Personal Access Token (Legacy/Fine-Grained)',
    regex: /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})/g,
    severity: 'critical',
    description: 'Exposed GitHub Personal Access Token grants unauthorized API access to repositories and organization resources.',
    recommendedAction: 'Immediately revoke the token in GitHub Settings > Developer settings > Personal access tokens, remove it from commit history, and configure GitHub Secrets.',
  },
  {
    id: 'SEC-002',
    name: 'AWS Access Key ID',
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    severity: 'critical',
    description: 'Exposed AWS Access Key ID allows unauthorized AWS API calls and potential cloud infrastructure compromise.',
    recommendedAction: 'Immediately deactivate and delete this key in AWS IAM, audit CloudTrail logs for unauthorized usage, and switch to IAM Roles for GitHub Actions (OIDC).',
  },
  {
    id: 'SEC-003',
    name: 'Private Encryption Key (RSA/EC/PGP/OpenSSH)',
    regex: /-----BEGIN[ A-Z0-9_-]*(?:RSA|EC|DSA|OPENSSH|PGP)? PRIVATE KEY[ A-Z0-9_-]*-----/g,
    severity: 'critical',
    description: 'Exposed private cryptographic key permits identity spoofing, decryption of protected traffic, or unauthorized SSH access.',
    recommendedAction: 'Revoke the corresponding public key and any certificates signed with this private key. Generate a fresh key pair and store private keys exclusively in a hardware security module or encrypted secrets store.',
  },
  {
    id: 'SEC-004',
    name: 'Slack Bot or User Token',
    regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g,
    severity: 'high',
    description: 'Exposed Slack OAuth token permits unauthorized reading of messages, channels, or sending messages as the Slack bot.',
    recommendedAction: 'Revoke the token in the Slack API app management dashboard and rotate credentials immediately.',
  },
  {
    id: 'SEC-005',
    name: 'Exposed Secret Printing in Workflow Script',
    regex: /echo\s+["']?\$\{\{\s*secrets\.[a-zA-Z0-9_]+\s*\}\}["']?/gi,
    severity: 'high',
    description: 'Directly echoing GitHub Actions secrets (${{ secrets.XYZ }}) risks exposing sensitive credentials in runner execution logs.',
    recommendedAction: 'Never print secrets using echo or log statements. GitHub mask attempts can fail if secrets are modified or encoded.',
  },
];

export function inspectFileForSecrets(
  content: string,
  filePath: string,
  repository: string,
  commitSha?: string
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');

  // Skip binary or huge files to preserve performance
  if (content.length > 500 * 1024) return findings;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx];

    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.regex.exec(lineText)) !== null) {
        const rawSecret = match[0];
        const masked = maskSecret(rawSecret);
        const lineNum = lineIdx + 1;
        const colNum = match.index + 1;

        findings.push({
          id: `${pattern.id}-${filePath}-L${lineNum}-C${colNum}`,
          title: `${pattern.name} in ${filePath}`,
          category: 'secret_leak',
          severity: pattern.severity,
          severityRationale: pattern.description,
          repository,
          commitSha,
          filePath,
          lineNumber: lineNum,
          columnNumber: colNum,
          observedValue: masked,
          evidenceSnippet: createRedactedSnippet(content, lineNum),
          detectionSource: `Sentinel Secret Detector (${pattern.id})`,
          recommendedAction: pattern.recommendedAction,
          confidence: 'confirmed',
          limitations: 'Static regex detection flags confirmed credential formats; verification of active credential revocation requires checking upstream identity providers.',
          verificationStatus: 'unverified',
        });
      }
    }
  }

  return findings;
}

export const scanSecrets = (
  content: string,
  filePath: string,
  repository: string = 'local/repo',
  commitSha?: string
) => inspectFileForSecrets(content, filePath, repository, commitSha);

