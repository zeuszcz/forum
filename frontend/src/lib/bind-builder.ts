/** Pure utilities for the jbf_uaio bind constructor.
 *
 * Pure means: no React, no DOM, no storage. Just functions that turn the
 * page's state shape into a CS 1.6 `bind` string, plus key vocabulary
 * and flag-type inference helpers.
 */

import type { JbfCommand, JbfFlag } from "@/lib/jbf-commands";

// ─────────────────────────────────────────────────────────────────────
// Key vocabulary
// ─────────────────────────────────────────────────────────────────────

/** Most-used CS 1.6 bindable keys, grouped. Free-form input is allowed
 *  too — these are just the convenience picker entries. */
export const KEY_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "F-ряд",
    keys: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"],
  },
  {
    label: "Мышь",
    keys: ["MOUSE3", "MOUSE4", "MOUSE5", "MWHEELUP", "MWHEELDOWN"],
  },
  {
    label: "Numpad",
    keys: [
      "KP_HOME", "KP_UPARROW", "KP_PGUP",
      "KP_LEFTARROW", "KP_5", "KP_RIGHTARROW",
      "KP_END", "KP_DOWNARROW", "KP_PGDN",
      "KP_INS", "KP_DEL", "KP_ENTER",
      "KP_SLASH", "KP_MULTIPLY", "KP_MINUS", "KP_PLUS",
    ],
  },
  {
    label: "Спец.",
    keys: [
      "INS", "DEL", "HOME", "END", "PGUP", "PGDN",
      "BACKSPACE", "TAB", "CAPSLOCK", "PAUSE",
    ],
  },
  {
    label: "Стрелки",
    keys: ["UPARROW", "DOWNARROW", "LEFTARROW", "RIGHTARROW"],
  },
  {
    label: "Буквы (lower)",
    keys: "abcdefghijklmnopqrstuvwxyz".split(""),
  },
  {
    label: "Цифры",
    keys: "0123456789".split(""),
  },
  {
    label: "Символы",
    keys: ["`", "-", "=", "[", "]", "\\", ";", "'", ",", ".", "/"],
  },
];

export const FLAT_KEYS = KEY_GROUPS.flatMap((g) => g.keys);

// ─────────────────────────────────────────────────────────────────────
// Flag-type inference
// ─────────────────────────────────────────────────────────────────────

export type FlagType =
  | "boolean"   // 1/0 — render as Yes/No radio
  | "number"    // arbitrary scalar — render as number input
  | "enum"      // discrete set — render as <select>
  | "xyz"       // 3 numbers space-separated — three inline number inputs
  | "rgb"       // 3 bytes — three inline 0-255 inputs + color preview
  | "text";     // free-form — render as text input

const _BOOLEAN_RE = /^\s*[01]\s*\/\s*[01]\s*$/;
const _XYZ_RE = /\b[xyz]\s*[xyz]\s*[xyz]\b/i;
const _RGB_RE = /\br\s*g\s*b\b/i;
const _NUMBERED_ENUM_RE = /\d\s*-\s*\d.*=/;

export function inferFlagType(flag: JbfFlag): FlagType {
  const v = (flag.values ?? "").trim();
  if (!v) return "text";
  if (_BOOLEAN_RE.test(v)) return "boolean";
  if (_RGB_RE.test(v)) return "rgb";
  if (_XYZ_RE.test(v)) return "xyz";
  if (v.includes("число")) return "number";
  if (_NUMBERED_ENUM_RE.test(v)) return "enum";
  if (v.includes("/") && !v.includes("число")) return "enum";
  return "text";
}

export interface EnumOption {
  value: string;
  label: string;
}

