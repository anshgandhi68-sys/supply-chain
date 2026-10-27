import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from 'next';
import './globals.css';
import { ScanProvider } from '@/lib/context/ScanContext';
import { WorkstationNav } from '@/components/WorkstationNav';

export const metadata: Metadata = {
  title: 'SENTINEL 2.0 | Software Supply Chain Security Workstation',
  description:
    'Evidence-driven software supply-chain security investigation workstation analyzing dependency lineages, attack graphs, and safe remediations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (var reg of registrations) {
                    reg.unregister();
                  }
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#F2F0EA] text-[#11110F] antialiased selection:bg-[#11110F] selection:text-[#F2F0EA]">
        <ClerkProvider>
          <ScanProvider>
          <div className="min-h-screen flex flex-col bg-[#F2F0EA]">
          <WorkstationNav />
          <main className="flex-1 flex flex-col">{children}</main>
          </div>
          </ScanProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}