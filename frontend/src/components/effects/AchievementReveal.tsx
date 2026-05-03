"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { sfx } from "@/lib/audio";
import { cn } from "@/lib/utils";

export interface Achievement {
  title: string;
  description?: string;
  icon?: string; // emoji
  accent?: "plasma" | "flame" | "cyan";
}

const ACCENT_BG: Record<NonNullable<Achievement["accent"]>, string> = {
  plasma:
    "bg-[radial-gradient(circle_at_50%_30%,rgb(var(--plasma-rgb)/0.35),transparent_60%)]",
  flame:
    "bg-[radial-gradient(circle_at_50%_30%,rgb(var(--flame-rgb)/0.35),transparent_60%)]",
  cyan:
    "bg-[radial-gradient(circle_at_50%_30%,rgb(var(--cyan-rgb)/0.35),transparent_60%)]",
};

declare global {
  interface WindowEventMap {
    "ew-achievement": CustomEvent<Achievement>;
  }
}

/**
 * Listens to `window.dispatchEvent(new CustomEvent('ew-achievement', { detail: ... }))`
 * Shows a glass-strong modal with confetti for ~3s.
 */
export function AchievementReveal() {
  const [current, setCurrent] = useState<Achievement | null>(null);

  useEffect(() => {
    function onAch(e: WindowEventMap["ew-achievement"]) {
      setCurrent(e.detail);
      sfx.achievement();
      const t = setTimeout(() => setCurrent(null), 3500);
      return () => clearTimeout(t);
    }
    window.addEventListener("ew-achievement", onAch);
    return () => window.removeEventListener("ew-achievement", onAch);
  }, []);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center"
        >
          {/* backdrop */}
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
          {/* confetti */}
          <Confetti />
          {/* card */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -16 }}
            transition={{ type: "spring", stiffness: 200, damping: 16 }}
            className={cn(
              "relative z-10 w-[92vw] max-w-md overflow-hidden rounded-2xl glass-strong shadow-2xl",
              ACCENT_BG[current.accent ?? "plasma"],
            )}
          >
            <div className="flex flex-col items-center px-8 py-8 text-center">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan">
                достижение разблокировано
              </div>
              <div className="mb-4 text-6xl">{current.icon ?? "🏆"}</div>
              <h2 className="text-iridescent mb-1 text-xl font-bold">
                {current.title}
              </h2>
              {current.description && (
                <p className="mt-1 max-w-xs text-sm text-ash">{current.description}</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Confetti() {
  const N = 36;
  return (
    <div className="absolute inset-0 overflow-hidden">
      {Array.from({ length: N }).map((_, i) => {
        const angle = (i / N) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 200 + Math.random() * 200;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 50;
        const colors = [
          "rgb(var(--plasma-rgb))",
          "rgb(var(--flame-rgb))",
          "rgb(var(--cyan-rgb))",
        ];
        const color = colors[i % colors.length];
        const delay = (i % 4) * 30;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 h-2 w-1 origin-center rounded-sm"
            style={{ background: color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
            animate={{
              x: dx,
              y: dy,
              opacity: 0,
              rotate: 720,
              scale: 0.5,
            }}
            transition={{ duration: 1.6 + Math.random() * 0.8, delay: delay / 1000, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}
