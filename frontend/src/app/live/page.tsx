"use client";

import { Radio, RadioTower } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Interpolation window — matches AMX plugin dump period.
const PLUGIN_TICK_MS = 2000;
// Drop players that haven't pinged for this long (left the server, dead, etc).
const PLAYER_STALE_MS = 6000;

type Player = {
  userid: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  team: number; // 1=T, 2=CT, 0/3=spec
  hp: number;
  nick: string;
  updatedAt: number;
};

type MapMeta = {
  name: string;
  image: string;
  size_px: number;
  world_min_x: number;
  world_min_y: number;
  world_max_x: number;
  world_max_y: number;
  generated_from_bsp?: boolean;
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
  if (team === 1) return "#e7572f";
  if (team === 2) return "#5fb3e9";
  return "#9ea0a8";
}

function teamGlow(team: number): string {
  if (team === 1) return "rgba(231, 87, 47, 0.45)";
  if (team === 2) return "rgba(95, 179, 233, 0.45)";
  return "rgba(158, 160, 168, 0.30)";
}

function hpColor(hp: number): string {
  if (hp > 50) return "#5ce86b";
  if (hp > 20) return "#ffd23f";
  return "#e75050";
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

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
  const [mapMeta, setMapMeta] = useState<MapMeta | null>(null);
  const mapImgRef = useRef<HTMLImageElement | null>(null);
  const [mapImgReady, setMapImgReady] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);
  const [tickAgeMs, setTickAgeMs] = useState<number>(0);

  const prevRef = useRef<Map<number, Player>>(new Map());
  const curRef = useRef<Map<number, Player>>(new Map());
  const tickStartRef = useRef<number>(Date.now());
  const mapMetaRef = useRef<MapMeta | null>(null);

  // Keep ref in sync with state for render-loop reads.
  useEffect(() => {
    mapMetaRef.current = mapMeta;
  }, [mapMeta]);

  // -------- Load map metadata + image on map change --------
  useEffect(() => {
    if (!mapName) {
      setMapMeta(null);
      mapImgRef.current = null;
      setMapImgReady(false);
      return;
    }
    let cancelled = false;
    setMapImgReady(false);
    mapImgRef.current = null;

    fetch(`/maps/${encodeURIComponent(mapName)}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((meta: MapMeta) => {
        if (cancelled) return;
        setMapMeta(meta);
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          mapImgRef.current = img;
          setMapImgReady(true);
        };
        img.onerror = () => {
          if (cancelled) return;
          mapImgRef.current = null;
          setMapImgReady(false);
        };
        img.src = `/maps/${encodeURIComponent(meta.image)}`;
      })
      .catch(() => {
        if (cancelled) return;
        setMapMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mapName]);

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
        const m = body.match(/^JBF_MAP\|(.+)$/);
        if (m) {
          setMapName(m[1] || null);
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

  // -------- Snapshot promotion --------
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const newPrev = new Map(curRef.current);
      for (const [uid, p] of newPrev) {
        if (now - p.updatedAt > PLAYER_STALE_MS) newPrev.delete(uid);
      }
      prevRef.current = newPrev;
      curRef.current = new Map(newPrev);
      tickStartRef.current = now;
    }, PLUGIN_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // -------- One-time bootstrap probe --------
  // If the page is loaded before any JBF_MAP event arrives (e.g. WS lost the
  // race), guess the map from /api/shoutbox/server-status which already
  // exposes the active map name (cached 5s on the backend).
  useEffect(() => {
    if (mapName) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    if (!apiUrl) return;
    fetch(`${apiUrl}/shoutbox/server-status`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: { map?: string | null }) => {
        if (s.map) setMapName(s.map);
      })
      .catch(() => {});
  }, [mapName]);

  // -------- Canvas render loop --------
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

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0a0b14");
      bg.addColorStop(1, "#11131f");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const meta = mapMetaRef.current;
      const img = mapImgRef.current;

      // Decide projection bounds: prefer the map meta (stable across ticks
      // and ages well with single-player maps), then auto-fit fallback.
      let bMinX: number, bMinY: number, bMaxX: number, bMaxY: number;
      const cur = curRef.current;
      const prev = prevRef.current;
      const allIds = new Set<number>([
        ...Array.from(prev.keys()),
        ...Array.from(cur.keys()),
      ]);
      setPlayerCount(allIds.size);

      if (meta) {
        bMinX = meta.world_min_x;
        bMinY = meta.world_min_y;
        bMaxX = meta.world_max_x;
        bMaxY = meta.world_max_y;
      } else {
        let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
        for (const uid of allIds) {
          const p = cur.get(uid) ?? prev.get(uid);
          if (!p) continue;
          if (p.x < mnx) mnx = p.x;
          if (p.x > mxx) mxx = p.x;
          if (p.y < mny) mny = p.y;
          if (p.y > mxy) mxy = p.y;
        }
        if (!Number.isFinite(mnx)) {
          ctx.fillStyle = "#7f8395";
          ctx.font = `${14 * dpr}px ui-monospace, SFMono-Regular, monospace`;
          ctx.fillText(
            mapName
              ? `Карта ${mapName} — нет radar PNG, жду JBF_POS для оценки границ…`
              : "Жду карту от сервера…",
            16 * dpr,
            32 * dpr,
          );
          raf = requestAnimationFrame(render);
          return;
        }
        // Pad ~10% so single-player maps don't render at canvas center.
        const padW = Math.max(256, (mxx - mnx) * 0.1);
        const padH = Math.max(256, (mxy - mny) * 0.1);
        bMinX = mnx - padW;
        bMaxX = mxx + padW;
        bMinY = mny - padH;
        bMaxY = mxy + padH;
      }

      // Fit world bbox into canvas with letterbox (preserve aspect).
      const worldW = bMaxX - bMinX;
      const worldH = bMaxY - bMinY;
      const sx = w / worldW;
      const sy = h / worldH;
      const scale = Math.min(sx, sy);
      const drawW = worldW * scale;
      const drawH = worldH * scale;
      const offsetX = (w - drawW) / 2;
      const offsetY = (h - drawH) / 2;

      const toPx = (gx: number, gy: number): [number, number] => {
        const px = offsetX + (gx - bMinX) * scale;
        const py = offsetY + (bMaxY - gy) * scale; // flip Y
        return [px, py];
      };

      // Draw map image as background if loaded
      if (img && meta) {
        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
        // Subtle darken so player dots pop
        ctx.fillStyle = "rgba(10, 12, 20, 0.18)";
        ctx.fillRect(offsetX, offsetY, drawW, drawH);
      } else {
        // No image: thin grid overlay
        ctx.strokeStyle = "rgba(140,150,180,0.08)";
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
      }

      // Now draw players
      const tickElapsed = Date.now() - tickStartRef.current;
      setTickAgeMs(tickElapsed);
      const t = Math.min(1, tickElapsed / PLUGIN_TICK_MS);
      const now = Date.now();

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

        const stale = !b ? Math.min(1, (now - a!.updatedAt) / PLAYER_STALE_MS) : 0;
        ctx.globalAlpha = 1 - stale * 0.85;

        const r = 7 * dpr;

        // Glow
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, r * 3.2);
        gradient.addColorStop(0, glow);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, r * 3.2, 0, Math.PI * 2);
        ctx.fill();

        // View cone
        const yawRad = (iyaw * Math.PI) / 180;
        const cx = Math.cos(yawRad);
        const cy = -Math.sin(yawRad);
        const coneLen = 22 * dpr;
        const coneHalf = 8 * dpr;
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

        // Dot
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();

        // Nick label
        const nickFontPx = 11 * dpr;
        ctx.font = `${nickFontPx}px ui-sans-serif, system-ui, sans-serif`;
        const nick = dst.nick.slice(0, 18);
        const tw = ctx.measureText(nick).width;
        const labelX = px + r + 6 * dpr;
        const labelY = py - r - 4 * dpr;
        ctx.fillStyle = "rgba(15, 18, 30, 0.85)";
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
        ctx.fillRect(
          barX,
          barY,
          barW * Math.max(0, Math.min(1, ihp / 100)),
          barH,
        );

        ctx.globalAlpha = 1;
      }

      // HUD strip
      ctx.fillStyle = "rgba(10,12,20,0.7)";
      ctx.fillRect(0, h - 28 * dpr, w, 28 * dpr);
      ctx.fillStyle = "#a8acbd";
      ctx.font = `${11 * dpr}px ui-monospace, SFMono-Regular, monospace`;
      const hudY = h - 10 * dpr;
      const map = mapName ?? "?";
      const players = allIds.size;
      const radarTag = img ? (meta?.generated_from_bsp ? "BSP" : "RADAR") : "GRID";
      ctx.fillText(
        `MAP ${map}  ·  ${radarTag}  ·  PLAYERS ${players}  ·  TICK ${Math.round(
          tickElapsed,
        )}ms / ${PLUGIN_TICK_MS}ms  ·  1px ≈ ${(1 / scale).toFixed(0)}u`,
        12 * dpr,
        hudY,
      );

      raf = requestAnimationFrame(render);
    };
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
            broadcast. Фон карты — стоковый radar (<code className="font-mono">RADAR</code>)
            или BSP-render (<code className="font-mono">BSP</code>) если стокового нет;
            если ни того ни другого — grid (<code className="font-mono">GRID</code>).
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
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {!liveOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-void/60 text-xs text-smoke">
            Live-стрим выключен. Включи переключатель чтобы открыть WS.
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 text-[11px] text-smoke sm:grid-cols-4">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <span className="block text-[9px] uppercase tracking-widest text-smoke/70">
            карта
          </span>
          <span className="font-mono text-ash">{mapName ?? "—"}</span>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <span className="block text-[9px] uppercase tracking-widest text-smoke/70">
            radar
          </span>
          <span className="font-mono text-ash">
            {mapMeta
              ? mapMeta.generated_from_bsp
                ? "BSP-render"
                : "сток"
              : mapImgReady
                ? "загр."
                : "нет"}
          </span>
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
