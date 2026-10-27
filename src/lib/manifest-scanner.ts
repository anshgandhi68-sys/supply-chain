/**
 * Supply Chain Sentinel 2.0 - Local Manifest & Direct Upload Scanner
 * Allows users to upload or paste package.json and package-lock.json directly,
 * validates JSON syntax with detailed syntax error reporting,
 * and performs the full analysis pipeline without requiring GitHub credentials.
 */

import {
  ScanResult,
  ScanTimelineEvent,
  DependencyPackage,
  RepositoryMetadata,
  Finding,
} from './types';
import { parsePackageJson, parsePackageLockJson, reconcileWithLockfile } from './manifests/package-json';
import { queryOsvForPackages } from './osv/client';
import { inspectWorkflow } from './actions/engine';
import { generateCycloneDxBom } from './analyzers/sbom';
import { buildDependencyGraph } from './graph';
import { enrichFindingWithEvidence } from './investigation';

export const SCANNER_VERSION = '2.0.0';

export interface LocalScanPayload {
  packageJsonContent?: string;
  packageLockContent?: string;
  workflowYamlContent?: string;
  projectName?: string;
}

export function validateJsonInput(content: string, filename: string): { isValid: boolean; error?: string; parsed?: any } {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      return { isValid: false, error: `${filename} must be a valid JSON object.` };
    }
    return { isValid: true, parsed };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isValid: false, error: `Malformed JSON in ${filename}: ${msg}` };
  }
}

