"use client";

import { useEffect, useRef } from "react";

/**
 * Footer logo whose diamond mark gently rotates to face the cursor.
 * Pure CSS rotation driven by JS-set CSS var. Disabled on touch.
 */
export function CursorTrackingLogo() {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    function onMove(e: MouseEvent) {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      el.style.setProperty("--rot", `${angle + 45}deg`); // diamond points to NE by default
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <svg
      ref={ref}
      viewBox="0 0 64 64"
      width="28"
      height="28"
      aria-hidden="true"
      className="transition-[transform] duration-300 ease-premium"
      style={{ transform: "rotate(var(--rot, 0deg))" }}
    >
      <defs>
        <linearGradient id="footer-plasma" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--plasma-rgb))" />
          <stop offset="100%" stopColor="rgb(var(--flame-rgb))" />
        </linearGradient>
      </defs>
      <path
        d="M 32 6 L 58 32 L 32 58 L 6 32 Z"
        fill="none"
        stroke="url(#footer-plasma)"
        strokeWidth="2"
        strokeLinejoin="miter"
      />
      <line x1="22" y1="20" x2="22" y2="44" stroke="url(#footer-plasma)" strokeWidth="1.5" />
      <line x1="32" y1="14" x2="32" y2="50" stroke="url(#footer-plasma)" strokeWidth="1.5" />
      <line x1="42" y1="20" x2="42" y2="44" stroke="url(#footer-plasma)" strokeWidth="1.5" />
    </svg>
  );
}
