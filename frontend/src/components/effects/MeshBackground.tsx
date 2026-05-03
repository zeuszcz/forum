"use client";

import { useEffect, useRef } from "react";

/**
 * Animated mesh-gradient hero background. Uses CSS animation for the slow drift
 * and an additional pointer-tracked highlight for liquid feel.
 */
export function MeshBackground({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let mx = 50;
    let my = 50;
    let cx = 50;
    let cy = 50;

    function tick() {
      cx += (mx - cx) * 0.06;
      cy += (my - cy) * 0.06;
      el?.style.setProperty("--cx", `${cx}%`);
      el?.style.setProperty("--cy", `${cy}%`);
      raf = requestAnimationFrame(tick);
    }
    function onMove(e: MouseEvent) {
      mx = (e.clientX / window.innerWidth) * 100;
      my = (e.clientY / window.innerHeight) * 100;
    }
    raf = requestAnimationFrame(tick);
    window.addEventListener("mousemove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`hero-mesh absolute inset-0 -z-10 ${className}`}
      aria-hidden="true"
      style={{
        // The cursor-tracked highlight rides on top of the static mesh
        backgroundImage: `
          radial-gradient(800px circle at var(--cx, 50%) var(--cy, 50%),
            rgb(var(--plasma-rgb) / 0.10) 0%,
            transparent 50%),
          radial-gradient(at 18% 22%, rgb(var(--plasma-rgb) / 0.22) 0px, transparent 50%),
          radial-gradient(at 80% 12%, rgb(var(--flame-rgb) / 0.18) 0px, transparent 50%),
          radial-gradient(at 70% 82%, rgb(var(--cyan-rgb) / 0.10) 0px, transparent 50%),
          radial-gradient(at 18% 78%, rgb(var(--plasma-rgb) / 0.10) 0px, transparent 50%)
        `,
      }}
    />
  );
}
