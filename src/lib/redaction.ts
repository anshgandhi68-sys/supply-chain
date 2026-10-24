/**
 * Secret Redaction Utility
 * Detects and redacts high-entropy secrets, tokens, keys, and credentials
 * from evidence snippets and workflow configurations.
 */

interface RedactionRule {
  name: string;
  regex: RegExp;
  replacement: string;
}

const REDACTION_RULES: RedactionRule[] = [
  // GitHub Personal Access Tokens (classic and fine-grained)
  {
    name: 'github_pat_classic',
    regex: /\bghp_[a-zA-Z0-9]{36}\b/g,
    replacement: '[REDACTED_GITHUB_PAT]',
  },
  {
    name: 'github_pat_fine_grained',
    regex: /\bgithub_pat_[a-zA-Z0-9_]{22,100}\b/g,
    replacement: '[REDACTED_GITHUB_FINE_GRAINED_PAT]',
  },
  {
    name: 'github_oauth_token',
    regex: /\bgho_[a-zA-Z0-9]{36}\b/g,
    replacement: '[REDACTED_GITHUB_OAUTH_TOKEN]',
  },
  {
    name: 'github_app_token',
    regex: /\b(ghu|ghs)_[a-zA-Z0-9]{36}\b/g,
    replacement: '[REDACTED_GITHUB_APP_TOKEN]',
  },
  // AWS Access Key ID & Secret Key
  {
    name: 'aws_access_key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED_AWS_ACCESS_KEY]',
  },
  {
    name: 'aws_secret_key',
    regex: /(?:aws_secret_access_key|aws_secret_key|secret_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    replacement: '$1: [REDACTED_AWS_SECRET_KEY]',
  },
  // Slack Tokens
  {
    name: 'slack_token',
    regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/g,
    replacement: '[REDACTED_SLACK_TOKEN]',
  },
  // Generic Private Keys
  {
    name: 'private_key',
    regex: /-----BEGIN\s+(?:RSA|OPENSSH|DSA|EC|PGP)?\s*PRIVATE KEY-----[\s\S]*?-----END\s+(?:RSA|OPENSSH|DSA|EC|PGP)?\s*PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY_BLOCK]',
  },
  // Authorization Bearer Headers with tokens
  {
    name: 'bearer_token',
    regex: /Bearer\s+([a-zA-Z0-9\-._~+/]+=*){16,}/gi,
    replacement: 'Bearer [REDACTED_BEARER_TOKEN]',
  },
  // Password or Secret assignments in YAML or JSON
  {
    name: 'hardcoded_password_assignment',
    regex: /(password|secret|token|api_key|apikey|auth_token)\s*[:=]\s*["']([^"'\s\n]{8,})["']/gi,
    replacement: '$1: "[REDACTED_CREDENTIAL]"',
  },
  // NPM tokens
  {
    name: 'npm_token',
    regex: /\bnpm_[a-zA-Z0-9]{36}\b/g,
    replacement: '[REDACTED_NPM_TOKEN]',
  },
  // PyPI tokens
  {
    name: 'pypi_token',
    regex: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9-_]{50,}\b/g,
    replacement: '[REDACTED_PYPI_TOKEN]',
  },
];

/**
 * Safely masks a secret string, leaving only leading prefix and trailing 4 characters.
 */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  const trimmed = secret.trim();
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  const maskedMiddle = '•'.repeat(Math.min(trimmed.length - 8, 24));
  return `${prefix}${maskedMiddle}${suffix}`;
}

/**
 * Redacts any detected secrets from a text string or code excerpt.
 */
export function redactSecrets(input: string): string {
  if (!input) return '';

  let sanitized = input;
  for (const rule of REDACTION_RULES) {
    sanitized = sanitized.replace(rule.regex, rule.replacement);
  }

  return sanitized;
}

/**
 * Creates a bounded snippet of code around a target line with secrets redacted
 */
export function createRedactedSnippet(
  fileContent: string,
  targetLine: number,
  contextLines: number = 3
): string {
  if (!fileContent) return '';

  const lines = fileContent.split('\n');
  const start = Math.max(0, targetLine - 1 - contextLines);
  const end = Math.min(lines.length, targetLine + contextLines);

  const excerpt = lines
    .slice(start, end)
    .map((line, idx) => {
      const lineNum = start + idx + 1;
      const marker = lineNum === targetLine ? '>' : ' ';
      return `${marker} ${lineNum.toString().padStart(4, ' ')} | ${line}`;
    })
    .join('\n');

  return redactSecrets(excerpt);
}
