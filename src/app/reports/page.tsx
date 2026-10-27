'use client';

import React, { useState } from 'react';
import { useScan } from '@/lib/context/ScanContext';
import { generateMarkdownReport, isDemoScan } from '@/lib/reports';
import {
  FileText,
  Download,
  Printer,
  FileCode,
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  GitBranch,
  Layers,
  FileJson,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export default function ReportsPage() {
  const { scanResult, isLoading } = useScan();
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  const isDemo = scanResult ? isDemoScan(scanResult) : true;
  const repo = scanResult?.repository;
  const stats = scanResult?.stats;
  const findings = scanResult?.findings || [];
  const graph = scanResult?.dependencyGraph;

  const handleDownload = async (format: 'markdown' | 'json' | 'cyclonedx' | 'html') => {
    if (!scanResult) return;
    setDownloadingFormat(format);
    try {
      const res = await fetch(`/api/export?format=${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: scanResult }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = format === 'markdown' ? 'md' : format === 'html' ? 'html' : 'json';
        a.download = `${repo?.repo || 'sentinel'}-security-report.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Report export failed:', e);
    } finally {
      setDownloadingFormat(null);
    }
  };

  if (isLoading && !scanResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-10 h-10 border-3 border-[#48D9C1]/30 border-t-[#48D9C1] rounded-full animate-spin" />
        <span className="text-xs font-mono text-[#9AAEC4]">Compiling Security Audit Report...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
      {/* Header */}
      <div className="border-b border-[rgba(159,190,220,0.16)] pb-5">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#111F33] border border-[#48D9C1]/30 text-xs font-mono text-[#48D9C1] mb-2">
          <FileText className="w-3.5 h-3.5" />
          <span>Executive & Technical Security Reporting</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F1F6FC] tracking-tight">
          Security Investigation Report
        </h1>
        <p className="text-xs sm:text-sm text-[#9AAEC4] font-mono mt-1">
          Downloadable, evidence-backed security reports documenting scope, methodology, observed facts, inferred risks, and safe remediation roadmaps.
        </p>
      </div>

      {/* Dataset Classification Banner (Mandatory Requirement) */}
      {isDemo ? (
        <div className="p-4 rounded-xl bg-[#FFC36B]/15 border border-[#FFC36B]/30 flex items-start space-x-3 text-xs font-mono text-[#FFC36B]">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[#FFC36B]" />
          <div>
            <strong className="text-[#F1F6FC] block">DATASET CLASSIFICATION: CONTROLLED DEMONSTRATION TEST FIXTURE</strong>
            This report reflects an intentionally isolated synthetic security test fixture (<code>{repo?.fullName}</code>). It is designed to demonstrate supply chain vulnerability correlation and deterministic AST rules. It does not represent an unmanaged live production deployment.
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-[#48D9C1]/15 border border-[#48D9C1]/30 flex items-start space-x-3 text-xs font-mono text-[#48D9C1]">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-[#48D9C1]" />
          <div>
            <strong className="text-[#F1F6FC] block">DATASET CLASSIFICATION: LIVE UPSTREAM AUDIT</strong>
            This report reflects a live static audit of public GitHub repository <code>{repo?.fullName}</code> at commit ref <code>{repo?.resolvedCommitSha?.slice(0, 7) || repo?.defaultBranch}</code>.
          </div>
        </div>
      )}

      {/* Export Toolbar */}
      <div className="p-5 rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] flex flex-wrap items-center justify-between gap-4 font-mono text-xs shadow-xl">
        <div className="space-y-1">
          <span className="text-[#F1F6FC] font-bold block">Download Investigation Artifacts</span>
          <span className="text-[#6E829B] text-[11px]">Choose standard or machine-readable compliance format:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleDownload('markdown')}
            disabled={downloadingFormat !== null}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#48D9C1] border border-[#48D9C1]/30 font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Markdown (.md)</span>
          </button>

          <button
            onClick={() => handleDownload('json')}
            disabled={downloadingFormat !== null}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#65BFFF] border border-[#65BFFF]/30 font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>Audit JSON (.json)</span>
          </button>

          <button
            onClick={() => handleDownload('cyclonedx')}
            disabled={downloadingFormat !== null}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#FFC36B] border border-[#FFC36B]/30 font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>CycloneDX SBOM</span>
          </button>

          <button
            onClick={() => handleDownload('html')}
            disabled={downloadingFormat !== null}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#F1F6FC] border border-[rgba(159,190,220,0.2)] font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Printable HTML</span>
          </button>
        </div>
      </div>

      {/* Live Formatted Report Preview */}
      <div className="rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-6 sm:p-8 space-y-8 font-mono text-xs shadow-xl">
        {/* Section 1: Executive Summary */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#48D9C1] border-b border-[rgba(159,190,220,0.14)] pb-2 flex items-center space-x-2">
            <span>1. Executive Summary & Inventory</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.12)]">
            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Total Findings</span>
              <span className="text-xl font-bold text-[#F1F6FC]">{stats?.totalFindings || 0}</span>
            </div>
            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Critical Severity</span>
              <span className="text-xl font-bold text-[#FF647C]">{stats?.criticalCount || 0}</span>
            </div>
            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">High Severity</span>
              <span className="text-xl font-bold text-[#FFC36B]">{stats?.highCount || 0}</span>
            </div>
            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Dependencies</span>
              <span className="text-xl font-bold text-[#65BFFF]">{stats?.dependenciesScanned || 0}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Audit Scope & Methodology */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#48D9C1] border-b border-[rgba(159,190,220,0.14)] pb-2">
            2. Audit Scope & Methodology
          </h2>
          <p className="text-[#9AAEC4] leading-relaxed">
            The software inventory for <code>{repo?.fullName}</code> was analyzed strictly as static data under zero-code execution policies.
          </p>
          <ul className="list-disc list-inside space-y-1 text-[#9AAEC4]">
            <li>Audited manifests: <code>{scanResult?.manifestsFound.join(', ') || 'None'}</code></li>
            <li>Audited workflows: <code>{scanResult?.workflowsFound.join(', ') || 'None'}</code></li>
            <li>Advisory Provider: Google OSV (Open Source Vulnerabilities) batch database with SemVer boundary checking</li>
            <li>AST Analysis: Deterministic GitHub Actions rules (GHA-001 through GHA-006)</li>
          </ul>
        </div>

        {/* Section 3: Plausible Attack Paths */}
        {graph && graph.attackPaths.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#48D9C1] border-b border-[rgba(159,190,220,0.14)] pb-2">
              3. Plausible Attack Paths Traced
            </h2>
            <div className="space-y-3">
              {graph.attackPaths.map((ap) => (
                <div key={ap.id} className="p-3.5 rounded-xl bg-[#0B1728] border border-[#FF647C]/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#F1F6FC]">{ap.targetPackage}@{ap.targetVersion}</span>
                    <span className="text-[#FF647C] font-bold uppercase text-[10px]">{ap.severity}</span>
                  </div>
                  <div className="text-[#65BFFF] text-[11px]">Lineage: {ap.path.join(' -> ')}</div>
                  <p className="text-[#9AAEC4] text-[11px] leading-relaxed">{ap.plausibilityRationale}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 4: Detailed Findings */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#48D9C1] border-b border-[rgba(159,190,220,0.14)] pb-2">
            4. Detailed Findings Catalog
          </h2>
          <div className="space-y-3">
            {findings.map((f) => (
              <div key={f.id} className="p-4 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.12)] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-[#F1F6FC]">{f.title}</span>
                    <span className="text-[#48D9C1]">[{f.id}]</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${f.severity === 'critical' ? 'bg-[#FF647C]/20 text-[#FF647C]' : 'bg-[#FFC36B]/20 text-[#FFC36B]'}`}>
                    {f.severity}
                  </span>
                </div>
                <div className="text-[11px] text-[#6E829B]">
                  Location: <code>{f.filePath}{f.lineNumber ? `:${f.lineNumber}` : ''}</code> &bull; Observed: <code>{f.observedValue}</code>
                </div>
                <pre className="p-2.5 rounded-lg bg-[#07111F] text-[#65BFFF] text-[11px] overflow-x-auto">
                  <code>{f.evidenceSnippet || f.observedValue}</code>
                </pre>
                <p className="text-[#9AAEC4] text-[11px]"><strong>Action:</strong> {f.recommendedAction}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Section 5: Limitations */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#48D9C1] border-b border-[rgba(159,190,220,0.14)] pb-2">
            5. Security Limitations
          </h2>
          <div className="text-[#9AAEC4] space-y-1.5 leading-relaxed text-[11px]">
            <p>1. <strong>Absence of Advisory:</strong> A missing vulnerability advisory in the database does NOT prove that a package is safe or free of 0-day exploits.</p>
            <p>2. <strong>Static Analysis Scope:</strong> Runtime execution paths, input sanitizers, and environment variables are not observable through static AST scanning.</p>
            <p>3. <strong>Lockfile Dependency:</strong> Repositories without a lockfile cannot guarantee exact version pinning in deployed production environments.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
