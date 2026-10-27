'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useScan } from '@/lib/context/ScanContext';
import { Finding, Severity } from '@/lib/types';
import { enrichFindingWithEvidence, EnrichedInvestigationDetail } from '@/lib/investigation';
import {
  Microscope,
  Search,
  Filter,
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Layers,
  ArrowRight,
  ExternalLink,
  Package,
  FileCode,
  Wrench,
  Terminal,
  Activity,
  GitBranch,
} from 'lucide-react';

function InvestigationContent() {
  const searchParams = useSearchParams();
  const findingParam = searchParams.get('finding');

  const { scanResult, isLoading } = useScan();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeFindingId, setActiveFindingId] = useState<string | null>(findingParam);

  const findings = scanResult?.findings || [];
  const graph = scanResult?.dependencyGraph;

  // Sync with findingParam if provided
  useEffect(() => {
    if (findingParam) {
      setActiveFindingId(findingParam);
    } else if (findings.length > 0 && !activeFindingId) {
      setActiveFindingId(findings[0].id);
    }
  }, [findingParam, findings, activeFindingId]);

  // Filter list
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          f.title.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q) ||
          f.observedValue.toLowerCase().includes(q) ||
          f.filePath.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (selectedSeverity !== 'all' && f.severity !== selectedSeverity) return false;
      if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
      return true;
    });
  }, [findings, searchQuery, selectedSeverity, selectedCategory]);

  const activeFinding = useMemo(() => {
    return findings.find((f) => f.id === activeFindingId) || findings[0] || null;
  }, [findings, activeFindingId]);

  // Generate enriched detail for active finding
  const enrichedDetail: EnrichedInvestigationDetail | null = useMemo(() => {
    if (!activeFinding) return null;
    return enrichFindingWithEvidence(activeFinding, graph);
  }, [activeFinding, graph]);

  if (isLoading && !scanResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-10 h-10 border-3 border-[#48D9C1]/30 border-t-[#48D9C1] rounded-full animate-spin" />
        <span className="text-xs font-mono text-[#9AAEC4]">Loading Investigation Workspace...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
      {/* Header */}
      <div className="border-b border-[rgba(159,190,220,0.16)] pb-5">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#111F33] border border-[#48D9C1]/30 text-xs font-mono text-[#48D9C1] mb-2">
          <Microscope className="w-3.5 h-3.5" />
          <span>Evidence-Based Security Investigation</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F1F6FC] tracking-tight">
          Investigation Workspace
        </h1>
        <p className="text-xs sm:text-sm text-[#9AAEC4] font-mono mt-1">
          Rigorous tri-part evidence decomposition distinguishing observed deterministic facts, inferred attack reachability, and runtime unknowns.
        </p>
      </div>

      {/* Two-Column Master / Detail Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Finding Selector (4 Cols) */}
        <div className="lg:col-span-4 rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-4 flex flex-col space-y-4 shadow-xl max-h-[750px]">
          {/* Search & Filters */}
          <div className="space-y-2 font-mono text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#6E829B]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search finding ID, package..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] focus:outline-none focus:border-[#48D9C1]"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="w-1/2 px-2 py-1.5 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] focus:outline-none focus:border-[#48D9C1] cursor-pointer"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-1/2 px-2 py-1.5 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] focus:outline-none focus:border-[#48D9C1] cursor-pointer"
              >
                <option value="all">All Types</option>
                <option value="dependency_vulnerability">Dependencies</option>
                <option value="workflow_security">Workflows</option>
                <option value="action_pinning">Action Pinning</option>
              </select>
            </div>
          </div>

          {/* Finding Items List */}
          <div className="overflow-y-auto space-y-2 pr-1 font-mono text-xs flex-1">
            {filteredFindings.length === 0 ? (
              <div className="text-center py-12 text-[#6E829B]">No findings match query.</div>
            ) : (
              filteredFindings.map((f) => {
                const isSelected = f.id === activeFindingId;
                return (
                  <div
                    key={f.id}
                    onClick={() => setActiveFindingId(f.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                      isSelected
                        ? 'bg-[#17283C] border-[#48D9C1] text-[#F1F6FC] shadow-md'
                        : 'bg-[#0B1728] border-[rgba(159,190,220,0.12)] hover:border-[rgba(159,190,220,0.25)] text-[#9AAEC4]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          f.severity === 'critical'
                            ? 'bg-[#FF647C]/20 text-[#FF647C]'
                            : f.severity === 'high'
                            ? 'bg-[#FFC36B]/20 text-[#FFC36B]'
                            : f.severity === 'medium'
                            ? 'bg-[#65BFFF]/20 text-[#65BFFF]'
                            : 'bg-white/10 text-[#9AAEC4]'
                        }`}
                      >
                        {f.severity}
                      </span>
                      <span className="text-[10px] text-[#6E829B] truncate max-w-[120px]">
                        {f.id}
                      </span>
                    </div>

                    <h4 className="font-semibold text-xs text-[#F1F6FC] line-clamp-1">{f.title}</h4>

                    <div className="flex items-center justify-between text-[11px] text-[#6E829B]">
                      <span className="truncate max-w-[150px]">{f.observedValue}</span>
                      <span className="text-[#48D9C1]">{f.confidence}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Finding Investigation Deep-Dive (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {enrichedDetail ? (
            <div className="rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-6 space-y-6 shadow-xl font-mono text-xs">
              {/* Finding Title & Badges */}
              <div className="border-b border-[rgba(159,190,220,0.14)] pb-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                        enrichedDetail.finding.severity === 'critical'
                          ? 'bg-[#FF647C]/20 text-[#FF647C] border border-[#FF647C]/40'
                          : enrichedDetail.finding.severity === 'high'
                          ? 'bg-[#FFC36B]/20 text-[#FFC36B] border border-[#FFC36B]/40'
                          : 'bg-[#65BFFF]/20 text-[#65BFFF] border border-[#65BFFF]/40'
                      }`}
                    >
                      {enrichedDetail.finding.severity.toUpperCase()}
                    </span>

                    <span className="px-2 py-0.5 rounded text-[10px] bg-[#17283C] text-[#48D9C1] border border-[#48D9C1]/30 font-bold">
                      {enrichedDetail.finding.id}
                    </span>

                    {enrichedDetail.finding.cvssScore !== undefined && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-[#FF647C]/15 text-[#FF647C] border border-[#FF647C]/30 font-bold">
                        CVSS: {enrichedDetail.finding.cvssScore}
                      </span>
                    )}

                    <span className="px-2 py-0.5 rounded text-[10px] bg-white/5 text-[#9AAEC4] border border-white/10">
                      Confidence: {enrichedDetail.finding.confidence.toUpperCase()}
                    </span>
                  </div>

                  {enrichedDetail.finding.fixedVersion && (
                    <Link
                      href={`/remediation?pkg=${encodeURIComponent(enrichedDetail.finding.observedValue.split('@')[0])}`}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#48D9C1] hover:bg-[#3ec4ad] text-[#07111F] font-bold shadow-md transition-all cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Remediate in Studio</span>
                    </Link>
                  )}
                </div>

                <h2 className="text-lg font-bold text-[#F1F6FC]">{enrichedDetail.finding.title}</h2>
              </div>

              {/* Context Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.14)]">
                <div>
                  <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Target Package / Version</span>
                  <span className="text-[#FFC36B] font-bold text-xs">{enrichedDetail.finding.observedValue}</span>
                </div>

                <div>
                  <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Manifest / File</span>
                  <span className="text-[#65BFFF] font-bold text-xs truncate block">{enrichedDetail.finding.filePath}</span>
                </div>

                <div>
                  <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Blast Radius</span>
                  <span className="text-[#FF647C] font-bold text-xs">{enrichedDetail.blastRadius} downstream modules</span>
                </div>
              </div>

              {/* Lineage Path Breadcrumbs */}
              <div className="p-3.5 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.14)] space-y-1.5">
                <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Traced Dependency Lineage Chain</span>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#F1F6FC]">
                  {enrichedDetail.dependencyPath.map((item, idx) => (
                    <React.Fragment key={idx}>
                      <span className={`px-2 py-0.5 rounded ${idx === 0 ? 'bg-[#17283C] text-[#48D9C1]' : idx === enrichedDetail.dependencyPath.length - 1 ? 'bg-[#3D1520] text-[#FF647C] font-bold' : 'bg-[#17283C] text-[#9AAEC4]'}`}>
                        {item}
                      </span>
                      {idx < enrichedDetail.dependencyPath.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-[#6E829B]" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* THE TRI-PART EVIDENCE BREAKDOWN */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#F1F6FC] flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-[#48D9C1]" />
                  <span>Tri-Part Evidence Breakdown</span>
                </h3>

                {/* 1. Observed Facts */}
                <div className="p-4 rounded-xl bg-[#0B1728] border border-[#48D9C1]/30 space-y-2">
                  <div className="flex items-center space-x-2 text-[#48D9C1] font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>1. Observed Facts (Deterministic Findings)</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1.5 text-[#9AAEC4] text-xs leading-relaxed">
                    {enrichedDetail.observedFacts.map((fact, idx) => (
                      <li key={idx}>{fact}</li>
                    ))}
                  </ul>
                </div>

                {/* 2. Inferred Risks */}
                <div className="p-4 rounded-xl bg-[#0B1728] border border-[#FFC36B]/30 space-y-2">
                  <div className="flex items-center space-x-2 text-[#FFC36B] font-bold text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    <span>2. Inferred Risks (Reachability & Blast Radius)</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1.5 text-[#9AAEC4] text-xs leading-relaxed">
                    {enrichedDetail.inferredRisks.map((risk, idx) => (
                      <li key={idx}>{risk}</li>
                    ))}
                  </ul>
                </div>

                {/* 3. Unknowns */}
                <div className="p-4 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.2)] space-y-2">
                  <div className="flex items-center space-x-2 text-[#65BFFF] font-bold text-xs">
                    <HelpCircle className="w-4 h-4" />
                    <span>3. Unknowns & Environmental Boundaries</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1.5 text-[#9AAEC4] text-xs leading-relaxed">
                    {enrichedDetail.unknowns.map((un, idx) => (
                      <li key={idx}>{un}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Evidence Code Excerpt */}
              <div className="space-y-1.5">
                <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Verifiable Code Excerpt</span>
                <pre className="p-4 rounded-xl bg-[#07111F] border border-[rgba(159,190,220,0.16)] text-[#65BFFF] overflow-x-auto text-[11px] leading-relaxed">
                  <code>{enrichedDetail.finding.evidenceSnippet || enrichedDetail.finding.observedValue}</code>
                </pre>
              </div>

              {/* Actionable Investigation Checklist */}
              <div className="p-4 rounded-xl bg-[#17283C]/70 border border-[rgba(159,190,220,0.16)] space-y-2">
                <span className="text-xs font-bold text-[#F1F6FC] uppercase tracking-wider block">
                  Recommended Next Investigation Steps
                </span>
                <div className="space-y-1 text-xs text-[#9AAEC4]">
                  {enrichedDetail.recommendedSteps.map((step, idx) => (
                    <div key={idx} className="flex items-start space-x-2">
                      <span className="text-[#48D9C1]">&bull;</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-12 text-center text-[#6E829B] font-mono text-xs">
              Select a finding from the left panel to inspect its evidence and lineage.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InvestigationWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="w-10 h-10 border-3 border-[#48D9C1]/30 border-t-[#48D9C1] rounded-full animate-spin" />
          <span className="text-xs font-mono text-[#9AAEC4]">Loading Investigation Workspace...</span>
        </div>
      }
    >
      <InvestigationContent />
    </Suspense>
  );
}
