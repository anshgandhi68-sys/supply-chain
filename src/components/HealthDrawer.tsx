'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Server,
  Database,
  Shield,
  HardDrive,
} from 'lucide-react';

interface HealthData {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  checksDurationMs: number;
  integrations: {
    githubApi: {
      status: string;
      endpoint: string;
      hostsAllowed: string[];
    };
    osvDatabase: {
      status: string;
      endpoint: string;
      latencyMs: number;
    };
  };
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
}

interface HealthDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HealthDrawer: React.FC<HealthDrawerProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health');
      if (!res.ok) {
        throw new Error(`Health check returned status ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatUptime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m ${seconds % 60}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md h-full bg-[#F4F0E6] border-l border-[#071F20]/15 p-6 flex flex-col shadow-2xl overflow-y-auto text-[#071F20]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#071F20]/10 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white border border-[#071F20]/15 flex items-center justify-center text-[#D47A4A] shadow-sm">
              <Activity className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono text-[#071F20] uppercase tracking-wider">
                System Telemetry & Health
              </h3>
              <p className="text-[11px] text-[#6E829B] font-mono">
                Real-time API latency & memory metrics
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="p-1.5 rounded-lg text-[#476363] hover:text-[#071F20] bg-white border border-[#071F20]/15 transition-all disabled:opacity-50 shadow-sm cursor-pointer"
              title="Refresh Health Status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#476363] hover:text-[#071F20] bg-white border border-[#071F20]/15 transition-all shadow-sm cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading && !data ? (
          <div className="flex-grow flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[#D47A4A] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="my-auto p-4 rounded-xl bg-[#FF647C]/15 border border-[#FF647C]/30 text-[#962A35] text-xs font-mono">
            {error}
          </div>
        ) : data ? (
          <div className="space-y-5 py-6 font-mono text-xs">
            {/* Status Summary Banner */}
            <div className="p-4 rounded-xl bg-white/90 border border-[#071F20]/10 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#6E829B]">Operational Status:</span>
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-[#123B3A] bg-[#48D9C1]/20 border border-[#48D9C1]/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#123B3A] animate-pulse" />
                  <span>{data.status.toUpperCase()}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#6E829B]">Platform Uptime:</span>
                <span className="text-[#071F20] font-semibold">{formatUptime(data.uptimeSeconds)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#6E829B]">Diagnostics Probe:</span>
                <span className="text-[#D47A4A] font-bold">{data.checksDurationMs}ms</span>
              </div>
            </div>

            {/* OSV Database Telemetry */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-[#071F20]">
                <Database className="w-4 h-4 text-[#D47A4A]" />
                <h4 className="font-bold uppercase tracking-wider text-[11px]">Google OSV Database Link</h4>
              </div>
              <div className="p-3.5 rounded-xl bg-white/90 border border-[#071F20]/10 space-y-2 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[#6E829B]">Endpoint:</span>
                  <span className="text-[#071F20] font-semibold text-[10px] truncate max-w-[200px]">
                    {data.integrations.osvDatabase.endpoint}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#6E829B]">API Latency:</span>
                  <span className={`font-bold ${data.integrations.osvDatabase.latencyMs < 1000 ? 'text-[#123B3A]' : 'text-[#D47A4A]'}`}>
                    {data.integrations.osvDatabase.latencyMs} ms
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#6E829B]">Reachability:</span>
                  <span className="text-[#123B3A] uppercase font-bold">
                    {data.integrations.osvDatabase.status}
                  </span>
                </div>
              </div>
            </div>

            {/* GitHub API Security & Hostname Validation */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-[#071F20]">
                <Shield className="w-4 h-4 text-[#123B3A]" />
                <h4 className="font-bold uppercase tracking-wider text-[11px]">SSRF Protection & Host Whitelist</h4>
              </div>
              <div className="p-3.5 rounded-xl bg-white/90 border border-[#071F20]/10 space-y-2 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[#6E829B]">Status:</span>
                  <span className="text-[#071F20] font-semibold">
                    {data.integrations.githubApi.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-[#6E829B] text-[10px] pt-1 border-t border-[#071F20]/10">
                  Allowed Target Hosts:
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {data.integrations.githubApi.hostsAllowed.map((host) => (
                      <span key={host} className="px-2 py-0.5 rounded bg-[#071F20]/5 text-[#071F20] border border-[#071F20]/10 text-[10px] font-semibold">
                        {host}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Server Memory Allocations */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-[#071F20]">
                <HardDrive className="w-4 h-4 text-[#D47A4A]" />
                <h4 className="font-bold uppercase tracking-wider text-[11px]">Server Node Memory Allocation</h4>
              </div>
              <div className="p-3.5 rounded-xl bg-white/90 border border-[#071F20]/10 space-y-2 shadow-sm">
                <div className="flex justify-between">
                  <span className="text-[#6E829B]">Heap Used:</span>
                  <span className="text-[#071F20] font-semibold">{data.memory.heapUsedMb} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6E829B]">Heap Total:</span>
                  <span className="text-[#071F20] font-semibold">{data.memory.heapTotalMb} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6E829B]">Resident Set Size (RSS):</span>
                  <span className="text-[#D47A4A] font-bold">{data.memory.rssMb} MB</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Footer info */}
        <div className="mt-auto pt-4 border-t border-[#071F20]/10 text-[10px] font-mono text-[#6E829B] text-center">
          Zero Code Execution Security Sandbox &bull; Verified Production Telemetry
        </div>
      </div>
    </div>
  );
};
