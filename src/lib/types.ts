export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingCategory =
  | 'workflow_security'
  | 'dependency_vulnerability'
  | 'action_pinning'
  | 'permission_risk'
  | 'injection_risk'
  | 'malformed_config'
  | 'secret_leak'
  | 'docker_security'
  | 'license_risk';

export type ConfidenceLevel = 'confirmed' | 'high' | 'medium' | 'low' | 'version_unverified';

export type VerificationStatus = 'unverified' | 'verified_fixed' | 'still_vulnerable' | 'version_unverified';

export type DependencySpecifierType =
  | 'exact'
  | 'range'
  | 'alias'
  | 'workspace'
  | 'local_link'
  | 'git'
  | 'unsupported';

export type SupportedEcosystem =
  | 'npm'
  | 'PyPI'
  | 'Go'
  | 'crates.io'
  | 'Maven'
  | 'Packagist'
  | 'RubyGems'
  | 'NuGet';

export type ScanStatusVerdict =
  | 'complete_with_findings'
  | 'complete_clean'
  | 'incomplete_evidence_required'
  | 'scan_failed';

export interface Finding {
  id: string;
  title: string;
  category: FindingCategory;
  severity: Severity;
  severityRationale: string;
  repository: string;
  commitSha?: string;
  filePath: string;
  lineNumber?: number;
  endLineNumber?: number;
  columnNumber?: number;
  observedValue: string;
  evidenceSnippet: string;
  detectionSource: string; // e.g. "Sentinel Rule GHA-001" or "OSV: GHSA-xxxx / CVE-yyyy"
  recommendedAction: string;
  confidence: ConfidenceLevel;
  limitations: string;
  verificationStatus: VerificationStatus;
  advisoryUrl?: string;
  aliases?: string[]; // e.g. CVE-2021-xxxx
  cvssScore?: number;
  fixedVersion?: string;
  remediationAdvice?: string;
}

export interface DependencyPackage {
  name: string;
  version: string;
  ecosystem: SupportedEcosystem;
  isDirect: boolean;
  manifestPath: string;
  lineNumber?: number;
  rawSpecifier?: string;
  isExactVersion?: boolean;
  specifierType?: DependencySpecifierType;
  resolvedFromLockfile?: boolean;
  resolvedPackageName?: string;
  purl?: string;
  dependencyScope?: 'production' | 'development' | 'peer' | 'optional';
  parentPackage?: string;
}

export interface ParsedManifestResult {
  manifestPath: string;
  ecosystem: SupportedEcosystem;
  isLockfile: boolean;
  packages: DependencyPackage[];
  parseErrors: string[];
  unsupportedFeatures?: string[];
}

export interface WorkflowFile {
  path: string;
  content: string;
  sha?: string;
}

export interface DiscoveredFile {
  path: string;
  size?: number;
  sha?: string;
  type: 'blob' | 'tree';
}

export interface ScanTimelineEvent {
  id: string;
  timestamp: string;
  stage:
    | 'validate'
    | 'fetch'
    | 'tree_discover'
    | 'manifest_parse'
    | 'osv_query'
    | 'actions_inspect'
    | 'secret_analysis'
    | 'docker_analysis'
    | 'sbom_generate'
    | 'complete'
    | 'error';
  status: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export interface RepositoryMetadata {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  requestedRef?: string;
  subdirectory?: string;
  latestCommitSha?: string;
  resolvedCommitSha?: string;
  description?: string;
  stars?: number;
  isFork?: boolean;
  isArchived?: boolean;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  canonicalUrl?: string;
}

export type PackageScanInfo = DependencyPackage;

export interface CoverageReport {
  commitSha: string;
  filesDiscovered: number;
  filesAnalyzed: number;
  filesSkipped: number;
  manifestsDetected: string[];
  lockfilesDetected: string[];
  dependenciesDiscovered: number;
  exactVersionsResolved: number;
  unresolvedRanges: number;
  unsupportedManifests: string[];
  parserErrors: string[];
  upstreamFailures: string[];
  rateLimitRemaining?: number;
  scanTruncated: boolean;
  truncationReason?: string;
  vulnerabilitySources: string[];
  workflowFilesAnalyzed: number;
  analyzersCompleted: string[];
  durationMs: number;
}

export interface ScanResult {
  repository: RepositoryMetadata;
  scannedAt: string;
  scannerVersion: string;
  scanVerdict: ScanStatusVerdict;
  findings: Finding[];
  timeline: ScanTimelineEvent[];
  stats: {
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
    confirmedCount: number;
    potentialRiskCount: number;
    versionUnverifiedCount: number;
    unknownCount: number;
    filesScanned: number;
    dependenciesScanned: number;
    workflowsScanned: number;
  };
  coverage: CoverageReport;
  manifestsFound: string[];
  workflowsFound: string[];
  unsupportedManifestsFound?: string[];
  isAnalysisIncomplete?: boolean;
  warnings: string[];
  errors: string[];
  sbomCycloneDx?: Record<string, unknown>;
}

export interface FixVerificationComparison {
  ruleId: string;
  title: string;
  beforeFinding?: Finding;
  afterFinding?: Finding;
  status: 'resolved' | 'still_vulnerable' | 'new_risk_introduced';
  explanation: string;
}

export interface FixVerificationResult {
  verifiedAt: string;
  fixtureName: string;
  beforeFindingsCount: number;
  afterFindingsCount: number;
  resolvedFindingsCount: number;
  remainingFindingsCount: number;
  comparisons: FixVerificationComparison[];
  allPassed: boolean;
  beforeYaml: string;
  afterYaml: string;
}

export interface DependencyRemediationProposal {
  packageName: string;
  currentVersion: string;
  proposedVersion: string;
  ecosystem: SupportedEcosystem;
  targetManifest: string;
  advisoryId: string;
  isFixedInProposedVersion: boolean;
  rationale: string;
}
