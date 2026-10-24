'use client';

import React, { useState, useMemo } from 'react';
import {
  Finding,
  Severity,
  FindingCategory,
  ConfidenceLevel,
} from '@/lib/types';
import {
  AlertOctagon,
  AlertTriangle,
  ShieldAlert,
  Info,
  Search,
  Filter,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  FileCode,
  Tag,
  Shield,
  Layers,
} from 'lucide-react';

interface FindingsListProps {
  findings: Finding[];
  onSelectFinding: (finding: Finding) => void;
  onOpenFixStudioForFinding?: (finding: Finding) => void;
}

export const FindingsList: React.FC<FindingsListProps> = ({
  findings,
  onSelectFinding,
  onOpenFixStudioForFinding,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedConfidence, setSelectedConfidence] = useState<string>('all');

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesQuery =
          f.title.toLowerCase().includes(query) ||
          f.id.toLowerCase().includes(query) ||
          f.filePath.toLowerCase().includes(query) ||
          f.detectionSource.toLowerCase().includes(query) ||
          f.observedValue.toLowerCase().includes(query) ||
          (f.aliases && f.aliases.some((a) => a.toLowerCase().includes(query)));
        if (!matchesQuery) return false;
      }

      // Severity filter
      if (selectedSeverity !== 'all' && f.severity !== selectedSeverity) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && f.category !== selectedCategory) {
        return false;
      }

      // Confidence filter
      if (selectedConfidence !== 'all' && f.confidence !== selectedConfidence) {
        return false;
      }

      return true;
    });
  }, [findings, searchQuery, selectedSeverity, selectedCategory, selectedConfidence]);

  const getSeverityBadge = (sev: Severity) => {
    switch (sev) {
      case 'critical':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#FF647C]/15 text-[#962A35] border border-[#FF647C]/30">
            <AlertOctagon className="w-3 h-3" />
            <span>Critical</span>
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#D47A4A]/15 text-[#8A4500] border border-[#D47A4A]/30">
            <AlertTriangle className="w-3 h-3" />
            <span>High</span>
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-[#D47A4A]/10 text-[#8A4500] border border-[#D47A4A]/20">
            <ShieldAlert className="w-3 h-3" />
            <span>Medium</span>
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider bg-[#071F20]/5 text-[#476363] border border-[#071F20]/10">
            <Info className="w-3 h-3" />
            <span>Low</span>
          </span>
        );
      case 'info':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider bg-[#071F20]/5 text-[#6E829B] border border-[#071F20]/10">
            <Info className="w-3 h-3" />
            <span>Info</span>
          </span>
        );
    }
  };

  const getCategoryLabel = (cat: FindingCategory) => {
    switch (cat) {
      case 'dependency_vulnerability':
        return 'Dependency Vulnerability';
      case 'action_pinning':
        return 'Action Pinning Risk';
      case 'permission_risk':
        return 'Excessive Permissions';
      case 'injection_risk':
        return 'Script Injection Risk';
      case 'workflow_security':
        return 'Workflow Execution Hazard';
      case 'malformed_config':
        return 'Malformed Configuration';
      case 'secret_leak':
        return 'Secret Leak';
      case 'docker_security':
        return 'Container Security';
      default:
        return cat;
    }
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Search and Filters Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/90 border border-[#071F20]/15 shadow-sm">
        {/* Search Bar */}
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-[#6E829B]" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by package, CVE, rule ID, or path..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#071F20]/15 rounded-xl text-xs font-mono text-[#071F20] placeholder-[#6E829B] focus:outline-none focus:ring-2 focus:ring-[#D47A4A] transition-all"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Severity */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-3 py-2 bg-white border border-[#071F20]/15 rounded-xl text-xs text-[#071F20] focus:outline-none focus:ring-2 focus:ring-[#D47A4A] cursor-pointer"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>

          {/* Category */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-white border border-[#071F20]/15 rounded-xl text-xs text-[#071F20] focus:outline-none focus:ring-2 focus:ring-[#D47A4A] cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="dependency_vulnerability">Dependencies</option>
            <option value="action_pinning">Action Pinning</option>
            <option value="permission_risk">Permissions</option>
            <option value="injection_risk">Script Injection</option>
            <option value="workflow_security">Workflow Security</option>
            <option value="secret_leak">Secret Leaks</option>
            <option value="docker_security">Container Security</option>
          </select>

          {/* Confidence */}
          <select
            value={selectedConfidence}
            onChange={(e) => setSelectedConfidence(e.target.value)}
            className="px-3 py-2 bg-white border border-[#071F20]/15 rounded-xl text-xs text-[#071F20] focus:outline-none focus:ring-2 focus:ring-[#D47A4A] cursor-pointer"
          >
            <option value="all">All Confidence</option>
            <option value="confirmed">Confirmed Only</option>
            <option value="version_unverified">Version Unverified (No Lockfile)</option>
            <option value="high">High Confidence</option>
            <option value="medium">Medium Confidence</option>
          </select>
        </div>
      </div>

      {/* Findings List Container */}
      {filteredFindings.length === 0 ? (
        <div className="rounded-2xl p-12 text-center bg-white/80 border border-[#071F20]/15 shadow-sm">
          <ShieldCheck className="w-12 h-12 text-[#123B3A] mx-auto mb-3 opacity-80" />
          <h3 className="text-base font-bold text-[#071F20]">No Findings Match Your Filter</h3>
          <p className="text-xs text-[#6E829B] mt-1 max-w-md mx-auto">
            {findings.length === 0
              ? 'No security vulnerabilities or risky configurations were identified for this target.'
              : 'Try clearing your search query or broadening the severity and category filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#6E829B] px-1">
            <span>Showing {filteredFindings.length} of {findings.length} findings</span>
            <span>Click any card for full evidence & remediation</span>
          </div>

          {filteredFindings.map((finding) => (
            <div
              key={finding.id}
              onClick={() => onSelectFinding(finding)}
              className="rounded-2xl p-4 sm:p-5 bg-white/90 border border-[#071F20]/12 hover:border-[#D47A4A]/60 hover:shadow-lg transition-all duration-200 cursor-pointer shadow-sm group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-2 flex-grow">
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    {getSeverityBadge(finding.severity)}

                    <span className="px-2 py-0.5 rounded text-[10px] bg-[#071F20]/5 text-[#476363] border border-[#071F20]/10 font-medium">
                      {getCategoryLabel(finding.category)}
                    </span>

                    <span className="px-2 py-0.5 rounded text-[10px] text-[#123B3A] bg-[#123B3A]/10 border border-[#123B3A]/20 font-semibold">
                      {finding.detectionSource}
                    </span>

                    {finding.confidence === 'confirmed' && (
                      <span className="px-2 py-0.5 rounded text-[10px] text-[#123B3A] bg-[#48D9C1]/20 border border-[#48D9C1]/40 font-bold">
                        CONFIRMED
                      </span>
                    )}

                    {finding.confidence === 'version_unverified' && (
                      <span className="px-2 py-0.5 rounded text-[10px] text-[#964B00] bg-[#D47A4A]/15 border border-[#D47A4A]/30 font-medium">
                        VERSION UNVERIFIED (MANIFEST RANGE)
                      </span>
                    )}
                  </div>

                  {/* Finding Title */}
                  <h4 className="text-sm font-bold text-[#071F20] group-hover:text-[#D47A4A] transition-colors">
                    {finding.title}
                  </h4>

                  {/* Location & Metadata */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6E829B]">
                    <span className="flex items-center space-x-1">
                      <FileCode className="w-3.5 h-3.5 text-[#D47A4A]" />
                      <span className="text-[#071F20] font-semibold">{finding.filePath}</span>
                      {finding.lineNumber && (
                        <span className="text-[#6E829B]">:{finding.lineNumber}</span>
                      )}
                    </span>

                    {finding.observedValue && (
                      <span className="truncate max-w-xs text-[#6E829B]">
                        Observed: <code className="text-[#071F20] font-semibold">{finding.observedValue}</code>
                      </span>
                    )}
                  </div>

                  {/* Severity Rationale Snippet */}
                  <p className="text-xs text-[#476363] line-clamp-2 leading-relaxed">
                    {finding.severityRationale}
                  </p>
                </div>

                {/* Right Action Trigger */}
                <div className="flex items-center space-x-2 self-end sm:self-center shrink-0">
                  {onOpenFixStudioForFinding && finding.category === 'action_pinning' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFixStudioForFinding(finding);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#071F20] text-white hover:bg-[#123B3A] text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm cursor-pointer"
                      title="Verify Fix in Studio"
                    >
                      <Terminal className="w-3.5 h-3.5 text-[#D47A4A]" />
                      <span>Fix Studio</span>
                    </button>
                  )}

                  <div className="w-8 h-8 rounded-lg bg-[#071F20]/5 flex items-center justify-center text-[#476363] group-hover:text-[#D47A4A] group-hover:bg-[#071F20]/10 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
