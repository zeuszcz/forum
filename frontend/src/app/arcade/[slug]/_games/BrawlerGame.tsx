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
  punchUntil: number;
  dodgeUntil: number;
  parryUntil: number;
  attackCooldownUntil: number;
};

type Enemy = {
  x: number;
  facing: 1 | -1;
  hp: number;
  hpMax: number;
  speed: number;
  attackCooldown: number;
  attacking: number; // ms remaining of wind-up
  alive: boolean;
};

type GameState = {
  player: Player;
  enemies: Enemy[];
  wave: number;
  killsThisWave: number;
  killsTotal: number;
  alive: boolean;
  rng: () => number;
  waveStartAt: number;
  spawnCooldown: number;
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
    });
  }
  s.waveStartAt = ts;
  // Heal 20% between waves
  s.player.hp = Math.min(s.player.hpMax, s.player.hp + 20);
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
        punchUntil: 0,
        dodgeUntil: 0,
        parryUntil: 0,
        attackCooldownUntil: 0,
      },
      enemies: [],
      wave: 0,
      killsThisWave: 0,
      killsTotal: 0,
      alive: true,
      rng,
      waveStartAt: performance.now(),
      spawnCooldown: 0,
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
      if (!s.alive) {
        end(s.killsTotal + s.wave * 5, {
          milestones: [{ wave: s.wave, kills: s.killsTotal, t: Date.now() }],
          meta: { wave: s.wave, kills: s.killsTotal },
        });
        return;
      }
      // Player movement
      const keys = keysRef.current;
      const speed = 220;
      if (keys.has("a") || keys.has("ArrowLeft")) {
        s.player.x = Math.max(20, s.player.x - speed * dt);
        s.player.facing = -1;
      }
      if (keys.has("d") || keys.has("ArrowRight")) {
        s.player.x = Math.min(W - 20, s.player.x + speed * dt);
        s.player.facing = 1;
      }
      // Process pending attack/dodge inputs (one-shot)
      if (keys.has("j") || keys.has("J")) {
        if (now > s.player.attackCooldownUntil) {
          s.player.punchUntil = now + 180;
          s.player.attackCooldownUntil = now + 380;
          // Resolve hit immediately on enemies in front within reach
          for (const e of s.enemies) {
            if (!e.alive) continue;
            const dx = e.x - s.player.x;
            if (s.player.facing * dx > 0 && Math.abs(dx) < 48) {
              e.hp -= 18;
              if (e.hp <= 0) {
                e.alive = false;
                s.killsThisWave += 1;
                s.killsTotal += 1;
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
          // Slight backstep
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
        if (!e.alive) continue;
        const dx = s.player.x - e.x;
        const dist = Math.abs(dx);
        e.facing = dx > 0 ? 1 : -1;
        if (e.attacking > 0) {
          e.attacking -= dt * 1000;
          if (e.attacking <= 0 && dist < 50) {
            // Land damage unless player is dodging or parrying
            const dodging = now < s.player.dodgeUntil;
            const parrying = now < s.player.parryUntil;
            if (parrying) {
              // Reflect: stun enemy + small damage
              e.hp -= 12;
              if (e.hp <= 0) {
                e.alive = false;
                s.killsThisWave += 1;
                s.killsTotal += 1;
              }
              e.attackCooldown = 1500;
            } else if (!dodging) {
              s.player.hp = Math.max(0, s.player.hp - 12);
            }
          }
        } else {
          // Move toward player or attack if close
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

      // Cleanup dead
      s.enemies = s.enemies.filter((e) => e.alive || e.attacking > 0);

      // Check wave completion
      if (s.enemies.every((e) => !e.alive)) {
        if (now - s.waveStartAt > 1500) {
          spawnWave(s, now);
        }
      }

      // Death check
      if (s.player.hp <= 0) {
        s.alive = false;
      }

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
      if (
        ["ArrowLeft", "ArrowRight", " "].includes(e.key)
      ) {
        e.preventDefault();
      }
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
  // Bg
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#1a0a08");
  grad.addColorStop(1, "#0a0508");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Floor
  ctx.fillStyle = "#3a1820";
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  // Tables / cafeteria style stripes
  ctx.fillStyle = "rgba(255,80,80,0.05)";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * 160, FLOOR_Y - 18, 140, 14);
  }

  // Enemies
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const py = FLOOR_Y - ENEMY_H;
    ctx.fillStyle = "#7f1d1d";
    ctx.fillRect(e.x - ENEMY_W / 2, py, ENEMY_W, ENEMY_H);
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(e.x - ENEMY_W / 2, py + ENEMY_H - 12, ENEMY_W, 12);
    // hp bar
    ctx.fillStyle = "#1a0a08";
    ctx.fillRect(e.x - 16, py - 6, 32, 4);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(e.x - 16, py - 6, 32 * (e.hp / e.hpMax), 4);
    if (e.attacking > 0) {
      ctx.fillStyle = "#fde047";
      ctx.fillRect(e.x - 4, py - 12, 8, 4);
    }
  }

  // Player
  const p = s.player;
  const py = FLOOR_Y - PLAYER_H;
  const isPunching = now < p.punchUntil;
  const isParrying = now < p.parryUntil;
  const isDodging = now < p.dodgeUntil;
  ctx.fillStyle = isDodging ? "#67e8f9" : "#22d3ee";
  ctx.fillRect(p.x - PLAYER_W / 2, py, PLAYER_W, PLAYER_H);
  ctx.fillStyle = "#0e7490";
  ctx.fillRect(p.x - PLAYER_W / 2, py + PLAYER_H - 14, PLAYER_W, 14);
  // Head
  ctx.fillStyle = "#f5e8d4";
  ctx.fillRect(p.x - 10, py + 6, 20, 16);
  // Punch indicator
  if (isPunching) {
    ctx.fillStyle = "#fde047";
    ctx.fillRect(p.x + p.facing * PLAYER_W / 2, py + 24, p.facing * 20, 12);
  }
  if (isParrying) {
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - PLAYER_W / 2 - 2, py - 2, PLAYER_W + 4, PLAYER_H + 4);
  }
  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, W, 28);
  // HP bar
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(8, 8, 160, 12);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(8, 8, 160 * (p.hp / p.hpMax), 12);
  ctx.fillStyle = "#fff";
  ctx.font = "12px monospace";
  ctx.fillText(`HP ${p.hp}`, 12, 18);
  ctx.fillStyle = "#fda4af";
  ctx.fillText(`Волна ${s.wave}`, 200, 18);
  ctx.fillStyle = "#fde047";
  ctx.fillText(`Фраги ${s.killsTotal}`, 300, 18);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`J=удар · K=уворот · L=парировать`, 400, 18);
}
