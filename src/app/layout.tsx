import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Supply Chain Sentinel | Software Security Investigation',
  description:
    'Real-time software supply-chain security investigation tool analyzing public GitHub repositories for OSV vulnerabilities and risky GitHub Actions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
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
      <body className="min-h-screen antialiased selection:bg-[#D47A4A] selection:text-white">
        {children}
      </body>
    </html>
  );
}
