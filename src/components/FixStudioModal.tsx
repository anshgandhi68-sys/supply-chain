'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  FileCode,
  ArrowRight,
  Info,
  Package,
  Layers,
  Terminal,
} from 'lucide-react';
import { FixVerificationResult, Finding } from '@/lib/types';
import { verifyWorkflowFix } from '@/lib/verifier';

interface FixStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFinding?: Finding | null;
}

export const FixStudioModal: React.FC<FixStudioModalProps> = ({
  isOpen,
  onClose,
  initialFinding,
}) => {
  const [studioMode, setStudioMode] = useState<'workflow' | 'dependency'>(
    initialFinding?.category === 'dependency_vulnerability' ? 'dependency' : 'workflow'
  );

  // Workflow verification state
  const [beforeYaml, setBeforeYaml] = useState('');
  const [afterYaml, setAfterYaml] = useState('');
  const [isLoadingFixtures, setIsLoadingFixtures] = useState(true);
  const [workflowResult, setWorkflowResult] = useState<FixVerificationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'results'>('editor');

  // Dependency verification state
  const [depPackageName, setDepPackageName] = useState(
    initialFinding?.observedValue?.split('@')[0] || 'lodash'
  );
  const [depCurrentVersion, setDepCurrentVersion] = useState(
    initialFinding?.observedValue?.split('@')[1] || '4.17.20'
  );
  const [depProposedVersion, setDepProposedVersion] = useState(
    initialFinding?.fixedVersion || '4.17.21'
  );
  const [depAdvisoryId, setDepAdvisoryId] = useState(
    initialFinding?.aliases?.[0] || initialFinding?.id || 'GHSA-35jh-r3h4-6jhm'
  );
  const [depVerifying, setDepVerifying] = useState(false);
  const [depResult, setDepResult] = useState<{
    isRemediated: boolean;
    status: string;
    explanation: string;
    previousAdvisoriesCount: number;
    remainingAdvisoriesCount: number;
  } | null>(null);

  // Sync mode if initialFinding changes
  useEffect(() => {
    if (initialFinding) {
      if (initialFinding.category === 'dependency_vulnerability') {
        setStudioMode('dependency');
        const parts = initialFinding.observedValue.split('@');
        setDepPackageName(parts[0] || initialFinding.title);
        setDepCurrentVersion(parts[1] || '4.17.20');
        setDepProposedVersion(initialFinding.fixedVersion || '4.17.21');
        setDepAdvisoryId(initialFinding.aliases?.[0] || initialFinding.id);
      } else {
        setStudioMode('workflow');
      }
    }
  }, [initialFinding]);

  // Load local fixtures on mount
  const loadFixtures = async () => {
    setIsLoadingFixtures(true);
    try {
      const [riskyRes, correctedRes] = await Promise.all([
        fetch('/api/fixtures?name=risky'),
        fetch('/api/fixtures?name=corrected'),
      ]);

      const riskyData = await riskyRes.json();
      const correctedData = await correctedRes.json();

      setBeforeYaml(riskyData.content || '');
      setAfterYaml(correctedData.content || '');

      // Run initial deterministic verification automatically
      if (riskyData.content && correctedData.content) {
        const initialRes = verifyWorkflowFix(
          riskyData.content,
          correctedData.content,
          'Local Security Fixture'
        );
        setWorkflowResult(initialRes);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoadingFixtures(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFixtures();
    }
  }, [isOpen]);

  const handleRunWorkflowVerification = () => {
    const result = verifyWorkflowFix(beforeYaml, afterYaml, 'Interactive Fix Verification');
    setWorkflowResult(result);
    setActiveTab('results');
  };

  const handleRunDependencyVerification = async () => {
    setDepVerifying(true);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dependency',
          packageName: depPackageName,
          currentVersion: depCurrentVersion,
          proposedVersion: depProposedVersion,
          ecosystem: 'npm',
          advisoryId: depAdvisoryId,
        }),
      });

      const data = await res.json();
      setDepResult(data);
    } catch (e) {
      console.error('Dependency verification failed:', e);
    } finally {
      setDepVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-[#F4F0E6] text-[#071F20] rounded-2xl border border-[#071F20]/15 shadow-2xl max-w-6xl w-full max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#071F20]/10 flex items-center justify-between bg-white/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#071F20]/15 flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-[#D47A4A]" />
            </div>
            <div>
              <div className="flex items-center space-x-2 font-mono">
                <h3 className="text-base font-bold text-[#071F20]">Safe Fix Verification Studio</h3>
                <span className="px-2 py-0.5 rounded text-[10px] bg-[#071F20]/5 text-[#123B3A] border border-[#071F20]/10 font-bold">
                  DETERMINISTIC VERIFICATION
                </span>
              </div>
              <p className="text-xs text-[#6E829B] font-mono">
                Validate that proposed security patches resolve findings without modifying production repositories.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {studioMode === 'workflow' && (
              <button
                onClick={loadFixtures}
                disabled={isLoadingFixtures}
                className="px-3 py-1.5 rounded-xl text-xs font-mono text-[#476363] hover:text-[#071F20] bg-white border border-[#071F20]/15 transition-colors flex items-center space-x-1 shadow-sm cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset Fixtures</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-[#476363] hover:text-[#071F20] bg-white border border-[#071F20]/15 transition-colors shadow-sm cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-5 py-2.5 border-b border-[#071F20]/10 bg-white/60 flex items-center space-x-3 font-mono text-xs">
          <span className="text-[#6E829B] uppercase text-[10px] font-semibold">Studio Mode:</span>
          <button
            onClick={() => setStudioMode('workflow')}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer font-semibold ${
              studioMode === 'workflow'
                ? 'bg-[#071F20] text-white shadow-sm'
                : 'text-[#476363] hover:text-[#071F20]'
            }`}
          >
            GitHub Actions Workflow AST Diff
          </button>
          <button
            onClick={() => setStudioMode('dependency')}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer font-semibold ${
              studioMode === 'dependency'
                ? 'bg-[#071F20] text-white shadow-sm'
                : 'text-[#476363] hover:text-[#071F20]'
            }`}
          >
            Dependency Package Upgrade Verification
          </button>
        </div>

        {/* Main Body */}
        {studioMode === 'workflow' ? (
          <>
            {/* Workflow Action Bar */}
            <div className="px-5 py-3 border-b border-[#071F20]/10 bg-white/40 flex flex-wrap items-center justify-between gap-3 font-mono">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('editor')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'editor'
                      ? 'bg-white text-[#071F20] border border-[#071F20]/15 shadow-sm'
                      : 'text-[#476363] hover:text-[#071F20]'
                  }`}
                >
                  Side-by-Side YAML Diff Editor
                </button>
                <button
                  onClick={() => setActiveTab('results')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === 'results'
                      ? 'bg-white text-[#071F20] border border-[#071F20]/15 shadow-sm'
                      : 'text-[#476363] hover:text-[#071F20]'
                  }`}
                >
                  <span>Verification Audit Matrix</span>
                  {workflowResult && (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] ${
                        workflowResult.allPassed
                          ? 'bg-[#48D9C1]/20 text-[#123B3A] border border-[#48D9C1]/40 font-bold'
                          : 'bg-[#FF647C]/15 text-[#962A35] border border-[#FF647C]/30 font-bold'
                      }`}
                    >
                      {workflowResult.resolvedFindingsCount} Resolved
                    </span>
                  )}
                </button>
              </div>

              <button
                onClick={handleRunWorkflowVerification}
                className="px-4 py-2 rounded-xl text-xs font-bold font-mono bg-[#071F20] hover:bg-[#123B3A] text-white shadow-md flex items-center space-x-2 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-[#D47A4A] fill-current" />
                <span>Re-run Deterministic AST Rules</span>
              </button>
            </div>

            {/* Workflow Content */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-grow space-y-4 font-mono">
              {activeTab === 'editor' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
                  {/* Before Editor */}
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#B73945]"></span>
                        <span className="text-xs font-bold text-[#071F20] uppercase">
                          Original / Risky Workflow
                        </span>
                      </div>
                      <span className="text-[10px] text-[#B73945] font-semibold">Contains unpinned actions & permissions</span>
                    </div>
                    <textarea
                      value={beforeYaml}
                      onChange={(e) => setBeforeYaml(e.target.value)}
                      className="w-full h-96 p-3.5 bg-[#071F20] border border-[#FF647C]/30 rounded-xl text-xs text-[#FFBAC5] focus:outline-none focus:border-[#FF647C] focus:ring-1 focus:ring-[#FF647C]/30 resize-none leading-relaxed font-mono"
                      placeholder="Paste or edit original workflow..."
                    />
                  </div>

                  {/* After Editor */}
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#123B3A]"></span>
                        <span className="text-xs font-bold text-[#071F20] uppercase">
                          Proposed Remediated Workflow
                        </span>
                      </div>
                      <span className="text-[10px] text-[#123B3A] font-semibold">
                        Pinned Commit SHAs & Restricted Permissions
                      </span>
                    </div>
                    <textarea
                      value={afterYaml}
                      onChange={(e) => setAfterYaml(e.target.value)}
                      className="w-full h-96 p-3.5 bg-[#071F20] border border-[#48D9C1]/30 rounded-xl text-xs text-[#DDE8DD] focus:outline-none focus:border-[#48D9C1] focus:ring-1 focus:ring-[#48D9C1]/30 resize-none leading-relaxed font-mono"
                      placeholder="Paste or edit remediated workflow..."
                    />
                  </div>
                </div>
              ) : (
                /* Results View */
                <div className="space-y-4">
                  {workflowResult ? (
                    <>
                      <div
                        className={`p-4 rounded-xl border flex items-center justify-between gap-4 shadow-sm ${
                          workflowResult.allPassed
                            ? 'bg-[#48D9C1]/15 border-[#48D9C1]/40 text-[#123B3A]'
                            : 'bg-[#FF647C]/15 border-[#FF647C]/40 text-[#962A35]'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          {workflowResult.allPassed ? (
                            <CheckCircle2 className="w-6 h-6 text-[#123B3A] shrink-0" />
                          ) : (
                            <AlertOctagon className="w-6 h-6 text-[#B73945] shrink-0" />
                          )}
                          <div>
                            <h4 className="text-sm font-bold">
                              {workflowResult.allPassed
                                ? 'Deterministic Verification Passed: All Findings Resolved'
                                : 'Verification Alert: Unresolved Findings or Regressions Detected'}
                            </h4>
                            <p className="text-xs opacity-90">
                              {workflowResult.resolvedFindingsCount} of {workflowResult.beforeFindingsCount} original findings verified resolved.
                              {workflowResult.remainingFindingsCount > 0 &&
                                ` ${workflowResult.remainingFindingsCount} issue(s) remain active.`}
                            </p>
                          </div>
                        </div>

                        <div className="text-right text-xs shrink-0 font-semibold">
                          <div>Status: {workflowResult.allPassed ? 'VERIFIED_FIXED' : 'STILL_VULNERABLE'}</div>
                          <div className="text-[10px] opacity-75">Checked at {new Date(workflowResult.verifiedAt).toLocaleTimeString()}</div>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#6E829B]">
                          Rule Evaluation Audit Matrix
                        </h4>

                        {workflowResult.comparisons.map((comp, idx) => (
                          <div
                            key={idx}
                            className={`p-4 rounded-xl border text-xs transition-all shadow-sm ${
                              comp.status === 'resolved'
                                ? 'bg-white/90 border-[#48D9C1]/40 text-[#071F20]'
                                : comp.status === 'still_vulnerable'
                                ? 'bg-white/90 border-[#FF647C]/40 text-[#071F20]'
                                : 'bg-white/90 border-[#D47A4A]/40 text-[#071F20]'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    comp.status === 'resolved'
                                      ? 'bg-[#48D9C1]/20 text-[#123B3A]'
                                      : comp.status === 'still_vulnerable'
                                      ? 'bg-[#FF647C]/15 text-[#962A35]'
                                      : 'bg-[#D47A4A]/15 text-[#964B00]'
                                  }`}
                                >
                                  {comp.status === 'resolved'
                                    ? '✓ VERIFIED RESOLVED'
                                    : comp.status === 'still_vulnerable'
                                    ? '✗ STILL VULNERABLE'
                                    : '⚠ REGRESSION DETECTED'}
                                </span>
                                <span className="font-bold text-[#071F20]">{comp.title}</span>
                              </div>

                              <span className="text-[10px] text-[#6E829B] font-mono">{comp.ruleId}</span>
                            </div>

                            <p className="text-[#476363] text-[11px] leading-relaxed">
                              {comp.explanation}
                            </p>

                            {comp.beforeFinding && (
                              <div className="mt-2 pt-2 border-t border-[#071F20]/10 text-[10px] text-[#6E829B]">
                                <span>Before observed: </span>
                                <span className="text-[#B73945] font-bold">{comp.beforeFinding.observedValue}</span>
                                {comp.beforeFinding.lineNumber && ` on line ${comp.beforeFinding.lineNumber}`}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12 text-[#6E829B] text-xs">
                      Click &ldquo;Re-run Deterministic AST Rules&rdquo; to evaluate the before and after configurations.
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Dependency Upgrade Verification Mode */
          <div className="p-6 overflow-y-auto flex-grow space-y-6 font-mono text-xs">
            <div className="p-4 rounded-xl bg-white/90 border border-[#071F20]/12 space-y-4 shadow-sm">
              <div className="flex items-center space-x-2 text-[#071F20]">
                <Package className="w-5 h-5 text-[#D47A4A]" />
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#071F20]">
                  Real OSV Dependency Upgrade Verification
                </h4>
              </div>
              <p className="text-xs text-[#476363] leading-relaxed">
                Queries the live Google OSV database to verify whether a proposed upgrade version lies outside all known affected advisory ranges and confirms that no new advisories are introduced.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-[#6E829B] mb-1 font-semibold">Package Name</label>
                  <input
                    type="text"
                    value={depPackageName}
                    onChange={(e) => setDepPackageName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#071F20]/15 text-[#071F20] focus:outline-none focus:ring-2 focus:ring-[#D47A4A]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#6E829B] mb-1 font-semibold">Advisory ID</label>
                  <input
                    type="text"
                    value={depAdvisoryId}
                    onChange={(e) => setDepAdvisoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#071F20]/15 text-[#071F20] focus:outline-none focus:ring-2 focus:ring-[#D47A4A]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#6E829B] mb-1 font-semibold">Current (Vulnerable) Version</label>
                  <input
                    type="text"
                    value={depCurrentVersion}
                    onChange={(e) => setDepCurrentVersion(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#FF647C]/40 text-[#962A35] font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF647C]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#6E829B] mb-1 font-semibold">Proposed (Remediated) Version</label>
                  <input
                    type="text"
                    value={depProposedVersion}
                    onChange={(e) => setDepProposedVersion(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#48D9C1]/50 text-[#123B3A] font-semibold focus:outline-none focus:ring-2 focus:ring-[#123B3A]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleRunDependencyVerification}
                  disabled={depVerifying || !depPackageName || !depProposedVersion}
                  className="px-5 py-2.5 rounded-xl font-bold bg-[#071F20] hover:bg-[#123B3A] text-white shadow-md disabled:opacity-50 flex items-center space-x-2 cursor-pointer transition-all"
                >
                  {depVerifying ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Querying OSV Database...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-[#D47A4A] fill-current" />
                      <span>Verify Remediated Version</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Verification Result Display */}
            {depResult && (
              <div
                className={`p-5 rounded-xl border space-y-3 shadow-sm ${
                  depResult.isRemediated
                    ? 'bg-[#48D9C1]/15 border-[#48D9C1]/40 text-[#123B3A]'
                    : 'bg-[#FF647C]/15 border-[#FF647C]/40 text-[#962A35]'
                }`}
              >
                <div className="flex items-center space-x-3">
                  {depResult.isRemediated ? (
                    <CheckCircle2 className="w-6 h-6 text-[#123B3A] shrink-0" />
                  ) : (
                    <AlertOctagon className="w-6 h-6 text-[#B73945] shrink-0" />
                  )}
                  <div>
                    <h4 className="text-sm font-bold">
                      {depResult.isRemediated
                        ? 'Remediation Verified: Target Advisory Eliminated'
                        : 'Remediation Failed: Proposed Version Still In Affected Range'}
                    </h4>
                    <p className="text-xs opacity-90 mt-0.5">{depResult.explanation}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs pt-2 border-t border-[#071F20]/10 font-semibold">
                  <div>
                    <span className="opacity-75">Previous Advisories: </span>
                    <strong className="text-[#B73945]">{depResult.previousAdvisoriesCount}</strong>
                  </div>
                  <div>
                    <span className="opacity-75">Remaining Known Advisories: </span>
                    <strong className={depResult.remainingAdvisoriesCount === 0 ? 'text-[#123B3A]' : 'text-[#D47A4A]'}>
                      {depResult.remainingAdvisoriesCount}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer info */}
        <div className="p-3 border-t border-[#071F20]/10 bg-white/80 text-[#6E829B] text-[11px] font-mono flex items-center space-x-2">
          <Info className="w-4 h-4 text-[#D47A4A] shrink-0" />
          <span>
            <strong>Zero Write Guarantee:</strong> Supply Chain Sentinel performs verification strictly in-memory or through read-only OSV queries. It never writes to, modifies, or creates branches on user repositories without explicit authorization.
          </span>
        </div>
      </div>
    </div>
  );
};
