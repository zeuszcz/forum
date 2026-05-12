"use client";

import { Radio, RadioTower } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Interpolation window — should match the AMX plugin dump period.
// The plugin pushes a fresh snapshot every PLUGIN_TICK_MS, we lerp between
// the previous and current snapshot over the same duration so motion looks
// continuous.
const PLUGIN_TICK_MS = 2000;

// If we haven't received a position update for a userid in this many ms,
// drop them from the canvas (left the server, dead, etc).
const PLAYER_STALE_MS = 6000;

type Player = {
  userid: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  team: number; // 1=T, 2=CT, 0=spec, 3=spec
  hp: number;
  nick: string;
  updatedAt: number;
};

type WsEvent =
  | { type: "hello"; user_id: number | null }
  | {
      type: "ephemeral_system";
      body: string;
      tag: string | null;
      category: string | null;
      created_at: string;
    }
  | { type: string; [k: string]: unknown };

function parsePos(body: string, now: number): Player | null {
  // Format: JBF_POS|userid|x|y|z|yaw|team|hp|nick
  // Nick may itself contain `|`, so we slice from index 8 to the end.
  if (!body.startsWith("JBF_POS|")) return null;
  const parts = body.split("|");
  if (parts.length < 9) return null;
  const userid = parseInt(parts[1] || "", 10);
  const x = parseFloat(parts[2] || "");
  const y = parseFloat(parts[3] || "");
  const z = parseFloat(parts[4] || "");
  const yaw = parseFloat(parts[5] || "");
  const team = parseInt(parts[6] || "", 10);
  const hp = parseInt(parts[7] || "", 10);
  const nick = parts.slice(8).join("|");
  if (!Number.isFinite(userid) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { userid, x, y, z, yaw, team, hp, nick, updatedAt: now };
}

function teamColor(team: number): string {
  if (team === 1) return "#e7572f"; // T
  if (team === 2) return "#5fb3e9"; // CT
  return "#9ea0a8"; // spec / unassigned
}

function teamGlow(team: number): string {
  if (team === 1) return "rgba(231, 87, 47, 0.35)";
  if (team === 2) return "rgba(95, 179, 233, 0.35)";
  return "rgba(158, 160, 168, 0.25)";
}

function hpColor(hp: number): string {
  if (hp > 50) return "#5ce86b";
  if (hp > 20) return "#ffd23f";
  return "#e75050";
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Shortest-arc lerp for yaw (so a turn from 170° to -170° goes 20°, not 340°).
function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

export default function LivePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [liveOn, setLiveOn] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [mapName, setMapName] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [tickAgeMs, setTickAgeMs] = useState<number>(0);

  // Two-snapshot interpolation buffer. Each map is keyed by userid.
  // `prev` is the snapshot frozen at the last tick boundary.
  // `cur`  is the in-flight snapshot the WS keeps updating.
  // `tickStart` is when `cur` was promoted from a previous `cur`.
  const prevRef = useRef<Map<number, Player>>(new Map());
  const curRef = useRef<Map<number, Player>>(new Map());
  const tickStartRef = useRef<number>(Date.now());
  const lastFlipRef = useRef<number>(Date.now());

  // -------- WS lifecycle --------
  useEffect(() => {
    if (!liveOn) {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    if (!apiUrl) return;
    const wsUrl = apiUrl.replace(/^http(s?):/, "ws$1:") + "/shoutbox/ws";

    let ws: WebSocket | null = null;
    let alive = true;
    let backoff = 1000;
    let reconnectTimer: number | null = null;

    const handle = (evt: WsEvent) => {
      if (evt.type !== "ephemeral_system") return;
      const cat = (evt as { category?: string | null }).category;
      const body = String((evt as { body?: string }).body ?? "");
      const now = Date.now();

      if (cat === "position") {
        const p = parsePos(body, now);
        if (!p) return;
        curRef.current.set(p.userid, p);
        return;
      }
      if (cat === "map") {
        // Body: JBF_MAP|<name>
        const m = body.match(/^JBF_MAP\|(.+)$/);
        if (m) {
          setMapName(m[1] || null);
          // Map change → wipe both buffers, no lerp across maps.
          prevRef.current = new Map();
          curRef.current = new Map();
        }
        return;
      }
    };

    const connect = () => {
      if (!alive) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        setWsConnected(true);
        backoff = 1000;
      };
      ws.onmessage = (e) => {
        try {
          handle(JSON.parse(e.data) as WsEvent);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setWsConnected(false);
        ws = null;
        wsRef.current = null;
        scheduleReconnect();
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    };

    const scheduleReconnect = () => {
      if (!alive) return;
      reconnectTimer = window.setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [liveOn]);

  // -------- Tick promotion (snapshot flip) --------
  // Every PLUGIN_TICK_MS, freeze `cur` into `prev` so the render lerp has
  // two stable endpoints. Players that did not receive an update in the
  // current window get carried over from prev so they don't blink in/out.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      // Carry over players from prev that did NOT get an update this tick,
      // but only if they are still fresh. This avoids the visual blink when
      // the plugin tick aligns with the WS dispatch and some players are
      // still in flight.
      const newPrev = new Map(curRef.current);
      // Drop stale (player left)
      for (const [uid, p] of newPrev) {
        if (now - p.updatedAt > PLAYER_STALE_MS) newPrev.delete(uid);
      }
      prevRef.current = newPrev;
      curRef.current = new Map(newPrev);
      tickStartRef.current = now;
      lastFlipRef.current = now;
    }, PLUGIN_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // -------- Canvas render loop --------
  const renderRef = useRef<() => void>(() => {});
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0a0b14");
      bg.addColorStop(1, "#11131f");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "rgba(140,150,180,0.07)";
      ctx.lineWidth = 1;
      const gridStep = 64 * dpr;
      for (let x = 0; x <= w; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const now = Date.now();
      const prev = prevRef.current;
      const cur = curRef.current;
      // Combine current + prev ids so a player who left this tick still
      // draws (faded) until they are carried out by the next flip.
      const allIds = new Set<number>([
        ...Array.from(prev.keys()),
        ...Array.from(cur.keys()),
      ]);
      setPlayerCount(allIds.size);

      const tickElapsed = now - tickStartRef.current;
      setTickAgeMs(tickElapsed);
      const t = Math.min(1, tickElapsed / PLUGIN_TICK_MS);

      // Compute bbox from interpolated positions for auto-fit.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const uid of allIds) {
        const a = prev.get(uid);
        const b = cur.get(uid);
        const src = a ?? b;
        const dst = b ?? a;
        if (!src || !dst) continue;
        const px = lerp(src.x, dst.x, t);
        const py = lerp(src.y, dst.y, t);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      const haveBounds = Number.isFinite(minX);

      // Auto-fit with padding. We pad coordinates AND canvas so single
      // stationary player doesn't render at canvas center as a giant dot.
      const padPx = 64 * dpr;
      const coordPad = haveBounds ? Math.max(256, (maxX - minX) * 0.1) : 0;
      const sx = haveBounds
        ? (w - 2 * padPx) / ((maxX - minX || 1) + 2 * coordPad)
        : 1;
      const sy = haveBounds
        ? (h - 2 * padPx) / ((maxY - minY || 1) + 2 * coordPad)
        : 1;
      const scale = Math.min(sx, sy);

      const toPx = (gx: number, gy: number): [number, number] => {
        // GoldSrc world: +X right, +Y up. Canvas: +Y down. Flip Y.
        const px = padPx + (gx - minX + coordPad) * scale;
        const py = padPx + (maxY - gy + coordPad) * scale;
        return [px, py];
      };

      if (!haveBounds) {
        ctx.fillStyle = "#7f8395";
        ctx.font = `${14 * dpr}px ui-monospace, SFMono-Regular, monospace`;
        ctx.fillText(
          "Жду данные от сервера… (нужен AMX плагин jbf_position_dump)",
          16 * dpr,
          32 * dpr,
        );
        raf = requestAnimationFrame(render);
        return;
      }

      // Players
      for (const uid of allIds) {
        const a = prev.get(uid);
        const b = cur.get(uid);
        const src = a ?? b!;
        const dst = b ?? a!;
        if (!src || !dst) continue;

        const ix = lerp(src.x, dst.x, t);
        const iy = lerp(src.y, dst.y, t);
        const iyaw = lerpAngle(src.yaw, dst.yaw, t);
        const ihp = Math.round(lerp(src.hp, dst.hp, t));

        const [px, py] = toPx(ix, iy);
        const color = teamColor(dst.team);
        const glow = teamGlow(dst.team);

        // Fade out if missing from the current snapshot for too long.
        const stale = !b ? Math.min(1, (now - a!.updatedAt) / PLAYER_STALE_MS) : 0;
        const alpha = 1 - stale * 0.85;
        ctx.globalAlpha = alpha;

        // Glow
        const r = 7 * dpr;
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, r * 3);
        gradient.addColorStop(0, glow);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, r * 3, 0, Math.PI * 2);
        ctx.fill();

        // View cone — short triangle pointing where the player looks.
        const yawRad = (iyaw * Math.PI) / 180;
        // GoldSrc yaw: 0° = +X, 90° = +Y. Canvas Y is inverted.
        const cx = Math.cos(yawRad);
        const cy = -Math.sin(yawRad);
        const coneLen = 22 * dpr;
        const coneHalf = 8 * dpr;
        // Perpendicular vector for cone base
        const ncx = -cy;
        const ncy = cx;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(
          px + cx * coneLen + ncx * coneHalf,
          py + cy * coneLen + ncy * coneHalf,
        );
        ctx.lineTo(
          px + cx * coneLen - ncx * coneHalf,
          py + cy * coneLen - ncy * coneHalf,
        );
        ctx.closePath();
        ctx.fillStyle = glow;
        ctx.fill();

        // Body dot
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();

        // Nickname label
        ctx.fillStyle = "rgba(15, 18, 30, 0.85)";
        const nickFontPx = 11 * dpr;
        ctx.font = `${nickFontPx}px ui-sans-serif, system-ui, sans-serif`;
        const nick = dst.nick.slice(0, 18);
        const tw = ctx.measureText(nick).width;
        const labelX = px + r + 6 * dpr;
        const labelY = py - r - 4 * dpr;
        ctx.fillRect(
          labelX - 3 * dpr,
          labelY - nickFontPx,
          tw + 6 * dpr,
          nickFontPx + 4 * dpr,
        );
        ctx.fillStyle = "#e6e7ee";
        ctx.fillText(nick, labelX, labelY - 2 * dpr);

        // HP bar
        const barW = 22 * dpr;
        const barH = 3 * dpr;
        const barX = px - barW / 2;
        const barY = py + r + 6 * dpr;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = hpColor(ihp);
        ctx.fillRect(barX, barY, barW * Math.max(0, Math.min(1, ihp / 100)), barH);

        ctx.globalAlpha = 1;
      }

      // HUD overlay
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(10,12,20,0.65)";
      ctx.fillRect(0, h - 28 * dpr, w, 28 * dpr);
      ctx.fillStyle = "#a8acbd";
      ctx.font = `${11 * dpr}px ui-monospace, SFMono-Regular, monospace`;
      const hudY = h - 10 * dpr;
      const map = mapName ?? "?";
      const players = allIds.size;
      ctx.fillText(
        `MAP ${map}  ·  PLAYERS ${players}  ·  TICK ${Math.round(tickElapsed)}ms / ${PLUGIN_TICK_MS}ms  ·  scale 1px = ${(1 / scale).toFixed(0)}u`,
        12 * dpr,
        hudY,
      );

      raf = requestAnimationFrame(render);
    };
    renderRef.current = render;
    render();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mapName]);

  const toggleLive = useCallback(() => {
    setLiveOn((v) => !v);
  }, []);

  return (
    <div className="container py-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-bone">
            <RadioTower className="h-6 w-6 text-cyan" />
            Live overview
          </h1>
          <p className="mt-1 text-sm text-smoke">
            Top-down позиции игроков в режиме реального времени. Источник —
            AMX-X плагин <code className="font-mono text-iridescent">jbf_position_dump</code>{" "}
            (тик {PLUGIN_TICK_MS / 1000}с) → cs-log-listener → WS ephemeral
            broadcast. Картинка интерполируется между двумя snapshot&apos;ами,
            данные нигде не сохраняются.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-widest",
              liveOn && wsConnected
                ? "border-cyan/40 bg-cyan/10 text-cyan"
                : liveOn
                  ? "border-flame/40 bg-flame/5 text-flame"
                  : "border-border text-smoke",
            )}
          >
            <Radio
              className={cn(
                "h-3 w-3",
                liveOn && wsConnected && "animate-pulse-slow",
              )}
            />
            {liveOn ? (wsConnected ? "online" : "connecting…") : "off"}
          </span>
          <button
            type="button"
            onClick={toggleLive}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] uppercase tracking-widest transition-colors",
              liveOn
                ? "border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/15"
                : "border-border text-smoke hover:border-cyan/40 hover:text-bone",
            )}
          >
            {liveOn ? "вкл" : "выкл"}
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />
        {!liveOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-void/60 text-xs text-smoke">
            Live-стрим выключен. Включи переключатель чтобы открыть WS.
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 text-[11px] text-smoke sm:grid-cols-3">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <span className="block text-[9px] uppercase tracking-widest text-smoke/70">
            карта
          </span>
          <span className="font-mono text-ash">{mapName ?? "—"}</span>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <span className="block text-[9px] uppercase tracking-widest text-smoke/70">
            игроков
          </span>
          <span className="font-mono text-ash">{playerCount}</span>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <span className="block text-[9px] uppercase tracking-widest text-smoke/70">
            тик
          </span>
          <span className="font-mono text-ash">
            {Math.round(tickAgeMs)}ms / {PLUGIN_TICK_MS}ms
          </span>
        </div>
      </div>
    </div>
  );
}