/** Pull discrete options out of the human-readable `values` string. */
export function extractEnumOptions(flag: JbfFlag): EnumOption[] {
  const v = (flag.values ?? "").trim();
  if (!v) return [];

  // Pattern A: "0-N = a / b / c" — numeric values with named labels.
  const numMatch = v.match(/(\d+)\s*-\s*(\d+)\s*=\s*(.+)/);
  if (numMatch) {
    const start = parseInt(numMatch[1]!, 10);
    const end = parseInt(numMatch[2]!, 10);
    const labels = numMatch[3]!.split(/\s*\/\s*/).map((s) => s.trim());
    const out: EnumOption[] = [];
    for (let i = 0; i <= end - start; i++) {
      out.push({
        value: String(start + i),
        label: labels[i] ?? `${start + i}`,
      });
    }
    return out;
  }

  // Pattern B: "All / T / CT / Color" or "w / b / p / o / gr / g / r"
  return v.split(/\s*\/\s*/).map((s) => {
    const t = s.trim();
    return { value: t, label: t };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Bind string assembly
// ─────────────────────────────────────────────────────────────────────

export interface FlagState {
  enabled: boolean;
  /** Joined value — for xyz/rgb stored as "X Y Z" / "R G B". */
  value: string;
}

export interface BindBlockState {
  /** Stable React key — uuid-ish. */
  id: string;
  /** Selected command slug, or "" if not yet picked. */
  cmd: string;
  /** Per-flag state, keyed by flag name (incl. the leading dash). */
  flags: Record<string, FlagState>;
}

export interface BindState {
  key: string;
  blocks: BindBlockState[];
}

/** Compose the per-command argv strings ready to ship to RCON or join into
 *  a bind. Skips blocks without a selected command. */
export function blocksToCommands(
  state: BindState,
  commands: JbfCommand[],
): string[] {
  const out: string[] = [];
  for (const block of state.blocks) {
    if (!block.cmd) continue;
    const cmd = commands.find((c) => c.cmd === block.cmd);
    if (!cmd) continue;
    const args: string[] = [];
    for (const f of cmd.flags) {
      const st = block.flags[f.flag];
      if (!st || !st.enabled) continue;
      const val = st.value.trim();
      if (!val) continue;
      args.push(`${f.flag} ${val}`);
    }
    out.push(args.length ? `${cmd.cmd} ${args.join(" ")}` : cmd.cmd);
  }
  return out;
}

/** Build the final `bind "K" "cmd args; cmd args"` string. Returns "" if
 *  there's nothing to bind yet (no commands picked). */
export function buildBind(
  state: BindState,
  commands: JbfCommand[],
): string {
  const parts = blocksToCommands(state, commands);
  if (parts.length === 0) return "";
  const keyLabel = state.key.trim() || "<КЛАВИША>";
  return `bind "${keyLabel}" "${parts.join("; ")}"`;
}

/** Run lightweight validation on a state — returns user-facing warnings. */
export function validateBindState(state: BindState): string[] {
  const warnings: string[] = [];
  if (!state.key.trim()) warnings.push("Выбери клавишу для бинда");
  if (state.blocks.every((b) => !b.cmd))
    warnings.push("Добавь хотя бы одну команду");
  for (const b of state.blocks) {
    for (const [flag, st] of Object.entries(b.flags)) {
      if (!st.enabled) continue;
      if (st.value.includes('"')) {
        warnings.push(
          `${b.cmd || "(?)"}: значение флага ${flag} содержит кавычку — CS bind её не примет`,
        );
      }
      if (/\s/.test(st.value.trim()) && !/^[\d\s.\-+]+$/.test(st.value.trim())) {
        // Whitespace in non-numeric value (nickname with space, multi-word
        // phrase). CS bind can't nest quotes — flag this.
        warnings.push(
          `${b.cmd || "(?)"}: значение флага ${flag} содержит пробел — CS bind может не распарсить (замените пробелы на _ или используйте ник без пробелов)`,
        );
      }
    }
  }
  return warnings;
}

// ─────────────────────────────────────────────────────────────────────
// Default state helpers
// ─────────────────────────────────────────────────────────────────────

let _blockSeq = 0;
export function newBlockId(): string {
  _blockSeq += 1;
  return `b${Date.now()}_${_blockSeq}`;
}

export function emptyBlock(): BindBlockState {
  return { id: newBlockId(), cmd: "", flags: {} };
}

/** Build a fresh `flags` map for a command, enabling defaults the user
 *  almost always wants (the `-n` nickname flag and the example's flags). */
export function defaultFlagsFor(cmd: JbfCommand): Record<string, FlagState> {
  const out: Record<string, FlagState> = {};
  // Parse the plugin's example invocation to seed defaults.
  // Example: "jbf_uaio_god -n Player -b 1" → { -n: "Player", -b: "1" }
  const ex = cmd.example.replace(/^\S+\s+/, ""); // strip cmd name
  const parts = ex.split(/\s+/);
  const seeded: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.startsWith("-") && i + 1 < parts.length) {
      const next = parts[i + 1]!;
      // Don't consume if `next` is itself a flag.
      if (next.startsWith("-")) continue;
      seeded[p] = next;
      i += 1;
    }
  }
  for (const f of cmd.flags) {
    out[f.flag] = {
      enabled: seeded[f.flag] !== undefined,
      value: seeded[f.flag] ?? "",
    };
  }
  return out;
}

/** Build a `flags` map from an explicit preset spec — every listed flag
 *  is enabled, the rest of the command's flags stay disabled. */
export function flagsFromPreset(
  cmd: JbfCommand,
  preset: Record<string, string>,
): Record<string, FlagState> {
  const out: Record<string, FlagState> = {};
  for (const f of cmd.flags) {
    const v = preset[f.flag];
    out[f.flag] = {
      enabled: v !== undefined,
      value: v ?? "",
    };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Jail presets — ready-made bind chains for common начальник scenarios
// ─────────────────────────────────────────────────────────────────────

export interface JbfPreset {
  slug: string;
  label: string;
  emoji: string;
  description: string;
  /** Suggested key — user can override. Used when applying the preset. */
  suggestedKey?: string;
  /** Command chain — each entry references a slug from JBF_COMMANDS + the
   *  flag values that should be enabled. */
  blocks: Array<{ cmd: string; flags: Record<string, string> }>;
  /** UI grouping for the preset grid. */
  group: "punish" | "control" | "games" | "utility";
}

export const JBF_PRESET_GROUP_LABEL: Record<JbfPreset["group"], string> = {
  punish: "Наказания / разбор",
  control: "Контроль T (порядок)",
  games: "Игры и развлечения",
  utility: "Утилиты",
};

export const JBF_PRESETS: JbfPreset[] = [
  // ── punish ─────────────────────────────────────────────────────────
  // Single-target presets: «-n» flag enabled with empty value — UI prompts
  // the staff member to fill in the nickname before run/copy.
  {
    slug: "kill-target",
    label: "Убить (по нику)",
    emoji: "💀",
    description:
      "Убивает указанного игрока. Заполни поле -n ником жертвы перед запуском.",
    suggestedKey: "F5",
    group: "punish",
    blocks: [
      { cmd: "jbf_uaio_kill", flags: { "-n": "" } },
    ],
  },
  {
    slug: "freeze-target",
    label: "Заморозить (по нику) 10 с",
    emoji: "🧊",
    description:
      "Замораживает указанного игрока на 10 секунд. Удобно держать читера до выяснения.",
    suggestedKey: "F6",
    group: "punish",
    blocks: [
      { cmd: "jbf_uaio_freeze", flags: { "-n": "", "-b": "1", "-t": "10" } },
    ],
  },
  {
    slug: "bury-target",
    label: "Закопать (по нику) 8 с",
    emoji: "⛏️",
    description:
      "Закапывает указанного игрока на 8 секунд. Для дисциплинарной беседы.",
    suggestedKey: "F4",
    group: "punish",
    blocks: [
      { cmd: "jbf_uaio_bury", flags: { "-n": "", "-b": "1", "-t": "8" } },
    ],
  },
  {
    slug: "disarm-target",
    label: "Обезоружить (по нику)",
    emoji: "🤚",
    description:
      "Снимает с указанного игрока основное оружие и пистолет. Для подготовки к LR.",
    suggestedKey: "F3",
    group: "punish",
    blocks: [
      {
        cmd: "jbf_uaio_disarm",
        flags: { "-n": "", "-s1": "1", "-s2": "1" },
      },
    ],
  },

  // ── control ────────────────────────────────────────────────────────
  {
    slug: "lineup-t",
    label: "Сикс — заморозить всех T",
    emoji: "⛓️",
    description:
      "Замораживает всех заключённых до отмены. Для построения в шеренгу или прекращения бунта.",
    suggestedKey: "F1",
    group: "control",
    blocks: [
      { cmd: "jbf_uaio_freeze", flags: { "-g": "T", "-b": "1" } },
    ],
  },
  {
    slug: "unlineup-t",
    label: "Снять сикс с T",
    emoji: "🔓",
    description:
      "Размораживает T и снимает все наказательные эффекты (закопка, землетрясение, искажение экрана).",
    suggestedKey: "F2",
    group: "control",
    blocks: [
      { cmd: "jbf_uaio_freeze", flags: { "-g": "T", "-b": "0" } },
      { cmd: "jbf_uaio_clear_punitive", flags: { "-g": "T" } },
    ],
  },
  {
    slug: "chat-mute-t",
    label: "Заткнуть чат T (60 с)",
    emoji: "🤐",
    description:
      "Блокирует общий чат всем заключённым на минуту. Для тишины во время речи начальника / правил игры.",
    suggestedKey: "F12",
    group: "control",
    blocks: [
      {
        cmd: "jbf_uaio_block_chat",
        flags: { "-g": "T", "-b": "1", "-t": "60", "-tych": "0" },
      },
    ],
  },

  // ── games ─────────────────────────────────────────────────────────
  {
    slug: "freeday-all-t",
    label: "Freeday — god T на 2 мин",
    emoji: "🆓",
    description:
      "Объявляет фридей: все T получают бессмертие на 2 минуты + чистятся все наказания. Стоит выкрикнуть «фридей!» в микрофон.",
    suggestedKey: "F7",
    group: "games",
    blocks: [
      {
        cmd: "jbf_uaio_god",
        flags: { "-g": "T", "-b": "1", "-t": "120", "-cn": "1" },
      },
      { cmd: "jbf_uaio_clear_punitive", flags: { "-g": "T" } },
    ],
  },
  {
    slug: "lr-duel",
    label: "LR-дуэль (по нику)",
    emoji: "🎲",
    description:
      "Готовит указанного игрока к LR-дуэли: god, 100 HP, беск. патроны на минуту. Запускай по очереди для обоих участников.",
    suggestedKey: "F8",
    group: "games",
    blocks: [
      {
        cmd: "jbf_uaio_god",
        flags: { "-n": "", "-b": "1", "-t": "60" },
      },
      { cmd: "jbf_uaio_health", flags: { "-n": "", "-i": "100" } },
      {
        cmd: "jbf_uaio_infinity_ammo",
        flags: { "-n": "", "-b": "1", "-t": "60" },
      },
    ],
  },
  {
    slug: "race-day",
    label: "День гонок — буст T",
    emoji: "🚀",
    description:
      "Все T получают скорость 350 + распрыжку на 90 секунд. Для гонки до точки.",
    suggestedKey: "F9",
    group: "games",
    blocks: [
      { cmd: "jbf_uaio_speed", flags: { "-g": "T", "-i": "350", "-t": "90" } },
      { cmd: "jbf_uaio_bhop", flags: { "-g": "T", "-b": "1", "-t": "90" } },
    ],
  },
  {
    slug: "jump-day",
    label: "День прыжков",
    emoji: "🦘",
    description:
      "Все T получают 5 доп. прыжков + bhop на 90 секунд. Для jump-challenge или достичь высокой точки.",
    suggestedKey: "F10",
    group: "games",
    blocks: [
      { cmd: "jbf_uaio_double_jump", flags: { "-g": "T", "-v": "5", "-t": "90" } },
      { cmd: "jbf_uaio_bhop", flags: { "-g": "T", "-b": "1", "-t": "90" } },
    ],
  },
  {
    slug: "hide-seek",
    label: "Прятки T (60 с)",
    emoji: "👻",
    description:
      "T становятся полу-невидимыми (alpha 30) и пропадают с радара. Для hide-and-seek или ниндзя-побега.",
    suggestedKey: "F11",
    group: "games",
    blocks: [
      {
        cmd: "jbf_uaio_invisibility",
        flags: { "-g": "T", "-i": "30", "-t": "60" },
      },
      {
        cmd: "jbf_uaio_hide_from_radar",
        flags: { "-g": "T", "-b": "1", "-t": "60" },
      },
    ],
  },
  {
    slug: "low-grav-t",
    label: "Луна — низкая грав. T",
    emoji: "🌙",
    description:
      "Гравитация T = 30% на 60 секунд. Для прыжковых челленджей или просто потехи.",
    suggestedKey: "KP_PGUP",
    group: "games",
    blocks: [
      { cmd: "jbf_uaio_gravity", flags: { "-g": "T", "-i": "30", "-t": "60" } },
    ],
  },
  {
    slug: "give-awp-target",
    label: "Выдать AWP (по нику)",
    emoji: "🎯",
    description:
      "Даёт указанному игроку AWP с полной обоймой. Для дуэлей или особых дней.",
    suggestedKey: "MOUSE3",
    group: "games",
    blocks: [
      {
        cmd: "jbf_uaio_give_weapon",
        flags: { "-n": "", "-wn": "awp", "-ty": "2" },
      },
    ],
  },

  // ── utility ───────────────────────────────────────────────────────
  {
    slug: "round-reset",
    label: "Старт раунда — очистка",
    emoji: "🚦",
    description:
      "Снимает все эффекты со всех игроков (основные + наказательные + другие). Для чистого старта нового дня.",
    suggestedKey: "KP_END",
    group: "utility",
    blocks: [
      { cmd: "jbf_uaio_clear_basic", flags: { "-g": "All" } },
      { cmd: "jbf_uaio_clear_punitive", flags: { "-g": "All" } },
      { cmd: "jbf_uaio_clear_other", flags: { "-g": "All" } },
    ],
  },
  {
    slug: "respawn-t",
    label: "Поднять мёртвых T",
    emoji: "🪦",
    description:
      "Воскрешает всех мёртвых заключённых на их обычной точке. Если день требует полного состава.",
    suggestedKey: "KP_HOME",
    group: "utility",
    blocks: [
      { cmd: "jbf_uaio_respawn", flags: { "-g": "T", "-ty": "0" } },
    ],
  },
  {
    slug: "heal-target",
    label: "Полное HP (по нику)",
    emoji: "💉",
    description:
      "Восстанавливает 100 HP указанному игроку. Для LR-победителя или после ошибочной раздачи.",
    suggestedKey: "KP_INS",
    group: "utility",
    blocks: [
      { cmd: "jbf_uaio_health", flags: { "-n": "", "-i": "100" } },
    ],
  },
];
