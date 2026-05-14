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
  kind: "barrier" | "pipe" | "guard";
};

type DustParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
};

type ParallaxLayer = {
  speed: number;
  offset: number;
  blobs: Array<{ x: number; y: number; w: number; h: number; color: string }>;
};

type GameState = {
  player: {
    y: number;
    vy: number;
    onGround: boolean;
    ducking: boolean;
    alive: boolean;
    legPhase: number;
    deathTime: number;
  };
  worldSpeed: number;
  distance: number;
  obstacles: Obstacle[];
  spawnTimerMs: number;
  rng: () => number;
  dust: DustParticle[];
  parallax: ParallaxLayer[];
  speedLines: Array<{ x: number; y: number; len: number; speed: number }>;
  shake: { mag: number; life: number };
  animTime: number;
};

const GRAVITY = 1800;
const JUMP_VELOCITY = -650;

function newObstacle(s: GameState): Obstacle {
  const r = s.rng();
  let kind: Obstacle["kind"] = "barrier";
  if (s.distance > 300 && r < 0.25) kind = "guard";
  else if (s.distance > 100 && r < 0.5) kind = "pipe";
  if (kind === "pipe") return { x: W + 20, w: 64, h: 60, kind };
  if (kind === "guard") return { x: W + 20, w: 30, h: 56, kind };
  return { x: W + 20, w: 22, h: 38, kind: "barrier" };
}

function spawnDust(s: GameState, x: number, y: number, kind: "jump" | "land" | "slide") {
  const n = kind === "land" ? 14 : kind === "slide" ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const a = kind === "slide" ? Math.PI + (s.rng() - 0.5) * 0.6 : -Math.PI / 2 + (s.rng() - 0.5) * 1.6;
    const sp = kind === "land" ? 60 + s.rng() * 80 : 40 + s.rng() * 50;
    s.dust.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5 + s.rng() * 0.4,
      size: 2 + Math.floor(s.rng() * 2),
    });
  }
}

