'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  FileCode2,
  Package,
  GitBranch,
  Star,
  Activity,
  Layers,
  Download,
  FileText,
  Clock,
  CheckCircle,
  FileJson,
  Shield,
  FileSpreadsheet,
} from 'lucide-react';
import { ScanResult } from '@/lib/types';

interface ScanOverviewProps {
  result: ScanResult;
}

export const ScanOverview: React.FC<ScanOverviewProps> = ({ result }) => {
  const { repository, stats, manifestsFound, workflowsFound, warnings, errors, coverage, scanVerdict } = result;
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const handleExport = async (format: 'json' | 'cyclonedx' | 'csv') => {
    setIsExporting(format);
    try {
      const res = await fetch(`/api/export?format=${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = format === 'csv' ? 'csv' : 'json';
        a.download = `${repository.repo || 'scan'}-${format}-report.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setIsExporting(null);
    }
  };

  const renderVerdictBadge = () => {
    switch (scanVerdict) {
      case 'complete_with_findings':
        return (
          <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-[#FF647C]/15 text-[#962A35] border border-[#FF647C]/30 flex items-center space-x-1.5 shadow-sm">
            <AlertTriangle className="w-3.5 h-3.5 text-[#B73945]" />
            <span>Analysis Complete — Findings Detected</span>
          </span>
        );
      case 'complete_clean':
        return (
          <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-[#48D9C1]/20 text-[#123B3A] border border-[#48D9C1]/40 flex items-center space-x-1.5 shadow-sm">
            <CheckCircle className="w-3.5 h-3.5 text-[#123B3A]" />
            <span>Analysis Complete — Zero Findings by Enabled Checks</span>
          </span>
        );
      case 'incomplete_evidence_required':
        return (
          <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-[#D47A4A]/15 text-[#964B00] border border-[#D47A4A]/30 flex items-center space-x-1.5 shadow-sm">
            <AlertOctagon className="w-3.5 h-3.5 text-[#D47A4A]" />
            <span>Analysis Incomplete — Missing Lockfile or Unverified Ranges</span>
          </span>
        );
      case 'scan_failed':
      default:
        return (
          <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-[#FF647C]/15 text-[#962A35] border border-[#FF647C]/30 flex items-center space-x-1.5 shadow-sm">
            <AlertOctagon className="w-3.5 h-3.5 text-[#B73945]" />
            <span>Scan Failed — Reliable Analysis Unavailable</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Repository Context Bar */}
      <div className="rounded-2xl p-4 sm:p-5 bg-white/90 border border-[#071F20]/15 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#071F20]/5 border border-[#071F20]/10 flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5 text-[#D47A4A]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-[#071F20]">
                {repository.fullName}
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] bg-[#071F20]/5 text-[#476363] border border-[#071F20]/10 font-bold">
                Ref: {repository.resolvedCommitSha ? repository.resolvedCommitSha.slice(0, 7) : repository.defaultBranch}
              </span>
              {repository.stars !== undefined && repository.stars > 0 && (
                <span className="flex items-center space-x-1 text-xs text-[#D47A4A] font-bold">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span>{repository.stars.toLocaleString()}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-[#6E829B] mt-0.5">
              Scanned: {new Date(result.scannedAt).toLocaleString()} &bull; Scanner Version: {result.scannerVersion || '1.2.0'}
            </p>
          </div>
        </div>

        {/* Verdict and Export Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {renderVerdictBadge()}

          {/* Export Buttons */}
          <div className="flex items-center space-x-1.5 text-xs">
            <button
              onClick={() => handleExport('cyclonedx')}
              disabled={Boolean(isExporting)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F4F0E6] text-[#071F20] border border-[#071F20]/15 hover:border-[#D47A4A] transition-all text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-50"
              title="Download CycloneDX v1.5 JSON SBOM"
            >
              <FileCode2 className="w-3.5 h-3.5 text-[#D47A4A]" />
              <span>CycloneDX SBOM</span>
            </button>

            <button
              onClick={() => handleExport('json')}
              disabled={Boolean(isExporting)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F4F0E6] text-[#071F20] border border-[#071F20]/15 hover:border-[#D47A4A] transition-all text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-50"
              title="Download Complete Audit Report JSON"
            >
              <FileJson className="w-3.5 h-3.5 text-[#48D9C1]" />
              <span>JSON</span>
            </button>

            <button
              onClick={() => handleExport('csv')}
              disabled={Boolean(isExporting)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F4F0E6] text-[#071F20] border border-[#071F20]/15 hover:border-[#D47A4A] transition-all text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-50"
              title="Download CSV Findings Table"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#476363]" />
              <span>CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Coverage Disclosure Notice */}
      <div className="px-4 py-3 rounded-xl bg-white/80 border border-[#071F20]/12 text-xs text-[#476363] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center space-x-2">
          <Info className="w-4 h-4 text-[#D47A4A] shrink-0" />
          <span>
            <strong className="text-[#071F20]">Deterministic Evidence Coverage:</strong> Scanned {coverage?.filesAnalyzed ?? 0} files across {coverage?.manifestsDetected?.length ?? 0} manifest(s) and {coverage?.workflowFilesAnalyzed ?? 0} workflow(s).
          </span>
        </div>
        <span className="text-[11px] text-[#6E829B] italic">
          Absence of findings is not proof of absence of vulnerabilities.
        </span>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Critical */}
        <div className="p-4 rounded-xl bg-white/90 border border-[#071F20]/12 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#6E829B] uppercase font-bold tracking-wider">Critical</span>
            <AlertOctagon className="w-4 h-4 text-[#B73945]" />
          </div>
          <div className="mt-1.5 flex items-baseline space-x-1.5">
            <span className="text-2xl font-extrabold text-[#071F20]">
              {stats.criticalCount}
            </span>
            <span className="text-[10px] text-[#B73945] font-bold">CVSS 9.0+</span>
          </div>
        </div>

        {/* High */}
        <div className="p-4 rounded-xl bg-white/90 border border-[#071F20]/12 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#6E829B] uppercase font-bold tracking-wider">High</span>
            <AlertTriangle className="w-4 h-4 text-[#D47A4A]" />
          </div>
          <div className="mt-1.5 flex items-baseline space-x-1.5">
            <span className="text-2xl font-extrabold text-[#071F20]">
              {stats.highCount}
            </span>
            <span className="text-[10px] text-[#D47A4A] font-bold">CVSS 7.0+</span>
          </div>
        </div>

        {/* Medium */}
        <div className="p-4 rounded-xl bg-white/90 border border-[#071F20]/12 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#6E829B] uppercase font-bold tracking-wider">Medium</span>
            <ShieldAlert className="w-4 h-4 text-[#D47A4A]" />
          </div>
          <div className="mt-1.5 flex items-baseline space-x-1.5">
            <span className="text-2xl font-extrabold text-[#071F20]">
              {stats.mediumCount}
            </span>
            <span className="text-[10px] text-[#D47A4A] font-bold">CVSS 4.0+</span>
          </div>
        </div>

        {/* Low / Info */}
        <div className="p-4 rounded-xl bg-white/90 border border-[#071F20]/12 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#6E829B] uppercase font-bold tracking-wider">Low / Info</span>
            <Info className="w-4 h-4 text-[#476363]" />
          </div>
          <div className="mt-1.5 flex items-baseline space-x-1.5">
            <span className="text-2xl font-extrabold text-[#071F20]">
              {stats.lowCount + stats.infoCount}
            </span>
            <span className="text-[10px] text-[#476363] font-bold">Audit</span>
          </div>
        </div>

        {/* Dependencies Scanned */}
        <div className="p-4 rounded-xl bg-white/90 border border-[#071F20]/12 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#6E829B] uppercase font-bold tracking-wider">Packages</span>
            <Package className="w-4 h-4 text-[#123B3A]" />
          </div>
          <div className="mt-1.5 flex items-baseline space-x-1.5">
            <span className="text-2xl font-extrabold text-[#071F20]">
              {coverage?.dependenciesDiscovered ?? stats.dependenciesScanned}
            </span>
            <span className="text-[10px] text-[#123B3A] font-bold">
              {coverage?.exactVersionsResolved ? `${coverage.exactVersionsResolved} Exact` : 'Discovered'}
            </span>
          </div>
        </div>

        {/* Workflows Analyzed */}
        <div className="p-4 rounded-xl bg-white/90 border border-[#071F20]/12 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#6E829B] uppercase font-bold tracking-wider">Workflows</span>
            <FileCode2 className="w-4 h-4 text-[#123B3A]" />
          </div>
          <div className="mt-1.5 flex items-baseline space-x-1.5">
            <span className="text-2xl font-extrabold text-[#071F20]">
              {coverage?.workflowFilesAnalyzed ?? stats.workflowsScanned}
            </span>
            <span className="text-[10px] text-[#123B3A] font-bold">AST Rules</span>
          </div>
        </div>
      </div>

      {/* Warnings & Incomplete Coverage Disclosures */}
      {warnings && warnings.length > 0 && (
        <div className="p-4 rounded-xl bg-[#D47A4A]/10 border border-[#D47A4A]/30 text-xs space-y-1.5 shadow-sm">
          <div className="flex items-center space-x-2 text-[#964B00] font-bold">
            <AlertTriangle className="w-4 h-4 text-[#D47A4A]" />
            <span>Analysis Disclosures & Scope Limitations:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-[#476363] pl-1">
            {warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Upstream / Parsing Errors */}
      {errors && errors.length > 0 && (
        <div className="p-4 rounded-xl bg-[#FF647C]/15 border border-[#FF647C]/30 text-xs space-y-1.5 shadow-sm">
          <div className="flex items-center space-x-2 text-[#962A35] font-bold">
            <AlertOctagon className="w-4 h-4 text-[#B73945]" />
            <span>Scan Warnings & Upstream Interruptions:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-[#962A35] pl-1">
            {errors.map((e, idx) => (
              <li key={idx}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
