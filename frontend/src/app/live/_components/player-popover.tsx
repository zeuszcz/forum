"use client";

import {
  AlertTriangle,
  ExternalLink,
  History,
  Link2,
  Send,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import {
  QUICK_ACTIONS,
  type QuickAction,
  type QuickGroup,
} from "@/lib/jbf-quick-actions";
import type { CsRconLogRead, UserPublic } from "@/lib/types";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Local types — re-declared so we don't import from page.tsx (avoid cycles).
// -----------------------------------------------------------------------------
export type PopoverPlayer = {
  userid: number;
  team: number;
  hp: number;
  money: number | null;
  weapon: string | null;
  kills: number | null;
  deaths: number | null;
  flags: string | null;
  nick: string;
};

export type PopoverRoster = {
  userid: number;
  steamid: string;
  frag: number;
  time: string;
  ping: number;
  loss: number;
  addr: string;
};

type ActiveEffect = {
  steamid: string;
  effect_slug: string;
  effect_label: string;
  effect_emoji: string | null;
  granted_by_id: number | null;
  granted_by_nickname: string | null;
  granted_at: string;
  expires_at: string | null;
  player_nick: string | null;
};

type PlayerDetail = {
  steamid: string;
  active_effects: ActiveEffect[];
  recent_actions: CsRconLogRead[];
  forum_user: UserPublic | null;
};

export type ActionRunner = (
  target: { userid: number; nick: string; steamid: string | null },
  action: QuickAction,
  mode: "on" | "off",
) => Promise<void>;

// -----------------------------------------------------------------------------
// Helpers (local copies; trivial pure functions)
// -----------------------------------------------------------------------------
function teamColor(team: number): string {
  if (team === 1) return "#e7572f";
  if (team === 2) return "#5fb3e9";
  return "#9ea0a8";
}
function teamLabel(team: number): string {
  if (team === 1) return "T";
  if (team === 2) return "CT";
  return "SPEC";
}
function hpColor(hp: number): string {
  if (hp <= 0) return "#666";
  if (hp > 50) return "#5ce86b";
  if (hp > 20) return "#ffd23f";
  return "#e75050";
}

// Confirm gate for the few actions that are noisy or destructive enough
// to want a second click before going through.
const CONFIRM_SLUGS = new Set<string>([
  "kill",
  "disarm",
  "bury",
  "explode",
  "swap-team",
  "kick",
]);

// -----------------------------------------------------------------------------
// Tab order
// -----------------------------------------------------------------------------
type Tab = QuickGroup | "history" | "chat";
const TAB_ORDER: Tab[] = ["frequent", "effects", "games", "clear", "chat", "history"];
const TAB_LABEL: Record<Tab, string> = {
  frequent: "Часто",
  effects: "Эффекты",
  games: "Геймплей",
  clear: "Очистка",
  chat: "Чат",
  history: "История",
};
const TAB_EMOJI: Record<Tab, string> = {
  frequent: "⚡",
  effects: "🎲",
  games: "🎮",
  clear: "🧹",
  chat: "💬",
  history: "📜",
};

const ACTIONS_BY_GROUP: Record<QuickGroup, QuickAction[]> = (() => {
  const out: Record<QuickGroup, QuickAction[]> = {
    frequent: [],
    effects: [],
    games: [],
    clear: [],
  };
  for (const a of QUICK_ACTIONS) {
    if (out[a.group]) out[a.group]!.push(a);
  }
  return out;
})();

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export function PlayerPopover({
  player,
  roster,
  isStaff,
  onClose,
  onFollow,
  onAction,
  onPrivateSay,
  onKick,
  onForumMute,
  onForumBan,
}: {
  player: PopoverPlayer;
  roster: PopoverRoster | null;
  isStaff: boolean;
  onClose: () => void;
  onFollow: () => void;
  onAction: ActionRunner;
  onPrivateSay: (userid: number, text: string) => Promise<void>;
  onKick: (nick: string, reason: string) => Promise<void>;
  onForumMute: (userId: number, durationMin: number) => Promise<void>;
  onForumBan: (userId: number, reason: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("frequent");
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [psayText, setPsayText] = useState("");
  const [kickReason, setKickReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // slug of action in flight

  // -- Load aggregate (active effects + history + forum profile) -----
  useEffect(() => {
    if (!isStaff || !roster?.steamid) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api<PlayerDetail>(
      `/live/player-detail?steamid=${encodeURIComponent(roster.steamid)}&nick=${encodeURIComponent(player.nick)}&history_limit=15`,
    )
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roster?.steamid, player.nick, isStaff]);

  // -- Active effect slugs (so a togglable action knows whether to fire on/off)
  const activeSlugs = useMemo(() => {
    const s = new Set<string>();
    for (const e of detail?.active_effects ?? []) s.add(e.effect_slug);
    return s;
  }, [detail]);

  const target = {
    userid: player.userid,
    nick: player.nick,
    steamid: roster?.steamid ?? null,
  };

  // -- Run action with confirm/busy/mode toggle handling -------------
  const runAction = async (action: QuickAction) => {
    const isActive = activeSlugs.has(action.effectSlug);
    const mode: "on" | "off" =
      action.build.off && isActive ? "off" : "on";

    if (CONFIRM_SLUGS.has(action.effectSlug) && mode === "on") {
      const ok = window.confirm(
        `${action.hint || action.label} для ${player.nick}?`,
      );
      if (!ok) return;
    }
    setBusy(action.slug);
    try {
      await onAction(target, action, mode);
    } finally {
      setBusy(null);
    }
  };

  // -- Private say submit --------------------------------------------
  const submitPsay = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = psayText.trim();
    if (!t) return;
    setBusy("psay");
    try {
      await onPrivateSay(player.userid, t);
      setPsayText("");
    } finally {
      setBusy(null);
    }
  };

  // -- Kick --------------------------------------------
  const submitKick = async (e: React.FormEvent) => {
    e.preventDefault();
    const reason = kickReason.trim() || "kicked from forum";
    const ok = window.confirm(
      `Кикнуть ${player.nick} с сервера? Причина: ${reason}`,
    );
    if (!ok) return;
    setBusy("kick");
    try {
      await onKick(player.nick, reason);
      setKickReason("");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="absolute right-3 top-3 z-20 flex max-h-[88vh] w-[460px] flex-col overflow-hidden rounded-lg border border-border bg-card/95 shadow-2xl backdrop-blur">
      {/* Header */}
      <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <div
            className="truncate text-base font-semibold tracking-tight"
            style={{ color: teamColor(player.team) }}
          >
            {player.nick}
            {detail?.forum_user && (
              <Link
                href={`/u/${detail.forum_user.nickname}`}
                className="ml-1.5 inline-flex h-5 items-center gap-0.5 rounded border border-plasma/40 bg-plasma/10 px-1 text-[9px] uppercase tracking-widest text-plasma transition-colors hover:bg-plasma/20"
                title="Привязан к форум-юзеру"
              >
                <Link2 className="h-2.5 w-2.5" />
                forum
              </Link>
            )}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-smoke">
            team {teamLabel(player.team)} · userid #{player.userid}
            {roster && (
              <>
                {" · "}<span className="font-mono">{roster.steamid}</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-smoke transition-colors hover:text-bone"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-1.5 border-b border-border bg-void/30 px-3 py-2.5 text-center font-mono text-[11px]">
        <Cell label="HP" value={String(player.hp)} tone={hpColor(player.hp)} />
        <Cell
          label="K/D"
          value={
            player.kills != null ? `${player.kills}/${player.deaths ?? 0}` : "—"
          }
        />
        <Cell
          label="Money"
          value={player.money != null ? `$${player.money}` : "—"}
        />
        <Cell label="Weapon" value={player.weapon ?? "—"} />
        <Cell label="Ping" value={roster ? `${roster.ping}ms` : "—"} />
        <Cell label="Time" value={roster?.time ?? "—"} />
      </div>

      {/* Active effects strip */}
      {(detail?.active_effects?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-border bg-plasma/5 px-3 py-2">
          {detail!.active_effects.map((e) => (
            <span
              key={e.steamid + e.effect_slug}
              className="inline-flex h-5 items-center gap-1 rounded-full border border-plasma/40 bg-plasma/10 px-2 text-[10px] uppercase tracking-widest text-plasma"
              title={
                e.expires_at
                  ? `до ${new Date(e.expires_at).toLocaleTimeString()}`
                  : "бессрочно"
              }
            >
              {e.effect_emoji ? <span>{e.effect_emoji}</span> : null}
              {e.effect_label}
            </span>
          ))}
        </div>
      )}

      {/* Camera follow */}
      <div className="flex gap-1.5 px-3 pt-2.5">
        <button
          type="button"
          onClick={onFollow}
          className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-flame/40 bg-flame/10 text-[10px] uppercase tracking-widest text-flame transition-colors hover:bg-flame/15"
        >
          <Target className="h-3 w-3" />
          Камера за ним
        </button>
        {detail?.forum_user && (
          <Link
            href={`/u/${detail.forum_user.nickname}`}
            className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-plasma/40 bg-plasma/10 px-3 text-[10px] uppercase tracking-widest text-plasma transition-colors hover:bg-plasma/15"
          >
            <ExternalLink className="h-3 w-3" />
            Профиль
          </Link>
        )}
      </div>

      {/* Tabs */}
      <nav className="mt-3 flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 pb-1.5 text-[10px] uppercase tracking-widest">
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 rounded-md border px-2 py-1 transition-colors",
              tab === t
                ? "border-cyan/40 bg-cyan/10 text-cyan"
                : "border-transparent text-smoke hover:text-bone",
            )}
          >
            <span className="mr-1">{TAB_EMOJI[t]}</span>
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      {/* Tab body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!isStaff ? (
          <p className="text-center text-xs text-smoke">
            Действия только для модераторов. Гости видят только публичную карту.
          </p>
        ) : tab === "history" ? (
          <HistoryTab loading={detailLoading} rows={detail?.recent_actions ?? []} />
        ) : tab === "chat" ? (
          <ChatTab
            psayText={psayText}
            setPsayText={setPsayText}
            submitPsay={submitPsay}
            busy={busy === "psay"}
          />
        ) : (
          <ActionGrid
            actions={ACTIONS_BY_GROUP[tab]}
            activeSlugs={activeSlugs}
            onRun={runAction}
            busySlug={busy}
          />
        )}
      </div>

      {/* Footer — destructive zone */}
      {isStaff && (
        <footer className="shrink-0 space-y-2 border-t border-ember/30 bg-ember/5 px-3 py-2.5">
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-ember">
              <AlertTriangle className="h-3 w-3" />
              Опасная зона
            </summary>
            <div className="mt-2 space-y-2">
              <form onSubmit={submitKick} className="flex items-stretch gap-1">
                <input
                  type="text"
                  value={kickReason}
                  onChange={(e) => setKickReason(e.target.value)}
                  placeholder="Причина кика (опционально)"
                  maxLength={120}
                  className="h-7 flex-1 rounded-md border border-border bg-void/40 px-2 text-[11px] text-ash outline-none transition-colors placeholder:text-smoke focus:border-ember/60"
                />
                <button
                  type="submit"
                  disabled={busy === "kick"}
                  className="inline-flex h-7 items-center justify-center rounded-md border border-ember/50 bg-ember/15 px-3 text-[10px] uppercase tracking-widest text-ember transition-colors hover:bg-ember/25 disabled:opacity-50"
                >
                  Kick
                </button>
              </form>
              {detail?.forum_user && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy === "forum_mute"}
                    onClick={async () => {
                      const ok = window.confirm(
                        `Мут в чате форума ${detail!.forum_user!.nickname} на 60 мин?`,
                      );
                      if (!ok) return;
                      setBusy("forum_mute");
                      try {
                        await onForumMute(detail!.forum_user!.id, 60);
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="inline-flex h-7 flex-1 items-center justify-center rounded-md border border-flame/40 bg-flame/10 text-[10px] uppercase tracking-widest text-flame transition-colors hover:bg-flame/15 disabled:opacity-50"
                  >
                    Mute форум 60м
                  </button>
                  <button
                    type="button"
                    disabled={busy === "forum_ban"}
                    onClick={async () => {
                      const reason = window.prompt(
                        `Бан форум-юзера ${detail!.forum_user!.nickname}. Причина?`,
                        "",
                      );
                      if (reason == null) return;
                      setBusy("forum_ban");
                      try {
                        await onForumBan(detail!.forum_user!.id, reason);
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="inline-flex h-7 flex-1 items-center justify-center rounded-md border border-ember/40 bg-ember/10 text-[10px] uppercase tracking-widest text-ember transition-colors hover:bg-ember/15 disabled:opacity-50"
                  >
                    Ban форум
                  </button>
                </div>
              )}
            </div>
          </details>
        </footer>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------
function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card/60 px-2 py-1">
      <div className="text-[9px] uppercase tracking-widest text-smoke/70">
        {label}
      </div>
      <div className="truncate text-ash" style={tone ? { color: tone } : {}}>
        {value}
      </div>
    </div>
  );
}

function ActionGrid({
  actions,
  activeSlugs,
  onRun,
  busySlug,
}: {
  actions: QuickAction[];
  activeSlugs: Set<string>;
  onRun: (a: QuickAction) => void;
  busySlug: string | null;
}) {
  if (!actions.length) {
    return (
      <p className="text-center text-xs text-smoke">
        Нет действий в этой группе.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {actions.map((a) => {
        const active = activeSlugs.has(a.effectSlug);
        const isBusy = busySlug === a.slug;
        return (
          <button
            key={a.slug}
            type="button"
            onClick={() => onRun(a)}
            disabled={isBusy}
            title={a.hint}
            className={cn(
              "inline-flex h-9 items-center justify-start gap-1.5 rounded-md border bg-card px-2 text-left text-[11px] transition-colors disabled:cursor-wait disabled:opacity-50",
              active
                ? "border-plasma/60 bg-plasma/15 text-bone hover:bg-plasma/25"
                : a.tone,
            )}
          >
            <span className="shrink-0 text-base leading-none">{a.emoji}</span>
            <span className="min-w-0 flex-1 truncate">{a.label}</span>
            {a.duration != null && !active && (
              <span className="shrink-0 font-mono text-[9px] text-smoke">
                {a.duration < 60 ? `${a.duration}s` : `${Math.floor(a.duration / 60)}m`}
              </span>
            )}
            {active && a.build.off && (
              <span className="shrink-0 rounded bg-plasma/30 px-1 text-[8px] uppercase tracking-widest">
                off
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ChatTab({
  psayText,
  setPsayText,
  submitPsay,
  busy,
}: {
  psayText: string;
  setPsayText: (s: string) => void;
  submitPsay: (e: React.FormEvent) => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-smoke">
        Личное сообщение игроку через <code className="font-mono text-iridescent">amx_psay</code>.
        В игре будет с префиксом <code className="font-mono text-iridescent">[FORUM &lt;твой ник&gt;] ::</code>.
        Эмодзи/CJK будут вырезаны.
      </p>
      <form onSubmit={submitPsay} className="flex items-stretch gap-1">
        <input
          type="text"
          value={psayText}
          onChange={(e) => setPsayText(e.target.value)}
          placeholder="Личное в игре…"
          maxLength={200}
          className="h-8 flex-1 rounded-md border border-border bg-void/40 px-2 text-[12px] text-ash outline-none transition-colors placeholder:text-smoke focus:border-plasma/60"
        />
        <button
          type="submit"
          disabled={!psayText.trim() || busy}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-plasma px-3 text-[11px] text-white transition-all hover:bg-plasma-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3 w-3" />
          Отправить
        </button>
      </form>
    </div>
  );
}

function HistoryTab({
  loading,
  rows,
}: {
  loading: boolean;
  rows: CsRconLogRead[];
}) {
  if (loading) {
    return <p className="text-center text-xs text-smoke">загрузка истории…</p>;
  }
  if (!rows.length) {
    return (
      <p className="text-center text-xs text-smoke">
        Нет недавних admin-действий на этого игрока.
      </p>
    );
  }
  return (
    <ol className="space-y-1.5 font-mono text-[11px]">
      {rows.map((r) => {
        const dt = new Date(r.created_at);
        const shortTime = dt.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const cmd = r.command.length > 80 ? r.command.slice(0, 77) + "…" : r.command;
        return (
          <li
            key={r.id}
            className={cn(
              "rounded-md border px-2 py-1.5",
              r.success
                ? "border-border bg-void/30"
                : "border-ember/40 bg-ember/5",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-plasma">
                {r.actor_nickname ?? `user#${r.actor_id ?? "?"}`}
              </span>
              <span className="text-[9px] text-smoke">{shortTime}</span>
            </div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <History className="h-2.5 w-2.5 shrink-0 text-smoke" />
              <span className="break-all text-ash/90">{cmd}</span>
            </div>
            {!r.success && r.error && (
              <div className="mt-0.5 text-[9px] text-ember">err: {r.error}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
