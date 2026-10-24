'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Activity,
  Terminal,
  Sparkles,
  ExternalLink,
  Menu,
  X,
  FileCode,
  Download,
} from 'lucide-react';
import { HealthDrawer } from './HealthDrawer';

interface HeaderProps {
  onOpenFixStudio: () => void;
  onRunDemoScan: () => void;
  isLoading: boolean;
  onExportReport?: (format: 'json' | 'cyclonedx' | 'csv') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenFixStudio,
  onRunDemoScan,
  isLoading,
  onExportReport,
}) => {
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="border-b border-sentinel-hairline bg-sentinel-midnight/85 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Identity */}
          <div className="flex items-center space-x-3.5">
            <div className="relative group cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-sentinel-surface border border-sentinel-teal/40 flex items-center justify-center shadow-lg shadow-sentinel-teal/10 group-hover:border-sentinel-teal transition-all">
                <ShieldCheck className="w-5 h-5 text-sentinel-teal transition-transform group-hover:scale-110" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sentinel-teal opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sentinel-teal"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-mono font-bold tracking-wider text-sentinel-textPrimary flex items-center">
                  SUPPLY CHAIN <span className="text-sentinel-teal ml-1.5 font-extrabold">SENTINEL</span>
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono tracking-widest uppercase bg-sentinel-surface text-sentinel-cyan border border-sentinel-cyan/30 rounded-full">
                  PROD v1.2.0
                </span>
              </div>
              <p className="text-[11px] text-sentinel-textMuted font-mono hidden md:block">
                Software Supply-Chain Vulnerability Intelligence & GitHub Actions AST Analyzer
              </p>
            </div>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-3">
            {/* Live System Telemetry Button */}
            <button
              onClick={() => setIsHealthOpen(true)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold text-sentinel-textSecondary bg-sentinel-surface/80 hover:bg-sentinel-surface border border-sentinel-hairline hover:border-sentinel-teal/40 transition-all hover:text-white"
              title="Open System Health & API Telemetry"
            >
              <Activity className="w-3.5 h-3.5 text-sentinel-teal animate-pulse" />
              <span>Telemetry</span>
            </button>

            {/* Test Fixture Button */}
            <button
              onClick={onRunDemoScan}
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium text-sentinel-textSecondary bg-sentinel-surface hover:bg-sentinel-surfaceSecondary border border-sentinel-hairline hover:border-amber-400/40 transition-all hover:text-amber-300 disabled:opacity-50"
              title="Scan controlled local test repository with real vulnerabilities"
            >
              <Sparkles className="w-3.5 h-3.5 text-sentinel-accentWarning" />
              <span>Test Fixture</span>
            </button>

            {/* Fix Studio Shortcut Button */}
            <button
              onClick={onOpenFixStudio}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold text-sentinel-textPrimary bg-sentinel-surfaceElevated hover:bg-sentinel-surfaceSecondary border border-sentinel-cyan/40 hover:border-sentinel-cyan transition-all shadow-sm shadow-sentinel-cyan/20"
            >
              <Terminal className="w-3.5 h-3.5 text-sentinel-cyan" />
              <span>Fix Studio</span>
            </button>

            {/* OSV Status Indicator */}
            <div className="flex items-center space-x-1.5 pl-3 border-l border-sentinel-hairline text-xs font-mono text-sentinel-textMuted">
              <span className="w-2 h-2 rounded-full bg-sentinel-teal animate-pulse"></span>
              <span className="text-[11px] text-sentinel-mint">OSV ONLINE</span>
            </div>
          </div>

          {/* Mobile Menu Trigger */}
          <div className="md:hidden flex items-center space-x-2">
            <button
              onClick={() => setIsHealthOpen(true)}
              className="p-2 rounded-xl bg-sentinel-surface border border-sentinel-hairline text-sentinel-teal"
              title="Telemetry"
            >
              <Activity className="w-4 h-4 animate-pulse" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-sentinel-surface border border-sentinel-hairline text-sentinel-textSecondary hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-sentinel-hairline bg-sentinel-midnight p-4 space-y-3 font-mono text-xs">
            <button
              onClick={() => {
                onOpenFixStudio();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-sentinel-surface border border-sentinel-cyan/30 text-sentinel-cyan"
            >
              <span className="flex items-center space-x-2">
                <Terminal className="w-4 h-4" />
                <span>Fix Verification Studio</span>
              </span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                onRunDemoScan();
                setMobileMenuOpen(false);
              }}
              disabled={isLoading}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-sentinel-surface border border-sentinel-hairline text-sentinel-textPrimary"
            >
              <span className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Run Controlled Test Fixture</span>
              </span>
            </button>

            <button
              onClick={() => {
                setIsHealthOpen(true);
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-sentinel-surface border border-sentinel-hairline text-sentinel-textSecondary"
            >
              <span className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-sentinel-teal" />
                <span>Inspect System Telemetry</span>
              </span>
            </button>
          </div>
        )}
      </header>

      {/* Real-time Telemetry Drawer */}
      <HealthDrawer isOpen={isHealthOpen} onClose={() => setIsHealthOpen(false)} />
    </>
  );
};
