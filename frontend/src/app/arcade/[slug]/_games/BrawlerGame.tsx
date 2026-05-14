"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState } from "react";

import { mulberry32, useArcadeRun } from "../../_components/useArcadeRun";

import { GameShell } from "./GameShell";

const W = 640;
const H = 320;
const FLOOR_Y = 280;
const PLAYER_W = 32;
const PLAYER_H = 72;
const ENEMY_W = 30;
const ENEMY_H = 68;

type Player = {
  x: number;
  facing: 1 | -1;
  hp: number;
  hpMax: number;
  hpDisplay: number; // animates toward hp
  punchUntil: number;
  dodgeUntil: number;
  parryUntil: number;
  attackCooldownUntil: number;
  hitFlashUntil: number;
  walkPhase: number;
};

type Enemy = {
  x: number;
  facing: 1 | -1;
  hp: number;
  hpMax: number;
  speed: number;
  attackCooldown: number;
  attacking: number;
  alive: boolean;
  deathTimer: number; // fades 0..400ms after death
  hitFlashUntil: number;
  walkPhase: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
};

type FloatText = { x: number; y: number; text: string; life: number; color: string };

type GameState = {
  player: Player;
  enemies: Enemy[];
  wave: number;
  killsThisWave: number;
  killsTotal: number;
  alive: boolean;
  rng: () => number;
  waveStartAt: number;
  waveBannerLife: number;
  particles: Particle[];
  floats: FloatText[];
  shake: { mag: number; life: number };
  animTime: number;
};

function spawnWave(s: GameState, ts: number) {
  s.wave += 1;
  s.killsThisWave = 0;
  const count = Math.min(7, 2 + Math.floor(s.wave / 2));
  for (let i = 0; i < count; i++) {
    const fromLeft = s.rng() < 0.5;
    s.enemies.push({
      x: fromLeft ? -ENEMY_W - i * 50 : W + i * 50,
      facing: fromLeft ? 1 : -1,
      hp: 30 + s.wave * 4,
      hpMax: 30 + s.wave * 4,
      speed: 60 + s.wave * 4 + s.rng() * 20,
      attackCooldown: 1000 + s.rng() * 500,
      attacking: 0,
      alive: true,
      deathTimer: 0,
      hitFlashUntil: 0,
      walkPhase: s.rng() * Math.PI * 2,
    });
  }
  s.waveStartAt = ts;
  s.waveBannerLife = 1.6;
  s.player.hp = Math.min(s.player.hpMax, s.player.hp + 20);
}

function spawnBlood(s: GameState, x: number, y: number) {
  for (let i = 0; i < 10; i++) {
    const a = s.rng() * Math.PI * 2;
    const sp = 100 + s.rng() * 120;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 60,
      life: 0.5 + s.rng() * 0.4,
      color: s.rng() < 0.7 ? "#dc2626" : "#7f1d1d",
    });
  }
}

function spawnSparks(s: GameState, x: number, y: number) {
  for (let i = 0; i < 8; i++) {
    const a = s.rng() * Math.PI * 2;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * (120 + s.rng() * 80),
      vy: Math.sin(a) * (120 + s.rng() * 80),
      life: 0.3 + s.rng() * 0.3,
      color: "#facc15",
    });
  }
}

function addFloat(s: GameState, x: number, y: number, text: string, color: string) {
  s.floats.push({ x, y, text, color, life: 1.0 });
}

function applyShake(s: GameState, mag: number) {
  s.shake.mag = Math.max(s.shake.mag, mag);
  s.shake.life = 0.35;
}

