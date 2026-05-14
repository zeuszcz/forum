"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState } from "react";

import { mulberry32, useArcadeRun } from "../../_components/useArcadeRun";

import { GameShell } from "./GameShell";

const W = 720;
const H = 280;
const GROUND_Y = 240;
const PLAYER_X = 80;
const PLAYER_W = 28;
const PLAYER_H = 56;
const PLAYER_DUCK_H = 28;

type Obstacle = {
  x: number;
  w: number;
  h: number;
  kind: "barrier" | "pipe" | "guard"; // barrier = jump, pipe (top) = duck, guard = jump
};

type GameState = {
  player: {
    y: number; // top of bbox
    vy: number;
    onGround: boolean;
    ducking: boolean;
    alive: boolean;
  };
  worldSpeed: number;
  distance: number;       // metres scrolled
  obstacles: Obstacle[];
  spawnTimerMs: number;
  rng: () => number;
};

const GRAVITY = 1800;
const JUMP_VELOCITY = -650;

function newObstacle(s: GameState): Obstacle {
  const r = s.rng();
  // Difficulty: pipes show up after distance 100, guards after 300
  let kind: Obstacle["kind"] = "barrier";
  if (s.distance > 300 && r < 0.25) kind = "guard";
  else if (s.distance > 100 && r < 0.5) kind = "pipe";
  if (kind === "pipe") {
    return { x: W + 20, w: 64, h: 60, kind };
  } else if (kind === "guard") {
    return { x: W + 20, w: 30, h: 56, kind };
  }
  return { x: W + 20, w: 22, h: 38, kind: "barrier" };
}

