/**
 * Supply Chain Sentinel Scan Orchestrator
 * Coordinates repository acquisition, tree-based manifest discovery, multi-ecosystem parsing,
 * OSV vulnerability matching, GitHub Actions AST inspection, secret detection, Dockerfile auditing,
 * and CycloneDX SBOM generation.
 */

import {
  Finding,
  RepositoryMetadata,
  ScanResult,
  ScanTimelineEvent,
  DependencyPackage,
  CoverageReport,
  ScanStatusVerdict,
  DiscoveredFile,
} from './types';
import {
  parseAndValidateGitHubUrl,
  fetchRepoMetadata,
  fetchRepoTree,
  fetchRawFile,
  fetchWorkflows,
} from './github';
import {
  parseManifest,
  parsePackageJson,
  parsePackageLockJson,
  parseYarnLock,
  parsePnpmLock,
  reconcileWithLockfile,
} from './manifests';
import { queryOsvForPackages } from './osv/client';
import { inspectWorkflow } from './actions/engine';
import { inspectFileForSecrets } from './analyzers/secrets';
import { inspectDockerfile } from './analyzers/docker';
import { generateCycloneDxBom } from './analyzers/sbom';
import { buildDependencyGraph } from './graph';
import { enrichFindingWithEvidence } from './investigation';
import fs from 'fs';
import path from 'path';

export const SCANNER_VERSION = '2.0.0';

// Known manifest file patterns for tree matching
const MANIFEST_PATTERNS = [
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock\.ya?ml$/i,
  /package\.json$/i,
  /(?:^|\/)requirements(?:\.txt|\/.*\.txt)$/i,
  /pipfile\.lock$/i,
  /poetry\.lock$/i,
  /pyproject\.toml$/i,
  /cargo\.lock$/i,
  /cargo\.toml$/i,
  /composer\.lock$/i,
  /composer\.json$/i,
  /gemfile\.lock$/i,
  /gemfile$/i,
  /pom\.xml$/i,
  /packages\.lock\.json$/i,
  /\.(?:c|f)sproj$/i,
  /go\.sum$/i,
  /go\.mod$/i,
];

// Fallback manifests to probe when Git Tree API is restricted
const FALLBACK_CANDIDATE_MANIFESTS = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'package.json',
  'requirements.txt',
  'poetry.lock',
  'Pipfile.lock',
  'Cargo.lock',
  'Cargo.toml',
  'composer.lock',
  'Gemfile.lock',
  'pom.xml',
  'packages.lock.json',
  'go.sum',
  'go.mod',
];

