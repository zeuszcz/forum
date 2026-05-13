"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { motion } from "framer-motion";
import {
  ChevronLeft,
  Crown,
  Eye,
  Flame,
  Heart,
  Skull,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type IsoCell = {
  id: number;
  block: string;
  number: number;
  tunnel_progress: number;
  tunnel_discovered: boolean;
  locked_until: string | null;
  members: Array<{
    id: number;
    nickname: string;
    tattoo: string;
    status: string;
    revealed_role: string | null;
  }>;
};

type IsoSnapshot = {
  event: Record<string, any>;
  cells: IsoCell[];
  guards_unassigned: Array<{
    id: number;
    nickname: string;
    tattoo: string;
    block: string | null;
    status: string;
    revealed_role: string | null;
  }>;
  arena_active: Array<{ id: number; player_a_id: number; player_b_id: number }>;
  alliances_active: number;
  ts: string;
};

type TallyEntry = { target_id: number; target_nickname: string; count: number };
type Tally = { boss: TallyEntry[]; snitch: TallyEntry[]; hero: TallyEntry[] };

type Outcome = {
  escaped_player_ids: number[];
  escape_count: number;
  escape_rate: number;
  boss_correct_votes: number;
  boss_voter_count: number;
  boss_correctly_identified: boolean;
  winning_side: string;
  most_voted: Record<string, number>;
  payouts: Record<string, number>;
};

type PlayerCard = {
  id: number;
  nickname: string;
  tattoo: string;
  block: string | null;
  status: string;
  revealed_role: string | null;
};

type PlayerMe = { id: number; nickname: string };

const VOTE_KINDS = [
  { slug: "boss", label: "Кто босс?", icon: <Crown className="h-3.5 w-3.5" /> },
  { slug: "snitch", label: "Кто стукач?", icon: <Skull className="h-3.5 w-3.5" /> },
  { slug: "hero", label: "Кто герой?", icon: <Heart className="h-3.5 w-3.5" /> },
] as const;

const ISO_W = 720;
const ISO_H = 360;

export default function FinalePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [me, setMe] = useState<PlayerMe | null>(null);
  const [snap, setSnap] = useState<IsoSnapshot | null>(null);
  const [tally, setTally] = useState<Tally | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [st, sn, tl, oc, ps, mv] = await Promise.all([
        api<{ player: PlayerMe | null }>("/api/event/prison-break/status"),
        api<IsoSnapshot>("/api/event/prison-break/finale/snapshot"),
        api<Tally>("/api/event/prison-break/finale/tally"),
        api<Outcome>("/api/event/prison-break/finale/outcome"),
        api<PlayerCard[]>("/api/event/prison-break/players"),
        api<Record<string, number>>("/api/event/prison-break/finale/my-votes"),
      ]);
      setMe(st.player);
      setSnap(sn);
      setTally(tl);
      setOutcome(oc);
      setPlayers(ps);
      setMyVotes(mv);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить финал.");
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

  // Poll snapshot once per 3 seconds to keep the isometric view fresh.
  useEffect(() => {
    if (!me) return;
    const handle = window.setInterval(() => {
      api<IsoSnapshot>("/api/event/prison-break/finale/snapshot")
        .then(setSnap)
        .catch(() => {});
    }, 3000);
    return () => window.clearInterval(handle);
  }, [me]);

  // Canvas render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = ISO_W;
    canvas.height = ISO_H;
    drawIso(ctx, snap);
  }, [snap]);

  const otherPlayers = useMemo(
    () => players.filter((p) => p.id !== me?.id && p.status !== "disconnected"),
    [players, me?.id],
  );

  const castVote = useCallback(
    async (kind: string, targetId: number) => {
      try {
        await api("/api/event/prison-break/finale/vote", {
          method: "POST",
          body: JSON.stringify({ kind, target_player_id: targetId }),
        });
        toast.success("Голос принят.");
        await fetchAll();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : "Ошибка.";
        toast.error(msg);
      }
    },
    [fetchAll],
  );

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка…
      </div>
    );
  }

  const finished =
    snap?.event?.status === "finished" || snap?.event?.status === "cancelled";
  const showOutcome = finished && outcome != null;

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
        <Link
          href="/event/prison-break/reveals"
          className="inline-flex items-center gap-1.5 rounded-md border border-flame/40 bg-flame/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-flame transition-colors hover:bg-flame/20"
        >
          <Flame className="h-3.5 w-3.5" />
          Хроника
        </Link>
      </div>

      <div className="rounded-lg border border-flame/30 bg-flame/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-flame">
          <Eye className="h-3.5 w-3.5" />
          Final Night · isometric live
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          Состояние тюрьмы в реальном времени. Голосуй внизу — финал
          определит победителей.
        </p>
      </div>

      {/* Canvas */}
      <div className="overflow-hidden rounded-lg border border-border bg-void/60">
        <canvas
          ref={canvasRef}
          className="block w-full h-auto"
          style={{ aspectRatio: `${ISO_W} / ${ISO_H}`, imageRendering: "pixelated" }}
        />
      </div>

      {/* Final outcome card */}
      {showOutcome && outcome && (
        <OutcomeCard outcome={outcome} players={players} />
      )}

      {/* Voting */}
      <div className="grid gap-4 md:grid-cols-3">
        {VOTE_KINDS.map((vk) => {
          const myPick = myVotes[vk.slug];
          const counts = tally?.[vk.slug as keyof Tally] ?? [];
          return (
            <div
              key={vk.slug}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-bone">
                {vk.icon}
                {vk.label}
              </div>
              <select
                value={myPick ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  if (v) void castVote(vk.slug, v);
                }}
                className="mb-2 w-full rounded-md border border-border bg-void/60 px-3 py-2 text-xs text-bone focus:border-flame/60 focus:outline-none"
              >
                <option value="">— твой голос —</option>
                {otherPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.tattoo} {p.nickname}
                  </option>
                ))}
              </select>
              {counts.length > 0 && (
                <ul className="space-y-0.5 text-[11px]">
                  {counts.slice(0, 5).map((c) => (
                    <li
                      key={c.target_id}
                      className={cn(
                        "flex items-center justify-between rounded-md border border-border bg-void/30 px-2 py-1",
                        myPick === c.target_id && "border-flame/40 bg-flame/5",
                      )}
                    >
                      <span className="truncate text-bone">
                        {c.target_nickname}
                      </span>
                      <span className="font-mono text-smoke">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Outcome preview (not final) */}
      {!showOutcome && outcome && (
        <div className="rounded-lg border border-border bg-card p-4 text-xs">
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
            <Vote className="h-3 w-3" />
            Предварительный расклад
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Сбежало" value={outcome.escape_count} />
            <Stat
              label="Escape rate"
              value={`${Math.round(outcome.escape_rate * 100)}%`}
            />
            <Stat label="Голосов за босса" value={outcome.boss_voter_count} />
            <Stat
              label="Сторона ведёт"
              value={outcome.winning_side}
              color="text-flame"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OutcomeCard({
  outcome,
  players,
}: {
  outcome: Outcome;
  players: PlayerCard[];
}) {
  const winColor: Record<string, string> = {
    prisoners: "text-cyan",
    guards: "text-emerald-400",
    boss: "text-flame",
    spies: "text-purple-400",
    draw: "text-smoke",
  };
  const byId = new Map(players.map((p) => [p.id, p] as const));
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-flame/40 bg-gradient-to-b from-flame/10 to-void/0 p-5 shadow-[0_0_60px_-20px_rgba(255,80,40,0.6)]"
    >
      <div className="flex items-center justify-center gap-3 text-xs uppercase tracking-widest text-flame">
        <Flame className="h-4 w-4" />
        Финал
      </div>
      <div
        className={cn(
          "mt-2 text-center text-3xl font-bold",
          winColor[outcome.winning_side] ?? "text-bone",
        )}
      >
        Побеждают: {outcome.winning_side.toUpperCase()}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Сбежало" value={outcome.escape_count} color="text-cyan" />
        <Stat
          label="Escape rate"
          value={`${Math.round(outcome.escape_rate * 100)}%`}
        />
        <Stat
          label="Босс угадан"
          value={outcome.boss_correctly_identified ? "ДА" : "нет"}
          color={
            outcome.boss_correctly_identified ? "text-emerald-400" : "text-rose-400"
          }
        />
        <Stat
          label="Голосов за босса"
          value={`${outcome.boss_correct_votes}/${outcome.boss_voter_count}`}
        />
      </div>

      {outcome.escape_count > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest text-smoke">
            Сбежавшие
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {outcome.escaped_player_ids.map((pid) => {
              const p = byId.get(pid);
              return (
                <span
                  key={pid}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan/40 bg-cyan/10 px-2 py-0.5 text-xs text-cyan"
                >
                  <span>{p?.tattoo ?? "❓"}</span>
                  <span>{p?.nickname ?? `#${pid}`}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(outcome.payouts).length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest text-smoke">
            Выплаты 🪙
          </div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {Object.entries(outcome.payouts)
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .slice(0, 10)
              .map(([pid, amount]) => {
                const p = byId.get(Number(pid));
                return (
                  <li
                    key={pid}
                    className="flex items-center justify-between rounded-md border border-border bg-void/30 px-2 py-1"
                  >
                    <span className="text-bone">
                      {p?.tattoo} {p?.nickname ?? `#${pid}`}
                    </span>
                    <span className="font-mono text-amber-400">+{amount}</span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-void/30 p-2 text-center">
      <div className="text-[9px] uppercase tracking-widest text-smoke">
        {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-sm font-semibold", color ?? "text-bone")}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Isometric Canvas2D renderer
// ---------------------------------------------------------------------------

function drawIso(ctx: CanvasRenderingContext2D, snap: IsoSnapshot | null) {
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(0, 0, ISO_W, ISO_H);

  // Backdrop gradient
  const g = ctx.createLinearGradient(0, 0, 0, ISO_H);
  g.addColorStop(0, "rgba(255,80,40,0.06)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ISO_W, ISO_H);

  if (!snap) return;

  // Compute layout — 3 blocks (A/B/C) stacked vertically, cells in a row.
  const blocks = ["A", "B", "C"];
  const byBlock: Record<string, IsoCell[]> = { A: [], B: [], C: [] };
  for (const c of snap.cells) {
    if (byBlock[c.block]) byBlock[c.block].push(c);
  }
  for (const b of blocks) {
    byBlock[b].sort((a, b) => a.number - b.number);
  }

  const blockH = (ISO_H - 50) / 3;
  const blockTop = (idx: number) => 16 + idx * blockH;

  ctx.font = "10px monospace";
  ctx.textBaseline = "top";

  blocks.forEach((b, bIdx) => {
    const y = blockTop(bIdx);
    // Block label
    ctx.fillStyle = b === "A" ? "#22d3ee" : b === "B" ? "#f59e0b" : "#a855f7";
    ctx.fillText(`Блок ${b}`, 8, y + 4);

    const cells = byBlock[b];
    if (cells.length === 0) {
      ctx.fillStyle = "#3a2528";
      ctx.fillText("(пусто)", 60, y + 4);
      return;
    }
    const cellW = Math.min(100, (ISO_W - 70) / cells.length);
    cells.forEach((c, i) => {
      const x = 65 + i * cellW;
      drawCell(ctx, x, y, cellW - 6, blockH - 14, c);
    });
  });

  // Footer: arena + alliances + day
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(
    `Day ${snap.event?.current_day ?? 0} · фаза ${snap.event?.current_phase ?? "?"} · альянсов ${snap.alliances_active} · арена ${snap.arena_active.length}`,
    8,
    ISO_H - 16,
  );
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: IsoCell,
) {
  // Isometric-ish slab — front rect + top trapezoid offset to suggest 3D
  ctx.fillStyle = c.tunnel_discovered ? "#3a1820" : "#1a141a";
  ctx.fillRect(x, y + 4, w, h - 8);
  ctx.strokeStyle = c.tunnel_discovered ? "#7a1933" : "#33252b";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 4.5, w - 1, h - 9);

  // Tunnel progress bar
  const barH = 4;
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(x + 2, y + h - 10, w - 4, barH);
  const progressColor = c.tunnel_discovered
    ? "#f43f5e"
    : c.tunnel_progress >= 100
      ? "#10b981"
      : c.tunnel_progress >= 75
        ? "#fbbf24"
        : c.tunnel_progress >= 30
          ? "#22d3ee"
          : "#525252";
  ctx.fillStyle = progressColor;
  ctx.fillRect(x + 2, y + h - 10, ((w - 4) * c.tunnel_progress) / 100, barH);

  // Cell label
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "10px monospace";
  ctx.fillText(`${c.block}-${c.number}`, x + 4, y + 6);

  // Members as dots
  c.members.slice(0, 6).forEach((m, i) => {
    const dx = x + 4 + (i % 3) * 10;
    const dy = y + 18 + Math.floor(i / 3) * 8;
    let color = "#94a3b8";
    if (m.status === "fled") color = "#10b981";
    else if (m.status === "caught" || m.status === "carcer") color = "#f43f5e";
    if (m.revealed_role === "boss") color = "#f97316";
    else if (m.revealed_role === "guard") color = "#fbbf24";
    else if (m.revealed_role === "spy") color = "#a855f7";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  if (c.tunnel_discovered) {
    ctx.fillStyle = "#f43f5e";
    ctx.font = "9px monospace";
    ctx.fillText("✕", x + w - 12, y + 6);
  }
}
