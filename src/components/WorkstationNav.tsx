'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';

export const WorkstationNav: React.FC = () => {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // On the main landing page, the hero renders the primary nav.bar
  if (pathname === '/') {
    return null;
  }

  const navLinks = [
    { label: 'Overview', href: '/' },
    { label: 'Analysis', href: '/analyze' },
    { label: 'Attack Graph', href: '/graph' },
    { label: 'Investigation', href: '/investigate' },
    { label: 'Remediation', href: '/remediation' },
    { label: 'Reports', href: '/reports' },
    { label: 'Trust & Data', href: '/trust' },
  ];

  return (
    <nav className="bar border-b border-[rgb(17_17_15_/_10%)] bg-[#F2F0EA]/95 backdrop-blur-md">
      {/* Brand lockup */}
      <Link href="/" className="lock">
        <span className="word">SENTINEL</span>
        <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false" className="w-6 h-6 sm:w-7 sm:h-7">
          <path d="M22.2 7.6V24.4H3.6V3.6H17.8" stroke="#11110F" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter"/>
          <rect x="16.6" y="1.9" width="8.4" height="3.2" fill="#B85E3E"/>
        </svg>
      </Link>

      {/* Center Nav Items */}
      <div className="center">
        <div className="flex items-center space-x-6">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href === '/graph' && pathname === '/topology') ||
              (link.href === '/remediation' && pathname === '/fix-studio');
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`transition-opacity ${isActive ? 'font-semibold underline underline-offset-4 decoration-[#B85E3E]' : 'opacity-80 hover:opacity-100'}`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right Auth & CTA */}
      <div className="flex items-center space-x-3">
        <Link href="/telemetry" className="cta text-sm font-medium hidden sm:inline-flex">
          Telemetry &amp; coverage
        </Link>
        <React.Suspense fallback={<div className="w-16 h-7 rounded bg-[rgb(17_17_15_/_5%)] animate-pulse" />}>
          <Show when="signed-out">
            <div className="flex items-center space-x-2">
              <SignInButton mode="modal">
                <button className="px-2.5 py-1 rounded border border-[rgb(17_17_15_/_25%)] text-xs font-mono font-bold hover:bg-[#11110F] hover:text-[#F2F0EA] transition-colors cursor-pointer">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="px-2.5 py-1 rounded bg-[#B85E3E] text-[#F2F0EA] text-xs font-mono font-bold hover:bg-[#9E4D31] transition-colors cursor-pointer">
                  Sign Up
                </button>
              </SignUpButton>
            </div>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </React.Suspense>
      </div>

      {/* Mobile Burger Toggle */}
      <button
        className="burger"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
      >
        <i className={mobileOpen ? 'transform translate-y-[7px] rotate-45' : ''} />
        <i className={mobileOpen ? 'opacity-0' : ''} />
        <i className={mobileOpen ? 'transform -translate-y-[7px] -rotate-45' : ''} />
      </button>

      {/* Mobile Dropdown Menu */}
      {mobileOpen && (
        <div className="menu opacity-100 pointer-events-auto">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block text-left text-2xl font-medium mb-6 text-[#11110F]"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/telemetry"
            onClick={() => setMobileOpen(false)}
            className="block text-left text-2xl font-medium mb-6 text-[#11110F] underline underline-offset-8"
          >
            Telemetry &amp; coverage
          </Link>
        </div>
      )}
    </nav>
  );
};
