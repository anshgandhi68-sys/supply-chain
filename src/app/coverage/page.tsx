'use client';

import React from 'react';
import { EditorialNav } from '@/components/EditorialNav';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Package,
  Layers,
  HelpCircle,
  AlertOctagon,
  FileText,
  Lock,
} from 'lucide-react';

export default function CoveragePage() {
  const ecosystems = [
    {
      name: 'JavaScript / TypeScript',
      tooling: 'npm, Yarn, pnpm',
      files: 'package.json, package-lock.json, yarn.lock, pnpm-lock.yaml',
      supportLevel: 'Full Lockfile Resolution',
      status: 'production',
    },
    {
      name: 'Python',
      tooling: 'pip, Pipenv, Poetry, PEP 621',
      files: 'requirements.txt, Pipfile, Pipfile.lock, poetry.lock, pyproject.toml',
      supportLevel: 'Full Lockfile & Specifier Parsing',
      status: 'production',
    },
    {
      name: 'Rust',
      tooling: 'Cargo',
      files: 'Cargo.toml, Cargo.lock',
      supportLevel: 'Full Lockfile Resolution',
      status: 'production',
    },
    {
      name: 'PHP',
      tooling: 'Composer',
      files: 'composer.json, composer.lock',
      supportLevel: 'Full Lockfile Resolution',
      status: 'production',
    },
    {
      name: 'Ruby',
      tooling: 'Bundler',
      files: 'Gemfile, Gemfile.lock',
      supportLevel: 'Full Lockfile Resolution',
      status: 'production',
    },
    {
      name: 'Java',
      tooling: 'Maven',
      files: 'pom.xml',
      supportLevel: 'XML Dependency Extraction',
      status: 'production',
    },
    {
      name: '.NET / C#',
      tooling: 'NuGet',
      files: 'packages.lock.json, *.csproj',
      supportLevel: 'Lockfile & Project Parsing',
      status: 'production',
    },
    {
      name: 'Go',
      tooling: 'Go Modules',
      files: 'go.mod, go.sum',
      supportLevel: 'Full Checksum & Module Parsing',
      status: 'production',
    },
  ];

  const deterministicRules = [
    {
      id: 'GHA-001',
      category: 'CI/CD Supply Chain',
      severity: 'Medium',
      title: 'Unpinned Third-Party Action Reference',
      rationale: 'Tags and branches are mutable pointers susceptible to upstream hijacking. Must pin to an immutable 40-character commit SHA.',
    },
    {
      id: 'GHA-003',
      category: 'Privileged Trigger',
      severity: 'High',
      title: 'pull_request_target Checking Out Untrusted PR Head',
      rationale: 'Running untrusted code from fork pull requests with repository write tokens enables repository and secret compromise.',
    },
    {
      id: 'GHA-004',
      category: 'Injection Vulnerability',
      severity: 'High',
      title: 'Script Injection via Untrusted Context Expression',
      rationale: 'Interpolating untrusted expressions (e.g. ${{ github.event.issue.title }}) inside run scripts permits arbitrary command execution.',
    },
    {
      id: 'GHA-005',
      category: 'Remote Script Piping',
      severity: 'High',
      title: 'Piping Untrusted Remote Script into Shell',
      rationale: 'Piping unverified curl/wget streams directly into bash/sh introduces uninspected code execution risks.',
    },
    {
      id: 'GHA-006',
      category: 'Least Privilege',
      severity: 'Low',
      title: 'Missing Explicit Workflow Permissions Declaration',
      rationale: 'Without explicit permissions, GitHub Actions uses the repository default, which may grant excessive write access.',
    },
    {
      id: 'SECR-001..003',
      category: 'Secret Leak Detection',
      severity: 'Critical / High',
      title: 'Exposed Cloud Keys & Private Tokens',
      rationale: 'Scans for AWS access keys, GitHub PATs, and SSH private keys with automatic bullet masking (maskSecret).',
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#DDE8DD] text-[#071F20] font-sans selection:bg-[#D47A4A] selection:text-white pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <EditorialNav />

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header Block */}
        <div className="border-b border-[#071F20]/15 pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#071F20]/5 border border-[#071F20]/10 text-xs font-mono font-medium text-[#D47A4A] mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Honest Coverage & Transparency Report</span>
          </div>
          <h1 className="text-[clamp(28px,3.5vw,46px)] font-bold tracking-[-0.03em] leading-tight text-[#071F20]">
            Coverage & Ecosystem Audit
          </h1>
          <p className="text-[#476363] text-xs font-mono mt-1 max-w-2xl">
            Sentinel provides verified evidence across 10 packaging ecosystems and deterministic AST rules. We clearly disclose coverage limits.
          </p>
        </div>

        {/* Golden Rule Banner */}
        <div className="p-5 rounded-2xl bg-white/80 border border-[#071F20]/15 shadow-sm space-y-2 font-mono">
          <div className="flex items-center gap-2 text-xs font-bold text-[#071F20]">
            <HelpCircle className="w-4 h-4 text-[#D47A4A]" />
            <span>Core Grounding Principle: Evidence vs Speculation</span>
          </div>
          <p className="text-xs text-[#476363] leading-relaxed">
            Absence of findings is never reported as proof of security. When a manifest specifies a broad range (such as <code className="text-[#071F20] font-bold">^4.17.20</code>) without a lockfile, Sentinel records this as <span className="text-[#D47A4A] font-bold">version_unverified</span> rather than manufacturing a false confirmed CVE.
          </p>
        </div>

        {/* 1. Ecosystem Support Matrix */}
        <div className="space-y-4 font-mono">
          <h2 className="text-sm font-bold text-[#071F20] flex items-center gap-2">
            <Package className="w-4 h-4 text-[#D47A4A]" />
            <span>Supported Package Manifests & Lockfiles</span>
          </h2>

          <div className="rounded-2xl border border-[#071F20]/15 bg-white/80 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#071F20]/10 bg-[#071F20]/5 text-[#6E829B]">
                    <th className="py-3 px-4 font-semibold">Ecosystem</th>
                    <th className="py-3 px-4 font-semibold">Tooling</th>
                    <th className="py-3 px-4 font-semibold">Target Files</th>
                    <th className="py-3 px-4 font-semibold">Support Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#071F20]/5">
                  {ecosystems.map((eco) => (
                    <tr key={eco.name} className="hover:bg-black/[0.02]">
                      <td className="py-3 px-4 font-bold text-[#071F20]">{eco.name}</td>
                      <td className="py-3 px-4 text-[#476363]">{eco.tooling}</td>
                      <td className="py-3 px-4 text-[#071F20] text-[11px]">{eco.files}</td>
                      <td className="py-3 px-4 text-[#123B3A]">
                        <span className="px-2 py-0.5 rounded bg-[#48D9C1]/20 font-semibold">
                          {eco.supportLevel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 2. Deterministic AST Security Engine */}
        <div className="space-y-4 font-mono pt-4">
          <h2 className="text-sm font-bold text-[#071F20] flex items-center gap-2">
            <FileCode className="w-4 h-4 text-[#D47A4A]" />
            <span>GitHub Actions & CI/CD Security Engine</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {deterministicRules.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-xl border border-[#071F20]/15 bg-white/80 shadow-sm space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#071F20]">{r.id} — {r.title}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FF647C]/15 text-[#962A35]">
                    {r.severity}
                  </span>
                </div>
                <p className="text-[11px] text-[#476363] leading-relaxed">{r.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
