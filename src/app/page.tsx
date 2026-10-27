'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { useScan } from '@/lib/context/ScanContext';
import { validateJsonInput } from '@/lib/validation';
import { parsePackageJson, parsePackageLockJson, reconcileWithLockfile } from '@/lib/manifests/package-json';

interface ScanState {
  mode: 'demo' | 'live' | null;
  label: string;
  nodes: Record<string, { v: string; direct?: boolean; dev?: boolean; kids: string[]; unv?: boolean }>;
  findings: Array<{
    id: string;
    sev: string;
    cat: string;
    pkg: string;
    v: string;
    fix?: string;
    path: string[];
    direct: boolean;
    prod: boolean;
  }>;
  lock: boolean;
  partial: boolean;
}

const DEMO_FINDINGS = [
  { id: 'DEMO-001', sev: 'high', cat: 'dep', pkg: 'qs', v: '6.5.2', fix: '6.5.3', path: ['app', 'express@4.17.1', 'qs@6.5.2'], direct: false, prod: true },
  { id: 'DEMO-002', sev: 'high', cat: 'dep', pkg: 'lodash', v: '4.17.15', fix: '4.17.21', path: ['app', 'lodash@4.17.15'], direct: true, prod: true },
  { id: 'DEMO-003', sev: 'medium', cat: 'ci', pkg: 'actions/checkout', v: 'v4 (tag)', fix: '40-char commit SHA', path: ['.github/workflows/ci.yml'], direct: true, prod: false },
];

const DEMO_NODES = {
  express: { v: '4.17.1', direct: true, kids: ['qs'] },
  qs: { v: '6.5.2', kids: [] },
  lodash: { v: '4.17.15', direct: true, kids: [] },
};

const CHAPTERS = [
  { id: 'overview', num: '01', title: 'Overview', desc: 'Posture score, exposure metrics, and a severity-filtered findings catalog.' },
  { id: 'analyze', num: '02', title: 'Analysis', desc: 'Paste package.json and a lockfile. Syntax is validated and declared ranges stay separate from resolved versions.' },
  { id: 'graph', num: '03', title: 'Attack Graph', desc: 'Direct and transitive dependencies with modeled attack paths. A path is never proof of exploitation.' },
  { id: 'investigate', num: '04', title: 'Investigation', desc: 'Observed facts, inferred risks, and unknowns, kept apart so nothing is overstated.' },
  { id: 'remediation', num: '05', title: 'Remediation', desc: 'Reviewable diffs with a semver risk estimate. Nothing is applied automatically.' },
  { id: 'reports', num: '06', title: 'Reports', desc: 'A Markdown export that preserves the demo or live classification.' },
];

