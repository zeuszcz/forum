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
const MOVE_COOLDOWN_MS = 120;
const SPRINT_MOVE_COOLDOWN_MS = 60;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 35;     // per second sprinting
const STAMINA_REGEN = 20;     // per second standing

type SpotlightKind = "rotating" | "sweep" | "blink" | "tracker";

type Spotlight = {
  kind: SpotlightKind;
  cx: number;
  cy: number;
  angle: number;
  rotSpeed: number;       // rad/s — used by rotating + sweep
  sweepRange: number;     // half-range for sweep
  baseAngle: number;      // sweep center
  radius: number;
  beamWidth: number;
  mountColor: string;
  blinkPhase: number;     // for blink kind: timer
  blinkOnFor: number;     // ms on
  blinkOffFor: number;    // ms off
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

type Wall = { col: number; row: number };

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

type Star = { x: number; y: number; alpha: number; twinkle: number };

type RingPulse = { x: number; y: number; r: number; life: number; color: string };

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

type FloatText = { x: number; y: number; text: string; life: number; color: string };

type GameState = {
  player: { col: number; row: number };
  prevPlayer: { col: number; row: number };
  moveAnim: number;
  score: number;
  alive: boolean;
  spotlights: Spotlight[];
  checkpoints: Checkpoint[];
  smokeBombs: SmokeBomb[];
  walls: Wall[];
  footSteps: FootStep[];
  dust: DustMote[];
  stars: Star[];
  ringPulses: RingPulse[];
  particles: Particle[];
  floats: FloatText[];
  lastInputAt: number;
  rng: () => number;
  timeElapsed: number;
  hitFlash: number;
  bgPulse: number;
  invisibleUntil: number;
  smokeReady: boolean;
  stamina: number;
  isSprinting: boolean;
};

function spawnCheckpoint(state: GameState) {
  for (let tries = 0; tries < 30; tries++) {
    const c = Math.floor(state.rng() * COLS);
    const r = Math.floor(state.rng() * ROWS);
    if (Math.abs(c - state.player.col) + Math.abs(r - state.player.row) > 6) {
      // Don't spawn on a wall
      if (state.walls.some((w) => w.col === c && w.row === r)) continue;
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
      if (state.walls.some((w) => w.col === c && w.row === r)) continue;
      state.smokeBombs.push({ col: c, row: r, bobPhase: 0 });
      return;
    }
  }
}

function spawnSpotlight(state: GameState) {
  const colors = ["#facc15", "#fb923c", "#f97316", "#fcd34d"];
  const r = state.rng();
  let kind: SpotlightKind;
  if (state.score < 5) kind = "rotating";
  else if (r < 0.4) kind = "rotating";
  else if (r < 0.7) kind = "sweep";
  else if (r < 0.9) kind = "blink";
  else kind = "tracker";
  const baseAng = state.rng() * Math.PI * 2;
  state.spotlights.push({
    kind,
    cx: state.rng() * W,
    cy: state.rng() * H,
    angle: baseAng,
    rotSpeed: (kind === "tracker" ? 1.2 : 1.4) * (state.rng() < 0.5 ? -1 : 1),
    sweepRange: 0.6 + state.rng() * 0.5,
    baseAngle: baseAng,
    radius: 110 + state.rng() * 60,
    beamWidth: 0.55 + state.rng() * 0.35,
    mountColor: colors[Math.floor(state.rng() * colors.length)],
    blinkPhase: state.rng() * 1500,
    blinkOnFor: 600 + state.rng() * 600,
    blinkOffFor: 400 + state.rng() * 600,
  });
}

function spawnWall(state: GameState) {
  for (let tries = 0; tries < 25; tries++) {
    const c = Math.floor(state.rng() * COLS);
    const r = Math.floor(state.rng() * ROWS);
    if (Math.abs(c - state.player.col) + Math.abs(r - state.player.row) > 3 &&
        !state.walls.some((w) => w.col === c && w.row === r)) {
      state.walls.push({ col: c, row: r });
      return;
    }
  }
}

function spawnHitParticles(s: GameState, x: number, y: number) {
  for (let i = 0; i < 16; i++) {
    const a = s.rng() * Math.PI * 2;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * (90 + s.rng() * 120),
      vy: Math.sin(a) * (90 + s.rng() * 120),
      life: 0.5 + s.rng() * 0.5,
      color: s.rng() < 0.6 ? "#facc15" : "#fff",
    });
  }
}

