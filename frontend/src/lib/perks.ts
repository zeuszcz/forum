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

/**
 * Return CSS style/class to apply on a nickname when the user has the
 * glow_nick perk. Color follows their top-role color so it stays personal.
 */
export function glowNickProps(user: UserPublic | null | undefined): {
  className: string;
  style: CSSProperties;
} {
  if (!hasPerk(user, "glow_nick")) {
    return { className: "", style: {} };
  }
  const color = user?.roles?.[0]?.color ?? "#7c5cff";
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
  return {
    boxShadow: "0 0 0 2px rgb(var(--plasma-rgb) / 0.6), 0 0 18px rgb(var(--plasma-rgb) / 0.4)",
  };
}
