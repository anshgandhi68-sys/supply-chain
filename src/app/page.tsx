'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useScan } from '@/lib/context/ScanContext';
import { Finding, Severity } from '@/lib/types';
import { FindingDetailModal } from '@/components/FindingDetailModal';
import {
  ShieldAlert,
  ShieldCheck,
  AlertOctagon,
  AlertTriangle,
  Network,
  Microscope,
  Wrench,
  FileText,
  Upload,
  ArrowRight,
  Layers,
  CheckCircle2,
  Package,
  FileCode,
  Activity,
  Terminal,
  ExternalLink,
  Sparkles,
  GitBranch,
  RefreshCw,
} from 'lucide-react';

export default function OverviewPage() {
  const { scanResult, isLoading, errorMsg, loadDemoScan, setSelectedFinding, selectedFinding } = useScan();
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [modalFinding, setModalFinding] = useState<Finding | null>(null);

  if (isLoading && !scanResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-12 h-12 border-3 border-[#48D9C1]/30 border-t-[#48D9C1] rounded-full animate-spin" />
        <div className="space-y-1 font-mono">
          <p className="text-sm font-bold text-[#F1F6FC]">Executing Deterministic Supply Chain Scan...</p>
          <p className="text-xs text-[#6E829B]">Resolving manifests &bull; Querying OSV database &bull; Building attack graph</p>
        </div>
      </div>
    );
  }

  const repo = scanResult?.repository;
  const stats = scanResult?.stats;
  const findings = scanResult?.findings || [];
  const graph = scanResult?.dependencyGraph;

  // Compute Posture Score (0-100)
  const calcScore = () => {
    if (!stats) return 100;
    const penalty = stats.criticalCount * 25 + stats.highCount * 12 + stats.mediumCount * 4;
    return Math.max(0, 100 - penalty);
  };
  const postureScore = calcScore();

  // Filtered findings list
  const filteredFindings = findings.filter((f) => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (categoryFilter === 'dependencies' && f.category !== 'dependency_vulnerability') return false;
    if (categoryFilter === 'workflows' && f.category !== 'workflow_security' && f.category !== 'injection_risk' && f.category !== 'action_pinning') return false;
    return true;
  });

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 font-sans">
      {/* Top Banner / Executive Summary */}
      <div className="rounded-2xl p-6 sm:p-8 bg-[#111F33] border border-[rgba(159,190,220,0.18)] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#48D9C1]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#17283C] border border-[#48D9C1]/30 text-xs font-mono text-[#48D9C1]">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Software Supply Chain Security Audit</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F1F6FC]">
              Investigation Overview & Posture
            </h1>

            <p className="text-xs sm:text-sm text-[#9AAEC4] max-w-2xl leading-relaxed font-mono">
              Evidence-driven dependency risk evaluation, plausible attack path modeling, and deterministic remediation verification.
            </p>

            {repo && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-mono text-[#6E829B]">
                <span className="flex items-center text-[#F1F6FC]">
                  <GitBranch className="w-3.5 h-3.5 mr-1 text-[#48D9C1]" />
                  {repo.fullName}
                </span>
                <span>&bull;</span>
                <span>Ref: <code className="text-[#65BFFF]">{repo.resolvedCommitSha?.slice(0, 7) || repo.defaultBranch}</code></span>
                <span>&bull;</span>
                <span className="text-[#9AAEC4]">{scanResult?.scannedAt ? new Date(scanResult.scannedAt).toLocaleDateString() : 'Active Session'}</span>
              </div>
            )}
          </div>

          {/* Posture Score Radial / Badge */}
          <div className="flex items-center gap-4 bg-[#0B1728] p-5 rounded-2xl border border-[rgba(159,190,220,0.16)] shrink-0">
            <div className="text-center">
              <span className="text-[10px] font-mono uppercase text-[#6E829B] block font-bold">Posture Score</span>
              <span
                className={`text-4xl font-extrabold font-mono ${
                  postureScore >= 80
                    ? 'text-[#48D9C1]'
                    : postureScore >= 50
                    ? 'text-[#FFC36B]'
                    : 'text-[#FF647C]'
                }`}
              >
                {postureScore}
              </span>
              <span className="text-xs text-[#6E829B] font-mono"> / 100</span>
            </div>

            <div className="border-l border-[rgba(159,190,220,0.16)] pl-4 space-y-1 font-mono text-xs">
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Audit Verdict</span>
              {scanResult?.scanVerdict === 'complete_with_findings' ? (
                <span className="text-[#FF647C] font-bold flex items-center">
                  <AlertOctagon className="w-3.5 h-3.5 mr-1" />
                  Action Required
                </span>
              ) : scanResult?.scanVerdict === 'complete_clean' ? (
                <span className="text-[#48D9C1] font-bold flex items-center">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  Posture Compliant
                </span>
              ) : (
                <span className="text-[#FFC36B] font-bold flex items-center">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  Incomplete Data
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick presets bar */}
        <div className="mt-6 pt-5 border-t border-[rgba(159,190,220,0.12)] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center space-x-2 text-[#6E829B]">
            <span>Analyze Benchmark:</span>
            <button
              onClick={() => loadDemoScan()}
              className="px-2.5 py-1 rounded bg-[#17283C] hover:bg-[#1D314A] text-[#65BFFF] border border-[#65BFFF]/30 transition-colors cursor-pointer"
            >
              Controlled Risky Demo
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <Link
              href="/analyze"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#48D9C1] hover:bg-[#3ec4ad] text-[#07111F] font-bold transition-all shadow-md"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Start New Analysis</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 4 Core Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-5 rounded-xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-2">
          <div className="flex items-center justify-between text-[#6E829B] text-xs font-mono">
            <span>Critical & High Severity</span>
            <AlertOctagon className="w-4 h-4 text-[#FF647C]" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-[#F1F6FC]">
              {(stats?.criticalCount || 0) + (stats?.highCount || 0)}
            </span>
            <span className="text-xs text-[#FF647C] font-mono">
              ({stats?.criticalCount || 0} critical, {stats?.highCount || 0} high)
            </span>
          </div>
          <p className="text-[11px] text-[#6E829B] font-mono">
            Vulnerabilities with confirmed active exploitation risk.
          </p>
        </div>

        {/* Metric 2 */}
        <div className="p-5 rounded-xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-2">
          <div className="flex items-center justify-between text-[#6E829B] text-xs font-mono">
            <span>Plausible Attack Paths</span>
            <Network className="w-4 h-4 text-[#FFC36B]" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-[#FFC36B]">
              {graph?.attackPaths.length || 0}
            </span>
            <span className="text-xs text-[#9AAEC4] font-mono">lineage chains</span>
          </div>
          <p className="text-[11px] text-[#6E829B] font-mono">
            Reachable attack surface from root application components.
          </p>
        </div>

        {/* Metric 3 */}
        <div className="p-5 rounded-xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-2">
          <div className="flex items-center justify-between text-[#6E829B] text-xs font-mono">
            <span>Total Dependencies</span>
            <Package className="w-4 h-4 text-[#65BFFF]" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-[#F1F6FC]">
              {stats?.dependenciesScanned || 0}
            </span>
            <span className="text-xs text-[#48D9C1] font-mono">
              {stats?.confirmedCount ? `${stats.confirmedCount} locked` : 'cataloged'}
            </span>
          </div>
          <p className="text-[11px] text-[#6E829B] font-mono">
            Direct & transitive packages in resolved software inventory.
          </p>
        </div>

        {/* Metric 4 */}
        <div className="p-5 rounded-xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-2">
          <div className="flex items-center justify-between text-[#6E829B] text-xs font-mono">
            <span>Verified Remediations</span>
            <Wrench className="w-4 h-4 text-[#48D9C1]" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-[#48D9C1]">
              {findings.filter((f) => f.fixedVersion).length}
            </span>
            <span className="text-xs text-[#9AAEC4] font-mono">candidate patches</span>
          </div>
          <p className="text-[11px] text-[#6E829B] font-mono">
            Patches backed by upstream advisory fixed versions.
          </p>
        </div>
      </div>

      {/* Primary Investigation Hub: Connected Experiences Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-[#F1F6FC] flex items-center space-x-2">
            <Layers className="w-4 h-4 text-[#48D9C1]" />
            <span>Connected Workstation Workspaces</span>
          </h2>
          <span className="text-xs text-[#6E829B] font-mono">6 Connected Investigation Modules</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          {/* Card 1: Attack Graph */}
          <Link
            href="/graph"
            className="p-5 rounded-xl bg-[#111F33] hover:bg-[#17283C] border border-[rgba(159,190,220,0.16)] hover:border-[#48D9C1]/40 transition-all space-y-3 group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-lg bg-[#48D9C1]/10 text-[#48D9C1]">
                <Network className="w-5 h-5" />
              </span>
              <ArrowRight className="w-4 h-4 text-[#6E829B] group-hover:text-[#48D9C1] group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#F1F6FC] group-hover:text-[#48D9C1] transition-colors">
                Dependency Attack Graph
              </h3>
              <p className="text-[#9AAEC4] mt-1 leading-relaxed">
                Explore interactive spatial topology distinguishing direct vs transitive dependencies and verified attack paths.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-[#48D9C1] font-semibold">
              Explore {graph?.nodes.length || 0} Nodes &rarr;
            </div>
          </Link>

          {/* Card 2: Investigation Workspace */}
          <Link
            href="/investigate"
            className="p-5 rounded-xl bg-[#111F33] hover:bg-[#17283C] border border-[rgba(159,190,220,0.16)] hover:border-[#65BFFF]/40 transition-all space-y-3 group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-lg bg-[#65BFFF]/10 text-[#65BFFF]">
                <Microscope className="w-5 h-5" />
              </span>
              <ArrowRight className="w-4 h-4 text-[#6E829B] group-hover:text-[#65BFFF] group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#F1F6FC] group-hover:text-[#65BFFF] transition-colors">
                Investigation Workspace
              </h3>
              <p className="text-[#9AAEC4] mt-1 leading-relaxed">
                Deep-dive into Observed Facts, Inferred Risks, and Unknowns with dependency blast radius calculations.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-[#65BFFF] font-semibold">
              Investigate {findings.length} Findings &rarr;
            </div>
          </Link>

          {/* Card 3: Remediation Center */}
          <Link
            href="/remediation"
            className="p-5 rounded-xl bg-[#111F33] hover:bg-[#17283C] border border-[rgba(159,190,220,0.16)] hover:border-[#FFC36B]/40 transition-all space-y-3 group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-lg bg-[#FFC36B]/10 text-[#FFC36B]">
                <Wrench className="w-5 h-5" />
              </span>
              <ArrowRight className="w-4 h-4 text-[#6E829B] group-hover:text-[#FFC36B] group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#F1F6FC] group-hover:text-[#FFC36B] transition-colors">
                Remediation Center
              </h3>
              <p className="text-[#9AAEC4] mt-1 leading-relaxed">
                Review proposed package.json and lockfile diffs, evaluate breaking risks, and run simulated verification.
              </p>
            </div>
            <div className="pt-2 text-[11px] text-[#FFC36B] font-semibold">
              Review Safe Patches &rarr;
            </div>
          </Link>
        </div>
      </div>

      {/* Findings Section */}
      <div className="rounded-2xl p-6 bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[rgba(159,190,220,0.12)] pb-4">
          <div>
            <h2 className="text-base font-bold text-[#F1F6FC] font-mono flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-[#FF647C]" />
              <span>Cataloged Findings ({findings.length})</span>
            </h2>
            <p className="text-xs text-[#6E829B] font-mono mt-0.5">
              Verified security findings grouped by severity and confirmed detection source.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#0B1728] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] focus:outline-none focus:border-[#48D9C1] cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical Only</option>
              <option value="high">High Only</option>
              <option value="medium">Medium Only</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#0B1728] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] focus:outline-none focus:border-[#48D9C1] cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="dependencies">Dependencies Only</option>
              <option value="workflows">Workflows & CI</option>
            </select>
          </div>
        </div>

        {/* Findings List */}
        {filteredFindings.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-[#6E829B]">
            No findings match the selected filters.
          </div>
        ) : (
          <div className="space-y-3 font-mono text-xs">
            {filteredFindings.map((f) => (
              <div
                key={f.id}
                className="p-4 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.12)] hover:border-[rgba(159,190,220,0.25)] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        f.severity === 'critical'
                          ? 'bg-[#FF647C]/20 text-[#FF647C] border border-[#FF647C]/40'
                          : f.severity === 'high'
                          ? 'bg-[#FFC36B]/20 text-[#FFC36B] border border-[#FFC36B]/40'
                          : f.severity === 'medium'
                          ? 'bg-[#65BFFF]/20 text-[#65BFFF] border border-[#65BFFF]/40'
                          : 'bg-white/10 text-[#9AAEC4]'
                      }`}
                    >
                      {f.severity}
                    </span>

                    <span className="text-[#6E829B] text-[11px]">{f.category}</span>
                    <span className="text-[#48D9C1] font-semibold">{f.id}</span>
                  </div>

                  <h3 className="text-sm font-semibold text-[#F1F6FC]">{f.title}</h3>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#6E829B]">
                    <span>File: <code className="text-[#9AAEC4]">{f.filePath}{f.lineNumber ? `:${f.lineNumber}` : ''}</code></span>
                    <span>Observed: <code className="text-[#FFC36B]">{f.observedValue}</code></span>
                    {f.fixedVersion && (
                      <span>Fixed: <code className="text-[#48D9C1]">{f.fixedVersion}</code></span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => setModalFinding(f)}
                    className="px-3 py-1.5 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#65BFFF] border border-[rgba(159,190,220,0.2)] transition-colors cursor-pointer"
                  >
                    Quick Evidence
                  </button>

                  <Link
                    href={`/investigate?finding=${encodeURIComponent(f.id)}`}
                    className="px-3 py-1.5 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#F1F6FC] border border-[rgba(159,190,220,0.2)] transition-colors cursor-pointer"
                  >
                    Investigate
                  </Link>

                  {f.fixedVersion && (
                    <Link
                      href={`/remediation?pkg=${encodeURIComponent(f.observedValue.split('@')[0])}`}
                      className="px-3 py-1.5 rounded-lg bg-[#48D9C1] hover:bg-[#3ec4ad] text-[#07111F] font-bold transition-colors cursor-pointer"
                    >
                      Remediate
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for quick finding preview */}
      <FindingDetailModal
        finding={modalFinding}
        onClose={() => setModalFinding(null)}
      />
    </div>
  );
}
