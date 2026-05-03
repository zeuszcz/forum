import * as React from "react";

import { nicknameHue } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LetterAvatarProps {
  nickname: string;
  size?: number;
  className?: string;
}

/**
 * Deterministic letter avatar — generates a consistent HSL background per nickname.
 * Used until users upload a real avatar.
 */
export function LetterAvatar({ nickname, size = 40, className }: LetterAvatarProps) {
  const letter = (nickname[0] ?? "?").toUpperCase();
  const hue = nicknameHue(nickname);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-inner",
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
}
