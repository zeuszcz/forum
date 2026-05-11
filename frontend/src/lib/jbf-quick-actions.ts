/** Curated "single click on a player" actions for /admin/players.
 *
 * Each action takes a player nickname and produces ONE jbf_uaio_* command
 * targeted at that player. Designed for hot keys during games — the most
 * common начальник moves, two clicks max (player card → action chip).
 */

export interface QuickAction {
  slug: string;
  emoji: string;
  label: string;
  /** Tailwind tone class for the action chip border + text. */
  tone: string;
  /** Build the RCON command for a given target nickname. */
  build: (nickname: string) => string;
  /** Short hint for the confirm dialog. */
  hint: string;
  /** Group for visual segmentation. */
  group: "punish" | "help" | "fun";
}

const escapeNick = (n: string) => n; // CS will see plain text after -n

export const QUICK_ACTIONS: QuickAction[] = [
  // ── punish ─────────────────────────────────────────────────────────
  {
    slug: "kill",
    emoji: "☠️",
    label: "Убить",
    tone: "border-ember/50 text-ember hover:bg-ember/10",
    build: (n) => `jbf_uaio_kill -n ${escapeNick(n)}`,
    hint: "Мгновенное убийство",
    group: "punish",
  },
  {
    slug: "freeze10",
    emoji: "🧊",
    label: "Заморозить 10 с",
    tone: "border-cyan/50 text-cyan hover:bg-cyan/10",
    build: (n) => `jbf_uaio_freeze -n ${escapeNick(n)} -b 1 -t 10`,
    hint: "Замораживает на 10 секунд",
    group: "punish",
  },
  {
    slug: "bury8",
    emoji: "⛏️",
    label: "Закопать 8 с",
    tone: "border-ember/40 text-ember hover:bg-ember/10",
    build: (n) => `jbf_uaio_bury -n ${escapeNick(n)} -b 1 -t 8`,
    hint: "Закапывает на 8 секунд",
    group: "punish",
  },
  {
    slug: "disarm",
    emoji: "🤚",
    label: "Обезоружить",
    tone: "border-flame/40 text-flame hover:bg-flame/10",
    build: (n) =>
      `jbf_uaio_disarm -n ${escapeNick(n)} -s1 1 -s2 1`,
    hint: "Снимает основное + пистолет",
    group: "punish",
  },
  {
    slug: "mute60",
    emoji: "🤐",
    label: "Заткнуть чат 60 с",
    tone: "border-smoke/40 text-smoke hover:bg-smoke/10",
    build: (n) =>
      `jbf_uaio_block_chat -n ${escapeNick(n)} -b 1 -t 60`,
    hint: "Блок общего чата на минуту",
    group: "punish",
  },

  // ── help ───────────────────────────────────────────────────────────
  {
    slug: "god60",
    emoji: "🛡️",
    label: "God 60 с",
    tone: "border-plasma/50 text-plasma hover:bg-plasma/10",
    build: (n) => `jbf_uaio_god -n ${escapeNick(n)} -b 1 -t 60`,
    hint: "Бессмертие на минуту",
    group: "help",
  },
  {
    slug: "heal100",
    emoji: "💉",
    label: "100 HP",
    tone: "border-success/50 text-success hover:bg-success/10",
    build: (n) => `jbf_uaio_health -n ${escapeNick(n)} -i 100`,
    hint: "Восстанавливает 100 HP",
    group: "help",
  },
  {
    slug: "respawn",
    emoji: "🪦",
    label: "Возродить",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    build: (n) => `jbf_uaio_respawn -n ${escapeNick(n)} -ty 0`,
    hint: "Возрождает на спавне",
    group: "help",
  },
  {
    slug: "clear",
    emoji: "🧹",
    label: "Снять всё",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    build: (n) => `jbf_uaio_clear_punitive -n ${escapeNick(n)}`,
    hint: "Снимает наказательные эффекты",
    group: "help",
  },

  // ── fun ────────────────────────────────────────────────────────────
  {
    slug: "speed350",
    emoji: "🚀",
    label: "Скорость 350",
    tone: "border-flame/50 text-flame hover:bg-flame/10",
    build: (n) => `jbf_uaio_speed -n ${escapeNick(n)} -i 350 -t 60`,
    hint: "Бустит скорость на минуту",
    group: "fun",
  },
  {
    slug: "lowgrav",
    emoji: "🌙",
    label: "Низкая грав. 30",
    tone: "border-plasma/40 text-plasma hover:bg-plasma/10",
    build: (n) =>
      `jbf_uaio_gravity -n ${escapeNick(n)} -i 30 -t 60`,
    hint: "Гравитация 30% на минуту",
    group: "fun",
  },
  {
    slug: "awp",
    emoji: "🎯",
    label: "Выдать AWP",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    build: (n) =>
      `jbf_uaio_give_weapon -n ${escapeNick(n)} -wn awp -ty 2`,
    hint: "AWP с полной обоймой",
    group: "fun",
  },
  {
    slug: "drugs",
    emoji: "🌀",
    label: "Наркотики FOV 180",
    tone: "border-plasma/40 text-plasma hover:bg-plasma/10",
    build: (n) =>
      `jbf_uaio_drugs -n ${escapeNick(n)} -b 1 -i 180 -t 30`,
    hint: "FOV-эффект на 30 секунд",
    group: "fun",
  },
  {
    slug: "earthquake",
    emoji: "🌋",
    label: "Землетрясение",
    tone: "border-ember/40 text-ember hover:bg-ember/10",
    build: (n) =>
      `jbf_uaio_earthquake -n ${escapeNick(n)} -b 1 -t 15 -i 16`,
    hint: "Трясёт экран 15 секунд",
    group: "fun",
  },
  {
    slug: "wallhack",
    emoji: "👁️",
    label: "WallHack 60 с",
    tone: "border-flame/40 text-flame hover:bg-flame/10",
    build: (n) =>
      `jbf_uaio_wallhack -n ${escapeNick(n)} -b 1 -t 60`,
    hint: "WallHack на минуту",
    group: "fun",
  },
];

export const QUICK_GROUP_LABEL: Record<QuickAction["group"], string> = {
  punish: "Наказания",
  help: "Помощь",
  fun: "Развлечения",
};

export const QUICK_GROUP_TONE: Record<QuickAction["group"], string> = {
  punish: "text-ember",
  help: "text-cyan",
  fun: "text-flame",
};
