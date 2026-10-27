/**
 * Supply Chain Sentinel 2.0 - Investigation Evidence Model
 * Generates an explicit tri-part evidence breakdown:
 * - Observed Facts: Verifiable facts from lockfiles, AST, or OSV advisories.
 * - Inferred Risks: Deductions regarding reachability, blast radius, and exploitation surface.
 * - Unknowns: Statically unobservable runtime conditions and environment factors.
 */

import { Finding, DependencyGraphData } from './types';

export interface EnrichedInvestigationDetail {
  finding: Finding;
  observedFacts: string[];
  inferredRisks: string[];
  unknowns: string[];
  dependencyPath: string[];
  blastRadius: number;
  recommendedSteps: string[];
}

export function enrichFindingWithEvidence(
  finding: Finding,
  graphData?: DependencyGraphData
): EnrichedInvestigationDetail {
  const observedFacts: string[] = [];
  const inferredRisks: string[] = [];
  const unknowns: string[] = [];
  const recommendedSteps: string[] = [];

  // Extract package name and version
  let pkgName = '';
  let pkgVersion = '';
  if (finding.observedValue && finding.observedValue.includes('@')) {
    const parts = finding.observedValue.split('@');
    pkgName = parts[0];
    pkgVersion = parts[1];
  } else {
    pkgName = finding.observedValue || finding.title;
    pkgVersion = 'unspecified';
  }

  // 1. Observed Facts
  if (finding.filePath) {
    observedFacts.push(`Observed in manifest or file path: "${finding.filePath}"${finding.lineNumber ? ` at line ${finding.lineNumber}` : ''}.`);
  }

  if (finding.detectionSource) {
    observedFacts.push(`Detection authority: ${finding.detectionSource}.`);
  }

  if (finding.id) {
    observedFacts.push(`Security Advisory Reference: ${finding.id}${finding.aliases?.length ? ` (Aliases: ${finding.aliases.join(', ')})` : ''}.`);
  }

  if (finding.cvssScore !== undefined) {
    observedFacts.push(`Base CVSS Score: ${finding.cvssScore} / 10.0.`);
  }

  if (finding.fixedVersion) {
    observedFacts.push(`Upstream patched release documented as: ${finding.fixedVersion}.`);
  } else {
    observedFacts.push(`No upstream fixed release is currently recorded in advisory ${finding.id}.`);
  }

  if (finding.confidence === 'confirmed') {
    observedFacts.push(`Exact version match: ${pkgName}@${pkgVersion} confirmed via deterministic lockfile resolution.`);
  } else if (finding.confidence === 'version_unverified') {
    observedFacts.push(`Declared version range: ${pkgName}@${pkgVersion} is a loose specifier from package.json without a lockfile.`);
  }

  // 2. Dependency Path & Inferred Risks
  let dependencyPath: string[] = [];
  let blastRadius = 1;

  if (
    finding.category === 'workflow_security' ||
    finding.category === 'injection_risk' ||
    finding.category === 'action_pinning' ||
    finding.category === 'permission_risk'
  ) {
    dependencyPath = [finding.filePath || '.github/workflows/ci.yml'];
    blastRadius = 1;
    inferredRisks.push(
      `GitHub Actions execution vulnerability: improper configuration or input handling allows workflow runner compromise or privilege escalation.`
    );
  } else if (graphData) {
    const matchingAttackPath = graphData.attackPaths.find(
      (p) => p.targetPackage === pkgName
    );
    const node = graphData.nodes.find((n) => n.name === pkgName);

    if (matchingAttackPath) {
      dependencyPath = matchingAttackPath.path;
      blastRadius = matchingAttackPath.blastRadius;
    } else if (node && node.isDirect) {
      dependencyPath = [graphData.nodes[0]?.name || 'root', node.name];
      blastRadius = node.blastRadius;
    } else {
      // Node is unreachable from application root
      dependencyPath = [];
      blastRadius = node ? node.blastRadius : 0;
      inferredRisks.push(
        `Unreachable from application root: no active dependency lineage connects root application to ${pkgName}. Attack surface is inactive unless explicitly invoked.`
      );
    }

    if (node) {
      if (node.isDirect) {
        inferredRisks.push(
          `Direct ${node.scope} dependency: this component is imported directly by application source modules, representing a primary surface.`
        );
      } else if (dependencyPath.length > 0) {
        inferredRisks.push(
          `Transitive ${node.scope} dependency: pulled in via parent [${node.parents.join(', ') || 'root'}]; execution depends on parent invoking the vulnerable code.`
        );
      }

      if (node.scope === 'production') {
        inferredRisks.push(
          `Production scope: bundled into the deployed application artifact, accessible to external production requests.`
        );
      } else {
        inferredRisks.push(
          `Development scope: restricted to development and CI execution; low runtime production risk unless build step executes malicious hooks.`
        );
      }

      if (blastRadius > 1) {
        inferredRisks.push(
          `Downstream blast radius: ${blastRadius} packages or modules in this repository rely on ${pkgName}.`
        );
      }
    }
  } else {
    dependencyPath = [pkgName];
  }

  // 3. Unknowns
  unknowns.push(`Runtime call-tree: static analysis cannot determine whether application code actually executes the specific vulnerable function in ${pkgName}.`);
  unknowns.push(`Network isolation & WAF: perimeter controls, proxy sanitizers, or input validation outside this codebase cannot be statically verified.`);
  if (finding.confidence === 'version_unverified') {
    unknowns.push(`Unresolved installed version: package-lock.json was not provided, so the exact version deployed in production remains unverified.`);
  }

  // 4. Recommended Next Steps
  if (finding.fixedVersion) {
    recommendedSteps.push(`1. Review the candidate update to ${finding.fixedVersion} in the Remediation Center.`);
  }
  recommendedSteps.push(`2. Search codebase for imports: \`grep -rn "${pkgName}" src/\` to locate all calling modules.`);
  recommendedSteps.push(`3. Evaluate whether user-controlled input reaches parameters of ${pkgName}.`);
  recommendedSteps.push(`4. Run unit and integration tests against proposed remediation before deploying to production.`);

  return {
    finding: {
      ...finding,
      observedFacts,
      inferredRisks,
      unknowns,
      dependencyPath,
      blastRadius,
    },
    observedFacts,
    inferredRisks,
    unknowns,
    dependencyPath,
    blastRadius,
    recommendedSteps,
  };
}
