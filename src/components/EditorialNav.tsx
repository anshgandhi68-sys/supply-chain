'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface EditorialNavProps {
  onAnalyzeClick?: () => void;
  dark?: boolean;
}

export const EditorialNav: React.FC<EditorialNavProps> = ({ onAnalyzeClick, dark = false }) => {
  const pathname = usePathname();

  const links = [
    { label: 'Overview', href: '/' },
    { label: 'Fix Studio', href: '/fix-studio' },
    { label: 'Dependency Graph', href: '/topology' },
    { label: 'Coverage Audit', href: '/coverage' },
    { label: 'Telemetry', href: '/telemetry' },
  ];

  return (
    <>
      {/* Top Fixed Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-[clamp(18px,3.2vw,46px)] pt-[18px] pointer-events-none transition-colors duration-500 ${
          dark ? 'text-white' : 'text-[#071F20]'
        }`}
      >
        <Link
          className="logo w-10 h-10 block pointer-events-auto group cursor-pointer"
          href="/"
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
        </Link>

        <div className="links hidden md:flex gap-[clamp(18px,3vw,42px)] items-center pointer-events-auto">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative text-[15px] min-h-[44px] inline-flex items-center transition-all ${
                  isActive ? 'font-semibold text-[#D47A4A]' : 'font-normal hover:text-[#D47A4A]'
                } after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-2 after:h-[1.5px] after:bg-current ${
                  isActive ? 'after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100'
                } after:origin-left after:transition-transform after:duration-350`}
              >
                {link.label}
              </Link>
            );
          })}

          {onAnalyzeClick ? (
            <button
              onClick={onAnalyzeClick}
              className="cta text-[15.5px] font-semibold mr-[clamp(0px,3vw,50px)] bg-[#071F20] text-white px-4 py-2 rounded-xl border border-transparent hover:bg-[#123B3A] transition-all cursor-pointer shadow-sm"
            >
              Analyze Repo
            </button>
          ) : (
            <Link
              href="/#top"
              className="cta text-[15.5px] font-semibold mr-[clamp(0px,3vw,50px)] bg-[#071F20] text-white px-4 py-2 rounded-xl border border-transparent hover:bg-[#123B3A] transition-all cursor-pointer shadow-sm"
            >
              Analyze Repo
            </Link>
          )}
        </div>
      </nav>

      {/* Fixed Lower-Right Badge */}
      <div
        className={`badge fixed right-[clamp(18px,3.2vw,46px)] bottom-[calc(22px+env(safe-area-inset-bottom,0px))] z-30 flex gap-2 items-center text-[12.5px] font-medium transition-colors duration-500 pointer-events-none ${
          dark ? 'text-white' : 'text-[#071F20]'
        }`}
      >
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
    </>
  );
};
