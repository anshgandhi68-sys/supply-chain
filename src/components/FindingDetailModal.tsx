'use client';

import React from 'react';
import Link from 'next/link';
import { Finding } from '@/lib/types';
import {
  X,
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  Info,
  CheckCircle2,
  ExternalLink,
  Terminal,
  FileCode,
  Lock,
  Layers,
  ArrowRight,
  Wrench,
  HelpCircle,
  Eye,
} from 'lucide-react';

interface FindingDetailModalProps {
  finding: Finding | null;
  onClose: () => void;
  onOpenFixStudio?: (finding?: Finding) => void;
}

export const FindingDetailModal: React.FC<FindingDetailModalProps> = ({
  finding,
  onClose,
  onOpenFixStudio,
}) => {
  if (!finding) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150 font-sans">
      <div className="bg-[#111F33] text-[#F1F6FC] rounded-2xl border border-[rgba(159,190,220,0.24)] shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[rgba(159,190,220,0.16)] flex items-start justify-between gap-3 bg-[#0B1728]/80">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2 font-mono">
              <span
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                  finding.severity === 'critical'
                    ? 'bg-[#FF647C]/20 text-[#FF647C] border border-[#FF647C]/40'
                    : finding.severity === 'high'
                    ? 'bg-[#FFC36B]/20 text-[#FFC36B] border border-[#FFC36B]/40'
                    : finding.severity === 'medium'
                    ? 'bg-[#65BFFF]/20 text-[#65BFFF] border border-[#65BFFF]/40'
                    : 'bg-white/10 text-[#9AAEC4] border border-white/15'
                }`}
              >
                {finding.severity.toUpperCase()}
              </span>

              <span className="px-2 py-0.5 rounded text-[10px] bg-[#17283C] text-[#9AAEC4] border border-[rgba(159,190,220,0.16)] font-mono">
                {finding.category}
              </span>

              <span className="px-2 py-0.5 rounded text-[10px] text-[#48D9C1] bg-[#48D9C1]/10 border border-[#48D9C1]/20 font-mono font-semibold">
                {finding.id}
              </span>

              {finding.confidence && (
                <span className="px-2 py-0.5 rounded text-[10px] text-[#9AAEC4] bg-white/5 border border-white/10 font-mono">
                  Confidence: {finding.confidence}
                </span>
              )}
            </div>

            <h3 className="text-base sm:text-lg font-bold font-mono text-[#F1F6FC]">{finding.title}</h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9AAEC4] hover:text-[#F1F6FC] bg-[#17283C] hover:bg-[#1D314A] border border-[rgba(159,190,220,0.2)] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-[#9AAEC4] font-mono">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.16)]">
            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Target Repository</span>
              <span className="text-[#F1F6FC] font-semibold">{finding.repository}</span>
            </div>

            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Commit / Ref</span>
              <span className="text-[#F1F6FC]">{finding.commitSha || 'HEAD'}</span>
            </div>

            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">File Location</span>
              <span className="text-[#65BFFF] font-bold">
                {finding.filePath}
                {finding.lineNumber ? ` (Line ${finding.lineNumber})` : ''}
              </span>
            </div>

            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Observed Value</span>
              <span className="text-[#FFC36B] font-bold">{finding.observedValue}</span>
            </div>

            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Detection Source</span>
              <span className="text-[#F1F6FC]">{finding.detectionSource}</span>
            </div>

            {finding.cvssScore !== undefined && (
              <div>
                <span className="text-[#6E829B] block text-[10px] uppercase font-bold">CVSS Score</span>
                <span className="text-[#FF647C] font-bold">{finding.cvssScore} / 10.0</span>
              </div>
            )}
          </div>

          {/* Tri-Part Evidence Model */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#F1F6FC] uppercase tracking-wider flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-[#48D9C1]" />
              <span>Evidence Classification (Facts vs Inferences vs Unknowns)</span>
            </h4>

            {/* Observed Facts */}
            {finding.observedFacts && finding.observedFacts.length > 0 && (
              <div className="p-3.5 rounded-xl bg-[#0B1728] border border-[#48D9C1]/30 space-y-1.5">
                <span className="text-[11px] font-bold text-[#48D9C1] flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Observed Facts (Deterministic Proof)</span>
                </span>
                <ul className="list-disc list-inside space-y-1 text-[#9AAEC4]">
                  {finding.observedFacts.map((fact, idx) => (
                    <li key={idx}>{fact}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Inferred Risks */}
            {finding.inferredRisks && finding.inferredRisks.length > 0 && (
              <div className="p-3.5 rounded-xl bg-[#0B1728] border border-[#FFC36B]/30 space-y-1.5">
                <span className="text-[11px] font-bold text-[#FFC36B] flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Inferred Risks (Reachability & Blast Radius)</span>
                </span>
                <ul className="list-disc list-inside space-y-1 text-[#9AAEC4]">
                  {finding.inferredRisks.map((risk, idx) => (
                    <li key={idx}>{risk}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Unknowns */}
            {finding.unknowns && finding.unknowns.length > 0 && (
              <div className="p-3.5 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.2)] space-y-1.5">
                <span className="text-[11px] font-bold text-[#65BFFF] flex items-center space-x-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Unknowns & Runtime Limitations</span>
                </span>
                <ul className="list-disc list-inside space-y-1 text-[#9AAEC4]">
                  {finding.unknowns.map((un, idx) => (
                    <li key={idx}>{un}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Evidence Snippet */}
          <div className="space-y-1.5">
            <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Evidence Excerpt (Redacted)</span>
            <div className="relative">
              <pre className="p-4 rounded-xl bg-[#07111F] border border-[rgba(159,190,220,0.16)] text-[#65BFFF] overflow-x-auto text-[11px] leading-relaxed">
                <code>{finding.evidenceSnippet || finding.observedValue}</code>
              </pre>
            </div>
          </div>

          {/* Rationale & Action */}
          <div className="space-y-3">
            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Severity Rationale</span>
              <p className="mt-1 text-[#F1F6FC] leading-relaxed">{finding.severityRationale}</p>
            </div>

            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Recommended Mitigation</span>
              <p className="mt-1 text-[#48D9C1] leading-relaxed">{finding.recommendedAction}</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[rgba(159,190,220,0.16)] bg-[#0B1728]/80 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
          <div className="flex items-center space-x-2">
            {finding.advisoryUrl && (
              <a
                href={finding.advisoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#65BFFF] border border-[rgba(159,190,220,0.2)] transition-colors"
              >
                <span>Upstream Advisory</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Link
              href="/investigate"
              onClick={onClose}
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#F1F6FC] border border-[rgba(159,190,220,0.2)] transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Full Investigation</span>
            </Link>

            <Link
              href="/remediation"
              onClick={onClose}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-[#48D9C1] hover:bg-[#3ec4ad] text-[#07111F] font-bold shadow-md transition-all"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Open in Remediation</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