export async function runSupplyChainScan(
  rawUrl: string,
  token?: string,
  forceDemo: boolean = false
): Promise<ScanResult> {
  const startTime = Date.now();
  const timeline: ScanTimelineEvent[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const manifestsFound: string[] = [];
  const unsupportedManifestsFound: string[] = [];
  const workflowsFound: string[] = [];
  const allFindings: Finding[] = [];
  let totalDependencies = 0;
  let isAnalysisIncomplete = false;
  let filesDiscoveredCount = 0;
  let filesSkippedCount = 0;
  let isScanTruncated = false;
  let truncationReason: string | undefined;

  const addEvent = (
    stage: ScanTimelineEvent['stage'],
    status: ScanTimelineEvent['status'],
    message: string,
    details?: Record<string, unknown>
  ) => {
    timeline.push({
      id: `evt-${Date.now()}-${timeline.length}`,
      timestamp: new Date().toISOString(),
      stage,
      status,
      message,
      details,
    });
  };

  // Check if requested repository is the built-in controlled demo fixture
  const isDemoRequest =
    forceDemo ||
    rawUrl.toLowerCase().includes('sentinel/demo') ||
    rawUrl.toLowerCase().includes('supply-chain-demo') ||
    rawUrl.toLowerCase() === 'demo';

  if (isDemoRequest) {
    addEvent('validate', 'success', 'Loaded controlled local security test repository', {
      repository: 'sentinel-security/supply-chain-demo',
      mode: 'controlled_test_fixture',
    });

    const repoMeta: RepositoryMetadata = {
      owner: 'sentinel-security',
      repo: 'supply-chain-demo',
      fullName: 'sentinel-security/supply-chain-demo',
      defaultBranch: 'main',
      latestCommitSha: 'a1b2c3d',
      resolvedCommitSha: 'a1b2c3d4e5f6789012345678901234567890abcd',
      description: 'Controlled security test repository exhibiting real-world supply chain patterns',
      stars: 42,
      isFork: false,
    };

    // 1. Analyze fixture manifest
    let sampleLockJson = '';
    let riskyWorkflowYml = '';

    try {
      const fixturesDir = path.join(process.cwd(), 'src', 'fixtures');
      sampleLockJson = fs.readFileSync(path.join(fixturesDir, 'sample-package-lock.json'), 'utf8');
      riskyWorkflowYml = fs.readFileSync(path.join(fixturesDir, 'risky-workflow.yml'), 'utf8');
    } catch {
      sampleLockJson = JSON.stringify({
        name: 'vulnerable-demo',
        version: '1.0.0',
        packages: {
          'node_modules/lodash': { version: '4.17.20' },
          'node_modules/axios': { version: '0.21.1' },
          'node_modules/minimist': { version: '1.2.5' },
        },
      });
      riskyWorkflowYml = `name: CI\non: [pull_request_target]\npermissions: write-all\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n        with:\n          ref: \${{ github.event.pull_request.head.sha }}\n      - run: echo "\${{ github.event.issue.title }}"\n`;
    }

    manifestsFound.push('package-lock.json');
    const parsedManifest = parseManifest('package-lock.json', sampleLockJson);
    const demoPackages: DependencyPackage[] = parsedManifest ? parsedManifest.packages : [];
    totalDependencies = demoPackages.length;

    if (parsedManifest) {
      addEvent(
        'manifest_parse',
        'info',
        `Parsed package-lock.json: discovered ${parsedManifest.packages.length} resolved packages.`,
        { packagesCount: parsedManifest.packages.length }
      );

      // Query OSV API
      addEvent('osv_query', 'info', 'Querying Google OSV database for known CVE and GHSA advisories...');
      const osvRes = await queryOsvForPackages(parsedManifest.packages, repoMeta.fullName, repoMeta.latestCommitSha);
      if (osvRes.apiSuccess) {
        allFindings.push(...osvRes.findings);
        addEvent(
          'osv_query',
          osvRes.findings.length > 0 ? 'warning' : 'success',
          `OSV query completed: ${osvRes.findings.length} confirmed advisories identified.`,
          { advisoryCount: osvRes.findings.length }
        );
      } else {
        isAnalysisIncomplete = true;
        warnings.push(`OSV API: ${osvRes.errorMessage}. Dependency analysis could not be completed; 0 confirmed vulnerabilities does NOT prove that dependencies are safe.`);
        addEvent('osv_query', 'error', `OSV API lookup encountered an issue: ${osvRes.errorMessage}`);
      }
    }

    // 2. Inspect Risky Actions Workflow
    workflowsFound.push('.github/workflows/risky-workflow.yml');
    addEvent('actions_inspect', 'info', 'Inspecting .github/workflows/risky-workflow.yml with deterministic AST engine...');
    const actionInspection = inspectWorkflow(
      riskyWorkflowYml,
      '.github/workflows/risky-workflow.yml',
      repoMeta.fullName,
      repoMeta.latestCommitSha
    );
    allFindings.push(...actionInspection.findings);
    addEvent(
      'actions_inspect',
      actionInspection.findings.length > 0 ? 'warning' : 'success',
      `Workflow inspection complete: ${actionInspection.findings.length} security rules triggered.`,
      { findingsCount: actionInspection.findings.length }
    );

    // 3. Secret Inspection on Workflow
    const secretFindings = inspectFileForSecrets(
      riskyWorkflowYml,
      '.github/workflows/risky-workflow.yml',
      repoMeta.fullName,
      repoMeta.latestCommitSha
    );
    if (secretFindings.length > 0) {
      allFindings.push(...secretFindings);
    }

    addEvent('complete', 'success', 'Security investigation complete. Findings compiled.', {
      totalFindings: allFindings.length,
    });

    const sbom = generateCycloneDxBom(repoMeta, demoPackages, allFindings, SCANNER_VERSION);

    return assembleScanResult(
      repoMeta,
      allFindings,
      timeline,
      manifestsFound,
      workflowsFound,
      unsupportedManifestsFound,
      totalDependencies,
      warnings,
      errors,
      isAnalysisIncomplete,
      2,
      2,
      0,
      false,
      undefined,
      Date.now() - startTime,
      sbom,
      demoPackages
    );
  }

  // --- Real Public GitHub Repository Flow ---

  // Stage 1: Validate URL and parse optional ref/subpath
  addEvent('validate', 'info', `Validating repository URL: ${rawUrl}`);
  const validation = parseAndValidateGitHubUrl(rawUrl);
  if (!validation.isValid || !validation.owner || !validation.repo) {
    const errorMsg = validation.error || 'Invalid GitHub repository URL.';
    errors.push(errorMsg);
    addEvent('validate', 'error', errorMsg);

    const emptyMeta: RepositoryMetadata = {
      owner: '',
      repo: '',
      fullName: rawUrl,
      defaultBranch: 'main',
    };
    return assembleScanResult(
      emptyMeta,
      [],
      timeline,
      [],
      [],
      [],
      0,
      warnings,
      errors,
      true,
      0,
      0,
      0,
      false,
      undefined,
      Date.now() - startTime
    );
  }

  const targetDescription = validation.subdirectory
    ? `https://github.com/${validation.owner}/${validation.repo} (path: ${validation.subdirectory})`
    : `https://github.com/${validation.owner}/${validation.repo}`;
  addEvent('validate', 'success', `Target validated: ${targetDescription}`);

  // Stage 2: Fetch Repository Metadata and resolve commit SHA
  addEvent('fetch', 'info', `Retrieving repository metadata from GitHub API...`);
  const metaRes = await fetchRepoMetadata(
    validation.owner,
    validation.repo,
    token,
    validation.ref,
    validation.subdirectory
  );

  if (metaRes.error || !metaRes.metadata) {
    const errorMsg = metaRes.error || 'Could not fetch repository metadata.';
    errors.push(errorMsg);
    addEvent('fetch', 'error', errorMsg, { rateLimitRemaining: metaRes.rateLimitRemaining });

    const fallbackMeta: RepositoryMetadata = {
      owner: validation.owner,
      repo: validation.repo,
      fullName: `${validation.owner}/${validation.repo}`,
      defaultBranch: 'main',
      rateLimitRemaining: metaRes.rateLimitRemaining,
    };
    return assembleScanResult(
      fallbackMeta,
      [],
      timeline,
      [],
      [],
      [],
      0,
      warnings,
      errors,
      true,
      0,
      0,
      0,
      false,
      undefined,
      Date.now() - startTime
    );
  }

  const repoMeta = metaRes.metadata;
  const activeBranchOrSha = repoMeta.resolvedCommitSha || repoMeta.requestedRef || repoMeta.defaultBranch;

  addEvent('fetch', 'success', `Repository metadata loaded (branch: ${repoMeta.defaultBranch}, commit: ${repoMeta.latestCommitSha || 'resolved'})`, {
    stars: repoMeta.stars,
    commitSha: repoMeta.resolvedCommitSha || repoMeta.latestCommitSha,
    rateLimitRemaining: repoMeta.rateLimitRemaining,
  });

  if (repoMeta.rateLimitRemaining !== undefined && repoMeta.rateLimitRemaining < 10) {
    warnings.push(`GitHub API rate limit is low (${repoMeta.rateLimitRemaining} requests remaining).`);
  }

  // Stage 3: Repository Tree Acquisition
  addEvent('tree_discover', 'info', 'Discovering repository file tree metadata...');
  const treeRes = await fetchRepoTree(
    repoMeta.owner,
    repoMeta.repo,
    activeBranchOrSha,
    token,
    repoMeta.subdirectory
  );

  let filesToScan: DiscoveredFile[] = [];

  if (treeRes.resolvedSha) {
    repoMeta.resolvedCommitSha = treeRes.resolvedSha;
  }

  if (treeRes.tree.length > 0) {
    filesDiscoveredCount = treeRes.tree.length;
    isScanTruncated = treeRes.truncated;
    if (isScanTruncated) {
      truncationReason = 'GitHub Git Trees API returned truncated results due to repository size (> 100k files).';
      warnings.push(truncationReason);
    }
    addEvent('tree_discover', 'success', `Discovered ${filesDiscoveredCount} repository files via Git Tree API.`, {
      truncated: isScanTruncated,
    });
    filesToScan = treeRes.tree;
  } else {
    // Tree API not available or empty; fall back to candidate manifest probes
    addEvent('tree_discover', 'info', 'Git Tree API returned empty tree or is restricted; falling back to candidate manifest probing.');
  }

  // Stage 4: Parse Multi-Ecosystem Dependency Manifests
  addEvent('manifest_parse', 'info', 'Probing and parsing dependency manifests across all supported ecosystems...');

  let rawPackageJsonContent: string | null = null;
  let rawPackageLockContent: string | null = null;
  let rawYarnLockContent: string | null = null;
  let rawPnpmLockContent: string | null = null;
  const allDiscoveredPackages: DependencyPackage[] = [];
  const candidateManifestPaths: string[] = [];

  if (filesToScan.length > 0) {
    // Identify manifest files from tree
    for (const item of filesToScan) {
      if (MANIFEST_PATTERNS.some((pat) => pat.test(item.path))) {
        candidateManifestPaths.push(item.path);
      }
    }
  } else {
    // Probing root candidates
    const prefix = repoMeta.subdirectory ? `${repoMeta.subdirectory.replace(/\/+$/, '')}/` : '';
    for (const cand of FALLBACK_CANDIDATE_MANIFESTS) {
      candidateManifestPaths.push(`${prefix}${cand}`);
    }
  }

  // Cap manifests fetched to prevent API exhaustion (max 30 manifests)
  const manifestsToFetch = candidateManifestPaths.slice(0, 30);
  if (candidateManifestPaths.length > 30) {
    filesSkippedCount += candidateManifestPaths.length - 30;
    warnings.push(`Repository contains ${candidateManifestPaths.length} manifests; limited analysis to first 30 manifests.`);
  }

  for (const manifestPath of manifestsToFetch) {
    const fileRes = await fetchRawFile(repoMeta.owner, repoMeta.repo, activeBranchOrSha, manifestPath, token);
    if (!fileRes.content) continue;

    manifestsFound.push(manifestPath);
    const normalized = manifestPath.toLowerCase();

    // Secret check on manifests
    const secFindings = inspectFileForSecrets(fileRes.content, manifestPath, repoMeta.fullName, repoMeta.resolvedCommitSha);
    if (secFindings.length > 0) allFindings.push(...secFindings);

    // Cache npm lockfile candidates for reconciliation
    if (normalized.endsWith('package.json')) {
      rawPackageJsonContent = fileRes.content;
    } else if (normalized.endsWith('package-lock.json')) {
      rawPackageLockContent = fileRes.content;
    } else if (normalized.endsWith('yarn.lock')) {
      rawYarnLockContent = fileRes.content;
    } else if (normalized.endsWith('pnpm-lock.yaml') || normalized.endsWith('pnpm-lock.yml')) {
      rawPnpmLockContent = fileRes.content;
    } else {
      // Non-npm multi-ecosystem manifest
      const parsed = parseManifest(manifestPath, fileRes.content);
      if (parsed) {
        if (parsed.parseErrors.length > 0) warnings.push(...parsed.parseErrors);
        allDiscoveredPackages.push(...parsed.packages);
        addEvent('manifest_parse', 'success', `Parsed ${manifestPath} (${parsed.packages.length} packages discovered in ${parsed.ecosystem})`, {
          file: manifestPath,
          ecosystem: parsed.ecosystem,
          packageCount: parsed.packages.length,
          isLockfile: parsed.isLockfile,
        });
      }
    }
  }

  // Reconcile and resolve npm ecosystem dependencies
  let npmPackagesToScan: DependencyPackage[] = [];

  if (rawPackageLockContent) {
    const parsedLock = parsePackageLockJson(rawPackageLockContent, 'package-lock.json');
    if (parsedLock.parseErrors.length > 0) warnings.push(...parsedLock.parseErrors);
    addEvent('manifest_parse', 'success', `Found package-lock.json (${parsedLock.packages.length} resolved packages)`, {
      file: 'package-lock.json',
      packageCount: parsedLock.packages.length,
      isLockfile: true,
    });

    if (rawPackageJsonContent) {
      const parsedPkgJson = parsePackageJson(rawPackageJsonContent, 'package.json');
      if (parsedPkgJson.parseErrors.length > 0) warnings.push(...parsedPkgJson.parseErrors);
      npmPackagesToScan = reconcileWithLockfile(parsedPkgJson.packages, parsedLock.packages);
    } else {
      npmPackagesToScan = parsedLock.packages;
    }
  } else if (rawYarnLockContent) {
    const parsedYarn = parseYarnLock(rawYarnLockContent, 'yarn.lock');
    if (parsedYarn.parseErrors.length > 0) warnings.push(...parsedYarn.parseErrors);
    addEvent('manifest_parse', 'success', `Found yarn.lock (${parsedYarn.packages.length} resolved packages)`, {
      file: 'yarn.lock',
      packageCount: parsedYarn.packages.length,
      isLockfile: true,
    });

    if (rawPackageJsonContent) {
      const parsedPkgJson = parsePackageJson(rawPackageJsonContent, 'package.json');
      if (parsedPkgJson.parseErrors.length > 0) warnings.push(...parsedPkgJson.parseErrors);
      npmPackagesToScan = reconcileWithLockfile(parsedPkgJson.packages, parsedYarn.packages, parsedYarn.specifierResolutionMap);
    } else {
      npmPackagesToScan = parsedYarn.packages;
    }
  } else if (rawPnpmLockContent) {
    const parsedPnpm = parsePnpmLock(rawPnpmLockContent, 'pnpm-lock.yaml');
    if (parsedPnpm.parseErrors.length > 0) warnings.push(...parsedPnpm.parseErrors);
    addEvent('manifest_parse', 'success', `Found pnpm-lock.yaml (${parsedPnpm.packages.length} resolved packages)`, {
      file: 'pnpm-lock.yaml',
      packageCount: parsedPnpm.packages.length,
      isLockfile: true,
    });

    if (rawPackageJsonContent) {
      const parsedPkgJson = parsePackageJson(rawPackageJsonContent, 'package.json');
      if (parsedPkgJson.parseErrors.length > 0) warnings.push(...parsedPkgJson.parseErrors);
      npmPackagesToScan = reconcileWithLockfile(parsedPkgJson.packages, parsedPnpm.packages, parsedPnpm.specifierResolutionMap);
    } else {
      npmPackagesToScan = parsedPnpm.packages;
    }
  } else if (rawPackageJsonContent) {
    const parsedPkgJson = parsePackageJson(rawPackageJsonContent, 'package.json');
    if (parsedPkgJson.parseErrors.length > 0) warnings.push(...parsedPkgJson.parseErrors);
    addEvent('manifest_parse', 'warning', `Found package.json without a lockfile (${parsedPkgJson.packages.length} declared dependencies). Exact installed versions cannot be verified.`);
    warnings.push(
      'Only package.json detected without a lockfile (package-lock.json, yarn.lock, or pnpm-lock.yaml). Without a lockfile, exact installed versions cannot be verified; dependency findings are flagged as VERSION_UNVERIFIED.'
    );
    isAnalysisIncomplete = true;
    npmPackagesToScan = parsedPkgJson.packages;
  }

  // Deduplicate npm packages
  const dedupedNpm = new Map<string, DependencyPackage>();
  for (const pkg of npmPackagesToScan) {
    const key = `${pkg.name}@${pkg.version}`;
    if (!dedupedNpm.has(key)) {
      dedupedNpm.set(key, pkg);
    }
  }

  const finalPackages: DependencyPackage[] = [...dedupedNpm.values(), ...allDiscoveredPackages];
  totalDependencies = finalPackages.length;

  if (manifestsFound.length === 0) {
    addEvent('manifest_parse', 'info', 'No package manifests detected in repository.');
  }

  // Stage 5: Query OSV for All Discovered Packages
  if (finalPackages.length > 0) {
    addEvent('osv_query', 'info', `Querying OSV vulnerability database for ${finalPackages.length} packages...`);
    const osvRes = await queryOsvForPackages(finalPackages, repoMeta.fullName, repoMeta.resolvedCommitSha || repoMeta.latestCommitSha);
    if (osvRes.apiSuccess) {
      allFindings.push(...osvRes.findings);
      addEvent(
        'osv_query',
        osvRes.findings.length > 0 ? 'warning' : 'success',
        `OSV query complete: ${osvRes.findings.length} advisories identified across ${osvRes.vulnerablePackagesCount} packages.`,
        { vulnCount: osvRes.findings.length }
      );
    } else {
      isAnalysisIncomplete = true;
      warnings.push(`OSV API: ${osvRes.errorMessage}. Dependency analysis could not be completed; 0 confirmed vulnerabilities does NOT prove that dependencies are safe.`);
      addEvent('osv_query', 'error', `OSV API query encountered an error: ${osvRes.errorMessage}`);
    }
  }

  // Stage 6: Discover and Inspect GitHub Actions Workflows
  addEvent('actions_inspect', 'info', 'Discovering and inspecting GitHub Actions workflows...');
  let workflowPaths: string[] = [];

  if (filesToScan.length > 0) {
    workflowPaths = filesToScan
      .map((f) => f.path)
      .filter((p) => p.startsWith('.github/workflows/') && (p.endsWith('.yml') || p.endsWith('.yaml')));
  }

  if (workflowPaths.length > 0) {
    for (const wfPath of workflowPaths) {
      const fileRes = await fetchRawFile(repoMeta.owner, repoMeta.repo, activeBranchOrSha, wfPath, token);
      if (fileRes.content) {
        workflowsFound.push(wfPath);
        const inspection = inspectWorkflow(fileRes.content, wfPath, repoMeta.fullName, repoMeta.resolvedCommitSha || repoMeta.latestCommitSha);
        allFindings.push(...inspection.findings);

        // Secret inspection on workflow files
        const secFindings = inspectFileForSecrets(fileRes.content, wfPath, repoMeta.fullName, repoMeta.resolvedCommitSha);
        if (secFindings.length > 0) allFindings.push(...secFindings);
      }
    }
  } else {
    // Fall back to fetchWorkflows API
    const workflowsRes = await fetchWorkflows(repoMeta.owner, repoMeta.repo, activeBranchOrSha, token);
    if (workflowsRes.warnings.length > 0) warnings.push(...workflowsRes.warnings);

    for (const wf of workflowsRes.workflows) {
      workflowsFound.push(wf.path);
      const inspection = inspectWorkflow(wf.content, wf.path, repoMeta.fullName, repoMeta.resolvedCommitSha || repoMeta.latestCommitSha);
      allFindings.push(...inspection.findings);

      const secFindings = inspectFileForSecrets(wf.content, wf.path, repoMeta.fullName, repoMeta.resolvedCommitSha);
      if (secFindings.length > 0) allFindings.push(...secFindings);
    }
  }

  addEvent(
    'actions_inspect',
    workflowsFound.length > 0 ? 'success' : 'info',
    `Inspected ${workflowsFound.length} workflow file(s); ${allFindings.filter((f) => f.category !== 'dependency_vulnerability').length} workflow findings identified.`,
    { workflowsCount: workflowsFound.length }
  );

  // Stage 7: Dockerfile & Container Security Analysis
  addEvent('docker_analysis', 'info', 'Auditing Dockerfiles and container configurations...');
  const dockerPaths = filesToScan
    .map((f) => f.path)
    .filter((p) => /(?:^|\/)Dockerfile(?:\..*)?$/i.test(p) || /(?:^|\/)Containerfile$/i.test(p));

  // If tree not available, probe standard root Dockerfile
  if (dockerPaths.length === 0 && filesToScan.length === 0) {
    dockerPaths.push('Dockerfile');
  }

  for (const dPath of dockerPaths.slice(0, 10)) {
    const fileRes = await fetchRawFile(repoMeta.owner, repoMeta.repo, activeBranchOrSha, dPath, token);
    if (fileRes.content) {
      const dockerFindings = inspectDockerfile(fileRes.content, dPath, repoMeta.fullName, repoMeta.resolvedCommitSha);
      if (dockerFindings.length > 0) {
        allFindings.push(...dockerFindings);
      }
      const secFindings = inspectFileForSecrets(fileRes.content, dPath, repoMeta.fullName, repoMeta.resolvedCommitSha);
      if (secFindings.length > 0) allFindings.push(...secFindings);
    }
  }

  // Stage 8: CycloneDX SBOM Generation
  addEvent('sbom_generate', 'info', 'Generating CycloneDX v1.5 Software Bill of Materials (SBOM)...');
  const sbom = generateCycloneDxBom(repoMeta, finalPackages, allFindings, SCANNER_VERSION);

  // Stage 9: Complete Scan
  addEvent('complete', 'success', `Scan completed: ${allFindings.length} total findings cataloged across ${manifestsFound.length + workflowsFound.length} files.`, {
    totalFindings: allFindings.length,
    dependenciesScanned: totalDependencies,
    workflowsScanned: workflowsFound.length,
  });

  const filesAnalyzedCount = manifestsFound.length + workflowsFound.length;

  return assembleScanResult(
    repoMeta,
    allFindings,
    timeline,
    manifestsFound,
    workflowsFound,
    unsupportedManifestsFound,
    totalDependencies,
    warnings,
    errors,
    isAnalysisIncomplete,
    filesDiscoveredCount || filesAnalyzedCount,
    filesAnalyzedCount,
    filesSkippedCount,
    isScanTruncated,
    truncationReason,
    Date.now() - startTime,
    sbom,
    finalPackages
  );
}

function assembleScanResult(
  repoMeta: RepositoryMetadata,
  findings: Finding[],
  timeline: ScanTimelineEvent[],
  manifestsFound: string[],
  workflowsFound: string[],
  unsupportedManifestsFound: string[],
  dependenciesScanned: number,
  warnings: string[],
  errors: string[],
  isAnalysisIncomplete: boolean = false,
  filesDiscovered: number = 0,
  filesAnalyzed: number = 0,
  filesSkipped: number = 0,
  isScanTruncated: boolean = false,
  truncationReason?: string,
  durationMs: number = 0,
  sbomCycloneDx?: Record<string, unknown>,
  packagesScanned?: DependencyPackage[]
): ScanResult {
  // Build dependency graph if packages are provided
  const dependencyGraph = packagesScanned && packagesScanned.length > 0
    ? buildDependencyGraph({
        rootName: repoMeta.fullName || repoMeta.repo || 'Target Application',
        rootVersion: repoMeta.resolvedCommitSha?.slice(0, 7) || repoMeta.defaultBranch || 'main',
        packages: packagesScanned,
        findings,
        manifestPath: manifestsFound[0] || 'package.json',
      })
    : undefined;

  // Enrich findings with tri-part evidence (Observed facts, Inferred risks, Unknowns)
  const enrichedFindings = findings.map((f) => {
    const detail = enrichFindingWithEvidence(f, dependencyGraph);
    return detail.finding;
  });

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
      case 'critical':
        criticalCount++;
        break;
      case 'high':
        highCount++;
        break;
      case 'medium':
        mediumCount++;
        break;
      case 'low':
        lowCount++;
        break;
      case 'info':
        infoCount++;
        break;
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

  // Determine honest scan verdict
  let scanVerdict: ScanStatusVerdict = 'complete_with_findings';
  if (errors.length > 0 && enrichedFindings.length === 0) {
    scanVerdict = 'scan_failed';
  } else if (isAnalysisIncomplete) {
    scanVerdict = 'incomplete_evidence_required';
  } else if (enrichedFindings.length === 0) {
    scanVerdict = 'complete_clean';
  } else {
    scanVerdict = 'complete_with_findings';
  }

  const coverage: CoverageReport = {
    commitSha: repoMeta.resolvedCommitSha || repoMeta.latestCommitSha || 'unknown',
    filesDiscovered: Math.max(filesDiscovered, manifestsFound.length + workflowsFound.length),
    filesAnalyzed: manifestsFound.length + workflowsFound.length,
    filesSkipped,
    manifestsDetected: manifestsFound,
    lockfilesDetected: manifestsFound.filter((m) => m.includes('lock') || m.includes('sum')),
    dependenciesDiscovered: dependenciesScanned,
    exactVersionsResolved,
    unresolvedRanges,
    unsupportedManifests: unsupportedManifestsFound,
    parserErrors: warnings.filter((w) => w.toLowerCase().includes('failed to parse')),
    upstreamFailures: errors.filter((e) => e.toLowerCase().includes('osv') || e.toLowerCase().includes('github')),
    rateLimitRemaining: repoMeta.rateLimitRemaining,
    scanTruncated: isScanTruncated,
    truncationReason,
    vulnerabilitySources: ['Google OSV (CVE / GHSA / OSV Database)'],
    workflowFilesAnalyzed: workflowsFound.length,
    analyzersCompleted: [
      'Multi-Ecosystem Manifest Resolver',
      'OSV Vulnerability Correlator',
      'GitHub Actions AST Security Engine',
      'Secret Leak Detector',
      'Dockerfile Security Analyzer',
      'CycloneDX SBOM Generator',
      'Dependency Lineage & Attack Graph Builder',
    ],
    durationMs,
  };

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
      dependenciesScanned,
      workflowsScanned: workflowsFound.length,
    },
    coverage,
    manifestsFound,
    workflowsFound,
    unsupportedManifestsFound,
    isAnalysisIncomplete,
    warnings,
    errors,
    sbomCycloneDx,
    dependencyGraph,
  };
}
