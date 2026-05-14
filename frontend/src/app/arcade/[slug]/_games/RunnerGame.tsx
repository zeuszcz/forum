"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState } from "react";

import { mulberry32, useArcadeRun } from "../../_components/useArcadeRun";

import { GameShell } from "./GameShell";

const W = 720;
const H = 320;
const GROUND_Y = 280;
const PLAYER_X = 90;
const PLAYER_W = 30;
const PLAYER_H = 64;
const PLAYER_DUCK_H = 32;

type Obstacle = {
  x: number;
  w: number;
  h: number;
  kind: "barrier" | "pipe" | "guard" | "saw" | "drone" | "laser";
  phase: number;     // for sawblade rotation, drone bob, laser blink
  yOffset: number;   // for drones (variable height)
};

type Pickup = {
  x: number;
  y: number;
  kind: "coin" | "shield" | "boost" | "double_jump";
  collected: boolean;
  bobPhase: number;
};

type Cloud = {
  x: number;
  y: number;
  w: number;
  speed: number;
};

type RainDrop = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
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

type FloatText = { x: number; y: number; text: string; color: string; life: number };

type Lightning = {
  x: number;
  segments: Array<{ x: number; y: number }>;
  life: number;
};

type GameState = {
  player: {
    y: number;
    vy: number;
    onGround: boolean;
    ducking: boolean;
    alive: boolean;
    legPhase: number;
    armPhase: number;
    deathTime: number;
    hasShield: boolean;
    shieldFlash: number;
    boostUntil: number;
    doubleJumpsLeft: number;
    usedDoubleThisAir: boolean;
    pitch: number;             // visual pitch (lean forward when fast)
  };
  worldSpeed: number;
  distance: number;
  obstacles: Obstacle[];
  pickups: Pickup[];
  pickupSpawnTimerMs: number;
  coinCount: number;
  spawnTimerMs: number;
  rng: () => number;
  dust: DustParticle[];
  parallax: ParallaxLayer[];
  speedLines: Array<{ x: number; y: number; len: number; speed: number }>;
  shake: { mag: number; life: number };
  animTime: number;
  floats: FloatText[];
  lightnings: Lightning[];
  nextLightningAt: number;
  bgFlash: number;
  // Atmosphere
  clouds: Cloud[];
  raindrops: RainDrop[];
  // Near-miss combo
  closeCallStreak: number;
  closeCallExpireAt: number;
  closeCallFlash: number;
  // Pending obstacles to detect close-call (tracked on x-cross)
  alreadyPassed: Set<number>;
};

const GRAVITY = 1800;
const JUMP_VELOCITY = -650;

