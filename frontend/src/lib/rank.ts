/**
 * Level / rank computation. Mirrors backend formula.
 *   xp    = posts * 10 + reactions_received * 4
 *   level = floor(sqrt(xp / 8))
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

export function computeRank(posts: number, reactions: number): RankInfo {
  const xp = Math.max(0, posts * 10 + reactions * 4);
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
export const PERKS: { level: number; name: string; description: string }[] = [
  { level: 0, name: "Базовый постинг", description: "Создавать темы и отвечать в темах" },
  { level: 3, name: "Embed картинок", description: "Прикреплять изображения к постам" },
  { level: 5, name: "Голосование в опросах", description: "Участвовать в опросах внутри тем" },
  { level: 10, name: "Создание опросов", description: "Создавать опросы в своих темах" },
  { level: 15, name: "Анимированная рамка аватара", description: "Раздел уровня в профиле" },
  { level: 25, name: "Кастомный титул", description: "Свободный текст под ником" },
  { level: 50, name: "Glow-ник", description: "Светящийся ник в шоутбоксе и постах" },
];

export function isUnlocked(level: number, perkLevel: number): boolean {
  return level >= perkLevel;
}

export function nextLockedPerk(level: number): { level: number; name: string } | null {
  const next = PERKS.find((p) => p.level > level);
  if (!next) return null;
  return { level: next.level, name: next.name };
}
