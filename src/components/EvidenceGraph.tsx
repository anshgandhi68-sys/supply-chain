'use client';

import React, { useState } from 'react';
import { ScanResult, Finding } from '@/lib/types';
import {
  GitBranch,
  FileCode,
  Package,
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  ChevronRight,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface EvidenceGraphProps {
  result: ScanResult;
  onSelectFinding: (finding: Finding) => void;
}

export const EvidenceGraph: React.FC<EvidenceGraphProps> = ({
  result,
  onSelectFinding,
}) => {
  const { repository, findings, manifestsFound, workflowsFound } = result;
  const [selectedFile, setSelectedFile] = useState<string>('all');

  // Group findings by their actual file path
  const filesWithFindings = Array.from(
    new Set([...manifestsFound, ...workflowsFound, ...findings.map((f) => f.filePath)])
  );

  const displayedFiles =
    selectedFile === 'all'
      ? filesWithFindings
      : filesWithFindings.filter((f) => f === selectedFile);

  return (
    <div className="rounded-2xl p-5 bg-[#FDFBF7] border border-[#071F20]/12 space-y-4 font-mono shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#071F20]/10 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-[#D47A4A]" />
            <h3 className="text-sm font-bold text-[#071F20] uppercase tracking-wider">
              Evidence Relationship Topology
            </h3>
          </div>
          <p className="text-xs text-[#6E829B] mt-0.5">
            Strict evidence-backed lineage: Repository &rarr; Discovered Manifest &rarr; Package Identifier &rarr; Security Advisory
          </p>
        </div>

        {/* Filter by file */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-[#6E829B]">Scope:</span>
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-[#071F20]/15 rounded-xl text-xs text-[#071F20] focus:outline-none focus:ring-2 focus:ring-[#D47A4A] cursor-pointer"
          >
            <option value="all">All Discovered Files ({filesWithFindings.length})</option>
            {filesWithFindings.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Root Node: Repository */}
      <div className="space-y-4 text-xs">
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white border border-[#123B3A]/30 text-[#071F20] shadow-sm">
          <GitBranch className="w-4 h-4 text-[#D47A4A]" />
          <span className="font-bold">{repository.fullName}</span>
          <span className="text-[10px] text-[#476363] font-semibold">
            [{repository.resolvedCommitSha ? repository.resolvedCommitSha.slice(0, 7) : repository.defaultBranch}]
          </span>
        </div>

        {/* Branches for each discovered file */}
        <div className="pl-4 border-l-2 border-[#071F20]/12 space-y-5 ml-3">
          {displayedFiles.map((filePath) => {
            const fileFindings = findings.filter((f) => f.filePath === filePath);
            const isWorkflow = filePath.includes('.github/workflows');

            return (
              <div key={filePath} className="relative space-y-2">
                {/* Horizontal branch line */}
                <div className="absolute -left-4 top-3.5 w-4 h-0.5 bg-[#071F20]/15" />

                {/* File Node */}
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-xl bg-white border border-[#071F20]/12 text-[#476363] shadow-sm">
                  {isWorkflow ? (
                    <FileCode className="w-3.5 h-3.5 text-[#D47A4A]" />
                  ) : (
                    <Package className="w-3.5 h-3.5 text-[#123B3A]" />
                  )}
                  <span className="font-semibold text-[#071F20]">{filePath}</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#071F20]/5 text-[#6E829B] border border-[#071F20]/10">
                    {fileFindings.length} finding{fileFindings.length === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Nested Findings Nodes */}
                {fileFindings.length > 0 && (
                  <div className="pl-6 border-l border-[#071F20]/12 space-y-2 ml-3">
                    {fileFindings.map((finding) => (
                      <div
                        key={finding.id}
                        onClick={() => onSelectFinding(finding)}
                        className="p-2.5 rounded-xl bg-white/80 hover:bg-white border border-[#071F20]/10 hover:border-[#D47A4A]/60 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm group"
                      >
                        <div className="flex items-center space-x-2">
                          {finding.severity === 'critical' ? (
                            <AlertOctagon className="w-3.5 h-3.5 text-[#B73945] shrink-0" />
                          ) : finding.severity === 'high' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-[#D47A4A] shrink-0" />
                          ) : (
                            <ShieldAlert className="w-3.5 h-3.5 text-[#D47A4A] shrink-0" />
                          )}

                          <span className="font-bold text-[#071F20] group-hover:text-[#D47A4A] transition-colors">
                            {finding.observedValue}
                          </span>

                          <ArrowRight className="w-3 h-3 text-[#6E829B] shrink-0" />

                          <span className="text-[#476363] line-clamp-1">
                            {finding.detectionSource}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0 text-[10px]">
                          <span
                            className={`px-1.5 py-0.5 rounded uppercase font-bold ${
                              finding.severity === 'critical'
                                ? 'bg-[#FF647C]/15 text-[#962A35]'
                                : finding.severity === 'high'
                                ? 'bg-[#D47A4A]/15 text-[#8A4500]'
                                : 'bg-[#D47A4A]/10 text-[#8A4500]'
                            }`}
                          >
                            {finding.severity}
                          </span>
                          <span className="text-[#6E829B]">
                            {finding.lineNumber ? `L${finding.lineNumber}` : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
