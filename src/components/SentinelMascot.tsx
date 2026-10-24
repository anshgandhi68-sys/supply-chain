'use client';

import React, { useEffect, useRef } from 'react';

export const SentinelMascot: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let dpr = 1;
    let W = window.innerWidth;
    let H = window.innerHeight;
    let animId: number;

    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener('resize', size);

    const isMob = () => window.innerWidth < 768;
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Cubic easing curve for smooth scroll transitions
    const ease = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Calculate exact waypoint coordinates for each chapter to guarantee
    // the mascot NEVER overlaps center text, search bars, or titles
    const getTargetPos = (pg: number, w: number, h: number, mobile: boolean) => {
      if (mobile) {
        // Mobile layout: Keep in safe areas below or away from centered text
        const waypoints = [
          { x: w * 0.78, y: h * 0.82 }, // Chapter 0: lower right below search console
          { x: w * 0.22, y: h * 0.65 }, // Chapter 1: left
          { x: w * 0.78, y: h * 0.45 }, // Chapter 2: right
          { x: w * 0.22, y: h * 0.65 }, // Chapter 3: left
          { x: w * 0.75, y: h * 0.70 }, // Chapter 4: right
        ];
        const k = Math.min(Math.floor(pg), waypoints.length - 2);
        const f = pg - k;
        const t = ease(Math.max(0, Math.min(1, (f - 0.1) / 0.8)));
        const p1 = waypoints[k];
        const p2 = waypoints[k + 1] || p1;
        return {
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t,
        };
      } else {
        // Desktop layout:
        // Section 0 (#top): Center container is max-w-3xl (768px).
        // Place safely in the open right margin (at least w/2 + 450px)
        const heroX = Math.min(w - 120, Math.max(w * 0.86, w / 2 + 450));
        const heroY = h * 0.62;

        const waypoints = [
          { x: heroX, y: heroY },                                                   // Chapter 0 (#top): Right margin
          { x: Math.max(140, Math.min(w * 0.24, w / 2 - 380)), y: h * 0.58 },      // Chapter 1 (#story): Left margin (text at 50vw)
          { x: Math.min(w - 140, Math.max(w * 0.78, w / 2 + 380)), y: h * 0.52 },  // Chapter 2 (#guide): Right margin (text at 6vw)
          { x: Math.max(140, Math.min(w * 0.24, w / 2 - 380)), y: h * 0.56 },      // Chapter 3 (#c3): Left margin (text at 54vw)
          { x: Math.min(w - 140, Math.max(w * 0.78, w / 2 + 380)), y: h * 0.65 },  // Chapter 4 (#reserve): Right margin
        ];

        const k = Math.min(Math.floor(pg), waypoints.length - 2);
        const f = pg - k;
        const t = ease(Math.max(0, Math.min(1, (f - 0.1) / 0.8)));
        const p1 = waypoints[k];
        const p2 = waypoints[k + 1] || p1;
        return {
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t,
        };
      }
    };

    // Initialize position at Chapter 0 waypoint
    const initialPos = getTargetPos(0, W, H, isMob());
    const currentPos = { x: initialPos.x, y: initialPos.y };

    let face = 1;
    let targetFace = 1;
    let phase = 0;
    let walkSpeed = 0;
    let mascotAlpha = 1;
    let mouseX = W * 0.5;

    const t0 = performance.now();
    let last = t0;
    let isVisible = true;

    // Helper: Rounded rectangle
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    // Forward kinematics limb with joint angles
    const limb = (
      x0: number,
      y0: number,
      l1: number,
      l2: number,
      a1: number,
      a2: number,
      w: number,
      col: string
    ) => {
      const x1 = x0 + Math.sin(a1) * l1;
      const y1 = y0 + Math.cos(a1) * l1;
      const x2 = x1 + Math.sin(a1 + a2) * l2;
      const y2 = y1 + Math.cos(a1 + a2) * l2;

      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      return [x2, y2];
    };

    // Render Sentinel Mascot with natural, charming proportions and kinematics
    const robot = (
      u: number,
      ph: number,
      stride: number,
      time: number,
      dark: boolean
    ) => {
      const bodyCol = '#D47A4A';
      const head = dark ? '#DDE8DD' : '#123B3A';
      const dim = dark ? '#82A7A5' : '#071F20';
      const vis_ = '#48D9C1';

      // Harmonic dual-cycle vertical bounce (smooth continuous C-infinity curve)
      const walkBob = (1 - Math.cos(ph * 2)) * 0.02 * stride * u;
      // Soft breathing idle oscillation when resting
      const idleBob = Math.sin(time * 2.4) * 0.015 * (1 - stride) * u;
      const totalBob = walkBob + idleBob;

      ctx.save();
      ctx.translate(0, -totalBob);

      // Subtle dynamic forward lean while walking
      const forwardLean = stride * 0.05;
      ctx.rotate(forwardLean);

      // Compact balanced proportions:
      // Torso bottom is at y = -0.30 * u.
      // Hip attaches directly to torso bottom at y = -0.30 * u!
      const hipY = -0.30 * u;
      const thighLen = 0.38 * u;
      const shinLen = 0.36 * u;
      const limbW = 0.16 * u;

      const activeStride = Math.min(1, stride * 1.4);
      const swingAmp = 0.55 * activeStride;

      // Leg 1 (Back Leg) & Arm 1 (Back Arm)
      const leg1HipAngle = -Math.sin(ph) * swingAmp;
      // Smooth continuous knee flexion during recovery swing phase
      const leg1KneeAngle = Math.pow(Math.max(0, Math.sin(ph + Math.PI - 0.2)), 1.5) * 0.75 * activeStride;

      // Back arm swings in opposition to back leg
      const arm1Angle = Math.sin(ph) * swingAmp * 0.85;
      limb(0, -1.15 * u, 0.40 * u, 0.38 * u, arm1Angle, 0.25 + 0.15 * activeStride, 0.12 * u, dim);

      // Back leg
      const l1 = limb(0, hipY, thighLen, shinLen, leg1HipAngle, leg1KneeAngle, limbW, dim);
      // Back foot rotated naturally with ground contact
      ctx.save();
      ctx.translate(l1[0], l1[1]);
      const foot1Angle = Math.sin(ph + Math.PI) * -0.18 * activeStride;
      ctx.rotate(foot1Angle);
      rr(-0.06 * u, -0.04 * u, 0.30 * u, 0.12 * u, 0.05 * u);
      ctx.fillStyle = dim;
      ctx.fill();
      ctx.restore();

      // Torso Chassis: height 0.95 * u (from y = -1.25 * u to -0.30 * u)
      rr(-0.34 * u, -1.25 * u, 0.68 * u, 0.95 * u, 0.16 * u);
      ctx.fillStyle = bodyCol;
      ctx.fill();

      // Torso Plate Detail (ecru paper badge)
      rr(-0.18 * u, -1.05 * u, 0.36 * u, 0.28 * u, 0.08 * u);
      ctx.fillStyle = '#F4F0E6';
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Torso Core Status Jewel (cyan glow)
      const jewelPulse = 0.85 + Math.sin(time * 3.5) * 0.15;
      ctx.fillStyle = vis_;
      ctx.globalAlpha = jewelPulse;
      ctx.beginPath();
      ctx.arc(0, -0.9 * u, 0.05 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Head Unit
      ctx.save();
      ctx.translate(0, -1.30 * u);

      // Head turn tracking and subtle bob
      const mouseLookX = (mouseX / W - 0.5) * 0.2;
      const headTurn = Math.sin(ph * 2) * 0.02 * activeStride + mouseLookX * 0.12;
      ctx.rotate(headTurn);

      // Head shape
      rr(-0.31 * u, -0.56 * u, 0.62 * u, 0.52 * u, 0.15 * u);
      ctx.fillStyle = head;
      ctx.fill();

      // Visor Screen
      rr(-0.22 * u, -0.44 * u, 0.44 * u, 0.24 * u, 0.09 * u);
      ctx.fillStyle = '#071F20';
      ctx.fill();

      // Glowing Eyes
      ctx.fillStyle = vis_;
      ctx.beginPath();
      ctx.arc(-0.07 * u, -0.32 * u, 0.04 * u, 0, Math.PI * 2);
      ctx.arc(0.10 * u, -0.32 * u, 0.04 * u, 0, Math.PI * 2);
      ctx.fill();

      // Antenna Rod
      ctx.strokeStyle = dim;
      ctx.lineWidth = 0.045 * u;
      ctx.beginPath();
      ctx.moveTo(0, -0.56 * u);
      ctx.lineTo(0.02 * u, -0.74 * u);
      ctx.stroke();

      // Antenna Beacon Tip (Copper Jewel)
      const beaconRadius = 0.065 * u + Math.sin(time * 4) * 0.01 * u;
      ctx.fillStyle = bodyCol;
      ctx.beginPath();
      ctx.arc(0.02 * u, -0.76 * u, beaconRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Leg 2 (Front Leg) & Arm 2 (Front Arm)
      const leg2HipAngle = Math.sin(ph) * swingAmp;
      const leg2KneeAngle = Math.pow(Math.max(0, Math.sin(ph - 0.2)), 1.5) * 0.75 * activeStride;

      // Front leg
      const l2 = limb(0, hipY, thighLen, shinLen, leg2HipAngle, leg2KneeAngle, limbW, head);
      // Front foot
      ctx.save();
      ctx.translate(l2[0], l2[1]);
      const foot2Angle = Math.sin(ph) * -0.18 * activeStride;
      ctx.rotate(foot2Angle);
      rr(-0.06 * u, -0.04 * u, 0.30 * u, 0.12 * u, 0.05 * u);
      ctx.fillStyle = head;
      ctx.fill();
      ctx.restore();

      // Front arm
      const arm2Angle = -Math.sin(ph) * swingAmp * 0.85;
      limb(0, -1.15 * u, 0.40 * u, 0.38 * u, arm2Angle, 0.25 + 0.15 * activeStride, 0.13 * u, head);

      ctx.restore();
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible) last = performance.now();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Main 60fps render loop
    const frame = (now: number) => {
      animId = requestAnimationFrame(frame);
      if (!isVisible) return;

      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const time = (now - t0) / 1000;

      const scrollY = window.scrollY;
      const innerHeight = window.innerHeight;

      // Calculate scroll progress across chapters
      const pg = Math.max(0, Math.min(scrollY / innerHeight, 4));
      const target = getTargetPos(pg, W, H, isMob());

      // Smooth position interpolation
      const prevX = currentPos.x;
      const prevY = currentPos.y;
      const lerpFactor = 1 - Math.exp(-dt * 4.5);
      currentPos.x += (target.x - currentPos.x) * lerpFactor;
      currentPos.y += (target.y - currentPos.y) * lerpFactor;

      // Calculate smooth velocity
      const vx = (currentPos.x - prevX) / (dt || 0.016);
      const vy = (currentPos.y - prevY) / (dt || 0.016);
      const currentSpeed = Math.hypot(vx, vy);

      // Smooth damped walk speed
      const targetWalk = rm ? 0 : Math.min(1, currentSpeed / 95);
      walkSpeed += (targetWalk - walkSpeed) * (1 - Math.exp(-dt * 6.5));

      // Smooth facing direction
      if (vx > 15) targetFace = 1;
      else if (vx < -15) targetFace = -1;
      face += (targetFace - face) * (1 - Math.exp(-dt * 7.0));

      // Continuous phase progression (seamless footstep timing)
      const walkRate = 3.2 + walkSpeed * 6.5;
      phase += dt * walkRate * (walkSpeed > 0.02 ? 1 : 0.25);

      // Scale unit based on viewport
      const u = Math.max(44, Math.min(68, H * 0.072)) * (isMob() ? 0.82 : 1);
      const px = currentPos.x;
      const py = currentPos.y;

      // Auto-fade when scrolled into active #analysis findings section
      const analysisEl = document.getElementById('analysis');
      let inAnalysis = false;
      if (analysisEl) {
        const rect = analysisEl.getBoundingClientRect();
        if (rect.top < H * 0.75 && rect.bottom > H * 0.2) {
          inAnalysis = true;
        }
      }
      const targetAlpha = inAnalysis ? 0 : 1;
      mascotAlpha += (targetAlpha - mascotAlpha) * (1 - Math.exp(-dt * 6.0));

      ctx.clearRect(0, 0, W, H);

      if (mascotAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = mascotAlpha;

        const dark = document.body.classList.contains('on-dark');

        // Dynamic grounded contact shadow matching actual foot baseline
        const shadowAlpha = dark ? 0.32 : 0.16;
        ctx.fillStyle = dark ? `rgba(0,0,0,${shadowAlpha})` : `rgba(7,31,32,${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(px, py + u * 0.46, u * 0.46, u * 0.10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Render Robot
        ctx.save();
        ctx.translate(px, py);
        // Avoid rendering 0-width line during turning
        const renderScaleX = Math.sign(face || 1) * Math.max(0.2, Math.abs(face));
        ctx.scale(renderScaleX, 1);
        ctx.rotate(walkSpeed * 0.03 * Math.sign(face || 1));
        robot(u, phase, walkSpeed, time, dark);
        ctx.restore();

        ctx.restore();
      }
    };

    animId = requestAnimationFrame(frame);
    cv.classList.add('ready');

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', size);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="cv"
      aria-hidden="true"
      className="fixed inset-0 z-20 pointer-events-none w-full h-full opacity-0 transition-opacity duration-1000 [&.ready]:opacity-100"
    />
  );
};
