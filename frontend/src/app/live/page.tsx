"use client";

import {
  MessageSquare,
  Radio,
  RadioTower,
  Send,
  Target,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { actionAnnounceColor } from "@/lib/jbf-quick-actions";
import { cn } from "@/lib/utils";

import {
  PlayerPopover,
  type ActionRunner,
} from "./_components/player-popover";
import { StreamPlayer } from "./_components/stream-player";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const PLUGIN_TICK_MS = 2000;
const PLAYER_STALE_MS = 6000;
const TRAIL_LENGTH = 4;          // D1: ring-buffer of last N positions
const KILL_MARKER_TTL_MS = 5000; // D2: how long kill skull/flame stays on map
const AFK_THRESHOLD_MS = 30_000; // D5: stationary + same yaw → sleeping icon
const CHAT_BUFFER_MAX = 60;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
type Player = {
  userid: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  team: number;
  hp: number;
  // Extended fields (plugin v0.2.0+, optional for backward compat).
  money: number | null;
  weapon: string | null;
  kills: number | null;
  deaths: number | null;
  flags: string | null;
  nick: string;
  updatedAt: number;
};

type Trail = {
  // Ring of recent (x, y, ts) so the canvas can draw a fading polyline.
  points: Array<{ x: number; y: number; ts: number }>;
};

type KillMarker = {
  id: string;
  kx: number;
  ky: number;
  vx: number;
  vy: number;
  killer_userid: number;
  victim_userid: number;
  killer_nick: string;
  victim_nick: string;
  weapon: string;
  hs: boolean;
  ts: number;
};

type RoundState = {
  startedAt: number;   // wall-clock when start fired
  durationMs: number;  // mp_roundtime * 60
  endedAt: number | null;
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

type Zone = {
  name: string;
  color?: string;
  polygon: Array<[number, number]>;
};

type RosterRow = {
  // Server snapshot from /cs-rcon/players — staff-only, gives SteamID.
  slot: number;
  name: string;
  userid: number;
  steamid: string;
  frag: number;
  time: string;
  ping: number;
  loss: number;
  addr: string;
};

type ChatLine = {
  id: string;
  body: string;
  created_at: string;
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

// -----------------------------------------------------------------------------
// Parsers
// -----------------------------------------------------------------------------
function parsePos(body: string, now: number): Player | null {
  if (!body.startsWith("JBF_POS|")) return null;
  const parts = body.split("|");
  // v0.1.0 layout: JBF_POS|userid|x|y|z|yaw|team|hp|nick (9 parts)
  // v0.2.0 layout: JBF_POS|userid|x|y|z|yaw|team|hp|money|weapon|kills|deaths|flags|nick (14 parts)
  if (parts.length < 9) return null;
  const userid = parseInt(parts[1] || "", 10);
  const x = parseFloat(parts[2] || "");
  const y = parseFloat(parts[3] || "");
  const z = parseFloat(parts[4] || "");
  const yaw = parseFloat(parts[5] || "");
  const team = parseInt(parts[6] || "", 10);
  const hp = parseInt(parts[7] || "", 10);
  if (!Number.isFinite(userid) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  if (parts.length >= 14) {
    const money = parseInt(parts[8] || "0", 10);
    const weapon = parts[9] || "";
    const kills = parseInt(parts[10] || "0", 10);
    const deaths = parseInt(parts[11] || "0", 10);
    const flags = parts[12] || "";
    const nick = parts.slice(13).join("|");
    return {
      userid, x, y, z, yaw, team, hp, money,
      weapon: weapon || null,
      kills, deaths, flags: flags || null,
      nick, updatedAt: now,
    };
  }
  // Legacy: no extended fields.
  const nick = parts.slice(8).join("|");
  return {
    userid, x, y, z, yaw, team, hp,
    money: null, weapon: null, kills: null, deaths: null, flags: null,
    nick, updatedAt: now,
  };
}

function parseKill(body: string): KillMarker | null {
  // JBF_KILL|killer_userid|kx|ky|victim_userid|vx|vy|weapon|hs|killer_nick|victim_nick
  if (!body.startsWith("JBF_KILL|")) return null;
  const parts = body.split("|");
  if (parts.length < 11) return null;
  const k_uid = parseInt(parts[1] || "", 10);
  const kx = parseFloat(parts[2] || "");
  const ky = parseFloat(parts[3] || "");
  const v_uid = parseInt(parts[4] || "", 10);
  const vx = parseFloat(parts[5] || "");
  const vy = parseFloat(parts[6] || "");
  const weapon = parts[7] || "";
  const hs = parts[8] === "1";
  const k_nick = parts[9] || "";
  const v_nick = parts.slice(10).join("|");
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return null;
  const now = Date.now();
  return {
    id: `${now}-${v_uid}-${k_uid}`,
    kx, ky, vx, vy,
    killer_userid: k_uid,
    victim_userid: v_uid,
    killer_nick: k_nick,
    victim_nick: v_nick,
    weapon,
    hs,
    ts: now,
  };
}

// -----------------------------------------------------------------------------
// Helpers
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

function teamGlow(team: number): string {
  if (team === 1) return "rgba(231, 87, 47, 0.45)";
  if (team === 2) return "rgba(95, 179, 233, 0.45)";
  return "rgba(158, 160, 168, 0.30)";
}

function hpColor(hp: number): string {
  if (hp <= 0) return "#666";
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

function isAdmin(flags: string | null): boolean {
  // AMX-X admin flag is "a" (ADMIN_IMMUNITY) — most servers grant it to staff.
  return !!flags && /[a-w]/i.test(flags);
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------
export default function LivePage() {
  const { user } = useAuth();
  const isStaff = useMemo(
    () => Boolean(user?.roles?.some((r) => r.is_staff)),
    [user],
  );

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Toggles
  const [liveOn, setLiveOn] = useState(true);
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const [streamOn, setStreamOn] = useState(false);
  const [showTrails, setShowTrails] = useState(true);
  const [followUserid, setFollowUserid] = useState<number | null>(null);
  const followUseridRef = useRef<number | null>(null);
  useEffect(() => {
    followUseridRef.current = followUserid;
  }, [followUserid]);
  // Ref-mirror these too so toggling them doesn't restart the entire
  // render loop (which would rebuild glow sprites and re-attach ResizeObserver).
  const selectedRef = useRef<number | null>(null);
  const showTrailsRef = useRef<boolean>(true);

  // Live state from WS
  const [wsConnected, setWsConnected] = useState(false);
  const [mapName, setMapName] = useState<string | null>(null);
  const [mapMeta, setMapMeta] = useState<MapMeta | null>(null);
  const [zones, setZones] = useState<Zone[] | null>(null);
  const mapImgRef = useRef<HTMLImageElement | null>(null);

  // Player buffers — refs for render loop, state for UI sync
  const prevRef = useRef<Map<number, Player>>(new Map());
  const curRef = useRef<Map<number, Player>>(new Map());
  const trailsRef = useRef<Map<number, Trail>>(new Map());
  const killMarkersRef = useRef<KillMarker[]>([]);
  const roundRef = useRef<RoundState | null>(null);
  const tickStartRef = useRef<number>(Date.now());
  const mapMetaRef = useRef<MapMeta | null>(null);
  const zonesRef = useRef<Zone[] | null>(null);
  const projRef = useRef<{
    toPx: (gx: number, gy: number) => [number, number];
    bounds: { bMinX: number; bMinY: number; bMaxX: number; bMaxY: number };
    scale: number;
  } | null>(null);

  const [playerListVersion, setPlayerListVersion] = useState(0); // bump on snapshot flip
  const [selectedUserid, setSelectedUserid] = useState<number | null>(null);
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);

  // Keep refs in sync with state where render loop needs them
  useEffect(() => {
    mapMetaRef.current = mapMeta;
  }, [mapMeta]);
  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);
  useEffect(() => {
    selectedRef.current = selectedUserid;
  }, [selectedUserid]);
  useEffect(() => {
    showTrailsRef.current = showTrails;
  }, [showTrails]);

  // ---------------------------------------------------------------------------
  // Map asset loading
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!mapName) {
      setMapMeta(null);
      setZones(null);
      mapImgRef.current = null;
      /* mapImgReady not needed for render */
      return;
    }
    let cancelled = false;
    /* mapImgReady not needed for render */
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
          /* image loaded */
        };
        img.onerror = () => {
          if (cancelled) return;
          mapImgRef.current = null;
          /* mapImgReady not needed for render */
        };
        img.src = `/maps/${encodeURIComponent(meta.image)}`;
      })
      .catch(() => {
        if (!cancelled) setMapMeta(null);
      });

    // Zones (D9) — separate file, optional.
    fetch(`/maps/${encodeURIComponent(mapName)}.zones.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((zs: { zones: Zone[] }) => {
        if (!cancelled) setZones(zs.zones ?? null);
      })
      .catch(() => {
        if (!cancelled) setZones(null);
      });

    return () => {
      cancelled = true;
    };
  }, [mapName]);

  // ---------------------------------------------------------------------------
  // Bootstrap mapName from /shoutbox/server-status (WS race fallback)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Roster snapshot from /cs-rcon/players — staff-only, gives SteamID + ping
  // Polled every 10 s when staff is viewing. Used for popover + table.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await api<{ players: RosterRow[] }>(
          "/cs-rcon/players",
          { method: "GET" },
        );
        if (!cancelled) setRoster(r.players ?? []);
      } catch {
        // ignore
      }
    };
    void tick();
    const id = window.setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isStaff]);

  // ---------------------------------------------------------------------------
  // WS subscription
  // ---------------------------------------------------------------------------
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
      const ts = String(
        (evt as { created_at?: string }).created_at ??
          new Date().toISOString(),
      );
      const now = Date.now();

      if (cat === "position") {
        const p = parsePos(body, now);
        if (!p) return;
        curRef.current.set(p.userid, p);
        // Update movement trail
        let trail = trailsRef.current.get(p.userid);
        if (!trail) {
          trail = { points: [] };
          trailsRef.current.set(p.userid, trail);
        }
        trail.points.push({ x: p.x, y: p.y, ts: now });
        if (trail.points.length > TRAIL_LENGTH) trail.points.shift();
        return;
      }
      if (cat === "map") {
        const m = body.match(/^JBF_MAP\|(.+)$/);
        if (m) {
          setMapName(m[1] || null);
          prevRef.current = new Map();
          curRef.current = new Map();
          trailsRef.current = new Map();
          killMarkersRef.current = [];
          roundRef.current = null;
        }
        return;
      }
      if (cat === "kill_live") {
        const k = parseKill(body);
        if (k) {
          killMarkersRef.current.push(k);
          if (killMarkersRef.current.length > 20) {
            killMarkersRef.current.shift();
          }
        }
        return;
      }
      if (cat === "round_live") {
        // JBF_ROUND|start|<seconds>  OR  JBF_ROUND|end
        const m = body.match(/^JBF_ROUND\|(start|end)(?:\|([\d.]+))?$/);
        if (!m) return;
        if (m[1] === "start") {
          const dur = parseFloat(m[2] || "180");
          roundRef.current = {
            startedAt: now,
            durationMs: Math.max(30, dur) * 1000,
            endedAt: null,
          };
        } else if (m[1] === "end") {
          if (roundRef.current) roundRef.current.endedAt = now;
        }
        return;
      }
      if (cat === "chat") {
        const id_ = ts + "#" + Math.random().toString(36).slice(2, 8);
        setChatLines((prev) => {
          const next = [...prev, { id: id_, body, created_at: ts }];
          if (next.length > CHAT_BUFFER_MAX) {
            next.splice(0, next.length - CHAT_BUFFER_MAX);
          }
          return next;
        });
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

  // ---------------------------------------------------------------------------
  // Snapshot promotion (every PLUGIN_TICK_MS)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const newPrev = new Map(curRef.current);
      for (const [uid, p] of newPrev) {
        if (now - p.updatedAt > PLAYER_STALE_MS) {
          newPrev.delete(uid);
          trailsRef.current.delete(uid);
        }
      }
      prevRef.current = newPrev;
      curRef.current = new Map(newPrev);
      tickStartRef.current = now;
      // Bump UI list version so React re-renders the table.
      setPlayerListVersion((v) => v + 1);
    }, PLUGIN_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Canvas render loop
  // ---------------------------------------------------------------------------
  //
  // Optimization passes (v2):
  //   1. DPR hard-capped to 1.0 — retina was paying ×2.25 pixel cost for
  //      no visible quality gain on small player dots / thin lines.
  //   2. Static layer cache — map.png + zone fills are baked once into an
  //      offscreen canvas at the map's native resolution, then a single
  //      `drawImage(layer, src, dst)` paints the current viewport per
  //      frame. Replaces map drawImage + N zone-polygon paths per frame.
  //   3. Glow sprite cache — per-team radial gradients are pre-rendered
  //      to 3 small offscreen canvases once; per-player rendering is a
  //      drawImage instead of createRadialGradient → fillStyle → arc.
  //   4. BG gradient cached across frames, recomputed on resize only.
  //   5. Effect deps narrowed to [mapName] — selectedUserid + showTrails
  //      are read via refs so clicking / toggling does NOT tear down the
  //      render loop (was rebuilding sprites + ResizeObserver per click).
  //   6. Trails batched into a single beginPath / stroke per player.
  //   7. All player coords rounded to integer screen pixels for crisp
  //      dots and stable sub-pixel HP bars.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.0);

    // Cached structures — invalidated on resize / asset change only.
    let bgGradient: CanvasGradient | null = null;
    let staticLayer: { canvas: HTMLCanvasElement; sig: string; size: number } | null = null;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      bgGradient = null;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ---- Glow sprite cache (one per team color) ----
    const buildGlowSprite = (rgba: string): HTMLCanvasElement => {
      const r = 7 * dpr;
      const radius = r * 3.2;
      const size = Math.ceil(radius * 2) + 2;
      const sp = document.createElement("canvas");
      sp.width = size;
      sp.height = size;
      const sctx = sp.getContext("2d")!;
      const c = size / 2;
      const grad = sctx.createRadialGradient(c, c, 0, c, c, radius);
      grad.addColorStop(0, rgba);
      grad.addColorStop(1, "transparent");
      sctx.fillStyle = grad;
      sctx.beginPath();
      sctx.arc(c, c, radius, 0, Math.PI * 2);
      sctx.fill();
      return sp;
    };
    const glowSprites = new Map<number, HTMLCanvasElement>();
    glowSprites.set(0, buildGlowSprite("rgba(158, 160, 168, 0.30)"));
    glowSprites.set(1, buildGlowSprite("rgba(231, 87, 47, 0.45)"));
    glowSprites.set(2, buildGlowSprite("rgba(95, 179, 233, 0.45)"));

    // ---- Static map + zones layer (baked at native map resolution) ----
    const ensureStaticLayer = (): { canvas: HTMLCanvasElement; size: number } | null => {
      const meta = mapMetaRef.current;
      const img = mapImgRef.current;
      const zs = zonesRef.current;
      if (!meta || !img || !img.complete) return null;
      const sig = `${meta.name}|${meta.image}|${(zs ?? []).length}|${img.naturalWidth}`;
      if (staticLayer && staticLayer.sig === sig) {
        return { canvas: staticLayer.canvas, size: staticLayer.size };
      }
      const size = Math.max(512, meta.size_px || img.naturalWidth || 1024);
      const off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      const offCtx = off.getContext("2d");
      if (!offCtx) return null;
      offCtx.imageSmoothingQuality = "high";

      offCtx.drawImage(img, 0, 0, size, size);
      // Slight dark veil so dots / text stay readable.
      offCtx.fillStyle = "rgba(10, 12, 20, 0.18)";
      offCtx.fillRect(0, 0, size, size);

      if (zs && zs.length) {
        const wW = (meta.world_max_x - meta.world_min_x) || 1;
        const wH = (meta.world_max_y - meta.world_min_y) || 1;
        for (const z of zs) {
          if (z.polygon.length < 3) continue;
          offCtx.beginPath();
          for (let i = 0; i < z.polygon.length; i++) {
            const zx = ((z.polygon[i]![0] - meta.world_min_x) / wW) * size;
            const zy = ((meta.world_max_y - z.polygon[i]![1]) / wH) * size;
            if (i === 0) offCtx.moveTo(zx, zy);
            else offCtx.lineTo(zx, zy);
          }
          offCtx.closePath();
          offCtx.fillStyle = (z.color ?? "#9966cc") + "22";
          offCtx.fill();
          offCtx.strokeStyle = (z.color ?? "#9966cc") + "88";
          offCtx.lineWidth = Math.max(2, size / 600);
          offCtx.stroke();
        }
      }

      staticLayer = { canvas: off, sig, size };
      return { canvas: off, size };
    };

    let raf = 0;
    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // BG gradient — recomputed only on resize.
      if (!bgGradient) {
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, "#0a0b14");
        bg.addColorStop(1, "#11131f");
        bgGradient = bg;
      }
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, w, h);

      const meta = mapMetaRef.current;
      const img = mapImgRef.current;
      const cur = curRef.current;
      const prev = prevRef.current;
      const allIds = new Set<number>([
        ...Array.from(prev.keys()),
        ...Array.from(cur.keys()),
      ]);

      let bMinX: number, bMinY: number, bMaxX: number, bMaxY: number;
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
        const padW = Math.max(256, (mxx - mnx) * 0.1);
        const padH = Math.max(256, (mxy - mny) * 0.1);
        bMinX = mnx - padW; bMaxX = mxx + padW;
        bMinY = mny - padH; bMaxY = mxy + padH;
      }

      // Follow-camera (D3)
      const follow = followUseridRef.current;
      if (follow) {
        const p = cur.get(follow) ?? prev.get(follow);
        if (p) {
          const fW = (bMaxX - bMinX) * 0.6;
          const fH = (bMaxY - bMinY) * 0.6;
          bMinX = p.x - fW / 2;
          bMaxX = p.x + fW / 2;
          bMinY = p.y - fH / 2;
          bMaxY = p.y + fH / 2;
        }
      }

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
        const py = offsetY + (bMaxY - gy) * scale;
        return [px, py];
      };
      projRef.current = { toPx, bounds: { bMinX, bMinY, bMaxX, bMaxY }, scale };

      // ---- Static layer (baked map + zones) — single drawImage ----
      const sl = ensureStaticLayer();
      if (sl && meta) {
        const wW = (meta.world_max_x - meta.world_min_x) || 1;
        const wH = (meta.world_max_y - meta.world_min_y) || 1;
        // Source rect on the native-size layer.
        const srcX = ((bMinX - meta.world_min_x) / wW) * sl.size;
        const srcY = ((meta.world_max_y - bMaxY) / wH) * sl.size;
        const srcW = (worldW / wW) * sl.size;
        const srcH = (worldH / wH) * sl.size;
        // Clip src rect — browsers throw on negative / out-of-bounds.
        const csx = Math.max(0, Math.min(sl.size, srcX));
        const csy = Math.max(0, Math.min(sl.size, srcY));
        const csw = Math.max(0, Math.min(sl.size, srcX + srcW) - csx);
        const csh = Math.max(0, Math.min(sl.size, srcY + srcH) - csy);
        if (csw > 0 && csh > 0 && srcW > 0 && srcH > 0) {
          const dxr = (csx - srcX) / srcW;
          const dyr = (csy - srcY) / srcH;
          const dwr = csw / srcW;
          const dhr = csh / srcH;
          ctx.drawImage(
            sl.canvas,
            csx, csy, csw, csh,
            offsetX + dxr * drawW,
            offsetY + dyr * drawH,
            dwr * drawW,
            dhr * drawH,
          );
        }
      } else if (!meta) {
        // Grid fallback when no radar PNG is available.
        ctx.strokeStyle = "rgba(140,150,180,0.08)";
        ctx.lineWidth = 1;
        const gridStep = 64 * dpr;
        ctx.beginPath();
        for (let x = 0; x <= w; x += gridStep) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = 0; y <= h; y += gridStep) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
      }

      // ---- Zone labels (text only — fills are baked into static layer) ----
      const zs = zonesRef.current;
      if (zs && zs.length) {
        ctx.font = `${10 * dpr}px ui-sans-serif, system-ui, sans-serif`;
        for (const z of zs) {
          if (z.polygon.length < 3) continue;
          let cxx = 0, cyy = 0;
          for (const [zx, zy] of z.polygon) {
            cxx += zx;
            cyy += zy;
          }
          cxx /= z.polygon.length;
          cyy /= z.polygon.length;
          const [lx, ly] = toPx(cxx, cyy);
          ctx.fillStyle = (z.color ?? "#9966cc") + "cc";
          const tw = ctx.measureText(z.name).width;
          ctx.fillText(z.name, lx - tw / 2, ly);
        }
      }

      const now = Date.now();
      const tickElapsed = now - tickStartRef.current;
      const t = Math.min(1, tickElapsed / PLUGIN_TICK_MS);

      // ---- Movement trails (D1) — batched per player ----
      if (showTrailsRef.current) {
        ctx.lineWidth = 1.5 * dpr;
        for (const uid of allIds) {
          const trail = trailsRef.current.get(uid);
          if (!trail || trail.points.length < 2) continue;
          const dst = cur.get(uid) ?? prev.get(uid);
          if (!dst) continue;
          const lastSeg = trail.points[trail.points.length - 1]!;
          const age = (now - lastSeg.ts) / 1000;
          const fade = Math.max(0, 1 - age / 6);
          if (fade <= 0) continue;
          ctx.strokeStyle = teamColor(dst.team);
          ctx.globalAlpha = fade * 0.5;
          ctx.beginPath();
          const [tx0, ty0] = toPx(trail.points[0]!.x, trail.points[0]!.y);
          ctx.moveTo(tx0, ty0);
          for (let i = 1; i < trail.points.length; i++) {
            const [bx, by] = toPx(trail.points[i]!.x, trail.points[i]!.y);
            ctx.lineTo(bx, by);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // ---- Kill markers (D2) ----
      const markers = killMarkersRef.current;
      const liveMarkers: KillMarker[] = [];
      ctx.font = `${16 * dpr}px ui-sans-serif`;
      for (const m of markers) {
        const age = now - m.ts;
        if (age > KILL_MARKER_TTL_MS) continue;
        liveMarkers.push(m);
        const fade = 1 - age / KILL_MARKER_TTL_MS;
        const [vpx, vpy] = toPx(m.vx, m.vy);
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#e75050";
        ctx.fillText("☠", vpx - 7 * dpr, vpy + 6 * dpr);
        if (m.killer_userid > 0 && m.killer_userid !== m.victim_userid) {
          const [kpx, kpy] = toPx(m.kx, m.ky);
          ctx.fillStyle = m.hs ? "#ffd23f" : "#ff8d33";
          ctx.fillText(m.hs ? "✦" : "✕", kpx - 5 * dpr, kpy + 5 * dpr);
        }
      }
      killMarkersRef.current = liveMarkers;
      ctx.globalAlpha = 1;

      // ---- Players ----
      const selected = selectedRef.current;
      const r = 7 * dpr;
      const nickFontPx = 11 * dpr;
      const afkFontPx = 11 * dpr;
      const crownFontPx = 10 * dpr;
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

        const [pxF, pyF] = toPx(ix, iy);
        const px = Math.round(pxF);
        const py = Math.round(pyF);
        const color = teamColor(dst.team);
        const glow = teamGlow(dst.team);
        const stale = !b ? Math.min(1, (now - a!.updatedAt) / PLAYER_STALE_MS) : 0;
        const isDead = ihp <= 0;
        ctx.globalAlpha = (1 - stale * 0.85) * (isDead ? 0.5 : 1);

        // Selection ring
        if (selected === uid) {
          ctx.beginPath();
          ctx.arc(px, py, r + 6 * dpr, 0, Math.PI * 2);
          ctx.strokeStyle = "#ffe060";
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        }
        // Glow sprite (replaces per-frame createRadialGradient)
        const sprite = glowSprites.get(dst.team);
        if (sprite) {
          ctx.drawImage(sprite, px - sprite.width / 2, py - sprite.height / 2);
        }
        // View cone
        const yawRad = (iyaw * Math.PI) / 180;
        const cxv = Math.cos(yawRad);
        const cyv = -Math.sin(yawRad);
        const coneLen = 22 * dpr;
        const coneHalf = 8 * dpr;
        const ncx = -cyv;
        const ncy = cxv;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(
          px + cxv * coneLen + ncx * coneHalf,
          py + cyv * coneLen + ncy * coneHalf,
        );
        ctx.lineTo(
          px + cxv * coneLen - ncx * coneHalf,
          py + cyv * coneLen - ncy * coneHalf,
        );
        ctx.closePath();
        ctx.fillStyle = glow;
        ctx.fill();
        // Dot
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = isDead ? "#444" : color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();

        // AFK
        const trail = trailsRef.current.get(uid);
        let afk = false;
        if (trail && trail.points.length >= 2 && !isDead) {
          const first = trail.points[0]!;
          const last = trail.points[trail.points.length - 1]!;
          const dxw = last.x - first.x;
          const dyw = last.y - first.y;
          const distSq = dxw * dxw + dyw * dyw;
          const span = last.ts - first.ts;
          if (span > AFK_THRESHOLD_MS && distSq < 100) afk = true;
        }
        if (afk) {
          ctx.font = `${afkFontPx}px ui-sans-serif`;
          ctx.fillStyle = "#a4a8b8";
          ctx.fillText("zZz", px - 9 * dpr, py - r - 10 * dpr);
        }

        // Admin crown
        if (isAdmin(dst.flags)) {
          ctx.font = `${crownFontPx}px ui-sans-serif`;
          ctx.fillStyle = "#ffd23f";
          ctx.fillText("♚", px - r - 8 * dpr, py - r + 2 * dpr);
        }

        // Nick label
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
          barX, barY,
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
      const radarTag = img && meta
        ? meta.generated_from_bsp ? "BSP" : "RADAR"
        : "GRID";
      ctx.fillText(
        `MAP ${map} · ${radarTag} · PLAYERS ${allIds.size} · 1px ≈ ${(1 / scale).toFixed(0)}u${
          follow ? " · FOLLOW " + follow : ""
        }`,
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
    // Narrowed deps: selectedUserid + showTrails read via refs above.
  }, [mapName]);

  // ---------------------------------------------------------------------------
  // Canvas click → hit-test → select / popover
  // ---------------------------------------------------------------------------
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / rect.width;
      const cx = (e.clientX - rect.left) * dpr;
      const cy = (e.clientY - rect.top) * dpr;

      const proj = projRef.current;
      if (!proj) return;

      // Hit test: nearest player within HIT_RADIUS px
      const HIT_RADIUS_PX = 18 * dpr;
      let best: { uid: number; d: number } | null = null;
      const cur = curRef.current;
      for (const [uid, p] of cur) {
        const [px, py] = proj.toPx(p.x, p.y);
        const dx = px - cx;
        const dy = py - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < HIT_RADIUS_PX && (!best || d < best.d)) {
          best = { uid, d };
        }
      }
      setSelectedUserid(best ? best.uid : null);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Derived player list (sorted by team then nick) — used by table
  // ---------------------------------------------------------------------------
  const playerList = useMemo(() => {
    void playerListVersion;
    const all = new Map<number, Player>();
    for (const [, p] of prevRef.current) all.set(p.userid, p);
    for (const [, p] of curRef.current) all.set(p.userid, p);
    return Array.from(all.values()).sort((a, b) => {
      if (a.team !== b.team) return a.team - b.team;
      return a.nick.localeCompare(b.nick);
    });
  }, [playerListVersion]);

  const selectedPlayer = selectedUserid != null
    ? curRef.current.get(selectedUserid) ?? prevRef.current.get(selectedUserid) ?? null
    : null;
  const selectedRosterRow = selectedUserid != null
    ? roster.find((r) => r.userid === selectedUserid) ?? null
    : null;

  // ---------------------------------------------------------------------------
  // Quick admin action helpers
  // ---------------------------------------------------------------------------
  const runQuickAction = useCallback<ActionRunner>(
    async (target, action, mode) => {
      const builder = mode === "off" ? action.build.off : action.build.on;
      if (!builder) return;
      const cmd = builder(target.nick);
      const announceLabel = `${action.emoji} ${action.label}${mode === "off" ? " · off" : ""} → ${target.nick}`;
      const announceColor = actionAnnounceColor(action, mode);
      try {
        const r = await api<{ ok: boolean; latency_ms: number }>(
          "/cs-rcon/action",
          {
            method: "POST",
            body: JSON.stringify({
              command: cmd,
              announce: announceLabel,
              announce_color: announceColor,
              target_nick: target.nick,
              target_steamid: target.steamid,
              effect_slug: action.effectSlug,
              effect_label: action.label,
              effect_emoji: action.emoji,
              state: action.oneShot ? null : (mode === "on" ? "grant" : "revoke"),
              duration_s: action.duration ?? null,
            }),
          },
        );
        toast.success(`${announceLabel} (${r.latency_ms}ms)`);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.detail);
        else toast.error("RCON error");
      }
    },
    [],
  );

  const kickPlayer = useCallback(async (nick: string, reason: string) => {
    try {
      const r = await api<{ ok: boolean; latency_ms: number }>(
        "/cs-rcon/action",
        {
          method: "POST",
          body: JSON.stringify({
            command: `jbf_uaio_kick -n ${nick}`,
            announce: `kick → ${nick}: ${reason}`,
            announce_color: "red",
            target_nick: nick,
          }),
        },
      );
      toast.success(`kick → ${nick} (${r.latency_ms}ms)`);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("RCON error");
    }
  }, []);

  const forumMute = useCallback(async (userId: number, durationMin: number) => {
    try {
      await api("/shoutbox/mute", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, duration_min: durationMin }),
      });
      toast.success(`forum chat mute · ${durationMin}m`);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("Mute error");
    }
  }, []);

  const specInGame = useCallback(async (targetUserid: number) => {
    try {
      const r = await api<{ ok: boolean; latency_ms: number }>(
        "/live/spec/follow",
        { method: "POST", body: JSON.stringify({ target_userid: targetUserid }) },
      );
      toast.success(`Spec → userid #${targetUserid} (${r.latency_ms}ms)`);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("Spec error");
    }
  }, []);

  const forumBan = useCallback(async (userId: number, reason: string) => {
    try {
      await api(`/admin/users/${userId}/ban`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      toast.success("forum ban applied");
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("Ban error");
    }
  }, []);

  const privateSay = useCallback(
    async (userid: number, text: string) => {
      try {
        await api<{ ok: boolean }>("/cs-rcon/private-say", {
          method: "POST",
          body: JSON.stringify({ userid, text }),
        });
        toast.success("Личное сообщение отправлено");
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.detail);
        else toast.error("RCON error");
      }
    },
    [],
  );

  const sayInChat = useCallback(async (text: string) => {
    try {
      await api<{ ok: boolean }>("/cs-rcon/say", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      toast.success("Отправлено в чат CS");
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("RCON error");
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const roundOverlay = useRoundOverlay(roundRef);

  return (
    <div className="container py-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-bone">
            <RadioTower className="h-6 w-6 text-cyan" />
            Live overview
          </h1>
          <p className="mt-1 text-sm text-smoke">
            Top-down позиции игроков, реальный radar карты, live-feed чата,
            kill-markers. Клик по игроку → его карта + быстрые действия.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleChip on={showTrails} setOn={setShowTrails} label="Trails" />
          <ToggleChip
            on={chatPanelOpen}
            setOn={setChatPanelOpen}
            label="Chat panel"
          />
          <ToggleChip on={streamOn} setOn={setStreamOn} label="Stream" />
          {followUserid != null && (
            <button
              type="button"
              onClick={() => setFollowUserid(null)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-flame/40 bg-flame/10 px-2 text-[10px] uppercase tracking-widest text-flame transition-colors hover:bg-flame/15"
            >
              <Target className="h-3 w-3" />
              unfollow #{followUserid}
            </button>
          )}
          <StatusChip liveOn={liveOn} wsConnected={wsConnected} />
          <button
            type="button"
            onClick={() => setLiveOn((v) => !v)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] uppercase tracking-widest transition-colors",
              liveOn
                ? "border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/15"
                : "border-border text-smoke hover:border-cyan/40 hover:text-bone",
            )}
          >
            {liveOn ? "live" : "off"}
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div
          ref={containerRef}
          className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="absolute inset-0 h-full w-full cursor-crosshair"
          />
          {/* Round timer overlay */}
          {roundOverlay && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-cyan/40 bg-void/70 px-3 py-1.5 font-mono text-[12px] text-cyan shadow-lg">
              ⏱  {roundOverlay}
            </div>
          )}
          {!liveOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-void/60 text-xs text-smoke">
              Live-стрим выключен.
            </div>
          )}
          {/* Player popover */}
          {selectedPlayer && (
            <PlayerPopover
              player={selectedPlayer}
              roster={selectedRosterRow}
              isStaff={isStaff}
              onClose={() => setSelectedUserid(null)}
              onFollow={() => setFollowUserid(selectedPlayer.userid)}
              onSpectate={specInGame}
              onAction={runQuickAction}
              onPrivateSay={privateSay}
              onKick={kickPlayer}
              onForumMute={forumMute}
              onForumBan={forumBan}
            />
          )}
        </div>

        {/* Chat panel */}
        {chatPanelOpen && (
          <ChatPanel
            lines={chatLines}
            canSend={!!user && isStaff}
            onSend={sayInChat}
            wsConnected={wsConnected}
          />
        )}
      </div>

      {/* Live spectator video stream */}
      {streamOn && (
        <section className="mt-6">
          <StreamPlayer active={streamOn} />
        </section>
      )}

      {/* Player table */}
      <section className="mt-6">
        <PlayerTable
          players={playerList}
          roster={roster}
          isStaff={isStaff}
          selectedUserid={selectedUserid}
          onSelect={setSelectedUserid}
          onFollow={(uid) => setFollowUserid(uid)}
        />
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Round timer hook — re-renders every 250ms while a round is live
// -----------------------------------------------------------------------------
function useRoundOverlay(roundRef: React.MutableRefObject<RoundState | null>) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  const r = roundRef.current;
  if (!r) return null;
  if (r.endedAt) return "round over";
  const elapsed = Date.now() - r.startedAt;
  const remaining = Math.max(0, r.durationMs - elapsed);
  const min = Math.floor(remaining / 60_000);
  const sec = Math.floor((remaining % 60_000) / 1000);
  return `${min}:${String(sec).padStart(2, "0")} left`;
}

// -----------------------------------------------------------------------------
// UI bits
// -----------------------------------------------------------------------------
function StatusChip({
  liveOn,
  wsConnected,
}: {
  liveOn: boolean;
  wsConnected: boolean;
}) {
  return (
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
        className={cn("h-3 w-3", liveOn && wsConnected && "animate-pulse-slow")}
      />
      {liveOn ? (wsConnected ? "online" : "connecting…") : "off"}
    </span>
  );
}

function ToggleChip({
  on, setOn, label,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] uppercase tracking-widest transition-colors",
        on
          ? "border-cyan/40 bg-cyan/10 text-cyan"
          : "border-border text-smoke hover:border-cyan/40 hover:text-bone",
      )}
    >
      {label}: {on ? "on" : "off"}
    </button>
  );
}

