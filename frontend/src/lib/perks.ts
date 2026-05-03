/**
 * Client-side perk gates: a user "has" a perk if either
 *   - their level meets the unlock threshold, or
 *   - an admin manually granted it (granted_perks array on UserPublic).
 */
import type { CSSProperties } from "react";

import { computeRank } from "@/lib/rank";
import type { UserPublic } from "@/lib/types";

const PERK_LEVEL: Record<string, number> = {
  embed_images: 3,
  vote_polls: 5,
  create_polls: 10,
  animated_frame: 15,
  custom_title: 25,
  glow_nick: 50,
};

export function hasPerk(user: UserPublic | null | undefined, perk: string): boolean {
  if (!user) return false;
  if (user.granted_perks?.includes(perk)) return true;
  const required = PERK_LEVEL[perk];
  if (required === undefined) return false;
  const { level } = computeRank(user.total_posts, user.total_reactions_received);
  return level >= required;
}

export function isStaff(user: UserPublic | null | undefined): boolean {
  return Boolean(user?.roles?.some((r) => r.is_staff));
}

const DEFAULT_NICK_COLOR = "#e8e9f3";

/**
 * Resolve nickname color, prefer user-customised `nick_color` (only effective
 * if the user actually has the glow_nick perk to set it), then top-role color,
 * then bone fallback.
 */
export function nickColor(user: UserPublic | null | undefined): string {
  if (!user) return DEFAULT_NICK_COLOR;
  if (user.nick_color && hasPerk(user, "glow_nick")) return user.nick_color;
  return user.roles?.[0]?.color ?? DEFAULT_NICK_COLOR;
}

/**
 * Resolve avatar glow color: prefer user-customised `avatar_glow_color`
 * (gated by animated_frame), fallback to nick color so the halo stays
 * thematic.
 */
export function avatarGlowColor(user: UserPublic | null | undefined): string | null {
  if (!user) return null;
  if (!hasPerk(user, "animated_frame")) return null;
  if (user.avatar_glow_color) return user.avatar_glow_color;
  return user.roles?.[0]?.color ?? "#7c5cff";
}

/**
 * Return CSS style/class to apply on a nickname when the user has the
 * glow_nick perk. Color uses the resolved nickColor (user override > role).
 */
export function glowNickProps(user: UserPublic | null | undefined): {
  className: string;
  style: CSSProperties;
} {
  if (!hasPerk(user, "glow_nick")) {
    return { className: "", style: {} };
  }
  const color = nickColor(user);
  return {
    className: "nick-glow",
    style: {
      textShadow: `0 0 8px ${color}99, 0 0 18px ${color}55, 0 0 28px ${color}33`,
    },
  };
}

/** Apply animated frame ring around an avatar when the perk is unlocked. */
export function animatedFrameStyle(user: UserPublic | null | undefined): CSSProperties {
  if (!hasPerk(user, "animated_frame")) return {};
  const color = avatarGlowColor(user) ?? "rgb(var(--plasma-rgb))";
  return {
    boxShadow: `0 0 0 2px ${color}99, 0 0 18px ${color}66`,
  };
}
