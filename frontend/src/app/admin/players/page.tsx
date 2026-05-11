"use client";

import {
  ChevronDown,
  Copy,
  Map as MapIcon,
  RotateCw,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { LetterAvatar } from "@/components/ui/avatar";
import { api, ApiError } from "@/lib/api";
import {
  QUICK_ACTIONS,
  QUICK_GROUP_LABEL,
  QUICK_GROUP_TONE,
  type QuickAction,
} from "@/lib/jbf-quick-actions";
import type { CsPlayer, CsPlayersResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_MS = 15_000;

export default function PlayersPage() {
  const [data, setData] = useState<CsPlayersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [busyPlayer, setBusyPlayer] = useState<string | null>(null);

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

  useEffect(() => {
    void fetchPlayers();
  }, [fetchPlayers]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void fetchPlayers(), POLL_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, fetchPlayers]);

  const runAction = useCallback(
    async (player: CsPlayer, action: QuickAction) => {
      const command = action.build(player.name);
      if (
        !window.confirm(
          `${action.emoji} ${action.label} для «${player.name}»?\n\n${action.hint}.\n\n${command}`,
        )
      ) {
        return;
      }
      setBusyPlayer(player.name);
      try {
        await api("/cs-rcon/execute", {
          method: "POST",
          body: JSON.stringify({ command }),
        });
        toast.success(`${action.emoji} ${action.label} → ${player.name}`);
        // Force-refresh so the player's frag/ping update on next tick.
        setTimeout(() => void fetchPlayers(true), 800);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.detail);
        else toast.error("Ошибка запуска");
      } finally {
        setBusyPlayer(null);
      }
    },
    [fetchPlayers],
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
            Live-снимок с CS-сервера через RCON{" "}
            <code className="font-mono text-ash">status</code>. Тыкаешь на
            кнопку — действие летит на сервер. Каждое действие пишется в{" "}
            <Link href="/admin/cs-rcon-log" className="link-plasma">
              RCON-аудит
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
            авто-обновление (15 с)
          </label>
          <button
            type="button"
            onClick={() => fetchPlayers(true)}
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
              busy={busyPlayer === p.name}
              onAction={(a) => runAction(p, a)}
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
  busy,
  onAction,
}: {
  player: CsPlayer;
  busy: boolean;
  onAction: (a: QuickAction) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const groupedActions = useMemo(() => {
    const out: Record<QuickAction["group"], QuickAction[]> = {
      punish: [],
      help: [],
      fun: [],
    };
    for (const a of QUICK_ACTIONS) out[a.group].push(a);
    return out;
  }, []);

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
    <div
      className={cn(
        "rounded-lg border bg-card transition-all",
        busy ? "border-plasma/60 opacity-70" : "border-border",
      )}
    >
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

      <div className="border-t border-border px-3 py-2">
        {(Object.keys(groupedActions) as QuickAction["group"][]).map((g) => {
          const list = expanded ? groupedActions[g] : groupedActions[g].slice(0, 3);
          if (list.length === 0) return null;
          return (
            <div key={g} className="mb-1.5 last:mb-0">
              <div
                className={cn(
                  "mb-1 text-[9px] font-semibold uppercase tracking-widest",
                  QUICK_GROUP_TONE[g],
                )}
              >
                {QUICK_GROUP_LABEL[g]}
              </div>
              <div className="flex flex-wrap gap-1">
                {list.map((a) => (
                  <button
                    key={a.slug}
                    type="button"
                    onClick={() => onAction(a)}
                    disabled={busy}
                    title={a.hint}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      a.tone,
                    )}
                  >
                    <span aria-hidden>{a.emoji}</span>
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 inline-flex items-center gap-1 text-[10px] text-smoke hover:text-ash"
        >
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
          />
          {expanded ? "свернуть" : "ещё действия"}
        </button>
      </div>
    </div>
  );
}
