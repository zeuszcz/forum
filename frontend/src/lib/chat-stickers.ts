/** Jailbreak-themed sticker pack for endless-war jail server.
 *
 * Inserted as pre-styled bodies into the composer when picked — render
 * identically for everyone via the same Markdown pipeline. Premium tier
 * is gated by the existing perks system (server_vip / server_premium),
 * no new perk slugs introduced.
 */

export interface Sticker {
  slug: string;
  /** What gets inserted into the composer when the user picks the sticker. */
  body: string;
  /** Short label shown in the picker grid. */
  label: string;
  /** Optional perk slug that unlocks this sticker. */
  perkRequired?: string;
}

export const STICKERS: Sticker[] = [
  // Free — джаил-классика
  { slug: "bunt", body: "🚨 **БУНТ!** 🚨", label: "Бунт" },
  { slug: "freeday", body: "🆓 **FREEDAY!** 🆓", label: "Freeday" },
  { slug: "lr", body: "🎲 **Last Request** запрошен", label: "LR" },
  { slug: "simon", body: "👑 *Симон сказал...*", label: "Simon" },
  { slug: "to-cell", body: "⛓️ В клетку, заключённый!", label: "В клетку" },
  { slug: "knife", body: "🔪 **NINJA REBEL** — knife kill 🔪", label: "Ninja" },
  { slug: "gg", body: "🏆 **GG WP** 🏆", label: "GG WP" },
  { slug: "respect", body: "🫡 RESPECT", label: "Respect" },
  // Premium — нужен perk
  {
    slug: "escape",
    body: "🔓💨 **ПОБЕГ!** 💨🔓",
    label: "Побег",
    perkRequired: "server_vip",
  },
  {
    slug: "headshot",
    body: "🎯💥 **HEADSHOT!** 💥🎯",
    label: "HS",
    perkRequired: "server_vip",
  },
  {
    slug: "razdacha",
    body: "🍴 *РАЗДАЧА от КТ* 🍴 — фрик в студии",
    label: "Раздача",
    perkRequired: "server_premium",
  },
  {
    slug: "lineup",
    body: "⚖️ **СИКС!** Всем в шеренгу ⚖️",
    label: "Сикс",
    perkRequired: "server_premium",
  },
];

export function canUseSticker(
  sticker: Sticker,
  grantedPerks: string[] | null | undefined,
): boolean {
  if (!sticker.perkRequired) return true;
  const perks = grantedPerks ?? [];
  if (sticker.perkRequired === "server_vip") {
    return perks.includes("server_vip") || perks.includes("server_premium");
  }
  return perks.includes(sticker.perkRequired);
}
