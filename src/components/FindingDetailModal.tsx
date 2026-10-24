'use client';

import React from 'react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/45 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150 font-sans">
      <div className="bg-[#F4F0E6] text-[#071F20] rounded-2xl border border-[#071F20]/20 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#071F20]/10 flex items-start justify-between gap-3 bg-white/70">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5 font-mono">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  finding.severity === 'critical'
                    ? 'bg-[#FF647C]/15 text-[#962A35] border border-[#FF647C]/30'
                    : finding.severity === 'high'
                    ? 'bg-[#D47A4A]/15 text-[#8A4500] border border-[#D47A4A]/30'
                    : finding.severity === 'medium'
                    ? 'bg-[#D47A4A]/10 text-[#8A4500] border border-[#D47A4A]/20'
                    : 'bg-[#071F20]/5 text-[#476363] border border-[#071F20]/10'
                }`}
              >
                {finding.severity.toUpperCase()}
              </span>

              <span className="px-2 py-0.5 rounded text-[10px] bg-[#071F20]/5 text-[#476363] border border-[#071F20]/10 font-medium">
                {finding.category}
              </span>

              <span className="px-2 py-0.5 rounded text-[10px] text-[#123B3A] bg-[#123B3A]/10 border border-[#123B3A]/20 font-semibold">
                {finding.id}
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-bold font-mono text-[#071F20]">{finding.title}</h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#6E829B] hover:text-[#071F20] bg-white border border-[#071F20]/15 transition-colors cursor-pointer shadow-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-[#476363] font-mono">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-white/80 border border-[#071F20]/10 shadow-sm">
            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Target Repository</span>
              <span className="text-[#071F20] font-semibold">{finding.repository}</span>
            </div>

            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Commit / Ref</span>
              <span className="text-[#071F20]">{finding.commitSha || 'default branch head'}</span>
            </div>

            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">File Location</span>
              <span className="text-[#123B3A] font-bold">
                {finding.filePath}
                {finding.lineNumber ? ` (Line ${finding.lineNumber})` : ''}
              </span>
            </div>

            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Observed Value</span>
              <span className="text-[#D47A4A] font-bold">{finding.observedValue}</span>
            </div>

            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Detection Source</span>
              <span className="text-[#071F20]">{finding.detectionSource}</span>
            </div>

            <div>
              <span className="text-[#6E829B] block text-[10px] uppercase font-bold">Confidence</span>
              <span
                className={`font-bold ${
                  finding.confidence === 'confirmed'
                    ? 'text-[#123B3A]'
                    : finding.confidence === 'version_unverified'
                    ? 'text-[#964B00]'
                    : 'text-[#D47A4A]'
                }`}
              >
                {finding.confidence === 'version_unverified'
                  ? 'VERSION UNVERIFIED (NO LOCKFILE)'
                  : finding.confidence.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Severity Rationale */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E829B] flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[#D47A4A]" />
              <span>Severity & Risk Rationale</span>
            </h4>
            <p className="p-3.5 rounded-xl bg-white/80 border border-[#071F20]/10 text-[#071F20] leading-relaxed shadow-sm">
              {finding.severityRationale}
            </p>
          </div>

          {/* Evidence Excerpt with Redaction */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E829B] flex items-center space-x-1.5">
                <FileCode className="w-3.5 h-3.5 text-[#D47A4A]" />
                <span>Evidence Excerpt (Secrets Masked)</span>
              </h4>
              <span className="text-[10px] text-[#123B3A] flex items-center space-x-1 font-semibold">
                <Lock className="w-3 h-3" />
                <span>Zero-Secret Exposure Guarantee</span>
              </span>
            </div>

            <pre className="p-4 rounded-xl bg-[#071F20] text-[#F1F6FC] overflow-x-auto whitespace-pre leading-relaxed shadow-inner border border-[#071F20]/20">
              {finding.evidenceSnippet}
            </pre>
          </div>

          {/* Recommended Next Action */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#123B3A] flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#123B3A]" />
              <span>Recommended Remediation</span>
            </h4>
            <div className="p-3.5 rounded-xl bg-[#48D9C1]/20 border border-[#48D9C1]/40 text-[#072020] leading-relaxed font-mono shadow-sm">
              {finding.recommendedAction}
            </div>
          </div>

          {/* Limitations and Caveats */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E829B] flex items-center space-x-1.5">
              <Info className="w-3.5 h-3.5 text-[#6E829B]" />
              <span>Technical Limitations & Caveats</span>
            </h4>
            <p className="p-3 rounded-xl bg-white/50 border border-[#071F20]/10 text-[#476363] leading-relaxed text-[11px]">
              {finding.limitations}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#071F20]/10 bg-white/70 flex flex-wrap items-center justify-between gap-3 font-mono">
          <div>
            {finding.advisoryUrl && (
              <a
                href={finding.advisoryUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1.5 text-xs text-[#071F20] hover:text-[#D47A4A] underline font-semibold"
              >
                <span>View Official Upstream Advisory</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {onOpenFixStudio && (
              <button
                onClick={() => {
                  onClose();
                  onOpenFixStudio(finding);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#071F20] hover:bg-[#123B3A] text-white flex items-center space-x-1.5 transition-all shadow-md cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-[#D47A4A]" />
                <span>Verify Fix in Studio</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#071F20] bg-white hover:bg-[#071F20]/5 border border-[#071F20]/15 transition-colors cursor-pointer shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