function makeParallax(rng: () => number): ParallaxLayer[] {
  const layers: ParallaxLayer[] = [
    { speed: 0.18, offset: 0, blobs: [] }, // far buildings
    { speed: 0.4, offset: 0, blobs: [] },  // mid wall
    { speed: 0.8, offset: 0, blobs: [] },  // close detail
  ];
  // Far buildings — silhouettes
  for (let i = 0; i < 12; i++) {
    layers[0].blobs.push({
      x: i * 80 + rng() * 30,
      y: 60 + rng() * 40,
      w: 50 + rng() * 30,
      h: 100 + rng() * 60,
      color: `rgba(${20 + Math.floor(rng() * 30)}, ${10 + Math.floor(rng() * 15)}, ${15 + Math.floor(rng() * 15)}, 1)`,
    });
  }
  // Mid wall — barred windows
  for (let i = 0; i < 16; i++) {
    layers[1].blobs.push({
      x: i * 60 + rng() * 20,
      y: 80 + rng() * 100,
      w: 30,
      h: 40,
      color: "rgba(58, 24, 32, 0.6)",
    });
  }
  // Close detail — light flickers
  for (let i = 0; i < 8; i++) {
    layers[2].blobs.push({
      x: i * 100 + rng() * 40,
      y: 100 + rng() * 80,
      w: 6,
      h: 16,
      color: "rgba(250, 204, 21, 0.4)",
    });
  }
  return layers;
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
        legPhase: 0,
        deathTime: 0,
      },
      worldSpeed: 260,
      distance: 0,
      obstacles: [],
      spawnTimerMs: 1400,
      rng,
      dust: [],
      parallax: makeParallax(rng),
      speedLines: [],
      shake: { mag: 0, life: 0 },
      animTime: 0,
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
      s.animTime += dt;
      if (s.shake.life > 0) {
        s.shake.life -= dt;
        if (s.shake.life <= 0) s.shake.mag = 0;
      }
      if (!s.player.alive) {
        // Delay submission slightly for death animation
        s.player.deathTime += dt;
        if (s.player.deathTime > 0.5) {
          end(Math.floor(s.distance), {
            milestones: [{ d: Math.floor(s.distance), t: Date.now() }],
            meta: { distance: s.distance },
          });
          return;
        }
      }

      // Speed + distance
      s.worldSpeed = 260 + Math.min(440, s.distance * 0.6);
      s.distance += (s.worldSpeed * dt) / 8;
      // Parallax scroll
      for (const layer of s.parallax) {
        layer.offset = (layer.offset + s.worldSpeed * dt * layer.speed) % 2000;
      }

      // Speed lines spawn at high speed
      if (s.worldSpeed > 400 && s.rng() < 0.4) {
        s.speedLines.push({
          x: W + 20,
          y: 20 + s.rng() * (GROUND_Y - 40),
          len: 30 + s.rng() * 30,
          speed: s.worldSpeed * 0.8,
        });
      }
      for (const sl of s.speedLines) sl.x -= sl.speed * dt;
      s.speedLines = s.speedLines.filter((sl) => sl.x > -60);

      // Dust
      for (const d of s.dust) {
        d.x += d.vx * dt - s.worldSpeed * dt * 0.7;
        d.y += d.vy * dt;
        d.vy += 280 * dt;
        d.life -= dt * 1.3;
      }
      s.dust = s.dust.filter((d) => d.life > 0);

      if (s.player.alive) {
        const keys = keysRef.current;
        const wantJump = keys.has(" ") || keys.has("ArrowUp") || keys.has("w") || keys.has("W");
        const wantDuck = keys.has("ArrowDown") || keys.has("s") || keys.has("S");
        if (wantJump && s.player.onGround && !s.player.ducking) {
          s.player.vy = JUMP_VELOCITY;
          s.player.onGround = false;
          spawnDust(s, PLAYER_X, GROUND_Y, "jump");
        }
        const wasDucking = s.player.ducking;
        s.player.ducking = wantDuck && s.player.onGround;
        if (s.player.ducking && !wasDucking) {
          spawnDust(s, PLAYER_X + 6, GROUND_Y, "slide");
        }

        if (!s.player.onGround) {
          s.player.vy += GRAVITY * dt;
          s.player.y += s.player.vy * dt;
          if (s.player.y >= GROUND_Y - PLAYER_H) {
            s.player.y = GROUND_Y - PLAYER_H;
            s.player.vy = 0;
            s.player.onGround = true;
            spawnDust(s, PLAYER_X, GROUND_Y, "land");
          }
        } else {
          s.player.y = GROUND_Y - (s.player.ducking ? PLAYER_DUCK_H : PLAYER_H);
          if (!s.player.ducking) s.player.legPhase += dt * 18;
        }

        s.spawnTimerMs -= dt * 1000;
        if (s.spawnTimerMs <= 0) {
          s.obstacles.push(newObstacle(s));
          s.spawnTimerMs = 700 + s.rng() * 800 - Math.min(400, s.distance * 0.6);
        }
        for (const o of s.obstacles) o.x -= s.worldSpeed * dt;
        s.obstacles = s.obstacles.filter((o) => o.x > -80);

        const phH = s.player.ducking ? PLAYER_DUCK_H : PLAYER_H;
        const px0 = PLAYER_X;
        const px1 = PLAYER_X + PLAYER_W;
        const py0 = s.player.y;
        const py1 = s.player.y + phH;
        for (const o of s.obstacles) {
          let oy0: number, oy1: number;
          if (o.kind === "pipe") {
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
            s.shake.mag = 10;
            s.shake.life = 0.4;
            // Death dust burst
            spawnDust(s, PLAYER_X, s.player.y, "land");
            spawnDust(s, PLAYER_X, s.player.y, "jump");
            break;
          }
        }
      } else {
        // Death fall
        s.player.vy += GRAVITY * dt;
        s.player.y += s.player.vy * dt;
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
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
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
            🏃 {Math.floor(stateRef.current.distance)} м
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

  let shakeX = 0;
  let shakeY = 0;
  if (s.shake.mag > 0 && s.shake.life > 0) {
    shakeX = (Math.random() - 0.5) * s.shake.mag;
    shakeY = (Math.random() - 0.5) * s.shake.mag;
  }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Sky gradient (night corridor)
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#0a0510");
  sky.addColorStop(0.7, "#1a0a14");
  sky.addColorStop(1, "#2a1014");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Parallax layers — back to front
  for (let i = 0; i < s.parallax.length; i++) {
    const layer = s.parallax[i];
    ctx.globalAlpha = i === 0 ? 0.8 : i === 1 ? 0.6 : 1;
    for (const b of layer.blobs) {
      const drawX = ((b.x - layer.offset) % 2000 + 2000) % 2000 - 200;
      // Layer-0 (far) = solid silhouettes
      if (i === 0) {
        ctx.fillStyle = b.color;
        ctx.fillRect(drawX, b.y, b.w, b.h);
        // Antenna
        ctx.fillRect(drawX + b.w / 2 - 1, b.y - 8, 2, 8);
      } else if (i === 1) {
        // Mid layer — barred windows
        ctx.fillStyle = b.color;
        ctx.fillRect(drawX, b.y, b.w, b.h);
        // Bars
        ctx.fillStyle = "rgba(255, 80, 40, 0.15)";
        for (let bi = 0; bi < 3; bi++) {
          ctx.fillRect(drawX + 6 + bi * 8, b.y + 4, 2, b.h - 8);
        }
      } else {
        // Close detail — flickering lights
        const flicker = 0.6 + Math.sin(s.animTime * 12 + b.x) * 0.4;
        ctx.fillStyle = `rgba(250, 204, 21, ${flicker * 0.5})`;
        ctx.fillRect(drawX, b.y, b.w, b.h);
        // Light glow
        ctx.fillStyle = `rgba(250, 204, 21, ${flicker * 0.15})`;
        ctx.beginPath();
        ctx.arc(drawX + b.w / 2, b.y + b.h / 2, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;

  // Speed lines — only at high speed
  for (const sl of s.speedLines) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(sl.x, sl.y, sl.len, 1);
  }

  // Ceiling pipes
  ctx.fillStyle = "#3a1820";
  ctx.fillRect(0, 0, W, 4);

  // Ground
  const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  groundGrad.addColorStop(0, "#1f2937");
  groundGrad.addColorStop(1, "#0a0508");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  // Ground edge highlight
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(W, GROUND_Y);
  ctx.stroke();
  // Ground tiles (moving)
  const tileOffset = (s.distance * 8) % 32;
  ctx.fillStyle = "rgba(16, 185, 129, 0.07)";
  for (let x = -tileOffset; x < W; x += 32) {
    ctx.fillRect(x, GROUND_Y + 8, 30, 2);
  }

  // Obstacles
  for (const o of s.obstacles) {
    if (o.kind === "pipe") {
      // Top-hanging pipe
      ctx.fillStyle = "#7c3aed";
      ctx.fillRect(o.x, 0, o.w, o.h);
      ctx.fillStyle = "#5b21b6";
      ctx.fillRect(o.x, o.h - 6, o.w, 6);
      // Drip
      const dripT = (s.animTime * 1.5 + o.x) % 1;
      ctx.fillStyle = "#a78bfa";
      ctx.fillRect(o.x + o.w / 2 - 1, o.h + dripT * 14, 2, 3);
    } else if (o.kind === "guard") {
      const oy = GROUND_Y - o.h;
      // Body
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(o.x, oy, o.w, o.h);
      // Belt
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(o.x, oy + o.h - 14, o.w, 14);
      // Head
      ctx.fillStyle = "#fde047";
      ctx.fillRect(o.x + 4, oy + 6, o.w - 8, 12);
      // Visor
      ctx.fillStyle = "#0a0508";
      ctx.fillRect(o.x + 6, oy + 12, o.w - 12, 3);
      // Baton (extends forward)
      ctx.fillStyle = "#525252";
      ctx.fillRect(o.x - 10, oy + 28, 14, 4);
    } else {
      const oy = GROUND_Y - o.h;
      // Chair stack
      ctx.fillStyle = "#9a3412";
      ctx.fillRect(o.x, oy, o.w, o.h);
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(o.x - 2, oy, o.w + 4, 6);
      ctx.fillStyle = "#451a03";
      ctx.fillRect(o.x + 2, oy + 6, o.w - 4, 2);
      ctx.fillRect(o.x + 2, oy + o.h - 8, o.w - 4, 2);
    }
  }

  // Dust particles
  for (const d of s.dust) {
    ctx.fillStyle = `rgba(180, 180, 180, ${Math.max(0, Math.min(1, d.life))})`;
    ctx.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
  }

  // Player
  drawPlayer(ctx, s);

  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, W, 26);
  ctx.fillStyle = "#34d399";
  ctx.font = "bold 13px monospace";
  ctx.fillText(`🏃 ${Math.floor(s.distance)} м`, 6, 17);
  // Speed meter
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(100, 10, 80, 6);
  const speedFrac = (s.worldSpeed - 260) / 440;
  const speedColor = speedFrac < 0.3 ? "#22c55e" : speedFrac < 0.7 ? "#fbbf24" : "#dc2626";
  ctx.fillStyle = speedColor;
  ctx.fillRect(100, 10, 80 * Math.min(1, speedFrac), 6);
  ctx.fillStyle = speedColor;
  ctx.font = "11px monospace";
  ctx.fillText(`${Math.floor(s.worldSpeed)} px/s`, 190, 17);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px monospace";
  ctx.fillText(`SPACE = прыжок · ↓ = подкат`, 300, 17);

  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState) {
  const phH = s.player.ducking ? PLAYER_DUCK_H : PLAYER_H;
  const px = PLAYER_X;
  const py = s.player.y;

  // Shadow (scales with height off ground)
  const heightOff = (GROUND_Y - PLAYER_H - py) / PLAYER_H; // 0 on ground, 1 at top of jump
  const shadowScale = Math.max(0.3, 1 - heightOff * 0.5);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(px + PLAYER_W / 2, GROUND_Y + 2, PLAYER_W / 2 * shadowScale + 3, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!s.player.alive) {
    // Death — slumped over
    ctx.save();
    ctx.translate(px + PLAYER_W / 2, py + phH / 2);
    ctx.rotate(s.player.deathTime * 2.5);
    ctx.fillStyle = "#10b981";
    ctx.fillRect(-PLAYER_W / 2, -phH / 2, PLAYER_W, phH);
    ctx.restore();
    return;
  }

  // Body
  ctx.fillStyle = "#10b981";
  ctx.fillRect(px, py, PLAYER_W, phH);
  // Boots band
  ctx.fillStyle = "#065f46";
  ctx.fillRect(px, py + phH - 12, PLAYER_W, 12);
  // Head
  if (!s.player.ducking) {
    ctx.fillStyle = "#f5e8d4";
    ctx.fillRect(px + 4, py + 4, PLAYER_W - 8, 14);
    // Eye (forward facing)
    ctx.fillStyle = "#0a0508";
    ctx.fillRect(px + PLAYER_W - 9, py + 10, 2, 2);
    // Bandana streak
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(px + 4, py + 6, PLAYER_W - 8, 2);
  } else {
    // Ducking head
    ctx.fillStyle = "#f5e8d4";
    ctx.fillRect(px + 4, py + 2, PLAYER_W - 8, 10);
  }
  // Legs — animated when on ground + running
  if (s.player.onGround && !s.player.ducking) {
    const legA = Math.sin(s.player.legPhase) * 6;
    const legB = Math.sin(s.player.legPhase + Math.PI) * 6;
    ctx.fillStyle = "#065f46";
    ctx.fillRect(px + 4, py + phH - 8 + legA, 6, 8);
    ctx.fillRect(px + PLAYER_W - 10, py + phH - 8 + legB, 6, 8);
  } else if (!s.player.onGround) {
    // Jumping pose — legs tucked
    ctx.fillStyle = "#065f46";
    ctx.fillRect(px + 6, py + phH - 4, PLAYER_W - 12, 6);
  } else if (s.player.ducking) {
    // Sliding — leg stretch forward
    ctx.fillStyle = "#065f46";
    ctx.fillRect(px + PLAYER_W - 4, py + phH - 6, 8, 4);
  }
  // Arms — running swing
  if (s.player.onGround && !s.player.ducking) {
    const armA = Math.sin(s.player.legPhase + Math.PI) * 4;
    ctx.fillStyle = "#10b981";
    ctx.fillRect(px + PLAYER_W - 2, py + 18 + armA, 4, 12);
  } else if (!s.player.onGround) {
    // Arms forward when jumping
    ctx.fillStyle = "#10b981";
    ctx.fillRect(px + PLAYER_W - 2, py + 14, 6, 10);
  }
}
