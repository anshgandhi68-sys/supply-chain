'use client';

import React, { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useScan } from '@/lib/context/ScanContext';
import { DependencyGraphNode, DependencyGraphEdge, PlausibleAttackPath, Finding } from '@/lib/types';
import { Sentinel3DScene } from '@/components/Sentinel3DScene';
import {
  Network,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  Package,
  FileCode,
  ArrowRight,
  ExternalLink,
  GitBranch,
  Wrench,
  Eye,
  Radio,
  CheckCircle2,
} from 'lucide-react';

export default function DependencyAttackGraphPage() {
  const { scanResult, isLoading } = useScan();

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [depthFilter, setDepthFilter] = useState<string>('all');
  const [showAttackPathsOnly, setShowAttackPathsOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const graph = scanResult?.dependencyGraph;

  // Filter nodes
  const filteredNodes = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.filter((node) => {
      if (node.isRoot) return true; // always show root
      if (searchQuery.trim() && !node.name.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
        return false;
      }
      if (severityFilter === 'vulnerable' && !node.hasVulnerability) return false;
      if (severityFilter === 'critical' && node.highestSeverity !== 'critical') return false;
      if (severityFilter === 'high' && node.highestSeverity !== 'critical' && node.highestSeverity !== 'high') return false;
      if (depthFilter === 'direct' && !node.isDirect) return false;
      if (depthFilter === 'transitive' && node.isDirect) return false;
      if (showAttackPathsOnly && !node.inAttackPath) return false;
      return true;
    });
  }, [graph, searchQuery, severityFilter, depthFilter, showAttackPathsOnly]);

  const visibleNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  // Filter edges to only connect visible nodes
  const filteredEdges = useMemo(() => {
    if (!graph) return [];
    return graph.edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
  }, [graph, visibleNodeIds]);

  const selectedNode = useMemo(() => {
    if (!graph || !selectedNodeId) return null;
    return graph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [graph, selectedNodeId]);

  const selectedAttackPath = useMemo(() => {
    if (!graph || !selectedNode) return null;
    return graph.attackPaths.find((p) => p.targetPackage === selectedNode.name) || null;
  }, [graph, selectedNode]);

  // Layout node coordinates (Tree-radial layout)
  const nodePositions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    if (!filteredNodes.length) return pos;

    const rootNode = filteredNodes.find((n) => n.isRoot);
    const directNodes = filteredNodes.filter((n) => !n.isRoot && n.isDirect);
    const transitiveNodes = filteredNodes.filter((n) => !n.isRoot && !n.isDirect);

    // Root at Center-Top
    const width = 850;
    const height = 550;
    const centerX = width / 2;

    if (rootNode) {
      pos.set(rootNode.id, { x: centerX, y: 70 });
    }

    // Direct dependencies on Tier 2
    const directCount = directNodes.length;
    directNodes.forEach((node, idx) => {
      const step = width / (directCount + 1);
      const x = step * (idx + 1);
      const y = 220;
      pos.set(node.id, { x, y });
    });

    // Transitive dependencies on Tier 3 & Tier 4
    const transCount = transitiveNodes.length;
    transitiveNodes.forEach((node, idx) => {
      const step = width / (transCount + 1);
      const x = step * (idx + 1);
      const y = 390 + (idx % 2 === 0 ? 0 : 50);
      pos.set(node.id, { x, y });
    });

    return pos;
  }, [filteredNodes]);

  if (isLoading && !scanResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-10 h-10 border-3 border-[#48D9C1]/30 border-t-[#48D9C1] rounded-full animate-spin" />
        <span className="text-xs font-mono text-[#9AAEC4]">Constructing Dependency Attack Graph...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[rgba(159,190,220,0.16)] pb-5">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#111F33] border border-[#48D9C1]/30 text-xs font-mono text-[#48D9C1] mb-2">
            <Network className="w-3.5 h-3.5" />
            <span>Interactive Spatial Attack Surface</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F1F6FC] tracking-tight">
            Dependency Attack Graph
          </h1>
          <p className="text-xs sm:text-sm text-[#9AAEC4] font-mono mt-1">
            Visual topology distinguishing application root, direct dependencies, transitive packages, and evidence-supported attack paths.
          </p>
        </div>

        {/* View Mode Toggle: 2D Workstation Graph vs 3D Orbit */}
        <div className="inline-flex p-1 rounded-xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] font-mono text-xs">
          <button
            onClick={() => setViewMode('2d')}
            className={`px-4 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              viewMode === '2d'
                ? 'bg-[#17283C] text-[#48D9C1] border border-[#48D9C1]/30 shadow-sm'
                : 'text-[#9AAEC4] hover:text-[#F1F6FC]'
            }`}
          >
            2D Lineage Graph
          </button>
          <button
            onClick={() => setViewMode('3d')}
            className={`px-4 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              viewMode === '3d'
                ? 'bg-[#17283C] text-[#48D9C1] border border-[#48D9C1]/30 shadow-sm'
                : 'text-[#9AAEC4] hover:text-[#F1F6FC]'
            }`}
          >
            3D Spatial Orbit
          </button>
        </div>
      </div>

      {/* Main Graph Container */}
      {viewMode === '3d' ? (
        <div className="rounded-2xl p-6 bg-[#111F33] border border-[rgba(159,190,220,0.16)] shadow-xl relative min-h-[550px] overflow-hidden">
          <div className="flex items-center justify-between text-xs font-mono text-[#9AAEC4] border-b border-[rgba(159,190,220,0.14)] pb-3 mb-4">
            <span>Repository: {scanResult?.repository.fullName}</span>
            <span className="text-[#48D9C1]">3D Orbital Raycast Active (Click & Drag to Rotate)</span>
          </div>
          <Sentinel3DScene result={scanResult} onSelectFinding={() => {}} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: 2D SVG Graph Canvas (2 Columns) */}
          <div className="lg:col-span-2 rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] shadow-xl p-5 flex flex-col justify-between space-y-4">
            {/* Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono border-b border-[rgba(159,190,220,0.12)] pb-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#6E829B]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter package name..."
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] focus:outline-none focus:border-[#48D9C1] w-48"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] focus:outline-none focus:border-[#48D9C1] cursor-pointer"
                >
                  <option value="all">All Severities</option>
                  <option value="vulnerable">Vulnerable Only</option>
                  <option value="critical">Critical Only</option>
                  <option value="high">High +</option>
                </select>

                <select
                  value={depthFilter}
                  onChange={(e) => setDepthFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#07111F] border border-[rgba(159,190,220,0.2)] text-[#F1F6FC] focus:outline-none focus:border-[#48D9C1] cursor-pointer"
                >
                  <option value="all">All Depths</option>
                  <option value="direct">Direct Deps</option>
                  <option value="transitive">Transitive Deps</option>
                </select>

                {/* Attack paths switch */}
                <button
                  onClick={() => setShowAttackPathsOnly(!showAttackPathsOnly)}
                  className={`px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                    showAttackPathsOnly
                      ? 'bg-[#FF647C]/20 border-[#FF647C] text-[#FF647C]'
                      : 'bg-[#07111F] border-[rgba(159,190,220,0.2)] text-[#9AAEC4]'
                  }`}
                >
                  Attack Paths Only
                </button>

                {/* Zoom Controls */}
                <div className="flex items-center space-x-1 pl-2 border-l border-[rgba(159,190,220,0.2)]">
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.1))}
                    className="p-1.5 rounded bg-[#07111F] text-[#9AAEC4] hover:text-[#F1F6FC] cursor-pointer"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.1))}
                    className="p-1.5 rounded bg-[#07111F] text-[#9AAEC4] hover:text-[#F1F6FC] cursor-pointer"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setZoomLevel(1);
                      setSearchQuery('');
                      setSeverityFilter('all');
                      setDepthFilter('all');
                      setShowAttackPathsOnly(false);
                      setSelectedNodeId(null);
                    }}
                    className="p-1.5 rounded bg-[#07111F] text-[#9AAEC4] hover:text-[#F1F6FC] cursor-pointer"
                    title="Reset view"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* SVG Graph Viewport */}
            <div className="relative w-full h-[520px] bg-[#07111F] rounded-xl border border-[rgba(159,190,220,0.12)] overflow-hidden flex items-center justify-center">
              <svg
                viewBox="0 0 850 550"
                className="w-full h-full select-none"
                style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
              >
                <defs>
                  <linearGradient id="edge-attack-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#48D9C1" />
                    <stop offset="100%" stopColor="#FF647C" />
                  </linearGradient>
                </defs>

                {/* Render Edges */}
                {filteredEdges.map((edge) => {
                  const srcPos = nodePositions.get(edge.source);
                  const tgtPos = nodePositions.get(edge.target);
                  if (!srcPos || !tgtPos) return null;

                  const isAttack = edge.isInAttackPath;

                  return (
                    <g key={edge.id}>
                      <line
                        x1={srcPos.x}
                        y1={srcPos.y}
                        x2={tgtPos.x}
                        y2={tgtPos.y}
                        stroke={isAttack ? 'url(#edge-attack-grad)' : 'rgba(159, 190, 220, 0.22)'}
                        strokeWidth={isAttack ? 2.5 : 1.2}
                        strokeDasharray={edge.isTransitive && !isAttack ? '4 3' : undefined}
                      />
                    </g>
                  );
                })}

                {/* Render Nodes */}
                {filteredNodes.map((node) => {
                  const pos = nodePositions.get(node.id);
                  if (!pos) return null;

                  const isSelected = selectedNodeId === node.id;
                  const isVuln = node.hasVulnerability;
                  const isRoot = node.isRoot;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      onClick={() => setSelectedNodeId(node.id)}
                      className="cursor-pointer group"
                    >
                      {/* Pulse halo if vulnerable */}
                      {isVuln && (
                        <circle
                          r="26"
                          fill="none"
                          stroke={node.highestSeverity === 'critical' ? '#FF647C' : '#FFC36B'}
                          strokeWidth="1.5"
                          opacity="0.4"
                          className="animate-ping"
                        />
                      )}

                      {/* Main Node Shape */}
                      {isRoot ? (
                        <rect
                          x="-45"
                          y="-20"
                          width="90"
                          height="40"
                          rx="8"
                          fill="#17283C"
                          stroke={isSelected ? '#48D9C1' : 'rgba(72, 217, 193, 0.5)'}
                          strokeWidth={isSelected ? 3 : 1.5}
                        />
                      ) : (
                        <circle
                          r={isVuln ? 18 : 14}
                          fill={
                            isVuln
                              ? node.highestSeverity === 'critical'
                                ? '#3D1520'
                                : '#382813'
                              : '#17283C'
                          }
                          stroke={
                            isSelected
                              ? '#48D9C1'
                              : isVuln
                              ? node.highestSeverity === 'critical'
                                ? '#FF647C'
                                : '#FFC36B'
                              : node.isDirect
                              ? '#65BFFF'
                              : 'rgba(159, 190, 220, 0.4)'
                          }
                          strokeWidth={isSelected ? 3 : isVuln ? 2 : 1.5}
                        />
                      )}

                      {/* Icon / Label inside Node */}
                      {isRoot ? (
                        <text
                          textAnchor="middle"
                          dy="4"
                          fill="#48D9C1"
                          fontSize="10"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          APP ROOT
                        </text>
                      ) : (
                        <text
                          textAnchor="middle"
                          dy="3"
                          fill={isVuln ? (node.highestSeverity === 'critical' ? '#FF647C' : '#FFC36B') : '#F1F6FC'}
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {isVuln ? '!' : node.isDirect ? 'D' : 'T'}
                        </text>
                      )}

                      {/* Package Name Label Below */}
                      <text
                        textAnchor="middle"
                        y={isRoot ? 32 : 28}
                        fill={isSelected ? '#48D9C1' : '#F1F6FC'}
                        fontSize="10"
                        fontFamily="monospace"
                        fontWeight={isSelected ? 'bold' : 'normal'}
                      >
                        {node.name.length > 18 ? `${node.name.slice(0, 16)}...` : node.name}
                      </text>

                      {/* Version Label */}
                      <text
                        textAnchor="middle"
                        y={isRoot ? 44 : 40}
                        fill="#6E829B"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {node.version}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Legend overlay */}
              <div className="absolute bottom-3 left-3 p-2.5 rounded-lg bg-[#0B1728]/90 border border-[rgba(159,190,220,0.16)] flex flex-wrap items-center gap-3 text-[10px] font-mono">
                <span className="flex items-center text-[#48D9C1]">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#17283C] border border-[#48D9C1] mr-1.5" />
                  Application Root
                </span>
                <span className="flex items-center text-[#65BFFF]">
                  <span className="w-2.5 h-2.5 rounded-full border border-[#65BFFF] mr-1.5" />
                  Direct Dep (D)
                </span>
                <span className="flex items-center text-[#9AAEC4]">
                  <span className="w-2.5 h-2.5 rounded-full border border-[#9AAEC4] mr-1.5" />
                  Transitive Dep (T)
                </span>
                <span className="flex items-center text-[#FF647C]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF647C] mr-1.5" />
                  Vulnerable Node
                </span>
              </div>
            </div>
          </div>

          {/* Right: Detailed Node Inspector Evidence Panel (1 Column) */}
          <div className="rounded-2xl bg-[#111F33] border border-[rgba(159,190,220,0.16)] p-5 flex flex-col justify-between font-mono text-xs space-y-4 shadow-xl">
            {selectedNode ? (
              <div className="space-y-4">
                <div className="border-b border-[rgba(159,190,220,0.14)] pb-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        selectedNode.isRoot
                          ? 'bg-[#48D9C1]/20 text-[#48D9C1] border border-[#48D9C1]/40'
                          : selectedNode.hasVulnerability
                          ? 'bg-[#FF647C]/20 text-[#FF647C] border border-[#FF647C]/40'
                          : 'bg-[#65BFFF]/20 text-[#65BFFF] border border-[#65BFFF]/40'
                      }`}
                    >
                      {selectedNode.isRoot
                        ? 'ROOT APPLICATION COMPONENT'
                        : selectedNode.isDirect
                        ? 'DIRECT DEPENDENCY'
                        : 'TRANSITIVE DEPENDENCY'}
                    </span>
                    <button
                      onClick={() => setSelectedNodeId(null)}
                      className="text-[#6E829B] hover:text-[#F1F6FC]"
                    >
                      Close
                    </button>
                  </div>
                  <h3 className="text-base font-bold text-[#F1F6FC] mt-2">
                    {selectedNode.name}
                  </h3>
                  <span className="text-[#6E829B] text-[11px]">
                    v{selectedNode.version} &bull; Scope: {selectedNode.scope}
                  </span>
                </div>

                {/* Evidence & Metrics */}
                <div className="grid grid-cols-2 gap-2 text-[11px] p-3 rounded-lg bg-[#0B1728] border border-[rgba(159,190,220,0.12)]">
                  <div>
                    <span className="text-[#6E829B] block">Blast Radius:</span>
                    <span className="text-[#FFC36B] font-bold">{selectedNode.blastRadius} dependents</span>
                  </div>
                  <div>
                    <span className="text-[#6E829B] block">Manifest:</span>
                    <span className="text-[#F1F6FC] truncate block">{selectedNode.manifestPath}</span>
                  </div>
                  <div>
                    <span className="text-[#6E829B] block">Advisories:</span>
                    <span className="text-[#FF647C] font-bold">{selectedNode.advisoryCount} issues</span>
                  </div>
                  <div>
                    <span className="text-[#6E829B] block">Attack Path:</span>
                    <span className={selectedNode.inAttackPath ? 'text-[#FF647C] font-bold' : 'text-[#48D9C1]'}>
                      {selectedNode.inAttackPath ? 'Reachable Surface' : 'Dormant'}
                    </span>
                  </div>
                </div>

                {/* Plausible Attack Path Explanation */}
                {selectedAttackPath ? (
                  <div className="p-3.5 rounded-xl bg-[#0B1728] border border-[#FF647C]/30 space-y-2">
                    <div className="flex items-center space-x-1.5 text-[#FF647C] font-bold">
                      <AlertOctagon className="w-3.5 h-3.5" />
                      <span>Plausible Attack Path Traced</span>
                    </div>
                    <div className="text-[11px] text-[#9AAEC4]">
                      Lineage: <code className="text-[#65BFFF]">{selectedAttackPath.path.join(' -> ')}</code>
                    </div>
                    <p className="text-[11px] text-[#F1F6FC] leading-relaxed">
                      {selectedAttackPath.plausibilityRationale}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[#0B1728] border border-[rgba(159,190,220,0.12)] text-[11px] text-[#9AAEC4]">
                    {selectedNode.isRoot
                      ? 'Root application component. Direct invocation entrypoint for all declared libraries.'
                      : 'No confirmed exploitable vulnerability advisory is active for this package version.'}
                  </div>
                )}

                {/* Inbound & Outbound dependencies */}
                <div className="space-y-2 text-[11px]">
                  <div>
                    <span className="text-[#6E829B] block font-bold uppercase text-[10px]">Required By (Parents):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedNode.parents.length > 0 ? (
                        selectedNode.parents.map((p) => (
                          <span
                            key={p}
                            onClick={() => setSelectedNodeId(p)}
                            className="px-2 py-0.5 rounded bg-[#17283C] text-[#65BFFF] hover:underline cursor-pointer"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-[#6E829B]">Root project entrypoint</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[#6E829B] block font-bold uppercase text-[10px]">Requires (Children):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedNode.children.length > 0 ? (
                        selectedNode.children.map((c) => (
                          <span
                            key={c}
                            onClick={() => setSelectedNodeId(c)}
                            className="px-2 py-0.5 rounded bg-[#17283C] text-[#9AAEC4] hover:text-[#F1F6FC] cursor-pointer"
                          >
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-[#6E829B]">Leaf node (0 sub-dependencies)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-[rgba(159,190,220,0.12)] space-y-2">
                  {selectedNode.findings.length > 0 && (
                    <Link
                      href={`/investigate?finding=${encodeURIComponent(selectedNode.findings[0].id)}`}
                      className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-[#17283C] hover:bg-[#1D314A] text-[#65BFFF] font-bold border border-[rgba(159,190,220,0.2)] transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Evidence in Workspace</span>
                    </Link>
                  )}

                  {selectedNode.findings.some((f) => f.fixedVersion) && (
                    <Link
                      href={`/remediation?pkg=${encodeURIComponent(selectedNode.name)}`}
                      className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-[#48D9C1] hover:bg-[#3ec4ad] text-[#07111F] font-bold shadow-md transition-colors cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Remediate Package</span>
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-[#6E829B]">
                <Network className="w-8 h-8 text-[#48D9C1]/40" />
                <p className="text-xs">
                  Click any node in the graph to inspect dependency relationships, evidence, and attack path rationales.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
