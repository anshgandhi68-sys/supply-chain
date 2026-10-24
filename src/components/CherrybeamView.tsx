'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const CherrybeamView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [onDark, setOnDark] = useState(false);

  useEffect(() => {
    // 1. Safety guard to hide loader
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 1800);

    // 2. Section Intersection Observer for .in
    const sections = document.querySelectorAll<HTMLElement>('.cb-section');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('cb-in');
          }
        });
      },
      { threshold: 0.3 }
    );
    sections.forEach((s) => observer.observe(s));

    // 3. Scroll Parallax & Dark Theme Detection
    const handleScroll = () => {
      const vh = window.innerHeight;
      const scrollY = window.scrollY;

      // Parallax ornaments
      const ornaments = document.querySelectorAll<HTMLElement>('.cb-ornament');
      ornaments.forEach((orn) => {
        const parentSec = orn.closest<HTMLElement>('.cb-section');
        if (!parentSec) return;
        const rect = parentSec.getBoundingClientRect();
        const progress = -rect.top / vh;
        const speed = parseFloat(orn.getAttribute('data-speed') || '0');
        const rot = parseFloat(orn.getAttribute('data-rot') || '0');
        const yTrans = progress * speed * vh;
        const rTrans = progress * rot;
        orn.style.transform = `translateY(${yTrans}px) rotate(${rTrans}deg)`;
      });

      // Dark Theme handoff at 6% of viewport height
      let isDarkSection = false;
      sections.forEach((sec) => {
        const rect = sec.getBoundingClientRect();
        if (rect.top <= vh * 0.06 && rect.bottom >= vh * 0.06) {
          if (sec.getAttribute('data-theme') === 'dark') {
            isDarkSection = true;
          }
        }
      });
      setOnDark(isDarkSection);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    // 4. Three.js Coffee Cherry Scene
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;

    const scene = new THREE.Scene();
    scene.environment = envTexture;

    const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 10);

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xf2eeff, 0x7a62c9, 1.3);
    scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xfff1d6, 2.6);
    dirLight1.position.set(3, 5, 6);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xc8b8ff, 2.2);
    dirLight2.position.set(-5, 2, -4);
    scene.add(dirLight2);

    // Hierarchy: scene > flight > coffeeRoot > holder + sail groups
    const flight = new THREE.Group();
    const coffeeRoot = new THREE.Group();
    const holder = new THREE.Group();
    scene.add(flight);
    flight.add(coffeeRoot);
    coffeeRoot.add(holder);

    // Build procedural glossy coffee cherry with stem
    const cherryMat = new THREE.MeshPhysicalMaterial({
      color: 0xb73945,
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.7,
    });

    const bodyGeom1 = new THREE.SphereGeometry(0.52, 32, 32);
    bodyGeom1.scale(1.0, 1.15, 0.95);
    const cherrySphere1 = new THREE.Mesh(bodyGeom1, cherryMat);
    cherrySphere1.position.set(0.04, 0, 0);
    cherrySphere1.frustumCulled = false;
    holder.add(cherrySphere1);

    const bodyGeom2 = new THREE.SphereGeometry(0.48, 32, 32);
    bodyGeom2.scale(0.95, 1.12, 0.92);
    const cherrySphere2 = new THREE.Mesh(
      bodyGeom2,
      new THREE.MeshPhysicalMaterial({
        color: 0x962a35,
        roughness: 0.22,
        clearcoat: 0.8,
      })
    );
    cherrySphere2.position.set(-0.06, -0.02, 0.02);
    cherrySphere2.frustumCulled = false;
    holder.add(cherrySphere2);

    // Stem pointing along positive Z
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0.55, 0),
      new THREE.Vector3(0.08, 0.85, 0.15),
      new THREE.Vector3(0.02, 1.1, 0.4),
      new THREE.Vector3(0.12, 1.25, 0.65)
    );
    const stemGeom = new THREE.TubeGeometry(curve, 20, 0.035, 8, false);
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.7,
    });
    const stemMesh = new THREE.Mesh(stemGeom, stemMat);
    stemMesh.frustumCulled = false;
    holder.add(stemMesh);

    // Build Chaff-Sails (Wings)
    const sailTextureCanvas = document.createElement('canvas');
    sailTextureCanvas.width = 512;
    sailTextureCanvas.height = 288;
    const ctx = sailTextureCanvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 512, 288);
      grad.addColorStop(0, 'rgba(212, 122, 74, 0.95)');
      grad.addColorStop(0.5, 'rgba(221, 232, 221, 0.65)');
      grad.addColorStop(1, 'rgba(244, 240, 230, 0.1)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(10, 144);
      ctx.bezierCurveTo(150, 20, 380, 40, 500, 144);
      ctx.bezierCurveTo(360, 260, 140, 260, 10, 144);
      ctx.fill();
    }

    const sailTexture = new THREE.CanvasTexture(sailTextureCanvas);
    sailTexture.colorSpace = THREE.SRGBColorSpace;

    const sailMat = new THREE.MeshBasicMaterial({
      map: sailTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      opacity: 0.88,
    });

    const createSailWing = (isLeft: boolean) => {
      const wingGroup = new THREE.Group();
      if (isLeft) wingGroup.scale.z = -1;

      const sailGeom = new THREE.PlaneGeometry(0.85, 0.48);
      sailGeom.translate(0.42, 0, 0);

      const flapGroup = new THREE.Group();
      const sailMesh = new THREE.Mesh(sailGeom, sailMat);
      sailMesh.frustumCulled = false;
      flapGroup.add(sailMesh);
      wingGroup.add(flapGroup);

      return { wingGroup, flapGroup };
    };

    const rightSail = createSailWing(false);
    rightSail.wingGroup.position.set(0.25, 0.35, 0.1);
    holder.add(rightSail.wingGroup);

    const leftSail = createSailWing(true);
    leftSail.wingGroup.position.set(-0.25, 0.35, 0.1);
    holder.add(leftSail.wingGroup);

    // Five Story Flight Targets
    const desktopTargets = [
      { yaw: 150, roll: -4, x: -0.03, pitch: 6, y: -0.12, s: 1.0 },
      { yaw: 125, roll: 6, x: -0.3, pitch: 10, y: -0.04, s: 1.0 },
      { yaw: 40, roll: -8, x: 0.22, pitch: -6, y: -0.3, s: 1.0 },
      { yaw: 160, roll: 4, x: -0.22, pitch: 8, y: 0.02, s: 0.96 },
      { yaw: 105, roll: 0, x: 0.02, pitch: 4, y: -0.08, s: 0.92 },
    ];

    const mobileTargets = [
      { yaw: 150, roll: -4, x: 0.05, pitch: 6, y: -0.02, s: 0.75 },
      { yaw: 125, roll: 6, x: 0.1, pitch: 10, y: 0.12, s: 0.8 },
      { yaw: 40, roll: -8, x: 0.15, pitch: -6, y: -0.2, s: 0.75 },
      { yaw: 160, roll: 4, x: 0.25, pitch: 8, y: 0.2, s: 0.72 },
      { yaw: 105, roll: 0, x: 0, pitch: 4, y: 0.1, s: 0.7 },
    ];

    let currentX = 0, currentY = 0, currentScale = 1;
    let currentYaw = 150, currentPitch = 6, currentRoll = -4;
    let pointerX = 0, pointerY = 0, smoothPointerX = 0, smoothPointerY = 0;
    let prevX = 0, prevY = 0;

    const handlePointerMove = (e: MouseEvent) => {
      pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      pointerY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    let animationFrameId: number;
    let lastTime = performance.now();
    let isRendering = true;

    const handleVisibilityChange = () => {
      isRendering = !document.hidden;
      if (isRendering) lastTime = performance.now();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const degToRad = (deg: number) => (deg * Math.PI) / 180;

    const animate = (time: number) => {
      animationFrameId = requestAnimationFrame(animate);
      if (!isRendering) return;

      const dt = Math.min((time - lastTime) * 0.001, 0.05);
      lastTime = time;

      const isMobile = window.innerWidth <= 760;
      const targets = isMobile ? mobileTargets : desktopTargets;
      const totalScrollHeight = (sections.length - 1) * window.innerHeight;
      const pageProgress = Math.max(
        0,
        Math.min(
          sections.length - 1,
          (window.scrollY / Math.max(totalScrollHeight, 1)) * (sections.length - 1)
        )
      );

      const pairIndex = Math.min(Math.floor(pageProgress), targets.length - 2);
      const rawFraction = pageProgress - pairIndex;

      let t = (rawFraction - 0.12) / (0.76 - 0.12);
      t = Math.max(0, Math.min(1, t));

      const easedT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const t0 = targets[pairIndex];
      const t1 = targets[pairIndex + 1];

      const dive = Math.sin(t * Math.PI) * -0.22;
      const scaleLift = 1 + Math.sin(t * Math.PI) * 0.12;

      const targetX = t0.x + (t1.x - t0.x) * easedT;
      const targetY = t0.y + (t1.y - t0.y) * easedT + dive;
      const targetS = (t0.s + (t1.s - t0.s) * easedT) * scaleLift;

      let diffYaw = ((t1.yaw - t0.yaw + 540) % 360) - 180;
      const targetYaw = t0.yaw + diffYaw * easedT;
      const targetPitch = t0.pitch + (t1.pitch - t0.pitch) * easedT;
      const targetRoll = t0.roll + (t1.roll - t0.roll) * easedT;

      const smoothFactor = 1 - Math.exp(-dt * 3.2);
      const smoothYawFactor = 1 - Math.exp(-dt * 2.6);

      currentX += (targetX - currentX) * smoothFactor;
      currentY += (targetY - currentY) * smoothFactor;
      currentScale += (targetS - currentScale) * smoothFactor;
      currentPitch += (targetPitch - currentPitch) * smoothFactor;
      currentRoll += (targetRoll - currentRoll) * smoothFactor;
      currentYaw += (targetYaw - currentYaw) * smoothYawFactor;

      smoothPointerX += (pointerX - smoothPointerX) * (1 - Math.exp(-dt * 2));
      smoothPointerY += (pointerY - smoothPointerY) * (1 - Math.exp(-dt * 2));

      const velX = (currentX - prevX) / Math.max(dt, 0.001);
      const velY = (currentY - prevY) / Math.max(dt, 0.001);
      prevX = currentX;
      prevY = currentY;

      const vFov = (camera.fov * Math.PI) / 180;
      const halfHeight = Math.tan(vFov / 2) * 10;
      const halfWidth = halfHeight * camera.aspect;

      const tSec = time * 0.001;
      const idleX = Math.sin(tSec * 1.3) * 0.04 + smoothPointerX * 0.12;
      const idleY =
        (Math.sin(tSec * 2.1) * 0.045 + Math.sin(tSec * 3.7) * 0.015) * halfHeight * 0.5 +
        smoothPointerY * 0.08;
      const idleZ = Math.sin(tSec * 0.9) * 0.15;

      flight.position.x = currentX * halfWidth * 2 + idleX;
      flight.position.y = currentY * halfHeight * 2 + idleY;
      flight.position.z = idleZ;
      flight.scale.setScalar(halfHeight * 2 * 0.3 * currentScale);

      flight.rotation.y = degToRad(currentYaw) + smoothPointerX * degToRad(12);

      let clampedPitch =
        Math.max(-28, Math.min(28, currentPitch - velY * 22)) +
        Math.sin(tSec * 2.1 + 1) * 3 +
        smoothPointerY * 6;
      let clampedRoll =
        Math.max(-30, Math.min(30, currentRoll + velX * 18)) + Math.sin(tSec * 1.7) * 4;

      coffeeRoot.rotation.x = degToRad(clampedPitch);
      coffeeRoot.rotation.z = degToRad(clampedRoll);

      const moving = Math.min(1, Math.abs(velX) + Math.abs(velY));
      const freq = 2 * Math.PI * (17 + moving * 5);
      const wingSine = Math.sin(tSec * freq);

      rightSail.flapGroup.rotation.x = -0.25 + wingSine * 0.45;
      rightSail.flapGroup.rotation.y = wingSine * 0.18;

      leftSail.flapGroup.rotation.x = -0.25 + wingSine * 0.45;
      leftSail.flapGroup.rotation.y = wingSine * 0.18;

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      handleScroll();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      observer.disconnect();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      className={`relative w-full min-h-screen font-sans selection:bg-[#B73945] selection:text-white ${
        onDark ? 'text-white' : 'text-[#071F20]'
      }`}
      style={{
        backgroundColor: '#DDE8DD',
        fontFamily: "'Poppins', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Static Grain Layer */}
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Page Loader */}
      <div
        className={`fixed inset-0 z-50 bg-[#F4F0E6] flex items-center justify-center transition-all duration-800 ${
          isLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <svg
          className="w-12 h-12 animate-spin"
          style={{ animationDuration: '1.6s' }}
          viewBox="0 0 40 40"
          fill="none"
        >
          <circle cx="16" cy="22" r="8" fill="#B73945" />
          <circle cx="24" cy="20" r="7.5" fill="#962A35" />
          <path
            d="M16 14C18 9 24 8 28 6"
            stroke="#D47A4A"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path d="M28 6L30 10L32 6L28 6Z" fill="#D47A4A" />
        </svg>
      </div>

      {/* Fixed WebGL 3D Canvas */}
      <canvas
        ref={canvasRef}
        className={`fixed inset-0 w-screen h-screen pointer-events-none z-20 transition-opacity duration-1000 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Fixed Top Navigation */}
      <nav
        className={`fixed top-0 left-0 w-full px-[clamp(18px,3.2vw,46px)] pt-[18px] flex items-center justify-between pointer-events-none z-30 transition-colors duration-500 ${
          onDark ? 'text-white' : 'text-[#071F20]'
        }`}
      >
        <a
          href="#top"
          className="w-10 h-10 flex items-center justify-center pointer-events-auto group"
          aria-label="Cherrybeam Coffee home"
        >
          <svg
            className="w-9 h-9 transition-transform duration-600 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:rotate-90"
            viewBox="0 0 40 40"
            fill="none"
          >
            <circle cx="16" cy="22" r="8" fill="#B73945" />
            <circle cx="24" cy="20" r="7.5" fill="#962A35" />
            <path
              d="M16 14C18 9 24 8 28 6"
              stroke="#D47A4A"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path d="M28 6L30 10L32 6L28 6Z" fill="#D47A4A" />
          </svg>
        </a>

        <div className="hidden md:flex items-center gap-[clamp(22px,4.5vw,58px)] pointer-events-auto">
          <a
            href="#story"
            className="relative text-[15.5px] font-normal py-1 after:content-[''] after:absolute after:left-0 after:bottom-0 after:w-full after:h-[1.5px] after:bg-current after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-350"
          >
            From fruit to cup
          </a>
          <a
            href="#guide"
            className="relative text-[15.5px] font-normal py-1 after:content-[''] after:absolute after:left-0 after:bottom-0 after:w-full after:h-[1.5px] after:bg-current after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-350"
          >
            The roast guide
          </a>
        </div>

        <a
          href="#reserve"
          className="pointer-events-auto text-[16px] font-semibold mr-[clamp(0px,4vw,70px)] relative py-1 after:content-[''] after:absolute after:left-0 after:bottom-0 after:w-full after:h-[1.5px] after:bg-current after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-350"
        >
          Make a morning
        </a>
      </nav>

      {/* Fixed Lower-Right Badge */}
      <div
        className={`fixed right-[clamp(18px,3.2vw,46px)] bottom-[22px] flex items-center gap-2 text-[12.5px] font-medium z-30 pointer-events-auto transition-colors duration-500 ${
          onDark ? 'text-white' : 'text-[#071F20]'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="5" cy="5" r="2.5" fill="currentColor" />
          <circle cx="15" cy="5" r="2.5" fill="currentColor" />
          <circle cx="5" cy="15" r="2.5" fill="currentColor" />
          <circle cx="15" cy="15" r="2.5" fill="currentColor" />
        </svg>
        <span>
          Brewed for{' '}
          <strong className={`font-bold transition-colors ${onDark ? 'text-[#DDE8DD]' : 'text-[#D47A4A]'}`}>
            Cherrybeam
          </strong>
        </span>
      </div>

      <main className="relative">
        {/* Section 1: #top Hero */}
        <section
          id="top"
          data-theme="light"
          className="cb-section relative h-screen min-h-screen overflow-hidden bg-gradient-to-br from-[#F4F0E6] to-[#DDE8DD]"
        >
          <div className="absolute top-0 left-0 right-0 h-[55%] bg-[#F4F0E6]/40 pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-[60vw] h-[60vh] bg-radial from-[#071F20]/10 to-transparent pointer-events-none" />

          {/* Headline */}
          <h1
            data-speed="0.55"
            className="absolute top-[15.5vh] left-0 right-0 text-center font-extrabold text-[clamp(42px,6.25vw,112px)] leading-[1.04] tracking-[-0.035em] text-[#071F20]"
            style={{ textShadow: '0 0 40px rgba(244, 240, 230, 0.35)' }}
          >
            <span className="block overflow-hidden pb-[0.06em]">
              <span
                className={`inline-block transition-transform duration-1100 ease-[cubic-bezier(.2,.8,.15,1)] ${
                  isLoaded ? 'translate-y-0' : 'translate-y-[110%]'
                }`}
              >
                Brew clarity into
              </span>
            </span>
            <span className="block overflow-hidden pb-[0.06em]">
              <span
                className={`inline-block transition-transform duration-1100 ease-[cubic-bezier(.2,.8,.15,1)] delay-120 ${
                  isLoaded ? 'translate-y-0' : 'translate-y-[110%]'
                }`}
              >
                the first quiet hour.
              </span>
            </span>
          </h1>

          {/* Berry Cluster Ornament */}
          <svg
            data-speed="-0.25"
            data-rot="8"
            className="cb-ornament absolute left-[-14vw] bottom-[-24vw] w-[clamp(420px,64vw,1100px)] pointer-events-none drop-shadow-[0_30px_40px_rgba(7,31,32,0.18)]"
            viewBox="0 0 400 300"
            fill="none"
            aria-hidden="true"
          >
            <ellipse cx="140" cy="160" rx="90" ry="75" fill="#B73945" opacity="0.85" />
            <ellipse cx="220" cy="190" rx="80" ry="70" fill="#962A35" opacity="0.8" />
            <ellipse cx="180" cy="110" rx="70" ry="60" fill="#D47A4A" opacity="0.4" />
          </svg>

          {/* Hero Side Block */}
          <div
            className={`absolute right-[clamp(24px,6.5vw,120px)] top-[59vh] max-w-[min(260px,80vw)] transition-all duration-1000 delay-700 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <p className="text-[clamp(15px,1.45vw,20px)] font-normal leading-[1.32] text-[#476363]">
              Small-lot coffee, chosen around your ritual, then roasted close to the day you open it.
            </p>
            <a
              href="#reserve"
              className="inline-flex items-center gap-3.5 mt-10 font-semibold text-[clamp(15px,1.4vw,19px)] text-[#071F20] group"
            >
              <span>Set my first pour</span>
              <span className="w-[25px] h-[32px] border border-current rounded-[10px] flex items-center justify-center transition-transform duration-350 group-hover:translate-x-1">
                <svg className="w-2.5 h-2.5 stroke-current fill-none stroke-2" viewBox="0 0 10 10">
                  <path d="M3 1.5L6.5 5L3 8.5" />
                </svg>
              </span>
            </a>
          </div>
        </section>

        {/* Section 2: #story Chapter 01 */}
        <section
          id="story"
          data-theme="light"
          className="cb-section relative h-screen min-h-screen overflow-hidden bg-gradient-to-b from-[#DDE8DD] to-[#EAF0E8]"
        >
          {/* Hanging Husk Ornament */}
          <svg
            data-speed="0.35"
            data-rot="-6"
            className="cb-ornament absolute left-[-9vw] top-[-14vw] w-[clamp(380px,46vw,820px)] pointer-events-none"
            viewBox="0 0 300 200"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M20 10 C 90 80, 160 120, 240 180"
              stroke="#D47A4A"
              strokeWidth="12"
              strokeLinecap="round"
              opacity="0.3"
            />
            <path
              d="M40 30 C 120 70, 180 140, 260 190"
              stroke="#B8D7CC"
              strokeWidth="8"
              strokeLinecap="round"
              opacity="0.4"
            />
          </svg>

          <span className="absolute left-[6vw] top-[50vh] font-semibold leading-[0.8] tracking-[-0.06em] text-[clamp(110px,15vw,250px)] text-[#B8D7CC] select-none pointer-events-none">
            01
          </span>

          <div className="absolute left-[50vw] top-[41vh] max-w-[min(520px,44vw)]">
            <h2 className="font-bold text-[clamp(30px,3.4vw,56px)] leading-[1.12] tracking-[-0.02em] text-[#071F20]">
              Follow the<br />
              fruit through<br />
              its bright origin
            </h2>
            <p className="mt-[22px] text-[clamp(13.5px,1.05vw,16px)] leading-[1.6] text-[#476363] max-w-[420px]">
              Each bag starts with a seasonal harvest, then carries its place, process, and character straight into your grinder.
            </p>
          </div>
        </section>

        {/* Section 3: #guide Chapter 02 (Dark) */}
        <section
          id="guide"
          data-theme="dark"
          className="cb-section relative h-screen min-h-screen overflow-hidden bg-[#123B3A] text-white"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#071F20]/45 to-transparent pointer-events-none" />

          {/* Copper Chaff Ornament */}
          <svg
            data-speed="-0.3"
            data-rot="10"
            className="cb-ornament absolute right-[-8vw] bottom-[-20vw] w-[clamp(380px,46vw,820px)] pointer-events-none drop-shadow-[0_40px_60px_rgba(7,31,32,0.45)]"
            viewBox="0 0 350 250"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M100 200 C 180 120, 260 80, 320 30"
              stroke="#D47A4A"
              strokeWidth="18"
              strokeLinecap="round"
              opacity="0.35"
            />
            <circle cx="280" cy="60" r="50" fill="#D47A4A" opacity="0.2" filter="blur(20px)" />
          </svg>

          <div className="absolute left-[6vw] top-[22vh] max-w-[min(500px,46vw)]">
            <span className="block font-semibold leading-[0.8] tracking-[-0.06em] text-[clamp(110px,15vw,250px)] text-[#82A7A5] mb-[22px] select-none">
              02
            </span>
            <h2 className="font-bold text-[clamp(30px,3.4vw,56px)] leading-[1.12] tracking-[-0.02em] text-white">
              Roast for your<br />
              own rhythm
            </h2>
            <p className="mt-[22px] text-[clamp(13.5px,1.05vw,16px)] leading-[1.6] text-[#DDE8DD]/85 max-w-[460px]">
              Choose a vivid filter roast or a deeper espresso roast. We make each release easy to recognise before the first sip.
            </p>
          </div>
        </section>

        {/* Section 4: Chapter 03 */}
        <section
          id="chapter-three"
          data-theme="light"
          className="cb-section relative h-screen min-h-screen overflow-hidden bg-gradient-to-b from-[#EAF0E8] to-[#DDE8DD]"
        >
          {/* Coffee Branch Ornament */}
          <svg
            data-speed="-0.2"
            data-rot="-10"
            className="cb-ornament absolute left-[-10vw] top-[6vh] w-[clamp(360px,42vw,760px)] pointer-events-none"
            viewBox="0 0 350 250"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M30 180 Q 150 140 280 40"
              stroke="#476363"
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.25"
            />
            <ellipse cx="140" cy="140" rx="20" ry="10" fill="#B8D7CC" opacity="0.4" />
            <ellipse cx="220" cy="90" rx="22" ry="11" fill="#B8D7CC" opacity="0.4" />
          </svg>

          <div className="absolute left-[54vw] top-[26vh] max-w-[min(500px,40vw)]">
            <span className="block font-semibold leading-[0.8] tracking-[-0.06em] text-[clamp(110px,15vw,250px)] text-[#B8D7CC] mb-[24px] select-none">
              03
            </span>
            <h2 className="font-bold text-[clamp(30px,3.4vw,56px)] leading-[1.12] tracking-[-0.02em] text-[#071F20]">
              Keep your cup<br />
              in easy motion
            </h2>
            <p className="mt-[22px] text-[clamp(13.5px,1.05vw,16px)] leading-[1.6] text-[#476363] max-w-[420px]">
              Set the pace once. We time each delivery, offer a useful tasting note, and leave the rest of your morning alone.
            </p>
          </div>
        </section>

        {/* Section 5: #reserve Footer */}
        <section
          id="reserve"
          data-theme="light"
          className="cb-section relative h-screen min-h-screen overflow-hidden bg-[#DDE8DD]"
        >
          <div className="absolute top-[18vh] left-1/2 -translate-x-1/2 text-center flex flex-col items-center">
            <h2 className="font-bold text-[clamp(30px,3.6vw,60px)] tracking-[-0.02em] text-[#071F20]">
              Ready to wake up well?
            </h2>
            <a
              href="#top"
              className="inline-flex items-center gap-3.5 mt-8 font-semibold text-[clamp(15px,1.4vw,19px)] text-[#071F20] group"
            >
              <span>Start a better pour</span>
              <span className="w-[25px] h-[32px] border border-current rounded-[10px] flex items-center justify-center transition-transform duration-350 group-hover:translate-x-1">
                <svg className="w-2.5 h-2.5 stroke-current fill-none stroke-2" viewBox="0 0 10 10">
                  <path d="M3 1.5L6.5 5L3 8.5" />
                </svg>
              </span>
            </a>
          </div>

          <div className="absolute left-[clamp(18px,3.2vw,46px)] bottom-[80px]">
            <div className="font-bold tracking-[-0.02em] text-[clamp(30px,3vw,46px)] text-[#071F20]">
              Cherrybeam Coffee
            </div>
            <div className="text-[14px] text-[#476363] mt-1">Coffee for clear mornings</div>
          </div>

          <div className="absolute right-[calc(clamp(18px,3.2vw,46px)+120px)] bottom-[80px] flex gap-16">
            <div className="flex flex-col">
              <a href="#story" className="text-[14.5px] font-medium leading-[1.9] text-[#071F20] hover:text-[#D47A4A] transition-colors">
                Tasting room
              </a>
              <a href="#guide" className="text-[14.5px] font-medium leading-[1.9] text-[#071F20] hover:text-[#D47A4A] transition-colors">
                Roast notes
              </a>
              <a href="#story" className="text-[14.5px] font-medium leading-[1.9] text-[#071F20] hover:text-[#D47A4A] transition-colors">
                Care guide
              </a>
            </div>
            <div className="flex flex-col">
              <a href="#story" className="text-[14.5px] font-medium leading-[1.9] text-[#071F20] hover:text-[#D47A4A] transition-colors">
                Our method
              </a>
              <a href="#reserve" className="text-[14.5px] font-medium leading-[1.9] text-[#071F20] hover:text-[#D47A4A] transition-colors">
                Contact
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