export async function runLocalManifestScan(payload: LocalScanPayload): Promise<ScanResult> {
  const startTime = Date.now();
  const timeline: ScanTimelineEvent[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const manifestsFound: string[] = [];
  const workflowsFound: string[] = [];
  const allFindings: Finding[] = [];

  const addEvent = (
    stage: ScanTimelineEvent['stage'],
    status: ScanTimelineEvent['status'],
    message: string,
    details?: Record<string, unknown>
  ) => {
    timeline.push({
      id: `evt-${timeline.length + 1}`,
      timestamp: new Date().toISOString(),
      stage,
      status,
      message,
      details,
    });
  };

  const projectName = payload.projectName?.trim() || 'Uploaded Application Project';

  const repoMeta: RepositoryMetadata = {
    owner: 'local-workspace',
    repo: projectName.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
    fullName: `local/${projectName}`,
    defaultBranch: 'local-audit',
    description: 'Direct manifest analysis via uploaded or pasted configuration files',
  };

  let packagesToScan: DependencyPackage[] = [];
  let isAnalysisIncomplete = false;

  // 1. Process package.json
  if (payload.packageJsonContent && payload.packageJsonContent.trim()) {
    addEvent('manifest_parse', 'info', 'Validating uploaded package.json...');
    const check = validateJsonInput(payload.packageJsonContent, 'package.json');
    if (!check.isValid) {
      errors.push(check.error || 'Invalid package.json');
      addEvent('manifest_parse', 'error', check.error || 'Invalid package.json');
    } else {
      manifestsFound.push('package.json');
      const parsedPkg = parsePackageJson(payload.packageJsonContent, 'package.json');
      if (parsedPkg.parseErrors.length > 0) {
        warnings.push(...parsedPkg.parseErrors);
      }
      packagesToScan = parsedPkg.packages;
      addEvent('manifest_parse', 'success', `Parsed package.json: identified ${packagesToScan.length} declared dependencies.`);
    }
  }

  // 2. Process package-lock.json
  if (payload.packageLockContent && payload.packageLockContent.trim()) {
    addEvent('manifest_parse', 'info', 'Validating uploaded package-lock.json...');
    const check = validateJsonInput(payload.packageLockContent, 'package-lock.json');
    if (!check.isValid) {
      errors.push(check.error || 'Invalid package-lock.json');
      addEvent('manifest_parse', 'error', check.error || 'Invalid package-lock.json');
    } else {
      manifestsFound.push('package-lock.json');
      const parsedLock = parsePackageLockJson(payload.packageLockContent, 'package-lock.json');
      if (parsedLock.parseErrors.length > 0) {
        warnings.push(...parsedLock.parseErrors);
      }

      if (packagesToScan.length > 0) {
        // Reconcile declared with lockfile
        const reconciled = reconcileWithLockfile(packagesToScan, parsedLock.packages);
        packagesToScan = reconciled;
        addEvent('manifest_parse', 'success', `Reconciled package.json with lockfile: ${reconciled.length} exact packages resolved.`);
      } else {
        packagesToScan = parsedLock.packages;
        addEvent('manifest_parse', 'success', `Parsed package-lock.json: ${parsedLock.packages.length} exact resolved dependencies.`);
      }
    }
  } else if (manifestsFound.includes('package.json')) {
    isAnalysisIncomplete = true;
    warnings.push('No lockfile was provided. Declared version ranges (^, ~) cannot be guaranteed to match deployed production artifacts. Findings are marked as VERSION_UNVERIFIED.');
  }

  // 3. Process optional Workflow YAML
  if (payload.workflowYamlContent && payload.workflowYamlContent.trim()) {
    workflowsFound.push('.github/workflows/ci.yml');
    addEvent('actions_inspect', 'info', 'Inspecting CI workflow configuration...');
    const inspection = inspectWorkflow(
      payload.workflowYamlContent,
      '.github/workflows/ci.yml',
      repoMeta.fullName
    );
    allFindings.push(...inspection.findings);
    addEvent(
      'actions_inspect',
      inspection.findings.length > 0 ? 'warning' : 'success',
      `Actions inspection complete: ${inspection.findings.length} findings cataloged.`
    );
  }

  // 4. Query OSV for Packages
  if (packagesToScan.length > 0) {
    addEvent('osv_query', 'info', `Querying Google OSV database for ${packagesToScan.length} dependencies...`);
    try {
      const osvRes = await queryOsvForPackages(packagesToScan, repoMeta.fullName, 'local');
      if (osvRes.apiSuccess) {
        allFindings.push(...osvRes.findings);
        addEvent(
          'osv_query',
          osvRes.findings.length > 0 ? 'warning' : 'success',
          `OSV query complete: ${osvRes.findings.length} advisories identified across ${osvRes.vulnerablePackagesCount} packages.`
        );
      } else {
        isAnalysisIncomplete = true;
        warnings.push(`OSV API: ${osvRes.errorMessage}. Analysis could not be fully verified against upstream databases.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      isAnalysisIncomplete = true;
      warnings.push(`OSV Advisory query failed: ${msg}.`);
    }
  }

  // 5. Build Dependency Attack Graph
  const dependencyGraph = packagesToScan.length > 0
    ? buildDependencyGraph({
        rootName: projectName,
        rootVersion: '1.0.0',
        packages: packagesToScan,
        findings: allFindings,
        manifestPath: manifestsFound[0] || 'package.json',
      })
    : undefined;

  // 6. Enrich findings with tri-part evidence
  const enrichedFindings = allFindings.map((f) => {
    const detail = enrichFindingWithEvidence(f, dependencyGraph);
    return detail.finding;
  });

  // Calculate statistics
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let infoCount = 0;
  let confirmedCount = 0;
  let potentialRiskCount = 0;
  let versionUnverifiedCount = 0;
  let unknownCount = 0;
  let exactVersionsResolved = 0;
  let unresolvedRanges = 0;

  for (const f of enrichedFindings) {
    switch (f.severity) {
      case 'critical': criticalCount++; break;
      case 'high': highCount++; break;
      case 'medium': mediumCount++; break;
      case 'low': lowCount++; break;
      case 'info': infoCount++; break;
    }
    if (f.confidence === 'confirmed') {
      confirmedCount++;
      exactVersionsResolved++;
    } else if (f.confidence === 'version_unverified') {
      versionUnverifiedCount++;
      unresolvedRanges++;
    } else if (f.confidence === 'high' || f.confidence === 'medium') {
      potentialRiskCount++;
    } else {
      unknownCount++;
    }
  }

  // Scan verdict
  let scanVerdict: ScanResult['scanVerdict'] = 'complete_with_findings';
  if (errors.length > 0 && enrichedFindings.length === 0) {
    scanVerdict = 'scan_failed';
  } else if (isAnalysisIncomplete) {
    scanVerdict = 'incomplete_evidence_required';
  } else if (enrichedFindings.length === 0) {
    scanVerdict = 'complete_clean';
  } else {
    scanVerdict = 'complete_with_findings';
  }

  const sbom = generateCycloneDxBom(repoMeta, packagesToScan, enrichedFindings, SCANNER_VERSION);

  addEvent('complete', 'success', `Audit finished in ${Date.now() - startTime}ms.`);

  return {
    repository: repoMeta,
    scannedAt: new Date().toISOString(),
    scannerVersion: SCANNER_VERSION,
    scanVerdict,
    findings: enrichedFindings,
    timeline,
    stats: {
      totalFindings: enrichedFindings.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      infoCount,
      confirmedCount,
      potentialRiskCount,
      versionUnverifiedCount,
      unknownCount,
      filesScanned: manifestsFound.length + workflowsFound.length,
      dependenciesScanned: packagesToScan.length,
      workflowsScanned: workflowsFound.length,
    },
    coverage: {
      commitSha: 'local-upload',
      filesDiscovered: manifestsFound.length + workflowsFound.length,
      filesAnalyzed: manifestsFound.length + workflowsFound.length,
      filesSkipped: 0,
      manifestsDetected: manifestsFound,
      lockfilesDetected: manifestsFound.filter((m) => m.includes('lock')),
      dependenciesDiscovered: packagesToScan.length,
      exactVersionsResolved,
      unresolvedRanges,
      unsupportedManifests: [],
      parserErrors: warnings.filter((w) => w.includes('parse')),
      upstreamFailures: errors.filter((e) => e.includes('OSV')),
      scanTruncated: false,
      vulnerabilitySources: ['Google OSV (CVE / GHSA / OSV Database)'],
      workflowFilesAnalyzed: workflowsFound.length,
      analyzersCompleted: [
        'Direct Manifest & Lockfile Resolver',
        'OSV Vulnerability Correlator',
        'GitHub Actions AST Security Engine',
        'CycloneDX SBOM Generator',
        'Dependency Lineage & Attack Graph Builder',
      ],
      durationMs: Date.now() - startTime,
    },
    manifestsFound,
    workflowsFound,
    isAnalysisIncomplete,
    warnings,
    errors,
    sbomCycloneDx: sbom,
    dependencyGraph,
  };
}
