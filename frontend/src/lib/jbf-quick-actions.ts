/** Action catalogue for the /admin/players UI. Each action targets ONE
 *  player nickname. Toggleable actions have an `on` and `off` builder —
 *  the page picks which to fire based on the player's active-effects
 *  state. One-shots have `on` only (and don't show in the toggled-on
 *  visual state).
 */

export interface QuickAction {
  /** Unique action key (used as React key). */
  slug: string;
  /** Effect identifier for state tracking. Multiple actions may share
   *  a slug (e.g. god-60s and god-permanent both share "god"). */
  effectSlug: string;
  emoji: string;
  /** Short chip label. */
  label: string;
  /** Longer hint for the confirm dialog. */
  hint: string;
  group: QuickGroup;
  /** Tailwind tone classes. */
  tone: string;
  /** Command builders — `off` is set only for toggleable effects. */
  build: {
    on: (nick: string) => string;
    off?: (nick: string) => string;
  };
  /** Seconds — for timed effects so the badge can show a countdown.
   *  Null/omitted = permanent or one-shot. */
  duration?: number;
  /** True for "fire and forget" actions (kill, respawn, disarm) — they
   *  never become "active". */
  oneShot?: boolean;
}

export type QuickGroup = "frequent" | "effects" | "games" | "clear";

export const QUICK_GROUP_META: Record<
  QuickGroup,
  { label: string; emoji: string; tone: string }
> = {
  frequent: {
    label: "Часто",
    emoji: "⚡",
    tone: "border-bone/30 text-bone",
  },
  effects: {
    label: "Эффекты",
    emoji: "🎲",
    tone: "border-plasma/40 text-plasma",
  },
  games: {
    label: "Геймплей",
    emoji: "🎮",
    tone: "border-flame/40 text-flame",
  },
  clear: {
    label: "Очистка",
    emoji: "🧹",
    tone: "border-cyan/40 text-cyan",
  },
};

const esc = (n: string) => n;

