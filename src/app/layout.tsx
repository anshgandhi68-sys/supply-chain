import type { Metadata } from 'next';
import './globals.css';
import { ScanProvider } from '@/lib/context/ScanContext';
import { WorkstationNav } from '@/components/WorkstationNav';

export const metadata: Metadata = {
  title: 'Supply Chain Sentinel 2.0 | Software Security Investigation Platform',
  description:
    'Evidence-driven software supply-chain security investigation workstation analyzing dependency lineages, attack graphs, and safe remediations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
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
      <body className="min-h-screen bg-[#07111F] text-[#F1F6FC] font-sans antialiased selection:bg-[#48D9C1] selection:text-[#07111F]">
        <ScanProvider>
          <div className="min-h-screen flex flex-col bg-[#07111F] cyber-grid">
            <WorkstationNav />
            <main className="flex-1 flex flex-col">{children}</main>
          </div>
        </ScanProvider>
      </body>
    </html>
  );
}

