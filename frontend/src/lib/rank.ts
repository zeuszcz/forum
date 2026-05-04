/**
 * Level / rank computation. Mirrors backend formula.
 *   xp    = posts * 10 + reactions_received * 4 + bonus_xp
 *   level = floor(sqrt(xp / 8))
 *
 * `bonus_xp` accumulates from completed daily quests + case openings —
 * adding it here means rewards visibly bump the user's level.
 *
 * Rank titles are visual-only and shared by frontend; backend stays neutral.
 */

export interface RankInfo {
  level: number;
  xp: number;
  xpInto: number;
  xpForLevel: number;
  xpForNext: number;
  percent: number;
  title: string;
  color: string;
  next: { title: string; level: number } | null;
}

const RANKS: { min: number; title: string; color: string }[] = [
  { min: 0, title: "Новичок", color: "#a0a3b8" },
  { min: 5, title: "Игрок", color: "#22d3ee" },
  { min: 10, title: "Постоялец", color: "#60a5fa" },
  { min: 20, title: "Ветеран", color: "#7c5cff" },
  { min: 40, title: "Старожил", color: "#a855f7" },
  { min: 70, title: "Легенда", color: "#ec4899" },
];

export function computeRank(
  posts: number,
  reactions: number,
  bonusXp: number = 0,
): RankInfo {
  const xp = Math.max(0, posts * 10 + reactions * 4 + bonusXp);
  const level = Math.floor(Math.sqrt(xp / 8));
  const xpForLevel = level * level * 8;
  const xpForNext = (level + 1) * (level + 1) * 8;
  const xpInto = xp - xpForLevel;
  const span = xpForNext - xpForLevel;
  const percent = span > 0 ? (xpInto / span) * 100 : 0;

  let current = RANKS[0];
  let nextRank: { title: string; level: number } | null = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (level >= RANKS[i].min) current = RANKS[i];
    else {
      nextRank = { title: RANKS[i].title, level: RANKS[i].min };
      break;
    }
  }

  return {
    level,
    xp,
    xpInto,
    xpForLevel,
    xpForNext,
    percent,
    title: current.title,
    color: current.color,
    next: nextRank,
  };
}

/** Per-level perk gates for client-side checks + tooltip messaging. */
export interface Perk {
  level: number;
  slug: string;
  name: string;
  description: string;
}

export const PERKS: Perk[] = [
  {
    level: 0,
    slug: "basic_post",
    name: "Базовый постинг",
    description: "Создавать темы, отвечать, прикреплять картинки",
  },
  {
    level: 0,
    slug: "polls",
    name: "Опросы",
    description: "Создавать опросы и голосовать в них (доступно всем)",
  },
  {
    level: 15,
    slug: "animated_frame",
    name: "Свечение аватара",
    description: "Цветное свечение вокруг аватара везде на форуме",
  },
  {
    level: 25,
    slug: "custom_title",
    name: "Кастомный титул",
    description: "Свободный текст под ником (1 строка, 80 символов)",
  },
  {
    level: 50,
    slug: "glow_nick",
    name: "Свечение ника",
    description: "Цветной ник со свечением в шоутбоксе, постах, профиле",
  },
];

export function isUnlocked(level: number, perkLevel: number): boolean {
  return level >= perkLevel;
}

export function nextLockedPerk(level: number): { level: number; name: string } | null {
  const next = PERKS.find((p) => p.level > level);
  if (!next) return null;
  return { level: next.level, name: next.name };
}

/**
 * Karma — separate authority/reputation score derived from forum activity.
 * Weighs reactions heavily since they reflect community judgement.
 *   value = posts × 1 + reactions_received × 3
 */
export interface KarmaInfo {
  value: number;
  title: string;
  color: string;
}

export function computeKarma(posts: number, reactions: number): KarmaInfo {
  const value = posts + 3 * reactions;
  if (value >= 1500) return { value, title: "мифический", color: "#ec4899" };
  if (value >= 500) return { value, title: "легендарный", color: "#f43f5e" };
  if (value >= 200) return { value, title: "уважаемый", color: "#7c5cff" };
  if (value >= 50) return { value, title: "симпатичный", color: "#22d3ee" };
  return { value, title: "новичок", color: "#a0a3b8" };
}
