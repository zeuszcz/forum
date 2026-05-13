"use client";

import { motion } from "framer-motion";
import {
  ChevronLeft,
  Coins,
  Crown,
  Heart,
  Swords,
  Timer,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type FighterDTO = {
  player_id: number;
  nickname: string;
  tattoo: string;
  loadout: string[];
  side: "a" | "b";
  x: number;
  vx: number;
  facing: number;
  hp: number;
  stamina: number;
  action: string;
  action_slug: string | null;
  frame_left: number;
  cooldowns: Record<string, number>;
  landed_hits: number;
};

type ArenaState = {
  kind: string;
  match_id: number;
  tick: number;
  max_ticks: number;
  stage: { w: number; h: number };
  fighters: { a: FighterDTO; b: FighterDTO };
  finished: boolean;
  winner_side: "a" | "b" | null;
  winner_id: number | null;
  recent_events: Array<{ kind: string; tick: number; payload: Record<string, unknown> }>;
};

type ArenaMatchOut = {
  id: number;
  status: string;
  player_a_id: number;
  player_b_id: number;
  loadout_a: string[];
  loadout_b: string[];
  winner_id: number | null;
  is_a: boolean;
  is_b: boolean;
  is_participant: boolean;
};

type Special = {
  slug: string;
  name: string;
  emoji: string;
  stamina_cost: number;
  damage: number;
  range: number;
  height: string;
  cooldown_ticks: number;
};

type PlayerMe = { id: number; money: number };

const STAGE_W = 800;
const STAGE_H = 240;
const FIGHTER_W = 40;
const FIGHTER_H = 80;

export default function ArenaMatchPage() {
  const router = useRouter();
  const params = useParams<{ matchId: string }>();
  const matchId = Number(params?.matchId);
  const { user } = useAuth();
  const [me, setMe] = useState<PlayerMe | null>(null);
  const [match, setMatch] = useState<ArenaMatchOut | null>(null);
  const [state, setState] = useState<ArenaState | null>(null);
  const [specials, setSpecials] = useState<Special[]>([]);
  const [loading, setLoading] = useState(true);
  const [betAmount, setBetAmount] = useState("");
  const [betOn, setBetOn] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const movePollRef = useRef<number | null>(null);
  const moveIntentRef = useRef<-1 | 0 | 1>(0);

  const fetchMeta = useCallback(async () => {
    try {
      const [st, ms, sps] = await Promise.all([
        api<{ player: PlayerMe | null }>("/api/event/prison-break/status"),
        api<ArenaMatchOut[]>("/api/event/prison-break/arena/matches").then((all) => all.find((m) => m.id === matchId)),
        api<Special[]>("/api/event/prison-break/arena/specials"),
      ]);
      setMe(st.player);
      setSpecials(sps);
      if (ms) {
        setMatch(ms);
      } else {
        // Match may be in history (finished); try history.
        const hist = await api<ArenaMatchOut[]>(
          "/api/event/prison-break/arena/history?limit=60",
        );
        setMatch(hist.find((m) => m.id === matchId) ?? null);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить матч.");
    } finally {
      setLoading(false);
    }
  }, [matchId, router]);

  useEffect(() => {
    if (user === null) {
      router.push("/login");
      return;
    }
    if (user) void fetchMeta();
  }, [user, fetchMeta, router]);

  // Open WebSocket to engine
  useEffect(() => {
    if (!match || match.status !== "active") return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host =
      process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, "") ??
      window.location.host;
    const url = `${protocol}//${host}/api/event/prison-break/arena/${matchId}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.kind === "ping") return;
        setState(msg as ArenaState);
        if (msg.finished) {
          // close softly
          setTimeout(() => {
            try {
              ws.close();
            } catch {}
          }, 600);
          // Refresh meta to grab winner_id.
          void fetchMeta();
        }
      } catch {}
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [match, matchId, fetchMeta]);

  // Continuous move-intent poller — sends current dx every 150ms while pressed.
  useEffect(() => {
    if (!match || match.status !== "active" || !match.is_participant) return;
    const handle = window.setInterval(() => {
      const dx = moveIntentRef.current;
      void api("/api/event/prison-break/arena/" + matchId + "/input", {
        method: "POST",
        body: JSON.stringify({ type: "move", dx }),
      }).catch(() => {});
    }, 150);
    movePollRef.current = handle;
    return () => {
      window.clearInterval(handle);
      movePollRef.current = null;
    };
  }, [match, matchId]);

  // Keyboard input
  useEffect(() => {
    if (!match || match.status !== "active" || !match.is_participant) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "a" || e.key === "ArrowLeft") {
        moveIntentRef.current = -1;
      } else if (e.key === "d" || e.key === "ArrowRight") {
        moveIntentRef.current = 1;
      } else if (e.key === "s" || e.key === "ArrowDown") {
        void api("/api/event/prison-break/arena/" + matchId + "/input", {
          method: "POST",
          body: JSON.stringify({ type: "block", height: "mid" }),
        }).catch(() => {});
      } else if (e.key === "1" || e.key === "2" || e.key === "3") {
        const idx = Number(e.key) - 1;
        const loadout = match.is_a ? match.loadout_a : match.loadout_b;
        const slug = loadout[idx];
        if (slug) {
          void api("/api/event/prison-break/arena/" + matchId + "/input", {
            method: "POST",
            body: JSON.stringify({ type: "special", slug }),
          }).catch(() => {});
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (
        e.key === "a" ||
        e.key === "ArrowLeft" ||
        e.key === "d" ||
        e.key === "ArrowRight"
      ) {
        moveIntentRef.current = 0;
      }
      if (e.key === "s" || e.key === "ArrowDown") {
        void api("/api/event/prison-break/arena/" + matchId + "/input", {
          method: "POST",
          body: JSON.stringify({ type: "block", height: null }),
        }).catch(() => {});
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [match, matchId]);

  // Canvas render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;
    drawScene(ctx, state);
  }, [state]);

  const mySpecials = useMemo(() => {
    if (!match) return [];
    const loadout = match.is_a ? match.loadout_a : match.loadout_b;
    return loadout
      .map((slug) => specials.find((s) => s.slug === slug))
      .filter(Boolean) as Special[];
  }, [match, specials]);

  const triggerSpecial = useCallback(
    (slug: string) => {
      if (!match || match.status !== "active" || !match.is_participant) return;
      void api("/api/event/prison-break/arena/" + matchId + "/input", {
        method: "POST",
        body: JSON.stringify({ type: "special", slug }),
      }).catch((e) => {
        const msg = e instanceof ApiError ? e.detail : "Ошибка.";
        toast.error(msg);
      });
    },
    [match, matchId],
  );

  const placeBet = useCallback(async () => {
    if (!betOn) {
      toast.error("Выбери на кого ставишь.");
      return;
    }
    const amount = Number(betAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Сумма?");
      return;
    }
    try {
      await api("/api/event/prison-break/arena/" + matchId + "/bet", {
        method: "POST",
        body: JSON.stringify({ on_player_id: betOn, amount }),
      });
      toast.success("Ставка принята.");
      setBetAmount("");
      await fetchMeta();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Ошибка.";
      toast.error(msg);
    }
  }, [betAmount, betOn, fetchMeta, matchId]);

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка…
      </div>
    );
  }

  if (!match) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Link
          href="/event/prison-break/arena"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          К лобби
        </Link>
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-smoke">
          Матч не найден.
        </div>
      </div>
    );
  }

  const isParticipant = match.is_participant;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/event/prison-break/arena"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Лобби
        </Link>
        <div className="text-[10px] uppercase tracking-widest text-smoke">
          Матч #{match.id} · {match.status}
        </div>
      </div>

      {/* HP + stamina bars */}
      {state && (
        <div className="grid grid-cols-2 gap-4">
          <FighterBar fighter={state.fighters.a} side="a" />
          <FighterBar fighter={state.fighters.b} side="b" />
        </div>
      )}

      {/* Canvas */}
      <div className="overflow-hidden rounded-lg border border-border bg-void/60">
        <canvas
          ref={canvasRef}
          className="block w-full h-auto"
          style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}`, imageRendering: "pixelated" }}
        />
      </div>

      {/* Timer */}
      {state && (
        <div className="flex items-center justify-center gap-2 text-xs text-smoke">
          <Timer className="h-3.5 w-3.5" />
          <span className="font-mono">
            {Math.max(0, Math.floor((state.max_ticks - state.tick) / 15))}s
          </span>
          {state.finished && state.winner_side && (
            <span className="ml-3 inline-flex items-center gap-1 text-emerald-400">
              <Crown className="h-3.5 w-3.5" />
              Победил {state.fighters[state.winner_side].nickname}
            </span>
          )}
        </div>
      )}

      {/* Specials hotbar */}
      {isParticipant && match.status === "active" && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
            <Swords className="h-3 w-3" />
            Приёмы — клавиши 1/2/3
          </div>
          <div className="grid grid-cols-3 gap-2">
            {mySpecials.map((s, idx) => {
              const myFighter = state?.fighters[match.is_a ? "a" : "b"];
              const cd = myFighter?.cooldowns?.[s.slug] ?? 0;
              const stam = (myFighter?.stamina ?? 100) >= s.stamina_cost;
              const disabled = cd > 0 || !stam;
              return (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => triggerSpecial(s.slug)}
                  disabled={disabled}
                  className={cn(
                    "flex items-center gap-2 rounded-md border p-3 text-left transition-colors",
                    disabled
                      ? "border-border bg-void/30 text-smoke opacity-50"
                      : "border-rose-500/40 bg-rose-500/10 text-bone hover:bg-rose-500/20",
                  )}
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {idx + 1}. {s.name}
                    </div>
                    <div className="text-[10px] text-smoke">
                      dmg {s.damage} · stam {s.stamina_cost}
                      {cd > 0 && <span className="ml-1 text-amber-400">cd {cd}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-widest text-smoke">
            движение: A/D или ←/→ · блок: S или ↓ · приёмы: 1/2/3
          </div>
        </div>
      )}

      {/* Spectator bet panel */}
      {!isParticipant && match.status === "active" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-amber-300">
            <Coins className="h-3 w-3" />
            Ставка · odds 1.95×
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={betOn ?? ""}
              onChange={(e) =>
                setBetOn(e.target.value ? Number(e.target.value) : null)
              }
              className="rounded-md border border-border bg-void/60 px-3 py-2 text-xs text-bone focus:border-amber-500/60 focus:outline-none"
            >
              <option value="">— на кого —</option>
              <option value={match.player_a_id}>
                A · {state?.fighters.a.nickname ?? "?"}
              </option>
              <option value={match.player_b_id}>
                B · {state?.fighters.b.nickname ?? "?"}
              </option>
            </select>
            <input
              type="number"
              min={1}
              max={10000}
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder="сумма 🪙"
              className="w-32 rounded-md border border-border bg-void/60 px-3 py-2 text-xs text-bone focus:border-amber-500/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={placeBet}
              className="rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-amber-300 transition-colors hover:bg-amber-500/25"
            >
              ставлю
            </button>
            {me && (
              <span className="ml-auto text-[11px] text-smoke">
                баланс: {me.money} 🪙
              </span>
            )}
          </div>
        </div>
      )}

      {/* Recent events feed */}
      {state && state.recent_events.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="mb-1 text-[10px] uppercase tracking-widest text-smoke">
            События
          </div>
          <ul className="space-y-0.5 font-mono text-[11px] text-smoke">
            {state.recent_events.slice().reverse().slice(0, 6).map((e, i) => (
              <li key={i}>
                <span className="text-bone">{e.kind}</span>
                <span className="text-smoke">
                  {" "}— {JSON.stringify(e.payload)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FighterBar({ fighter, side }: { fighter: FighterDTO; side: "a" | "b" }) {
  const color = side === "a" ? "text-cyan" : "text-rose-300";
  const hpPct = Math.max(0, Math.min(100, fighter.hp));
  const stamPct = Math.max(0, Math.min(100, fighter.stamina));
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        side === "a" ? "border-cyan/30" : "border-rose-500/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex items-center gap-1.5 text-sm font-semibold", color)}>
          <span className="text-lg">{fighter.tattoo}</span>
          <span>{fighter.nickname}</span>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-smoke">
          {side.toUpperCase()}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        <Bar
          icon={<Heart className="h-3 w-3 text-rose-400" />}
          label="HP"
          value={fighter.hp}
          pct={hpPct}
          barColor="bg-rose-500"
        />
        <Bar
          icon={<Zap className="h-3 w-3 text-emerald-400" />}
          label="STAM"
          value={Math.round(fighter.stamina)}
          pct={stamPct}
          barColor="bg-emerald-500"
        />
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-smoke">
        {fighter.action}
        {fighter.action_slug && <span> · {fighter.action_slug}</span>}
      </div>
    </div>
  );
}

function Bar({
  icon,
  label,
  value,
  pct,
  barColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  pct: number;
  barColor: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="w-10 text-[10px] uppercase tracking-widest text-smoke">
        {label}
      </span>
      <div className="flex-1 h-2 overflow-hidden rounded-full bg-void/60">
        <motion.div
          className={cn("h-full", barColor)}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[10px] text-bone">
        {value}
      </span>
    </div>
  );
}

function drawScene(ctx: CanvasRenderingContext2D, state: ArenaState | null) {
  // Floor + background gradient
  const grd = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  grd.addColorStop(0, "#1a1014");
  grd.addColorStop(0.6, "#0f0610");
  grd.addColorStop(1, "#1a0a08");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);

  // Grid lines
  ctx.strokeStyle = "rgba(255, 80, 80, 0.06)";
  ctx.lineWidth = 1;
  for (let x = 40; x < STAGE_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, STAGE_H);
    ctx.stroke();
  }

  // Floor line
  ctx.fillStyle = "#3a1820";
  ctx.fillRect(0, STAGE_H - 4, STAGE_W, 4);

  if (!state) return;

  for (const side of ["a", "b"] as const) {
    const f = state.fighters[side];
    drawFighter(ctx, f);
  }

  // Recent hit flash
  const lastEvent = state.recent_events[state.recent_events.length - 1];
  if (lastEvent?.kind === "hit") {
    const losing = lastEvent.payload.defender_side as "a" | "b";
    const f = state.fighters[losing];
    ctx.save();
    ctx.fillStyle = "rgba(220, 38, 38, 0.35)";
    ctx.fillRect(f.x - FIGHTER_W / 2 - 5, STAGE_H - FIGHTER_H - 12, FIGHTER_W + 10, FIGHTER_H + 12);
    ctx.restore();
  }
}

function drawFighter(ctx: CanvasRenderingContext2D, f: FighterDTO) {
  const y = STAGE_H - FIGHTER_H - 4;
  const x = f.x - FIGHTER_W / 2;
  const main = f.side === "a" ? "#22d3ee" : "#f43f5e";
  const dark = f.side === "a" ? "#0f6379" : "#7a1933";

  // Body
  ctx.fillStyle = main;
  ctx.fillRect(x, y, FIGHTER_W, FIGHTER_H);
  ctx.fillStyle = dark;
  ctx.fillRect(x, y + FIGHTER_H - 14, FIGHTER_W, 14);

  // Head
  ctx.fillStyle = "#f5e8d4";
  ctx.fillRect(x + 8, y + 6, FIGHTER_W - 16, 18);

  // Eye direction
  ctx.fillStyle = "#1a0a08";
  const eyeX = f.facing > 0 ? x + FIGHTER_W - 16 : x + 10;
  ctx.fillRect(eyeX, y + 12, 4, 4);

  // Action indicators
  if (f.action === "startup") {
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, y - 2, FIGHTER_W + 4, FIGHTER_H + 4);
  }
  if (f.action === "active") {
    // Hitbox preview — flash a small rect in front
    ctx.fillStyle = "rgba(248, 113, 113, 0.5)";
    const hbX = f.x + f.facing * (FIGHTER_W / 2);
    const hbEnd = hbX + f.facing * 50;
    const [x0, x1] = hbX < hbEnd ? [hbX, hbEnd] : [hbEnd, hbX];
    ctx.fillRect(x0, y + 20, x1 - x0, 36);
  }
  if (f.action === "blocking") {
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 4, y - 4, FIGHTER_W + 8, FIGHTER_H + 8);
  }
  if (f.action === "parry_window") {
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 5, y - 5, FIGHTER_W + 10, FIGHTER_H + 10);
  }
  if (f.action === "stunned") {
    ctx.fillStyle = "#f97316";
    ctx.fillText("✦", x + 14, y - 4);
  }
}
