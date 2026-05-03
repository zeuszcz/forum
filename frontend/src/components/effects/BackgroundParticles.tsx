"use client";

import { useEffect, useRef } from "react";

/**
 * Subtle drifting plasma particles in the page background.
 * Canvas-rendered, low-frequency tick. Disabled on reduced-motion.
 *
 * Density tuned for desktop; on small screens we cut count in half.
 */
export function BackgroundParticles({
  count = 38,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    const isMobile = window.innerWidth < 768;
    const N = isMobile ? Math.floor(count / 2) : count;

    interface P {
      x: number;
      y: number;
      z: number; // depth — affects parallax
      vx: number;
      vy: number;
      r: number;
      hue: number;
    }
    const particles: P[] = [];

    function resize() {
      W = canvas!.clientWidth;
      H = canvas!.clientHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn() {
      particles.length = 0;
      for (let i = 0; i < N; i++) {
        const z = Math.random() * 0.7 + 0.3;
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          z,
          vx: (Math.random() - 0.5) * 0.08 * z,
          vy: (Math.random() - 0.5) * 0.08 * z,
          r: 0.6 + Math.random() * 1.4 * z,
          hue: 250 + Math.random() * 80, // plasma → flame range
        });
      }
    }

    let scrollY = window.scrollY;
    function onScroll() {
      scrollY = window.scrollY;
    }

    let raf = 0;
    function tick() {
      ctx!.clearRect(0, 0, W, H);
      for (const p of particles) {
        // Parallax — far particles drift slower with scroll
        const py = p.y - scrollY * 0.05 * p.z;
        const yMod = ((py % H) + H) % H;
        ctx!.beginPath();
        ctx!.fillStyle = `hsla(${p.hue}, 90%, 70%, ${0.18 + p.z * 0.18})`;
        ctx!.shadowBlur = 6 * p.z;
        ctx!.shadowColor = `hsla(${p.hue}, 90%, 70%, 0.4)`;
        ctx!.arc(p.x, yMod, p.r, 0, Math.PI * 2);
        ctx!.fill();
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;
      }
      raf = requestAnimationFrame(tick);
    }

    resize();
    spawn();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", () => {
      resize();
      spawn();
    });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [count]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 h-full w-full ${className}`}
    />
  );
}