function newObstacle(s: GameState): Obstacle {
  const r = s.rng();
  let kind: Obstacle["kind"] = "barrier";
  // Late-game obstacles unlock with distance
  if (s.distance > 1500 && r < 0.10) kind = "laser";
  else if (s.distance > 800 && r < 0.20) kind = "saw";
  else if (s.distance > 500 && r < 0.25) kind = "drone";
  else if (s.distance > 300 && r < 0.45) kind = "guard";
  else if (s.distance > 100 && r < 0.60) kind = "pipe";
  if (kind === "pipe") return { x: W + 20, w: 64, h: 60, kind, phase: 0, yOffset: 0 };
  if (kind === "guard") return { x: W + 20, w: 30, h: 56, kind, phase: 0, yOffset: 0 };
  if (kind === "saw") return { x: W + 20, w: 36, h: 36, kind, phase: 0, yOffset: 0 };
  if (kind === "drone") {
    // Drone flies at height where you need to duck OR jump
    const lowAlt = s.rng() < 0.5;
    return { x: W + 20, w: 30, h: 22, kind, phase: 0, yOffset: lowAlt ? GROUND_Y - 56 : GROUND_Y - 96 };
  }
  if (kind === "laser") {
    // Vertical full-height beam with blink — blink-off provides safe window
    return { x: W + 20, w: 8, h: GROUND_Y, kind, phase: s.rng() * 2000, yOffset: 0 };
  }
  return { x: W + 20, w: 22, h: 38, kind: "barrier", phase: 0, yOffset: 0 };
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
    const clouds: Cloud[] = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: rng() * W,
        y: 40 + rng() * 60,
        w: 60 + rng() * 50,
        speed: 8 + rng() * 6,
      });
    }
    const st: GameState = {
      player: {
        y: GROUND_Y - PLAYER_H,
        vy: 0,
        onGround: true,
        ducking: false,
        alive: true,
        legPhase: 0,
        armPhase: Math.PI,
        deathTime: 0,
        hasShield: false,
        shieldFlash: 0,
        boostUntil: 0,
        doubleJumpsLeft: 0,
        usedDoubleThisAir: false,
        pitch: 0,
      },
      worldSpeed: 260,
      distance: 0,
      obstacles: [],
      pickups: [],
      pickupSpawnTimerMs: 2200,
      coinCount: 0,
      spawnTimerMs: 1400,
      rng,
      dust: [],
      parallax: makeParallax(rng),
      speedLines: [],
      shake: { mag: 0, life: 0 },
      animTime: 0,
      floats: [],
      lightnings: [],
      nextLightningAt: 0,
      bgFlash: 0,
      clouds,
      raindrops: [],
      closeCallStreak: 0,
      closeCallExpireAt: 0,
      closeCallFlash: 0,
      alreadyPassed: new Set(),
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

      // Speed + distance — boost multiplier when active
      const isBoosting = now < s.player.boostUntil;
      const baseSpeed = 260 + Math.min(440, s.distance * 0.6);
      s.worldSpeed = isBoosting ? baseSpeed * 1.5 : baseSpeed;
      s.distance += (s.worldSpeed * dt) / 8;
      if (s.player.shieldFlash > 0) {
        s.player.shieldFlash = Math.max(0, s.player.shieldFlash - dt * 1.4);
      }
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
      // Floats
      for (const f of s.floats) {
        f.y -= 45 * dt;
        f.x -= s.worldSpeed * dt;
        f.life -= dt;
      }
      s.floats = s.floats.filter((f) => f.life > 0);
      // Cloud drift
      for (const cl of s.clouds) {
        cl.x -= (cl.speed + s.worldSpeed * 0.05) * dt;
        if (cl.x + cl.w < -10) {
          cl.x = W + 10;
          cl.y = 40 + s.rng() * 60;
          cl.w = 60 + s.rng() * 50;
        }
      }
      // Rain starts at distance > 1000
      if (s.distance > 1000) {
        const stormI = Math.min(1, (s.distance - 1000) / 500);
        // Spawn drops
        const target = Math.floor(stormI * 80);
        while (s.raindrops.length < target) {
          s.raindrops.push({
            x: s.rng() * (W + 100) - 50,
            y: -10 - s.rng() * H,
            vx: -60 - s.rng() * 40,
            vy: 600 + s.rng() * 200,
            len: 10 + s.rng() * 10,
          });
        }
        for (const d of s.raindrops) {
          d.x += d.vx * dt - s.worldSpeed * dt * 0.4;
          d.y += d.vy * dt;
          if (d.y > GROUND_Y + 5) {
            d.y = -10;
            d.x = s.rng() * (W + 100);
          }
        }
      }
      // Lightning storm at extreme distance
      if (s.distance > 1500) {
        if (now > s.nextLightningAt) {
          // 1-bolt every 2-5 seconds
          s.nextLightningAt = now + 2000 + s.rng() * 3000;
          const x0 = s.rng() * W;
          const segs: Array<{ x: number; y: number }> = [];
          let cy = 0;
          let cx = x0;
          while (cy < GROUND_Y) {
            segs.push({ x: cx, y: cy });
            cy += 14 + s.rng() * 12;
            cx += (s.rng() - 0.5) * 30;
          }
          s.lightnings.push({ x: x0, segments: segs, life: 0.45 });
          s.bgFlash = 0.6;
          s.shake.mag = Math.max(s.shake.mag, 6);
          s.shake.life = 0.25;
        }
      }
      for (const lg of s.lightnings) lg.life -= dt * 2;
      s.lightnings = s.lightnings.filter((lg) => lg.life > 0);
      if (s.bgFlash > 0) s.bgFlash = Math.max(0, s.bgFlash - dt * 2.5);

      if (s.player.alive) {
        const keys = keysRef.current;
        const wantJump = keys.has(" ") || keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW");
        const wantDuck = keys.has("ArrowDown") || keys.has("KeyS");
        // Edge-detect jump (consume key while held = only first press triggers)
        if (wantJump && !s.player.ducking) {
          if (s.player.onGround) {
            s.player.vy = JUMP_VELOCITY;
            s.player.onGround = false;
            s.player.usedDoubleThisAir = false;
            spawnDust(s, PLAYER_X, GROUND_Y, "jump");
            keys.delete(" ");
            keys.delete("Space");
            keys.delete("ArrowUp");
            keys.delete("KeyW");
          } else if (s.player.doubleJumpsLeft > 0 && !s.player.usedDoubleThisAir) {
            // Air double-jump
            s.player.vy = JUMP_VELOCITY * 0.9;
            s.player.doubleJumpsLeft -= 1;
            s.player.usedDoubleThisAir = true;
            // Burst effect
            for (let i = 0; i < 12; i++) {
              const a = Math.PI + (s.rng() - 0.5) * 1.2;
              s.dust.push({
                x: PLAYER_X + PLAYER_W / 2,
                y: s.player.y + PLAYER_H,
                vx: Math.cos(a) * 110,
                vy: -Math.abs(Math.sin(a) * 80),
                life: 0.5,
                size: 3,
              });
            }
            s.shake.mag = Math.max(s.shake.mag, 3);
            s.shake.life = 0.18;
            keys.delete(" ");
            keys.delete("Space");
            keys.delete("ArrowUp");
            keys.delete("KeyW");
          }
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
            s.player.usedDoubleThisAir = false;
            spawnDust(s, PLAYER_X, GROUND_Y, "land");
          }
        } else {
          s.player.y = GROUND_Y - (s.player.ducking ? PLAYER_DUCK_H : PLAYER_H);
          if (!s.player.ducking) {
            s.player.legPhase += dt * 18;
            s.player.armPhase += dt * 18;
          }
        }
        // Pitch — lean forward at high speed
        const targetPitch = Math.min(0.18, (s.worldSpeed - 260) / 1500);
        s.player.pitch += (targetPitch - s.player.pitch) * Math.min(1, dt * 4);

        s.spawnTimerMs -= dt * 1000;
        if (s.spawnTimerMs <= 0) {
          s.obstacles.push(newObstacle(s));
          s.spawnTimerMs = 700 + s.rng() * 800 - Math.min(400, s.distance * 0.6);
        }
        for (const o of s.obstacles) {
          const prevX = o.x;
          o.x -= s.worldSpeed * dt;
          o.phase += dt;
          // Close-call detection: obstacle right edge just crossed player left
          if (prevX + o.w > PLAYER_X && o.x + o.w <= PLAYER_X) {
            // Check if it was a near miss (we didn't take damage)
            const oid = Math.round(prevX * 17 + o.w);
            if (!s.alreadyPassed.has(oid)) {
              s.alreadyPassed.add(oid);
              s.closeCallStreak += 1;
              s.closeCallExpireAt = now + 3500;
              s.closeCallFlash = 1.0;
              const bonus = Math.min(50, s.closeCallStreak * 5);
              s.distance += bonus;
              s.floats.push({
                x: PLAYER_X + 30,
                y: s.player.y - 10,
                text: `СТРИК ×${s.closeCallStreak} +${bonus}`,
                color: "#fde047",
                life: 0.9,
              });
            }
          }
        }
        s.obstacles = s.obstacles.filter((o) => o.x > -80);
        // Close-call streak decay
        if (s.closeCallStreak > 0 && now > s.closeCallExpireAt) {
          s.closeCallStreak = 0;
        }
        if (s.closeCallFlash > 0) s.closeCallFlash = Math.max(0, s.closeCallFlash - dt * 1.4);

        // Pickup spawning
        s.pickupSpawnTimerMs -= dt * 1000;
        if (s.pickupSpawnTimerMs <= 0) {
          const r = s.rng();
          let kind: Pickup["kind"];
          let y: number;
          if (r < 0.6) {
            kind = "coin";
            y = s.rng() < 0.6 ? GROUND_Y - 80 - s.rng() * 50 : GROUND_Y - 14;
          } else if (r < 0.78) {
            kind = "shield";
            y = GROUND_Y - 60;
          } else if (r < 0.9) {
            kind = "boost";
            y = GROUND_Y - 90;
          } else {
            kind = "double_jump";
            y = GROUND_Y - 110;
          }
          s.pickups.push({ x: W + 30, y, kind, collected: false, bobPhase: 0 });
          s.pickupSpawnTimerMs = 1500 + s.rng() * 2000;
        }
        const isBoosting = now < s.player.boostUntil;
        for (const p of s.pickups) {
          p.x -= s.worldSpeed * dt;
          p.bobPhase += dt * 3;
          // Coin magnet during boost — accelerate coins toward player
          if (isBoosting && p.kind === "coin" && !p.collected) {
            const dx = PLAYER_X + PLAYER_W / 2 - p.x;
            const dy = (s.player.y + (s.player.ducking ? PLAYER_DUCK_H : PLAYER_H) / 2) - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 220 && dist > 1) {
              const pull = 380;
              p.x += (dx / dist) * pull * dt;
              p.y += (dy / dist) * pull * dt;
            }
          }
        }
        s.pickups = s.pickups.filter((p) => p.x > -40 && !p.collected);

        // Pickup collision (uses simple AABB vs player body)
        const phH = s.player.ducking ? PLAYER_DUCK_H : PLAYER_H;
        const px0 = PLAYER_X;
        const px1 = PLAYER_X + PLAYER_W;
        const py0 = s.player.y;
        const py1 = s.player.y + phH;
        for (const p of s.pickups) {
          if (p.collected) continue;
          const bob = Math.sin(p.bobPhase) * 4;
          const pky0 = p.y - 10 + bob;
          const pky1 = p.y + 10 + bob;
          if (px1 > p.x - 10 && px0 < p.x + 10 && py1 > pky0 && py0 < pky1) {
            p.collected = true;
            if (p.kind === "coin") {
              s.coinCount += 1;
              s.distance += 10;
              s.floats.push({ x: p.x, y: p.y, text: "+10м", color: "#fbbf24", life: 0.8 });
              for (let i = 0; i < 8; i++) {
                const a = s.rng() * Math.PI * 2;
                s.dust.push({
                  x: p.x,
                  y: p.y,
                  vx: Math.cos(a) * 60,
                  vy: Math.sin(a) * 60,
                  life: 0.4,
                  size: 2,
                });
              }
            } else if (p.kind === "shield") {
              s.player.hasShield = true;
              s.floats.push({ x: p.x, y: p.y, text: "🛡 ЩИТ", color: "#22d3ee", life: 1.0 });
            } else if (p.kind === "boost") {
              s.player.boostUntil = now + 3000;
              s.floats.push({ x: p.x, y: p.y, text: "🔥 БУСТ", color: "#fb923c", life: 1.0 });
              s.shake.mag = 3;
              s.shake.life = 0.2;
            } else {
              // Double jump — adds 3 charges
              s.player.doubleJumpsLeft = Math.min(5, s.player.doubleJumpsLeft + 3);
              s.floats.push({ x: p.x, y: p.y, text: "✦ ДВ.ПРЫЖОК", color: "#a855f7", life: 1.0 });
              for (let i = 0; i < 16; i++) {
                const a = s.rng() * Math.PI * 2;
                s.dust.push({
                  x: p.x,
                  y: p.y,
                  vx: Math.cos(a) * 90,
                  vy: Math.sin(a) * 90 - 30,
                  life: 0.6,
                  size: 2,
                });
              }
            }
          }
        }

        // Obstacle collision (with shield invulnerability)
        const phH2 = s.player.ducking ? PLAYER_DUCK_H : PLAYER_H;
        const ox0p = PLAYER_X;
        const ox1p = PLAYER_X + PLAYER_W;
        const opy0 = s.player.y;
        const opy1 = s.player.y + phH2;
        for (const o of s.obstacles) {
          let oy0: number, oy1: number;
          let activeHit = true;
          if (o.kind === "pipe") {
            oy0 = 0;
            oy1 = o.h;
          } else if (o.kind === "drone") {
            oy0 = o.yOffset;
            oy1 = o.yOffset + o.h;
          } else if (o.kind === "laser") {
            // Blink: on for 700ms, off for 600ms
            const cycle = (o.phase * 1000) % 1300;
            activeHit = cycle < 700;
            oy0 = 0;
            oy1 = o.h;
          } else {
            oy0 = GROUND_Y - o.h;
            oy1 = GROUND_Y;
          }
          if (!activeHit) continue;
          const ox0 = o.x;
          const ox1 = o.x + o.w;
          if (ox1p > ox0 && ox0p < ox1 && opy1 > oy0 && opy0 < oy1) {
            if (s.player.hasShield) {
              s.player.hasShield = false;
              s.player.shieldFlash = 1.0;
              o.x = -200; // remove the obstacle that hit us so we don't loop-hit
              s.shake.mag = 6;
              s.shake.life = 0.25;
              spawnDust(s, PLAYER_X, GROUND_Y, "land");
              s.floats.push({ x: PLAYER_X + 20, y: s.player.y - 8, text: "ЩИТ!", color: "#22d3ee", life: 0.8 });
              break;
            }
            s.player.alive = false;
            s.shake.mag = 10;
            s.shake.life = 0.4;
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
      // Track both code (layout-independent) and key (arrows)
      keysRef.current.add(e.code);
      keysRef.current.add(e.key);
      if (["ArrowUp", "ArrowDown", " ", "Space"].includes(e.key)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
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
          <div className="flex items-center gap-2">
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-sm text-emerald-200">
              🏃 {Math.floor(stateRef.current.distance)}м
            </div>
            {stateRef.current.coinCount > 0 && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2 py-1.5 font-mono text-xs text-yellow-300">
                🪙{stateRef.current.coinCount}
              </div>
            )}
            {stateRef.current.player.hasShield && (
              <div className="rounded-md border border-cyan/40 bg-cyan/10 px-2 py-1.5 font-mono text-xs text-cyan">
                🛡
              </div>
            )}
            {stateRef.current.player.doubleJumpsLeft > 0 && (
              <div className="rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-1.5 font-mono text-xs text-purple-300">
                ✦×{stateRef.current.player.doubleJumpsLeft}
              </div>
            )}
            {stateRef.current.closeCallStreak >= 2 && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2 py-1.5 font-mono text-xs text-yellow-300 animate-pulse">
                СТРИК ×{stateRef.current.closeCallStreak}
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

  let shakeX = 0;
  let shakeY = 0;
  if (s.shake.mag > 0 && s.shake.life > 0) {
    shakeX = (Math.random() - 0.5) * s.shake.mag;
    shakeY = (Math.random() - 0.5) * s.shake.mag;
  }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Day/night cycle blends with distance:
  //   < 500m  = early evening (warm-ish)
  //   < 1500m = late night (deep purple)
  //   > 1500m = storm (near-black with green hints)
  // 3-stop palette interpolation (single-pass to keep hex format).
  const dist = s.distance;
  const phase = Math.min(1, dist / 1500);
  const stormPhase = Math.max(0, Math.min(1, (dist - 1500) / 600));
  // Day → night colors for each stop
  const dayTop = "#1a0d1a";   const nightTop = "#050505";   const stormTop = "#0a0d05";
  const dayMid = "#2a1218";   const nightMid = "#0a0510";   const stormMid = "#0a1408";
  const dayBot = "#3a1820";   const nightBot = "#1a0a14";   const stormBot = "#0a1808";
  // Two-stage blend: day→night by phase, then night→storm by stormPhase
  const topColor = blendColor(blendColorHex(dayTop, nightTop, phase), stormTop, stormPhase);
  const midColor = blendColor(blendColorHex(dayMid, nightMid, phase), stormMid, stormPhase);
  const botColor = blendColor(blendColorHex(dayBot, nightBot, phase), stormBot, stormPhase);
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, topColor);
  sky.addColorStop(0.7, midColor);
  sky.addColorStop(1, botColor);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Moon
  if (phase > 0.2) {
    const moonAlpha = Math.min(1, (phase - 0.2) / 0.4) * (1 - stormPhase);
    const moonX = W - 80;
    const moonY = 50;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, 40);
    moonGlow.addColorStop(0, `rgba(254, 240, 138, ${moonAlpha * 0.6})`);
    moonGlow.addColorStop(1, "rgba(254, 240, 138, 0)");
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = moonAlpha;
    ctx.fillStyle = "#fef3c7";
    ctx.beginPath();
    ctx.arc(moonX, moonY, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.arc(moonX - 2, moonY - 3, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Stars fade in mid-night
  if (phase > 0.3) {
    const starAlpha = Math.min(1, (phase - 0.3) / 0.5) * (1 - stormPhase);
    for (let i = 0; i < 40; i++) {
      const x = (i * 73 + (s.animTime * 8) % W) % W;
      const y = (i * 41) % (GROUND_Y * 0.4);
      const tw = (Math.sin(s.animTime * 3 + i) + 1) / 2;
      ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha * (0.3 + tw * 0.5)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Clouds — drift across mid-sky
  for (const cl of s.clouds) {
    const cloudAlpha = 0.18 * (1 - stormPhase * 0.5);
    ctx.fillStyle = `rgba(255, 255, 255, ${cloudAlpha})`;
    ctx.beginPath();
    ctx.arc(cl.x, cl.y, cl.w / 3, 0, Math.PI * 2);
    ctx.arc(cl.x + cl.w / 3, cl.y + 4, cl.w / 4, 0, Math.PI * 2);
    ctx.arc(cl.x + cl.w / 2, cl.y, cl.w / 3.5, 0, Math.PI * 2);
    ctx.arc(cl.x + cl.w * 0.7, cl.y + 6, cl.w / 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // BG flash from lightning
  if (s.bgFlash > 0) {
    ctx.fillStyle = `rgba(167, 243, 208, ${s.bgFlash * 0.18})`;
    ctx.fillRect(0, 0, W, GROUND_Y);
  }
  // Lightning bolts
  for (const lg of s.lightnings) {
    ctx.strokeStyle = `rgba(167, 243, 208, ${lg.life * 1.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (lg.segments.length > 0) {
      ctx.moveTo(lg.segments[0].x, lg.segments[0].y);
      for (let i = 1; i < lg.segments.length; i++) {
        ctx.lineTo(lg.segments[i].x, lg.segments[i].y);
      }
    }
    ctx.stroke();
    // Inner core
    ctx.strokeStyle = `rgba(255, 255, 255, ${lg.life * 1.2})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

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

  // Rain
  if (s.raindrops.length > 0) {
    ctx.strokeStyle = "rgba(167, 243, 208, 0.45)";
    ctx.lineWidth = 1;
    for (const d of s.raindrops) {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.vx * 0.02, d.y + d.len);
      ctx.stroke();
    }
  }

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
      ctx.fillStyle = "#7c3aed";
      ctx.fillRect(o.x, 0, o.w, o.h);
      ctx.fillStyle = "#5b21b6";
      ctx.fillRect(o.x, o.h - 6, o.w, 6);
      const dripT = (s.animTime * 1.5 + o.x) % 1;
      ctx.fillStyle = "#a78bfa";
      ctx.fillRect(o.x + o.w / 2 - 1, o.h + dripT * 14, 2, 3);
    } else if (o.kind === "guard") {
      const oy = GROUND_Y - o.h;
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(o.x, oy, o.w, o.h);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(o.x, oy + o.h - 14, o.w, 14);
      ctx.fillStyle = "#fde047";
      ctx.fillRect(o.x + 4, oy + 6, o.w - 8, 12);
      ctx.fillStyle = "#0a0508";
      ctx.fillRect(o.x + 6, oy + 12, o.w - 12, 3);
      ctx.fillStyle = "#525252";
      ctx.fillRect(o.x - 10, oy + 28, 14, 4);
    } else if (o.kind === "saw") {
      // Spinning sawblade on a small stand
      const oy = GROUND_Y - o.h;
      ctx.fillStyle = "#525252";
      ctx.fillRect(o.x + o.w / 2 - 4, oy + o.h - 6, 8, 6);
      // Blade (rotating star/disc)
      ctx.save();
      ctx.translate(o.x + o.w / 2, oy + o.h / 2 - 2);
      ctx.rotate(o.phase * 18);
      ctx.fillStyle = "#a3a3a3";
      ctx.beginPath();
      ctx.arc(0, 0, o.w / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#52525b";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      // Teeth
      ctx.fillStyle = "#e5e7eb";
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI * 2) / 8;
        const tx = Math.cos(ang) * (o.w / 2 - 1);
        const ty = Math.sin(ang) * (o.w / 2 - 1);
        ctx.fillRect(tx - 2, ty - 2, 4, 4);
      }
      // Red center
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
      // Sparks trail
      if (Math.random() < 0.3) {
        const sx = o.x + o.w / 2 + (Math.random() - 0.5) * 14;
        const sy = oy + o.h + 4;
        ctx.fillStyle = "#fde047";
        ctx.fillRect(sx, sy, 2, 2);
      }
    } else if (o.kind === "drone") {
      const dy = o.yOffset + Math.sin(o.phase * 3) * 4;
      // Body
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(o.x, dy, o.w, o.h);
      ctx.fillStyle = "#374151";
      ctx.fillRect(o.x + 2, dy + 2, o.w - 4, o.h - 4);
      // Red scanning eye
      const eyePulse = (Math.sin(o.phase * 8) + 1) / 2;
      ctx.fillStyle = `rgba(220, 38, 38, ${0.6 + eyePulse * 0.4})`;
      ctx.fillRect(o.x + o.w / 2 - 3, dy + 6, 6, 4);
      // Propellers
      ctx.fillStyle = "rgba(156, 163, 175, 0.5)";
      const propW = 12;
      const propSpin = (o.phase * 30) % (Math.PI * 2);
      const ph = 2 + Math.abs(Math.sin(propSpin)) * 6;
      ctx.fillRect(o.x - propW / 2 + 4, dy - 4, propW, ph);
      ctx.fillRect(o.x + o.w - propW / 2 - 4, dy - 4, propW, ph);
      // Hover shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(o.x + o.w / 2, GROUND_Y - 1, o.w / 2, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === "laser") {
      const cycle = (o.phase * 1000) % 1300;
      const onPhase = cycle < 700;
      if (onPhase) {
        const intensity = cycle < 100 ? cycle / 100 : cycle > 600 ? (700 - cycle) / 100 : 1;
        // Beam
        const grad = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
        grad.addColorStop(0, `rgba(220, 38, 38, ${intensity * 0.3})`);
        grad.addColorStop(0.5, `rgba(254, 240, 138, ${intensity})`);
        grad.addColorStop(1, `rgba(220, 38, 38, ${intensity * 0.3})`);
        ctx.fillStyle = grad;
        ctx.fillRect(o.x, 0, o.w, GROUND_Y);
        // Halo
        ctx.fillStyle = `rgba(220, 38, 38, ${intensity * 0.15})`;
        ctx.fillRect(o.x - 6, 0, o.w + 12, GROUND_Y);
      } else {
        // Off — warning marker
        ctx.fillStyle = "rgba(220, 38, 38, 0.3)";
        ctx.fillRect(o.x, 0, o.w, GROUND_Y);
        const remaining = Math.ceil((1300 - cycle) / 100) / 10;
        ctx.fillStyle = "#fde047";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${remaining.toFixed(1)}s`, o.x + o.w / 2, GROUND_Y / 2);
        ctx.textAlign = "start";
      }
      // Emitter caps
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(o.x - 2, 0, o.w + 4, 4);
      ctx.fillRect(o.x - 2, GROUND_Y - 4, o.w + 4, 4);
    } else {
      const oy = GROUND_Y - o.h;
      ctx.fillStyle = "#9a3412";
      ctx.fillRect(o.x, oy, o.w, o.h);
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(o.x - 2, oy, o.w + 4, 6);
      ctx.fillStyle = "#451a03";
      ctx.fillRect(o.x + 2, oy + 6, o.w - 4, 2);
      ctx.fillRect(o.x + 2, oy + o.h - 8, o.w - 4, 2);
    }
  }

  // Pickups
  for (const p of s.pickups) {
    if (p.collected) continue;
    drawPickup(ctx, p);
  }

  // Dust particles
  for (const d of s.dust) {
    ctx.fillStyle = `rgba(180, 180, 180, ${Math.max(0, Math.min(1, d.life))})`;
    ctx.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
  }

  // Boost trail behind player
  const now2 = performance.now();
  if (now2 < s.player.boostUntil) {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(251, 146, 60, ${0.35 - i * 0.08})`;
      ctx.fillRect(PLAYER_X - i * 8 - 4, s.player.y + 10, 10, PLAYER_H - 22);
    }
  }

  // Player
  drawPlayer(ctx, s);

  // Floats
  for (const f of s.floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = f.color;
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";

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
  // Boost timer or controls hint
  const now3 = performance.now();
  if (now3 < s.player.boostUntil) {
    const rem = ((s.player.boostUntil - now3) / 1000).toFixed(1);
    ctx.fillStyle = "#fb923c";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`🔥 БУСТ ${rem}s`, 300, 17);
  } else {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px monospace";
    ctx.fillText(`SPACE = прыжок · ↓ = подкат`, 300, 17);
  }
  if (s.coinCount > 0) {
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`🪙 ${s.coinCount}`, W - 60, 17);
  }

  ctx.restore();
}

/** Returns blended color as `rgb(R, G, B)` string consumable by Canvas. */
function blendColor(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = parseColor(c1);
  const [r2, g2, b2] = parseColor(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Returns blended color as `#RRGGBB` hex, for chained blends. */
function blendColorHex(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = parseColor(c1);
  const [r2, g2, b2] = parseColor(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function parseColor(c: string): [number, number, number] {
  if (c.startsWith("#") && c.length === 7) {
    return [
      parseInt(c.slice(1, 3), 16),
      parseInt(c.slice(3, 5), 16),
      parseInt(c.slice(5, 7), 16),
    ];
  }
  // Try rgb(r, g, b) form
  const m = c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m) {
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  // Fallback — black
  return [0, 0, 0];
}

function drawPickup(ctx: CanvasRenderingContext2D, p: Pickup) {
  const bob = Math.sin(p.bobPhase) * 4;
  const cx = p.x;
  const cy = p.y + bob;
  if (p.kind === "coin") {
    // Coin halo
    ctx.fillStyle = "rgba(251, 191, 36, 0.25)";
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    // Coin body
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, 3, 0, Math.PI * 2);
    ctx.fill();
    // $ mark
    ctx.fillStyle = "#a16207";
    ctx.fillRect(cx - 1, cy - 3, 2, 6);
    ctx.fillRect(cx - 3, cy - 1, 6, 1);
    ctx.fillRect(cx - 3, cy + 1, 6, 1);
  } else if (p.kind === "shield") {
    ctx.fillStyle = "rgba(103, 232, 249, 0.3)";
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#22d3ee";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx + 8, cy - 4);
    ctx.lineTo(cx + 8, cy + 4);
    ctx.lineTo(cx, cy + 9);
    ctx.lineTo(cx - 8, cy + 4);
    ctx.lineTo(cx - 8, cy - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#a5f3fc";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (p.kind === "boost") {
    // Flame
    ctx.fillStyle = "rgba(251, 146, 60, 0.3)";
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.bezierCurveTo(cx - 8, cy - 4, cx - 7, cy + 6, cx, cy + 8);
    ctx.bezierCurveTo(cx + 7, cy + 6, cx + 8, cy - 4, cx, cy - 10);
    ctx.fill();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.bezierCurveTo(cx - 4, cy - 1, cx - 3, cy + 4, cx, cy + 5);
    ctx.bezierCurveTo(cx + 3, cy + 4, cx + 4, cy - 1, cx, cy - 5);
    ctx.fill();
  } else {
    // Double-jump — purple star with up-arrows
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
    halo.addColorStop(0, "rgba(168, 85, 247, 0.5)");
    halo.addColorStop(1, "rgba(168, 85, 247, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(cx - 16, cy - 16, 32, 32);
    ctx.restore();
    // Star
    ctx.fillStyle = "#a855f7";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx + 3, cy - 3);
    ctx.lineTo(cx + 9, cy - 2);
    ctx.lineTo(cx + 4, cy + 3);
    ctx.lineTo(cx + 5, cy + 9);
    ctx.lineTo(cx, cy + 5);
    ctx.lineTo(cx - 5, cy + 9);
    ctx.lineTo(cx - 4, cy + 3);
    ctx.lineTo(cx - 9, cy - 2);
    ctx.lineTo(cx - 3, cy - 3);
    ctx.closePath();
    ctx.fill();
    // Up arrow
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - 1, cy - 4, 2, 6);
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 3, cy - 3);
    ctx.lineTo(cx + 3, cy - 3);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState) {
  const phH = s.player.ducking ? PLAYER_DUCK_H : PLAYER_H;
  const px = PLAYER_X;
  const py = s.player.y;
  const now = performance.now();

  // Shadow scales with altitude
  const heightOff = (GROUND_Y - PLAYER_H - py) / PLAYER_H;
  const shadowScale = Math.max(0.3, 1 - heightOff * 0.55);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.45 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(px + PLAYER_W / 2, GROUND_Y + 2, PLAYER_W / 2 * shadowScale + 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!s.player.alive) {
    ctx.save();
    ctx.translate(px + PLAYER_W / 2, py + phH / 2);
    ctx.rotate(s.player.deathTime * 2.5);
    ctx.fillStyle = "#10b981";
    ctx.fillRect(-PLAYER_W / 2, -phH / 2, PLAYER_W, phH);
    ctx.restore();
    return;
  }

  const isBoosting = now < s.player.boostUntil;
  const cx = px + PLAYER_W / 2;
  const cy = py + phH / 2;

  // Shield ring (pulsing)
  if (s.player.hasShield) {
    const pulse = 0.6 + Math.sin(now / 100) * 0.4;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, PLAYER_W * 0.9);
    grad.addColorStop(0, `rgba(103, 232, 249, ${pulse * 0.3})`);
    grad.addColorStop(1, "rgba(103, 232, 249, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(px - 14, py - 14, PLAYER_W + 28, phH + 28);
    ctx.restore();
    ctx.strokeStyle = `rgba(103, 232, 249, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, PLAYER_W / 2 + 6, phH / 2 + 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (s.player.shieldFlash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(103, 232, 249, ${s.player.shieldFlash * 0.6})`;
    ctx.fillRect(px - 6, py - 6, PLAYER_W + 12, phH + 12);
    ctx.restore();
  }

  // Pitch transform — lean forward at high speed
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(s.player.pitch);
  ctx.translate(-cx, -cy);

  // Body (torso) — rounded
  const bodyGrad = ctx.createLinearGradient(0, py, 0, py + phH);
  bodyGrad.addColorStop(0, isBoosting ? "#fb923c" : "#34d399");
  bodyGrad.addColorStop(1, isBoosting ? "#9a3412" : "#065f46");
  ctx.fillStyle = bodyGrad;
  roundedRect(ctx, px + 4, py + 10, PLAYER_W - 8, phH - 14, 6);
  ctx.fill();
  // Belt
  ctx.fillStyle = isBoosting ? "#7c2d12" : "#022c22";
  ctx.fillRect(px + 4, py + phH - 14, PLAYER_W - 8, 5);

  // Head
  if (!s.player.ducking) {
    ctx.fillStyle = "#f5e8d4";
    roundedRect(ctx, px + 6, py + 2, PLAYER_W - 12, 12, 4);
    ctx.fill();
    // Eye
    ctx.fillStyle = "#0a0508";
    ctx.fillRect(px + PLAYER_W - 11, py + 8, 2, 2);
    // Bandana
    ctx.fillStyle = isBoosting ? "#fde047" : "#dc2626";
    ctx.fillRect(px + 6, py + 6, PLAYER_W - 12, 2);
    // Bandana tail flutter
    const flutter = Math.sin(s.player.legPhase * 1.2) * 2;
    ctx.fillStyle = isBoosting ? "#fde047" : "#dc2626";
    ctx.fillRect(px + 4, py + 7 + flutter, 3, 1);
  } else {
    ctx.fillStyle = "#f5e8d4";
    roundedRect(ctx, px + 4, py + 2, PLAYER_W - 8, 8, 3);
    ctx.fill();
  }

  // Limbs — proper rotated rounded rects
  drawLimb(ctx, px + 8, py + phH - 14, 4, 14, Math.sin(s.player.legPhase) * 25, isBoosting ? "#9a3412" : "#022c22");
  drawLimb(ctx, px + PLAYER_W - 12, py + phH - 14, 4, 14, Math.sin(s.player.legPhase + Math.PI) * 25, isBoosting ? "#9a3412" : "#022c22");
  // Arms
  drawLimb(ctx, px + 4, py + 14, 3, 12, Math.sin(s.player.armPhase + Math.PI) * 30, isBoosting ? "#fb923c" : "#34d399");
  drawLimb(ctx, px + PLAYER_W - 6, py + 14, 3, 12, Math.sin(s.player.armPhase) * 30, isBoosting ? "#fb923c" : "#34d399");

  ctx.restore();

  // Double-jump charge indicators (small orbs above head)
  if (s.player.doubleJumpsLeft > 0) {
    for (let i = 0; i < s.player.doubleJumpsLeft; i++) {
      const ox = px + PLAYER_W / 2 - 6 + i * 6;
      const oy = py - 6 + Math.sin(now / 200 + i) * 1.5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 4);
      g.addColorStop(0, "rgba(168, 85, 247, 0.9)");
      g.addColorStop(1, "rgba(168, 85, 247, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(ox - 4, oy - 4, 8, 8);
      ctx.restore();
      ctx.fillStyle = "#a855f7";
      ctx.beginPath();
      ctx.arc(ox, oy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawLimb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rotDeg: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x + w / 2, y);
  ctx.rotate((rotDeg * Math.PI) / 180);
  ctx.fillStyle = color;
  // Drawn from top-pivot, hanging downward
  roundedRect(ctx, -w / 2, 0, w, h, w / 2);
  ctx.fill();
  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