export default function SentinelWorkstationPage() {
  const { scanResult, loadDemoScan, runDirectManifestScan, isLoading } = useScan();

  // Local workstation state initialized from global ScanContext if available
  const [scan, setScan] = useState<ScanState>(() => {
    if (scanResult && scanResult.repository) {
      const nodes: ScanState['nodes'] = {};
      for (const node of scanResult.dependencyGraph?.nodes || []) {
        if (!node.isRoot) {
          nodes[node.name] = { v: node.version, direct: node.isDirect, kids: node.children };
        }
      }
      return {
        mode: scanResult.repository.fullName.includes('demo') ? 'demo' : 'live',
        label: scanResult.repository.fullName,
        nodes,
        findings: scanResult.findings.map((f) => ({
          id: f.id,
          sev: f.severity,
          cat: f.category,
          pkg: f.observedValue?.split('@')[0] || f.title,
          v: f.observedValue?.split('@')[1] || 'unknown',
          fix: f.fixedVersion,
          path: f.dependencyPath || ['app'],
          direct: f.dependencyPath ? f.dependencyPath.length <= 2 : true,
          prod: true,
        })),
        lock: !scanResult.isAnalysisIncomplete,
        partial: Boolean(scanResult.isAnalysisIncomplete),
      };
    }
    return {
      mode: 'demo',
      label: 'Controlled Risky Demo',
      nodes: DEMO_NODES,
      findings: DEMO_FINDINGS,
      lock: true,
      partial: false,
    };
  });

  // Synchronize workstation scan state whenever scanResult updates from any page
  useEffect(() => {
    if (scanResult && scanResult.repository) {
      const nodes: ScanState['nodes'] = {};
      for (const node of scanResult.dependencyGraph?.nodes || []) {
        if (!node.isRoot) {
          nodes[node.name] = { v: node.version, direct: node.isDirect, kids: node.children };
        }
      }
      setScan({
        mode: scanResult.repository.fullName.includes('demo') ? 'demo' : 'live',
        label: scanResult.repository.fullName || 'Analyzed Application',
        nodes,
        findings: scanResult.findings.map((f) => ({
          id: f.id,
          sev: f.severity,
          cat: f.category,
          pkg: f.observedValue?.split('@')[0] || f.title,
          v: f.observedValue?.split('@')[1] || 'unknown',
          fix: f.fixedVersion,
          path: f.dependencyPath || ['app'],
          direct: f.dependencyPath ? f.dependencyPath.length <= 2 : true,
          prod: true,
        })),
        lock: !scanResult.isAnalysisIncomplete,
        partial: Boolean(scanResult.isAnalysisIncomplete),
      });
      if (scanResult.findings.length > 0) {
        setSelectedFindingId(scanResult.findings[0].id);
      }
    }
  }, [scanResult]);

  const [activeDialog, setActiveDialog] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>('DEMO-001');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [graphQuery, setGraphQuery] = useState<string>('');
  const [isolateAttackPaths, setIsolateAttackPaths] = useState<boolean>(false);
  const [typewriterText, setTypewriterText] = useState<string>('');
  const [copyFeedback, setCopyFeedback] = useState<string>('Copy contact: studio@sentinel.example');
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');
  const [analyzeError, setAnalyzeError] = useState<string>('');
  const [isSubmittingScan, setIsSubmittingScan] = useState<boolean>(false);
  const [workflowOutput, setWorkflowOutput] = useState<string>('');
  const [pjContent, setPjContent] = useState<string>(`{
  "name": "vulnerable-supply-chain-demo",
  "version": "1.0.0",
  "dependencies": {
    "axios": "0.21.1",
    "lodash": "4.17.20",
    "minimist": "1.2.5"
  }
}`);
  const [lkContent, setLkContent] = useState<string>(`{
  "name": "vulnerable-supply-chain-demo",
  "version": "1.0.0",
  "lockfileVersion": 2,
  "requires": true,
  "packages": {
    "": {
      "name": "vulnerable-supply-chain-demo",
      "version": "1.0.0",
      "dependencies": {
        "axios": "0.21.1",
        "lodash": "4.17.20",
        "minimist": "1.2.5"
      }
    },
    "node_modules/axios": {
      "version": "0.21.1",
      "resolved": "https://registry.npmjs.org/axios/-/axios-0.21.1.tgz"
    },
    "node_modules/lodash": {
      "version": "4.17.20",
      "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz"
    },
    "node_modules/minimist": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/minimist/-/minimist-1.2.5.tgz"
    }
  }
}`);
  const [wfContent, setWfContent] = useState<string>('');
  const [currentChapter, setCurrentChapter] = useState<number>(0);
  const [scrollProgress, setScrollProgress] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const beamRef = useRef<HTMLDivElement | null>(null);
  const washRef = useRef<HTMLDivElement | null>(null);
  const sunRef = useRef<HTMLDivElement | null>(null);
  const lensRef = useRef<HTMLDivElement | null>(null);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<HTMLDivElement | null>(null);
  const heroContentRef = useRef<HTMLDivElement | null>(null);

  // Typewriter effect
  useEffect(() => {
    const fullText =
      'Good to have you in the workstation. We trace how a dependency reaches your application, and say plainly what we know.';
    let i = 0;
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setTypewriterText(fullText.slice(0, i));
        if (i >= fullText.length) clearInterval(interval);
      }, 35);
      return () => clearInterval(interval);
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  // Three.js WebGL background initialization
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrameId: number;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let lensMesh: THREE.Group;
    let orbMesh: THREE.Mesh;
    let panMesh: THREE.Group;
    let bgMesh: THREE.Mesh;
    let texture: THREE.Texture;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 60);
      camera.position.z = 10;

      // Environment lighting
      const dirLight = new THREE.DirectionalLight(0xffe0b0, 2.2);
      dirLight.position.set(6, 7, 6);
      scene.add(dirLight);

      // Background Plane with room-study texture
      bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xcfcfcf }));
      bgMesh.position.z = -3;
      scene.add(bgMesh);

      const textureLoader = new THREE.TextureLoader();
      texture = textureLoader.load('/room-study.jpg', () => {
        bgMesh.material = new THREE.MeshBasicMaterial({ map: texture });
        fitCamera();
        canvas.classList.add('on');
      });
      texture.colorSpace = THREE.SRGBColorSpace;

      // Physical Glass & Metal Materials
      const glassMat = (thickness: number, roughness = 0.03) =>
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          transmission: 0.95,
          roughness,
          thickness,
          ior: 1.5,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          attenuationColor: new THREE.Color(0xdfe8e4),
          attenuationDistance: 4,
        });

      const aluMat = new THREE.MeshStandardMaterial({ color: 0xc4cac6, metalness: 1, roughness: 0.22 });
      const inkMat = new THREE.MeshStandardMaterial({ color: 0x151513, roughness: 0.45, metalness: 0.2 });
      const oxMat = new THREE.MeshStandardMaterial({ color: 0xb85e3e, roughness: 0.5 });

      // 1. Lens
      lensMesh = new THREE.Group();
      const lensGlass = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), glassMat(0.9));
      lensGlass.scale.set(1, 1, 0.2);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 1.5, 16), inkMat);
      handle.rotation.z = (-3 * Math.PI) / 4;
      handle.position.set(1.24, -1.24, 0);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.16, 16), oxMat);
      band.rotation.z = (-3 * Math.PI) / 4;
      band.position.set(0.78, -0.78, 0);
      lensMesh.add(lensGlass, new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 16, 64), aluMat), handle, band);

      // 2. Orb
      orbMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), glassMat(2.4));

      // 3. Pan
      panMesh = new THREE.Group();
      [
        [-0.55, 0.1, 0.6],
        [0, -0.1, -0.6],
        [0.55, 0.1, 0.6],
      ].forEach((a) => {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.06), glassMat(0.3, 0.1));
        p.position.set(a[0], 0, a[1]);
        p.rotation.y = a[2];
        panMesh.add(p);
      });
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.07), oxMat);
      tab.position.set(0.62, -0.6, 0.2);
      tab.rotation.y = 0.6;
      panMesh.add(tab);

      [lensMesh, orbMesh, panMesh].forEach((o) => {
        o.scale.setScalar(0.001);
        scene.add(o);
      });

      const fitCamera = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        const hh = Math.tan((camera.fov * Math.PI) / 360) * 13;
        bgMesh.scale.set(2 * hh * camera.aspect, 2 * hh, 1);
        if (texture && (texture.image as any)?.width && (texture.image as any)?.height) {
          const img = texture.image as HTMLImageElement;
          const ar = img.width / img.height;
          if (w / h > ar) {
            texture.repeat.set(1, (ar * h) / w);
            texture.offset.set(0, (1 - texture.repeat.y) * 0.5);
          } else {
            texture.repeat.set(w / h / ar, 1);
            texture.offset.set((1 - texture.repeat.x) * (w >= 768 ? 0.68 : 0.6), 0);
          }
        }
      };

      fitCamera();
      window.addEventListener('resize', fitCamera);

      // Render loop
      let targetProgress = 0;
      let currentProgress = 0;

      const render = () => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const s = maxScroll > 0 ? Math.min(1, window.scrollY / maxScroll) : 0;
        targetProgress = s;
        currentProgress += (targetProgress - currentProgress) * 0.1;

        const t = currentProgress;
        const pr = 0;
        const o = Math.min(0.95, Math.max(0, (window.scrollY / window.innerHeight - 0.1) * 1.6));

        const hh = Math.tan((camera.fov * Math.PI) / 360) * 10;
        const hw = hh * camera.aspect;
        const u = Math.min(1, camera.aspect * 0.75) * o;

        const positionObject = (g: THREE.Object3D, fx: number, fy: number, z: number, scale: number) => {
          g.position.set((fx - 0.5) * 2 * hw, (0.5 - fy) * 2 * hh, z);
          g.scale.setScalar(Math.max(0.001, u * scale));
        };

        positionObject(lensMesh, 0.66 + 0.08 * Math.sin(t * 7), 0.22 + 0.4 * t, 1.2 * Math.sin(t * 6), 1.25);
        lensMesh.rotation.set(0.9 - t * 1.8, -0.5 + t * 7 + pr * 0.7, -0.35 + t);

        positionObject(orbMesh, 0.84 - 0.08 * Math.cos(t * 8), 0.66 - 0.3 * t, -1 + 2 * t, 1.05);
        orbMesh.rotation.y = t * 5;

        positionObject(panMesh, 0.72 + 0.07 * Math.cos(t * 5), 0.5 + 0.2 * Math.sin(t * 6), 0, 1.1);
        panMesh.rotation.set(-0.25 + 0.4 * Math.sin(t * 4), t * 12.5 + pr, 0);

        renderer.render(scene, camera);
        animationFrameId = requestAnimationFrame(render);
      };

      render();

      return () => {
        window.removeEventListener('resize', fitCamera);
        cancelAnimationFrame(animationFrameId);
        renderer.dispose();
      };
    } catch {
      // Fallback gracefully to CSS 3D
    }
  }, []);

  // Scroll tracking for chapters & beam/wash lighting
  useEffect(() => {
    const handleScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const s = maxScroll > 0 ? Math.min(1, window.scrollY / maxScroll) : 0;
      setScrollProgress(s);

      const k = Math.min(1, window.scrollY / window.innerHeight);
      if (heroContentRef.current) {
        heroContentRef.current.style.opacity = String(1 - k);
        heroContentRef.current.style.transform = `translateY(${-k * 48}px)`;
        heroContentRef.current.style.pointerEvents = k > 0.6 ? 'none' : 'auto';
      }

      if (beamRef.current) {
        beamRef.current.style.transform = `translateX(${30 - 60 * s}%)`;
      }
      if (washRef.current) {
        washRef.current.style.opacity = String(Math.min(0.3, s * 0.9));
      }
      if (sunRef.current) {
        sunRef.current.style.opacity = String(0.6 + 0.3 * Math.sin(s * 6.28));
      }

      const chapterEls = document.querySelectorAll('.chap');
      let near = 0;
      let best = 999;
      chapterEls.forEach((c, idx) => {
        const r = c.getBoundingClientRect();
        const d = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
        const o = Math.max(0, 1 - Math.abs(d) * 2.2);
        (c as HTMLElement).style.opacity = String(o);
        (c as HTMLElement).style.transform = `translateY(${d * 56}px)`;
        (c as HTMLElement).style.pointerEvents = o > 0.3 ? 'auto' : 'none';
        if (Math.abs(d) < best) {
          best = Math.abs(d);
          near = idx + 1;
        }
      });
      setCurrentChapter(k < 0.3 ? 0 : near);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard navigation & Esc key handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeDialog) setActiveDialog(null);
        else if (mobileMenuOpen) setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDialog, mobileMenuOpen]);

  // Copy helper
  const handleCopy = (text: string, successMsg: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        setLiveAnnouncement(successMsg);
        setCopyFeedback('Copied!');
        setTimeout(() => setCopyFeedback('Copy contact: studio@sentinel.example'), 1800);
      },
      () => {
        setLiveAnnouncement('Copy failed');
      }
    );
  };

  // Helper computations
  const score = Math.max(
    0,
    100 -
      30 * scan.findings.filter((f) => f.sev === 'critical').length -
      15 * scan.findings.filter((f) => f.sev === 'high').length -
      5 * scan.findings.filter((f) => f.sev === 'medium').length
  );

  const criticalAndHigh = scan.findings.filter((f) => f.sev === 'critical' || f.sev === 'high').length;
  const totalDeps = Object.keys(scan.nodes).length;
  const candidateFixes = scan.findings.filter((f) => f.fix && f.sev !== 'info').length;
  const filteredFindings = scan.findings.filter((f) => severityFilter === 'all' || f.sev === severityFilter);
  const selectedFinding = scan.findings.find((f) => f.id === selectedFindingId) || scan.findings[0];

  const semverRisk = (current: string, proposed: string) => {
    const c = current.split('.').map(Number);
    const p = proposed.split('.').map(Number);
    if (isNaN(c[0]) || isNaN(p[0])) return 'Unknown';
    if (p[0] > c[0]) return 'High (major)';
    if (p[1] > c[1]) return 'Moderate (minor)';
    return 'Low (patch)';
  };

  // Markdown report text generator
  const generateReportMarkdown = () => {
    const datasetClassification =
      scan.mode === 'demo' ? 'Controlled Demonstration Test Fixtures' : scan.mode === 'live' ? 'Live Repository Audit' : 'No dataset';
    return `# Sentinel Security Audit Report

Dataset: ${datasetClassification}
Target: ${scan.label}
Posture: ${score} / 100
Graph: ${scan.partial ? 'partial' : 'as supplied'}

## Findings
${
  scan.findings.length > 0
    ? scan.findings.map((f) => `- [${f.sev.toUpperCase()}] ${f.id} ${f.pkg}@${f.v} (fix: ${f.fix || 'unknown'})`).join('\n')
    : '- No vulnerabilities detected'
}

## Methodological Boundaries
Static analysis examines declared and resolved manifests without runtime code execution. An absence of recorded advisories does not prove the absence of zero-days.`;
  };

  // Live manifest analyzer
  // Live manifest analyzer using real server-side OSV / AST engine
  const handleAnalyzeManifest = async () => {
    setAnalyzeError('');
    if (!pjContent.trim()) {
      setAnalyzeError('Please provide package.json content.');
      return;
    }
    const checkPj = validateJsonInput(pjContent, 'package.json');
    if (!checkPj.isValid) {
      setAnalyzeError(checkPj.error || 'Invalid package.json');
      return;
    }

    if (lkContent.trim()) {
      const checkLk = validateJsonInput(lkContent, 'package-lock.json');
      if (!checkLk.isValid) {
        setAnalyzeError(checkLk.error || 'Invalid package-lock.json');
        return;
      }
    }

    setIsSubmittingScan(true);
    try {
      const res = await runDirectManifestScan({
        packageJsonContent: pjContent,
        packageLockContent: lkContent.trim() || undefined,
        projectName: 'Analyzed Application',
      });
      if (!res) {
        setAnalyzeError('Analysis failed or returned empty results. Please check manifest syntax.');
        return;
      }
      setLiveAnnouncement(
        `Scan complete. Found ${res.findings.length} findings across ${res.stats?.dependenciesScanned ?? 0} dependencies.`
      );
      // Switch view to overview to display results
      setActiveDialog('overview');
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : 'An unexpected error occurred during analysis.');
    } finally {
      setIsSubmittingScan(false);
    }
  };


  // Workflow unpinned action scanner
  const handleCheckWorkflow = () => {
    if (!wfContent.trim()) {
      setWorkflowOutput('Paste workflow YAML first.');
      return;
    }
    const lines = wfContent.split('\n');
    const unpinned = lines.filter((l) => /uses:\s*[^@\n]+@(?!([0-9a-f]{40}))/i.test(l));
    if (unpinned.length > 0) {
      setWorkflowOutput(
        `${unpinned.length} action reference(s) not pinned to an immutable 40-character commit SHA (e.g. tag @v4). Pinning prevents mutable tag hijacking, though it does not prove the commit itself is harmless.`
      );
    } else {
      setWorkflowOutput('All action references appear pinned to a 40-character commit SHA or local path.');
    }
  };

  return (
    <div className="hero font-sans" id="hero">
      {/* 1. Ambient Background & Media Layers */}
      <div className="media" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img id="photo" className="photo" alt="" src="/room-study.jpg" />
        <div className="beam" ref={beamRef} id="beam" />
        <div className="wash" ref={washRef} id="wash" />
        <div className="stage">
          <div className="sun" ref={sunRef} id="sun" />
          <div className="o3" ref={panRef} id="pan">
            <i />
            <i />
            <i />
          </div>
          <div className="o3" ref={orbRef} id="orb" />
          <div className="o3" ref={lensRef} id="lens">
            <svg viewBox="0 0 200 200" fill="none" focusable="false">
              <defs>
                <linearGradient id="al" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#F2F0EA" />
                  <stop offset=".5" stopColor="#AEB5B1" />
                  <stop offset="1" stopColor="#4b4e4b" />
                </linearGradient>
                <radialGradient id="gl" cx=".35" cy=".3">
                  <stop stopColor="#fff" stopOpacity=".6" />
                  <stop offset="1" stopColor="#D9DDD8" stopOpacity=".12" />
                </radialGradient>
              </defs>
              <path d="M124 124L190 190" stroke="#11110F" strokeWidth="16" strokeLinecap="round" />
              <path d="M121 121L138 138" stroke="#B85E3E" strokeWidth="18" />
              <circle cx="78" cy="78" r="62" fill="url(#gl)" stroke="url(#al)" strokeWidth="9" />
              <path d="M38 62A44 44 0 0 1 68 36" stroke="#fff" strokeOpacity=".85" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <canvas ref={canvasRef} id="gl" />
        <div className="tint" />
        <div className="vig" />
        <div className="veil" />
      </div>

      {/* 2. Top Navigation Bar */}
      <nav className="bar">
        <Link href="/" className="lock cursor-pointer">
          <span className="word">SENTINEL</span>
          <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false">
            <path d="M22.2 7.6V24.4H3.6V3.6H17.8" stroke="#11110F" strokeWidth="1.2" strokeLinecap="square" strokeLinejoin="miter" />
            <rect x="16.6" y="1.9" width="8.4" height="3.2" fill="#B85E3E" />
          </svg>
        </Link>

        <div className="center">
          <button onClick={() => setActiveDialog('overview')}>Overview</button>,{' '}
          <button onClick={() => setActiveDialog('analyze')}>Analysis</button>,{' '}
          <button onClick={() => setActiveDialog('graph')}>Attack Graph</button>,{' '}
          <button onClick={() => setActiveDialog('investigate')}>Investigation</button>,{' '}
          <button onClick={() => setActiveDialog('remediation')}>Remediation</button>,{' '}
          <button onClick={() => setActiveDialog('reports')}>Reports</button>
        </div>

        <button className="cta" onClick={() => setActiveDialog('telemetry')}>
          Telemetry &amp; coverage
        </button>

        <button
          className="burger"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          <i className={mobileMenuOpen ? 'transform translate-y-[7px] rotate-45' : ''} />
          <i className={mobileMenuOpen ? 'opacity-0' : ''} />
          <i className={mobileMenuOpen ? 'transform -translate-y-[7px] -rotate-45' : ''} />
        </button>

        {/* Fullscreen Mobile Drawer Menu */}
        <div className={`menu ${mobileMenuOpen ? 'opacity-100 pointer-events-auto' : ''}`}>
          {CHAPTERS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => {
                setMobileMenuOpen(false);
                setActiveDialog(ch.id);
              }}
            >
              {ch.title}
            </button>
          ))}
          <button
            className="u"
            onClick={() => {
              setMobileMenuOpen(false);
              setActiveDialog('telemetry');
            }}
          >
            Telemetry &amp; coverage
          </button>
        </div>
      </nav>

      {/* 3. Hero Copy Section */}
      <section className="copy" ref={heroContentRef}>
        <div className="col">
          <p className="blur" aria-hidden="true">
            An evidence-driven workstation for dependency risk,
            <br />
            SENTINEL 2.0 — facts, inferences, and unknowns.
          </p>

          <p className="sr">
            Good to have you in the workstation. We trace how a dependency reaches your application, and say plainly what we know.
          </p>

          <p className="tw" aria-hidden="true">
            {typewriterText}
            <span className="cur" />
          </p>

          <div className="hint">Drag horizontally or scroll to explore</div>

          <div className="pills on">
            <button className="pill" onClick={() => setActiveDialog('analyze')}>
              Start new analysis
            </button>
            <button className="pill" onClick={() => setActiveDialog('overview')}>
              Open overview
            </button>
            <button className="pill" onClick={() => setActiveDialog('graph')}>
              Explore attack graph
            </button>
            <button className="pill" onClick={() => setActiveDialog('investigate')}>
              Investigate a finding
            </button>
            <button className="pill" onClick={() => setActiveDialog('remediation')}>
              Review safe patches
            </button>
            <button className="pill" onClick={() => setActiveDialog('reports')}>
              Export a report
            </button>
            <button
              className="pill o"
              id="cp"
              onClick={() => handleCopy('studio@sentinel.example', 'Copied contact email')}
            >
              <span>{copyFeedback}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
                <rect x="3.4" y="3.4" width="7.1" height="7.1" stroke="currentColor" />
                <rect x="1.5" y="1.5" width="7.1" height="7.1" stroke="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* 4. Scrollable Chapters */}
      <div id="chaps">
        {CHAPTERS.map((ch) => (
          <section className="chap" key={ch.id}>
            <div className="col">
              <span className="num">{ch.num}</span>
              <h2 className="ch">{ch.title}</h2>
              <p>{ch.desc}</p>
              <button className="pill" onClick={() => setActiveDialog(ch.id)}>
                Open {ch.title.toLowerCase()}
              </button>
            </div>
          </section>
        ))}
      </div>

      {/* 5. Fixed Scroll Progress Rail */}
      <div id="rail" aria-hidden="true">
        <span>0{currentChapter} / 06</span>
        <b>
          <i style={{ transform: `scaleX(${scrollProgress})` }} />
        </b>
      </div>

      <div className="sr" aria-live="polite">
        {liveAnnouncement}
      </div>

      {/* 6. Interactive Workstation Dialog System */}
      {activeDialog && (
        <div className="ov" id="ov">
          <div className="dim" onClick={() => setActiveDialog(null)} />
          <div className="pn w" role="dialog" aria-modal="true" aria-labelledby="dh">
            <button className="x" onClick={() => setActiveDialog(null)} aria-label="Close">
              &times;
            </button>

            {/* View A: Overview */}
            {activeDialog === 'overview' && (
              <>
                <h2 id="dh" tabIndex={-1}>
                  Investigation overview &amp; posture.
                </h2>
                <div>
                  {scan.mode === 'demo' ? (
                    <span className="tag ox">Demo dataset</span>
                  ) : scan.mode === 'live' ? (
                    <span className="tag">Live manifest</span>
                  ) : (
                    <span className="tag">No dataset</span>
                  )}
                </div>
                <p className="sm mt-2">
                  Posture = 100 &minus; 30 per critical &minus; 15 per high &minus; 5 per medium (floor 0). A transparent prototype rule,
                  not a certified score.
                </p>

                <div className="m my-4">
                  <div>
                    <b>{score} / 100</b>
                    <span>Posture score</span>
                  </div>
                  <div>
                    <b>{scan.mode ? (scan.partial ? 'Partial' : 'Complete') : 'Incomplete data'}</b>
                    <span>Audit verdict</span>
                  </div>
                  <div>
                    <b>{criticalAndHigh}</b>
                    <span>Critical &amp; high</span>
                  </div>
                  <div>
                    <b>{scan.findings.filter((f) => f.path.length > 1).length}</b>
                    <span>Plausible attack paths</span>
                  </div>
                  <div>
                    <b>{totalDeps}</b>
                    <span>Dependencies cataloged</span>
                  </div>
                  <div>
                    <b>{candidateFixes}</b>
                    <span>Candidate patches</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    className="btn"
                    onClick={() => {
                      loadDemoScan();
                      setScan({
                        mode: 'demo',
                        label: 'Controlled Risky Demo',
                        nodes: DEMO_NODES,
                        findings: DEMO_FINDINGS,
                        lock: true,
                        partial: false,
                      });
                      setSelectedFindingId('DEMO-001');
                    }}
                  >
                    Analyze benchmark: Controlled Risky Demo
                  </button>
                  <button className="btn g" onClick={() => setActiveDialog('analyze')}>
                    Start new analysis
                  </button>
                </div>

                <label htmlFor="sf">Cataloged findings ({filteredFindings.length})</label>
                <select id="sf" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
                  <option value="all">All severities</option>
                  <option value="critical">Critical only</option>
                  <option value="high">High only</option>
                  <option value="medium">Medium only</option>
                </select>

                <div className="space-y-1 mt-2">
                  {filteredFindings.length > 0 ? (
                    filteredFindings.map((f) => (
                      <button
                        key={f.id}
                        className="row flex items-center justify-between"
                        onClick={() => {
                          setSelectedFindingId(f.id);
                          setActiveDialog('investigate');
                        }}
                      >
                        <div>
                          <span className={`tag ${f.sev === 'critical' || f.sev === 'high' ? 'ox' : ''}`}>{f.sev}</span>
                          <span className="font-semibold">{f.pkg}</span> <span>{f.v}</span>
                        </div>
                        <span className="sm">{f.id}</span>
                      </button>
                    ))
                  ) : (
                    <p className="sm">No findings match the selected filters.</p>
                  )}
                </div>

                <div className="pt-4 border-t border-[rgb(17_17_15_/_15%)] mt-4">
                  <Link href="/analyze" className="text-xs font-semibold underline underline-offset-4 decoration-[#B85E3E]">
                    Open full Analysis Workspace &rarr;
                  </Link>
                </div>
              </>
            )}

            {/* View B: Analysis */}
            {activeDialog === 'analyze' && (
              <>
                <h2 id="dh" tabIndex={-1}>
                  Start with a manifest.
                </h2>
                <p>
                  Paste package.json and, optionally, package-lock.json (v1, v2, v3). Deterministic AST and manifest parsing runs in your
                  browser; nothing is uploaded.
                </p>

                <label htmlFor="pj">package.json</label>
                <textarea
                  id="pj"
                  value={pjContent}
                  onChange={(e) => setPjContent(e.target.value)}
                  placeholder='{"name": "app", "dependencies": {"express": "^4.17.1"}}'
                />

                <label htmlFor="lk">package-lock.json (optional)</label>
                <textarea
                  id="lk"
                  value={lkContent}
                  onChange={(e) => setLkContent(e.target.value)}
                  placeholder='{"name": "app", "lockfileVersion": 2, "packages": {...}}'
                />

                {analyzeError && <p className="err">{analyzeError}</p>}

                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    className="btn"
                    onClick={handleAnalyzeManifest}
                    disabled={isSubmittingScan || isLoading}
                  >
                    {isSubmittingScan || isLoading ? 'Analyzing via OSV...' : 'Analyze manifest'}
                  </button>
                  <button
                    className="btn g"
                    onClick={() => {
                      loadDemoScan();
                      setScan({
                        mode: 'demo',
                        label: 'Controlled Risky Demo',
                        nodes: DEMO_NODES,
                        findings: DEMO_FINDINGS,
                        lock: true,
                        partial: false,
                      });
                      setSelectedFindingId('DEMO-001');
                      setActiveDialog('overview');
                    }}
                  >
                    Load benchmark
                  </button>
                </div>

                <div className="pt-4 border-t border-[rgb(17_17_15_/_15%)] mt-4">
                  <Link href="/analyze" className="text-xs font-semibold underline underline-offset-4 decoration-[#B85E3E]">
                    Switch to GitHub URL Remote Scanner &rarr;
                  </Link>
                </div>
              </>
            )}

            {/* View C: Attack Graph */}
            {activeDialog === 'graph' && (
              <>
                <h2 id="dh" tabIndex={-1}>
                  Dependency attack graph.
                </h2>
                <div>
                  {scan.mode === 'demo' ? (
                    <span className="tag ox">Demo dataset</span>
                  ) : (
                    <span className="tag">Live manifest</span>
                  )}
                </div>
                <p className="sm mt-1">
                  A graph path is a modeled relationship, not proof of exploitation.{' '}
                  {scan.partial ? 'Graph is partial: no lockfile provided.' : ''}
                </p>

                <label htmlFor="gs" className="mt-3">
                  Search nodes
                </label>
                <input
                  id="gs"
                  type="text"
                  value={graphQuery}
                  onChange={(e) => setGraphQuery(e.target.value)}
                  placeholder="Filter by package name..."
                />

                <button className="btn g mb-3" onClick={() => setIsolateAttackPaths(!isolateAttackPaths)}>
                  {isolateAttackPaths ? 'Show all nodes' : 'Isolate attack paths'}
                </button>

                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {Object.entries(scan.nodes)
                    .filter(([name]) => name.toLowerCase().includes(graphQuery.toLowerCase()))
                    .filter(([name, node]) => {
                      if (!isolateAttackPaths) return true;
                      const attackNodes = new Set(scan.findings.flatMap((f) => f.path));
                      return attackNodes.has(`${name}@${node.v}`);
                    })
                    .map(([name, node]) => {
                      const isFlagged = scan.findings.some((f) => f.path.includes(`${name}@${node.v}`));
                      const parents = Object.entries(scan.nodes)
                        .filter(([, o]) => o.kids.includes(name))
                        .map(([k]) => k);
                      return (
                        <div key={name} className="row text-xs py-2">
                          {isFlagged && <span className="tag ox">flagged</span>}
                          <strong>{name}</strong>@{node.v}{' '}
                          <span className="sm">
                            &bull; {node.direct ? 'direct' : 'transitive'} &bull; parents: {parents.join(', ') || 'app'} &bull; children:{' '}
                            {node.kids.length}
                          </span>
                        </div>
                      );
                    })}
                </div>

                <div className="pt-4 border-t border-[rgb(17_17_15_/_15%)] mt-4">
                  <Link href="/graph" className="text-xs font-semibold underline underline-offset-4 decoration-[#B85E3E]">
                    Open 3D WebGL Spatial Graph &rarr;
                  </Link>
                </div>
              </>
            )}

            {/* View D: Investigation */}
            {activeDialog === 'investigate' && (
              <>
                <h2 id="dh" tabIndex={-1}>
                  {selectedFinding ? `${selectedFinding.pkg} — ${selectedFinding.id}` : 'Investigate finding.'}
                </h2>
                <div>
                  {scan.mode === 'demo' ? (
                    <span className="tag ox">Demo dataset</span>
                  ) : (
                    <span className="tag">Live manifest</span>
                  )}
                </div>

                {selectedFinding ? (
                  <div className="mt-4 space-y-4">
                    <div>
                      <h3>Observed facts</h3>
                      <ul>
                        <li>
                          {selectedFinding.id === 'VERSION_UNVERIFIED'
                            ? 'Only declared ranges are available in package.json; no lockfile provided.'
                            : `Resolved version: ${selectedFinding.v}`}
                        </li>
                        <li>Source: {scan.mode === 'demo' ? 'Controlled benchmark fixture' : 'User manifest'}</li>
                        {selectedFinding.fix && <li>Candidate fix: {selectedFinding.fix}</li>}
                      </ul>
                    </div>

                    <div>
                      <h3>Inferred risks</h3>
                      <ul>
                        <li>
                          {selectedFinding.direct ? 'Direct' : 'Transitive'} dependency;{' '}
                          {selectedFinding.prod ? 'production' : 'CI/dev'} scope.
                        </li>
                        <li>Modeled lineage: {selectedFinding.path.join(' &rarr; ')}</li>
                      </ul>
                    </div>

                    <div>
                      <h3>Unknowns and boundaries</h3>
                      <ul>
                        <li>Whether the vulnerable code executes at runtime.</li>
                        <li>Whether application input validation or perimeter WAF mitigates exploitation.</li>
                        <li>Undisclosed zero-day vulnerability boundaries.</li>
                      </ul>
                    </div>

                    <div>
                      <h3>Actionable checklist</h3>
                      <ul>
                        <li>Verify upstream advisory boundaries in OSV.</li>
                        <li>Trace the lineage path to application entrypoints.</li>
                        <li>Inspect source code usage for user-controlled parameters.</li>
                        <li>Validate candidate remediation diff in test environment.</li>
                      </ul>
                    </div>

                    <button className="btn mt-2" onClick={() => setActiveDialog('remediation')}>
                      Review remediation
                    </button>
                  </div>
                ) : (
                  <div className="mt-4">
                    <p>No finding selected. Open the overview to pick a finding.</p>
                    <button className="btn" onClick={() => setActiveDialog('overview')}>
                      Open overview
                    </button>
                  </div>
                )}

                <div className="pt-4 border-t border-[rgb(17_17_15_/_15%)] mt-4">
                  <Link href="/investigate" className="text-xs font-semibold underline underline-offset-4 decoration-[#B85E3E]">
                    Open full Evidence Workspace &rarr;
                  </Link>
                </div>
              </>
            )}

            {/* View E: Remediation */}
            {activeDialog === 'remediation' && (
              <>
                <h2 id="dh" tabIndex={-1}>
                  Review safe patches.
                </h2>
                <div>
                  {scan.mode === 'demo' ? (
                    <span className="tag ox">Demo dataset</span>
                  ) : (
                    <span className="tag">Live manifest</span>
                  )}
                </div>

                {selectedFinding && selectedFinding.fix ? (
                  <div className="mt-3">
                    <p>
                      <strong>{selectedFinding.pkg}</strong> {selectedFinding.v} &rarr; <strong>{selectedFinding.fix}</strong>. Upgrade
                      risk: <strong>{semverRisk(selectedFinding.v, selectedFinding.fix)}</strong>. A heuristic evaluation, not an
                      absolute compatibility guarantee. Nothing is applied automatically.
                    </p>
                    <pre>
                      {selectedFinding.cat === 'dep'
                        ? `- "${selectedFinding.pkg}": "${selectedFinding.v}"\n+ "${selectedFinding.pkg}": "${selectedFinding.fix}"`
                        : `- uses: actions/checkout@v4\n+ uses: actions/checkout@<40-character-sha>`}
                    </pre>
                    <button
                      className="btn"
                      onClick={() =>
                        handleCopy(
                          selectedFinding.cat === 'dep'
                            ? `- "${selectedFinding.pkg}": "${selectedFinding.v}"\n+ "${selectedFinding.pkg}": "${selectedFinding.fix}"`
                            : `- uses: actions/checkout@v4\n+ uses: actions/checkout@<sha>`,
                          'Patch diff copied'
                        )
                      }
                    >
                      Copy diff
                    </button>
                  </div>
                ) : (
                  <p className="mt-3">No verified fixed version is recorded for the active finding. Select another in the overview.</p>
                )}

                <div className="mt-6 pt-4 border-t border-[rgb(17_17_15_/_15%)]">
                  <label htmlFor="yml">Workflow check (rule: unpinned action references)</label>
                  <textarea
                    id="yml"
                    value={wfContent}
                    onChange={(e) => setWfContent(e.target.value)}
                    placeholder="uses: actions/checkout@v4"
                  />
                  <button className="btn g" onClick={handleCheckWorkflow}>
                    Check workflow
                  </button>
                  {workflowOutput && <p className="sm mt-2">{workflowOutput}</p>}
                </div>

                <div className="pt-4 border-t border-[rgb(17_17_15_/_15%)] mt-4">
                  <Link href="/remediation" className="text-xs font-semibold underline underline-offset-4 decoration-[#B85E3E]">
                    Open full AST Patch Studio &rarr;
                  </Link>
                </div>
              </>
            )}

            {/* View F: Reports */}
            {activeDialog === 'reports' && (
              <>
                <h2 id="dh" tabIndex={-1}>
                  Export a report.
                </h2>
                <div>
                  {scan.mode === 'demo' ? (
                    <span className="tag ox">Demo dataset</span>
                  ) : (
                    <span className="tag">Live manifest</span>
                  )}
                </div>
                <p className="sm mt-2">
                  Dataset classification and methodological boundaries are strictly preserved in exported artifacts.
                </p>

                <pre id="md" className="my-3 max-h-60 overflow-y-auto">
                  {generateReportMarkdown()}
                </pre>

                <button className="btn" onClick={() => handleCopy(generateReportMarkdown(), 'Markdown report copied to clipboard')}>
                  Copy Markdown
                </button>

                <div className="pt-4 border-t border-[rgb(17_17_15_/_15%)] mt-4">
                  <Link href="/reports" className="text-xs font-semibold underline underline-offset-4 decoration-[#B85E3E]">
                    Download CycloneDX v1.5 SBOM &amp; HTML Report &rarr;
                  </Link>
                </div>
              </>
            )}

            {/* View G: Telemetry & Coverage */}
            {activeDialog === 'telemetry' && (
              <>
                <h2 id="dh" tabIndex={-1}>
                  Telemetry &amp; coverage.
                </h2>
                <p>
                  This workstation operates with <strong>zero untrusted code execution</strong>. Manifests, lockfiles, and workflows are
                  parsed strictly as inert data structures.
                </p>
                <div className="m my-4">
                  <div>
                    <b>OSV API</b>
                    <span>Live advisory correlator</span>
                  </div>
                  <div>
                    <b>SSRF Sandbox</b>
                    <span>Host allowlist active</span>
                  </div>
                  <div>
                    <b>Memory Limit</b>
                    <span>2MB safe threshold</span>
                  </div>
                  <div>
                    <b>Ecosystems</b>
                    <span>npm, PyPI, Go, Cargo</span>
                  </div>
                </div>
                <p className="sm">Ecosystem coverage matrix, rate limits, and parser diagnostics are cataloged in telemetry.</p>

                <div className="pt-4 border-t border-[rgb(17_17_15_/_15%)] mt-4">
                  <Link href="/telemetry" className="text-xs font-semibold underline underline-offset-4 decoration-[#B85E3E]">
                    Open Live Security Telemetry &rarr;
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