export function BrawlerGame({
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
        x: W / 2,
        facing: 1,
        hp: 100,
        hpMax: 100,
        hpDisplay: 100,
        punchUntil: 0,
        dodgeUntil: 0,
        parryUntil: 0,
        attackCooldownUntil: 0,
        hitFlashUntil: 0,
        walkPhase: 0,
      },
      enemies: [],
      wave: 0,
      killsThisWave: 0,
      killsTotal: 0,
      alive: true,
      rng,
      waveStartAt: performance.now(),
      waveBannerLife: 0,
      particles: [],
      floats: [],
      shake: { mag: 0, life: 0 },
      animTime: 0,
    };
    spawnWave(st, performance.now());
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
      s.animTime += dt;
      if (s.waveBannerLife > 0) s.waveBannerLife -= dt;
      if (s.shake.life > 0) {
        s.shake.life -= dt;
        if (s.shake.life <= 0) s.shake.mag = 0;
      }

      // HP display smooth lerp
      if (Math.abs(s.player.hpDisplay - s.player.hp) > 0.5) {
        s.player.hpDisplay += (s.player.hp - s.player.hpDisplay) * Math.min(1, dt * 6);
      } else {
        s.player.hpDisplay = s.player.hp;
      }

      if (!s.alive) {
        end(s.killsTotal + s.wave * 5, {
          milestones: [{ wave: s.wave, kills: s.killsTotal, t: Date.now() }],
          meta: { wave: s.wave, kills: s.killsTotal },
        });
        return;
      }
      const keys = keysRef.current;
      const speed = 220;
      let moving = false;
      if (keys.has("a") || keys.has("ArrowLeft") || keys.has("A")) {
        s.player.x = Math.max(20, s.player.x - speed * dt);
        s.player.facing = -1;
        moving = true;
      }
      if (keys.has("d") || keys.has("ArrowRight") || keys.has("D")) {
        s.player.x = Math.min(W - 20, s.player.x + speed * dt);
        s.player.facing = 1;
        moving = true;
      }
      if (moving) s.player.walkPhase += dt * 12;
      // Punch (J)
      if (keys.has("j") || keys.has("J")) {
        if (now > s.player.attackCooldownUntil) {
          s.player.punchUntil = now + 180;
          s.player.attackCooldownUntil = now + 380;
          for (const e of s.enemies) {
            if (!e.alive) continue;
            const dx = e.x - s.player.x;
            if (s.player.facing * dx > 0 && Math.abs(dx) < 48) {
              e.hp -= 18;
              e.hitFlashUntil = now + 120;
              spawnBlood(s, e.x, FLOOR_Y - ENEMY_H / 2);
              applyShake(s, 3);
              if (e.hp <= 0) {
                e.alive = false;
                e.deathTimer = 0.4;
                s.killsThisWave += 1;
                s.killsTotal += 1;
                addFloat(s, e.x, FLOOR_Y - ENEMY_H, "+1", "#fde047");
                applyShake(s, 6);
              }
            }
          }
        }
        keys.delete("j");
        keys.delete("J");
      }
      if (keys.has("k") || keys.has("K")) {
        if (now > s.player.dodgeUntil + 200) {
          s.player.dodgeUntil = now + 280;
          s.player.x = Math.max(20, Math.min(W - 20, s.player.x - s.player.facing * 22));
        }
        keys.delete("k");
        keys.delete("K");
      }
      if (keys.has("l") || keys.has("L")) {
        if (now > s.player.parryUntil + 800) {
          s.player.parryUntil = now + 220;
        }
        keys.delete("l");
        keys.delete("L");
      }

      // Enemies
      for (const e of s.enemies) {
        if (!e.alive) {
          e.deathTimer -= dt;
          continue;
        }
        e.walkPhase += dt * 10;
        const dx = s.player.x - e.x;
        const dist = Math.abs(dx);
        e.facing = dx > 0 ? 1 : -1;
        if (e.attacking > 0) {
          e.attacking -= dt * 1000;
          if (e.attacking <= 0 && dist < 50) {
            const dodging = now < s.player.dodgeUntil;
            const parrying = now < s.player.parryUntil;
            if (parrying) {
              e.hp -= 12;
              e.hitFlashUntil = now + 120;
              spawnSparks(s, e.x, FLOOR_Y - ENEMY_H / 2);
              applyShake(s, 4);
              if (e.hp <= 0) {
                e.alive = false;
                e.deathTimer = 0.4;
                s.killsThisWave += 1;
                s.killsTotal += 1;
              }
              e.attackCooldown = 1500;
            } else if (!dodging) {
              s.player.hp = Math.max(0, s.player.hp - 12);
              s.player.hitFlashUntil = now + 200;
              addFloat(s, s.player.x, FLOOR_Y - PLAYER_H, "-12", "#fda4af");
              applyShake(s, 5);
              spawnBlood(s, s.player.x, FLOOR_Y - PLAYER_H / 2);
            }
          }
        } else {
          if (dist > 44) {
            e.x += Math.sign(dx) * e.speed * dt;
          } else {
            e.attackCooldown -= dt * 1000;
            if (e.attackCooldown <= 0) {
              e.attacking = 280;
              e.attackCooldown = 1200 + s.rng() * 600;
            }
          }
        }
      }
      // Cleanup
      s.enemies = s.enemies.filter((e) => e.alive || e.attacking > 0 || e.deathTimer > 0);

      // Wave completion
      if (s.enemies.every((e) => !e.alive)) {
        if (now - s.waveStartAt > 1500) {
          spawnWave(s, now);
        }
      }
      if (s.player.hp <= 0) {
        s.alive = false;
      }

      // Particles
      for (const p of s.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 480 * dt;
        p.life -= dt * 1.4;
      }
      s.particles = s.particles.filter((p) => p.life > 0);
      // Floats
      for (const f of s.floats) {
        f.y -= 45 * dt;
        f.life -= dt;
      }
      s.floats = s.floats.filter((f) => f.life > 0);

      draw(canvas, s, now);
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
      if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
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
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-sm text-rose-200">
            Волна {stateRef.current.wave} · {stateRef.current.killsTotal} frags
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