function spawnCollectParticles(s: GameState, x: number, y: number) {
  for (let i = 0; i < 18; i++) {
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

// Beam vs wall — line-segment intersection from spotlight center to player.
// If a wall cell sits on the segment between them and within the beam cone,
// the player is hidden behind cover.
function isBlockedByWall(walls: Wall[], px: number, py: number, sx: number, sy: number): boolean {
  for (const w of walls) {
    const wx = w.col * CELL + CELL / 2;
    const wy = w.row * CELL + CELL / 2;
    // Skip walls not roughly on the line
    const segDx = px - sx;
    const segDy = py - sy;
    const wDx = wx - sx;
    const wDy = wy - sy;
    const segLen2 = segDx * segDx + segDy * segDy;
    if (segLen2 === 0) continue;
    const t = (wDx * segDx + wDy * segDy) / segLen2;
    if (t < 0 || t > 1) continue;
    const closestX = sx + t * segDx;
    const closestY = sy + t * segDy;
    const dx = closestX - wx;
    const dy = closestY - wy;
    if (dx * dx + dy * dy < CELL * CELL * 0.3) {
      return true;
    }
  }
  return false;
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
  const heldRef = useRef<Set<string>>(new Set());
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
    const stars: Star[] = [];
    for (let i = 0; i < 50; i++) {
      stars.push({
        x: rng() * W,
        y: rng() * H * 0.45,
        alpha: 0.3 + rng() * 0.6,
        twinkle: rng() * Math.PI * 2,
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
      walls: [],
      footSteps: [],
      dust,
      stars,
      ringPulses: [],
      particles: [],
      floats: [],
      lastInputAt: 0,
      rng,
      timeElapsed: 0,
      hitFlash: 0,
      bgPulse: 0,
      invisibleUntil: 0,
      smokeReady: false,
      stamina: STAMINA_MAX,
      isSprinting: false,
    };
    // Initial layout — 2 spotlights, 1 checkpoint, 2 walls
    spawnSpotlight(st);
    spawnSpotlight(st);
    spawnCheckpoint(st);
    spawnWall(st);
    spawnWall(st);
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
      if (!s.alive) return; // we exit after submitting

      s.timeElapsed += dt;
      s.bgPulse += dt * 0.6;

      // Sprint stamina handling
      const wantSprint = heldRef.current.has("ShiftLeft") || heldRef.current.has("ShiftRight");
      s.isSprinting = wantSprint && s.stamina > 0;
      if (s.isSprinting) {
        s.stamina = Math.max(0, s.stamina - STAMINA_DRAIN * dt);
      } else {
        s.stamina = Math.min(STAMINA_MAX, s.stamina + STAMINA_REGEN * dt);
      }

      // Spotlight angles
      for (const sl of s.spotlights) {
        if (sl.kind === "rotating") {
          sl.angle += sl.rotSpeed * dt;
        } else if (sl.kind === "sweep") {
          // Sweep oscillates around baseAngle
          const oscRate = 1.5;
          sl.angle = sl.baseAngle + Math.sin(s.timeElapsed * oscRate) * sl.sweepRange;
        } else if (sl.kind === "blink") {
          sl.blinkPhase += dt * 1000;
          if (sl.blinkPhase > sl.blinkOnFor + sl.blinkOffFor) {
            sl.blinkPhase -= sl.blinkOnFor + sl.blinkOffFor;
          }
        } else if (sl.kind === "tracker") {
          // Slowly rotate to face the player
          const targetX = s.player.col * CELL + CELL / 2;
          const targetY = s.player.row * CELL + CELL / 2;
          const desired = Math.atan2(targetY - sl.cy, targetX - sl.cx);
          let delta = desired - sl.angle;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          sl.angle += Math.sign(delta) * Math.min(Math.abs(delta), 0.9 * dt);
        }
      }

      const isInvisible = now < s.invisibleUntil;
      // Beam hit detection
      const px = s.player.col * CELL + CELL / 2;
      const py = s.player.row * CELL + CELL / 2;
      if (!isInvisible) {
        for (const sl of s.spotlights) {
          if (sl.kind === "blink" && sl.blinkPhase >= sl.blinkOnFor) continue; // off
          const dx = px - sl.cx;
          const dy = py - sl.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > sl.radius) continue;
          const ang = Math.atan2(dy, dx);
          let delta = ang - sl.angle;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          if (Math.abs(delta) > sl.beamWidth / 2) continue;
          // Check walls
          if (isBlockedByWall(s.walls, px, py, sl.cx, sl.cy)) continue;
          // Caught!
          s.alive = false;
          s.hitFlash = 1;
          spawnHitParticles(s, px, py);
          break;
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
          s.floats.push({
            x: c.col * CELL + CELL / 2,
            y: c.row * CELL,
            text: "+1",
            color: "#34d399",
            life: 0.8,
          });
          if (s.score % 3 === 0) spawnSpotlight(s);
          if (s.score % 4 === 0 && s.smokeBombs.length < 2) spawnSmokeBomb(s);
          if (s.score % 5 === 0) spawnWall(s);
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

      // Animations
      if (s.moveAnim < 1) s.moveAnim = Math.min(1, s.moveAnim + dt * 14);
      if (s.hitFlash > 0) s.hitFlash = Math.max(0, s.hitFlash - dt * 1.2);
      for (const f of s.footSteps) f.life -= dt;
      s.footSteps = s.footSteps.filter((f) => f.life > 0);
      for (const r of s.ringPulses) {
        r.r += dt * 80;
        r.life -= dt * 1.4;
      }
      s.ringPulses = s.ringPulses.filter((r) => r.life > 0);
      for (const d of s.dust) {
        d.x += d.speed * dt;
        if (d.x > W + 6) {
          d.x = -6;
          d.y = s.rng() * H;
        }
      }
      for (const star of s.stars) {
        star.twinkle += dt * 2;
      }
      for (const p of s.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 240 * dt;
        p.life -= dt * 1.4;
      }
      s.particles = s.particles.filter((p) => p.life > 0);
      for (const f of s.floats) {
        f.y -= 38 * dt;
        f.life -= dt;
      }
      s.floats = s.floats.filter((f) => f.life > 0);

      draw(canvas, s);

      if (s.alive) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        end(s.score, {
          milestones: [{ t: Date.now(), score: s.score }],
          meta: { time: s.timeElapsed, spotlights: s.spotlights.length, walls: s.walls.length },
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
    const onDown = (e: KeyboardEvent) => {
      heldRef.current.add(e.code);
      heldRef.current.add(e.key);
      const s = stateRef.current;
      if (!s || !s.alive) return;
      const now = performance.now();
      const code = e.code;
      const k = e.key;
      // Smoke bomb on Space
      if ((code === "Space" || k === " ") && s.smokeReady) {
        s.smokeReady = false;
        s.invisibleUntil = now + 3000;
        for (let i = 0; i < 28; i++) {
          const ang = s.rng() * Math.PI * 2;
          s.particles.push({
            x: s.player.col * CELL + CELL / 2,
            y: s.player.row * CELL + CELL / 2,
            vx: Math.cos(ang) * (60 + s.rng() * 60),
            vy: Math.sin(ang) * (60 + s.rng() * 60),
            life: 0.9 + s.rng() * 0.4,
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
      const cooldown = s.isSprinting ? SPRINT_MOVE_COOLDOWN_MS : MOVE_COOLDOWN_MS;
      if (now - s.lastInputAt < cooldown) return;
      let moved = false;
      let targetCol = s.player.col;
      let targetRow = s.player.row;
      if (code === "KeyW" || k === "ArrowUp") {
        if (s.player.row > 0) targetRow -= 1;
      } else if (code === "KeyS" || k === "ArrowDown") {
        if (s.player.row < ROWS - 1) targetRow += 1;
      } else if (code === "KeyA" || k === "ArrowLeft") {
        if (s.player.col > 0) targetCol -= 1;
      } else if (code === "KeyD" || k === "ArrowRight") {
        if (s.player.col < COLS - 1) targetCol += 1;
      }
      if (targetCol !== s.player.col || targetRow !== s.player.row) {
        // Don't walk into a wall
        if (!s.walls.some((w) => w.col === targetCol && w.row === targetRow)) {
          s.prevPlayer = { ...s.player };
          s.player.col = targetCol;
          s.player.row = targetRow;
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
    const onUp = (e: KeyboardEvent) => {
      heldRef.current.delete(e.code);
      heldRef.current.delete(e.key);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
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
            {stateRef.current.isSprinting && (
              <div className="rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1.5 font-mono text-xs text-orange-300">
                🏃 SPRINT
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

  // Night sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0a0a18");
  sky.addColorStop(0.4, "#0a0510");
  sky.addColorStop(1, "#050505");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars
  for (const star of s.stars) {
    const tw = (Math.sin(star.twinkle) + 1) / 2;
    ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * tw})`;
    ctx.fillRect(star.x, star.y, 1, 1);
  }

  // Moon top-right
  const moonX = W - 50;
  const moonY = 40;
  const moonGlow = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, 32);
  moonGlow.addColorStop(0, "rgba(254, 240, 138, 0.5)");
  moonGlow.addColorStop(1, "rgba(254, 240, 138, 0)");
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fef3c7";
  ctx.beginPath();
  ctx.arc(moonX, moonY, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  ctx.arc(moonX - 2, moonY - 2, 9, 0, Math.PI * 2);
  ctx.fill();

  // Yard surface texture
  const yardGrad = ctx.createLinearGradient(0, 0, 0, H);
  yardGrad.addColorStop(0, "rgba(34, 211, 238, 0.02)");
  yardGrad.addColorStop(1, "rgba(34, 211, 238, 0.06)");
  ctx.fillStyle = yardGrad;
  ctx.fillRect(0, 0, W, H);

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

  // Walls — concrete blocks
  for (const w of s.walls) {
    drawWall(ctx, w.col * CELL, w.row * CELL);
  }

  // Foot steps
  for (const f of s.footSteps) {
    ctx.fillStyle = `rgba(34, 211, 238, ${f.life * 0.4})`;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Spotlight beams
  const nowMs = performance.now();
  for (const sl of s.spotlights) {
    const isOff = sl.kind === "blink" && sl.blinkPhase >= sl.blinkOnFor;
    if (!isOff) {
      ctx.save();
      ctx.translate(sl.cx, sl.cy);
      ctx.rotate(sl.angle);
      for (let layer = 0; layer < 3; layer++) {
        const widen = 1 + layer * 0.1;
        const alpha = 0.5 - layer * 0.15;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, sl.radius * widen);
        const beamColor = sl.kind === "tracker" ? "239, 68, 68" : "250,204,21";
        grad.addColorStop(0, `rgba(${beamColor},${alpha})`);
        grad.addColorStop(0.6, `rgba(${beamColor},${alpha * 0.4})`);
        grad.addColorStop(1, `rgba(${beamColor},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, sl.radius * widen, -sl.beamWidth * widen / 2, sl.beamWidth * widen / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    // Tower
    ctx.save();
    ctx.translate(sl.cx, sl.cy);
    // Outer ring
    ctx.strokeStyle = isOff ? "#444" : sl.mountColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    // Kind icon — different shapes
    if (sl.kind === "rotating") {
      ctx.fillStyle = sl.mountColor;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (sl.kind === "sweep") {
      ctx.fillStyle = sl.mountColor;
      ctx.fillRect(-4, -1, 8, 2);
    } else if (sl.kind === "blink") {
      ctx.fillStyle = isOff ? "#444" : "#dc2626";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // tracker — red eye
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0a0508";
      ctx.fillRect(-1, -1, 2, 2);
    }
    // Beam emitter direction
    ctx.rotate(sl.angle);
    ctx.fillStyle = isOff ? "#444" : "#fef3c7";
    ctx.fillRect(2, -1, 6, 2);
    ctx.restore();
  }

  // Ring pulses
  for (const r of s.ringPulses) {
    ctx.strokeStyle = `rgba(${r.color === "#10b981" ? "16, 185, 129" : "168, 85, 247"}, ${r.life * 0.7})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Smoke bombs on map
  for (const sb of s.smokeBombs) {
    sb.bobPhase += 0.05;
    const cx = sb.col * CELL + CELL / 2;
    const cy = sb.row * CELL + CELL / 2;
    const bob = Math.sin(sb.bobPhase) * 2;
    ctx.fillStyle = "rgba(168, 85, 247, 0.28)";
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#581c87";
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a855f7";
    ctx.beginPath();
    ctx.arc(cx - 2, cy + bob - 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fde047";
    ctx.fillRect(cx + 1, cy + bob - 8, 1, 4);
    const spark = (s.bgPulse * 8) % 1;
    if (spark < 0.5) {
      ctx.fillStyle = "#fef9c3";
      ctx.fillRect(cx + 1, cy + bob - 9, 1, 1);
    }
  }

  // Checkpoint
  for (const c of s.checkpoints) {
    if (c.collected) continue;
    const cx = c.col * CELL + CELL / 2;
    const cy = c.row * CELL + CELL / 2;
    const pulse = 0.7 + Math.sin(s.bgPulse * 4) * 0.3;
    ctx.fillStyle = `rgba(16, 185, 129, ${pulse * 0.3})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 16 + Math.sin(s.bgPulse * 4) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(52, 211, 153, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(52, 211, 153, ${pulse * 0.6})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a7f3d0";
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player
  drawPlayer(ctx, s, nowMs);

  // Particles
  for (const p of s.particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
  // Floats
  for (const f of s.floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";

  // Hit flash
  if (s.hitFlash > 0) {
    ctx.fillStyle = `rgba(220, 38, 38, ${s.hitFlash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }

  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, W, 32);
  ctx.fillStyle = "#34d399";
  ctx.font = "bold 12px monospace";
  ctx.fillText(`🚩 ${s.score}`, 6, 14);
  ctx.fillStyle = "#fbbf24";
  ctx.fillText(`💡 ${s.spotlights.length}`, 80, 14);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`⏱ ${s.timeElapsed.toFixed(1)}s`, 150, 14);
  // Stamina bar
  ctx.fillStyle = "#1a0a08";
  ctx.fillRect(6, 19, 100, 6);
  const stamFrac = s.stamina / STAMINA_MAX;
  ctx.fillStyle = stamFrac > 0.5 ? "#22c55e" : stamFrac > 0.2 ? "#fbbf24" : "#dc2626";
  ctx.fillRect(6, 19, 100 * stamFrac, 6);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "9px monospace";
  ctx.fillText(`SHIFT = спринт · SPACE = дым`, 120, 25);
  if (nowMs < s.invisibleUntil) {
    const remain = ((s.invisibleUntil - nowMs) / 1000).toFixed(1);
    ctx.fillStyle = "#a855f7";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`💨 ${remain}s`, W - 60, 24);
  }
}

function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Concrete block with hatch
  ctx.fillStyle = "#3f3f46";
  ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
  ctx.fillStyle = "#52525b";
  ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
  // Brick stripes
  ctx.fillStyle = "#27272a";
  ctx.fillRect(x + 1, y + CELL / 2 - 1, CELL - 2, 1);
  ctx.fillRect(x + CELL / 2 - 1, y + 1, 1, CELL / 2 - 1);
  ctx.fillRect(x + CELL / 4 - 1, y + CELL / 2, 1, CELL / 2 - 2);
  ctx.fillRect(x + (3 * CELL) / 4 - 1, y + CELL / 2, 1, CELL / 2 - 2);
  ctx.strokeStyle = "#18181b";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState, now: number) {
  const e = 1 - Math.pow(1 - s.moveAnim, 3);
  const interpCol = s.prevPlayer.col + (s.player.col - s.prevPlayer.col) * e;
  const interpRow = s.prevPlayer.row + (s.player.row - s.prevPlayer.row) * e;
  const px = interpCol * CELL + CELL / 2;
  const py = interpRow * CELL + CELL / 2;
  const isInvisible = now < s.invisibleUntil;
  const invisRemaining = isInvisible ? (s.invisibleUntil - now) / 1000 : 0;
  const playerAlpha = isInvisible ? 0.35 + Math.sin(now / 80) * 0.1 : 1.0;

  // Shadow
  ctx.fillStyle = `rgba(0, 0, 0, ${isInvisible ? 0.15 : 0.35})`;
  ctx.beginPath();
  ctx.ellipse(px, py + 8, 7, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Smoke aura
  if (isInvisible) {
    ctx.fillStyle = "rgba(168, 85, 247, 0.18)";
    for (let i = 0; i < 3; i++) {
      const r = 12 + i * 6;
      ctx.beginPath();
      ctx.arc(px + Math.sin(now / 200 + i) * 3, py + Math.cos(now / 200 + i) * 3, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sprint speed trails
  if (s.isSprinting && s.moveAnim < 1) {
    for (let i = 0; i < 2; i++) {
      const t = i / 2;
      const tx = s.prevPlayer.col * CELL + CELL / 2 + (s.player.col - s.prevPlayer.col) * CELL * t * e;
      const ty = s.prevPlayer.row * CELL + CELL / 2 + (s.player.row - s.prevPlayer.row) * CELL * t * e;
      ctx.fillStyle = `rgba(251, 146, 60, ${(1 - t) * 0.3})`;
      ctx.fillRect(tx - 4, ty - 6, 8, 12);
    }
  }

  ctx.globalAlpha = playerAlpha;
  // Body
  ctx.fillStyle = isInvisible ? "#a855f7" : s.isSprinting ? "#fb923c" : "#22d3ee";
  ctx.fillRect(px - 6, py - 8, 12, 16);
  ctx.fillStyle = isInvisible ? "#581c87" : s.isSprinting ? "#9a3412" : "#0e7490";
  ctx.fillRect(px - 6, py + 2, 12, 6);
  // Head
  ctx.fillStyle = "#f5e8d4";
  ctx.fillRect(px - 5, py - 11, 10, 6);
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(px - 3, py - 9, 1, 1);
  ctx.fillRect(px + 2, py - 9, 1, 1);
  // Beanie/cap
  ctx.fillStyle = isInvisible ? "#7e22ce" : "#1a0a08";
  ctx.fillRect(px - 5, py - 12, 10, 2);
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
