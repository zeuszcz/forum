/** CS 1.6 themed sticker pack. Inserts a pre-styled message body when picked.
 *
 * Without art assets, we lean on emoji + capitalised typography to feel
 * sticker-y. Premium stickers gate behind `granted_perks` (the `server_vip`
 * or `server_premium` perks already exist in the perks system — we just
 * reuse them as the unlock key). Free stickers always work.
 */

export interface Sticker {
  slug: string;
  /** What gets inserted into the composer when the user picks the sticker. */
  body: string;
  /** Small label shown in the picker grid. */
  label: string;
  /** Optional perk slug that unlocks this sticker. */
  perkRequired?: string;
}

export const STICKERS: Sticker[] = [
  { slug: "rush-b", body: "🚀 RUSH B!!! 🚀", label: "Rush B" },
  { slug: "bomb", body: "💣 **БОМБА УСТАНОВЛЕНА** 💣", label: "Bomb" },
  { slug: "defuse", body: "🛡️ **DEFUSED** in 1.2s 🛡️", label: "Defused" },
  { slug: "knife", body: "🔪 KNIFE KILL — позор", label: "Knife" },
  { slug: "awp", body: "🎯 AWP NO-SCOPE 360 🎯", label: "AWP" },
  { slug: "ace", body: "⚡ **ACE ROUND** ⚡", label: "Ace" },
  { slug: "gg", body: "🏆 **GG WP** 🏆", label: "GG WP" },
  { slug: "respect", body: "🫡 RESPECT", label: "Respect" },
  // Premium tier (perks-gated)
  {
    slug: "headshot",
    body: "🎯💥 **HEADSHOT!** 💥🎯",
    label: "HS",
    perkRequired: "server_vip",
  },
  {
    slug: "clutch-1v5",
    body: "🥇 **1v5 CLUTCH** 🥇 — легенда",
    label: "1v5",
    perkRequired: "server_vip",
  },
  {
    slug: "legend",
    body: "👑 **LEGEND STATUS** 👑",
    label: "Legend",
    perkRequired: "server_premium",
  },
  {
    slug: "dump",
    body: "🚮 *Dumped* by the team",
    label: "Dump",
    perkRequired: "server_premium",
  },
];

export function canUseSticker(
  sticker: Sticker,
  grantedPerks: string[] | null | undefined,
): boolean {
  if (!sticker.perkRequired) return true;
  const perks = grantedPerks ?? [];
  // server_premium implies server_vip
  if (sticker.perkRequired === "server_vip") {
    return perks.includes("server_vip") || perks.includes("server_premium");
  }
  return perks.includes(sticker.perkRequired);
}