function draw(canvas: HTMLCanvasElement, s: GameState, now: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Camera shake
  let shakeX = 0;
  let shakeY = 0;
  if (s.shake.mag > 0 && s.shake.life > 0) {
    shakeX = (Math.random() - 0.5) * s.shake.mag;
    shakeY = (Math.random() - 0.5) * s.shake.mag;
  }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Background — gritty cafeteria
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#2a0f10");
  grad.addColorStop(0.5, "#1a0a08");
  grad.addColorStop(1, "#0a0508");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Ceiling lamps (3 swinging)
  for (let i = 0; i < 3; i++) {
    const lx = W * (0.2 + i * 0.3);
    const sway = Math.sin(s.animTime * 1.2 + i) * 6;
    ctx.strokeStyle = "rgba(255, 255, 200, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx + sway, 0);
    ctx.lineTo(lx, 40);
    ctx.stroke();
    // Lamp
    ctx.fillStyle = "#1a1014";
    ctx.fillRect(lx - 8, 40, 16, 8);
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(lx, 50, 6, 0, Math.PI * 2);
    ctx.fill();
    // Light cone on floor
    ctx.fillStyle = "rgba(250, 204, 21, 0.06)";
    ctx.beginPath();
    ctx.moveTo(lx - 4, 50);
    ctx.lineTo(lx + 4, 50);
    ctx.lineTo(lx + 50, FLOOR_Y);
    ctx.lineTo(lx - 50, FLOOR_Y);
    ctx.closePath();
    ctx.fill();
  }

  // Back wall hatching (concrete blocks)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  for (let y = 60; y < FLOOR_Y; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    const offset = (y / 24) % 2 === 0 ? 0 : 40;
    for (let x = offset; x < W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 24);
      ctx.stroke();
    }
  }

  // Tables / overturned chairs as decor
  ctx.fillStyle = "rgba(255, 80, 40, 0.04)";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * 160 + 20, FLOOR_Y - 18, 140, 14);
  }

  // Floor
  ctx.fillStyle = "#3a1820";
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  // Floor grime stripes
  ctx.fillStyle = "rgba(255, 80, 80, 0.05)";
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(i * 80, FLOOR_Y + 5 + (i % 2) * 3, 60, 2);
  }

  // Enemies (back-to-front by alive then by x)
  const sortedEnemies = [...s.enemies].sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0));
  for (const e of sortedEnemies) {
    drawEnemy(ctx, e, now);
  }

  // Player
  drawPlayer(ctx, s.player, now);

  // Particles
  for (const p of s.particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillRect(p.x - 2, p.y - 2, 3, 3);
  }
  ctx.globalAlpha = 1;
  // Floats
  for (const f of s.floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = f.color;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";

  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, W, 30);
  // HP bar (smooth-animated display value)
  const p = s.player;
  ctx.fillStyle = "#1a0a08";
  ctx.fillRect(8, 8, 180, 14);
  const hpFrac = Math.max(0, p.hpDisplay / p.hpMax);
  const hpGrad = ctx.createLinearGradient(8, 0, 188, 0);
  hpGrad.addColorStop(0, "#dc2626");
  hpGrad.addColorStop(0.5, "#22c55e");
  hpGrad.addColorStop(1, "#22c55e");
  ctx.fillStyle = hpGrad;
  ctx.fillRect(8, 8, 180 * hpFrac, 14);
  // HP digital
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px monospace";
  ctx.fillText(`HP ${Math.ceil(p.hpDisplay)}`, 12, 18);
  ctx.fillStyle = "#fda4af";
  ctx.fillText(`ВОЛНА ${s.wave}`, 210, 18);
  ctx.fillStyle = "#fde047";
  ctx.fillText(`FRAGS ${s.killsTotal}`, 310, 18);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px monospace";
  ctx.fillText(`J=удар · K=уворот · L=парировать`, 410, 19);

  // Wave banner
  if (s.waveBannerLife > 0) {
    const alpha = Math.min(1, s.waveBannerLife * 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, H / 2 - 28, W, 56);
    ctx.fillStyle = "#dc2626";
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`ВОЛНА ${s.wave}`, W / 2, H / 2 + 4);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`${s.enemies.filter((e) => e.alive).length} противников`, W / 2, H / 2 + 22);
    ctx.globalAlpha = 1;
    ctx.textAlign = "start";
  }

  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, now: number) {
  const py = FLOOR_Y - PLAYER_H;
  const isPunching = now < p.punchUntil;
  const isParrying = now < p.parryUntil;
  const isDodging = now < p.dodgeUntil;
  const isHit = now < p.hitFlashUntil;
  const wob = Math.sin(p.walkPhase) * 1.5;
  const yOff = isDodging ? 4 : wob;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(p.x, FLOOR_Y + 2, PLAYER_W / 2 + 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = isHit ? "#fee2e2" : isDodging ? "#67e8f9" : "#22d3ee";
  ctx.fillRect(p.x - PLAYER_W / 2, py + yOff, PLAYER_W, PLAYER_H);
  // Boots band
  ctx.fillStyle = "#0e7490";
  ctx.fillRect(p.x - PLAYER_W / 2, py + PLAYER_H - 14 + yOff, PLAYER_W, 14);
  // Head
  ctx.fillStyle = "#f5e8d4";
  ctx.fillRect(p.x - 10, py + 6 + yOff, 20, 18);
  // Eye line — facing
  ctx.fillStyle = "#0a0508";
  if (p.facing > 0) ctx.fillRect(p.x + 3, py + 14 + yOff, 2, 2);
  else ctx.fillRect(p.x - 5, py + 14 + yOff, 2, 2);
  // Arms — punch animation extends arm forward
  ctx.fillStyle = "#22d3ee";
  if (isPunching) {
    ctx.fillStyle = "#fde047";
    ctx.fillRect(p.x + (p.facing > 0 ? PLAYER_W / 2 : -PLAYER_W / 2 - 14), py + 28 + yOff, 14, 6);
    // Punch streak
    ctx.fillStyle = "rgba(253, 224, 71, 0.4)";
    for (let i = 1; i <= 3; i++) {
      ctx.fillRect(
        p.x + (p.facing > 0 ? PLAYER_W / 2 - i * 6 : -PLAYER_W / 2 + i * 6 - 14),
        py + 32 + yOff,
        14 - i * 2,
        2,
      );
    }
  } else {
    // Idle arms
    const armSwing = Math.sin(p.walkPhase) * 3;
    ctx.fillRect(p.x - PLAYER_W / 2 - 1, py + 24 + yOff + armSwing, 4, 18);
    ctx.fillRect(p.x + PLAYER_W / 2 - 3, py + 24 + yOff - armSwing, 4, 18);
  }
  // Parry shield ring
  if (isParrying) {
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x - PLAYER_W / 2 - 3, py - 3, PLAYER_W + 6, PLAYER_H + 6);
    // Parry shimmer
    const t = (now / 100) % (Math.PI * 2);
    ctx.fillStyle = `rgba(168, 85, 247, ${0.3 + Math.sin(t) * 0.2})`;
    ctx.fillRect(p.x - PLAYER_W / 2 - 1, py - 1, PLAYER_W + 2, PLAYER_H + 2);
  }
  // Dodge afterimage
  if (isDodging) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(p.x - PLAYER_W / 2 - p.facing * 12, py + yOff, PLAYER_W, PLAYER_H);
    ctx.globalAlpha = 1;
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, now: number) {
  const py = FLOOR_Y - ENEMY_H;
  const isHit = now < e.hitFlashUntil;
  const isDead = !e.alive;
  const fadeAlpha = isDead ? Math.max(0, e.deathTimer / 0.4) : 1;

  ctx.globalAlpha = fadeAlpha;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(e.x, FLOOR_Y + 2, ENEMY_W / 2 + 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isDead) {
    // Falling/dead — tilt sprite
    ctx.save();
    ctx.translate(e.x, FLOOR_Y);
    ctx.rotate((1 - fadeAlpha) * Math.PI * 0.5);
    ctx.fillStyle = "#7f1d1d";
    ctx.fillRect(-ENEMY_W / 2, -ENEMY_H, ENEMY_W, ENEMY_H);
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  const wob = Math.sin(e.walkPhase) * 1.5;
  const yOff = wob;
  // Body
  ctx.fillStyle = isHit ? "#fee2e2" : "#7f1d1d";
  ctx.fillRect(e.x - ENEMY_W / 2, py + yOff, ENEMY_W, ENEMY_H);
  // Belt
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(e.x - ENEMY_W / 2, py + ENEMY_H - 14 + yOff, ENEMY_W, 12);
  // Head
  ctx.fillStyle = "#fde047";
  ctx.fillRect(e.x - 9, py + 6 + yOff, 18, 14);
  // Visor
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(e.x - 7, py + 12 + yOff, 14, 4);
  // HP bar
  ctx.fillStyle = "#1a0a08";
  ctx.fillRect(e.x - 16, py - 8, 32, 4);
  const hpFrac = Math.max(0, e.hp / e.hpMax);
  ctx.fillStyle = hpFrac > 0.5 ? "#22c55e" : hpFrac > 0.25 ? "#fbbf24" : "#dc2626";
  ctx.fillRect(e.x - 16, py - 8, 32 * hpFrac, 4);
  // Wind-up indicator (yellow flash above)
  if (e.attacking > 0) {
    const pulse = 0.5 + Math.sin(now / 30) * 0.5;
    ctx.fillStyle = `rgba(253, 224, 71, ${pulse})`;
    ctx.beginPath();
    ctx.moveTo(e.x, py - 16);
    ctx.lineTo(e.x - 5, py - 10);
    ctx.lineTo(e.x + 5, py - 10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
