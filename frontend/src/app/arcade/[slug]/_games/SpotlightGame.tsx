"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState } from "react";

import { mulberry32, useArcadeRun } from "../../_components/useArcadeRun";

import { GameShell } from "./GameShell";

const W = 480;
const H = 480;
const CELL = 24;
const COLS = W / CELL;
const ROWS = H / CELL;

type Spotlight = {
  cx: number;
  cy: number;
  angle: number;
  rotSpeed: number;
  radius: number;
  beamWidth: number;
  mountColor: string;
};

type Checkpoint = {
  col: number;
  row: number;
  collected: boolean;
};

type SmokeBomb = {
  col: number;
  row: number;
  bobPhase: number;
};

type FootStep = {
  x: number;
  y: number;
  life: number;
};

type DustMote = {
  x: number;
  y: number;
  size: number;
  speed: number;
};

type GameState = {
  player: { col: number; row: number };
  prevPlayer: { col: number; row: number };
  moveAnim: number;
  score: number;
  alive: boolean;
  spotlights: Spotlight[];
  checkpoints: Checkpoint[];
  smokeBombs: SmokeBomb[];
  footSteps: FootStep[];
  dust: DustMote[];
  lastInputAt: number;
  rng: () => number;
  timeElapsed: number;
  hitFlash: number;
  particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>;
  bgPulse: number;
  invisibleUntil: number;       // ms since perf.now origin when invisibility expires
  smokeReady: boolean;           // current smoke charge ready to deploy (Space)
  ringPulses: Array<{ x: number; y: number; r: number; life: number; color: string }>;
};

const MOVE_COOLDOWN_MS = 120;

function spawnCheckpoint(state: GameState) {
  for (let tries = 0; tries < 30; tries++) {
    const c = Math.floor(state.rng() * COLS);
    const r = Math.floor(state.rng() * ROWS);
    if (Math.abs(c - state.player.col) + Math.abs(r - state.player.row) > 6) {
      state.checkpoints = [{ col: c, row: r, collected: false }];
      return;
    }
  }
  state.checkpoints = [{ col: 0, row: 0, collected: false }];
}

function spawnSmokeBomb(state: GameState) {
  for (let tries = 0; tries < 25; tries++) {
    const c = Math.floor(state.rng() * COLS);
    const r = Math.floor(state.rng() * ROWS);
    if (Math.abs(c - state.player.col) + Math.abs(r - state.player.row) > 5) {
      state.smokeBombs.push({ col: c, row: r, bobPhase: 0 });
      return;
    }
  }
}

function spawnSpotlight(state: GameState) {
  const colors = ["#facc15", "#fb923c", "#f97316"];
  state.spotlights.push({
    cx: state.rng() * W,
    cy: state.rng() * H,
    angle: state.rng() * Math.PI * 2,
    rotSpeed: (state.rng() - 0.5) * 1.6,
    radius: 110 + state.rng() * 60,
    beamWidth: 0.55 + state.rng() * 0.35,
    mountColor: colors[Math.floor(state.rng() * colors.length)],
  });
}

function spawnHitParticles(s: GameState, x: number, y: number) {
  for (let i = 0; i < 14; i++) {
    const a = s.rng() * Math.PI * 2;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * (80 + s.rng() * 100),
      vy: Math.sin(a) * (80 + s.rng() * 100),
      life: 0.5 + s.rng() * 0.5,
      color: s.rng() < 0.6 ? "#facc15" : "#fff",
    });
  }
}

