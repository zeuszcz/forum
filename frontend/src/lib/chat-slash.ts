/** Client-side slash-command transforms for the shoutbox composer.
 *
 * Commands rewrite the user's input into the body that actually gets POSTed
 * (or, for `/clear`, signal a side-effect call). All non-side-effect commands
 * resolve to plain markdown — the message renders identically for everyone,
 * the server doesn't need to know it came from a slash command.
 *
 * Random-roll commands run in the client RNG. That's fine for low-stakes fun;
 * if we ever need anti-cheat (gambling features, prizes), move them to a
 * /shoutbox/cmd endpoint.
 */

export interface SlashCommandResult {
  /** Final body to send via POST /shoutbox. null = the command produced no
   * message itself (the side effect handles posting). */
  body: string | null;
  /** Side-effect to run (mod-only or otherwise). */
  sideEffect?: "clear" | "mapvote";
  /** Mapvote payload when sideEffect="mapvote". */
  mapvote?: {
    question: string;
    options: string[];
    durationMin: number;
  };
  /** User-facing error if the command was malformed. */
  error?: string;
}

const ROLL_RE = /^(\d+)?d(\d+)$/i;

function parseRoll(arg: string): { dice: number; sides: number } | null {
  const m = arg.match(ROLL_RE);
  if (!m) return null;
  const dice = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2]!, 10);
  if (!Number.isFinite(dice) || !Number.isFinite(sides)) return null;
  if (dice < 1 || dice > 20 || sides < 2 || sides > 1000) return null;
  return { dice, sides };
}

function rng(max: number): number {
  // crypto.getRandomValues is fine — we just need fair small ints.
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! % max;
  }
  return Math.floor(Math.random() * max);
}

/** Match `/cmd rest`; null = not a command (or trailing-slash content like
 * "1/2/3 wins"). The leading `/` must be the very first character. */
function tokenize(raw: string): { cmd: string; rest: string } | null {
  if (!raw.startsWith("/")) return null;
  const space = raw.indexOf(" ");
  if (space === -1) return { cmd: raw.slice(1).toLowerCase(), rest: "" };
  return {
    cmd: raw.slice(1, space).toLowerCase(),
    rest: raw.slice(space + 1).trim(),
  };
}

export function applySlashCommand(
  raw: string,
  ctx: { nickname: string | null },
): SlashCommandResult {
  const trimmed = raw.trimStart();
  const tok = tokenize(trimmed);
  if (!tok) return { body: raw };

  switch (tok.cmd) {
    case "me": {
      if (!tok.rest) return { body: null, error: "Использование: /me <действие>" };
      const who = ctx.nickname ?? "anon";
      return { body: `_${who} ${tok.rest}_` };
    }
    case "shrug": {
      const suffix = tok.rest ? ` ${tok.rest}` : "";
      return { body: `¯\\\\_(ツ)_/¯${suffix}` };
    }
    case "flip": {
      const result = rng(2) === 0 ? "орёл" : "решка";
      return { body: `🪙 → **${result}**` };
    }
    case "roll": {
      const parsed = parseRoll(tok.rest || "1d6");
      if (!parsed) {
        return {
          body: null,
          error: "Использование: /roll [N]dM (например /roll 2d20)",
        };
      }
      const { dice, sides } = parsed;
      const rolls: number[] = [];
      for (let i = 0; i < dice; i++) rolls.push(1 + rng(sides));
      const sum = rolls.reduce((a, b) => a + b, 0);
      const list = dice > 1 ? ` (${rolls.join(", ")})` : "";
      return {
        body: `🎲 ${dice}d${sides}: **${sum}**${list}`,
      };
    }
    case "afk": {
      const reason = tok.rest ? `: ${tok.rest}` : "";
      return { body: `💤 AFK${reason}` };
    }
    case "lr": {
      // /lr [target] — "Last Request" callout, jail flavour.
      const target = tok.rest ? ` для **${tok.rest}**` : "";
      const who = ctx.nickname ?? "anon";
      return { body: `🎲 **${who}** просит LR${target}` };
    }
    case "freeday": {
      const target = tok.rest ? ` для **${tok.rest}**` : "";
      return { body: `🆓 **FREEDAY**${target} — гуляем 🆓` };
    }
    case "bunt": {
      return { body: `🚨 **БУНТ!** 🚨 ${tok.rest}`.trim() };
    }
    case "simon": {
      if (!tok.rest) {
        return { body: null, error: "Использование: /simon <команда>" };
      }
      return { body: `👑 *Симон сказал:* ${tok.rest}` };
    }
    case "razdacha":
    case "freekill": {
      const who = tok.rest ? ` от **${tok.rest}**` : "";
      return { body: `🍴 **РАЗДАЧА**${who} — зови админа` };
    }
    case "clear": {
      return { body: null, sideEffect: "clear" };
    }
    case "mapvote": {
      // Format: /mapvote [optional "question?"] map1 map2 [map3 [map4 [map5]]] [Nmin]
      // Trailing token with `min` suffix or pure integer 1..60 is treated as
      // duration; everything before is options. The first token can be a
      // quoted question; otherwise the question defaults to "Map vote".
      if (!tok.rest) {
        return {
          body: null,
          error: "Использование: /mapvote map1 map2 [map3 …] [Nm]",
        };
      }
      let rest = tok.rest;
      let question = "Map vote";
      const qMatch = rest.match(/^"([^"]+)"\s*(.*)$/);
      if (qMatch) {
        question = qMatch[1]!;
        rest = qMatch[2] ?? "";
      }
      const tokens = rest.split(/\s+/).filter(Boolean);
      let durationMin = 3;
      if (tokens.length > 0) {
        const last = tokens[tokens.length - 1]!;
        const m = last.match(/^(\d+)m?$/i);
        if (m && tokens.length > 2) {
          const n = parseInt(m[1]!, 10);
          if (n >= 1 && n <= 60) {
            durationMin = n;
            tokens.pop();
          }
        }
      }
      if (tokens.length < 2) {
        return { body: null, error: "Нужно минимум 2 карты" };
      }
      if (tokens.length > 5) tokens.length = 5;
      return {
        body: null,
        sideEffect: "mapvote",
        mapvote: { question, options: tokens, durationMin },
      };
    }
    default:
      return { body: raw };
  }
}

export const KNOWN_SLASH_HELP: { cmd: string; example: string; desc: string }[] = [
  { cmd: "/me", example: "/me танцует", desc: "Действие от первого лица" },
  { cmd: "/roll", example: "/roll 2d6", desc: "Бросить кубики" },
  { cmd: "/flip", example: "/flip", desc: "Подбросить монетку" },
  { cmd: "/afk", example: "/afk обед", desc: "Отойти" },
  { cmd: "/shrug", example: "/shrug", desc: "¯\\_(ツ)_/¯" },
  // Jail-flavoured
  { cmd: "/lr", example: "/lr admin", desc: "Last Request (джаил)" },
  { cmd: "/freeday", example: "/freeday me", desc: "Объявить фридей" },
  { cmd: "/bunt", example: "/bunt поднимаем", desc: "БУНТ! 🚨" },
  { cmd: "/simon", example: "/simon встать", desc: "Симон сказал…" },
  {
    cmd: "/razdacha",
    example: "/razdacha admin",
    desc: "Раздача — звать админа",
  },
  { cmd: "/clear", example: "/clear", desc: "Очистить чат (мод)" },
  {
    cmd: "/mapvote",
    example: "/mapvote jail_simple jail_alcatraz 5m",
    desc: "Голосование за карту (мод)",
  },
];
