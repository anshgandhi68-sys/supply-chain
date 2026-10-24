import { describe, it, expect } from 'vitest';
import { inspectWorkflow, isCommitSha } from '../lib/actions/engine';
import fs from 'fs';
import path from 'path';

describe('GitHub Actions AST Security Engine', () => {
  const fixturesDir = path.join(process.cwd(), 'src', 'fixtures');

  it('validates 40-character commit SHAs accurately', () => {
    expect(isCommitSha('24cbbfd34f15af1204a74c4045f45fe8686d57f7')).toBe(true);
    expect(isCommitSha('v3')).toBe(false);
    expect(isCommitSha('main')).toBe(false);
    expect(isCommitSha('24cbbfd')).toBe(false); // Short SHA is mutable
    expect(isCommitSha('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false); // Non-hex
  });

  it('detects vulnerabilities in risky workflow fixture', () => {
    const riskyYaml = fs.readFileSync(path.join(fixturesDir, 'risky-workflow.yml'), 'utf8');
    const result = inspectWorkflow(riskyYaml, '.github/workflows/risky-workflow.yml');

    expect(result.isValidYaml).toBe(true);
    const ruleIds = result.findings.map((f) => f.detectionSource);

    // Should flag GHA-001 (unpinned actions), GHA-002 (write-all), GHA-003 (pull_request_target checkout), GHA-004 (injection), GHA-005 (pipe to shell)
    expect(ruleIds.some((id) => id.includes('GHA-001'))).toBe(true);
    expect(ruleIds.some((id) => id.includes('GHA-002'))).toBe(true);
    expect(ruleIds.some((id) => id.includes('GHA-003'))).toBe(true);
    expect(ruleIds.some((id) => id.includes('GHA-004'))).toBe(true);
    expect(ruleIds.some((id) => id.includes('GHA-005'))).toBe(true);

    // Verify finding metadata fields
    const gha003 = result.findings.find((f) => f.detectionSource.includes('GHA-003'));
    expect(gha003).toBeDefined();
    expect(gha003?.severity).toBe('critical');
    expect(gha003?.confidence).toBe('confirmed');
    expect(gha003?.lineNumber).toBeGreaterThan(0);
  });

  it('reports zero security findings on clean workflow fixture', () => {
    const cleanYaml = fs.readFileSync(path.join(fixturesDir, 'clean-workflow.yml'), 'utf8');
    const result = inspectWorkflow(cleanYaml, '.github/workflows/clean-workflow.yml');

    expect(result.isValidYaml).toBe(true);
    expect(result.findings.length).toBe(0);
  });

  it('gracefully handles malformed YAML without crashing', () => {
    const malformedYaml = fs.readFileSync(path.join(fixturesDir, 'malformed-workflow.yml'), 'utf8');
    const result = inspectWorkflow(malformedYaml, '.github/workflows/malformed-workflow.yml');

    expect(result.isValidYaml).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].category).toBe('malformed_config');
    expect(result.findings[0].severity).toBe('high');
  });

  it('detects GHA-006 when workflow lacks an explicit permissions declaration', () => {
    const yamlWithoutPermissions = [
      'name: CI',
      'on: [push]',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo "hello"',
    ].join('\n');

    const result = inspectWorkflow(yamlWithoutPermissions, '.github/workflows/test.yml');
    expect(result.isValidYaml).toBe(true);

    const gha006 = result.findings.find((f) => f.detectionSource.includes('GHA-006'));
    expect(gha006).toBeDefined();
    expect(gha006?.category).toBe('permission_risk');
    expect(gha006?.severity).toBe('low');
    expect(gha006?.recommendedAction).toContain('permissions: contents: read');
  });

  it('verifies all structured finding fields have required evidence and rationale', () => {
    const riskyYaml = fs.readFileSync(path.join(fixturesDir, 'risky-workflow.yml'), 'utf8');
    const result = inspectWorkflow(riskyYaml, '.github/workflows/risky-workflow.yml');

    for (const f of result.findings) {
      expect(f.id).toBeTruthy();
      expect(f.title).toBeTruthy();
      expect(f.category).toBeTruthy();
      expect(f.severity).toBeTruthy();
      expect(f.severityRationale).toBeTruthy();
      expect(f.filePath).toBe('.github/workflows/risky-workflow.yml');
      expect(f.observedValue).toBeTruthy();
      expect(f.evidenceSnippet).toBeTruthy();
      expect(f.detectionSource).toBeTruthy();
      expect(f.recommendedAction).toBeTruthy();
      expect(f.limitations).toBeTruthy();
      expect(f.verificationStatus).toBe('unverified');
    }
  });
});
