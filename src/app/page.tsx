'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SentinelMascot } from '@/components/SentinelMascot';
import { ScanOverview } from '@/components/ScanOverview';
import { FindingsList } from '@/components/FindingsList';
import { FindingDetailModal } from '@/components/FindingDetailModal';
import { EvidenceGraph } from '@/components/EvidenceGraph';
import { Sentinel3DScene } from '@/components/Sentinel3DScene';
import { FixStudioModal } from '@/components/FixStudioModal';
import { HealthDrawer } from '@/components/HealthDrawer';
import { ScanResult, Finding } from '@/lib/types';
import {
  ShieldAlert,
  Search,
  Sparkles,
  Terminal,
  Activity,
  Layers,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Globe,
  Radio,
} from 'lucide-react';

export default function MergedSentinelPage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [isFixStudioOpen, setIsFixStudioOpen] = useState(false);
  const [fixStudioFinding, setFixStudioFinding] = useState<Finding | null>(null);
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'graph' | 'findings'>('findings');
  const [repoUrl, setRepoUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to analysis section once scan results arrive
  useEffect(() => {
    if (scanResult) {
      const timer = setTimeout(() => {
        const analysisEl = document.getElementById('analysis');
        if (analysisEl) {
          analysisEl.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scanResult]);

  // Trigger scan API call
  const handleScan = async (targetUrl: string, forceDemo: boolean = false) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: targetUrl, forceDemo }),
      });

      const data = await response.json();
      if (response.ok) {
        setScanResult(data);
      } else {
        setErrorMsg(data.error || 'Repository analysis failed. Please verify the URL.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Network request failed: ${msg}. Please check the server connection.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Preset quick scans
  const quickPresets = [
    { label: 'Express (npm)', url: 'https://github.com/expressjs/express' },
    { label: 'React (yarn)', url: 'https://github.com/facebook/react' },
    { label: 'Flask (python)', url: 'https://github.com/pallets/flask' },
    { label: 'Tokio (rust)', url: 'https://github.com/tokio-rs/tokio' },
    { label: 'Demo Fixture', url: 'demo' },
  ];

  // Initialize page loader & scroll effects
  useEffect(() => {
    const loaderTimer = setTimeout(() => {
      setIsLoaded(true);
      document.body.classList.add('loaded');
    }, 1600);

    const sections = document.querySelectorAll<HTMLElement>('main > section');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
          }
        });
      },
      { threshold: 0.3 }
    );
    sections.forEach((s) => observer.observe(s));

    const handleScroll = () => {
      const vh = window.innerHeight;
      const scrollY = window.scrollY;

      // Parallax ornaments
      const orns = document.querySelectorAll<HTMLElement>('.orn');
      orns.forEach((el) => {
        const s = el.closest('section');
        if (!s) return;
        const p = s.getBoundingClientRect().top / vh;
        const sp = parseFloat(el.getAttribute('data-speed') || '0');
        const r = parseFloat(el.getAttribute('data-rot') || '0');
        el.style.transform = `translate3d(0, ${p * sp * vh}px, 0) rotate(${p * r}deg)`;
      });

      // Dark theme detection at 6% of viewport height
      let isDark = false;
      sections.forEach((sec) => {
        const rect = sec.getBoundingClientRect();
        if (rect.top <= vh * 0.06 && rect.bottom >= vh * 0.06) {
          if (sec.getAttribute('data-theme') === 'dark') {
            isDark = true;
          }
        }
      });

      if (isDark) {
        document.body.classList.add('on-dark');
      } else {
        document.body.classList.remove('on-dark');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      clearTimeout(loaderTimer);
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, []);

  const openFixStudio = (finding?: Finding) => {
    setFixStudioFinding(finding || null);
    setIsFixStudioOpen(true);
  };

  const focusScanner = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    const topEl = document.getElementById('top');
    if (topEl) {
      topEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative w-full min-h-screen text-[#071F20] font-sans selection:bg-[#D47A4A] selection:text-white">
      {/* Noise grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-40 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Page Loader */}
      <div
        id="loader"
        aria-hidden="true"
        className={`fixed inset-0 bg-[#F4F0E6] z-50 grid place-items-center transition-all duration-800 ${
          isLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <svg
          viewBox="0 0 40 40"
          className="w-16 h-16 animate-spin"
          style={{ animationDuration: '1.6s' }}
        >
          <circle cx="15" cy="22" r="9" fill="#B73945" />
          <circle cx="23" cy="18" r="9" fill="#071F20" />
          <path d="M23 9c0-4 3-6 6-6" stroke="#D47A4A" strokeWidth="2" fill="none" />
        </svg>
      </div>

      {/* Fixed Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-[clamp(18px,3.2vw,46px)] pt-[18px] pointer-events-none transition-colors duration-500">
        <a
          className="logo w-10 h-10 block pointer-events-auto group cursor-pointer"
          href="#top"
          aria-label="Supply Chain Sentinel home"
        >
          <svg
            viewBox="0 0 40 40"
            aria-hidden="true"
            className="w-full h-full transition-transform duration-600 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:rotate-90"
          >
            <circle cx="15" cy="22" r="9" fill="#123B3A" />
            <circle cx="24" cy="18" r="8" fill="#071F20" />
            <path d="M24 10c0-4 3-6 6-6" stroke="#D47A4A" strokeWidth="2" fill="none" />
            <path
              d="M33 26l1.2 2.8L37 30l-2.8 1.2L33 34l-1.2-2.8L29 30l2.8-1.2z"
              fill="#D47A4A"
            />
          </svg>
        </a>

        <div className="links hidden md:flex gap-[clamp(22px,4.5vw,58px)] items-center pointer-events-auto">
          <a
            href="#story"
            className="relative text-[15.5px] font-normal min-h-[44px] inline-flex items-center after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-2 after:h-[1.5px] after:bg-current after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-350"
          >
            What it investigates
          </a>
          <a
            href="#guide"
            className="relative text-[15.5px] font-normal min-h-[44px] inline-flex items-center after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-2 after:h-[1.5px] after:bg-current after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-350"
          >
            The evidence model
          </a>
          <button
            onClick={() => openFixStudio()}
            className="relative text-[15.5px] font-normal min-h-[44px] inline-flex items-center text-inherit bg-transparent border-none cursor-pointer after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-2 after:h-[1.5px] after:bg-current after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-350"
          >
            Fix Studio
          </button>
          <button
            onClick={() => setIsHealthOpen(true)}
            className="relative text-[15.5px] font-normal min-h-[44px] inline-flex items-center text-inherit bg-transparent border-none cursor-pointer after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-2 after:h-[1.5px] after:bg-current after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-350"
          >
            Telemetry
          </button>
          <button
            onClick={focusScanner}
            className="cta text-[16px] font-semibold mr-[clamp(0px,4vw,70px)] bg-transparent border-none cursor-pointer text-inherit relative min-h-[44px] inline-flex items-center after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-2 after:h-[1.5px] after:bg-current after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-350"
          >
            Analyze a repository
          </button>
        </div>
      </nav>

      {/* Fixed Lower-Right Badge */}
      <div className="badge fixed right-[clamp(18px,3.2vw,46px)] bottom-[calc(22px+env(safe-area-inset-bottom,0px))] z-30 flex gap-2 items-center text-[12.5px] font-medium transition-colors duration-500">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none">
          <circle cx="6" cy="6" r="2.4" fill="currentColor" />
          <circle cx="14" cy="6" r="2.4" fill="currentColor" />
          <circle cx="6" cy="14" r="2.4" fill="currentColor" />
          <circle cx="14" cy="14" r="2.4" fill="currentColor" />
        </svg>
        <span>
          Built for <strong className="text-[#D47A4A] font-bold">Sentinel</strong>
        </span>
      </div>

      {/* Walking Mascot Canvas */}
      <SentinelMascot />

      <main className="relative">
        {/* Section 1: #top Hero */}
        <section
          id="top"
          data-theme="light"
          className="relative min-h-screen overflow-hidden flex flex-col justify-between pt-[15.5vh] pb-12"
          style={{
            background: `radial-gradient(ellipse at 15% 100%, #07202044 0, transparent 55%), radial-gradient(ellipse at 85% 95%, #12383a55 0, transparent 50%), linear-gradient(180deg, var(--paper) 0%, #E6EDE2 60%, var(--mist) 100%)`,
          }}
        >
          {/* Ornaments */}
          <div
            className="orn absolute left-[-14vw] bottom-[-24vw] w-[clamp(420px,64vw,1100px)] aspect-square rounded-full pointer-events-none will-change-transform"
            data-speed="-0.25"
            data-rot="8"
            style={{
              background: 'radial-gradient(circle at 60% 40%, #B7394555, #B7394500 65%)',
              filter: 'blur(30px)',
            }}
          />
          <div
            className="orn absolute right-[-10vw] bottom-[-14vw] w-[48vw] aspect-square rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, #12383a66, transparent 65%)',
            }}
          />

          {/* Main Headline */}
          <h1
            data-speed="0.55"
            className="h1 px-4 text-center font-extrabold text-[clamp(42px,6.25vw,112px)] leading-[1.04] tracking-[-0.035em] text-[#071F20]"
            style={{ textShadow: '0 0 40px #F4F0E659' }}
          >
            <span className="l block overflow-hidden pb-[0.06em]">
              <span
                className={`block transition-transform duration-1100 ease-[cubic-bezier(.2,.8,.15,1)] ${
                  isLoaded ? 'translate-y-0' : 'translate-y-[110%]'
                }`}
              >
                See the risks hidden in
              </span>
            </span>
            <span className="l block overflow-hidden pb-[0.06em]">
              <span
                className={`block transition-transform duration-1100 ease-[cubic-bezier(.2,.8,.15,1)] delay-120 ${
                  isLoaded ? 'translate-y-0' : 'translate-y-[110%]'
                }`}
              >
                your software supply chain.
              </span>
            </span>
          </h1>

          {/* Side Block */}
          <div
            className={`side max-w-xl mx-auto px-6 text-center mt-6 transition-all duration-1000 delay-700 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <p className="text-[clamp(15px,1.45vw,20px)] leading-[1.4] text-[#476363]">
              Investigate open-source vulnerabilities, dependency relationships, and CI/CD workflow risks with evidence you can inspect and findings you can verify.
            </p>
          </div>

          {/* Integrated Real Scanner Console */}
          <div className="w-full max-w-3xl mx-auto px-4 z-20 mt-8">
            <div className="p-2 sm:p-3 rounded-2xl bg-[#071F20]/5 backdrop-blur-md border border-[#071F20]/15 shadow-xl transition-all hover:border-[#D47A4A]/50">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (repoUrl.trim()) handleScan(repoUrl.trim());
                }}
                className="flex flex-col sm:flex-row items-center gap-2"
              >
                <div className="relative flex-grow w-full">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#476363]">
                    <Search className="w-5 h-5" />
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="Enter public GitHub repository URL (e.g. expressjs/express)..."
                    disabled={isLoading}
                    className="w-full pl-11 pr-4 py-3 bg-white/80 rounded-xl text-sm font-medium text-[#071F20] placeholder-[#6E829B] focus:outline-none focus:ring-2 focus:ring-[#D47A4A] transition-all border border-transparent shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !repoUrl.trim()}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#071F20] text-white hover:bg-[#123B3A] disabled:opacity-50 transition-all font-semibold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer shrink-0"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <span>Analyze</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[#071F20]/10 px-1 text-xs">
                <span className="text-[#6E829B] font-medium mr-1">Quick Presets:</span>
                {quickPresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setRepoUrl(preset.url === 'demo' ? '' : preset.url);
                      handleScan(preset.url, preset.url === 'demo');
                    }}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded-lg bg-white/70 hover:bg-white text-[#071F20] border border-[#071F20]/10 transition-colors cursor-pointer font-mono"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Loading Feedback Indicator */}
              {isLoading && (
                <div className="mt-3 p-3.5 rounded-xl bg-white/95 border border-[#071F20]/15 text-xs text-[#071F20] flex items-center space-x-3 shadow-md">
                  <div className="w-4 h-4 border-2 border-[#D47A4A] border-t-transparent rounded-full animate-spin shrink-0" />
                  <div className="font-mono">
                    <span className="font-bold text-[#071F20]">Analyzing Repository...</span>
                    <span className="text-[#6E829B] ml-1.5 hidden sm:inline">
                      Querying authoritative OSV vulnerability advisories & verifying workflow AST rules
                    </span>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="mt-3 p-3 rounded-xl bg-[#FF647C]/15 border border-[#FF647C]/30 text-[#962A35] text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#FF647C]" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section: #analysis Active Investigation Console */}
        {scanResult && (
          <section
            id="analysis"
            data-theme="light"
            className="relative min-h-screen py-16 px-4 sm:px-6 lg:px-8 bg-[#F4F0E6] text-[#071F20] border-y border-[#071F20]/15 z-30 shadow-2xl"
          >
            <div className="max-w-7xl mx-auto space-y-8">
              {/* Scan Overview & Verdict Banner */}
              <ScanOverview result={scanResult} />

              {/* View Switcher Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#071F20]/15 pb-4">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setActiveTab('findings')}
                    className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
                      activeTab === 'findings'
                        ? 'bg-[#071F20] text-white shadow-md'
                        : 'bg-white/80 text-[#476363] hover:bg-white border border-[#071F20]/10'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-[#D47A4A]" />
                    <span>Security Findings Matrix ({scanResult.findings.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('graph')}
                    className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
                      activeTab === 'graph'
                        ? 'bg-[#071F20] text-white shadow-md'
                        : 'bg-white/80 text-[#476363] hover:bg-white border border-[#071F20]/10'
                    }`}
                  >
                    <Radio className="w-4 h-4 text-[#D47A4A]" />
                    <span>3D & 2D Lineage Graph</span>
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs text-[#476363] font-mono">
                  <span>Resolved SHA:</span>
                  <span className="text-[#071F20] font-bold font-mono">
                    {scanResult.repository.resolvedCommitSha?.slice(0, 7) || 'HEAD'}
                  </span>
                  <button
                    onClick={() => {
                      setScanResult(null);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="ml-2 px-3.5 py-1.5 rounded-xl bg-white hover:bg-[#F4F0E6] text-[#071F20] border border-[#071F20]/15 font-semibold text-xs transition-all shadow-sm cursor-pointer"
                  >
                    ← Close Results
                  </button>
                </div>
              </div>

              {/* Tab Contents */}
              {activeTab === 'findings' ? (
                <FindingsList
                  findings={scanResult.findings}
                  onSelectFinding={(f) => setSelectedFinding(f)}
                  onOpenFixStudioForFinding={openFixStudio}
                />
              ) : (
                <div className="space-y-6">
                  {/* 3D WebGL Orbit */}
                  <Sentinel3DScene
                    result={scanResult}
                    onSelectFinding={(f) => setSelectedFinding(f)}
                  />

                  {/* 2D Lineage Graph */}
                  <EvidenceGraph
                    result={scanResult}
                    onSelectFinding={(f) => setSelectedFinding(f)}
                  />
                </div>
              )}

              {/* Bottom Return Action Bar */}
              <div className="pt-6 border-t border-[#071F20]/15 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
                <span className="text-[#6E829B]">
                  Analysis performed via live deterministic scanner engine & OSV database queries.
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      inputRef.current?.focus();
                    }}
                    className="px-4 py-2 rounded-xl bg-[#071F20] text-white hover:bg-[#123B3A] font-semibold transition-all shadow-sm cursor-pointer"
                  >
                    Analyze Another Repository ↑
                  </button>
                  <button
                    onClick={() => {
                      setScanResult(null);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-4 py-2 rounded-xl bg-white hover:bg-[#F4F0E6] text-[#071F20] border border-[#071F20]/15 font-semibold transition-all shadow-sm cursor-pointer"
                  >
                    Close Results
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Section 2: #story Chapter 01 */}
        <section
          id="story"
          data-theme="light"
          className="relative h-screen min-h-screen overflow-hidden bg-gradient-to-b from-[#DDE8DD] to-[#EAF0E8]"
        >
          <div
            className="orn absolute left-[-9vw] top-[-14vw] w-[clamp(380px,46vw,820px)] h-[clamp(120px,14vw,240px)] rounded-[10px] pointer-events-none will-change-transform"
            data-speed="0.35"
            data-rot="-6"
            style={{
              background: 'linear-gradient(90deg, #D47A4A55, #D47A4A00)',
              filter: 'blur(6px)',
            }}
          />

          <div className="txt num absolute left-[6vw] top-[50vh] font-semibold leading-[0.8] tracking-[-0.06em] text-[#B8D7CC] text-[clamp(110px,15vw,250px)] select-none">
            01
          </div>

          <div className="txt blk absolute left-[50vw] top-[41vh] w-[min(520px,44vw)]">
            <h2 className="reveal d1 font-bold text-[clamp(30px,3.4vw,56px)] leading-[1.12] tracking-[-0.02em] text-[#071F20]">
              Follow the<br />
              risk through<br />
              every dependency
            </h2>
            <p className="reveal d2 mt-[22px] text-[clamp(13.5px,1.05vw,16px)] leading-[1.6] text-[#476363] max-w-[420px]">
              Trace direct and transitive packages, vulnerability lookups, and GitHub Actions workflow risks, each tied to the file that produced the evidence.
            </p>
          </div>
        </section>

        {/* Section 3: #guide Chapter 02 (Dark) */}
        <section
          id="guide"
          data-theme="dark"
          className="dark relative h-screen min-h-screen overflow-hidden bg-[#123B3A] text-white"
          style={{
            background: `radial-gradient(ellipse at 75% 85%, #D47A4A44 0, transparent 45%), radial-gradient(circle at 20% 30%, #48a8a033 0, transparent 40%), #123B3A`,
          }}
        >
          <div
            className="orn absolute right-[-8vw] bottom-[-20vw] w-[clamp(380px,46vw,820px)] aspect-square rounded-full pointer-events-none will-change-transform"
            data-speed="-0.3"
            data-rot="10"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #D47A4A88, transparent 62%)',
              filter: 'blur(24px)',
            }}
          />

          <div className="txt blk absolute left-[6vw] top-[22vh] w-[min(500px,46vw)]">
            <div className="num reveal font-semibold leading-[0.8] tracking-[-0.06em] text-[#82A7A5] text-[clamp(110px,15vw,250px)] mb-[22px]">
              02
            </div>
            <h2 className="reveal d1 font-bold text-[clamp(30px,3.4vw,56px)] leading-[1.12] tracking-[-0.02em]">
              Confidence is not<br />
              the same as severity
            </h2>
            <p className="reveal d2 mt-[22px] text-[clamp(13.5px,1.05vw,16px)] leading-[1.6] text-[#DDE8DDD1] max-w-[420px]">
              Severity describes impact. Confidence describes how strong the evidence is that a finding applies. We never merge the two.
            </p>
            <ul className="ul reveal d3 mt-[22px] list-none text-[14px] leading-[1.5] max-w-[420px]">
              <li className="py-2.5 border-t border-[#FFFFFF2E]">
                <b className="font-semibold text-white">Confirmed</b>
                <span className="block text-[#DDE8DDB0] text-[13px]">
                  Exact version evidence matches an affected range.
                </span>
              </li>
              <li className="py-2.5 border-t border-[#FFFFFF2E]">
                <b className="font-semibold text-white">Version unverified</b>
                <span className="block text-[#DDE8DDB0] text-[13px]">
                  A range alone is never treated as an installed version.
                </span>
              </li>
              <li className="py-2.5 border-t border-[#FFFFFF2E]">
                <b className="font-semibold text-white">Query failed</b>
                <span className="block text-[#DDE8DDB0] text-[13px]">
                  Reported as incomplete, never as clean.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Section 4: #c3 Chapter 03 */}
        <section
          id="c3"
          data-theme="light"
          className="relative h-screen min-h-screen overflow-hidden bg-gradient-to-b from-[#EAF0E8] to-[#DDE8DD]"
        >
          <div
            className="orn absolute left-[-10vw] top-[6vh] w-[clamp(360px,42vw,760px)] aspect-square rounded-full opacity-25 pointer-events-none will-change-transform"
            data-speed="-0.2"
            data-rot="-10"
            style={{
              background: 'radial-gradient(circle, #476363 0, #47636300 62%)',
              filter: 'blur(20px)',
            }}
          />

          <div className="txt blk absolute left-[54vw] top-[26vh] w-[min(500px,40vw)]">
            <div className="num reveal font-semibold leading-[0.8] tracking-[-0.06em] text-[#B8D7CC] text-[clamp(110px,15vw,250px)] mb-[24px]">
              03
            </div>
            <h2 className="reveal d1 font-bold text-[clamp(30px,3.4vw,56px)] leading-[1.12] tracking-[-0.02em] text-[#071F20]">
              Verify the fix,<br />
              then see the gaps
            </h2>
            <p className="reveal d2 mt-[22px] text-[clamp(13.5px,1.05vw,16px)] leading-[1.6] text-[#476363] max-w-[420px]">
              Fix Verification Studio reanalyzes the changed input and compares before and after. Coverage reports list unsupported files and incomplete analysis. A clean scan never guarantees the absence of vulnerabilities.
            </p>
            <div className="reveal d3 mt-6">
              <button
                onClick={() => openFixStudio()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#071F20] text-white hover:bg-[#123B3A] text-xs font-mono font-semibold transition-all shadow-md cursor-pointer"
              >
                <Terminal className="w-4 h-4 text-[#D47A4A]" />
                <span>Open Fix Verification Studio</span>
              </button>
            </div>
          </div>
        </section>

        {/* Section 5: #reserve Footer */}
        <section
          id="reserve"
          data-theme="light"
          className="relative h-screen min-h-screen overflow-hidden bg-[#DDE8DD]"
        >
          <div className="c absolute left-0 right-0 top-[18vh] text-center z-10 px-4">
            <h2 className="reveal font-bold text-[clamp(30px,3.6vw,60px)] tracking-[-0.02em] text-[#071F20]">
              Understand the risk before<br />
              it reaches production.
            </h2>
            <button
              onClick={focusScanner}
              className="arrow reveal d1 inline-flex items-center gap-3.5 mt-8 font-semibold text-[clamp(15px,1.4vw,19px)] min-h-[44px] cursor-pointer bg-transparent border-none text-[#071F20] group"
            >
              <span>Start an analysis</span>
              <i className="w-[25px] h-[32px] border border-current rounded-[10px] grid place-items-center transition-transform duration-350 group-hover:translate-x-1">
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  className="w-3"
                >
                  <path d="M4 2l4 4-4 4" />
                </svg>
              </i>
            </button>
          </div>

          <div className="brand absolute left-[clamp(18px,3.2vw,46px)] bottom-[80px] z-10">
            <b className="block font-bold tracking-[-0.02em] text-[clamp(30px,3vw,46px)] text-[#071F20]">
              Supply Chain Sentinel
            </b>
            <span className="text-[14px] text-[#476363]">
              Evidence-based supply-chain analysis
            </span>
          </div>

          <div className="cols absolute z-10 right-[calc(clamp(18px,3.2vw,46px)+120px)] bottom-[80px] flex gap-16 text-[14.5px] font-medium">
            <div>
              <a
                href="#analysis"
                className="block leading-[1.9] text-[#071F20] hover:text-[#D47A4A] transition-colors"
              >
                Dependency findings
              </a>
              <button
                onClick={() => {
                  setActiveTab('graph');
                  document.getElementById('analysis')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="block leading-[1.9] text-[#071F20] hover:text-[#D47A4A] transition-colors bg-transparent border-none cursor-pointer text-left font-medium"
              >
                Dependency graph
              </button>
              <a
                href="#story"
                className="block leading-[1.9] text-[#071F20] hover:text-[#D47A4A] transition-colors"
              >
                Workflow security
              </a>
            </div>
            <div>
              <button
                onClick={() => openFixStudio()}
                className="block leading-[1.9] text-[#071F20] hover:text-[#D47A4A] transition-colors bg-transparent border-none cursor-pointer text-left font-medium"
              >
                Fix verification
              </button>
              <button
                onClick={() => setIsHealthOpen(true)}
                className="block leading-[1.9] text-[#071F20] hover:text-[#D47A4A] transition-colors bg-transparent border-none cursor-pointer text-left font-medium"
              >
                Telemetry & coverage
              </button>
            </div>
          </div>

          <p className="fine absolute z-10 left-[clamp(18px,3.2vw,46px)] right-[clamp(18px,3.2vw,46px)] bottom-[22px] text-[11.5px] text-[#476363] max-w-[60ch]">
            The walking robot is a decorative mascot, not a scan result. Absence of findings is not proof of absence of vulnerabilities.
          </p>
        </section>
      </main>

      {/* Finding Detail Modal */}
      <FindingDetailModal
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
        onOpenFixStudio={openFixStudio}
      />

      {/* Fix Verification Studio Modal */}
      <FixStudioModal
        isOpen={isFixStudioOpen}
        onClose={() => {
          setIsFixStudioOpen(false);
          setFixStudioFinding(null);
        }}
        initialFinding={fixStudioFinding}
      />

      {/* Real-time Telemetry Drawer */}
      <HealthDrawer isOpen={isHealthOpen} onClose={() => setIsHealthOpen(false)} />
    </div>
  );
}
