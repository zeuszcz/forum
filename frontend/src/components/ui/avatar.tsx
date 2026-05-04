import * as React from "react";

import { nicknameHue } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LetterAvatarProps {
  nickname: string;
  size?: number;
  className?: string;
  /** Custom outer glow halo (typically `avatarGlowColor(user)`). Null = no halo. */
  glowColor?: string | null;
  /** Uploaded avatar URL — when present, renders as <img> instead of the letter. */
  avatarUrl?: string | null;
}

/**
 * Deterministic letter avatar — generates a consistent HSL background per nickname.
 * Used until users upload a real avatar. When `glowColor` is provided the avatar
 * gets a soft outer halo (used by users with the animated_frame perk).
 */
export function LetterAvatar({
  nickname,
  size = 40,
  className,
  glowColor = null,
  avatarUrl = null,
}: LetterAvatarProps) {
  const letter = (nickname[0] ?? "?").toUpperCase();
  const hue = nicknameHue(nickname);
  const avatar = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt={nickname}
      className={cn(
        "relative shrink-0 rounded-full border border-border object-cover",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  ) : (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-inner",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue}, 55%, 38%), hsl(${(hue + 40) % 360}, 60%, 28%))`,
        fontSize: size * 0.42,
        textShadow: "0 1px 2px rgba(0,0,0,0.4)",
      }}
      aria-hidden="true"
    >
      {letter}
    </div>
  );
  if (!glowColor) return avatar;
  // Wrapping div carries the same footprint so layout doesn't shift.
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 -z-10 rounded-full opacity-75 blur-md"
        style={{
          backgroundColor: glowColor,
          // halo extends slightly beyond avatar
          transform: "scale(1.18)",
        }}
      />
      {avatar}
    </div>
  );
}
