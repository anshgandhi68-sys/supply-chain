'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useScan } from '@/lib/context/ScanContext';
import { generateRemediationProposals } from '@/lib/remediation';
import { verifyWorkflowFix } from '@/lib/verifier';
import { RemediationDiff, FixVerificationResult } from '@/lib/types';
import {
  Wrench,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  FileCode,
  Package,
  Layers,
  ArrowRight,
  Play,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Terminal,
  Shield,
  Download,
} from 'lucide-react';

function RemediationContent() {
  const searchParams = useSearchParams();
  const pkgParam = searchParams.get('pkg');

  const { scanResult, isLoading } = useScan();

  const [activeTab, setActiveTab] = useState<'dependencies' | 'workflows'>('dependencies');
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  // Workflow AST Studio state
  const [beforeYaml, setBeforeYaml] = useState(`name: CI Pipeline
on:
  pull_request_target:
    types: [opened, synchronize]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout pull request code
        uses: actions/checkout@v3
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - name: Build project
        run: echo "\${{ github.event.issue.title }}"
      - name: Install dependencies
        run: curl -sSL https://raw.example.com/install.sh | bash
`);

  const [afterYaml, setAfterYaml] = useState(`name: CI Pipeline
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout pull request securely
        uses: actions/checkout@2541b1294d2704b0964813337f33b291d3f8596b # v3.0.2
      - name: Build project
        env:
          ISSUE_TITLE: \${{ github.event.issue.title }}
        run: echo "$ISSUE_TITLE"
      - name: Install dependencies from lockfile
        run: npm ci
`);

  const [workflowResult, setWorkflowResult] = useState<FixVerificationResult | null>(null);

  // Generate proposals from scan findings
  const proposals = useMemo(() => {
    if (!scanResult) return [];
    return generateRemediationProposals(scanResult.findings);
  }, [scanResult]);

  useEffect(() => {
    if (pkgParam) {
      const match = proposals.find((p) => p.packageName === pkgParam);
      if (match) setSelectedProposalId(match.id);
    } else if (proposals.length > 0 && !selectedProposalId) {
      setSelectedProposalId(proposals[0].id);
    }
  }, [pkgParam, proposals, selectedProposalId]);

  const activeProposal = useMemo(() => {
    return proposals.find((p) => p.id === selectedProposalId) || proposals[0] || null;
  }, [proposals, selectedProposalId]);

  // Run Workflow Verification
  const handleVerifyWorkflow = () => {
    const res = verifyWorkflowFix(beforeYaml, afterYaml, 'Custom Workflow Verification');
    setWorkflowResult(res);
  };

  // Run initial workflow verify
  useEffect(() => {
    handleVerifyWorkflow();
  }, []);

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
      {/* Header */}
      <div className="border-b border-[rgba(159,190,220,0.16)] pb-5">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#111F33] border border-[#48D9C1]/30 text-xs font-mono text-[#48D9C1] mb-2">
          <Wrench className="w-3.5 h-3.5" />
          <span>Remediation & Patch Studio</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F1F6FC] tracking-tight">
          Safe Remediation Center
        </h1>
        <p className="text-xs sm:text-sm text-[#9AAEC4] font-mono mt-1">
          Review evidence-backed candidate version upgrades, evaluate breaking change risks, and run simulated deterministic verification.
        </p>
      </div>

      {/* Safety Notice */}
      <div className="p-4 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.16)] flex items-start space-x-3 text-xs font-mono text-[#9AAEC4]">
        <ShieldCheck className="w-4 h-4 text-[#48D9C1] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#F1F6FC]">Zero Automatic Mutation Guarantee:</strong> Sentinel operates in a safe read-only sandbox and will never write to your repository or modify code files automatically. All proposed patches must be reviewed and tested in your local environment.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-[#111F33] border border-[rgba(159,190,220,0.16)] rounded-xl w-fit font-mono text-xs">
        <button
          onClick={() => setActiveTab('dependencies')}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all cursor-pointer ${
            activeTab === 'dependencies'
              ? 'bg-[#17283C] text-[#48D9C1] font-bold border border-[#48D9C1]/30 shadow-sm'
              : 'text-[#9AAEC4] hover:text-[#F1F6FC]'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Dependency Version Upgrades ({proposals.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('workflows')}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all cursor-pointer ${
            activeTab === 'workflows'
              ? 'bg-[#17283C] text-[#48D9C1] font-bold border border-[#48D9C1]/30 shadow-sm'
              : 'text-[#9AAEC4] hover:text-[#F1F6FC]'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>GitHub Actions AST Fix Studio</span>
        </button>
      </div>

      {/* Tab 1: Dependency Version Upgrades */}
      {activeTab === 'dependencies' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Proposals List (4 cols) */}
          <div className="lg:col-span-4 rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-4 space-y-3 font-mono text-xs shadow-xl">
            <span className="text-[#6E829B] block font-bold uppercase text-[10px]">
              Available Upstream Patches
            </span>

            {proposals.length === 0 ? (
              <div className="py-12 text-center text-[#6E829B]">
                No candidate fixed versions are reported in upstream advisories for this project.
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-[600px] pr-1">
                {proposals.map((p) => {
                  const isSelected = p.id === activeProposal?.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProposalId(p.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                        isSelected
                          ? 'bg-[#17283C] border-[#48D9C1] text-[#F1F6FC] shadow-md'
                          : 'bg-[#0B1728] border-[rgba(159,190,220,0.12)] hover:border-[rgba(159,190,220,0.25)] text-[#9AAEC4]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#F1F6FC] text-sm">{p.packageName}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            p.breakingRisk === 'high'
                              ? 'bg-[#FF647C]/20 text-[#FF647C]'
                              : p.breakingRisk === 'moderate'
                              ? 'bg-[#FFC36B]/20 text-[#FFC36B]'
                              : 'bg-[#48D9C1]/20 text-[#48D9C1]'
                          }`}
                        >
                          {p.breakingRisk} risk
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 text-[11px]">
                        <span className="text-[#FF647C]">{p.currentVersion}</span>
                        <ArrowRight className="w-3 h-3 text-[#6E829B]" />
                        <span className="text-[#48D9C1] font-bold">{p.proposedVersion}</span>
                      </div>

                      <div className="text-[10px] text-[#6E829B] truncate">
                        Resolves {p.advisoryId}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Diff & Risk Evaluation (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {activeProposal ? (
              <div className="rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-6 space-y-6 font-mono text-xs shadow-xl">
                {/* Proposal Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[rgba(159,190,220,0.14)] pb-4">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-base font-bold text-[#F1F6FC]">{activeProposal.packageName}</span>
                      <span className="text-[#6E829B]">&bull;</span>
                      <span className="text-[#48D9C1] font-bold">{activeProposal.proposedVersion}</span>
                    </div>
                    <span className="text-[#6E829B] text-[11px]">Target Manifest: {activeProposal.manifestPath}</span>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                      activeProposal.breakingRisk === 'high'
                        ? 'bg-[#FF647C]/20 text-[#FF647C] border border-[#FF647C]/40'
                        : activeProposal.breakingRisk === 'moderate'
                        ? 'bg-[#FFC36B]/20 text-[#FFC36B] border border-[#FFC36B]/40'
                        : 'bg-[#48D9C1]/20 text-[#48D9C1] border border-[#48D9C1]/40'
                    }`}
                  >
                    Compatibility: {activeProposal.breakingRisk.toUpperCase()} BREAKING RISK
                  </span>
                </div>

                {/* Compatibility Risk Evaluation Card */}
                <div className="p-4 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.14)] space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-[#6E829B] block">
                    SemVer Compatibility & Breaking Risk Analysis
                  </span>
                  <p className="text-[#F1F6FC] leading-relaxed">
                    {activeProposal.breakingRationale}
                  </p>
                </div>

                {/* Proposed Unified Diff Viewer */}
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-[#6E829B] block">
                    Proposed Package Manifest Diff
                  </span>
                  <div className="rounded-xl bg-[#07111F] border border-[rgba(159,190,220,0.16)] p-4 overflow-x-auto text-xs leading-relaxed">
                    <pre>
                      <code>
                        <span className="text-[#6E829B]">--- a/package.json</span>{'\n'}
                        <span className="text-[#6E829B]">+++ b/package.json</span>{'\n'}
                        <span className="text-[#65BFFF]">@@ -dependencies @@</span>{'\n'}
                        <span className="text-[#FF647C] bg-[#FF647C]/10 block">-   &quot;{activeProposal.packageName}&quot;: &quot;{activeProposal.currentVersion}&quot;</span>
                        <span className="text-[#48D9C1] bg-[#48D9C1]/10 block">+   &quot;{activeProposal.packageName}&quot;: &quot;{activeProposal.proposedVersion}&quot;</span>
                      </code>
                    </pre>
                  </div>
                </div>

                {/* Copy / Manual Application Instructions */}
                <div className="p-4 rounded-xl bg-[#17283C]/70 border border-[rgba(159,190,220,0.14)] space-y-2">
                  <span className="text-[10px] uppercase font-bold text-[#48D9C1] block">
                    Safe Execution Commands for Terminal
                  </span>
                  <pre className="p-3 rounded-lg bg-[#07111F] text-[#65BFFF] overflow-x-auto">
                    <code>npm install {activeProposal.packageName}@{activeProposal.proposedVersion}</code>
                  </pre>
                  <p className="text-[11px] text-[#6E829B]">
                    Always run your unit test suite (<code>npm test</code>) after installing the upgrade to ensure no backwards-compatibility issues occur.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-12 text-center text-[#6E829B] font-mono text-xs">
                Select a package upgrade proposal from the left list.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: GitHub Actions AST Fix Studio */}
      {activeTab === 'workflows' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono text-xs">
            {/* Before YAML */}
            <div className="rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-5 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#FF647C] flex items-center space-x-1.5">
                  <AlertOctagon className="w-4 h-4" />
                  <span>Before (Risky Workflow)</span>
                </span>
                <span className="text-[11px] text-[#6E829B]">Editable Configuration</span>
              </div>
              <textarea
                value={beforeYaml}
                onChange={(e) => setBeforeYaml(e.target.value)}
                rows={16}
                className="w-full p-3 rounded-xl bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#FF647C] font-mono text-xs focus:outline-none focus:border-[#48D9C1] leading-relaxed"
              />
            </div>

            {/* After YAML */}
            <div className="rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-5 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#48D9C1] flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>After (Remediated Workflow)</span>
                </span>
                <span className="text-[11px] text-[#6E829B]">Hardened Standard</span>
              </div>
              <textarea
                value={afterYaml}
                onChange={(e) => setAfterYaml(e.target.value)}
                rows={16}
                className="w-full p-3 rounded-xl bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#48D9C1] font-mono text-xs focus:outline-none focus:border-[#48D9C1] leading-relaxed"
              />
            </div>
          </div>

          {/* Action Bar */}
          <div className="p-4 rounded-xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs">
            <span className="text-[#9AAEC4]">
              Simulate AST detection engine across both configurations to deterministically verify resolution.
            </span>
            <button
              onClick={handleVerifyWorkflow}
              className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-lg bg-[#48D9C1] hover:bg-[#3ec4ad] text-[#07111F] font-bold shadow-lg transition-all cursor-pointer shrink-0"
            >
              <Play className="w-4 h-4" />
              <span>Re-run Deterministic Verification Engine</span>
            </button>
          </div>

          {/* Verification Results Comparison */}
          {workflowResult && (
            <div className="rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-6 space-y-4 font-mono text-xs shadow-xl">
              <div className="flex items-center justify-between border-b border-[rgba(159,190,220,0.14)] pb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#F1F6FC]">Deterministic Verification Verdict</h3>
                  <span className="text-[#6E829B] text-[11px]">
                    Before: {workflowResult.beforeFindingsCount} violations &bull; After: {workflowResult.afterFindingsCount} violations
                  </span>
                </div>

                <span
                  className={`px-3 py-1 rounded-lg font-bold uppercase ${
                    workflowResult.allPassed
                      ? 'bg-[#48D9C1]/20 text-[#48D9C1] border border-[#48D9C1]/40'
                      : 'bg-[#FF647C]/20 text-[#FF647C] border border-[#FF647C]/40'
                  }`}
                >
                  {workflowResult.allPassed ? 'ALL FINDINGS RESOLVED' : 'REMAINING VIOLATIONS DETECTED'}
                </span>
              </div>

              {/* Comparisons List */}
              <div className="space-y-2">
                {workflowResult.comparisons.map((c, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.12)] flex items-center justify-between gap-4"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="text-[#48D9C1] font-bold">{c.ruleId}</span>
                        <span className="text-[#F1F6FC]">{c.title}</span>
                      </div>
                      <p className="text-[11px] text-[#9AAEC4]">{c.explanation}</p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase shrink-0 ${
                        c.status === 'resolved'
                          ? 'bg-[#48D9C1]/20 text-[#48D9C1]'
                          : 'bg-[#FF647C]/20 text-[#FF647C]'
                      }`}
                    >
                      {c.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RemediationCenterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="w-10 h-10 border-3 border-[#48D9C1]/30 border-t-[#48D9C1] rounded-full animate-spin" />
          <span className="text-xs font-mono text-[#9AAEC4]">Loading Remediation Center...</span>
        </div>
      }
    >
      <RemediationContent />
    </Suspense>
  );
}
