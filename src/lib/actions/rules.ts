/**
 * Deterministic GitHub Actions Security Rules
 */

import { Finding, Severity, FindingCategory } from '../types';

export interface ActionSecurityRule {
  id: string;
  name: string;
  category: FindingCategory;
  severity: Severity;
  severityRationale: string;
  rationale: string;
  limitations: string;
  recommendedAction: string;
}

export const GHA_RULES: Record<string, ActionSecurityRule> = {
  'GHA-001': {
    id: 'GHA-001',
    name: 'Unpinned Third-Party Action Reference',
    category: 'action_pinning',
    severity: 'medium',
    severityRationale:
      'Git tags and branches are mutable pointers. If an upstream repository or maintainer credential is compromised, malicious code can be published under the same tag.',
    rationale:
      'Referencing an action by tag (e.g. @v3) or branch (@main) leaves the pipeline vulnerable to supply chain tampering. Pinned full-length 40-character commit SHAs guarantee immutable code execution.',
    limitations:
      'A mutable reference represents an architectural supply-chain risk; it does not claim that the upstream action or maintainer is actively compromised.',
    recommendedAction:
      'Pin the action to its full 40-character commit SHA and document the human-readable tag in a comment (e.g., uses: actions/checkout@24cbbfd34f15af1204a74c4045f45fe8686d57f7 # v3.5.2).',
  },
  'GHA-002': {
    id: 'GHA-002',
    name: 'Overly Permissive Workflow Permissions (write-all)',
    category: 'permission_risk',
    severity: 'high',
    severityRationale:
      'The write-all permission grants write access to all repository scopes, dramatically increasing the blast radius of any compromised step or dependency.',
    rationale:
      'Workflows should strictly follow the principle of least privilege. Granting write-all allows malicious actions or injected scripts to overwrite code, releases, packages, and security alerts.',
    limitations:
      'Excessive permissions do not initiate an attack on their own, but they provide the capabilities needed for lateral movement and credential abuse if code is compromised.',
    recommendedAction:
      'Remove permissions: write-all and explicitly specify minimal read-only permissions at top level (e.g., permissions: contents: read), adding specific scopes only to jobs that need them.',
  },
  'GHA-003': {
    id: 'GHA-003',
    name: 'Dangerous pull_request_target with Untrusted Code Checkout',
    category: 'workflow_security',
    severity: 'critical',
    severityRationale:
      'pull_request_target triggers with repository write tokens and access to secrets. Checking out untrusted PR head code allows external attackers to run arbitrary code with elevated privileges.',
    rationale:
      'Checking out pull request head code under pull_request_target allows any public contributor to submit a pull request modifying workflow scripts or test runners to exfiltrate secrets or backdoor the repo.',
    limitations:
      'pull_request_target is safe when operating solely on PR metadata (labels, issue comments) or base branch code without executing PR branch assets.',
    recommendedAction:
      'Switch to standard on: pull_request which runs in an isolated read-only context without secrets. Never checkout github.event.pull_request.head.sha under pull_request_target.',
  },
  'GHA-004': {
    id: 'GHA-004',
    name: 'Potential Script Injection via Untrusted GitHub Context',
    category: 'injection_risk',
    severity: 'high',
    severityRationale:
      'Untrusted user input interpolated directly into inline shell scripts allows command injection and arbitrary code execution on the runner.',
    rationale:
      'GitHub context fields like issue titles, PR titles, and comment bodies are controlled by external users. Inlining them inside run: blocks (${{ github.event.issue.title }}) permits bash injection.',
    limitations:
      'Static detection identifies unsafe interpolation patterns. Actual exploitability depends on whether user input contains shell metacharacters.',
    recommendedAction:
      'Pass untrusted context values through intermediate environment variables: env: TITLE: ${{ github.event.issue.title }} and reference them safely as "$TITLE" in the script.',
  },
  'GHA-005': {
    id: 'GHA-005',
    name: 'Unverified Remote Script Execution (Pipe to Shell)',
    category: 'workflow_security',
    severity: 'medium',
    severityRationale:
      'Piping remote web scripts directly to shell interpreters (curl | bash) creates an unverified runtime supply chain dependency.',
    rationale:
      'If the remote host, DNS, or CDN is compromised or changes its payload, untrusted instructions will execute automatically without verification.',
    limitations:
      'Detects pipe-to-shell patterns. Does not inspect TLS configurations or downstream script content.',
    recommendedAction:
      'Download the script file first, verify its SHA256 checksum against a known pinned digest, and then execute the verified local file.',
  },
  'GHA-006': {
    id: 'GHA-006',
    name: 'Missing Explicit Workflow Permissions Declaration',
    category: 'permission_risk',
    severity: 'low',
    severityRationale:
      'Without an explicit permissions block, GitHub Actions applies the repository default, which may grant permissive read-write tokens.',
    rationale:
      'Explicitly specifying permissions guarantees predictable, least-privilege security posture regardless of repository or organization default settings.',
    limitations:
      'If repository settings have been manually configured to default to read-only tokens, the actual exposure may be minimal.',
    recommendedAction:
      'Add top-level permissions: contents: read to the workflow file to ensure immutable least-privilege defaults.',
  },
  'GHA-007': {
    id: 'GHA-007',
    name: 'Exposed Secret or Token in Workflow Step',
    category: 'secret_leak',
    severity: 'high',
    severityRationale:
      'Directly logging or echoing secrets in workflow scripts exposes credentials in build logs, accessible to users with repository read permissions.',
    rationale:
      'GitHub log masking can be bypassed by string manipulation, base64 encoding, or environment dumping. Secrets should never be passed to echo or standard output commands.',
    limitations:
      'Detects direct echo or print commands targeting secrets expressions.',
    recommendedAction:
      'Remove echo statements referencing secrets. Pass secrets strictly through environment variables to trusted action steps without printing.',
  },
  'GHA-008': {
    id: 'GHA-008',
    name: 'Insecure Self-Hosted Runner on Public Repository Trigger',
    category: 'workflow_security',
    severity: 'high',
    severityRationale:
      'Executing public pull requests on self-hosted runners exposes the runner host machine to persistent compromise and credential theft.',
    rationale:
      'GitHub explicitly advises against using self-hosted runners on public repositories with pull_request triggers. Untrusted PR code can access the runner host and local network.',
    limitations:
      'Flags self-hosted runners when combined with pull request event triggers.',
    recommendedAction:
      'Use GitHub-hosted ephemeral runners (e.g. ubuntu-latest) for public PR workflows. Restrict self-hosted runners to internal/private repositories.',
  },
};

