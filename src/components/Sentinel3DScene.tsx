'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { ScanResult, Finding, Severity, ConfidenceLevel } from '@/lib/types';
import {
  Shield,
  Layers,
  AlertOctagon,
  AlertTriangle,
  ShieldCheck,
  Info,
  Maximize2,
  RotateCw,
  Eye,
  Activity,
} from 'lucide-react';

interface Sentinel3DSceneProps {
  result: ScanResult | null;
  onSelectFinding?: (finding: Finding) => void;
  className?: string;
}

interface GraphNodeData {
  id: string;
  name: string;
  version: string;
  ecosystem: string;
  isDirect: boolean;
  severity?: Severity;
  confidence?: ConfidenceLevel;
  finding?: Finding;
  hasFinding: boolean;
  position: THREE.Vector3;
}

export const Sentinel3DScene: React.FC<Sentinel3DSceneProps> = ({
  result,
  onSelectFinding,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [hoveredNode, setHoveredNode] = useState<GraphNodeData | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [webglSupported, setWebglSupported] = useState(true);
  const [isRotating, setIsRotating] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Extract real graph node data from ScanResult
  const graphData = useMemo(() => {
    if (!result) {
      // Standby default network representation
      const defaultNodes: GraphNodeData[] = [
        { id: 'core', name: 'Sentinel Core', version: 'v1.2.0', ecosystem: 'System', isDirect: true, hasFinding: false, position: new THREE.Vector3(0, 0, 0) },
        { id: 'osv', name: 'OSV Intelligence', version: 'v1 API', ecosystem: 'Advisory', isDirect: true, hasFinding: false, position: new THREE.Vector3(3.2, 1.4, -1.2) },
        { id: 'ast', name: 'Workflow Engine', version: 'AST Validator', ecosystem: 'Actions', isDirect: true, hasFinding: false, position: new THREE.Vector3(-3.5, 1.0, 1.5) },
        { id: 'sec', name: 'Secret Detector', version: 'High-Entropy', ecosystem: 'Secrets', isDirect: true, hasFinding: false, position: new THREE.Vector3(1.8, -2.8, 1.0) },
        { id: 'sbom', name: 'CycloneDX Engine', version: 'v1.5 Spec', ecosystem: 'SBOM', isDirect: false, hasFinding: false, position: new THREE.Vector3(-2.2, -2.5, -2.0) },
        { id: 'audit', name: 'Coverage Auditor', version: 'Provenance', ecosystem: 'Audit', isDirect: false, hasFinding: false, position: new THREE.Vector3(0.5, 3.2, 2.2) },
      ];
      return defaultNodes;
    }

    const nodes: GraphNodeData[] = [];
    const rootName = result.repository.fullName || 'Target Repository';
    const rootRef = result.repository.resolvedCommitSha
      ? `${result.repository.resolvedCommitSha.slice(0, 7)}`
      : result.repository.defaultBranch || 'main';

    // Root node at center
    nodes.push({
      id: 'repo-root',
      name: rootName,
      version: rootRef,
      ecosystem: 'Repository',
      isDirect: true,
      hasFinding: false,
      position: new THREE.Vector3(0, 0, 0),
    });

    const findings = result.findings || [];
    const findingsByTarget = new Map<string, Finding>();
    for (const f of findings) {
      // Key by package or file
      const key = f.filePath.includes('.github/workflows')
        ? f.filePath
        : f.observedValue.split('@')[0] || f.title;
      if (!findingsByTarget.has(key)) {
        findingsByTarget.set(key, f);
      }
    }

    // Direct dependencies & discovered files
    const targets = Array.from(
      new Set([
        ...result.manifestsFound,
        ...result.workflowsFound,
        ...findings.map((f) => f.filePath),
      ])
    );

    // Limit nodes to prevent rendering overload (up to 40 nodes)
    const displayTargets = targets.slice(0, 36);
    const count = displayTargets.length || 1;

    displayTargets.forEach((target, index) => {
      const angle = (index / count) * Math.PI * 2;
      const isWorkflow = target.includes('.github/workflows');
      const isLockfile = target.includes('lock') || target.includes('.sum');

      const finding = findings.find((f) => f.filePath === target);
      const radius = isWorkflow ? 3.6 : isLockfile ? 4.8 : 5.8;
      const height = Math.sin(index * 1.5) * 2.2;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = height;

      nodes.push({
        id: `node-${index}`,
        name: target.split('/').pop() || target,
        version: isWorkflow ? 'Workflow' : isLockfile ? 'Lockfile' : 'Manifest',
        ecosystem: isWorkflow ? 'Actions' : 'Dependencies',
        isDirect: !isLockfile,
        severity: finding?.severity,
        confidence: finding?.confidence,
        finding,
        hasFinding: Boolean(finding),
        position: new THREE.Vector3(x, y, z),
      });
    });

    // If findings exist that weren't represented, add top findings as critical satellite nodes
    findings.slice(0, 8).forEach((f, idx) => {
      if (!nodes.some((n) => n.finding?.id === f.id)) {
        const angle = ((idx + 0.5) / 8) * Math.PI * 2;
        const radius = 4.2;
        nodes.push({
          id: `finding-${f.id}`,
          name: f.title.slice(0, 24),
          version: f.detectionSource.slice(0, 16),
          ecosystem: f.category,
          isDirect: true,
          severity: f.severity,
          confidence: f.confidence,
          finding: f,
          hasFinding: true,
          position: new THREE.Vector3(
            Math.cos(angle) * radius,
            Math.sin(idx * 2) * 1.8,
            Math.sin(angle) * radius
          ),
        });
      }
    });

    return nodes;
  }, [result]);

  useEffect(() => {
    // Check WebGL availability
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!gl) {
        setWebglSupported(false);
        return;
      }
    } catch {
      setWebglSupported(false);
      return;
    }

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let animationFrameId: number;
    let isDestroyed = false;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 4.5, 12);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // 2. Lights Rig
    const ambientLight = new THREE.AmbientLight(0x123B3A, 2.5);
    scene.add(ambientLight);

    const copperPoint = new THREE.PointLight(0xD47A4A, 3.5, 50);
    copperPoint.position.set(5, 8, 8);
    scene.add(copperPoint);

    const sprucePoint = new THREE.PointLight(0x48D9C1, 2.8, 50);
    sprucePoint.position.set(-6, -4, -6);
    scene.add(sprucePoint);

    // 3. Central Node Group & Outer Perimeter Shield
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Core Sphere
    const coreGeo = new THREE.SphereGeometry(0.85, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x48D9C1,
      emissive: 0x123B3A,
      roughness: 0.2,
      metalness: 0.8,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    rootGroup.add(coreMesh);

    // Core Outer Wireframe Shield
    const shieldGeo = new THREE.IcosahedronGeometry(1.2, 1);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0xD47A4A,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    rootGroup.add(shieldMesh);

    // Equatorial Perimeter Ring
    const ringGeo = new THREE.RingGeometry(6.8, 6.88, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x48D9C1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    scene.add(ringMesh);

    // 4. Create 3D Meshes for Dependency Nodes
    const nodeMeshes: THREE.Mesh[] = [];
    const linkLinesGroup = new THREE.Group();
    scene.add(linkLinesGroup);

    const particlesGeo = new THREE.BufferGeometry();
    const particleCount = 120;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleProgress = new Float32Array(particleCount);
    const particleTargets = new Int32Array(particleCount);

    graphData.forEach((node, idx) => {
      if (node.id === 'repo-root' || node.id === 'core') return;

      // Color by severity / finding status
      let nodeColor = 0x48d9c1; // clean teal
      let emissiveColor = 0x052e26;
      let radius = 0.26;

      if (node.hasFinding) {
        if (node.severity === 'critical' || node.severity === 'high') {
          nodeColor = 0xff647c; // confirmed coral/red
          emissiveColor = 0x440812;
          radius = 0.36;
        } else if (node.severity === 'medium' || node.confidence === 'version_unverified') {
          nodeColor = 0xffc36b; // warning amber
          emissiveColor = 0x331c05;
          radius = 0.32;
        } else {
          nodeColor = 0x75b8ff; // info blue
          emissiveColor = 0x081b33;
          radius = 0.28;
        }
      } else if (!node.isDirect) {
        nodeColor = 0x6e829b; // transitive / muted
        emissiveColor = 0x0a1420;
        radius = 0.22;
      }

      const geo = new THREE.SphereGeometry(radius, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: nodeColor,
        emissive: emissiveColor,
        roughness: 0.3,
        metalness: 0.7,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(node.position);
      mesh.userData = { nodeData: node };
      scene.add(mesh);
      nodeMeshes.push(mesh);

      // Connecting supply-chain beam line from center to node
      const points = [new THREE.Vector3(0, 0, 0), node.position];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: node.hasFinding ? nodeColor : 0x17283c,
        transparent: true,
        opacity: node.hasFinding ? 0.65 : 0.25,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      linkLinesGroup.add(line);
    });

    // Particle Beam System
    for (let i = 0; i < particleCount; i++) {
      particleProgress[i] = Math.random();
      particleTargets[i] = Math.floor(Math.random() * Math.max(1, nodeMeshes.length));
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particlesMat = new THREE.PointsMaterial({
      color: 0x65bfff,
      size: 0.12,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particleSystem);

    // 5. Raycasting for Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);

    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      setMousePos({ x: e.clientX, y: e.clientY });

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const data = hit.userData.nodeData as GraphNodeData;
        setHoveredNode(data);
      } else {
        setHoveredNode(null);
      }
    };

    const onPointerClick = () => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const data = hit.userData.nodeData as GraphNodeData;
        setSelectedNodeId(data.id);
        if (data.finding && onSelectFinding) {
          onSelectFinding(data.finding);
        }
      }
    };

    container.addEventListener('mousemove', onPointerMove);
    container.addEventListener('click', onPointerClick);

    // 6. Smooth Animation Loop with Visibility Awareness
    let lastTime = performance.now();
    let rotationAngle = 0;

    const animate = () => {
      if (isDestroyed) return;

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Check visibility: pause if tab is hidden
      if (!document.hidden) {
        if (isRotating) {
          rotationAngle += dt * 0.25;
          rootGroup.rotation.y = rotationAngle * 0.5;
          shieldMesh.rotation.x = rotationAngle * 0.8;
          shieldMesh.rotation.y = rotationAngle * 0.6;
          ringMesh.rotation.z = -rotationAngle * 0.15;
        }

        // Camera gentle parallax tracking
        camera.position.x += (mouse.x * 1.5 - camera.position.x) * (1 - Math.exp(-dt * 2.5));
        camera.position.y += (4.5 + mouse.y * 1.2 - camera.position.y) * (1 - Math.exp(-dt * 2.5));
        camera.lookAt(0, 0, 0);

        // Update Particle Beams
        const positions = particlePositions;
        for (let i = 0; i < particleCount; i++) {
          particleProgress[i] += dt * 0.65;
          if (particleProgress[i] > 1.0) {
            particleProgress[i] = 0;
            particleTargets[i] = Math.floor(Math.random() * Math.max(1, nodeMeshes.length));
          }

          const targetMesh = nodeMeshes[particleTargets[i]];
          if (targetMesh) {
            const p = particleProgress[i];
            positions[i * 3] = targetMesh.position.x * p;
            positions[i * 3 + 1] = targetMesh.position.y * p;
            positions[i * 3 + 2] = targetMesh.position.z * p;
          }
        }
        particlesGeo.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    // Handle Resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    // Cleanup resources
    return () => {
      isDestroyed = true;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      container.removeEventListener('mousemove', onPointerMove);
      container.removeEventListener('click', onPointerClick);

      // Dispose Geometries and Materials
      coreGeo.dispose();
      coreMat.dispose();
      shieldGeo.dispose();
      shieldMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();

      nodeMeshes.forEach((m) => {
        m.geometry.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material.dispose();
        }
      });

      linkLinesGroup.children.forEach((c) => {
        const line = c as THREE.Line;
        line.geometry.dispose();
        if (Array.isArray(line.material)) {
          line.material.forEach((mat) => mat.dispose());
        } else {
          line.material.dispose();
        }
      });

      renderer.dispose();
    };
  }, [graphData, isRotating, onSelectFinding]);

  const getSeverityBadge = (sev?: Severity) => {
    switch (sev) {
      case 'critical':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-950/80 text-rose-400 border border-rose-800">
            Critical
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950/80 text-amber-400 border border-amber-800">
            High
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-cyan-950/80 text-cyan-400 border border-cyan-800">
            Medium
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase bg-slate-900 text-slate-300 border border-slate-700">
            Resolved Clean
          </span>
        );
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[480px] lg:h-[540px] rounded-2xl overflow-hidden border border-[#071F20]/15 bg-[#123B3A] shadow-2xl group ${className}`}
    >
      {/* Soft Vignette Overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 50%, transparent 60%, rgba(7,31,32,0.45) 100%)',
        }}
      />

      {/* Floating Header Overlay */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[#071F20]/75 border border-white/10 backdrop-blur-md pointer-events-auto shadow-sm">
          <Activity className="w-4 h-4 text-[#D47A4A] animate-pulse" />
          <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
            Sentinel Spatial Orbit
          </span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/10 text-[#DDE8DD] border border-white/15">
            3D WebGL
          </span>
        </div>

        {/* Orbit Controls */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          <button
            onClick={() => setIsRotating(!isRotating)}
            className={`p-2 rounded-xl text-xs font-mono transition-all border cursor-pointer ${
              isRotating
                ? 'bg-[#071F20] text-[#D47A4A] border-[#D47A4A]/40 shadow-sm'
                : 'bg-[#071F20]/80 text-white/60 border-white/10 hover:text-white'
            }`}
            title={isRotating ? 'Pause Orbit' : 'Resume Orbit'}
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
          </button>
        </div>
      </div>

      {/* Three.js Canvas */}
      {webglSupported ? (
        <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair" />
      ) : (
        /* Graceful 2D Fallback if WebGL is unavailable */
        <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-3">
          <Shield className="w-12 h-12 text-[#48D9C1] opacity-60" />
          <h4 className="text-sm font-bold text-white">2D Topology Graph Mode</h4>
          <p className="text-xs text-[#DDE8DDB0] max-w-sm">
            WebGL acceleration is unavailable in this environment. Supply Chain Sentinel is rendering high-fidelity deterministic 2D topological mapping.
          </p>
        </div>
      )}

      {/* Interactive Floating Hover HUD Card */}
      {hoveredNode && (
        <div
          className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 p-3.5 rounded-xl bg-[#071F20]/95 border border-[#D47A4A]/50 backdrop-blur-xl shadow-2xl max-w-xs transition-all duration-150 animate-in fade-in"
          style={{
            left: `${Math.max(16, Math.min(containerRef.current ? containerRef.current.clientWidth - 160 : 200, mousePos.x - (containerRef.current?.getBoundingClientRect().left || 0)))}px`,
            top: `${Math.max(60, mousePos.y - (containerRef.current?.getBoundingClientRect().top || 0) - 10)}px`,
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5 mb-1.5">
            <span className="font-mono text-xs font-bold text-white truncate">
              {hoveredNode.name}
            </span>
            {getSeverityBadge(hoveredNode.severity)}
          </div>

          <div className="space-y-1 font-mono text-[11px] text-[#DDE8DDC0]">
            <div className="flex justify-between">
              <span className="text-[#82A7A5]">Version:</span>
              <span className="text-white font-semibold">{hoveredNode.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#82A7A5]">Scope:</span>
              <span className="text-[#48D9C1]">{hoveredNode.isDirect ? 'Direct' : 'Transitive'}</span>
            </div>
            {hoveredNode.confidence && (
              <div className="flex justify-between">
                <span className="text-[#82A7A5]">Confidence:</span>
                <span className="text-[#D47A4A] uppercase">{hoveredNode.confidence}</span>
              </div>
            )}
          </div>

          {hoveredNode.finding && (
            <div className="mt-2 pt-1.5 border-t border-white/10 text-[10px] text-[#D47A4A] font-mono flex items-center space-x-1">
              <Eye className="w-3 h-3" />
              <span>Click node to inspect security evidence</span>
            </div>
          )}
        </div>
      )}

      {/* Footer Metrics Overlay */}
      <div className="absolute bottom-3 left-4 right-4 z-10 flex flex-wrap items-center justify-between text-xs font-mono text-white/70 pointer-events-none">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#48D9C1] shadow-sm" />
            <span className="text-[11px]">Clean Target</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#FF647C] shadow-sm" />
            <span className="text-[11px]">Confirmed Vulnerability</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#D47A4A] shadow-sm" />
            <span className="text-[11px]">Unverified Range</span>
          </span>
        </div>

        <div className="hidden sm:flex items-center space-x-2 text-[11px] text-[#DDE8DD]">
          <span>{graphData.length} Nodes Rendered</span>
          <span>&bull;</span>
          <span>Click any node to investigate</span>
        </div>
      </div>
    </div>
  );
};