export const QUICK_ACTIONS: QuickAction[] = [
  // ── frequent (most-clicked one-shots + key togglables) ─────────────
  {
    slug: "kill",
    effectSlug: "kill",
    emoji: "☠️",
    label: "Убить",
    hint: "Мгновенное убийство",
    group: "frequent",
    tone: "border-ember/50 text-ember hover:bg-ember/10",
    oneShot: true,
    build: { on: (n) => `jbf_uaio_kill -n ${esc(n)}` },
  },
  {
    slug: "freeze10",
    effectSlug: "freeze",
    emoji: "🧊",
    label: "Заморозить 10с",
    hint: "Замораживает на 10 секунд",
    group: "frequent",
    tone: "border-cyan/50 text-cyan hover:bg-cyan/10",
    duration: 10,
    build: {
      on: (n) => `jbf_uaio_freeze -n ${esc(n)} -b 1 -t 10`,
      off: (n) => `jbf_uaio_freeze -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "god60",
    effectSlug: "god",
    emoji: "🛡️",
    label: "God 60с",
    hint: "Бессмертие на минуту",
    group: "frequent",
    tone: "border-plasma/50 text-plasma hover:bg-plasma/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_god -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_god -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "respawn",
    effectSlug: "respawn",
    emoji: "🪦",
    label: "Возродить",
    hint: "Возрождает на спавне",
    group: "frequent",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    oneShot: true,
    build: { on: (n) => `jbf_uaio_respawn -n ${esc(n)} -ty 0` },
  },
  {
    slug: "heal100",
    effectSlug: "health",
    emoji: "💉",
    label: "100 HP",
    hint: "Восстанавливает 100 HP",
    group: "frequent",
    tone: "border-success/50 text-success hover:bg-success/10",
    oneShot: true,
    build: { on: (n) => `jbf_uaio_health -n ${esc(n)} -i 100` },
  },
  {
    slug: "disarm",
    effectSlug: "disarm",
    emoji: "🤚",
    label: "Обезоружить",
    hint: "Снимает основной слот + пистолет",
    group: "frequent",
    tone: "border-flame/40 text-flame hover:bg-flame/10",
    oneShot: true,
    build: { on: (n) => `jbf_uaio_disarm -n ${esc(n)} -s1 1 -s2 1` },
  },
  {
    slug: "give-awp",
    effectSlug: "give-awp",
    emoji: "🎯",
    label: "AWP",
    hint: "Выдать AWP с полной обоймой",
    group: "frequent",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    oneShot: true,
    build: { on: (n) => `jbf_uaio_give_weapon -n ${esc(n)} -wn awp -ty 2` },
  },
  {
    slug: "speed350",
    effectSlug: "speed",
    emoji: "🚀",
    label: "Скорость 350",
    hint: "350 скорости на минуту",
    group: "frequent",
    tone: "border-flame/50 text-flame hover:bg-flame/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_speed -n ${esc(n)} -i 350 -t 60`,
      off: (n) => `jbf_uaio_clear_basic -n ${esc(n)}`,
    },
  },

  // ── effects (togglables with explicit ON/OFF) ──────────────────────
  {
    slug: "noclip",
    effectSlug: "noclip",
    emoji: "🌫️",
    label: "Noclip",
    hint: "Проход сквозь стены",
    group: "effects",
    tone: "border-plasma/40 text-plasma hover:bg-plasma/10",
    build: {
      on: (n) => `jbf_uaio_noclip -n ${esc(n)} -b 1`,
      off: (n) => `jbf_uaio_noclip -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "antidamage",
    effectSlug: "antidamage",
    emoji: "🔰",
    label: "Антиурон",
    hint: "Не получает урон ни от чего",
    group: "effects",
    tone: "border-plasma/40 text-plasma hover:bg-plasma/10",
    build: {
      on: (n) => `jbf_uaio_antidamage -n ${esc(n)} -b 1`,
      off: (n) => `jbf_uaio_antidamage -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "wallhack",
    effectSlug: "wallhack",
    emoji: "👁️",
    label: "WallHack",
    hint: "Видит игроков сквозь стены (1 мин)",
    group: "effects",
    tone: "border-flame/40 text-flame hover:bg-flame/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_wallhack -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_wallhack -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "hide-radar",
    effectSlug: "hide_radar",
    emoji: "🫥",
    label: "С радара",
    hint: "Скрыть с радара (1 мин)",
    group: "effects",
    tone: "border-plasma/40 text-plasma hover:bg-plasma/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_hide_from_radar -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_hide_from_radar -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "inf-ammo",
    effectSlug: "infinity_ammo",
    emoji: "♾️",
    label: "Беск. патроны",
    hint: "Бесконечные патроны (1 мин)",
    group: "effects",
    tone: "border-plasma/40 text-plasma hover:bg-plasma/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_infinity_ammo -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_infinity_ammo -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "inf-he",
    effectSlug: "infinity_he",
    emoji: "💣",
    label: "Беск. HE",
    hint: "Бесконечные осколочные (1 мин)",
    group: "effects",
    tone: "border-ember/40 text-ember hover:bg-ember/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_infinity_he -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_infinity_he -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "inf-flash",
    effectSlug: "infinity_flash",
    emoji: "⚡",
    label: "Беск. flash",
    hint: "Бесконечные слеповые (1 мин)",
    group: "effects",
    tone: "border-flame/40 text-flame hover:bg-flame/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_infinity_flash -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_infinity_flash -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "inf-smoke",
    effectSlug: "infinity_smoke",
    emoji: "💨",
    label: "Беск. smoke",
    hint: "Бесконечные дымовые (1 мин)",
    group: "effects",
    tone: "border-smoke/40 text-smoke hover:bg-smoke/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_infinity_smoke -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_infinity_smoke -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "antirecoil",
    effectSlug: "antirecoil",
    emoji: "🎯",
    label: "Антиотдача",
    hint: "Антиотдача оружия (1 мин)",
    group: "effects",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_antirecoil -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_antirecoil -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "parachute",
    effectSlug: "parachute",
    emoji: "🪂",
    label: "Парашют",
    hint: "Парашют (1 мин)",
    group: "effects",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_parachute -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_parachute -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "silent-steps",
    effectSlug: "silent_steps",
    emoji: "🐾",
    label: "Бесшумные шаги",
    hint: "Бесшумные шаги (1 мин)",
    group: "effects",
    tone: "border-plasma/40 text-plasma hover:bg-plasma/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_silent_steps -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_silent_steps -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "microphone",
    effectSlug: "microphone",
    emoji: "🎙️",
    label: "Микрофон",
    hint: "Выдать микрофон (1 мин)",
    group: "effects",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_microphone -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_microphone -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "bhop",
    effectSlug: "bhop",
    emoji: "🐇",
    label: "Bhop",
    hint: "Распрыжка (1 мин)",
    group: "effects",
    tone: "border-flame/40 text-flame hover:bg-flame/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_bhop -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_bhop -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "mute60",
    effectSlug: "block_chat",
    emoji: "🤐",
    label: "Заткнуть чат 1м",
    hint: "Блокирует общий чат на минуту",
    group: "effects",
    tone: "border-smoke/40 text-smoke hover:bg-smoke/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_block_chat -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_block_chat -n ${esc(n)} -b 0`,
    },
  },

  // ── games (setters + punishment) ───────────────────────────────────
  {
    slug: "bury8",
    effectSlug: "bury",
    emoji: "⛏️",
    label: "Закопать 8с",
    hint: "Закапывает на 8 секунд",
    group: "games",
    tone: "border-ember/40 text-ember hover:bg-ember/10",
    duration: 8,
    build: {
      on: (n) => `jbf_uaio_bury -n ${esc(n)} -b 1 -t 8`,
      off: (n) => `jbf_uaio_bury -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "lowgrav",
    effectSlug: "gravity",
    emoji: "🌙",
    label: "Грав. 30",
    hint: "Низкая гравитация на минуту",
    group: "games",
    tone: "border-plasma/40 text-plasma hover:bg-plasma/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_gravity -n ${esc(n)} -i 30 -t 60`,
      off: (n) => `jbf_uaio_clear_basic -n ${esc(n)}`,
    },
  },
  {
    slug: "highgrav",
    effectSlug: "gravity",
    emoji: "⛰️",
    label: "Грав. 300",
    hint: "Высокая гравитация на минуту",
    group: "games",
    tone: "border-ember/40 text-ember hover:bg-ember/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_gravity -n ${esc(n)} -i 300 -t 60`,
      off: (n) => `jbf_uaio_clear_basic -n ${esc(n)}`,
    },
  },
  {
    slug: "invis-30",
    effectSlug: "invisibility",
    emoji: "👻",
    label: "Невидимка",
    hint: "Альфа 30 на минуту",
    group: "games",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_invisibility -n ${esc(n)} -i 30 -t 60`,
      off: (n) => `jbf_uaio_invisibility -n ${esc(n)} -i 255 -t 1`,
    },
  },
  {
    slug: "drugs",
    effectSlug: "drugs",
    emoji: "🌀",
    label: "Наркотики",
    hint: "FOV 180 на 30 сек",
    group: "games",
    tone: "border-plasma/40 text-plasma hover:bg-plasma/10",
    duration: 30,
    build: {
      on: (n) => `jbf_uaio_drugs -n ${esc(n)} -b 1 -i 180 -t 30`,
      off: (n) => `jbf_uaio_drugs -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "earthquake",
    effectSlug: "earthquake",
    emoji: "🌋",
    label: "Землетрясение",
    hint: "Трясёт экран 15 сек",
    group: "games",
    tone: "border-ember/40 text-ember hover:bg-ember/10",
    duration: 15,
    build: {
      on: (n) => `jbf_uaio_earthquake -n ${esc(n)} -b 1 -t 15 -i 16`,
      off: (n) => `jbf_uaio_earthquake -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "distortion",
    effectSlug: "distortion_screen",
    emoji: "📺",
    label: "Искаж. экрана",
    hint: "Плавное искажение на 30 сек",
    group: "games",
    tone: "border-flame/40 text-flame hover:bg-flame/10",
    duration: 30,
    build: {
      on: (n) => `jbf_uaio_distortion_screen -n ${esc(n)} -b 1 -t 30 -ty 1`,
      off: (n) => `jbf_uaio_distortion_screen -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "slide",
    effectSlug: "slide",
    emoji: "⛸️",
    label: "Скольжение",
    hint: "Скользит как по льду (1 мин)",
    group: "games",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_slide -n ${esc(n)} -b 1 -t 60 -p 10`,
      off: (n) => `jbf_uaio_slide -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "double-jump",
    effectSlug: "double_jump",
    emoji: "🦘",
    label: "Двойной прыжок",
    hint: "5 доп. прыжков (1 мин)",
    group: "games",
    tone: "border-flame/40 text-flame hover:bg-flame/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_double_jump -n ${esc(n)} -v 5 -t 60`,
      off: (n) => `jbf_uaio_clear_basic -n ${esc(n)}`,
    },
  },
  {
    slug: "give-paint",
    effectSlug: "paint",
    emoji: "🎨",
    label: "Paint",
    hint: "Выдать paint (1 мин)",
    group: "games",
    tone: "border-plasma/40 text-plasma hover:bg-plasma/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_paint -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_paint -n ${esc(n)} -b 0`,
    },
  },
  {
    slug: "give-portal",
    effectSlug: "portal_gun",
    emoji: "🌀",
    label: "Portal Gun",
    hint: "Выдать Portal Gun (1 мин)",
    group: "games",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    duration: 60,
    build: {
      on: (n) => `jbf_uaio_portal_gun -n ${esc(n)} -b 1 -t 60`,
      off: (n) => `jbf_uaio_portal_gun -n ${esc(n)} -b 0`,
    },
  },

  // ── clear (mass revoke) ────────────────────────────────────────────
  {
    slug: "clear-basic",
    effectSlug: "clear_basic",
    emoji: "🧹",
    label: "Снять основные",
    hint: "Снимает все основные эффекты",
    group: "clear",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    oneShot: true,
    build: { on: (n) => `jbf_uaio_clear_basic -n ${esc(n)}` },
  },
  {
    slug: "clear-punitive",
    effectSlug: "clear_punitive",
    emoji: "🩹",
    label: "Снять наказания",
    hint: "Снимает заморозку, землетрясение, искажение и т.п.",
    group: "clear",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    oneShot: true,
    build: { on: (n) => `jbf_uaio_clear_punitive -n ${esc(n)}` },
  },
  {
    slug: "clear-other",
    effectSlug: "clear_other",
    emoji: "✨",
    label: "Снять прочие",
    hint: "Снимает прочие эффекты",
    group: "clear",
    tone: "border-cyan/40 text-cyan hover:bg-cyan/10",
    oneShot: true,
    build: { on: (n) => `jbf_uaio_clear_other -n ${esc(n)}` },
  },
];

export const QUICK_GROUPS_ORDER: QuickGroup[] = [
  "frequent",
  "effects",
  "games",
  "clear",
];

export function actionsByGroup(group: QuickGroup): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => a.group === group);
}
