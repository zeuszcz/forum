"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface BurstProps {
  triggerKey: number; // change to trigger
  className?: string;
}

/**
 * 10 small hearts spread radially when `triggerKey` changes.
 * Position absolutely on the parent (parent must be `relative`).
 */
export function HeartExplosion({ triggerKey, className }: BurstProps) {
  const [bursts, setBursts] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (triggerKey === 0) return;
    setBursts((b) => [...b, triggerKey]);
    const t = setTimeout(() => setBursts((b) => b.filter((x) => x !== triggerKey)), 900);
    return () => clearTimeout(t);
  }, [triggerKey]);

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-visible", className)}
    >
      {bursts.map((k) => (
        <Burst key={k} />
      ))}
    </div>
  );
}

function Burst() {
  const HEARTS = 10;
  return (
    <>
      {Array.from({ length: HEARTS }).map((_, i) => {
        const angle = (i / HEARTS) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 28 + Math.random() * 24;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const delay = Math.random() * 50;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2"
            style={{
              ["--dx" as string]: `${dx}px`,
              ["--dy" as string]: `${dy}px`,
              animation: `heart-burst 700ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms forwards`,
              color: i % 2 === 0 ? "rgb(var(--flame-rgb))" : "rgb(var(--plasma-rgb))",
              filter: "drop-shadow(0 0 4px currentColor)",
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full">
              <path d="M12 21s-7-4.35-9.5-9.05C.79 8.42 2.86 5 6.4 5c2.04 0 3.4 1.13 4.1 2.05.7-.92 2.06-2.05 4.1-2.05 3.54 0 5.61 3.42 3.9 6.95C19 16.65 12 21 12 21z" />
            </svg>
          </span>
        );
      })}
    </>
  );
}
