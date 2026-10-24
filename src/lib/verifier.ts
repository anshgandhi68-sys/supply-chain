/**
 * Deterministic Safe Fix Verifier
 * Reruns the exact same deterministic rules against both original and remediated workflows.
 * Never relies on speculative claims: re-evaluates the code to prove resolution.
 */

import { inspectWorkflow } from './actions/engine';
import { Finding, FixVerificationResult, FixVerificationComparison } from './types';

export function verifyWorkflowFix(
  beforeYaml: string,
  afterYaml: string,
  fixtureName: string = 'Workflow Remediator'
): FixVerificationResult {
  const beforeResult = inspectWorkflow(beforeYaml, '.github/workflows/before.yml', 'local/fixture');
  const afterResult = inspectWorkflow(afterYaml, '.github/workflows/remediated.yml', 'local/fixture');

  const beforeFindings = beforeResult.findings;
  const afterFindings = afterResult.findings;

  const comparisons: FixVerificationComparison[] = [];

  // Map findings by normalized rule ID and target concept
  const getFindingKey = (f: Finding) => {
    const ruleMatch = `${f.id} ${f.detectionSource}`.match(/GHA-\d{3}|MALFORMED/);
    const ruleId = ruleMatch ? ruleMatch[0] : f.category;
    const normalizedObserved = (f.observedValue || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return `${ruleId}:${normalizedObserved}`;
  };

  const afterMap = new Map<string, Finding>();
  for (const f of afterFindings) {
    afterMap.set(getFindingKey(f), f);
  }

  let resolvedCount = 0;
  let remainingCount = 0;

  for (const beforeFinding of beforeFindings) {
    const key = getFindingKey(beforeFinding);
    const remaining = afterMap.get(key);

    if (remaining) {
      remainingCount++;
      comparisons.push({
        ruleId: beforeFinding.detectionSource.replace(/.*?Sentinel Rule\s*/i, '').trim(),
        title: beforeFinding.title,
        beforeFinding,
        afterFinding: remaining,
        status: 'still_vulnerable',
        explanation: `Finding was not resolved. Rule still triggered on line ${remaining.lineNumber}: ${remaining.observedValue}`,
      });
      afterMap.delete(key);
    } else {
      resolvedCount++;
      comparisons.push({
        ruleId: beforeFinding.detectionSource.replace(/.*?Sentinel Rule\s*/i, '').trim(),
        title: beforeFinding.title,
        beforeFinding,
        status: 'resolved',
        explanation: 'Finding verified resolved. The remediated workflow satisfied all deterministic security checks for this rule.',
      });
    }
  }

  // Check for newly introduced regressions in after findings
  for (const [_, afterFinding] of afterMap.entries()) {
    remainingCount++;
    comparisons.push({
      ruleId: afterFinding.detectionSource.replace(/.*?Sentinel Rule\s*/i, '').trim(),
      title: afterFinding.title,
      afterFinding,
      status: 'new_risk_introduced',
      explanation: `New risk detected in remediated configuration on line ${afterFinding.lineNumber}: ${afterFinding.observedValue}`,
    });
  }

  return {
    verifiedAt: new Date().toISOString(),
    fixtureName,
    beforeFindingsCount: beforeFindings.length,
    afterFindingsCount: afterFindings.length,
    resolvedFindingsCount: resolvedCount,
    remainingFindingsCount: remainingCount,
    comparisons,
    allPassed: afterFindings.length === 0,
    beforeYaml,
    afterYaml,
  };
}

export interface DependencyRemediationOptions {
  packageName: string;
  currentVersion: string;
  proposedVersion: string;
  ecosystem?: import('./types').SupportedEcosystem;
  advisoryId?: string;
  affectedRanges?: Array<{
    type?: string;
    events: Array<{ introduced?: string; fixed?: string; last_affected?: string }>;
  }>;
}

export interface DependencyRemediationResult {
  isRemediated: boolean;
  status: 'verified_remediated' | 'still_vulnerable' | 'inconclusive';
  explanation: string;
  previousAdvisoriesCount: number;
  remainingAdvisoriesCount: number;
}

/**
 * Deterministically verifies proposed dependency upgrade version against OSV database or known advisory ranges
 */
export async function verifyDependencyRemediation(
  pkgOrOptions: string | DependencyRemediationOptions,
  currentVersion?: string,
  proposedVersion?: string,
  ecosystem: import('./types').SupportedEcosystem = 'npm',
  advisoryId: string = ''
): Promise<DependencyRemediationResult> {
  const { compareSemver } = await import('./osv/client');

  let pkgName: string;
  let curVer: string;
  let propVer: string;
  let eco: import('./types').SupportedEcosystem;
  let advId: string;
  let affectedRanges: DependencyRemediationOptions['affectedRanges'];

  if (typeof pkgOrOptions === 'object') {
    pkgName = pkgOrOptions.packageName;
    curVer = pkgOrOptions.currentVersion;
    propVer = pkgOrOptions.proposedVersion;
    eco = pkgOrOptions.ecosystem || 'npm';
    advId = pkgOrOptions.advisoryId || '';
    affectedRanges = pkgOrOptions.affectedRanges;
  } else {
    pkgName = pkgOrOptions;
    curVer = currentVersion || '';
    propVer = proposedVersion || '';
    eco = ecosystem;
    advId = advisoryId;
  }

  // If explicit affectedRanges are provided, evaluate deterministically
  if (affectedRanges && Array.isArray(affectedRanges) && affectedRanges.length > 0) {
    let propIsAffected = false;

    for (const range of affectedRanges) {
      if (!range.events || !Array.isArray(range.events)) continue;

      let introduced: string | undefined;
      let fixed: string | undefined;

      for (const ev of range.events) {
        if (ev.introduced !== undefined) introduced = ev.introduced;
        if (ev.fixed !== undefined) fixed = ev.fixed;
      }

      let afterIntroduced = true;
      if (introduced && introduced !== '0') {
        afterIntroduced = compareSemver(propVer, introduced) >= 0;
      }

      let beforeFixed = true;
      if (fixed) {
        beforeFixed = compareSemver(propVer, fixed) < 0;
      }

      if (afterIntroduced && beforeFixed) {
        propIsAffected = true;
        break;
      }
    }

    const isRemediated = !propIsAffected;
    const status = isRemediated ? 'verified_remediated' : 'still_vulnerable';
    const explanation = isRemediated
      ? `Proposed version ${pkgName}@${propVer} is outside all known affected advisory ranges for ${advId || 'advisory'}.`
      : `Proposed version ${pkgName}@${propVer} remains vulnerable under advisory range bounds for ${advId || 'advisory'}.`;

    return {
      isRemediated,
      status,
      explanation,
      previousAdvisoriesCount: 1,
      remainingAdvisoriesCount: isRemediated ? 0 : 1,
    };
  }

  // Otherwise perform live OSV API verification query
  const { queryOsvForPackages } = await import('./osv/client');

  const prevPkg = {
    name: pkgName,
    version: curVer,
    ecosystem: eco,
    isDirect: true,
    manifestPath: 'package.json',
    isExactVersion: true,
    resolvedFromLockfile: true,
  };

  const propPkg = {
    name: pkgName,
    version: propVer,
    ecosystem: eco,
    isDirect: true,
    manifestPath: 'package.json',
    isExactVersion: true,
    resolvedFromLockfile: true,
  };

  const prevRes = await queryOsvForPackages([prevPkg], 'remediation/verification');
  const propRes = await queryOsvForPackages([propPkg], 'remediation/verification');

  const targetStillPresent = propRes.findings.some(
    (f) => f.id.includes(advId) || f.detectionSource.includes(advId)
  );
  const isRemediated = !targetStillPresent;
  const status = isRemediated ? 'verified_remediated' : 'still_vulnerable';

  let explanation = '';
  if (isRemediated) {
    if (propRes.findings.length === 0) {
      explanation = `Upgrade from ${pkgName}@${curVer} to ${pkgName}@${propVer} cleanly resolves ${advId || 'all advisories'} with 0 remaining known vulnerabilities.`;
    } else {
      explanation = `Upgrade resolves ${advId}, but ${propRes.findings.length} other advisory/advisories exist in version ${propVer}.`;
    }
  } else {
    explanation = `Proposed version ${pkgName}@${propVer} is STILL AFFECTED by ${advId}. Select a version outside the affected range.`;
  }

  return {
    isRemediated,
    status,
    explanation,
    previousAdvisoriesCount: prevRes.findings.length,
    remainingAdvisoriesCount: propRes.findings.length,
  };
}

