'use client';

import React from 'react';
import Link from 'next/link';
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
  ArrowRight,
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
      name: '.NET',
      tooling: 'NuGet',
      files: 'packages.lock.json, *.csproj',
      supportLevel: 'Lockfile & Project Specifiers',
      status: 'production',
    },
    {
      name: 'Go',
      tooling: 'Go Modules',
      files: 'go.mod, go.sum',
      supportLevel: 'Full Cryptographic Checksum Matching',
      status: 'production',
    },
  ];

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
      {/* Header Block */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[rgba(159,190,220,0.16)] pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111F33] border border-[#48D9C1]/30 text-xs font-mono text-[#48D9C1] mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Audit Coverage & Ecosystem Engine</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F1F6FC] tracking-tight">
            Ecosystem Resolution Matrix
          </h1>
          <p className="text-xs sm:text-sm text-[#9AAEC4] font-mono mt-1">
            Exact specifier classification, lockfile reconciliation, and AST security coverage bounds.
          </p>
        </div>

        <Link
          href="/analyze"
          className="px-4 py-2 rounded-xl bg-[#48D9C1] hover:bg-[#3ec4ad] text-[#07111F] text-xs font-mono font-bold flex items-center gap-2 shadow-sm transition-all self-start sm:self-auto"
        >
          <span>Analyze Manifest</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Ecosystem Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
        {ecosystems.map((eco) => (
          <div
            key={eco.name}
            className="p-5 rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] space-y-3 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#F1F6FC] text-sm">{eco.name}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#48D9C1]/20 text-[#48D9C1] border border-[#48D9C1]/30">
                {eco.status}
              </span>
            </div>

            <div className="space-y-1.5 text-[#9AAEC4]">
              <div>
                <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Tooling / Runtimes:</span>
                <span>{eco.tooling}</span>
              </div>
              <div>
                <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Supported File Patterns:</span>
                <code className="text-[#65BFFF]">{eco.files}</code>
              </div>
              <div>
                <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Resolution Guarantee:</span>
                <span className="text-[#48D9C1]">{eco.supportLevel}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
