'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  Lock,
  Clock,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Send,
  HelpCircle,
  FileCheck,
  Server,
  Key,
} from 'lucide-react';

export default function TrustAndDataHandlingPage() {
  const [feedbackForm, setFeedbackForm] = useState({
    type: 'false_positive',
    packageName: '',
    vulnerabilityId: '',
    details: '',
    contactEmail: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Simulates customer feedback dispatch
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

  return (
    <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 font-sans space-y-12">
      {/* Header */}
      <div className="border-b border-[#11110F]/10 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111F33] text-xs font-mono text-[#48D9C1] mb-3">
          <Shield className="w-3.5 h-3.5" />
          <span>Security, Trust & Data Governance</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#11110F] tracking-tight">
          Trust &amp; Customer Data Handling
        </h1>
        <p className="text-base text-[#11110F]/70 mt-2 max-w-3xl leading-relaxed">
          Supply Chain Sentinel 2.0 empowers startup CTOs, small engineering teams, and DevSecOps practitioners to investigate software supply-chain risks with evidence-backed findings, connected dependency and CI/CD context, and prioritized remediation.
        </p>
      </div>

      {/* Product Scope & Boundaries Disclaimer */}
      <div className="bg-[#FFFDF8] border-2 border-[#B85E3E]/40 rounded-xl p-6 sm:p-8 space-y-4 shadow-sm">
        <div className="flex items-center gap-3 text-[#B85E3E]">
          <AlertCircle className="w-6 h-6 shrink-0" />
          <h2 className="text-xl font-bold">Important Product Scope &amp; Safety Disclaimer</h2>
        </div>
        <p className="text-sm text-[#11110F]/80 leading-relaxed">
          Supply Chain Sentinel 2.0 provides static evidence modeling and automated heuristic risk indicators based on package manifests, resolved lockfiles, publicly known vulnerability feeds (such as the Open Source Vulnerability / OSV database), and GitHub Actions AST parsing.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 bg-white/70 border border-[#11110F]/10 rounded-lg">
            <span className="font-mono text-xs uppercase text-[#B85E3E] font-bold block mb-1">
              No Universal Guarantee
            </span>
            <p className="text-xs text-[#11110F]/70">
              Sentinel does not claim to discover every vulnerability or guarantee that audited software is 100% bug-free.
            </p>
          </div>
          <div className="p-4 bg-white/70 border border-[#11110F]/10 rounded-lg">
            <span className="font-mono text-xs uppercase text-[#B85E3E] font-bold block mb-1">
              Not a Human Pentest
            </span>
            <p className="text-xs text-[#11110F]/70">
              Automated supply chain scans do not replace professional human application penetration testing or specialized security audits.
            </p>
          </div>
          <div className="p-4 bg-white/70 border border-[#11110F]/10 rounded-lg">
            <span className="font-mono text-xs uppercase text-[#B85E3E] font-bold block mb-1">
              No Code Execution
            </span>
            <p className="text-xs text-[#11110F]/70">
              Sentinel never installs dependencies, executes install scripts, or runs analyzed repositories in customer environments.
            </p>
          </div>
        </div>
      </div>

      {/* Data Handling & Zero-Token Policy */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[#11110F]">Data Storage &amp; Privacy Policies</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-[#11110F]/10 rounded-xl p-6 bg-white space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#E6F8F5] text-[#1E7E68] flex items-center justify-center mb-2">
              <Key className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#11110F]">Zero-Token Persistence Guarantee</h3>
            <p className="text-xs sm:text-sm text-[#11110F]/70 leading-relaxed">
              When analyzing private repositories or using personal access tokens for higher GitHub API rate limits, tokens are held strictly in ephemeral server memory during the scan execution. Tokens are <strong>never written to databases, persistent storage, log drains, URLs, or browser cookies</strong>.
            </p>
          </div>

          <div className="border border-[#11110F]/10 rounded-xl p-6 bg-white space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#F0F4F8] text-[#1D314A] flex items-center justify-center mb-2">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#11110F]">What We Actually Store</h3>
            <p className="text-xs sm:text-sm text-[#11110F]/70 leading-relaxed">
              We store only metadata necessary for reporting: repository name, analyzed commit SHA, high-level finding counts, observed vulnerability IDs, and generated remediation diffs. We do not store complete proprietary codebases or unreferenced source files.
            </p>
          </div>

          <div className="border border-[#11110F]/10 rounded-xl p-6 bg-white space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#FFF2EE] text-[#B85E3E] flex items-center justify-center mb-2">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#11110F]">30-Day Retention &amp; Automatic Expiry</h3>
            <p className="text-xs sm:text-sm text-[#11110F]/70 leading-relaxed">
              Workspace scan records are tagged with an immutable retention timestamp (default 30 days). Expired records are automatically pruned and omitted from workspace scan listings, ensuring customer data does not linger indefinitely.
            </p>
          </div>

          <div className="border border-[#11110F]/10 rounded-xl p-6 bg-white space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#F5F2EB] text-[#695D47] flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#11110F]">Self-Serve Immediate Deletion</h3>
            <p className="text-xs sm:text-sm text-[#11110F]/70 leading-relaxed">
              Workspace administrators have complete control to delete any scan report or history record via the workspace API or dashboard. Deletions are instantaneous and logged to an immutable security audit event ledger.
            </p>
          </div>
        </div>
      </div>

      {/* Customer Feedback & False Positive Reporting */}
      <div className="border border-[#11110F]/15 rounded-xl p-6 sm:p-8 bg-white space-y-6">
        <div>
          <h2 className="text-xl font-bold text-[#11110F]">Report False Positive or Provide Feedback</h2>
          <p className="text-xs sm:text-sm text-[#11110F]/70 mt-1">
            Encountered an inaccurate version range, benign CI pattern, or wish to suggest a feature? Submit findings directly to the engineering team.
          </p>
        </div>

        {submitted ? (
          <div className="p-6 bg-[#E6F8F5] border border-[#1E7E68]/30 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#1E7E68] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[#1E7E68]">Thank you for your report!</p>
              <p className="text-xs text-[#11110F]/70 mt-1">
                Our security engineering team reviews all submitted evidence and updates advisory models accordingly.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="mt-3 text-xs font-mono font-bold text-[#1E7E68] underline cursor-pointer"
              >
                Submit another report
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono font-semibold uppercase text-[#11110F]/70 mb-1">
                  Report Type
                </label>
                <select
                  value={feedbackForm.type}
                  onChange={(e) => setFeedbackForm({ ...feedbackForm, type: e.target.value })}
                  className="w-full text-xs font-mono p-2.5 bg-[#FAF9F5] border border-[#11110F]/20 rounded-lg focus:outline-none focus:border-[#B85E3E]"
                >
                  <option value="false_positive">False Positive Finding</option>
                  <option value="missing_advisory">Missing Advisory or Vulnerability</option>
                  <option value="workflow_suggestion">GitHub Actions Parser Feedback</option>
                  <option value="general_feedback">General Product Feedback</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold uppercase text-[#11110F]/70 mb-1">
                  Package or Workflow Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. lodash@4.17.20 or ci.yml"
                  value={feedbackForm.packageName}
                  onChange={(e) => setFeedbackForm({ ...feedbackForm, packageName: e.target.value })}
                  className="w-full text-xs font-mono p-2.5 bg-[#FAF9F5] border border-[#11110F]/20 rounded-lg focus:outline-none focus:border-[#B85E3E]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono font-semibold uppercase text-[#11110F]/70 mb-1">
                  Advisory / Finding ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. GHSA-xxx or CVE-2023-xxxx"
                  value={feedbackForm.vulnerabilityId}
                  onChange={(e) => setFeedbackForm({ ...feedbackForm, vulnerabilityId: e.target.value })}
                  className="w-full text-xs font-mono p-2.5 bg-[#FAF9F5] border border-[#11110F]/20 rounded-lg focus:outline-none focus:border-[#B85E3E]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold uppercase text-[#11110F]/70 mb-1">
                  Your Email (Optional, for updates)
                </label>
                <input
                  type="email"
                  placeholder="analyst@company.com"
                  value={feedbackForm.contactEmail}
                  onChange={(e) => setFeedbackForm({ ...feedbackForm, contactEmail: e.target.value })}
                  className="w-full text-xs font-mono p-2.5 bg-[#FAF9F5] border border-[#11110F]/20 rounded-lg focus:outline-none focus:border-[#B85E3E]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono font-semibold uppercase text-[#11110F]/70 mb-1">
                Detailed Context &amp; Evidence
              </label>
              <textarea
                rows={3}
                required
                placeholder="Explain why this finding is inaccurate or how the risk context should be adjusted..."
                value={feedbackForm.details}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, details: e.target.value })}
                className="w-full text-xs font-mono p-2.5 bg-[#FAF9F5] border border-[#11110F]/20 rounded-lg focus:outline-none focus:border-[#B85E3E]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-[#11110F] hover:bg-[#2D2D2A] text-white text-xs font-mono font-bold rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitting ? 'Submitting...' : 'Submit Feedback to Security Team'}</span>
            </button>
          </form>
        )}
      </div>

      {/* Footer navigation link */}
      <div className="pt-4 border-t border-[#11110F]/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#11110F]/60">
        <div>Supply Chain Sentinel 2.0 &bull; Security &amp; Trust Center</div>
        <div className="flex items-center gap-4">
          <Link href="/telemetry" className="hover:text-[#11110F] underline">
            Telemetry &amp; Health
          </Link>
          <Link href="/reports" className="hover:text-[#11110F] underline">
            Scan Reports
          </Link>
          <Link href="/analyze" className="hover:text-[#11110F] underline">
            Run Analysis
          </Link>
        </div>
      </div>
    </div>
  );
}