export function RunnerGame({
  game,
}: {
  game: {
    slug: string;
    title: string;
    emoji: string;
    accent: string;
    description: string;
    controls: string;
    score_unit: string;
  };
}) {
  const { state: runState, error, start, end } = useArcadeRun(game.slug);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const rafRef = useRef<number | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (runState.phase !== "running") return;
    const rng = mulberry32(runState.seed);
    const st: GameState = {
      player: {
        y: GROUND_Y - PLAYER_H,
        vy: 0,
        onGround: true,
        ducking: false,
        alive: true,
      },
      worldSpeed: 260,
      distance: 0,
      obstacles: [],
      spawnTimerMs: 1400,
      rng,
    };
    stateRef.current = st;
    setTick((t) => t + 1);
  }, [runState.phase, runState.phase === "running" ? runState.seed : 0]);

  useEffect(() => {
    if (runState.phase !== "running") return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      const canvas = canvasRef.current;
      if (!s || !canvas) return;
      if (!s.player.alive) {
        end(Math.floor(s.distance), {
          milestones: [{ d: Math.floor(s.distance), t: Date.now() }],
          meta: { distance: s.distance },
        });
        return;
      }

      // Speed up over distance
      s.worldSpeed = 260 + Math.min(440, s.distance * 0.6);
      s.distance += (s.worldSpeed * dt) / 8; // 1m per 8px

      // Player physics
      const keys = keysRef.current;
      const wantJump =
        keys.has(" ") || keys.has("ArrowUp") || keys.has("w") || keys.has("W");
      const wantDuck =
        keys.has("ArrowDown") || keys.has("s") || keys.has("S");
      if (wantJump && s.player.onGround && !s.player.ducking) {
        s.player.vy = JUMP_VELOCITY;
        s.player.onGround = false;
      }
      s.player.ducking = wantDuck && s.player.onGround;

      if (!s.player.onGround) {
        s.player.vy += GRAVITY * dt;
        s.player.y += s.player.vy * dt;
        if (s.player.y >= GROUND_Y - PLAYER_H) {
          s.player.y = GROUND_Y - PLAYER_H;
          s.player.vy = 0;
          s.player.onGround = true;
        }
      } else {
        s.player.y = GROUND_Y - (s.player.ducking ? PLAYER_DUCK_H : PLAYER_H);
      }

      // Obstacles
      s.spawnTimerMs -= dt * 1000;
      if (s.spawnTimerMs <= 0) {
        s.obstacles.push(newObstacle(s));
        // Cadence shortens with speed
        s.spawnTimerMs = 700 + s.rng() * 800 - Math.min(400, s.distance * 0.6);
      }
      for (const o of s.obstacles) {
        o.x -= s.worldSpeed * dt;
      }
      s.obstacles = s.obstacles.filter((o) => o.x > -80);

      // Collision
      const phH = s.player.ducking ? PLAYER_DUCK_H : PLAYER_H;
      const px0 = PLAYER_X;
      const px1 = PLAYER_X + PLAYER_W;
      const py0 = s.player.y;
      const py1 = s.player.y + phH;
      for (const o of s.obstacles) {
        let oy0: number, oy1: number;
        if (o.kind === "pipe") {
          // Hanging pipe — top of stage
          oy0 = 0;
          oy1 = o.h;
        } else {
          oy0 = GROUND_Y - o.h;
          oy1 = GROUND_Y;
        }
        const ox0 = o.x;
        const ox1 = o.x + o.w;
        if (px1 > ox0 && px0 < ox1 && py1 > oy0 && py0 < oy1) {
          s.player.alive = false;
          break;
        }
      }

      draw(canvas, s);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [runState.phase, tick, end]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (["ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  return (
    <GameShell
      game={game}
      runState={runState}
      error={error}
      onStart={start}
      scoreBadge={
        runState.phase === "running" && stateRef.current ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-sm text-emerald-200">
            {Math.floor(stateRef.current.distance)} м
          </div>
        ) : null
      }
      canvasArea={
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block h-auto w-full"
          style={{ aspectRatio: `${W} / ${H}` }}
        />
      }
    />
  );
}

function draw(canvas: HTMLCanvasElement, s: GameState) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Bg
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(0, 0, W, H);
  // Stripes for parallax
  const stripeOffset = (s.distance * 4) % 40;
  ctx.fillStyle = "rgba(34,197,94,0.06)";
  for (let i = -1; i < W / 40 + 2; i++) {
    ctx.fillRect(i * 40 - stripeOffset, 0, 20, H);
  }
  // Ceiling pipes line
  ctx.fillStyle = "#3a1820";
  ctx.fillRect(0, 0, W, 4);
  // Ground
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(W, GROUND_Y);
  ctx.stroke();

  // Obstacles
  for (const o of s.obstacles) {
    if (o.kind === "pipe") {
      ctx.fillStyle = "#7c3aed";
      ctx.fillRect(o.x, 0, o.w, o.h);
      ctx.fillStyle = "#5b21b6";
      ctx.fillRect(o.x, o.h - 6, o.w, 6);
    } else if (o.kind === "guard") {
      const oy = GROUND_Y - o.h;
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(o.x, oy, o.w, o.h);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(o.x, oy + o.h - 14, o.w, 14);
      ctx.fillStyle = "#f5e8d4";
      ctx.fillRect(o.x + 4, oy + 6, o.w - 8, 14);
    } else {
      // barrier — chair
      const oy = GROUND_Y - o.h;
      ctx.fillStyle = "#9a3412";
      ctx.fillRect(o.x, oy, o.w, o.h);
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(o.x - 2, oy, o.w + 4, 6);
    }
  }

  // Player
  const phH = s.player.ducking ? PLAYER_DUCK_H : PLAYER_H;
  ctx.fillStyle = "#10b981";
  ctx.fillRect(PLAYER_X, s.player.y, PLAYER_W, phH);
  ctx.fillStyle = "#065f46";
  ctx.fillRect(PLAYER_X, s.player.y + phH - 12, PLAYER_W, 12);
  ctx.fillStyle = "#f5e8d4";
  if (!s.player.ducking) {
    ctx.fillRect(PLAYER_X + 4, s.player.y + 4, PLAYER_W - 8, 14);
  }

  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, W, 24);
  ctx.fillStyle = "#34d399";
  ctx.font = "12px monospace";
  ctx.fillText(`${Math.floor(s.distance)} м`, 6, 16);
  ctx.fillStyle = "#fde047";
  ctx.fillText(`скорость ${Math.floor(s.worldSpeed)}`, 100, 16);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`SPACE = прыжок · ↓ = подкат`, 220, 16);
}
