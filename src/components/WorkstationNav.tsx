'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useScan } from '@/lib/context/ScanContext';
import {
  ShieldAlert,
  GitBranch,
  Network,
  Microscope,
  Wrench,
  FileText,
  Activity,
  Layers,
  Sparkles,
  AlertOctagon,
  AlertTriangle,
  Menu,
  X,
  Upload,
} from 'lucide-react';

export const WorkstationNav: React.FC = () => {
  const pathname = usePathname();
  const { scanResult, isLoading, loadDemoScan } = useScan();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Overview', href: '/', icon: ShieldAlert },
    { label: 'Analysis', href: '/analyze', icon: Upload },
    { label: 'Attack Graph', href: '/graph', icon: Network },
    { label: 'Investigation', href: '/investigate', icon: Microscope },
    { label: 'Remediation', href: '/remediation', icon: Wrench },
    { label: 'Reports', href: '/reports', icon: FileText },
    { label: 'Telemetry', href: '/telemetry', icon: Activity },
  ];

  const repo = scanResult?.repository;
  const stats = scanResult?.stats;

  return (
    <header className="sticky top-0 z-40 bg-[#0B1728]/95 backdrop-blur-xl border-b border-[rgba(159,190,220,0.16)] font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center space-x-3 shrink-0">
          <Link href="/" className="flex items-center space-x-2.5 group cursor-pointer">
            <div className="w-9 h-9 rounded-lg bg-[#111F33] border border-[#48D9C1]/40 flex items-center justify-center shadow-lg shadow-[#48D9C1]/10 group-hover:border-[#48D9C1] transition-all">
              <ShieldAlert className="w-5 h-5 text-[#48D9C1] transition-transform group-hover:scale-110" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm sm:text-base font-bold tracking-wider text-[#F1F6FC]">
                  SENTINEL <span className="text-[#48D9C1]">2.0</span>
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono tracking-widest uppercase bg-[#111F33] text-[#65BFFF] border border-[#65BFFF]/30">
                  WORKSTATION
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center space-x-1 font-mono text-xs">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href === '/graph' && pathname === '/topology') ||
              (link.href === '/remediation' && pathname === '/fix-studio');
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#17283C] text-[#48D9C1] font-semibold border border-[#48D9C1]/30 shadow-sm'
                    : 'text-[#9AAEC4] hover:text-[#F1F6FC] hover:bg-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#48D9C1]' : 'text-[#6E829B]'}`} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Status & Controls */}
        <div className="flex items-center space-x-3 shrink-0">
          {/* Active Context Chip */}
          {repo && (
            <div className="hidden sm:inline-flex items-center space-x-2 px-2.5 py-1 rounded-md bg-[#111F33] border border-[rgba(159,190,220,0.16)] text-[11px] font-mono text-[#9AAEC4]">
              <GitBranch className="w-3.5 h-3.5 text-[#48D9C1]" />
              <span className="text-[#F1F6FC] font-medium truncate max-w-[150px]">
                {repo.repo || repo.fullName}
              </span>
              {stats && (
                <div className="flex items-center space-x-1 pl-1 border-l border-[rgba(159,190,220,0.2)]">
                  {stats.criticalCount > 0 && (
                    <span className="text-[#FF647C] font-bold flex items-center">
                      <AlertOctagon className="w-3 h-3 mr-0.5" />
                      {stats.criticalCount}
                    </span>
                  )}
                  {stats.highCount > 0 && (
                    <span className="text-[#FFC36B] font-bold flex items-center">
                      <AlertTriangle className="w-3 h-3 mr-0.5" />
                      {stats.highCount}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quick Demo Trigger */}
          <button
            onClick={() => loadDemoScan()}
            disabled={isLoading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-[#17283C] hover:bg-[#1D314A] text-[#65BFFF] border border-[#65BFFF]/30 transition-all cursor-pointer disabled:opacity-50"
            title="Load the controlled risk demo dataset"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#65BFFF]" />
            <span className="hidden md:inline">Demo Dataset</span>
            <span className="md:hidden">Demo</span>
          </button>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-[#9AAEC4] hover:text-[#F1F6FC] hover:bg-white/5 cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[rgba(159,190,220,0.16)] bg-[#0B1728] px-4 py-3 space-y-1 font-mono text-xs">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
                  isActive
                    ? 'bg-[#17283C] text-[#48D9C1] font-semibold border border-[#48D9C1]/30'
                    : 'text-[#9AAEC4] hover:text-[#F1F6FC] hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4 text-[#48D9C1]" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
};