function spawnCollectParticles(s: GameState, x: number, y: number) {
  for (let i = 0; i < 16; i++) {
    const a = s.rng() * Math.PI * 2;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * (90 + s.rng() * 80),
      vy: Math.sin(a) * (90 + s.rng() * 80) - 40,
      life: 0.7 + s.rng() * 0.4,
      color: s.rng() < 0.7 ? "#34d399" : "#a7f3d0",
    });
  }
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
    const dust: DustMote[] = [];
    for (let i = 0; i < 30; i++) {
      dust.push({
        x: rng() * W,
        y: rng() * H,
        size: 1 + rng() * 2,
        speed: 8 + rng() * 18,
      });
    }
    const st: GameState = {
      player: { col: Math.floor(COLS / 2), row: ROWS - 2 },
      prevPlayer: { col: Math.floor(COLS / 2), row: ROWS - 2 },
      moveAnim: 1,
      score: 0,
      alive: true,
      spotlights: [],
      checkpoints: [],
      smokeBombs: [],
      footSteps: [],
      dust,
      lastInputAt: 0,
      rng,
      timeElapsed: 0,
      hitFlash: 0,
      particles: [],
      bgPulse: 0,
      invisibleUntil: 0,
      smokeReady: false,
      ringPulses: [],
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
        s.bgPulse += dt * 0.6;
        for (const sl of s.spotlights) sl.angle += sl.rotSpeed * dt;
        const isInvisible = now < s.invisibleUntil;
        // Beam hit detection — skipped while invisible
        const px = s.player.col * CELL + CELL / 2;
        const py = s.player.row * CELL + CELL / 2;
        if (!isInvisible) {
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
              s.hitFlash = 1;
              spawnHitParticles(s, px, py);
              break;
            }
          }
        }
        // Checkpoint collected
        if (s.checkpoints.length > 0) {
          const c = s.checkpoints[0];
          if (!c.collected && c.col === s.player.col && c.row === s.player.row) {
            c.collected = true;
            s.score += 1;
            spawnCollectParticles(s, c.col * CELL + CELL / 2, c.row * CELL + CELL / 2);
            s.ringPulses.push({
              x: c.col * CELL + CELL / 2,
              y: c.row * CELL + CELL / 2,
              r: 8,
              life: 1.0,
              color: "#10b981",
            });
            if (s.score % 3 === 0) spawnSpotlight(s);
            if (s.score % 4 === 0 && s.smokeBombs.length < 2) spawnSmokeBomb(s);
            spawnCheckpoint(s);
          }
        }
        // Smoke bomb pickup
        for (const sb of s.smokeBombs) {
          if (sb.col === s.player.col && sb.row === s.player.row) {
            s.smokeReady = true;
            sb.col = -999;
            spawnCollectParticles(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2);
            s.ringPulses.push({
              x: s.player.col * CELL + CELL / 2,
              y: s.player.row * CELL + CELL / 2,
              r: 6,
              life: 1.0,
              color: "#a855f7",
            });
          }
        }
        s.smokeBombs = s.smokeBombs.filter((sb) => sb.col >= 0);
      }
      // Ring pulses tick
      for (const r of s.ringPulses) {
        r.r += dt * 70;
        r.life -= dt * 1.4;
      }
      s.ringPulses = s.ringPulses.filter((r) => r.life > 0);
      // Animation easings
      if (s.moveAnim < 1) s.moveAnim = Math.min(1, s.moveAnim + dt * 14);
      if (s.hitFlash > 0) s.hitFlash = Math.max(0, s.hitFlash - dt * 1.2);
      // Foot steps fade
      for (const f of s.footSteps) f.life -= dt;
      s.footSteps = s.footSteps.filter((f) => f.life > 0);
      // Dust drift
      for (const d of s.dust) {
        d.x += d.speed * dt;
        if (d.x > W + 6) {
          d.x = -6;
          d.y = s.rng() * H;
        }
      }
      // Particles
      for (const p of s.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 240 * dt;
        p.life -= dt * 1.4;
      }
      s.particles = s.particles.filter((p) => p.life > 0);

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
      // Use e.code for letters (layout-independent); e.key for arrows.
      const code = e.code;
      const k = e.key;
      // Smoke bomb deploy on Space — no cooldown gate
      if ((code === "Space" || k === " ") && s.smokeReady) {
        s.smokeReady = false;
        s.invisibleUntil = now + 3000;
        // Visual smoke puff
        for (let i = 0; i < 24; i++) {
          const ang = s.rng() * Math.PI * 2;
          s.particles.push({
            x: s.player.col * CELL + CELL / 2,
            y: s.player.row * CELL + CELL / 2,
            vx: Math.cos(ang) * (60 + s.rng() * 60),
            vy: Math.sin(ang) * (60 + s.rng() * 60),
            life: 0.8 + s.rng() * 0.4,
            color: s.rng() < 0.5 ? "#94a3b8" : "#a855f7",
          });
        }
        s.ringPulses.push({
          x: s.player.col * CELL + CELL / 2,
          y: s.player.row * CELL + CELL / 2,
          r: 4,
          life: 1.0,
          color: "#a855f7",
        });
        e.preventDefault();
        return;
      }
      if (now - s.lastInputAt < MOVE_COOLDOWN_MS) return;
      let moved = false;
      if (code === "KeyW" || k === "ArrowUp") {
        if (s.player.row > 0) {
          s.prevPlayer = { ...s.player };
          s.player.row -= 1;
          moved = true;
        }
      } else if (code === "KeyS" || k === "ArrowDown") {
        if (s.player.row < ROWS - 1) {
          s.prevPlayer = { ...s.player };
          s.player.row += 1;
          moved = true;
        }
      } else if (code === "KeyA" || k === "ArrowLeft") {
        if (s.player.col > 0) {
          s.prevPlayer = { ...s.player };
          s.player.col -= 1;
          moved = true;
        }
      } else if (code === "KeyD" || k === "ArrowRight") {
        if (s.player.col < COLS - 1) {
          s.prevPlayer = { ...s.player };
          s.player.col += 1;
          moved = true;
        }
      }
      if (moved) {
        s.lastInputAt = now;
        s.moveAnim = 0;
        s.footSteps.push({
          x: s.prevPlayer.col * CELL + CELL / 2,
          y: s.prevPlayer.row * CELL + CELL / 2,
          life: 0.8,
        });
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k) || code === "Space") {
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
          <div className="flex items-center gap-2">
            <div className="rounded-md border border-cyan/40 bg-cyan/10 px-3 py-1.5 font-mono text-sm text-cyan">
              🚩 {stateRef.current.score} · 💡 {stateRef.current.spotlights.length}
            </div>
            {stateRef.current.smokeReady && (
              <div className="rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-1.5 font-mono text-xs text-purple-300">
                💨 SPACE
              </div>
            )}
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

  // Background — concrete yard with subtle radial vignette
  ctx.fillStyle = "#0a0a10";
  ctx.fillRect(0, 0, W, H);
  // Yard tiles
  const tileGrad = ctx.createLinearGradient(0, 0, 0, H);
  tileGrad.addColorStop(0, "rgba(34, 211, 238, 0.04)");
  tileGrad.addColorStop(1, "rgba(34, 211, 238, 0.01)");
  ctx.fillStyle = tileGrad;
  ctx.fillRect(0, 0, W, H);
  // Concrete cracks (procedural)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.025)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const x = (i * 87 + (s.timeElapsed * 0) % W) % W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 30, H);
    ctx.stroke();
  }

  // Grid lines
  ctx.strokeStyle = "rgba(34,211,238,0.05)";
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

  // Dust motes
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  for (const d of s.dust) {
    ctx.fillRect(d.x, d.y, d.size, d.size);
  }

  // Foot steps trail
  for (const f of s.footSteps) {
    ctx.fillStyle = `rgba(34, 211, 238, ${f.life * 0.4})`;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Spotlight beams (soft, animated)
  for (const sl of s.spotlights) {
    ctx.save();
    ctx.translate(sl.cx, sl.cy);
    ctx.rotate(sl.angle);
    // Edge softening — three concentric cones with decreasing opacity
    for (let layer = 0; layer < 3; layer++) {
      const widen = 1 + layer * 0.1;
      const alpha = 0.5 - layer * 0.15;
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, sl.radius * widen);
      grad.addColorStop(0, `rgba(250,204,21,${alpha})`);
      grad.addColorStop(0.6, `rgba(250,204,21,${alpha * 0.4})`);
      grad.addColorStop(1, "rgba(250,204,21,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, sl.radius * widen, -sl.beamWidth * widen / 2, sl.beamWidth * widen / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Tower base — small detailed sprite
    ctx.save();
    ctx.translate(sl.cx, sl.cy);
    // Outer ring (mount)
    ctx.strokeStyle = sl.mountColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.stroke();
    // Inner light (rotating with beam)
    ctx.rotate(sl.angle);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-3, -1, 8, 2);
    ctx.fillStyle = "#fef9c3";
    ctx.fillRect(0, -1, 5, 2);
    ctx.restore();
  }

  // Smoke bombs on map
  for (const sb of s.smokeBombs) {
    sb.bobPhase += 0.05;
    const cx = sb.col * CELL + CELL / 2;
    const cy = sb.row * CELL + CELL / 2;
    const bob = Math.sin(sb.bobPhase) * 2;
    // Halo
    ctx.fillStyle = "rgba(168, 85, 247, 0.25)";
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 12, 0, Math.PI * 2);
    ctx.fill();
    // Body — round bomb
    ctx.fillStyle = "#581c87";
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a855f7";
    ctx.beginPath();
    ctx.arc(cx - 2, cy + bob - 2, 2, 0, Math.PI * 2);
    ctx.fill();
    // Fuse + spark
    ctx.fillStyle = "#fde047";
    ctx.fillRect(cx + 1, cy + bob - 8, 1, 4);
    const spark = (s.bgPulse * 8) % 1;
    if (spark < 0.5) {
      ctx.fillStyle = "#fef9c3";
      ctx.fillRect(cx + 1, cy + bob - 9, 1, 1);
    }
  }

  // Ring pulses
  for (const r of s.ringPulses) {
    ctx.strokeStyle = `rgba(${r.color === "#10b981" ? "16, 185, 129" : "168, 85, 247"}, ${r.life * 0.7})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Checkpoint — pulsing ring + arrow toward it
  for (const c of s.checkpoints) {
    if (c.collected) continue;
    const cx = c.col * CELL + CELL / 2;
    const cy = c.row * CELL + CELL / 2;
    const pulse = 0.7 + Math.sin(s.bgPulse * 4) * 0.3;
    // Outer pulsing halo
    ctx.fillStyle = `rgba(16, 185, 129, ${pulse * 0.25})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 14 + Math.sin(s.bgPulse * 4) * 2, 0, Math.PI * 2);
    ctx.fill();
    // Mid ring
    ctx.strokeStyle = `rgba(52, 211, 153, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();
    // Core
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a7f3d0";
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player — animated, with subtle bob
  drawPlayer(ctx, s);

  // Particles
  for (const p of s.particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  // Hit flash overlay
  if (s.hitFlash > 0) {
    ctx.fillStyle = `rgba(220, 38, 38, ${s.hitFlash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }

  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, W, 24);
  ctx.fillStyle = "#34d399";
  ctx.font = "bold 12px monospace";
  ctx.fillText(`🚩 Чекпоинтов ${s.score}`, 6, 16);
  ctx.fillStyle = "#fbbf24";
  ctx.fillText(`💡 Прожекторов ${s.spotlights.length}`, 180, 16);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`${s.timeElapsed.toFixed(1)}s`, W - 40, 16);
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState) {
  const e = 1 - Math.pow(1 - s.moveAnim, 3);
  const interpCol = s.prevPlayer.col + (s.player.col - s.prevPlayer.col) * e;
  const interpRow = s.prevPlayer.row + (s.player.row - s.prevPlayer.row) * e;
  const px = interpCol * CELL + CELL / 2;
  const py = interpRow * CELL + CELL / 2;
  const now = performance.now();
  const isInvisible = now < s.invisibleUntil;
  const invisRemaining = isInvisible ? (s.invisibleUntil - now) / 1000 : 0;
  // Fade alpha low when invisible, plus pulsing edge
  const playerAlpha = isInvisible ? 0.4 + Math.sin(now / 80) * 0.1 : 1.0;

  // Shadow
  ctx.fillStyle = `rgba(0, 0, 0, ${isInvisible ? 0.15 : 0.3})`;
  ctx.beginPath();
  ctx.ellipse(px, py + 8, 7, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Smoke aura when invisible
  if (isInvisible) {
    ctx.fillStyle = "rgba(168, 85, 247, 0.18)";
    for (let i = 0; i < 3; i++) {
      const r = 12 + i * 6;
      ctx.beginPath();
      ctx.arc(px + Math.sin(now / 200 + i) * 3, py + Math.cos(now / 200 + i) * 3, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = playerAlpha;
  // Body
  ctx.fillStyle = isInvisible ? "#a855f7" : "#22d3ee";
  ctx.fillRect(px - 6, py - 8, 12, 16);
  ctx.fillStyle = isInvisible ? "#581c87" : "#0e7490";
  ctx.fillRect(px - 6, py + 2, 12, 6);
  // Head
  ctx.fillStyle = "#f5e8d4";
  ctx.fillRect(px - 5, py - 11, 10, 6);
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(px - 3, py - 9, 1, 1);
  ctx.fillRect(px + 2, py - 9, 1, 1);
  ctx.globalAlpha = 1;

  if (s.moveAnim < 1 && !isInvisible) {
    ctx.strokeStyle = `rgba(103, 232, 249, ${1 - s.moveAnim})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, 14 * (1 - s.moveAnim) + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (isInvisible) {
    ctx.fillStyle = "#fef3c7";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`💨 ${invisRemaining.toFixed(1)}s`, px, py - 18);
    ctx.textAlign = "start";
  }
}
