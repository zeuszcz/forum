"use client";

import * as React from "react";

interface SparklineProps {
  values: number[];
  height?: number;
  width?: number;
  color?: string;
  className?: string;
}

/**
 * Tiny inline SVG sparkline. Used below SectionCard etc.
 * Uses CSS vars for color (defaults to plasma). Pure client render.
 */
export function Sparkline({
  values,
  height = 16,
  width = 60,
  color,
  className,
}: SparklineProps) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const xStep = width / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => {
    const x = i * xStep;
    const y = height - (v / max) * (height - 2) - 1;
    return `${x},${y}`;
  });
  const path = `M ${points.join(" L ")}`;
  const total = values.reduce((s, v) => s + v, 0);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-label={`${total} в час`}
    >
      <path
        d={`${path} L ${width},${height} L 0,${height} Z`}
        fill={color ?? "rgb(var(--plasma-rgb) / 0.18)"}
      />
      <path
        d={path}
        fill="none"
        stroke={color ?? "rgb(var(--plasma-rgb))"}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