// -----------------------------------------------------------------------------
// PlayerTable
// -----------------------------------------------------------------------------
function PlayerTable({
  players,
  roster,
  isStaff,
  selectedUserid,
  onSelect,
  onFollow,
}: {
  players: Player[];
  roster: RosterRow[];
  isStaff: boolean;
  selectedUserid: number | null;
  onSelect: (uid: number | null) => void;
  onFollow: (uid: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-bone">
          <Users className="h-4 w-4 text-cyan" />
          Игроки на сервере
          <span className="font-mono text-[10px] text-smoke">
            · {players.length}
          </span>
        </h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-void/40 text-[10px] uppercase tracking-widest text-smoke">
              <th className="px-3 py-2 text-left">Ник</th>
              <th className="px-2 py-2 text-left">T</th>
              <th className="px-2 py-2 text-right">HP</th>
              <th className="px-2 py-2 text-right">K/D</th>
              <th className="px-2 py-2 text-right">$</th>
              <th className="px-2 py-2 text-left">Оружие</th>
              {isStaff && (
                <>
                  <th className="px-2 py-2 text-right">Ping</th>
                  <th className="px-2 py-2 text-left">Time</th>
                  <th className="px-2 py-2 text-left">SteamID</th>
                </>
              )}
              <th className="px-2 py-2 text-left">Флаги</th>
              <th className="px-3 py-2 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 ? (
              <tr>
                <td
                  colSpan={isStaff ? 11 : 8}
                  className="px-3 py-6 text-center text-xs text-smoke"
                >
                  Никого на сервере (или плагин ещё не задеплоен — нужно
                  changelevel для подхвата jbf_position_dump v0.2.0)
                </td>
              </tr>
            ) : (
              players.map((p) => {
                const r = roster.find((x) => x.userid === p.userid);
                const sel = selectedUserid === p.userid;
                return (
                  <tr
                    key={p.userid}
                    onClick={() => onSelect(p.userid)}
                    className={cn(
                      "cursor-pointer border-b border-border/50 transition-colors hover:bg-slate/40",
                      sel && "bg-plasma/10",
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <span
                        className="font-semibold"
                        style={{ color: teamColor(p.team) }}
                      >
                        {p.nick}
                      </span>
                      {isAdmin(p.flags) && (
                        <span className="ml-1 text-flame" title="admin">
                          ♚
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono">
                      {teamLabel(p.team)}
                    </td>
                    <td
                      className="px-2 py-1.5 text-right font-mono"
                      style={{ color: hpColor(p.hp) }}
                    >
                      {p.hp}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {p.kills != null
                        ? `${p.kills}/${p.deaths ?? 0}`
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {p.money != null ? `$${p.money}` : "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-iridescent">
                      {p.weapon ?? "—"}
                    </td>
                    {isStaff && (
                      <>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {r ? `${r.ping}` : "—"}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-smoke">
                          {r?.time ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-smoke">
                          {r?.steamid ?? "—"}
                        </td>
                      </>
                    )}
                    <td className="px-2 py-1.5 font-mono text-smoke">
                      {p.flags || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFollow(p.userid);
                        }}
                        className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[10px] uppercase tracking-widest text-smoke transition-colors hover:border-flame/40 hover:text-flame"
                      >
                        <Target className="h-3 w-3" />
                        follow
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ChatPanel
// -----------------------------------------------------------------------------
function ChatPanel({
  lines,
  canSend,
  onSend,
  wsConnected,
}: {
  lines: ChatLine[];
  canSend: boolean;
  onSend: (text: string) => Promise<void>;
  wsConnected: boolean;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <aside className="flex h-[576px] flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-tight text-bone">
          <MessageSquare className="h-3.5 w-3.5 text-cyan" />
          Чат сервера
        </h3>
        <span
          className={cn(
            "font-mono text-[9px] uppercase tracking-widest",
            wsConnected ? "text-cyan" : "text-smoke",
          )}
        >
          {wsConnected ? "live" : "off"}
        </span>
      </header>
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px]"
      >
        {lines.length === 0 ? (
          <p className="py-8 text-center text-[11px] text-smoke">
            Слушаю сервер… первое сообщение появится здесь.
          </p>
        ) : (
          lines.map((l) => (
            <div key={l.id} className="break-words text-ash">
              {l.body}
            </div>
          ))
        )}
      </div>
      {canSend && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            await onSend(text.trim());
            setText("");
          }}
          className="flex items-stretch gap-1 border-t border-border bg-void/40 px-2 py-2"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="В чат сервера…"
            maxLength={200}
            className="h-7 flex-1 rounded-md border border-border bg-card px-2 text-[11px] text-ash outline-none transition-colors placeholder:text-smoke focus:border-plasma/60"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="inline-flex h-7 items-center justify-center rounded-md bg-plasma px-2 text-white transition-all hover:bg-plasma-bright disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Отправить"
          >
            <Send className="h-3 w-3" />
          </button>
        </form>
      )}
    </aside>
  );
}
