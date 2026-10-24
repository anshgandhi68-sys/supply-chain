'use client';

import React, { useState, useEffect } from 'react';
import { EditorialNav } from '@/components/EditorialNav';
import {
  Activity,
  Server,
  ShieldCheck,
  Globe,
  Clock,
  RefreshCw,
  Cpu,
  Layers,
  Database,
  Lock,
} from 'lucide-react';

export default function TelemetryPage() {
  const [healthData, setHealthData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTelemetry = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
      } else {
        setError(`Failed to fetch health metrics (HTTP ${res.status})`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Network error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  return (
    <div className="relative min-h-screen bg-[#DDE8DD] text-[#071F20] font-sans selection:bg-[#D47A4A] selection:text-white pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <EditorialNav />

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#071F20]/15 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#071F20]/5 border border-[#071F20]/10 text-xs font-mono font-medium text-[#D47A4A] mb-2">
              <Activity className="w-3.5 h-3.5" />
              <span>Real-Time Production Telemetry</span>
            </div>
            <h1 className="text-[clamp(28px,3.5vw,46px)] font-bold tracking-[-0.03em] leading-tight text-[#071F20]">
              System Health & Telemetry
            </h1>
            <p className="text-[#476363] text-xs font-mono mt-1">
              Live OSV database connectivity, SSRF security boundary, and runtime resource metrics.
            </p>
          </div>

          <button
            onClick={fetchTelemetry}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl bg-[#071F20] text-white hover:bg-[#123B3A] text-xs font-mono font-semibold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 transition-all self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Ping</span>
          </button>
        </div>

        {error ? (
          <div className="p-4 rounded-xl bg-[#FF647C]/15 border border-[#FF647C]/30 text-[#962A35] font-mono text-xs">
            {error}
          </div>
        ) : healthData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono">
            {/* 1. OSV Vulnerability Database Ping */}
            <div className="p-6 rounded-2xl bg-white/80 border border-[#071F20]/15 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#071F20]/10 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#071F20]">
                  <Database className="w-4 h-4 text-[#D47A4A]" />
                  <span>Google OSV Vulnerability API</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#48D9C1]/20 text-[#123B3A]">
                  {healthData.integrations?.osvDatabase?.status?.toUpperCase()}
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[#071F20]/5">
                  <span className="text-[#6E829B]">Batch Query Endpoint:</span>
                  <span className="text-[#071F20] truncate max-w-[220px]">
                    {healthData.integrations?.osvDatabase?.endpoint}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#071F20]/5">
                  <span className="text-[#6E829B]">Roundtrip Latency:</span>
                  <span className="font-bold text-[#123B3A]">
                    {healthData.integrations?.osvDatabase?.latencyMs ?? healthData.checksDurationMs}ms
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#6E829B]">Query Timeout Limit:</span>
                  <span className="text-[#071F20]">8,000ms</span>
                </div>
              </div>
            </div>

            {/* 2. Server Runtime Memory */}
            <div className="p-6 rounded-2xl bg-white/80 border border-[#071F20]/15 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#071F20]/10 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#071F20]">
                  <Cpu className="w-4 h-4 text-[#48D9C1]" />
                  <span>Node.js Process Memory</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#48D9C1]/20 text-[#123B3A]">
                  HEALTHY
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[#071F20]/5">
                  <span className="text-[#6E829B]">Heap Allocated / Used:</span>
                  <span className="font-bold text-[#071F20]">
                    {healthData.memory?.heapUsedMb} MB / {healthData.memory?.heapTotalMb} MB
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#071F20]/5">
                  <span className="text-[#6E829B]">Resident Set Size (RSS):</span>
                  <span className="text-[#071F20]">{healthData.memory?.rssMb} MB</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#6E829B]">Platform Uptime:</span>
                  <span className="text-[#071F20]">
                    {Math.floor((healthData.uptimeSeconds || 0) / 60)} minutes
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Strict SSRF Security Perimeter */}
            <div className="p-6 rounded-2xl bg-white/80 border border-[#071F20]/15 shadow-sm space-y-4 md:col-span-2">
              <div className="flex items-center justify-between border-b border-[#071F20]/10 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#071F20]">
                  <Lock className="w-4 h-4 text-[#FF647C]" />
                  <span>SSRF Defense Perimeter & Whitelisted Repository Hosts</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#48D9C1]/20 text-[#123B3A]">
                  ACTIVE & ENFORCED
                </span>
              </div>
              <div className="space-y-3 text-xs">
                <p className="text-[#476363] leading-relaxed">
                  Sentinel enforces strict URL domain isolation. Redirects to local loopback (127.0.0.1, ::1), private subnets (RFC 1918), and cloud metadata endpoints (169.254.169.254) are rejected unconditionally.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[#6E829B]">Authorized Outbound Hosts:</span>
                  {healthData.integrations?.githubApi?.hostsAllowed?.map((host: string) => (
                    <span
                      key={host}
                      className="px-2.5 py-1 rounded-lg bg-[#071F20]/5 border border-[#071F20]/10 text-[#071F20] font-bold text-[11px]"
                    >
                      {host}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
