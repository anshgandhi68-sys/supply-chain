'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ScanResult, Finding } from '@/lib/types';

interface ScanContextType {
  scanResult: ScanResult | null;
  setScanResult: (result: ScanResult | null) => void;
  isLoading: boolean;
  errorMsg: string | null;
  setErrorMsg: (msg: string | null) => void;
  selectedFinding: Finding | null;
  setSelectedFinding: (f: Finding | null) => void;
  runScan: (targetUrl: string, forceDemo?: boolean, token?: string) => Promise<ScanResult | null>;
  runDirectManifestScan: (payload: {
    packageJsonContent?: string;
    packageLockContent?: string;
    workflowYamlContent?: string;
    projectName?: string;
  }) => Promise<ScanResult | null>;
  loadDemoScan: () => Promise<void>;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  // Initialize with demo fixture on initial mount if not already present
  useEffect(() => {
    let mounted = true;
    const initDemo = async () => {
      try {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('sentinel_scan_cache') : null;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.repository && mounted) {
              setScanResult(parsed);
              return;
            }
          } catch {
            // ignore corrupted cache
          }
        }

        setIsLoading(true);
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl: 'demo', forceDemo: true }),
        });
        if (res.ok && mounted) {
          const data = await res.json();
          setScanResult(data);
          try {
            localStorage.setItem('sentinel_scan_cache', JSON.stringify(data));
          } catch {
            // ignore quota errors
          }
        }
      } catch (e) {
        console.warn('Initial demo scan load error:', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    if (!scanResult) {
      initDemo();
    }

    return () => {
      mounted = false;
    };
  }, []);

  const saveToCache = (result: ScanResult) => {
    try {
      localStorage.setItem('sentinel_scan_cache', JSON.stringify(result));
    } catch {
      // ignore quota
    }
  };

  const runScan = async (
    targetUrl: string,
    forceDemo: boolean = false,
    token?: string
  ): Promise<ScanResult | null> => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: targetUrl, forceDemo, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete scan');
      }
      setScanResult(data);
      saveToCache(data);
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const runDirectManifestScan = async (payload: {
    packageJsonContent?: string;
    packageLockContent?: string;
    workflowYamlContent?: string;
    projectName?: string;
  }): Promise<ScanResult | null> => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Manifest analysis failed');
      }
      setScanResult(data);
      saveToCache(data);
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const loadDemoScan = async () => {
    await runScan('demo', true);
  };

  return (
    <ScanContext.Provider
      value={{
        scanResult,
        setScanResult,
        isLoading,
        errorMsg,
        setErrorMsg,
        selectedFinding,
        setSelectedFinding,
        runScan,
        runDirectManifestScan,
        loadDemoScan,
      }}
    >
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) {
    throw new Error('useScan must be used within a ScanProvider');
  }
  return ctx;
}
