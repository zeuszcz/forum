"use client";

import { motion } from "framer-motion";
import {
  ChevronLeft,
  Coins,
  Crown,
  History,
  Play,
  Plus,
  Skull,
  Swords,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type ArenaMatch = {
  id: number;
  event_id: number;
  player_a_id: number;
  player_b_id: number;
  status: "pending" | "active" | "finished" | "cancelled" | "forfeit";
  winner_id: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  loadout_a: string[];
  loadout_b: string[];
  is_a: boolean;
  is_b: boolean;
  is_participant: boolean;
};

type PlayerCard = {
  id: number;
  nickname: string;
  tattoo: string;
  block: string | null;
  status: string;
};

type PlayerMe = { id: number; money: number };

type Loadout = { specials: string[]; wins: number; losses: number };

const STATUS_META: Record<ArenaMatch["status"], { label: string; color: string }> = {
  pending: { label: "Вызов", color: "text-amber-300" },
  active: { label: "Идёт бой", color: "text-emerald-400" },
  finished: { label: "Завершён", color: "text-cyan" },
  cancelled: { label: "Отменён", color: "text-smoke" },
  forfeit: { label: "Сдача", color: "text-rose-400" },
};

export default function ArenaLobbyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [me, setMe] = useState<PlayerMe | null>(null);
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [active, setActive] = useState<ArenaMatch[]>([]);
  const [history, setHistory] = useState<ArenaMatch[]>([]);
  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [chosenOpp, setChosenOpp] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [st, ld, act, hist, ps] = await Promise.all([
        api<{ player: PlayerMe | null }>("/api/event/prison-break/status"),
        api<Loadout>("/api/event/prison-break/arena/loadout"),
        api<ArenaMatch[]>("/api/event/prison-break/arena/matches"),
        api<ArenaMatch[]>("/api/event/prison-break/arena/history?limit=15"),
        api<PlayerCard[]>("/api/event/prison-break/players"),
      ]);
      setMe(st.player);
      setLoadout(ld);
      setActive(act);
      setHistory(hist);
      setPlayers(ps);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить арену.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (user === null) {
      router.push("/login");
      return;
    }
    if (user) void fetchAll();
  }, [user, fetchAll, router]);

  const playerById = useMemo(() => {
    const m = new Map<number, PlayerCard>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const otherPlayers = useMemo(
    () => players.filter((p) => p.id !== me?.id && p.status === "active"),
    [players, me?.id],
  );

  const submitChallenge = useCallback(async () => {
    if (!chosenOpp) return;
    setBusy(true);
    try {
      await api<ArenaMatch>("/api/event/prison-break/arena/challenge", {
        method: "POST",
        body: JSON.stringify({ opponent_player_id: chosenOpp }),
      });
      toast.success("Вызов отправлен.");
      setChallengeOpen(false);
      setChosenOpp(null);
      await fetchAll();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Ошибка.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [chosenOpp, fetchAll]);

  const callMatch = useCallback(
    async (m: ArenaMatch, kind: "accept" | "decline" | "forfeit") => {
      setBusy(true);
      try {
        const res = await api<ArenaMatch>(
          `/api/event/prison-break/arena/${m.id}/${kind}`,
          { method: "POST" },
        );
        toast.success(`Статус: ${res.status}`);
        if (kind === "accept" || res.status === "active") {
          router.push(`/event/prison-break/arena/${m.id}`);
          return;
        }
        await fetchAll();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : "Ошибка.";
        toast.error(msg);
      } finally {
        setBusy(false);
      }
    },
    [router, fetchAll],
  );

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка…
      </div>
    );
  }

  const needsLoadout = !loadout || loadout.specials.length < 3;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/event/prison-break"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          К дашборду
        </Link>
        <div className="flex items-center gap-2">
          {me && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-mono text-bone">{me.money} 🪙</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-rose-300">
          <Swords className="h-3.5 w-3.5" />
          Арена · 1×1 фристайл
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          12 спецприёмов, server-tick 15Hz, длительность матча 90с.
          Сначала собери loadout из 3 приёмов, потом вызывай.
        </p>
      </div>

      {/* Loadout summary */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end rounded-lg border border-border bg-card p-4">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-smoke">
            Мой loadout
          </div>
          {needsLoadout ? (
            <p className="text-sm text-amber-300">
              Loadout не собран. Выбери 3 приёма, чтобы начать.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {loadout!.specials.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan/40 bg-cyan/10 px-2 py-1 font-mono text-xs text-cyan"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-4 text-[11px] text-smoke">
            <span>
              W: <span className="text-emerald-400">{loadout?.wins ?? 0}</span>
            </span>
            <span>
              L: <span className="text-rose-400">{loadout?.losses ?? 0}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/event/prison-break/arena/loadout"
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20"
          >
            <Trophy className="h-3.5 w-3.5" />
            {needsLoadout ? "Собрать loadout" : "Поменять"}
          </Link>
          <button
            type="button"
            onClick={() => setChallengeOpen(true)}
            disabled={needsLoadout}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Вызов
          </button>
        </div>
      </div>

      {/* Active matches */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-smoke">
          Активные / вызовы ({active.length})
        </div>
        {active.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-void/30 p-6 text-center text-xs text-smoke">
            Никто никого не вызвал.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {active.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                me={me}
                playerById={playerById}
                onAct={callMatch}
                busy={busy}
              />
            ))}
          </ul>
        )}
      </div>

      {/* History */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
          <History className="h-3 w-3" />
          История
        </div>
        {history.length === 0 ? (
          <div className="text-xs text-smoke italic">Боёв ещё не было.</div>
        ) : (
          <ul className="space-y-1">
            {history.map((m) => {
              const a = playerById.get(m.player_a_id);
              const b = playerById.get(m.player_b_id);
              const winnerNick =
                m.winner_id === m.player_a_id
                  ? a?.nickname
                  : m.winner_id === m.player_b_id
                    ? b?.nickname
                    : null;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-void/30 px-3 py-1.5 text-xs"
                >
                  <Link
                    href={`/event/prison-break/arena/${m.id}`}
                    className="flex flex-1 items-center gap-2 hover:underline"
                  >
                    <span className="text-bone">{a?.nickname ?? "?"}</span>
                    <span className="text-smoke">vs</span>
                    <span className="text-bone">{b?.nickname ?? "?"}</span>
                  </Link>
                  <span className="text-[10px] uppercase tracking-widest text-smoke">
                    {STATUS_META[m.status]?.label ?? m.status}
                  </span>
                  {winnerNick && (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <Crown className="h-3 w-3" />
                      {winnerNick}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Challenge modal */}
      {challengeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur">
          <div className="w-full max-w-md rounded-xl border border-rose-500/40 bg-card p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2 text-rose-300">
              <Swords className="h-4 w-4" />
              <span className="text-sm font-semibold">Вызвать на арену</span>
            </div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-smoke">
              Противник
            </label>
            <select
              value={chosenOpp ?? ""}
              onChange={(e) =>
                setChosenOpp(e.target.value ? Number(e.target.value) : null)
              }
              className="mb-3 w-full rounded-md border border-border bg-void/60 px-3 py-2 text-sm text-bone focus:border-rose-500/60 focus:outline-none"
            >
              <option value="">— выбери —</option>
              {otherPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.tattoo} {p.nickname}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setChallengeOpen(false);
                  setChosenOpp(null);
                }}
                disabled={busy}
                className="flex-1 rounded-md border border-border bg-void/40 px-3 py-2 text-xs uppercase tracking-widest text-smoke transition-colors hover:bg-void/60 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={submitChallenge}
                disabled={busy || !chosenOpp}
                className="flex-1 rounded-md border border-rose-500/50 bg-rose-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-rose-200 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
              >
                {busy ? "…" : "Бросить вызов"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchRow({
  match,
  playerById,
  onAct,
  busy,
}: {
  match: ArenaMatch;
  me: PlayerMe | null;
  playerById: Map<number, { nickname: string; tattoo: string }>;
  onAct: (m: ArenaMatch, k: "accept" | "decline" | "forfeit") => void;
  busy: boolean;
}) {
  const a = playerById.get(match.player_a_id);
  const b = playerById.get(match.player_b_id);
  const meta = STATUS_META[match.status];
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3"
    >
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-bone">
          {a?.tattoo} {a?.nickname ?? `#${match.player_a_id}`}
        </span>
        <span className="text-smoke">vs</span>
        <span className="text-sm font-semibold text-bone">
          {b?.tattoo} {b?.nickname ?? `#${match.player_b_id}`}
        </span>
      </div>
      <span
        className={cn(
          "rounded-md border border-border bg-void/40 px-2 py-0.5 text-[10px] uppercase tracking-widest",
          meta.color,
        )}
      >
        {meta.label}
      </span>
      {/* Actions */}
      {match.status === "pending" && match.is_b && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onAct(match, "accept")}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <Play className="h-3 w-3" />
            принять
          </button>
          <button
            type="button"
            onClick={() => onAct(match, "decline")}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-void/40 px-2 py-1 text-[10px] uppercase tracking-widest text-smoke hover:bg-void/60 disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            отклонить
          </button>
        </div>
      )}
      {match.status === "pending" && match.is_a && (
        <button
          type="button"
          onClick={() => onAct(match, "decline")}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-void/40 px-2 py-1 text-[10px] uppercase tracking-widest text-smoke hover:bg-void/60 disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          отозвать
        </button>
      )}
      {match.status === "active" && match.is_participant && (
        <>
          <Link
            href={`/event/prison-break/arena/${match.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-cyan/40 bg-cyan/10 px-2 py-1 text-[10px] uppercase tracking-widest text-cyan hover:bg-cyan/20"
          >
            <Play className="h-3 w-3" />
            в бой
          </Link>
          <button
            type="button"
            onClick={() => onAct(match, "forfeit")}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] uppercase tracking-widest text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
          >
            <Skull className="h-3 w-3" />
            сдаться
          </button>
        </>
      )}
      {match.status === "active" && !match.is_participant && (
        <Link
          href={`/event/prison-break/arena/${match.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-widest text-amber-300 hover:bg-amber-500/20"
        >
          <Zap className="h-3 w-3" />
          смотреть
        </Link>
      )}
    </motion.li>
  );
}
