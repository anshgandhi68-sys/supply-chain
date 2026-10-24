'use client';

import React, { useState, useEffect } from 'react';
import { EditorialNav } from '@/components/EditorialNav';
import { Sentinel3DScene } from '@/components/Sentinel3DScene';
import { EvidenceGraph } from '@/components/EvidenceGraph';
import { ScanResult, Finding } from '@/lib/types';
import {
  Radio,
  Layers,
  Sparkles,
  GitBranch,
  Shield,
  FileCode,
  Package,
  Info,
} from 'lucide-react';

export default function TopologyPage() {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch default demo scan data for the topology view
    const loadData = async () => {
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl: 'demo', forceDemo: true }),
        });
        const data = await res.json();
        setScanResult(data);
      } catch (err) {
        console.error('Failed to load topology data', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  return (
    <div className="relative min-h-screen bg-[#DDE8DD] text-[#071F20] font-sans selection:bg-[#D47A4A] selection:text-white pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <EditorialNav />

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#071F20]/15 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#071F20]/5 border border-[#071F20]/10 text-xs font-mono font-medium text-[#D47A4A] mb-2">
              <Radio className="w-3.5 h-3.5" />
              <span>Spatial Dependency Network</span>
            </div>
            <h1 className="text-[clamp(28px,3.5vw,46px)] font-bold tracking-[-0.03em] leading-tight text-[#071F20]">
              Dependency Lineage Explorer
            </h1>
            <p className="text-[#476363] text-xs font-mono mt-1">
              Interactive WebGL spatial orbit & direct-to-transitive component graph.
            </p>
          </div>

          {/* Toggle between 3D Spatial Orbit & 2D Lineage */}
          <div className="inline-flex p-1 rounded-xl bg-white/70 border border-[#071F20]/15 shadow-sm">
            <button
              onClick={() => setViewMode('3d')}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-[#071F20] text-white shadow-sm'
                  : 'text-[#071F20] hover:bg-black/5'
              }`}
            >
              3D Spatial Orbit
            </button>
            <button
              onClick={() => setViewMode('2d')}
              className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                viewMode === '2d'
                  ? 'bg-[#071F20] text-white shadow-sm'
                  : 'text-[#071F20] hover:bg-black/5'
              }`}
            >
              2D Lineage Tree
            </button>
          </div>
        </div>

        {/* Viewport Canvas Container */}
        <div className="rounded-2xl border border-[#071F20]/15 bg-[#123B3A] text-white p-6 shadow-xl relative min-h-[550px] overflow-hidden flex flex-col justify-between">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center flex-grow py-32 space-y-4">
              <div className="w-8 h-8 border-3 border-[#D47A4A]/30 border-t-[#D47A4A] rounded-full animate-spin" />
              <span className="text-xs font-mono text-[#DDE8DDB0]">
                Constructing Component Dependency Topology...
              </span>
            </div>
          ) : scanResult ? (
            viewMode === '3d' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-mono text-[#DDE8DDB0] border-b border-white/10 pb-3">
                  <span>Repository: {scanResult.repository.owner}/{scanResult.repository.repo}</span>
                  <span className="text-[#D47A4A]">3D Orbital Raycast Active (Hover nodes for HUD)</span>
                </div>
                <Sentinel3DScene
                  result={scanResult}
                  onSelectFinding={(f) => setSelectedFinding(f)}
                />
              </div>
            ) : (
              <EvidenceGraph
                result={scanResult}
                onSelectFinding={(f) => setSelectedFinding(f)}
              />
            )
          ) : (
            <div className="text-center py-20 text-xs text-[#DDE8DDB0]">
              No topology data available. Please run a scan from the main dashboard.
            </div>
          )}

          {/* Selected Node Inspector Footer */}
          {selectedFinding && (
            <div className="mt-4 p-4 rounded-xl bg-[#071F20] border border-[#D47A4A]/40 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in shadow-lg">
              <div>
                <span className="text-[#D47A4A] font-bold block">{selectedFinding.title}</span>
                <span className="text-[#DDE8DDB0]">File: {selectedFinding.filePath} &bull; Severity: {selectedFinding.severity}</span>
              </div>
              <button
                onClick={() => setSelectedFinding(null)}
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
