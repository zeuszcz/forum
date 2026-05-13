"use client";

import { motion } from "framer-motion";
import {
  ChevronLeft,
  Gift,
  Hand,
  Handshake,
  Heart,
  History,
  Shield,
  Slash,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type TrustEdge = {
  other_id: number;
  other_nickname: string;
  score: number;
  last_change_at: string;
};

type TrustHistoryEntry = {
  at: string;
  action_type: string;
  actor_id: number;
  actor_nickname: string;
  target_id: number;
  target_nickname: string;
  delta: number | null;
  score_after: number | null;
};

type PlayerCard = {
  id: number;
  nickname: string;
  tattoo: string;
  block: string | null;
  cell_id: number | null;
  status: string;
};

type PlayerMe = {
  id: number;
  ap_current: number;
  ap_max: number;
};

const ACTION_LABELS: Record<string, string> = {
  visit: "Визит",
  rest: "Отдых",
  snitch: "Снитч",
  trust_gift: "Подарок",
  trust_vouch: "Поручительство",
  trust_slap: "Пощёчина",
  intel_forward: "Передача intel",
  alliance_break: "Разрыв пакта",
};

const ACTION_KINDS: Array<{
  slug: "gift" | "vouch" | "slap";
  icon: React.ReactNode;
  label: string;
  delta: number;
  blurb: string;
  color: string;
}> = [
  {
    slug: "gift",
    icon: <Gift className="h-3.5 w-3.5" />,
    label: "Подарок",
    delta: +8,
    blurb: "Сильно повышает trust. 1 AP.",
    color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  {
    slug: "vouch",
    icon: <Handshake className="h-3.5 w-3.5" />,
    label: "Поручиться",
    delta: +4,
    blurb: "Лёгкий жест доверия. 1 AP.",
    color: "border-cyan/40 bg-cyan/10 text-cyan",
  },
  {
    slug: "slap",
    icon: <Slash className="h-3.5 w-3.5" />,
    label: "Пощёчина",
    delta: -10,
    blurb: "Понизить trust. Только публично. 1 AP.",
    color: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  },
];

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-cyan";
  if (score >= 40) return "text-amber-300";
  if (score >= 20) return "text-orange-400";
  return "text-rose-400";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "союзник";
  if (score >= 60) return "симпатия";
  if (score >= 40) return "нейтрально";
  if (score >= 20) return "недоверие";
  return "враг";
}

export default function TrustPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [me, setMe] = useState<PlayerMe | null>(null);
  const [edges, setEdges] = useState<TrustEdge[]>([]);
  const [history, setHistory] = useState<TrustHistoryEntry[]>([]);
  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickFor, setPickFor] = useState<
    | { kind: "gift" | "vouch" | "slap"; targetId: number | null }
    | null
  >(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [matrix, hist, ps, st] = await Promise.all([
        api<TrustEdge[]>("/api/event/prison-break/trust"),
        api<TrustHistoryEntry[]>("/api/event/prison-break/trust/history?limit=80"),
        api<PlayerCard[]>("/api/event/prison-break/players"),
        api<{ player: PlayerMe | null }>("/api/event/prison-break/status"),
      ]);
      setEdges(matrix);
      setHistory(hist);
      setPlayers(ps);
      setMe(st.player);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить trust-матрицу.");
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

  const otherPlayers = useMemo(
    () => players.filter((p) => p.id !== me?.id && p.status === "active"),
    [players, me?.id],
  );

  const edgesByOther = useMemo(() => {
    const m = new Map<number, TrustEdge>();
    for (const e of edges) m.set(e.other_id, e);
    return m;
  }, [edges]);

  const applyAction = useCallback(async () => {
    if (!pickFor || !pickFor.targetId) return;
    setBusy(true);
    try {
      const res = await api<{
        ok: boolean;
        score: number;
        ap_remaining: number;
      }>("/api/event/prison-break/trust/action", {
        method: "POST",
        body: JSON.stringify({
          kind: pickFor.kind,
          target_player_id: pickFor.targetId,
        }),
      });
      if (res.ok) {
        toast.success(`Trust → ${res.score}`);
        setPickFor(null);
        await fetchAll();
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Не удалось.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [pickFor, fetchAll]);

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка trust-матрицы…
      </div>
    );
  }

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
        {me && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
            <Zap className="h-3.5 w-3.5 text-cyan" />
            <span className="font-mono text-bone">
              {me.ap_current}/{me.ap_max} AP
            </span>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">
          <Heart className="h-3.5 w-3.5" />
          Trust-матрица
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          0—100. Растёт от визитов, отдыха в камере, передачи intel. Падает от снитча и разрыва альянсов.
        </p>
      </div>

      {/* Action chips */}
      <div className="grid gap-2 sm:grid-cols-3">
        {ACTION_KINDS.map((k) => (
          <button
            key={k.slug}
            type="button"
            onClick={() => setPickFor({ kind: k.slug, targetId: null })}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:brightness-125",
              k.color,
            )}
          >
            <div className="mt-0.5">{k.icon}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {k.label}
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 font-mono text-[10px]",
                    k.delta >= 0
                      ? "border-emerald-500/40 text-emerald-300"
                      : "border-rose-500/40 text-rose-300",
                  )}
                >
                  {k.delta > 0 ? `+${k.delta}` : k.delta}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-smoke">{k.blurb}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Matrix */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-smoke">
          <Shield className="h-3.5 w-3.5" />
          Текущие связи
        </div>
        {otherPlayers.length === 0 ? (
          <div className="text-sm text-smoke">Нет других игроков в сезоне.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {otherPlayers
              .map((p) => ({
                player: p,
                edge: edgesByOther.get(p.id),
              }))
              .sort(
                (a, b) =>
                  (b.edge?.score ?? 50) - (a.edge?.score ?? 50) ||
                  a.player.nickname.localeCompare(b.player.nickname),
              )
              .map(({ player, edge }) => {
                const score = edge?.score ?? 50;
                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-void/40 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-bone">
                        <span>{player.tattoo}</span>
                        <span className="truncate">{player.nickname}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-smoke">
                        {player.block ? `блок ${player.block}` : "без блока"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={cn(
                          "font-mono text-lg font-bold",
                          scoreColor(score),
                        )}
                      >
                        {score}
                      </div>
                      <div
                        className={cn(
                          "text-[9px] uppercase tracking-widest",
                          scoreColor(score),
                        )}
                      >
                        {scoreLabel(score)}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* History */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-smoke">
          <History className="h-3.5 w-3.5" />
          История ({history.length})
        </div>
        {history.length === 0 ? (
          <div className="text-sm text-smoke">Ещё ничего не происходило.</div>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {history.map((h, i) => {
              const isActor = me && h.actor_id === me.id;
              const label = ACTION_LABELS[h.action_type] ?? h.action_type;
              return (
                <motion.li
                  key={`${h.at}-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-void/30 px-3 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] uppercase tracking-widest text-smoke">
                      {new Date(h.at).toLocaleString("ru-RU", {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="truncate text-bone">
                      <strong>{h.actor_nickname}</strong> → {h.target_nickname}: {label}
                    </span>
                  </div>
                  {h.delta != null && (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[11px]",
                        h.delta > 0 ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      {h.delta > 0 ? "+" : ""}
                      {h.delta}
                      {h.score_after != null && (
                        <span className="ml-1 text-smoke">→ {h.score_after}</span>
                      )}
                    </span>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal for trust action target */}
      {pickFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2 text-bone">
              <Hand className="h-4 w-4 text-cyan" />
              <span className="text-sm font-semibold">
                {ACTION_KINDS.find((k) => k.slug === pickFor.kind)?.label}
              </span>
            </div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-smoke">
              Кому?
            </label>
            <select
              value={pickFor.targetId ?? ""}
              onChange={(e) =>
                setPickFor({
                  ...pickFor,
                  targetId: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded-md border border-border bg-void/60 px-3 py-2 text-sm text-bone focus:border-cyan focus:outline-none"
            >
              <option value="">— выбери —</option>
              {otherPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.tattoo} {p.nickname}
                </option>
              ))}
            </select>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPickFor(null)}
                disabled={busy}
                className="flex-1 rounded-md border border-border bg-void/40 px-3 py-2 text-xs uppercase tracking-widest text-smoke transition-colors hover:bg-void/60 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={applyAction}
                disabled={busy || !pickFor.targetId}
                className="flex-1 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-50"
              >
                {busy ? "…" : "Применить (1 AP)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
