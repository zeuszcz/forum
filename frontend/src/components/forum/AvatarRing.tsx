"use client";

import { motion } from "framer-motion";

import { LetterAvatar } from "@/components/ui/avatar";

interface AvatarRingProps {
  nickname: string;
  size: number;
  level: number;
  percent: number;
  color: string;
  /** Show the level bubble in the corner. Default true. */
  showLevel?: boolean;
  /** Custom outer glow halo color (e.g. user's avatar_glow_color). Null = no halo. */
  glowColor?: string | null;
  /** Uploaded avatar URL — passed through to LetterAvatar. */
  avatarUrl?: string | null;
}

/**
 * Letter avatar wrapped with a circular SVG progress arc that visualises
 * the user's XP toward the next level. Tier-coloured stroke + bottom-right
 * level bubble. Optional outer glow halo when `glowColor` is provided.
 */
export function AvatarRing({
  nickname,
  size,
  level,
  percent,
  color,
  showLevel = true,
  glowColor = null,
  avatarUrl = null,
}: AvatarRingProps) {
  const stroke = Math.max(2, Math.round(size * 0.04));
  const ringSize = size + stroke * 4;
  const radius = (ringSize - stroke * 2) / 2;
  const cx = ringSize / 2;
  const cy = ringSize / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, percent)) / 100) * circ;

  return (
    <div
      className="relative shrink-0"
      style={{ width: ringSize, height: ringSize }}
    >
      {glowColor && (
        <div
          aria-hidden="true"
          className="absolute -inset-1 -z-10 rounded-full opacity-70 blur-lg"
          style={{ backgroundColor: glowColor }}
        />
      )}
      <svg
        viewBox={`0 0 ${ringSize} ${ringSize}`}
        width={ringSize}
        height={ringSize}
        className="absolute inset-0"
      >
        {/* track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={stroke}
        />
        {/* progress */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke + 0.5}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${dash} ${circ}` }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
        />
      </svg>
      <div
        className="absolute"
        style={{ top: stroke * 2, left: stroke * 2, width: size, height: size }}
      >
        <LetterAvatar nickname={nickname} size={size} avatarUrl={avatarUrl} />
      </div>
      {showLevel && (
        <span
          className="absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full font-mono font-bold text-white"
          style={{
            background: `linear-gradient(135deg, ${color}, rgb(var(--flame-rgb)))`,
            border: `2px solid hsl(var(--card))`,
            boxShadow: `0 0 8px ${color}aa`,
            minWidth: Math.max(22, Math.round(size * 0.32)),
            height: Math.max(22, Math.round(size * 0.32)),
            fontSize: Math.max(10, Math.round(size * 0.18)),
            padding: "0 6px",
          }}
        >
          {level}
        </span>
      )}
    </div>
  );
}
