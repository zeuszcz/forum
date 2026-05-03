"use client";

import { useEffect, useRef } from "react";

/**
 * Custom plasma cursor with trailing dots. Hides native cursor on fine pointer
 * devices via a body class. Adapts to interactive targets (grows + glows).
 *
 * Disables itself on touch / coarse pointer / prefers-reduced-motion.
 */
export function PlasmaCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    document.body.classList.add("cursor-plasma-active");

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let dotX = mouseX;
    let dotY = mouseY;
    let ringX = mouseX;
    let ringY = mouseY;
    const trailPositions: { x: number; y: number }[] = Array.from(
      { length: 8 },
      () => ({ x: mouseX, y: mouseY }),
    );

    let isHover = false;
    let isPointer = false;
    let raf = 0;

    function tick() {
      // Smooth-follow the dot fast
      dotX += (mouseX - dotX) * 0.55;
      dotY += (mouseY - dotY) * 0.55;
      // Ring lags slightly
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      // Trail propagates from front to back
      for (let i = trailPositions.length - 1; i > 0; i--) {
        trailPositions[i].x += (trailPositions[i - 1].x - trailPositions[i].x) * 0.35;
        trailPositions[i].y += (trailPositions[i - 1].y - trailPositions[i].y) * 0.35;
      }
      trailPositions[0].x += (mouseX - trailPositions[0].x) * 0.5;
      trailPositions[0].y += (mouseY - trailPositions[0].y) * 0.5;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${dotX}px, ${dotY}px, 0) translate(-50%, -50%) scale(${
          isPointer ? 0 : isHover ? 0.4 : 1
        })`;
      }
      if (ringRef.current) {
        const scale = isHover ? 1.7 : isPointer ? 1.4 : 1;
        ringRef.current.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%) scale(${scale})`;
        ringRef.current.style.opacity = isHover || isPointer ? "1" : "0.6";
      }
      trailRef.current.forEach((node, i) => {
        if (!node) return;
        const p = trailPositions[i];
        node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
        node.style.opacity = String(((trailPositions.length - i) / trailPositions.length) * 0.45);
      });

      raf = requestAnimationFrame(tick);
    }

    function onMove(e: MouseEvent) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const interactive = !!target.closest(
        'a, button, [role="button"], [data-cursor="hover"], input, textarea, select, label, summary',
      );
      isHover = interactive && !target.closest("input, textarea, select");
      isPointer = !!target.closest("input, textarea, select");
    }

    function onLeave() {
      if (dotRef.current) dotRef.current.style.opacity = "0";
      if (ringRef.current) ringRef.current.style.opacity = "0";
      trailRef.current.forEach((n) => n && (n.style.opacity = "0"));
    }
    function onEnter() {
      if (dotRef.current) dotRef.current.style.opacity = "1";
      if (ringRef.current) ringRef.current.style.opacity = "0.6";
    }

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      cancelAnimationFrame(raf);
      document.body.classList.remove("cursor-plasma-active");
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[9999] h-2 w-2 rounded-full mix-blend-screen will-change-transform"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--plasma-bright-rgb)) 0%, rgb(var(--plasma-rgb)) 70%, transparent 100%)",
          boxShadow:
            "0 0 12px rgb(var(--plasma-rgb) / 0.7), 0 0 22px rgb(var(--plasma-rgb) / 0.35)",
        }}
      />
      <div
        ref={ringRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[9998] h-9 w-9 rounded-full mix-blend-screen will-change-transform transition-[opacity,transform] duration-200 ease-premium"
        style={{
          border: "1px solid rgb(var(--plasma-rgb) / 0.55)",
          boxShadow: "0 0 16px rgb(var(--plasma-rgb) / 0.18) inset",
        }}
      />
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          ref={(node) => {
            if (node) trailRef.current[i] = node;
          }}
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-[9997] rounded-full mix-blend-screen will-change-transform"
          style={{
            width: 6 - i * 0.5,
            height: 6 - i * 0.5,
            background: `rgb(var(--plasma-rgb) / ${0.35 - i * 0.04})`,
            filter: "blur(0.5px)",
          }}
        />
      ))}
    </>
  );
}
