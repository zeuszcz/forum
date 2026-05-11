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
   * message itself (e.g. /clear triggers a server call instead). */
  body: string | null;
  /** Side-effect to run (mod-only or otherwise). */
  sideEffect?: "clear";
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
    case "clear": {
      return { body: null, sideEffect: "clear" };
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
  { cmd: "/clear", example: "/clear", desc: "Очистить чат (мод)" },
];
