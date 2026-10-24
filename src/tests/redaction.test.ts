import { describe, it, expect } from 'vitest';
import { redactSecrets, createRedactedSnippet } from '../lib/redaction';

describe('Secret Redaction Engine', () => {
  it('redacts classic GitHub Personal Access Tokens (ghp_)', () => {
    const text = 'GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const sanitized = redactSecrets(text);
    expect(sanitized).toBe('GITHUB_TOKEN=[REDACTED_GITHUB_PAT]');
    expect(sanitized).not.toContain('ghp_');
  });

  it('redacts fine-grained GitHub Personal Access Tokens (github_pat_)', () => {
    const rawPat = 'github_pat_11AAAAAAA0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01';
    const sanitized = redactSecrets(`curl -H "Authorization: token ${rawPat}"`);
    expect(sanitized).toContain('[REDACTED_GITHUB_FINE_GRAINED_PAT]');
    expect(sanitized).not.toContain(rawPat);
  });

  it('redacts AWS Access Keys (AKIA...)', () => {
    const text = 'aws_access_key_id: AKIAIOSFODNN7EXAMPLE';
    const sanitized = redactSecrets(text);
    expect(sanitized).toBe('aws_access_key_id: [REDACTED_AWS_ACCESS_KEY]');
  });

  it('redacts bearer tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnopqrstuvwxyz';
    const sanitized = redactSecrets(text);
    expect(sanitized).toBe('Authorization: Bearer [REDACTED_BEARER_TOKEN]');
  });

  it('creates bounded snippets with line indicators and secret redaction', () => {
    const file = [
      'name: CI',
      'jobs:',
      '  build:',
      '    env:',
      '      TOKEN: ghp_1234567890abcdefghijklmnopqrstuvwxyz',
      '    steps:',
      '      - run: echo done',
    ].join('\n');

    const snippet = createRedactedSnippet(file, 5, 1);
    expect(snippet).toContain('>    5 |       TOKEN: [REDACTED_GITHUB_PAT]');
    expect(snippet).not.toContain('ghp_');
    expect(snippet).toContain('   4 |     env:');
  });
});
