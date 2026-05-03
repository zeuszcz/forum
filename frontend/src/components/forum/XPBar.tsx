"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

import { NumberTicker } from "@/components/effects/NumberTicker";

interface XPBarProps {
  posts: number;
  reactions: number;
}

/**
 * Lightweight derived XP system.
 *   xp    = posts * 10 + reactions * 4
 *   level = floor(sqrt(xp / 8))
 * Exact tuning is fluff — the bar reflects "how active you are".
 */
function calc(posts: number, reactions: number) {
  const xp = posts * 10 + reactions * 4;
  const level = Math.floor(Math.sqrt(xp / 8));
  const xpForLevel = level * level * 8;
  const xpForNext = (level + 1) * (level + 1) * 8;
  const into = xp - xpForLevel;
  const span = xpForNext - xpForLevel;
  const percent = Math.max(0, Math.min(100, (into / span) * 100));
  return { xp, level, into, span, percent };
}

export function XPBar({ posts, reactions }: XPBarProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const { xp, level, into, span, percent } = calc(posts, reactions);

  return (
    <div
      ref={ref}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-smoke">уровень</div>
          <div className="mt-0.5 font-mono text-2xl font-bold text-plasma">
            <NumberTicker value={level} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-smoke">XP</div>
          <div className="mt-0.5 font-mono text-sm text-ash">
            <NumberTicker value={into} /> / {span}
          </div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-void">
        <motion.div
          className="h-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgb(var(--plasma-rgb)), rgb(var(--flame-rgb)))",
            boxShadow: "0 0 12px rgb(var(--plasma-rgb) / 0.6)",
          }}
          initial={{ width: 0 }}
          animate={{ width: inView ? `${percent}%` : 0 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-smoke">
        <span>
          <span className="font-mono text-ash">{posts}</span> постов
        </span>
        <span>
          <span className="font-mono text-ash">{reactions}</span> реакций
        </span>
        <span>
          <span className="font-mono text-ash">{xp}</span> total
        </span>
      </div>
    </div>
  );
}
