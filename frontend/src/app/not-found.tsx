"use client";

import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container relative flex min-h-[calc(100vh-180px)] items-center justify-center py-20">
      <div className="hero-mesh dotted-grid absolute inset-0 -z-10 rounded-2xl opacity-60" />
      <div className="relative grid gap-8 md:grid-cols-[auto_1fr] md:items-center md:gap-12">
        <JailEscape />
        <div className="max-w-md">
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan">
            ошибка 404
          </div>
          <h1 className="mt-2 text-5xl font-extrabold tracking-tight text-bone md:text-6xl">
            <span className="text-iridescent">сбежал</span>
          </h1>
          <p className="mt-4 text-base text-ash">
            Этой страницы нет — возможно, заключённый перерезал решётку и ушёл. Или мы её сами удалили.
          </p>
          <div className="mt-8 flex gap-2">
            <Button variant="gradient" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                На главную
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/f/general">в общий раздел</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JailEscape() {
  return (
    <svg
      viewBox="0 0 200 220"
      width="180"
      height="200"
      aria-hidden="true"
      className="shrink-0 drop-shadow-[0_0_24px_rgba(124,92,255,0.25)]"
    >
      <defs>
        <linearGradient id="jail-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--plasma-rgb))" />
          <stop offset="100%" stopColor="rgb(var(--flame-rgb))" />
        </linearGradient>
      </defs>
      {/* cell frame */}
      <rect
        x="20"
        y="40"
        width="160"
        height="160"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="2"
      />
      {/* bars */}
      {[40, 60, 80, 100, 120, 140, 160].map((x, i) => {
        // middle bars (80, 100, 120) are bent open
        const isBent = x >= 80 && x <= 120;
        return (
          <motion.path
            key={x}
            d={
              isBent
                ? `M ${x} 40 Q ${x + (i === 3 ? 22 : i === 2 ? 14 : -14)} 120 ${x + (i === 3 ? 30 : i === 2 ? 20 : -20)} 200`
                : `M ${x} 40 L ${x} 200`
            }
            stroke="url(#jail-bar)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}
      {/* fleeing footprint trail */}
      <motion.g
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8 }}
      >
        {[140, 156, 172, 188].map((cx, i) => (
          <motion.circle
            key={cx}
            cx={cx}
            cy={210}
            r={3}
            fill="rgb(var(--plasma-rgb))"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 - i * 0.15 }}
            transition={{ delay: 1 + i * 0.15 }}
          />
        ))}
      </motion.g>
      {/* "404" inside the cell */}
      <text
        x="100"
        y="135"
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="42"
        fontWeight="800"
        fill="rgba(255,255,255,0.06)"
      >
        404
      </text>
    </svg>
  );
}
