/**
 * GitHub Actions YAML AST Analysis Engine
 * Uses deterministic AST parsing to inspect workflow structure, line numbers,
 * permissions, actions pinning, and unsafe script patterns.
 */

import { parseDocument, LineCounter } from 'yaml';
import { Finding, FindingCategory, Severity } from '../types';
import { GHA_RULES } from './rules';
import { createRedactedSnippet } from '../redaction';

export interface ActionInspectionResult {
  filePath: string;
  findings: Finding[];
  isValidYaml: boolean;
  parseError?: string;
}

/**
 * Checks whether a reference tag is a full 40-character hexadecimal commit SHA
 */
export function isCommitSha(ref: string): boolean {
  return /^[0-9a-fA-F]{40}$/.test(ref.trim());
}

/**
 * Finds the 1-based line number for a needle or key in YAML content
 */
function findLineNumber(content: string, pattern: RegExp | string, startLine: number = 1): number {
  const lines = content.split('\n');
  const startIndex = Math.max(0, startLine - 1);

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (typeof pattern === 'string') {
      if (line.includes(pattern)) return i + 1;
    } else {
      if (pattern.test(line)) return i + 1;
    }
  }

  return 1;
}

/**
 * Inspects a GitHub Actions workflow YAML string as data
 */
export function inspectWorkflow(
  content: string,
  filePath: string = '.github/workflows/workflow.yml',
  repository: string = 'local/repository',
  commitSha?: string
): ActionInspectionResult {
  const findings: Finding[] = [];
  const lineCounter = new LineCounter();

  let doc;
  try {
    doc = parseDocument(content, { lineCounter, keepSourceTokens: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const line = 1;
    const rule = GHA_RULES['GHA-006'];
    findings.push({
      id: `MALFORMED-${filePath}-L1`,
      title: `YAML Syntax Error in ${filePath}`,
      category: 'malformed_config',
      severity: 'high',
      severityRationale: 'Malformed YAML prevents GitHub Actions from executing or parsing security parameters.',
      repository,
      commitSha,
      filePath,
      lineNumber: line,
      observedValue: msg,
      evidenceSnippet: createRedactedSnippet(content, line),
      detectionSource: 'YAML Parser Validator',
      recommendedAction: 'Correct the YAML syntax error in the workflow file.',
      confidence: 'confirmed',
      limitations: 'Syntactically invalid YAML cannot be evaluated for semantic security rules.',
      verificationStatus: 'unverified',
    });

    return {
      filePath,
      findings,
      isValidYaml: false,
      parseError: msg,
    };
  }

  if (doc.errors && doc.errors.length > 0) {
    const firstErr = doc.errors[0];
    const pos = firstErr.pos ? lineCounter.linePos(firstErr.pos[0]) : { line: 1, col: 1 };
    findings.push({
      id: `MALFORMED-${filePath}-L${pos.line}-C${pos.col}`,
      title: `YAML Syntax Error at line ${pos.line}, col ${pos.col}: ${firstErr.message.split('\n')[0]}`,
      category: 'malformed_config',
      severity: 'high',
      severityRationale: 'YAML syntax error prevents deterministic parsing and workflow validation.',
      repository,
      commitSha,
      filePath,
      lineNumber: pos.line,
      observedValue: `Line ${pos.line}, Column ${pos.col}: ${firstErr.message.split('\n')[0]}`,
      evidenceSnippet: createRedactedSnippet(content, pos.line),
      detectionSource: 'YAML Parser Validator',
      recommendedAction: 'Correct the YAML indentation or syntax error.',
      confidence: 'confirmed',
      limitations: 'Syntax error stops security analysis at the failure point.',
      verificationStatus: 'unverified',
    });

    return {
      filePath,
      findings,
      isValidYaml: false,
      parseError: firstErr.message,
    };
  }

  const json = doc.toJSON() || {};

  // Check GHA-006: Missing top-level permissions
  if (json.jobs && !json.permissions) {
    const rule = GHA_RULES['GHA-006'];
    const line = findLineNumber(content, 'jobs:');
    findings.push({
      id: `GHA-006-${filePath}-L${line}`,
      title: `${rule.name} in ${filePath}`,
      category: rule.category,
      severity: rule.severity,
      severityRationale: rule.severityRationale,
      repository,
      commitSha,
      filePath,
      lineNumber: line,
      observedValue: 'No top-level "permissions" key declared',
      evidenceSnippet: createRedactedSnippet(content, line),
      detectionSource: `Sentinel Rule ${rule.id}`,
      recommendedAction: rule.recommendedAction,
      confidence: 'high',
      limitations: rule.limitations,
      verificationStatus: 'unverified',
    });
  }

  // Check GHA-002: Overly Permissive Permissions (permissions: write-all)
  if (json.permissions === 'write-all' || (typeof json.permissions === 'object' && json.permissions?.['write-all'])) {
    const rule = GHA_RULES['GHA-002'];
    const line = findLineNumber(content, /permissions:\s*['"]?write-all/i);
    findings.push({
      id: `GHA-002-${filePath}-L${line}`,
      title: `${rule.name} in ${filePath}`,
      category: rule.category,
      severity: rule.severity,
      severityRationale: rule.severityRationale,
      repository,
      commitSha,
      filePath,
      lineNumber: line,
      observedValue: 'permissions: write-all',
      evidenceSnippet: createRedactedSnippet(content, line),
      detectionSource: `Sentinel Rule ${rule.id}`,
      recommendedAction: rule.recommendedAction,
      confidence: 'confirmed',
      limitations: rule.limitations,
      verificationStatus: 'unverified',
    });
  }

  // Check trigger: pull_request_target
  let hasPullRequestTarget = false;
  if (json.on) {
    if (json.on === 'pull_request_target') {
      hasPullRequestTarget = true;
    } else if (Array.isArray(json.on) && json.on.includes('pull_request_target')) {
      hasPullRequestTarget = true;
    } else if (typeof json.on === 'object' && 'pull_request_target' in json.on) {
      hasPullRequestTarget = true;
    }
  }

  // Inspect Jobs and Steps
  if (json.jobs && typeof json.jobs === 'object') {
    for (const [jobId, job] of Object.entries<any>(json.jobs)) {
      if (!job || typeof job !== 'object') continue;

      // Job-level permissions: write-all
      if (job.permissions === 'write-all') {
        const rule = GHA_RULES['GHA-002'];
        const line = findLineNumber(content, /permissions:\s*['"]?write-all/i);
        findings.push({
          id: `GHA-002-${filePath}-job-${jobId}-L${line}`,
          title: `${rule.name} in job '${jobId}'`,
          category: rule.category,
          severity: rule.severity,
          severityRationale: rule.severityRationale,
          repository,
          commitSha,
          filePath,
          lineNumber: line,
          observedValue: `Job '${jobId}' specifies permissions: write-all`,
          evidenceSnippet: createRedactedSnippet(content, line),
          detectionSource: `Sentinel Rule ${rule.id}`,
          recommendedAction: rule.recommendedAction,
          confidence: 'confirmed',
          limitations: rule.limitations,
          verificationStatus: 'unverified',
        });
      }

      const steps = Array.isArray(job.steps) ? job.steps : [];

      for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
        const step = steps[stepIdx];
        if (!step || typeof step !== 'object') continue;

        // Check GHA-001: Unpinned third-party action
        if (typeof step.uses === 'string') {
          const usesStr = step.uses.trim();

          // Ignore local actions (./.github/actions/...) and docker://
          if (!usesStr.startsWith('./') && !usesStr.startsWith('docker://') && usesStr.includes('@')) {
            const [actionName, ref] = usesStr.split('@');
            if (actionName && ref) {
              const cleanRef = ref.split('#')[0].trim(); // strip comment if any

              if (!isCommitSha(cleanRef)) {
                const rule = GHA_RULES['GHA-001'];
                const line = findLineNumber(content, usesStr);

                findings.push({
                  id: `GHA-001-${filePath}-job-${jobId}-step${stepIdx}-${actionName.replace(/[^a-zA-Z0-9_-]/g, '_')}-L${line}`,
                  title: `Unpinned Action Reference: ${usesStr} in job '${jobId}'`,
                  category: rule.category,
                  severity: rule.severity,
                  severityRationale: rule.severityRationale,
                  repository,
                  commitSha,
                  filePath,
                  lineNumber: line,
                  observedValue: usesStr,
                  evidenceSnippet: createRedactedSnippet(content, line),
                  detectionSource: `Sentinel Rule ${rule.id}`,
                  recommendedAction: `Pin ${actionName} to an immutable 40-character commit SHA (e.g. ${actionName}@<sha> # ${ref}).`,
                  confidence: 'confirmed',
                  limitations: rule.limitations,
                  verificationStatus: 'unverified',
                });
              }
            }
          }

          // Check GHA-003: pull_request_target with untrusted checkout
          if (hasPullRequestTarget && usesStr.includes('actions/checkout')) {
            const checkoutRef = step.with?.ref;
            if (
              typeof checkoutRef === 'string' &&
              (checkoutRef.includes('github.event.pull_request.head.sha') ||
                checkoutRef.includes('github.event.pull_request.head.ref') ||
                checkoutRef.includes('github.head_ref'))
            ) {
              const rule = GHA_RULES['GHA-003'];
              const line = findLineNumber(content, checkoutRef);
              findings.push({
                id: `GHA-003-${filePath}-job-${jobId}-step${stepIdx}-L${line}`,
                title: `${rule.name} in job '${jobId}'`,
                category: rule.category,
                severity: rule.severity,
                severityRationale: rule.severityRationale,
                repository,
                commitSha,
                filePath,
                lineNumber: line,
                observedValue: `Checkout ref: ${checkoutRef} under pull_request_target`,
                evidenceSnippet: createRedactedSnippet(content, line),
                detectionSource: `Sentinel Rule ${rule.id}`,
                recommendedAction: rule.recommendedAction,
                confidence: 'confirmed',
                limitations: rule.limitations,
                verificationStatus: 'unverified',
              });
            }
          }
        }

        // Check run scripts for GHA-004 and GHA-005
        if (typeof step.run === 'string') {
          const runScript = step.run;

          // Check GHA-004: Potential Script Injection
          const untrustedContextRegex = /\$\{\{\s*(?:github\.event\.(?:issue|pull_request|comment|review|discussion)\.(?:title|body|head\.ref)|github\.head_ref|github\.event\.head_commit\.message|github\.event\.inputs\.[a-zA-Z0-9_-]+|github\.event\.client_payload\.[a-zA-Z0-9_-]+)\s*\}\}/i;
          const injectionMatch = untrustedContextRegex.exec(runScript);
          if (injectionMatch) {
            const rule = GHA_RULES['GHA-004'];
            const line = findLineNumber(content, injectionMatch[0]);
            findings.push({
              id: `GHA-004-${filePath}-job-${jobId}-step${stepIdx}-L${line}`,
              title: `${rule.name} in job '${jobId}'`,
              category: rule.category,
              severity: rule.severity,
              severityRationale: rule.severityRationale,
              repository,
              commitSha,
              filePath,
              lineNumber: line,
              observedValue: injectionMatch[0],
              evidenceSnippet: createRedactedSnippet(content, line),
              detectionSource: `Sentinel Rule ${rule.id}`,
              recommendedAction: rule.recommendedAction,
              confidence: 'high',
              limitations: rule.limitations,
              verificationStatus: 'unverified',
            });
          }

          // Check GHA-005: Pipe to shell (curl/wget | sh, bash, python, perl, ruby)
          const pipeToShellRegex = /(?:curl|wget)\s+[^|\n]+\|\s*(?:sudo\s+)?(?:\/bin\/)?(?:ba|z)?(?:sh|bash|python|python3|perl|ruby)\b/i;
          const pipeMatch = pipeToShellRegex.exec(runScript);
          if (pipeMatch) {
            const rule = GHA_RULES['GHA-005'];
            const line = findLineNumber(content, pipeMatch[0]);
            findings.push({
              id: `GHA-005-${filePath}-job-${jobId}-step${stepIdx}-L${line}`,
              title: `${rule.name} in job '${jobId}'`,
              category: rule.category,
              severity: rule.severity,
              severityRationale: rule.severityRationale,
              repository,
              commitSha,
              filePath,
              lineNumber: line,
              observedValue: pipeMatch[0],
              evidenceSnippet: createRedactedSnippet(content, line),
              detectionSource: `Sentinel Rule ${rule.id}`,
              recommendedAction: rule.recommendedAction,
              confidence: 'high',
              limitations: rule.limitations,
              verificationStatus: 'unverified',
            });
          }

          // Check GHA-007: Exposed Secret Printing
          const secretEchoRegex = /(?:echo|printf?)\s+.*?\$\{\{\s*secrets\.[a-zA-Z0-9_]+\s*\}\}/i;
          const secretMatch = secretEchoRegex.exec(runScript);
          if (secretMatch) {
            const rule = GHA_RULES['GHA-007'];
            const line = findLineNumber(content, /\$\{\{\s*secrets\./i);
            findings.push({
              id: `GHA-007-${filePath}-job-${jobId}-step${stepIdx}-L${line}`,
              title: `${rule.name} in job '${jobId}'`,
              category: rule.category,
              severity: rule.severity,
              severityRationale: rule.severityRationale,
              repository,
              commitSha,
              filePath,
              lineNumber: line,
              observedValue: secretMatch[0],
              evidenceSnippet: createRedactedSnippet(content, line),
              detectionSource: `Sentinel Rule ${rule.id}`,
              recommendedAction: rule.recommendedAction,
              confidence: 'confirmed',
              limitations: rule.limitations,
              verificationStatus: 'unverified',
            });
          }
        }
      }

      // Check GHA-008: Insecure self-hosted runner on pull request trigger
      const runsOn = job['runs-on'];
      const isSelfHosted =
        runsOn === 'self-hosted' ||
        (Array.isArray(runsOn) && runsOn.includes('self-hosted'));
      const hasPrTrigger =
        hasPullRequestTarget ||
        json.on === 'pull_request' ||
        (Array.isArray(json.on) && json.on.includes('pull_request')) ||
        (typeof json.on === 'object' && json.on !== null && 'pull_request' in json.on);

      if (isSelfHosted && hasPrTrigger) {
        const rule = GHA_RULES['GHA-008'];
        const line = findLineNumber(content, /runs-on:\s*self-hosted/i);
        findings.push({
          id: `GHA-008-${filePath}-job-${jobId}-L${line}`,
          title: `${rule.name} in job '${jobId}'`,
          category: rule.category,
          severity: rule.severity,
          severityRationale: rule.severityRationale,
          repository,
          commitSha,
          filePath,
          lineNumber: line,
          observedValue: `Job '${jobId}' runs on self-hosted with pull request trigger`,
          evidenceSnippet: createRedactedSnippet(content, line),
          detectionSource: `Sentinel Rule ${rule.id}`,
          recommendedAction: rule.recommendedAction,
          confidence: 'high',
          limitations: rule.limitations,
          verificationStatus: 'unverified',
        });
      }
    }
  }

  return {
    filePath,
    findings,
    isValidYaml: true,
  };
}
