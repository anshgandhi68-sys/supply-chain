'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useScan } from '@/lib/context/ScanContext';
import { validateJsonInput } from '@/lib/validation';
import {
  Upload,
  FileCode,
  Globe,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  ShieldAlert,
  Layers,
  Terminal,
  FileJson,
  ExternalLink,
  GitFork,
  ShieldCheck,
  FileText,
  Wrench,
} from 'lucide-react';

export default function RepositoryAnalysisPage() {
  const router = useRouter();
  const { runScan, runDirectManifestScan, isLoading, errorMsg, scanResult } = useScan();
  const [scanSuccessMsg, setScanSuccessMsg] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'upload' | 'github' | 'fixtures'>('upload');

  // Direct upload/paste state
  const [packageJsonText, setPackageJsonText] = useState(`{
  "name": "my-application",
  "version": "1.0.0",
  "dependencies": {
    "axios": "0.21.1",
    "lodash": "4.17.20",
    "minimist": "1.2.5"
  }
}`);
  const [packageLockText, setPackageLockText] = useState(`{
  "name": "my-application",
  "version": "1.0.0",
  "lockfileVersion": 2,
  "requires": true,
  "packages": {
    "": {
      "name": "my-application",
      "version": "1.0.0",
      "dependencies": {
        "axios": "0.21.1",
        "lodash": "4.17.20",
        "minimist": "1.2.5"
      }
    },
    "node_modules/axios": {
      "version": "0.21.1",
      "resolved": "https://registry.npmjs.org/axios/-/axios-0.21.1.tgz",
      "dependencies": {
        "follow-redirects": "^1.10.0"
      }
    },
    "node_modules/follow-redirects": {
      "version": "1.14.0",
      "resolved": "https://registry.npmjs.org/follow-redirects/-/follow-redirects-1.14.0.tgz"
    },
    "node_modules/lodash": {
      "version": "4.17.20",
      "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz"
    },
    "node_modules/minimist": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/minimist/-/minimist-1.2.5.tgz"
    }
  }
}`);
  const [projectName, setProjectName] = useState('My-Audit-Project');
  const [workflowText, setWorkflowText] = useState('');

  // Remote GitHub state
  const [repoUrl, setRepoUrl] = useState('');
  const [githubToken, setGithubToken] = useState('');

  // Local validation errors
  const [pkgJsonError, setPkgJsonError] = useState<string | null>(null);
  const [pkgLockError, setPkgLockError] = useState<string | null>(null);

  // File Upload Handlers
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'packageJson' | 'packageLock'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (type === 'packageJson') {
        setPackageJsonText(content);
        const check = validateJsonInput(content, 'package.json');
        setPkgJsonError(check.isValid ? null : check.error || 'Invalid JSON');
      } else {
        setPackageLockText(content);
        const check = validateJsonInput(content, 'package-lock.json');
        setPkgLockError(check.isValid ? null : check.error || 'Invalid JSON');
      }
    };
    reader.readAsText(file);
  };

  const handleRunLocalScan = async () => {
    // Validate inputs
    let hasError = false;
    if (packageJsonText.trim()) {
      const check = validateJsonInput(packageJsonText, 'package.json');
      if (!check.isValid) {
        setPkgJsonError(check.error || 'Invalid JSON');
        hasError = true;
      } else {
        setPkgJsonError(null);
      }
    }

    if (packageLockText.trim()) {
      const check = validateJsonInput(packageLockText, 'package-lock.json');
      if (!check.isValid) {
        setPkgLockError(check.error || 'Invalid JSON');
        hasError = true;
      } else {
        setPkgLockError(null);
      }
    }

    if (hasError) return;

    setScanSuccessMsg(null);
    const res = await runDirectManifestScan({
      packageJsonContent: packageJsonText,
      packageLockContent: packageLockText,
      workflowYamlContent: workflowText || undefined,
      projectName,
    });

    if (res) {
      setScanSuccessMsg(
        `Analysis complete! Identified ${res.findings.length} findings across ${res.stats?.dependenciesScanned ?? 0} dependencies.`
      );
    }
  };

  const handleRunGitHubScan = async () => {
    if (!repoUrl.trim()) return;
    setScanSuccessMsg(null);
    const res = await runScan(repoUrl.trim(), false, githubToken || undefined);
    if (res) {
      setScanSuccessMsg(
        `Repository scan complete! Identified ${res.findings.length} findings across ${res.stats?.dependenciesScanned ?? 0} dependencies.`
      );
    }
  };

  const handleRunFixture = async (fixtureId: string) => {
    if (fixtureId === 'demo') {
      setScanSuccessMsg(null);
      const res = await runScan('demo', true);
      if (res) {
        setScanSuccessMsg(`Risky benchmark loaded! Identified ${res.findings.length} findings.`);
      }
    }
  };

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
      {/* Header */}
      <div className="border-b border-[rgba(159,190,220,0.16)] pb-5">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#111F33] border border-[#48D9C1]/30 text-xs font-mono text-[#48D9C1] mb-2">
          <Upload className="w-3.5 h-3.5" />
          <span>Manifest & Repository Ingestion</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F1F6FC] tracking-tight">
          Repository Analysis Engine
        </h1>
        <p className="text-xs sm:text-sm text-[#9AAEC4] font-mono mt-1">
          Upload dependency manifests or supply a public repository URL to parse actual dependency trees and match known vulnerabilities.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-1 bg-[#111F33] border border-[rgba(159,190,220,0.16)] rounded-xl w-fit font-mono text-xs">
        <button
          onClick={() => setActiveTab('upload')}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all cursor-pointer ${
            activeTab === 'upload'
              ? 'bg-[#17283C] text-[#48D9C1] font-bold border border-[#48D9C1]/30 shadow-sm'
              : 'text-[#9AAEC4] hover:text-[#F1F6FC]'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>Upload / Paste Manifests</span>
        </button>

        <button
          onClick={() => setActiveTab('github')}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all cursor-pointer ${
            activeTab === 'github'
              ? 'bg-[#17283C] text-[#48D9C1] font-bold border border-[#48D9C1]/30 shadow-sm'
              : 'text-[#9AAEC4] hover:text-[#F1F6FC]'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Public GitHub Repository</span>
        </button>

        <button
          onClick={() => setActiveTab('fixtures')}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all cursor-pointer ${
            activeTab === 'fixtures'
              ? 'bg-[#17283C] text-[#48D9C1] font-bold border border-[#48D9C1]/30 shadow-sm'
              : 'text-[#9AAEC4] hover:text-[#F1F6FC]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Controlled Benchmark Fixtures</span>
        </button>
      </div>

      {/* Success Notification Banner */}
      {scanSuccessMsg && (
        <div className="p-4 rounded-xl bg-[#48D9C1]/15 border border-[#48D9C1]/40 text-xs font-mono text-[#48D9C1] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-[#48D9C1]" />
            <span>{scanSuccessMsg}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/"
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-[#48D9C1] text-[#07111F] font-bold text-xs hover:bg-[#3ec4ad] transition-colors"
            >
              <span>Workstation Overview</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#FF647C]/15 border border-[#FF647C]/30 text-xs font-mono text-[#FF647C] flex items-center space-x-2">
          <AlertOctagon className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tab 1: Upload / Paste */}
      {activeTab === 'upload' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.14)] text-xs font-mono text-[#9AAEC4] flex items-start space-x-3">
            <AlertTriangle className="w-4 h-4 text-[#FFC36B] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#F1F6FC]">Graph Integrity Guarantee:</strong> Sentinel parses actual dependency trees from <code>package-lock.json</code>. If only <code>package.json</code> is provided without a lockfile, exact installed versions cannot be verified with certainty and will be honestly labeled as <code>VERSION_UNVERIFIED</code>.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* package.json Editor */}
            <div className="rounded-xl p-5 bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <label className="font-bold text-[#F1F6FC] flex items-center space-x-1.5">
                  <FileJson className="w-4 h-4 text-[#48D9C1]" />
                  <span>package.json (Declared)</span>
                </label>
                <label className="text-[11px] text-[#65BFFF] hover:underline cursor-pointer">
                  <span>Browse File</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => handleFileUpload(e, 'packageJson')}
                    className="hidden"
                  />
                </label>
              </div>

              <textarea
                value={packageJsonText}
                onChange={(e) => {
                  setPackageJsonText(e.target.value);
                  setPkgJsonError(null);
                }}
                rows={12}
                className="w-full p-3 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#65BFFF] font-mono text-xs focus:outline-none focus:border-[#48D9C1] leading-relaxed"
                placeholder="Paste package.json contents here..."
              />

              {pkgJsonError && (
                <p className="text-[#FF647C] text-[11px]">{pkgJsonError}</p>
              )}
            </div>

            {/* package-lock.json Editor */}
            <div className="rounded-xl p-5 bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <label className="font-bold text-[#F1F6FC] flex items-center space-x-1.5">
                  <FileCode className="w-4 h-4 text-[#FFC36B]" />
                  <span>package-lock.json (Resolved Tree)</span>
                </label>
                <label className="text-[11px] text-[#65BFFF] hover:underline cursor-pointer">
                  <span>Browse Lockfile</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => handleFileUpload(e, 'packageLock')}
                    className="hidden"
                  />
                </label>
              </div>

              <textarea
                value={packageLockText}
                onChange={(e) => {
                  setPackageLockText(e.target.value);
                  setPkgLockError(null);
                }}
                rows={12}
                className="w-full p-3 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#FFC36B] font-mono text-xs focus:outline-none focus:border-[#48D9C1] leading-relaxed"
                placeholder="Paste package-lock.json contents here..."
              />

              {pkgLockError && (
                <p className="text-[#FF647C] text-[11px]">{pkgLockError}</p>
              )}
            </div>
          </div>

          {/* Project Details and Submit */}
          <div className="p-5 rounded-xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs">
            <div className="flex items-center space-x-3">
              <span className="text-[#9AAEC4]">Project Identifier:</span>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] focus:outline-none focus:border-[#48D9C1]"
              />
            </div>

            <button
              onClick={handleRunLocalScan}
              disabled={isLoading}
              className="inline-flex items-center justify-center space-x-2 px-6 py-2.5 rounded-lg bg-[#48D9C1] hover:bg-[#3ec4ad] text-[#07111F] font-bold shadow-lg transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#07111F]/30 border-t-[#07111F] rounded-full animate-spin" />
                  <span>Parsing & Analyzing...</span>
                </>
              ) : (
                <>
                  <span>Run Security Analysis</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: GitHub Repository */}
      {activeTab === 'github' && (
        <div className="rounded-xl p-6 bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-6 font-mono text-xs">
          <div className="space-y-2">
            <label className="block font-bold text-[#F1F6FC]">
              Public GitHub Repository URL
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/expressjs/express"
              className="w-full p-3 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] font-mono text-xs focus:outline-none focus:border-[#48D9C1]"
            />
            <p className="text-[11px] text-[#6E829B]">
              Supports exact branch or subpath: e.g. <code>https://github.com/org/repo/tree/v2.1.0/packages/core</code>
            </p>
          </div>

          <div className="space-y-2">
            <label className="block font-bold text-[#9AAEC4]">
              Optional GitHub Personal Access Token (PAT)
            </label>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx (Optional, increases rate limit to 5000 req/hr)"
              className="w-full p-3 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] font-mono text-xs focus:outline-none focus:border-[#48D9C1]"
            />
            <p className="text-[11px] text-[#6E829B]">
              Never transmitted to any third party. Used strictly client-to-GitHub for rate limit expansion.
            </p>
          </div>

          <button
            onClick={handleRunGitHubScan}
            disabled={isLoading || !repoUrl.trim()}
            className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-lg bg-[#48D9C1] hover:bg-[#3ec4ad] text-[#07111F] font-bold shadow-lg transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-[#07111F]/30 border-t-[#07111F] rounded-full animate-spin" />
                <span>Scanning Repository...</span>
              </>
            ) : (
              <>
                <span>Inspect Repository</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}

      {/* Tab 3: Security Benchmark Fixtures */}
      {activeTab === 'fixtures' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          <div className="p-5 rounded-xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#FF647C]/20 text-[#FF647C] border border-[#FF647C]/40">
                Controlled Risky Benchmark
              </span>
              <Sparkles className="w-4 h-4 text-[#FFC36B]" />
            </div>
            <h3 className="font-bold text-sm text-[#F1F6FC]">Vulnerable Supply Chain Demo</h3>
            <p className="text-[#9AAEC4] leading-relaxed">
              Exhibits pinned vulnerable dependencies (<code>axios@0.21.1</code>, <code>lodash@4.17.20</code>, <code>minimist@1.2.5</code>) and hazardous GitHub Actions workflows.
            </p>
            <button
              onClick={() => handleRunFixture('demo')}
              disabled={isLoading}
              className="w-full mt-2 py-2 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#65BFFF] border border-[#65BFFF]/30 font-bold transition-colors cursor-pointer"
            >
              Load Risky Benchmark
            </button>
          </div>

          <div className="p-5 rounded-xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#48D9C1]/20 text-[#48D9C1] border border-[#48D9C1]/40">
                Clean Production Standard
              </span>
              <CheckCircle2 className="w-4 h-4 text-[#48D9C1]" />
            </div>
            <h3 className="font-bold text-sm text-[#F1F6FC]">Hardened CI & Dependencies</h3>
            <p className="text-[#9AAEC4] leading-relaxed">
              Demonstrates least-privilege permissions (<code>contents: read</code>), full 40-character commit SHA pinning, and modern patched dependencies.
            </p>
            <button
              onClick={() => {
                setPackageJsonText(JSON.stringify({
                  name: 'hardened-production-app',
                  version: '2.0.0',
                  dependencies: {
                    lodash: '4.17.21',
                    axios: '1.6.0'
                  }
                }, null, 2));
                setPackageLockText(JSON.stringify({
                  name: 'hardened-production-app',
                  version: '2.0.0',
                  lockfileVersion: 2,
                  packages: {
                    "": { name: "hardened-production-app", version: "2.0.0", dependencies: { lodash: "4.17.21", axios: "1.6.0" } },
                    "node_modules/lodash": { version: "4.17.21" },
                    "node_modules/axios": { version: "1.6.0" }
                  }
                }, null, 2));
                setActiveTab('upload');
              }}
              className="w-full mt-2 py-2 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#48D9C1] border border-[#48D9C1]/30 font-bold transition-colors cursor-pointer"
            >
              Load Clean Standard
            </button>
          </div>
        </div>
      )}

      {/* Active Scan Results & Intelligence Dock */}
      {scanResult && (
        <div className="mt-8 p-6 rounded-xl bg-[#111F33] border border-[#48D9C1]/40 space-y-5 font-mono shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[rgba(159,190,220,0.16)] gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#48D9C1] animate-ping" />
                <span className="text-xs uppercase tracking-wider text-[#48D9C1] font-bold">Active Analysis Results</span>
              </div>
              <h2 className="text-lg font-bold text-[#F1F6FC] mt-1">
                {scanResult.repository?.fullName || 'Analyzed Project'}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${
                scanResult.scanVerdict === 'complete_with_findings'
                  ? 'bg-[#FF647C]/20 text-[#FF647C] border border-[#FF647C]/40'
                  : 'bg-[#48D9C1]/20 text-[#48D9C1] border border-[#48D9C1]/40'
              }`}>
                {scanResult.scanVerdict.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.1)]">
              <div className="text-[11px] text-[#9AAEC4]">Dependencies</div>
              <div className="text-xl font-bold text-[#F1F6FC]">{scanResult.stats?.dependenciesScanned ?? 0}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.1)]">
              <div className="text-[11px] text-[#9AAEC4]">Total Findings</div>
              <div className="text-xl font-bold text-[#FF647C]">{scanResult.stats?.totalFindings ?? 0}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.1)]">
              <div className="text-[11px] text-[#9AAEC4]">Critical / High</div>
              <div className="text-xl font-bold text-[#FF647C]">
                {(scanResult.stats?.criticalCount ?? 0) + (scanResult.stats?.highCount ?? 0)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.1)]">
              <div className="text-[11px] text-[#9AAEC4]">Plausible Paths</div>
              <div className="text-xl font-bold text-[#FFC36B]">
                {scanResult.dependencyGraph?.attackPaths?.length ?? 0}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <div className="text-xs text-[#9AAEC4] mb-3">Explore Findings & Security Modules:</div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Link
                href="/"
                className="flex items-center justify-center space-x-2 p-2.5 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#F1F6FC] text-xs font-bold border border-[rgba(159,190,220,0.2)] transition-colors"
              >
                <span>3D Workstation</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/graph"
                className="flex items-center justify-center space-x-2 p-2.5 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#F1F6FC] text-xs font-bold border border-[rgba(159,190,220,0.2)] transition-colors"
              >
                <GitFork className="w-3.5 h-3.5 text-[#48D9C1]" />
                <span>Attack Graph</span>
              </Link>
              <Link
                href="/investigate"
                className="flex items-center justify-center space-x-2 p-2.5 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#F1F6FC] text-xs font-bold border border-[rgba(159,190,220,0.2)] transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#FFC36B]" />
                <span>Investigation</span>
              </Link>
              <Link
                href="/remediation"
                className="flex items-center justify-center space-x-2 p-2.5 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#F1F6FC] text-xs font-bold border border-[rgba(159,190,220,0.2)] transition-colors"
              >
                <Wrench className="w-3.5 h-3.5 text-[#65BFFF]" />
                <span>Remediation</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
