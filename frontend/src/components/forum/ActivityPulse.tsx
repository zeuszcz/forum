"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

interface Bucket {
  hour: string;
  posts: number;
  threads: number;
}

interface ActivityResponse {
  buckets: Bucket[];
  hours: number;
}

const REFRESH_MS = 30_000;
const W = 600;
const H = 80;

/** Normalize values into smoothed [0..1] for path drawing */
function buildPath(values: number[]): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const xStep = W / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => [i * xStep, H - (v / max) * (H - 18) - 8] as const);
  // Smooth bezier through points
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const cx = (x1 + x2) / 2;
    d += ` Q ${cx},${y1} ${cx},${(y1 + y2) / 2} T ${x2},${y2}`;
  }
  return d;
}

/**
 * "Ритмичная ЭКГ-линия" — animated svg sparkline showing post activity per
 * hour over the last 24h. Last bar pulses to indicate live state.
 */
export function ActivityPulse({ initial }: { initial?: ActivityResponse }) {
  const [data, setData] = useState<ActivityResponse | null>(initial ?? null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const r = await api<ActivityResponse>("/stats/activity?hours=24");
        if (mounted) setData(r);
      } catch {
        /* swallow */
      }
    }
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const values = (data?.buckets ?? []).map((b) => b.posts);
  const total = values.reduce((s, v) => s + v, 0);
  const peak = Math.max(...values, 0);
  const path = buildPath(values);

  return (
    <section className="relative overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="inline-flex items-center gap-2">
          <span className="dot-live animate-pulse-slow" />
          <h2 className="text-sm font-semibold tracking-tight text-bone">Пульс форума</h2>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span>
            <span className="text-smoke">24ч / </span>
            <span className="text-bone">{total}</span>{" "}
            <span className="text-smoke">постов</span>
          </span>
          <span>
            <span className="text-smoke">пик </span>
            <span className="text-cyan">{peak}</span>
          </span>
        </div>
      </header>

      <div className="relative px-2 py-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          className="block"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="pulse-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--plasma-rgb))" stopOpacity="0.6" />
              <stop offset="60%" stopColor="rgb(var(--plasma-rgb))" stopOpacity="0.05" />
              <stop offset="100%" stopColor="rgb(var(--plasma-rgb))" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="pulse-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(var(--plasma-rgb))" />
              <stop offset="60%" stopColor="rgb(var(--flame-rgb))" />
              <stop offset="100%" stopColor="rgb(var(--cyan-rgb))" />
            </linearGradient>
          </defs>

          {/* fill area */}
          <motion.path
            d={path ? `${path} L ${W},${H} L 0,${H} Z` : ""}
            fill="url(#pulse-grad)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          />
          {/* line */}
          <motion.path
            d={path}
            fill="none"
            stroke="url(#pulse-stroke)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
          {/* live last point */}
          {values.length > 0 && peak > 0 && (
            <PulseDot
              x={W}
              y={H - (values[values.length - 1] / peak) * (H - 18) - 8}
            />
          )}
        </svg>
      </div>
    </section>
  );
}

function PulseDot({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 5}, ${y})`}>
      <circle r="3" fill="rgb(var(--cyan-rgb))" />
      <motion.circle
        r="3"
        fill="rgb(var(--cyan-rgb))"
        initial={{ scale: 1, opacity: 0.8 }}
        animate={{ scale: 4, opacity: 0 }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
      />
    </g>
  );
}
