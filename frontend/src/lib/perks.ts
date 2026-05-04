/**
 * Client-side perk gates: a user "has" a perk if either
 *   - their level meets the unlock threshold, or
 *   - an admin manually granted it (granted_perks array on UserPublic).
 */
import type { CSSProperties } from "react";

import { computeRank } from "@/lib/rank";
import type { Role } from "@/lib/types";

/** Minimal user shape consumed by perk helpers — keeps these usable across
 *  both `UserPublic` and `AdminUserRead` (which lacks bio/stats). */
export type ColorableUser = {
  roles?: Role[] | null;
  granted_perks?: string[] | null;
  total_posts?: number | null;
  total_reactions_received?: number | null;
  nick_color?: string | null;
  avatar_glow_color?: string | null;
};

const PERK_LEVEL: Record<string, number> = {
  animated_frame: 15,
  custom_title: 25,
  glow_nick: 50,
};

// Perks that are now baseline for everyone — historically gated, kept here
// so legacy granted_perks lists don't break existing checks.
const ALWAYS_GRANTED = new Set(["embed_images", "vote_polls", "create_polls"]);

export function hasPerk(user: ColorableUser | null | undefined, perk: string): boolean {
  if (ALWAYS_GRANTED.has(perk)) return true;
  if (!user) return false;
  if (user.granted_perks?.includes(perk)) return true;
  const required = PERK_LEVEL[perk];
  if (required === undefined) return false;
  const { level } = computeRank(
    user.total_posts ?? 0,
    user.total_reactions_received ?? 0,
    // Bonus XP from quests/cases counts toward the level gate
    (user as { bonus_xp?: number | null }).bonus_xp ?? 0,
  );
  return level >= required;
}

export function isStaff(user: ColorableUser | null | undefined): boolean {
  return Boolean(user?.roles?.some((r) => r.is_staff));
}

const DEFAULT_NICK_COLOR = "#e8e9f3";

/**
 * Resolve nickname color, prefer user-customised `nick_color` (only effective
 * if the user actually has the glow_nick perk to set it), then top-role color,
 * then bone fallback.
 */
export function nickColor(user: ColorableUser | null | undefined): string {
  if (!user) return DEFAULT_NICK_COLOR;
  if (user.nick_color && hasPerk(user, "glow_nick")) return user.nick_color;
  return user.roles?.[0]?.color ?? DEFAULT_NICK_COLOR;
}

/**
 * Resolve avatar glow color: prefer user-customised `avatar_glow_color`
 * (gated by animated_frame), fallback to nick color so the halo stays
 * thematic.
 */
export function avatarGlowColor(user: ColorableUser | null | undefined): string | null {
  if (!user) return null;
  if (!hasPerk(user, "animated_frame")) return null;
  if (user.avatar_glow_color) return user.avatar_glow_color;
  return user.roles?.[0]?.color ?? "#7c5cff";
}

/**
 * Return CSS style/class to apply on a nickname when the user has the
 * glow_nick perk. Color uses the resolved nickColor (user override > role).
 */
export function glowNickProps(user: ColorableUser | null | undefined): {
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
export function animatedFrameStyle(user: ColorableUser | null | undefined): CSSProperties {
  if (!hasPerk(user, "animated_frame")) return {};
  const color = avatarGlowColor(user) ?? "rgb(var(--plasma-rgb))";
  return {
    boxShadow: `0 0 0 2px ${color}99, 0 0 18px ${color}66`,
  };
}
