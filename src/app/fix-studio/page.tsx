'use client';

import React, { useState } from 'react';
import { EditorialNav } from '@/components/EditorialNav';
import {
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  PackageCheck,
  FileCode,
  Shield,
  Layers,
} from 'lucide-react';

export default function FixStudioPage() {
  const [activeTab, setActiveTab] = useState<'workflow' | 'dependency'>('workflow');

  // Workflow AST State
  const [beforeYaml, setBeforeYaml] = useState(
`name: CI Pipeline
on:
  pull_request_target:
    types: [opened, synchronize]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout untrusted pull request code
        uses: actions/checkout@v3
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - name: Install dependencies
        run: curl -sSL https://raw.example.com/install.sh | bash
`
  );

  const [afterYaml, setAfterYaml] = useState(
`name: CI Pipeline
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
      - name: Install dependencies from lockfile
        run: npm ci
`
  );

  const [workflowResult, setWorkflowResult] = useState<any>(null);
  const [isVerifyingWorkflow, setIsVerifyingWorkflow] = useState(false);

  // Dependency Upgrade State
  const [packageName, setPackageName] = useState('lodash');
  const [currentVersion, setCurrentVersion] = useState('4.17.20');
  const [proposedVersion, setProposedVersion] = useState('4.17.21');
  const [ecosystem, setEcosystem] = useState('npm');
  const [dependencyResult, setDependencyResult] = useState<any>(null);
  const [isVerifyingDep, setIsVerifyingDep] = useState(false);

  // Verify Workflow AST
  const handleVerifyWorkflow = async () => {
    setIsVerifyingWorkflow(true);
    setWorkflowResult(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beforeYaml,
          afterYaml,
          fixtureName: 'Dedicated Fix Studio Session',
        }),
      });
      const data = await res.json();
      setWorkflowResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setWorkflowResult({ error: `Verification failed: ${msg}` });
    } finally {
      setIsVerifyingWorkflow(false);
    }
  };

  // Verify Dependency Upgrade
  const handleVerifyDependency = async () => {
    setIsVerifyingDep(true);
    setDependencyResult(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dependency',
          packageName: packageName.trim(),
          currentVersion: currentVersion.trim(),
          proposedVersion: proposedVersion.trim(),
          ecosystem,
        }),
      });
      const data = await res.json();
      setDependencyResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDependencyResult({ error: `OSV query failed: ${msg}` });
    } finally {
      setIsVerifyingDep(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#DDE8DD] text-[#071F20] font-sans selection:bg-[#D47A4A] selection:text-white pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <EditorialNav />

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Block */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#071F20]/5 border border-[#071F20]/10 text-xs font-mono font-medium text-[#D47A4A]">
            <Terminal className="w-3.5 h-3.5" />
            <span>Deterministic AST & OSV Remediation</span>
          </div>
          <h1 className="text-[clamp(32px,4vw,56px)] font-bold tracking-[-0.03em] leading-tight text-[#071F20]">
            Fix Verification Studio
          </h1>
          <p className="text-[#476363] text-sm leading-relaxed">
            Reanalyze modified workflow YAML and upgrade dependency versions with deterministic AST rules and authoritative OSV queries. No simulated approvals.
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex justify-center">
          <div className="inline-flex p-1.5 rounded-2xl bg-[#071F20]/10 border border-[#071F20]/15 gap-2 text-xs font-mono font-semibold">
            <button
              onClick={() => setActiveTab('workflow')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'workflow'
                  ? 'bg-[#071F20] text-white shadow-md'
                  : 'text-[#071F20] hover:bg-white/50'
              }`}
            >
              <FileCode className="w-4 h-4 text-[#D47A4A]" />
              <span>GitHub Actions Workflow Diff</span>
            </button>
            <button
              onClick={() => setActiveTab('dependency')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'dependency'
                  ? 'bg-[#071F20] text-white shadow-md'
                  : 'text-[#071F20] hover:bg-white/50'
              }`}
            >
              <PackageCheck className="w-4 h-4 text-[#48D9C1]" />
              <span>Dependency Version Upgrade</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Workflow AST Diff Verification */}
        {activeTab === 'workflow' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Before YAML */}
              <div className="rounded-2xl border border-[#071F20]/15 bg-white/80 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-[#071F20]/10 pb-3">
                  <div className="flex items-center gap-2 font-mono text-xs font-semibold text-[#071F20]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF647C]" />
                    <span>Original Risky Workflow (.github/workflows/ci.yml)</span>
                  </div>
                  <span className="text-[11px] font-mono text-[#6E829B]">Before Remediating</span>
                </div>
                <textarea
                  value={beforeYaml}
                  onChange={(e) => setBeforeYaml(e.target.value)}
                  rows={14}
                  className="w-full font-mono text-xs p-3 rounded-xl bg-[#071F20]/5 text-[#071F20] border border-[#071F20]/10 focus:outline-none focus:ring-2 focus:ring-[#D47A4A] resize-none"
                  spellCheck={false}
                />
              </div>

              {/* After YAML */}
              <div className="rounded-2xl border border-[#071F20]/15 bg-white/80 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-[#071F20]/10 pb-3">
                  <div className="flex items-center gap-2 font-mono text-xs font-semibold text-[#071F20]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#48D9C1]" />
                    <span>Proposed Remediated Workflow</span>
                  </div>
                  <span className="text-[11px] font-mono text-[#6E829B]">After Remediating</span>
                </div>
                <textarea
                  value={afterYaml}
                  onChange={(e) => setAfterYaml(e.target.value)}
                  rows={14}
                  className="w-full font-mono text-xs p-3 rounded-xl bg-[#071F20]/5 text-[#071F20] border border-[#071F20]/10 focus:outline-none focus:ring-2 focus:ring-[#48D9C1] resize-none"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white/80 border border-[#071F20]/15 shadow-sm">
              <div className="text-xs text-[#476363] font-mono">
                Runs AST parser checking rules GHA-001 through GHA-006 (Pinning, Injection, Tokens).
              </div>
              <button
                onClick={handleVerifyWorkflow}
                disabled={isVerifyingWorkflow}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#071F20] text-white hover:bg-[#123B3A] font-semibold text-xs font-mono flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50 transition-all"
              >
                {isVerifyingWorkflow ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Analyzing AST Diff...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 text-[#D47A4A] fill-current" />
                    <span>Run Verification Check</span>
                  </>
                )}
              </button>
            </div>

            {/* Verification Result Output */}
            {workflowResult && (
              <div className="rounded-2xl border border-[#071F20]/15 bg-white p-6 shadow-md space-y-4 font-mono">
                {workflowResult.error ? (
                  <div className="p-4 rounded-xl bg-[#FF647C]/15 border border-[#FF647C]/30 text-[#962A35] text-xs flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-[#FF647C] shrink-0" />
                    <span>{workflowResult.error}</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#071F20]/10 pb-4">
                      <div className="flex items-center gap-2">
                        {workflowResult.allPassed ? (
                          <div className="p-1 rounded-full bg-[#48D9C1]/20 text-[#123B3A]">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="p-1 rounded-full bg-[#FFC36B]/20 text-[#D47A4A]">
                            <AlertTriangle className="w-5 h-5" />
                          </div>
                        )}
                        <span className="font-bold text-sm text-[#071F20]">
                          {workflowResult.allPassed
                            ? 'All Findings Resolved Successfully'
                            : 'Partial Remediation — Outstanding Findings Remain'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="px-2.5 py-1 rounded-lg bg-[#FF647C]/15 text-[#962A35]">
                          Original: {workflowResult.beforeFindingsCount} findings
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-[#48D9C1]/20 text-[#123B3A]">
                          Resolved: {workflowResult.resolvedFindingsCount}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-[#071F20]/5 text-[#476363]">
                          Remaining: {workflowResult.remainingFindingsCount}
                        </span>
                      </div>
                    </div>

                    {/* Breakdown Comparisons */}
                    <div className="space-y-3 pt-2">
                      <h3 className="text-xs font-bold text-[#071F20] uppercase tracking-wider">
                        Rule Evaluation Log:
                      </h3>
                      {workflowResult.comparisons?.map((c: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl border border-[#071F20]/10 bg-[#071F20]/5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-[#071F20]">
                              {c.ruleId} — {c.title}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                c.status === 'resolved'
                                  ? 'bg-[#48D9C1]/25 text-[#123B3A]'
                                  : 'bg-[#FF647C]/20 text-[#962A35]'
                              }`}
                            >
                              {c.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs text-[#476363]">{c.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Tab 2: Dependency Version Upgrade */
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#071F20]/15 bg-white/80 p-6 shadow-sm space-y-5">
              <h2 className="font-bold text-sm font-mono text-[#071F20]">
                Live OSV Database Advisory Query
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-mono text-[#476363] mb-1.5">Package Name</label>
                  <input
                    type="text"
                    value={packageName}
                    onChange={(e) => setPackageName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#071F20]/15 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#48D9C1]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#476363] mb-1.5">Current Vulnerable Version</label>
                  <input
                    type="text"
                    value={currentVersion}
                    onChange={(e) => setCurrentVersion(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#071F20]/15 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF647C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#476363] mb-1.5">Proposed Upgraded Version</label>
                  <input
                    type="text"
                    value={proposedVersion}
                    onChange={(e) => setProposedVersion(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#071F20]/15 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#48D9C1]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#476363] mb-1.5">Package Ecosystem</label>
                  <select
                    value={ecosystem}
                    onChange={(e) => setEcosystem(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#071F20]/15 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#D47A4A]"
                  >
                    <option value="npm">npm (JavaScript)</option>
                    <option value="PyPI">PyPI (Python)</option>
                    <option value="crates.io">crates.io (Rust)</option>
                    <option value="Packagist">Packagist (PHP)</option>
                    <option value="RubyGems">RubyGems (Ruby)</option>
                    <option value="Maven">Maven (Java)</option>
                    <option value="NuGet">NuGet (.NET)</option>
                    <option value="Go">Go (Go Modules)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleVerifyDependency}
                  disabled={isVerifyingDep || !packageName || !proposedVersion}
                  className="px-6 py-3 rounded-xl bg-[#071F20] text-white hover:bg-[#123B3A] font-semibold text-xs font-mono flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50 transition-all"
                >
                  {isVerifyingDep ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Querying OSV API...</span>
                    </>
                  ) : (
                    <>
                      <PackageCheck className="w-4 h-4 text-[#48D9C1]" />
                      <span>Query OSV & Verify Upgrade</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Dependency Result Output */}
            {dependencyResult && (
              <div className="rounded-2xl border border-[#071F20]/15 bg-white p-6 shadow-md space-y-4 font-mono">
                {dependencyResult.error ? (
                  <div className="p-4 rounded-xl bg-[#FF647C]/15 border border-[#FF647C]/30 text-[#962A35] text-xs flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-[#FF647C] shrink-0" />
                    <span>{dependencyResult.error}</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-[#071F20]/10 pb-4">
                      <div className="flex items-center gap-2">
                        {dependencyResult.isRemediated ? (
                          <div className="p-1 rounded-full bg-[#48D9C1]/20 text-[#123B3A]">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="p-1 rounded-full bg-[#FF647C]/20 text-[#962A35]">
                            <AlertTriangle className="w-5 h-5" />
                          </div>
                        )}
                        <span className="font-bold text-sm text-[#071F20]">
                          {dependencyResult.isRemediated
                            ? `Upgrade Remediates Vulnerabilities in ${packageName}`
                            : `Upgrade Does Not Resolve All Known Advisories`}
                        </span>
                      </div>
                      <span className="px-3 py-1 rounded-lg text-xs font-bold bg-[#071F20]/5 text-[#071F20]">
                        {dependencyResult.status}
                      </span>
                    </div>

                    <p className="text-xs text-[#476363]">{dependencyResult.explanation}</p>

                    <div className="grid grid-cols-2 gap-4 text-xs pt-2">
                      <div className="p-3 rounded-xl bg-[#FF647C]/10 border border-[#FF647C]/20">
                        <span className="text-[#962A35] block font-semibold mb-1">
                          Previous Advisories ({packageName}@{currentVersion}):
                        </span>
                        <span className="text-lg font-bold text-[#962A35]">
                          {dependencyResult.previousAdvisoriesCount ?? '—'}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-[#48D9C1]/15 border border-[#48D9C1]/25">
                        <span className="text-[#123B3A] block font-semibold mb-1">
                          Remaining Advisories ({packageName}@{proposedVersion}):
                        </span>
                        <span className="text-lg font-bold text-[#123B3A]">
                          {dependencyResult.remainingAdvisoriesCount ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
