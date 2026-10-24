'use client';

import React, { useState } from 'react';
import {
  Search,
  Key,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  Shield,
  Layers,
  Terminal,
} from 'lucide-react';
import { parseAndValidateGitHubUrl } from '@/lib/github';

interface RepoInputProps {
  onScan: (url: string, token?: string, forceDemo?: boolean) => void;
  isLoading: boolean;
}

export const RepoInput: React.FC<RepoInputProps> = ({ onScan, isLoading }) => {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrl(val);

    if (val.trim()) {
      if (val.trim().toLowerCase() === 'demo' || val.trim().toLowerCase().includes('sentinel/demo')) {
        setValidationError(null);
        return;
      }
      const check = parseAndValidateGitHubUrl(val);
      if (!check.isValid) {
        setValidationError(check.error || 'Invalid GitHub repository URL');
      } else {
        setValidationError(null);
      }
    } else {
      setValidationError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    if (url.trim().toLowerCase() === 'demo' || url.trim().toLowerCase().includes('sentinel/demo')) {
      onScan('demo', token || undefined, true);
      return;
    }

    const check = parseAndValidateGitHubUrl(url);
    if (!check.isValid) {
      setValidationError(check.error || 'Please enter a valid public GitHub repository URL');
      return;
    }

    setValidationError(null);
    onScan(url.trim(), token || undefined, false);
  };

  const handleQuickSelect = (presetUrl: string, isDemo: boolean = false) => {
    setUrl(presetUrl);
    setValidationError(null);
    onScan(presetUrl, token || undefined, isDemo);
  };

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-8 relative overflow-hidden border border-sentinel-hairline shadow-2xl">
      {/* Decorative cyber ambient glow */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-sentinel-cyan/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-sentinel-teal/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto text-center mb-6">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sentinel-surface border border-sentinel-hairline text-xs text-sentinel-textSecondary font-mono mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-sentinel-teal animate-pulse"></span>
          <span>Zero-Code-Execution Security Sandbox</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-sentinel-textPrimary font-mono">
          Inspect Software Supply Chain Vulnerabilities
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-sentinel-textMuted max-w-2xl mx-auto leading-relaxed">
          Analyze public repositories for real CVEs via Google OSV and deterministic GitHub Actions risks.
          Safe, read-only analysis without downloading, compiling, or executing unverified code.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative z-10">
        <div className="relative flex flex-col sm:flex-row items-stretch gap-2.5">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-sentinel-textMuted" />
            </div>
            <input
              type="text"
              value={url}
              onChange={handleInputChange}
              placeholder="https://github.com/owner/repository (e.g. expressjs/express or demo)"
              disabled={isLoading}
              className={`w-full pl-11 pr-4 py-3.5 bg-sentinel-midnight text-sentinel-textPrimary placeholder-sentinel-textMuted rounded-xl border text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 transition-all ${
                validationError
                  ? 'border-sentinel-accentHigh/80 focus:ring-sentinel-accentHigh/50'
                  : 'border-sentinel-hairline focus:border-sentinel-cyan focus:ring-sentinel-cyan/30'
              }`}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !url.trim() || !!validationError}
            className="px-6 py-3.5 rounded-xl font-mono font-bold text-xs sm:text-sm bg-gradient-to-r from-sentinel-teal to-sentinel-cyan hover:from-sentinel-mint hover:to-sentinel-cyan text-sentinel-midnight shadow-lg shadow-sentinel-teal/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2 shrink-0"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-sentinel-midnight border-t-transparent rounded-full animate-spin"></div>
                <span>Investigating...</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4" />
                <span>Investigate Repository</span>
              </>
            )}
          </button>
        </div>

        {/* Validation Warning */}
        {validationError && (
          <div className="mt-2.5 flex items-center space-x-2 text-xs text-sentinel-accentHigh font-mono">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Quick Presets */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-sentinel-textMuted font-mono">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sentinel-textMuted mr-1">Quick Scenarios:</span>
            <button
              type="button"
              onClick={() => handleQuickSelect('sentinel/demo-risky-supply-chain', true)}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-950/40 hover:bg-amber-900/40 border border-amber-800/60 text-amber-300 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>Controlled Risky Demo</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect('expressjs/express')}
              className="px-2.5 py-1 rounded-lg bg-sentinel-surface hover:bg-sentinel-surfaceSecondary border border-sentinel-hairline text-sentinel-textSecondary hover:text-white transition-colors"
            >
              expressjs/express
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect('facebook/react')}
              className="px-2.5 py-1 rounded-lg bg-sentinel-surface hover:bg-sentinel-surfaceSecondary border border-sentinel-hairline text-sentinel-textSecondary hover:text-white transition-colors"
            >
              facebook/react
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect('pallets/flask')}
              className="px-2.5 py-1 rounded-lg bg-sentinel-surface hover:bg-sentinel-surfaceSecondary border border-sentinel-hairline text-sentinel-textSecondary hover:text-white transition-colors"
            >
              pallets/flask (Python)
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect('tokio-rs/tokio')}
              className="px-2.5 py-1 rounded-lg bg-sentinel-surface hover:bg-sentinel-surfaceSecondary border border-sentinel-hairline text-sentinel-textSecondary hover:text-white transition-colors"
            >
              tokio-rs/tokio (Rust)
            </button>
          </div>

          {/* GitHub Token Accordion Button */}
          <div>
            <button
              type="button"
              onClick={() => setShowTokenInput(!showTokenInput)}
              className="inline-flex items-center space-x-1 text-sentinel-textMuted hover:text-sentinel-cyan transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{showTokenInput ? 'Hide PAT' : 'Optional GitHub PAT'}</span>
            </button>
          </div>
        </div>

        {/* Optional GitHub Token Drawer */}
        {showTokenInput && (
          <div className="mt-4 p-4 rounded-xl bg-sentinel-surface border border-sentinel-hairline text-left animate-in fade-in">
            <div className="flex items-start justify-between">
              <div>
                <label className="block text-xs font-semibold text-sentinel-textPrimary mb-1">
                  Optional GitHub Personal Access Token (PAT)
                </label>
                <p className="text-[11px] text-sentinel-textMuted max-w-xl leading-relaxed">
                  Public repo scans do not require a token (60 req/hr unauthenticated limit).
                  Supplying a personal token raises the GitHub rate limit to 5,000 req/hr.
                  The token is strictly processed in server memory for read-only requests and is never stored on disk.
                </p>
              </div>
            </div>
            <div className="mt-2.5">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_... (Classic or Fine-grained read-only PAT)"
                className="w-full px-3 py-2 bg-sentinel-midnight border border-sentinel-hairline rounded-lg text-xs font-mono text-sentinel-textPrimary focus:outline-none focus:border-sentinel-cyan"
              />
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
