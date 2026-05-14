"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState } from "react";

import { mulberry32, useArcadeRun } from "../../_components/useArcadeRun";

import { GameShell } from "./GameShell";

const W = 480;
const H = 480;
const CELL = 24;
const COLS = W / CELL; // 20
const ROWS = H / CELL; // 20

type Spotlight = {
  cx: number;
  cy: number;
  angle: number;
  rotSpeed: number; // rad/sec
  radius: number;
  beamWidth: number; // rad
};

type Checkpoint = {
  col: number;
  row: number;
  collected: boolean;
};

type GameState = {
  player: { col: number; row: number };
  score: number;
  alive: boolean;
  spotlights: Spotlight[];
  checkpoints: Checkpoint[];
  lastInputAt: number;
  rng: () => number;
  timeElapsed: number;
};

const MOVE_COOLDOWN_MS = 120;

function spawnCheckpoint(state: GameState) {
  // Random cell not on player and not too close
  for (let tries = 0; tries < 20; tries++) {
    const c = Math.floor(state.rng() * COLS);
    const r = Math.floor(state.rng() * ROWS);
    if (Math.abs(c - state.player.col) + Math.abs(r - state.player.row) > 6) {
      state.checkpoints = [{ col: c, row: r, collected: false }];
      return;
    }
  }
  state.checkpoints = [{ col: 0, row: 0, collected: false }];
}

function spawnSpotlight(state: GameState) {
  state.spotlights.push({
    cx: state.rng() * W,
    cy: state.rng() * H,
    angle: state.rng() * Math.PI * 2,
    rotSpeed: (state.rng() - 0.5) * 1.6,
    radius: 110 + state.rng() * 60,
    beamWidth: 0.6 + state.rng() * 0.4,
  });
}

export function SpotlightGame({
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
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (runState.phase !== "running") return;
    const rng = mulberry32(runState.seed);
    const st: GameState = {
      player: { col: Math.floor(COLS / 2), row: ROWS - 2 },
      score: 0,
      alive: true,
      spotlights: [],
      checkpoints: [],
      lastInputAt: 0,
      rng,
      timeElapsed: 0,
    };
    spawnSpotlight(st);
    spawnSpotlight(st);
    spawnCheckpoint(st);
    stateRef.current = st;
    setTick((t) => t + 1);
  }, [runState.phase, runState.phase === "running" ? runState.seed : 0]);

  useEffect(() => {
    if (runState.phase !== "running") return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      const canvas = canvasRef.current;
      if (!s || !canvas) return;
      if (s.alive) {
        s.timeElapsed += dt;
        // Rotate spotlights
        for (const sl of s.spotlights) {
          sl.angle += sl.rotSpeed * dt;
        }
        // Check beam hit
        const px = s.player.col * CELL + CELL / 2;
        const py = s.player.row * CELL + CELL / 2;
        for (const sl of s.spotlights) {
          const dx = px - sl.cx;
          const dy = py - sl.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > sl.radius) continue;
          const ang = Math.atan2(dy, dx);
          let delta = ang - sl.angle;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          if (Math.abs(delta) <= sl.beamWidth / 2) {
            s.alive = false;
            break;
          }
        }
        // Check checkpoint collected
        if (s.checkpoints.length > 0) {
          const c = s.checkpoints[0];
          if (!c.collected && c.col === s.player.col && c.row === s.player.row) {
            c.collected = true;
            s.score += 1;
            // Add a new spotlight every 3 checkpoints
            if (s.score % 3 === 0) spawnSpotlight(s);
            spawnCheckpoint(s);
          }
        }
      }
      draw(canvas, s);
      if (s.alive) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        end(s.score, {
          milestones: [{ t: Date.now(), score: s.score }],
          meta: { time: s.timeElapsed, spotlights: s.spotlights.length },
        });
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [runState.phase, tick, end]);

  useEffect(() => {
    if (runState.phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s || !s.alive) return;
      const now = performance.now();
      if (now - s.lastInputAt < MOVE_COOLDOWN_MS) return;
      const k = e.key;
      if (k === "w" || k === "W" || k === "ArrowUp") {
        if (s.player.row > 0) {
          s.player.row -= 1;
          s.lastInputAt = now;
        }
      } else if (k === "s" || k === "S" || k === "ArrowDown") {
        if (s.player.row < ROWS - 1) {
          s.player.row += 1;
          s.lastInputAt = now;
        }
      } else if (k === "a" || k === "A" || k === "ArrowLeft") {
        if (s.player.col > 0) {
          s.player.col -= 1;
          s.lastInputAt = now;
        }
      } else if (k === "d" || k === "D" || k === "ArrowRight") {
        if (s.player.col < COLS - 1) {
          s.player.col += 1;
          s.lastInputAt = now;
        }
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runState.phase]);

  return (
    <GameShell
      game={game}
      runState={runState}
      error={error}
      onStart={start}
      scoreBadge={
        runState.phase === "running" && stateRef.current ? (
          <div className="rounded-md border border-cyan/40 bg-cyan/10 px-3 py-1.5 font-mono text-sm text-cyan">
            {stateRef.current.score} чекпоинтов
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
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = "rgba(34,211,238,0.06)";
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, H);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(W, r * CELL);
    ctx.stroke();
  }

  // Spotlight beams
  for (const sl of s.spotlights) {
    ctx.save();
    ctx.translate(sl.cx, sl.cy);
    ctx.rotate(sl.angle);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, sl.radius);
    grad.addColorStop(0, "rgba(250,204,21,0.45)");
    grad.addColorStop(1, "rgba(250,204,21,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, sl.radius, -sl.beamWidth / 2, sl.beamWidth / 2);
    ctx.closePath();
    ctx.fill();
    // Tower dot
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  // Checkpoint
  for (const c of s.checkpoints) {
    if (c.collected) continue;
    const x = c.col * CELL + CELL / 2;
    const y = c.row * CELL + CELL / 2;
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Player
  const px = s.player.col * CELL + CELL / 2;
  const py = s.player.row * CELL + CELL / 2;
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(px - 6, py - 8, 12, 16);
  ctx.fillStyle = "#0e7490";
  ctx.fillRect(px - 6, py + 2, 12, 6);

  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, W, 22);
  ctx.fillStyle = "#22d3ee";
  ctx.font = "12px monospace";
  ctx.fillText(`Чекпоинты ${s.score}`, 6, 16);
  ctx.fillStyle = "#facc15";
  ctx.fillText(`Прожекторов ${s.spotlights.length}`, 140, 16);
}
