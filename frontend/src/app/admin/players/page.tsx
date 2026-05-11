"use client";

import {
  Copy,
  Map as MapIcon,
  RotateCw,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { LetterAvatar } from "@/components/ui/avatar";
import { api, ApiError } from "@/lib/api";
import {
  type QuickAction,
  type QuickGroup,
  QUICK_ACTIONS,
  QUICK_GROUPS_ORDER,
  QUICK_GROUP_META,
  actionAnnounceColor,
  actionsByGroup,
} from "@/lib/jbf-quick-actions";
import type {
  ActiveEffect,
  CsPlayer,
  CsPlayersResponse,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const ROSTER_POLL_MS = 15_000;
const EFFECTS_POLL_MS = 4_000;

export default function PlayersPage() {
  const [data, setData] = useState<CsPlayersResponse | null>(null);
  const [effects, setEffects] = useState<ActiveEffect[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const fetchPlayers = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<CsPlayersResponse>(
        `/cs-rcon/players${force ? "?force=true" : ""}`,
      );
      setData(r);
    } catch (e) {
      if (e instanceof ApiError) setError(e.detail);
      else setError("Не удалось загрузить список");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEffects = useCallback(async (steamids: string[]) => {
    if (steamids.length === 0) {
      setEffects([]);
      return;
    }
    try {
      const qs = steamids
        .map((s) => `steamid=${encodeURIComponent(s)}`)
        .join("&");
      const r = await api<ActiveEffect[]>(`/cs-rcon/effects?${qs}`);
      setEffects(r);
    } catch {
      /* swallow — non-critical */
    }
  }, []);

  // Initial roster + periodic poll.
  useEffect(() => {
    void fetchPlayers();
  }, [fetchPlayers]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void fetchPlayers(), ROSTER_POLL_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, fetchPlayers]);

  // Effects poll — only when there are players to ask about.
  const playerSteamIds = useMemo(
    () =>
      (data?.players ?? [])
        .map((p) => p.steamid)
        .filter((s) => s && s !== "BOT"),
    [data?.players],
  );
  const steamIdsKey = playerSteamIds.join("|");

  useEffect(() => {
    void fetchEffects(playerSteamIds);
    if (!autoRefresh) return;
    const id = window.setInterval(
      () => void fetchEffects(playerSteamIds),
      EFFECTS_POLL_MS,
    );
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamIdsKey, autoRefresh, fetchEffects]);

  // Group effects by steamid for fast per-player lookup.
  const effectsByPlayer = useMemo(() => {
    const out: Record<string, ActiveEffect[]> = {};
    for (const e of effects) {
      (out[e.steamid] ||= []).push(e);
    }
    return out;
  }, [effects]);

  const runAction = useCallback(
    async (player: CsPlayer, action: QuickAction, mode: "on" | "off") => {
      const builder = action.build[mode];
      if (!builder) return;
      const command = builder(player.name);
      const verb = mode === "on" ? "выдать" : "снять";
      if (
        !window.confirm(
          `${action.emoji} ${verb} «${action.label}» → ${player.name}?\n\n${command}`,
        )
      ) {
        return;
      }
      const key = `${player.userid}:${action.slug}:${mode}`;
      setBusyKey(key);
      try {
        // Announce text is the EFFECT part only — backend prepends the
        // "[FORUM] <auth-nick> -> <target>" framing using the
        // authenticated user, target_nick from the payload, and its own
        // sanitizer (strips emoji / quotes / control chars).
        const duration =
          action.oneShot || mode === "off" ? null : (action.duration ?? null);
        const durSuffix = duration ? ` ${duration}с` : "";
        const stateSuffix = mode === "off" ? " снят" : "";
        const announce = `${action.label}${durSuffix}${stateSuffix}`;
        const announce_color = actionAnnounceColor(action, mode);
        await api("/cs-rcon/action", {
          method: "POST",
          body: JSON.stringify({
            command,
            announce,
            announce_color,
            // Always send target so the announcement has «-> nick» even
            // for one-shot actions like kill.
            target_steamid: player.steamid,
            target_nick: player.name,
            effect_slug: action.oneShot ? null : action.effectSlug,
            effect_label: action.oneShot ? null : action.label,
            effect_emoji: action.oneShot ? null : action.emoji,
            state: action.oneShot ? null : mode === "on" ? "grant" : "revoke",
            duration_s:
              action.oneShot || mode === "off" ? null : action.duration ?? null,
          }),
        });
        toast.success(
          `${action.emoji} ${
            mode === "on" ? action.label : "снят " + action.label
          } → ${player.name}`,
        );
        // Refresh effects immediately so UI reflects the new state.
        setTimeout(() => void fetchEffects(playerSteamIds), 300);
        setTimeout(() => void fetchPlayers(true), 800);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.detail);
        else toast.error("Ошибка запуска");
      } finally {
        setBusyKey(null);
      }
    },
    [fetchEffects, fetchPlayers, playerSteamIds],
  );

  const revokeEffect = useCallback(
    async (player: CsPlayer, effect: ActiveEffect) => {
      // Find the matching action so we can use its off-builder.
      const action = QUICK_ACTIONS.find(
        (a) => a.effectSlug === effect.effect_slug && a.build.off,
      );
      if (!action || !action.build.off) {
        toast.error(
          "Нет команды для снятия — используй «Снять основные» внизу",
        );
        return;
      }
      await runAction(player, action, "off");
    },
    [runAction],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-bone">
            <Users className="h-4 w-4 text-cyan" />
            Игроки на сервере
          </h1>
          <p className="text-xs text-smoke">
            Тыкаешь на эффект — он летит на сервер + в чат CS-сервера пишется
            анонс «[FORUM ник]: ...». Все действия в{" "}
            <Link href="/admin/cs-rcon-log" className="link-plasma">
              RCON-аудите
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-ash">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-3 w-3 accent-cyan"
            />
            <Zap className="h-3 w-3" />
            авто
          </label>
          <button
            type="button"
            onClick={() => {
              void fetchPlayers(true);
              void fetchEffects(playerSteamIds);
            }}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-ash hover:border-plasma/40 hover:text-bone disabled:opacity-50"
          >
            <RotateCw className={cn("h-3 w-3", loading && "animate-spin")} />
            обновить
          </button>
        </div>
      </header>

      {data && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-cyan/30 bg-cyan/5 px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-1 text-cyan">
            <Users className="h-3.5 w-3.5" />
            <span className="font-mono font-semibold">
              {data.online}/{data.max_players ?? "?"}
            </span>
            <span className="text-ash">онлайн</span>
          </span>
          {data.map && (
            <span className="inline-flex items-center gap-1 text-cyan">
              <MapIcon className="h-3.5 w-3.5" />
              <span className="font-mono">{data.map}</span>
            </span>
          )}
          {effects.length > 0 && (
            <span className="ml-auto text-[10px] text-smoke">
              эффектов активно: {effects.length}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-ember/40 bg-ember/5 p-3 text-xs text-ember">
          {error}
        </div>
      )}

      {data && data.players.length === 0 && !loading && (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-smoke">
          На сервере нет игроков. Подключайся:{" "}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText("connect 37.230.228.248:27015")
                .then(() => toast.success("connect-команда в буфере"));
            }}
            className="link-plasma"
          >
            connect 37.230.228.248:27015
          </button>
        </div>
      )}

      {data && data.players.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.players.map((p) => (
            <PlayerCard
              key={p.userid}
              player={p}
              effects={effectsByPlayer[p.steamid] ?? []}
              busyKey={busyKey}
              onAction={(a, mode) => runAction(p, a, mode)}
              onRevoke={(e) => revokeEffect(p, e)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Player card
// ─────────────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  effects,
  busyKey,
  onAction,
  onRevoke,
}: {
  player: CsPlayer;
  effects: ActiveEffect[];
  busyKey: string | null;
  onAction: (a: QuickAction, mode: "on" | "off") => void;
  onRevoke: (e: ActiveEffect) => void;
}) {
  const [tab, setTab] = useState<QuickGroup>("frequent");

  const activeBySlug = useMemo(() => {
    const out: Record<string, ActiveEffect> = {};
    for (const e of effects) out[e.effect_slug] = e;
    return out;
  }, [effects]);

  const pingTone =
    player.ping >= 200
      ? "text-ember"
      : player.ping >= 100
        ? "text-flame"
        : "text-cyan";

  function copySteam() {
    void navigator.clipboard
      .writeText(player.steamid)
      .then(() => toast.success("Steam ID в буфере"));
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-start gap-3 p-3">
        <LetterAvatar nickname={player.name} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-bone">
              {player.name}
            </h3>
            <span className="shrink-0 text-[10px] text-smoke">
              #{player.slot}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-[11px] text-smoke">
            <button
              type="button"
              onClick={copySteam}
              className="inline-flex items-center gap-1 font-mono hover:text-ash"
              title="Скопировать Steam ID"
            >
              {player.steamid}
              <Copy className="h-2.5 w-2.5 opacity-50" />
            </button>
            <span className={cn("font-mono", pingTone)}>{player.ping} ms</span>
            <span className="font-mono">
              {player.frag} {player.frag === 1 ? "фраг" : "фрагов"}
            </span>
            <span className="font-mono text-smoke/70">{player.time}</span>
          </div>
        </div>
      </div>

      {/* Active effects strip */}
      {effects.length > 0 && (
        <div className="border-t border-border bg-void/30 px-3 py-2">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-smoke">
            активные эффекты ({effects.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {effects.map((e) => (
              <ActiveEffectBadge
                key={e.effect_slug}
                effect={e}
                onRevoke={() => onRevoke(e)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 border-t border-border bg-card/60 px-1.5">
        {QUICK_GROUPS_ORDER.map((g) => {
          const meta = QUICK_GROUP_META[g];
          const active = tab === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setTab(g)}
              className={cn(
                "inline-flex items-center gap-1 border-b-2 px-2.5 py-1.5 text-[11px] transition-colors",
                active
                  ? `${meta.tone.split(" ").find((c) => c.startsWith("text-")) ?? "text-bone"} border-current`
                  : "border-transparent text-smoke hover:text-ash",
              )}
            >
              <span>{meta.emoji}</span>
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="border-t border-border px-3 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          {actionsByGroup(tab).map((a) => {
            const active = activeBySlug[a.effectSlug];
            const isActive = !a.oneShot && active != null;
            const mode: "on" | "off" = isActive ? "off" : "on";
            const key = `${player.userid}:${a.slug}:${mode}`;
            const busy = busyKey === key;
            return (
              <button
                key={a.slug}
                type="button"
                onClick={() => onAction(a, mode)}
                disabled={busy || (mode === "off" && !a.build.off)}
                title={a.hint}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  isActive
                    ? "border-flame/60 bg-flame/15 text-flame"
                    : a.tone,
                )}
              >
                <span aria-hidden>{a.emoji}</span>
                <span>{a.label}</span>
                {isActive && (
                  <span className="font-mono text-[9px] uppercase tracking-widest">
                    ON
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Active effect badge (with live countdown)
// ─────────────────────────────────────────────────────────────────────

function ActiveEffectBadge({
  effect,
  onRevoke,
}: {
  effect: ActiveEffect;
  onRevoke: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!effect.expires_at) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [effect.expires_at]);

  const expiresAt = effect.expires_at ? new Date(effect.expires_at).getTime() : null;
  const remainingSec =
    expiresAt != null ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;
  const isPermanent = expiresAt == null;
  const isExpiring = remainingSec != null && remainingSec <= 5;

  return (
    <span
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-md border bg-card pl-1.5 pr-0.5 py-0.5 text-[11px] transition-colors",
        isPermanent
          ? "border-plasma/40 text-plasma"
          : isExpiring
            ? "border-ember/50 text-ember animate-pulse"
            : "border-flame/40 text-flame",
      )}
      title={
        effect.granted_by_nickname
          ? `Выдал @${effect.granted_by_nickname}`
          : undefined
      }
    >
      {effect.effect_emoji && <span aria-hidden>{effect.effect_emoji}</span>}
      <span>{effect.effect_label}</span>
      {remainingSec != null && (
        <span className="font-mono text-[10px] opacity-80">
          {Math.floor(remainingSec / 60)}:
          {String(remainingSec % 60).padStart(2, "0")}
        </span>
      )}
      {isPermanent && (
        <span className="font-mono text-[9px] opacity-80 uppercase">∞</span>
      )}
      <button
        type="button"
        onClick={onRevoke}
        title="Снять эффект"
        className="ml-0.5 rounded p-0.5 opacity-50 transition-opacity hover:bg-void/40 hover:opacity-100"
        aria-label="Снять"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}
