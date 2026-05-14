"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useEffect, useRef, useState } from "react";

import { mulberry32, useArcadeRun } from "../../_components/useArcadeRun";

import { GameShell } from "./GameShell";

const W = 480;
const H = 600;
const CELL = 24;
const COLS = W / CELL;
const ROWS = H / CELL;
const MOVE_COOLDOWN_MS = 110;

type Tile = " " | "#" | "h" | "P" | "C" | "X" | "G" | "M" | "T" | "K" | "L" | "D";
// " " empty / "#" dirt / "h" pipe-steam (lethal) / "P" crowbar / "C" camera (lethal)
// "X" concrete / "G" gold / "M" helmet / "T" treasure chest
// "K" crystal (rare, +100 score) / "L" lava (lethal) / "D" dynamite (chain-detonates 3x3)

type Biome = "surface" | "stone" | "crystal" | "molten";

function biomeAt(depth: number): Biome {
  if (depth < 40) return "surface";
  if (depth < 120) return "stone";
  if (depth < 220) return "crystal";
  return "molten";
}

// Color palettes per biome — [base, dark, accent, glow]
const BIOME_PALETTE: Record<Biome, { base: string; dark: string; accent: string; ambient: string; godRay: string | null }> = {
  surface: { base: "#5a3520", dark: "#2a1810", accent: "#c2410c", ambient: "#1a0e08", godRay: null },
  stone:   { base: "#4a4a52", dark: "#28282e", accent: "#71717a", ambient: "#0d0d12", godRay: null },
  crystal: { base: "#4338ca", dark: "#1e1b4b", accent: "#a855f7", ambient: "#0a0418", godRay: "#a855f7" },
  molten:  { base: "#9a3412", dark: "#451a03", accent: "#f59e0b", ambient: "#1f0606", godRay: "#ea580c" },
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity?: number;
  glow?: boolean;
};

type FloatText = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  size?: number;
  glow?: boolean;
};

type Shake = { mag: number; life: number };

type Explosion = { cx: number; cy: number; radius: number; maxRadius: number; life: number };

type GameState = {
  player: { col: number; row: number };
  prevPlayerCol: number;
  prevPlayerRow: number;
  moveAnim: number;
  digFlash: number;
  pickaxeSwing: number;
  facing: 1 | -1;
  depth: number;
  score: number;
  goldCount: number;
  crystalCount: number;
  dynamiteCount: number;
  jetpackFuel: number;
  jetpackBurning: number;          // 0..1 visual flame intensity
  scrolls: number;
  alive: boolean;
  scrollSpeed: number;
  hasCrowbar: number;
  hasHelmet: boolean;
  helmetFlash: number;
  grid: Tile[][];
  lastInputAt: number;
  particles: Particle[];
  floatTexts: FloatText[];
  embers: Array<{ x: number; y: number; size: number; speed: number; phase: number }>;
  godRays: Array<{ x: number; width: number; speed: number; phase: number }>;
  explosions: Explosion[];
  shake: Shake;
  rng: () => number;
  animTime: number;
  ceilingGlow: number;
  nextTreasureDepth: number;
  comboDigs: number;
  comboExpireAt: number;
  hitstop: number;
  slowMo: number;                  // 0..1 (1 = max slowmo)
};

function emptyGrid(rng: () => number): Tile[][] {
  const grid: Tile[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push(r < 3 ? " " : rng() < 0.45 ? "#" : " ");
    }
    grid.push(row);
  }
  return grid;
}

function generateRow(depth: number, rng: () => number, withTreasure: boolean): Tile[] {
  const biome = biomeAt(depth);
  const dirtP = 0.45 + Math.min(0.2, depth / 2000);
  const hazardP = Math.min(0.1, 0.005 + depth / 8000);
  const crowbarP = 0.012;
  const camP = Math.min(0.04, 0.001 + depth / 12000);
  const blockerP = Math.min(0.06, 0.005 + depth / 6000);
  const goldP = 0.025;
  const helmetP = 0.006;
  const crystalP = biome === "crystal" ? 0.020 : 0.004;
  const lavaP = biome === "molten" ? Math.min(0.08, 0.01 + (depth - 220) / 4000) : 0;
  const dynamiteP = depth > 30 ? 0.008 : 0;
  const row: Tile[] = [];
  let hasPassable = false;
  for (let c = 0; c < COLS; c++) {
    const r = rng();
    let acc = 0;
    let t: Tile = " ";
    const pick = (p: number, kind: Tile) => {
      acc += p;
      return r < acc ? kind : null;
    };
    const x =
      pick(camP, "C") ??
      pick(hazardP, "h") ??
      pick(lavaP, "L") ??
      pick(crowbarP, "P") ??
      pick(helmetP, "M") ??
      pick(crystalP, "K") ??
      pick(dynamiteP, "D") ??
      pick(goldP, "G") ??
      pick(blockerP, "X") ??
      pick(dirtP, "#");
    t = x ?? " ";
    if (t === " " || t === "P" || t === "M" || t === "G" || t === "K" || t === "D") {
      hasPassable = true;
    }
    row.push(t);
  }
  if (!hasPassable) {
    row[Math.floor(rng() * COLS)] = " ";
  }
  if (withTreasure) {
    const candidates: number[] = [];
    for (let c = 4; c < COLS - 4; c++) {
      if (row[c] === "#" || row[c] === " ") candidates.push(c);
    }
    const slot = candidates.length > 0
      ? candidates[Math.floor(rng() * candidates.length)]
      : Math.floor(COLS / 2);
    row[slot] = "T";
  }
  return row;
}

function spawnDirtBurst(s: GameState, cx: number, cy: number) {
  const pal = BIOME_PALETTE[biomeAt(s.depth + s.player.row)];
  for (let i = 0; i < 14; i++) {
    s.particles.push({
      x: cx + (s.rng() - 0.5) * 6,
      y: cy + (s.rng() - 0.5) * 6,
      vx: (s.rng() - 0.5) * 220,
      vy: -s.rng() * 180 - 30,
      life: 0.6 + s.rng() * 0.4,
      maxLife: 0.6 + s.rng() * 0.4,
      color: s.rng() < 0.5 ? pal.base : pal.dark,
      size: 2 + Math.floor(s.rng() * 2),
    });
  }
}

function spawnSparkle(s: GameState, cx: number, cy: number, color: string, count = 12) {
  for (let i = 0; i < count; i++) {
    const a = s.rng() * Math.PI * 2;
    const sp = 80 + s.rng() * 100;
    s.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.45 + s.rng() * 0.4,
      maxLife: 0.7,
      color,
      size: 2,
      glow: true,
    });
  }
}

function spawnPuff(s: GameState, cx: number, cy: number, color: string) {
  for (let i = 0; i < 16; i++) {
    s.particles.push({
      x: cx,
      y: cy,
      vx: (s.rng() - 0.5) * 260,
      vy: (s.rng() - 0.5) * 260,
      life: 0.6 + s.rng() * 0.6,
      maxLife: 1.0,
      color,
      size: 3 + Math.floor(s.rng() * 2),
      glow: true,
    });
  }
}

function spawnCrystalShatter(s: GameState, cx: number, cy: number) {
  const colors = ["#22d3ee", "#a855f7", "#ec4899", "#f43f5e", "#fbbf24", "#84cc16", "#06b6d4"];
  for (let i = 0; i < 30; i++) {
    const a = s.rng() * Math.PI * 2;
    const sp = 140 + s.rng() * 160;
    s.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.8 + s.rng() * 0.5,
      maxLife: 1.3,
      color: colors[Math.floor(s.rng() * colors.length)],
      size: 2 + Math.floor(s.rng() * 3),
      glow: true,
    });
  }
}

function addFloat(s: GameState, x: number, y: number, text: string, color: string, size = 12, glow = false) {
  s.floatTexts.push({ x, y, text, color, life: 1.0, size, glow });
}

function applyShake(s: GameState, mag: number) {
  s.shake.mag = Math.max(s.shake.mag, mag);
  s.shake.life = 0.4;
}

// Chain-detonation of dynamite — explodes 3x3 around (col, row), then any dynamite caught propagates.
function detonateDynamite(s: GameState, col: number, row: number) {
  const queue: Array<[number, number]> = [[col, row]];
  while (queue.length > 0) {
    const [cc, rr] = queue.shift()!;
    if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
    if (s.grid[rr][cc] === " ") continue;
    // Visual explosion
    s.explosions.push({
      cx: cc * CELL + CELL / 2,
      cy: rr * CELL + CELL / 2,
      radius: 6,
      maxRadius: 36,
      life: 1.0,
    });
    spawnPuff(s, cc * CELL + CELL / 2, rr * CELL + CELL / 2, "#fbbf24");
    spawnSparkle(s, cc * CELL + CELL / 2, rr * CELL + CELL / 2, "#ef4444", 8);
    applyShake(s, 6);
    // 3x3 destroy
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nc = cc + dc;
        const nr = rr + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        const t = s.grid[nr][nc];
        if (t === "D") {
          // Chain — queue this dynamite for explosion
          queue.push([nc, nr]);
          continue;
        }
        if (t === "#" || t === "X" || t === "h" || t === "G" || t === "L") {
          // Award some score for things blown up
          if (t === "#") s.score += 1;
          else if (t === "X") s.score += 5;
          else if (t === "G") {
            s.score += 50;
            s.goldCount += 1;
          }
          s.grid[nr][nc] = " ";
        }
        // Cameras and crystals destroyed cleanly too
        if (t === "C") {
          s.grid[nr][nc] = " ";
          s.score += 20;
        }
        if (t === "K") {
          s.grid[nr][nc] = " ";
          s.score += 100;
          s.crystalCount += 1;
        }
      }
    }
    s.grid[rr][cc] = " ";
  }
  s.hitstop = 0.18;
  s.slowMo = 0.6;
  addFloat(s, col * CELL + CELL / 2, row * CELL - 4, "БУМ!", "#fbbf24", 18, true);
}

export function DiggerGame({ game }: { game: { slug: string; title: string; emoji: string; accent: string; description: string; controls: string; score_unit: string } }) {
  const { state: runState, error, start, end } = useArcadeRun(game.slug);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const rafRef = useRef<number | null>(null);
  const milestonesRef = useRef<Array<{ t: number; depth: number }>>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (runState.phase !== "running") return;
    const rng = mulberry32(runState.seed);
    const embers = [];
    for (let i = 0; i < 40; i++) {
      embers.push({
        x: rng() * W,
        y: rng() * H,
        size: 1 + rng() * 2,
        speed: 10 + rng() * 22,
        phase: rng() * Math.PI * 2,
      });
    }
    const godRays = [];
    for (let i = 0; i < 5; i++) {
      godRays.push({
        x: rng() * W,
        width: 30 + rng() * 60,
        speed: 8 + rng() * 12,
        phase: rng() * Math.PI * 2,
      });
    }
    stateRef.current = {
      player: { col: Math.floor(COLS / 2), row: 4 },
      prevPlayerCol: Math.floor(COLS / 2),
      prevPlayerRow: 4,
      moveAnim: 1,
      digFlash: 0,
      pickaxeSwing: 0,
      facing: 1,
      depth: 0,
      score: 0,
      goldCount: 0,
      crystalCount: 0,
      dynamiteCount: 0,
      jetpackFuel: 100,
      jetpackBurning: 0,
      scrolls: 0,
      alive: true,
      scrollSpeed: 1.6,
      hasCrowbar: 0,
      hasHelmet: false,
      helmetFlash: 0,
      grid: emptyGrid(rng),
      lastInputAt: 0,
      particles: [],
      floatTexts: [],
      embers,
      godRays,
      explosions: [],
      shake: { mag: 0, life: 0 },
      rng,
      animTime: 0,
      ceilingGlow: 0,
      nextTreasureDepth: 25,
      comboDigs: 0,
      comboExpireAt: 0,
      hitstop: 0,
      slowMo: 0,
    };
    milestonesRef.current = [];
    setTick((t) => t + 1);
  }, [runState.phase, runState.phase === "running" ? runState.seed : 0]);

  useEffect(() => {
    if (runState.phase !== "running") return;
    let last = performance.now();

    const step = (now: number) => {
      const dt0 = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      const canvas = canvasRef.current;
      if (!s || !canvas) return;

      s.animTime += dt0;
      // Hitstop + slow-mo
      let dt = s.hitstop > 0 ? dt0 * 0.15 : dt0;
      if (s.slowMo > 0) {
        dt *= (1 - s.slowMo * 0.7);
        s.slowMo = Math.max(0, s.slowMo - dt0 * 1.4);
      }
      if (s.hitstop > 0) s.hitstop = Math.max(0, s.hitstop - dt0);

      if (s.comboDigs > 0 && now > s.comboExpireAt) s.comboDigs = 0;

      if (s.alive) {
        s.scrollSpeed = Math.min(6.0, 1.6 + s.depth * 0.005);
        const rowsToScroll = s.scrollSpeed * dt;
        s.scrolls += rowsToScroll;
        while (s.scrolls >= 1) {
          s.scrolls -= 1;
          s.grid.shift();
          const treasureDepth = s.depth + s.player.row;
          const withTreasure = treasureDepth >= s.nextTreasureDepth;
          s.grid.push(generateRow(treasureDepth, s.rng, withTreasure));
          if (withTreasure) s.nextTreasureDepth *= 2;
          s.player.row -= 1;
          s.prevPlayerRow -= 1;
          if (s.player.row < 0) {
            s.alive = false;
            applyShake(s, 14);
            spawnPuff(s, s.player.col * CELL + CELL / 2, 6, "#ef4444");
            break;
          }
        }
        const dangerRatio = 1 - Math.max(0, s.player.row) / 6;
        s.ceilingGlow = Math.max(0, Math.min(1, dangerRatio));

        if (s.alive) {
          const cell = s.grid[s.player.row]?.[s.player.col];
          if (cell === "C") {
            s.alive = false;
            applyShake(s, 10);
            spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#ef4444");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ЗАСЁК", "#fca5a5", 14, true);
          } else if (cell === "h") {
            if (s.hasHelmet) {
              s.hasHelmet = false;
              s.helmetFlash = 1.0;
              s.grid[s.player.row][s.player.col] = " ";
              applyShake(s, 6);
              spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
              addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ШЛЕМ!", "#fde047", 14, true);
            } else {
              s.alive = false;
              applyShake(s, 8);
              spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#f59e0b");
              addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ПАР", "#fde047", 14, true);
            }
          } else if (cell === "L") {
            s.alive = false;
            applyShake(s, 16);
            spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#dc2626");
            spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fbbf24");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ЛАВА", "#ef4444", 16, true);
          } else if (cell === "P") {
            s.hasCrowbar += 1;
            s.grid[s.player.row][s.player.col] = " ";
            s.score += 25;
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+ЛОМ", "#fde047", 12, true);
          } else if (cell === "G") {
            s.goldCount += 1;
            s.score += 50;
            s.grid[s.player.row][s.player.col] = " ";
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+50", "#fbbf24", 12, true);
          } else if (cell === "K") {
            s.crystalCount += 1;
            s.score += 100;
            s.grid[s.player.row][s.player.col] = " ";
            spawnCrystalShatter(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2);
            applyShake(s, 5);
            s.hitstop = 0.08;
            s.slowMo = 0.4;
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL - 4, "✦ КРИСТАЛЛ +100", "#c084fc", 14, true);
          } else if (cell === "D") {
            s.dynamiteCount += 1;
            s.grid[s.player.row][s.player.col] = " ";
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#ef4444");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+ДИНАМИТ", "#ef4444", 12, true);
          } else if (cell === "M") {
            s.hasHelmet = true;
            s.grid[s.player.row][s.player.col] = " ";
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#22d3ee");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+ШЛЕМ", "#67e8f9", 12, true);
          } else if (cell === "T") {
            const reward = 200 + Math.floor(s.depth / 10) * 20;
            s.score += reward;
            s.goldCount += 5;
            s.grid[s.player.row][s.player.col] = " ";
            applyShake(s, 8);
            s.hitstop = 0.12;
            s.slowMo = 0.5;
            spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fbbf24");
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#ec4899");
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL - 6, `СУНДУК +${reward}`, "#fbbf24", 16, true);
          }
        }
      }

      if (s.helmetFlash > 0) s.helmetFlash = Math.max(0, s.helmetFlash - dt * 1.5);
      if (s.moveAnim < 1) s.moveAnim = Math.min(1, s.moveAnim + dt * 12);
      if (s.digFlash > 0) s.digFlash = Math.max(0, s.digFlash - dt * 6);
      if (s.pickaxeSwing > 0) s.pickaxeSwing = Math.max(0, s.pickaxeSwing - dt * 8);
      if (s.jetpackBurning > 0) s.jetpackBurning = Math.max(0, s.jetpackBurning - dt * 4);
      // Slow jetpack refuel when idle
      if (s.jetpackFuel < 100) s.jetpackFuel = Math.min(100, s.jetpackFuel + dt * 6);
      if (s.shake.life > 0) {
        s.shake.life -= dt;
        if (s.shake.life <= 0) s.shake.mag = 0;
      }
      for (const p of s.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.gravity ?? 380) * dt;
        p.life -= dt * 1.4;
      }
      s.particles = s.particles.filter((p) => p.life > 0);
      for (const f of s.floatTexts) {
        f.y -= 42 * dt;
        f.life -= dt;
      }
      s.floatTexts = s.floatTexts.filter((f) => f.life > 0);
      for (const e of s.embers) {
        e.y -= e.speed * dt;
        e.phase += dt * 2;
        if (e.y < -10) {
          e.y = H + 10;
          e.x = s.rng() * W;
        }
      }
      for (const r of s.godRays) {
        r.phase += dt * 0.5;
      }
      for (const ex of s.explosions) {
        ex.radius += (ex.maxRadius - ex.radius) * Math.min(1, dt * 6);
        ex.life -= dt * 1.5;
      }
      s.explosions = s.explosions.filter((ex) => ex.life > 0);

      draw(canvas, s);

      if (s.alive) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        const finalScore = Math.floor(s.score + s.depth * 3);
        submitEnd(finalScore);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [runState.phase, tick]);

  const submitEnd = useCallback(
    (score: number) => {
      if (runState.phase !== "running") return;
      const s = stateRef.current;
      if (!s) return;
      milestonesRef.current.push({ t: Date.now(), depth: s.depth });
      end(score, {
        milestones: milestonesRef.current,
        meta: { depth: s.depth, crowbars: s.hasCrowbar, gold: s.goldCount, crystals: s.crystalCount, dynamite: s.dynamiteCount, version: "v4" },
      });
    },
    [end, runState.phase],
  );

  useEffect(() => {
    if (runState.phase !== "running") return;
    const handleKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s || !s.alive) return;
      const now = performance.now();
      const code = e.code;
      const k = e.key;
      // Jetpack — Z key, instant (not gated by movement cooldown)
      if (code === "KeyZ" && s.jetpackFuel >= 30 && s.player.row > 0) {
        const target = s.grid[s.player.row - 1]?.[s.player.col];
        if (target !== "X" && target !== undefined) {
          // Triggers death-by-entry rules same as movement
          s.prevPlayerRow = s.player.row;
          s.prevPlayerCol = s.player.col;
          s.moveAnim = 0;
          s.player.row -= 2 > 0 ? 2 : 1; // jump up 2 rows if possible
          if (s.player.row < 0) s.player.row = 0;
          s.jetpackFuel = Math.max(0, s.jetpackFuel - 30);
          s.jetpackBurning = 1.0;
          spawnSparkle(s, s.player.col * CELL + CELL / 2, (s.player.row + 1) * CELL + CELL / 2, "#fbbf24", 6);
          spawnSparkle(s, s.player.col * CELL + CELL / 2, (s.player.row + 2) * CELL + CELL / 2, "#ef4444", 4);
          applyShake(s, 3);
          s.lastInputAt = now;
        }
        e.preventDefault();
        return;
      }
      // Dynamite — V key, deploys at current position then explodes
      if (code === "KeyV" && s.dynamiteCount > 0) {
        s.dynamiteCount -= 1;
        detonateDynamite(s, s.player.col, s.player.row);
        s.lastInputAt = now;
        e.preventDefault();
        return;
      }
      if (now - s.lastInputAt < MOVE_COOLDOWN_MS) return;
      if (code === "KeyA" || k === "ArrowLeft") {
        moveLeft(s, now);
      } else if (code === "KeyD" || k === "ArrowRight") {
        moveRight(s, now);
      } else if (code === "Space" || k === "ArrowDown" || code === "KeyS") {
        digDown(s, now);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [runState.phase]);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const s = stateRef.current;
      if (!s || !s.alive) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width) * W;
      const targetCol = Math.floor(cx / CELL);
      const now = performance.now();
      if (now - s.lastInputAt < MOVE_COOLDOWN_MS) return;
      if (targetCol < s.player.col) moveLeft(s, now);
      else if (targetCol > s.player.col) moveRight(s, now);
      else digDown(s, now);
    },
    [],
  );

  return (
    <GameShell
      game={game}
      runState={runState}
      error={error}
      onStart={start}
      scoreBadge={
        runState.phase === "running" && stateRef.current ? (
          <div className="flex items-center gap-2">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-mono text-sm text-amber-300">
              {Math.floor(stateRef.current.depth)}м · {Math.floor(stateRef.current.score + stateRef.current.depth * 3)}
            </div>
            {stateRef.current.goldCount > 0 && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2 py-1.5 font-mono text-xs text-yellow-300">
                💰{stateRef.current.goldCount}
              </div>
            )}
            {stateRef.current.crystalCount > 0 && (
              <div className="rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-1.5 font-mono text-xs text-purple-300">
                ✦{stateRef.current.crystalCount}
              </div>
            )}
            {stateRef.current.dynamiteCount > 0 && (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 font-mono text-xs text-rose-300">
                💣{stateRef.current.dynamiteCount}
              </div>
            )}
            {stateRef.current.hasHelmet && (
              <div className="rounded-md border border-cyan/40 bg-cyan/10 px-2 py-1.5 font-mono text-xs text-cyan">
                ⛑
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
          onMouseDown={onCanvasClick}
          className="block h-auto w-full touch-none"
          style={{ aspectRatio: `${W} / ${H}` }}
        />
      }
    />
  );
}

function canEnter(t: Tile | undefined): boolean {
  if (t === undefined) return false;
  if (t === "X") return false;
  return true;
}

function moveLeft(s: GameState, now: number) {
  if (s.player.col > 0) {
    const target = s.grid[s.player.row]?.[s.player.col - 1];
    if (canEnter(target)) {
      s.prevPlayerCol = s.player.col;
      s.prevPlayerRow = s.player.row;
      s.moveAnim = 0;
      if (target === "#") {
        s.grid[s.player.row][s.player.col - 1] = " ";
        s.score += 1;
        s.comboDigs += 1;
        s.comboExpireAt = now + 700;
        spawnDirtBurst(s, (s.player.col - 1) * CELL + CELL / 2, s.player.row * CELL + CELL / 2);
        s.digFlash = 1;
        s.pickaxeSwing = 1;
      }
      s.player.col -= 1;
      s.facing = -1;
      s.lastInputAt = now;
    }
  }
}

function moveRight(s: GameState, now: number) {
  if (s.player.col < COLS - 1) {
    const target = s.grid[s.player.row]?.[s.player.col + 1];
    if (canEnter(target)) {
      s.prevPlayerCol = s.player.col;
      s.prevPlayerRow = s.player.row;
      s.moveAnim = 0;
      if (target === "#") {
        s.grid[s.player.row][s.player.col + 1] = " ";
        s.score += 1;
        s.comboDigs += 1;
        s.comboExpireAt = now + 700;
        spawnDirtBurst(s, (s.player.col + 1) * CELL + CELL / 2, s.player.row * CELL + CELL / 2);
        s.digFlash = 1;
        s.pickaxeSwing = 1;
      }
      s.player.col += 1;
      s.facing = 1;
      s.lastInputAt = now;
    }
  }
}

function digDown(s: GameState, now: number) {
  if (s.player.row >= ROWS - 1) return;
  const target = s.grid[s.player.row + 1]?.[s.player.col];
  if (target === "X") {
    if (s.hasCrowbar > 0) {
      s.hasCrowbar -= 1;
      s.grid[s.player.row + 1][s.player.col] = " ";
      s.score += 10;
      spawnSparkle(s, s.player.col * CELL + CELL / 2, (s.player.row + 1) * CELL + CELL / 2, "#fde047");
      applyShake(s, 4);
      s.digFlash = 1;
      s.pickaxeSwing = 1;
      addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+10", "#fde047", 12, true);
    } else {
      return;
    }
  } else if (target === "#") {
    s.grid[s.player.row + 1][s.player.col] = " ";
    s.score += 1;
    s.comboDigs += 1;
    s.comboExpireAt = now + 700;
    if (s.comboDigs === 5) addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "СЕРИЯ x5", "#fb923c", 14, true);
    if (s.comboDigs === 10) {
      addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "СЕРИЯ x10!", "#ef4444", 16, true);
      s.score += 20;
      spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fbbf24");
    }
    spawnDirtBurst(s, s.player.col * CELL + CELL / 2, (s.player.row + 1) * CELL + CELL / 2);
    s.digFlash = 1;
    s.pickaxeSwing = 1;
  }
  s.prevPlayerCol = s.player.col;
  s.prevPlayerRow = s.player.row;
  s.moveAnim = 0;
  s.player.row += 1;
  s.depth += 1;
  s.lastInputAt = now;
}

// ---------------------------------------------------------------------------
// Rendering — smooth vector style with gradients + glow
// ---------------------------------------------------------------------------

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

  const biome = biomeAt(s.depth + s.player.row);
  const pal = BIOME_PALETTE[biome];

  // BG — atmospheric gradient with biome ambient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, pal.ambient);
  bg.addColorStop(0.5, "#0a0508");
  bg.addColorStop(1, pal.ambient);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // God rays (crystal + molten biomes)
  if (pal.godRay && s.depth > 80) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const ray of s.godRays) {
      const x = (ray.x + Math.sin(ray.phase) * 20) % W;
      const grad = ctx.createLinearGradient(x, 0, x + ray.width, H);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, `${pal.godRay}25`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, ray.width, H);
    }
    ctx.restore();
  }

  // Embers (molten biome) — drift upward with glow
  if (biome === "molten") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const e of s.embers) {
      const flicker = 0.5 + Math.sin(e.phase) * 0.5;
      const r = e.size * 2;
      const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      grad.addColorStop(0, `rgba(251, 146, 60, ${flicker * 0.8})`);
      grad.addColorStop(1, "rgba(251, 146, 60, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
    }
    ctx.restore();
  } else if (biome === "crystal") {
    // Twinkles
    for (let i = 0; i < 25; i++) {
      const x = (i * 73 + (s.animTime * 6) % W) % W;
      const y = (i * 53 + s.animTime * 4) % H;
      const tw = (Math.sin(s.animTime * 3 + i) + 1) / 2;
      ctx.fillStyle = `rgba(168, 85, 247, ${0.2 + tw * 0.3})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Tiles
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = s.grid[r]?.[c] ?? " ";
      const x = c * CELL;
      const y = r * CELL;
      if (t === "#") drawDirt(ctx, x, y, c, r, biome);
      else if (t === "X") drawBlocker(ctx, x, y);
      else if (t === "h") drawPipe(ctx, x, y, s.animTime);
      else if (t === "C") drawCamera(ctx, x, y, s.animTime, c, r);
      else if (t === "P") drawCrowbar(ctx, x, y, s.animTime);
      else if (t === "G") drawGold(ctx, x, y, s.animTime);
      else if (t === "M") drawHelmet(ctx, x, y, s.animTime);
      else if (t === "T") drawTreasure(ctx, x, y, s.animTime);
      else if (t === "K") drawCrystal(ctx, x, y, s.animTime, c, r);
      else if (t === "L") drawLava(ctx, x, y, s.animTime, c);
      else if (t === "D") drawDynamite(ctx, x, y, s.animTime);
    }
  }

  // Player torch — strong radial light
  const e = 1 - Math.pow(1 - s.moveAnim, 3);
  const interpCol = s.prevPlayerCol + (s.player.col - s.prevPlayerCol) * e;
  const interpRow = s.prevPlayerRow + (s.player.row - s.prevPlayerRow) * e;
  const px = interpCol * CELL + CELL / 2;
  const py = interpRow * CELL + CELL / 2;
  const torchR = 110 + Math.sin(s.animTime * 6) * 6;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const torch = ctx.createRadialGradient(px, py, 6, px, py, torchR);
  torch.addColorStop(0, "rgba(253, 224, 71, 0.22)");
  torch.addColorStop(0.4, "rgba(253, 224, 71, 0.06)");
  torch.addColorStop(1, "rgba(253, 224, 71, 0)");
  ctx.fillStyle = torch;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Wall-of-death pulse + screen edge
  if (s.ceilingGlow > 0.05) {
    const pulse = 0.5 + Math.sin(s.animTime * 6) * 0.3;
    const grad = ctx.createLinearGradient(0, 0, 0, 80);
    grad.addColorStop(0, `rgba(220, 38, 38, ${0.5 * s.ceilingGlow * pulse})`);
    grad.addColorStop(1, "rgba(220, 38, 38, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 80);
  }

  // Explosions (radial bursts)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const ex of s.explosions) {
    const grad = ctx.createRadialGradient(ex.cx, ex.cy, 0, ex.cx, ex.cy, ex.radius);
    grad.addColorStop(0, `rgba(254, 240, 138, ${ex.life * 0.7})`);
    grad.addColorStop(0.3, `rgba(251, 146, 60, ${ex.life * 0.6})`);
    grad.addColorStop(0.7, `rgba(239, 68, 68, ${ex.life * 0.3})`);
    grad.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ex.cx, ex.cy, ex.radius, 0, Math.PI * 2);
    ctx.fill();
    // Shockwave ring
    ctx.strokeStyle = `rgba(254, 240, 138, ${ex.life * 0.8})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex.cx, ex.cy, ex.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Player
  drawPlayer(ctx, s, interpCol, interpRow);

  // Particles
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of s.particles) {
    const a = Math.max(0, Math.min(1, p.life));
    if (p.glow) {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, "transparent");
      ctx.globalAlpha = a;
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Float texts
  for (const f of s.floatTexts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.font = `bold ${f.size ?? 12}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    if (f.glow) {
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";

  // Depth fog at bottom (deeper = more fog)
  const fogAlpha = Math.min(0.4, s.depth / 1200);
  if (fogAlpha > 0.01) {
    const fog = ctx.createLinearGradient(0, H - 80, 0, H);
    fog.addColorStop(0, "rgba(0, 0, 0, 0)");
    fog.addColorStop(1, `rgba(0, 0, 0, ${fogAlpha})`);
    ctx.fillStyle = fog;
    ctx.fillRect(0, H - 80, W, 80);
  }

  // HUD bar — glassmorphic
  drawHUD(ctx, s, biome, pal);

  // Vignette
  const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.5, W / 2, H / 2, W * 0.8);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.4)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();
}

function drawHUD(ctx: CanvasRenderingContext2D, s: GameState, biome: Biome, pal: typeof BIOME_PALETTE[Biome]) {
  // Top bar with biome
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, W, 32);
  const biomeLabel = biome === "surface" ? "ПОВЕРХН." : biome === "stone" ? "КАМЕНЬ" : biome === "crystal" ? "КРИСТАЛЛЫ" : "ЛАВА";
  ctx.shadowColor = pal.accent;
  ctx.shadowBlur = 6;
  ctx.fillStyle = pal.accent;
  ctx.font = "bold 9px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(biomeLabel, 8, 13);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fde047";
  ctx.font = "bold 12px ui-monospace, monospace";
  ctx.fillText(`⛏ ${Math.floor(s.depth)}м`, 8, 27);
  ctx.fillStyle = "#22d3ee";
  ctx.fillText(`★ ${Math.floor(s.score + s.depth * 3)}`, 110, 27);
  if (s.hasCrowbar > 0) {
    const glow = 0.5 + Math.sin(s.animTime * 8) * 0.5;
    ctx.fillStyle = `rgba(253, 224, 71, ${0.8 + 0.2 * glow})`;
    ctx.fillText(`🪤×${s.hasCrowbar}`, 220, 27);
  }
  // Combo
  if (s.comboDigs >= 3) {
    ctx.fillStyle = `rgba(251, 146, 60, ${0.7 + Math.sin(s.animTime * 10) * 0.3})`;
    ctx.shadowColor = "#fb923c";
    ctx.shadowBlur = 6;
    ctx.fillText(`x${s.comboDigs}`, 290, 27);
    ctx.shadowBlur = 0;
  }
  // Speed bar
  const speedFrac = Math.min(1, (s.scrollSpeed - 1.6) / 4.4);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(W - 110, 25, 100, 4);
  const speedColor = speedFrac < 0.4 ? "#22c55e" : speedFrac < 0.7 ? "#fbbf24" : "#ef4444";
  ctx.fillStyle = speedColor;
  ctx.fillRect(W - 110, 25, 100 * speedFrac, 4);
  ctx.fillStyle = speedColor;
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText(`x${s.scrollSpeed.toFixed(1)}`, W - 110, 17);

  // Bottom HUD — controls + jetpack fuel
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, H - 30, W, 30);
  // Jetpack
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(8, H - 22, 120, 6);
  const fuelFrac = s.jetpackFuel / 100;
  const fuelColor = fuelFrac > 0.3 ? "#22d3ee" : "#dc2626";
  const fuelGrad = ctx.createLinearGradient(8, 0, 128, 0);
  fuelGrad.addColorStop(0, fuelColor);
  fuelGrad.addColorStop(1, fuelColor + "aa");
  ctx.fillStyle = fuelGrad;
  ctx.fillRect(8, H - 22, 120 * fuelFrac, 6);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText("ДЖЕТПАК Z", 8, H - 8);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(`ДИНАМИТ V (${s.dynamiteCount})`, 145, H - 8);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("A/D движение · S/SPACE копать", W - 240, H - 8);
}

// ---------------------------------------------------------------------------
// Smooth vector tile drawing
// ---------------------------------------------------------------------------

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

function drawDirt(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, row: number, biome: Biome) {
  const pal = BIOME_PALETTE[biome];
  // Base with vertical gradient (lit top, dark bottom)
  const grad = ctx.createLinearGradient(x, y, x, y + CELL);
  grad.addColorStop(0, lighten(pal.base, 0.15));
  grad.addColorStop(0.5, pal.base);
  grad.addColorStop(1, pal.dark);
  ctx.fillStyle = grad;
  roundedRect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 3);
  ctx.fill();
  // Pebble noise — stable per cell
  const seed = col * 31 + row * 17;
  const noise = (n: number) => (Math.sin(seed + n) * 43758.5453) % 1;
  for (let i = 0; i < 3; i++) {
    const pxx = x + 3 + Math.abs(noise(i)) * (CELL - 8);
    const pyy = y + 3 + Math.abs(noise(i + 11)) * (CELL - 8);
    ctx.fillStyle = i === 0 ? pal.accent : pal.dark;
    ctx.fillRect(pxx, pyy, 2, 2);
  }
  // Top highlight
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 2);
  ctx.lineTo(x + CELL - 3, y + 2);
  ctx.stroke();
}

function drawBlocker(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Concrete with strong bevel
  const grad = ctx.createLinearGradient(x, y, x, y + CELL);
  grad.addColorStop(0, "#71717a");
  grad.addColorStop(1, "#3f3f46");
  ctx.fillStyle = grad;
  roundedRect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 2);
  ctx.fill();
  // Hatched pattern
  ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
  ctx.lineWidth = 1;
  for (let i = 4; i < CELL - 2; i += 5) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + 2);
    ctx.lineTo(x + i, y + CELL - 2);
    ctx.stroke();
  }
  // Rivets
  ctx.fillStyle = "#27272a";
  ctx.beginPath();
  ctx.arc(x + 4, y + 4, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + CELL - 4, y + 4, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 4, y + CELL - 4, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + CELL - 4, y + CELL - 4, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Highlight
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 3);
  ctx.lineTo(x + CELL - 3, y + 3);
  ctx.stroke();
}

function drawPipe(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.6 + Math.sin(t * 4 + x) * 0.4;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Glow halo
  const haloGrad = ctx.createRadialGradient(x + CELL / 2, y + CELL / 2, 0, x + CELL / 2, y + CELL / 2, CELL);
  haloGrad.addColorStop(0, `rgba(239, 68, 68, ${pulse * 0.5})`);
  haloGrad.addColorStop(1, "rgba(239, 68, 68, 0)");
  ctx.fillStyle = haloGrad;
  ctx.fillRect(x - 4, y - 4, CELL + 8, CELL + 8);
  ctx.restore();
  // Pipe body — rounded
  const pipeGrad = ctx.createLinearGradient(x, y, x, y + CELL);
  pipeGrad.addColorStop(0, "#dc2626");
  pipeGrad.addColorStop(0.5, "#7f1d1d");
  pipeGrad.addColorStop(1, "#450a0a");
  ctx.fillStyle = pipeGrad;
  roundedRect(ctx, x + 4, y + 2, CELL - 8, CELL - 4, 4);
  ctx.fill();
  // Hot core
  ctx.fillStyle = `rgba(254, 240, 138, ${pulse})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 4 + pulse * 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Bolts on each side
  ctx.fillStyle = "#27272a";
  ctx.fillRect(x + 3, y + 6, 2, 4);
  ctx.fillRect(x + 3, y + CELL - 10, 2, 4);
  ctx.fillRect(x + CELL - 5, y + 6, 2, 4);
  ctx.fillRect(x + CELL - 5, y + CELL - 10, 2, 4);
}

function drawCamera(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, col: number, row: number) {
  // Mount
  ctx.fillStyle = "#1f1f23";
  roundedRect(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 4);
  ctx.fill();
  // Sweep cone (animated)
  const sweep = Math.sin(t * 1.5 + col + row) * 0.4;
  ctx.save();
  ctx.translate(x + CELL / 2, y + CELL / 2);
  ctx.rotate(sweep);
  ctx.globalCompositeOperation = "lighter";
  const coneGrad = ctx.createRadialGradient(0, 0, 4, 0, 16, 16);
  coneGrad.addColorStop(0, "rgba(250, 204, 21, 0.5)");
  coneGrad.addColorStop(1, "rgba(250, 204, 21, 0)");
  ctx.fillStyle = coneGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 16, 14, Math.PI * 0.6, Math.PI * 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Eye lens
  const blink = (Math.sin(t * 3 + col + row) + 1) / 2 > 0.85 ? 0.4 : 1;
  ctx.fillStyle = `rgba(250, 204, 21, ${blink})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2 - 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(220, 38, 38, ${blink})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2 - 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2 - 2, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrowbar(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.5 + Math.sin(t * 6) * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(x + CELL / 2, y + CELL / 2, 0, x + CELL / 2, y + CELL / 2, 14);
  halo.addColorStop(0, `rgba(253, 224, 71, ${0.35 + pulse * 0.25})`);
  halo.addColorStop(1, "rgba(253, 224, 71, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(x - 4, y - 4, CELL + 8, CELL + 8);
  ctx.restore();
  // Bar
  const barGrad = ctx.createLinearGradient(x + CELL / 2 - 2, y, x + CELL / 2 + 2, y);
  barGrad.addColorStop(0, "#fbbf24");
  barGrad.addColorStop(0.5, "#facc15");
  barGrad.addColorStop(1, "#a16207");
  ctx.fillStyle = barGrad;
  roundedRect(ctx, x + CELL / 2 - 2, y + 4, 4, CELL - 8, 2);
  ctx.fill();
  // Hooked end
  ctx.fillStyle = "#a16207";
  ctx.fillRect(x + CELL / 2 - 5, y + CELL - 9, 10, 4);
  // Highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fillRect(x + CELL / 2 - 1, y + 5, 1, CELL - 12);
}

function drawGold(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.5 + Math.sin(t * 5) * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(x + CELL / 2, y + CELL / 2, 0, x + CELL / 2, y + CELL / 2, 14);
  halo.addColorStop(0, `rgba(251, 191, 36, ${0.35 + pulse * 0.3})`);
  halo.addColorStop(1, "rgba(251, 191, 36, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(x - 4, y - 4, CELL + 8, CELL + 8);
  ctx.restore();
  // Diamond nugget
  const nugGrad = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
  nugGrad.addColorStop(0, "#fde047");
  nugGrad.addColorStop(0.5, "#fbbf24");
  nugGrad.addColorStop(1, "#a16207");
  ctx.fillStyle = nugGrad;
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2, y + 6);
  ctx.lineTo(x + CELL - 6, y + CELL / 2);
  ctx.lineTo(x + CELL / 2, y + CELL - 6);
  ctx.lineTo(x + 6, y + CELL / 2);
  ctx.closePath();
  ctx.fill();
  // Inner highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2, y + 8);
  ctx.lineTo(x + CELL - 8, y + CELL / 2 - 1);
  ctx.lineTo(x + CELL / 2, y + CELL / 2 - 1);
  ctx.closePath();
  ctx.fill();
}

function drawHelmet(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.6 + Math.sin(t * 4) * 0.4;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(x + CELL / 2, y + CELL / 2, 0, x + CELL / 2, y + CELL / 2, 13);
  halo.addColorStop(0, `rgba(103, 232, 249, ${0.35 + pulse * 0.25})`);
  halo.addColorStop(1, "rgba(103, 232, 249, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(x - 4, y - 4, CELL + 8, CELL + 8);
  ctx.restore();
  // Dome
  const helmGrad = ctx.createRadialGradient(x + CELL / 2, y + CELL - 8, 2, x + CELL / 2, y + CELL - 8, 10);
  helmGrad.addColorStop(0, "#67e8f9");
  helmGrad.addColorStop(1, "#0e7490");
  ctx.fillStyle = helmGrad;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2 + 2, 7, Math.PI, Math.PI * 2);
  ctx.fill();
  // Brim
  ctx.fillStyle = "#0e7490";
  ctx.fillRect(x + CELL / 2 - 9, y + CELL / 2 + 1, 18, 3);
  // Lamp glint
  ctx.fillStyle = "#a5f3fc";
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2 - 4, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawTreasure(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.6 + Math.sin(t * 3) * 0.4;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(x + CELL / 2, y + CELL / 2, 0, x + CELL / 2, y + CELL / 2, 20);
  halo.addColorStop(0, `rgba(251, 191, 36, ${pulse * 0.55})`);
  halo.addColorStop(1, "rgba(251, 191, 36, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(x - 6, y - 6, CELL + 12, CELL + 12);
  ctx.restore();
  // Chest body
  const bodyGrad = ctx.createLinearGradient(x, y, x, y + CELL);
  bodyGrad.addColorStop(0, "#9a3412");
  bodyGrad.addColorStop(1, "#451a03");
  ctx.fillStyle = bodyGrad;
  roundedRect(ctx, x + 3, y + 8, CELL - 6, CELL - 11, 3);
  ctx.fill();
  // Lid highlight
  ctx.fillStyle = "rgba(255, 200, 100, 0.4)";
  roundedRect(ctx, x + 3, y + 8, CELL - 6, 4, 2);
  ctx.fill();
  // Lock
  const lockGrad = ctx.createLinearGradient(0, y + 12, 0, y + 18);
  lockGrad.addColorStop(0, "#fde047");
  lockGrad.addColorStop(1, "#a16207");
  ctx.fillStyle = lockGrad;
  ctx.fillRect(x + CELL / 2 - 2, y + 12, 4, 6);
  ctx.fillStyle = "#000";
  ctx.fillRect(x + CELL / 2 - 1, y + 14, 2, 2);
  // Orbiting sparkles
  for (let i = 0; i < 3; i++) {
    const a = t * 2 + (i * Math.PI * 2) / 3;
    const sx = x + CELL / 2 + Math.cos(a) * 11;
    const sy = y + CELL / 2 - 4 + Math.sin(a) * 5;
    ctx.fillStyle = `rgba(254, 240, 138, ${pulse})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, col: number, row: number) {
  const seed = col * 7 + row * 13;
  const pulse = 0.5 + Math.sin(t * 4 + seed) * 0.5;
  const hue = (t * 30 + seed * 47) % 360;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(x + CELL / 2, y + CELL / 2, 0, x + CELL / 2, y + CELL / 2, 16);
  halo.addColorStop(0, `hsla(${hue}, 80%, 65%, ${0.35 + pulse * 0.25})`);
  halo.addColorStop(1, `hsla(${hue}, 80%, 65%, 0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(x - 6, y - 6, CELL + 12, CELL + 12);
  ctx.restore();
  // Faceted crystal
  ctx.fillStyle = `hsl(${hue}, 80%, 65%)`;
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2, y + 4);
  ctx.lineTo(x + CELL - 5, y + CELL / 2 - 2);
  ctx.lineTo(x + CELL - 6, y + CELL / 2 + 4);
  ctx.lineTo(x + CELL / 2, y + CELL - 4);
  ctx.lineTo(x + 6, y + CELL / 2 + 4);
  ctx.lineTo(x + 5, y + CELL / 2 - 2);
  ctx.closePath();
  ctx.fill();
  // Highlight facet
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2, y + 4);
  ctx.lineTo(x + CELL - 5, y + CELL / 2 - 2);
  ctx.lineTo(x + CELL / 2, y + CELL / 2 - 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2 - 2, y + 8, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawLava(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, col: number) {
  const wobble = Math.sin(t * 5 + col) * 2;
  // Glow
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(x + CELL / 2, y + CELL / 2, 0, x + CELL / 2, y + CELL / 2, 16);
  halo.addColorStop(0, "rgba(251, 146, 60, 0.45)");
  halo.addColorStop(1, "rgba(251, 146, 60, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(x - 4, y - 4, CELL + 8, CELL + 8);
  ctx.restore();
  // Pool
  const grad = ctx.createLinearGradient(0, y, 0, y + CELL);
  grad.addColorStop(0, "#fde047");
  grad.addColorStop(0.3, "#fbbf24");
  grad.addColorStop(0.7, "#ea580c");
  grad.addColorStop(1, "#7c2d12");
  ctx.fillStyle = grad;
  roundedRect(ctx, x + 2, y + 4 + wobble, CELL - 4, CELL - 6, 3);
  ctx.fill();
  // Bubbles
  for (let i = 0; i < 2; i++) {
    const phase = (t * 2 + col * 0.3 + i * Math.PI) % (Math.PI * 2);
    if (phase < Math.PI) {
      const by = y + CELL - 6 - Math.sin(phase) * 8;
      const bx = x + 6 + (i * 8);
      ctx.fillStyle = "rgba(254, 240, 138, 0.7)";
      ctx.beginPath();
      ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Top rim shimmer
  ctx.fillStyle = "rgba(254, 240, 138, 0.5)";
  ctx.fillRect(x + 2, y + 4 + wobble, CELL - 4, 1);
}

function drawDynamite(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.5 + Math.sin(t * 8) * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(x + CELL / 2, y + CELL / 2, 0, x + CELL / 2, y + CELL / 2, 13);
  halo.addColorStop(0, `rgba(239, 68, 68, ${0.3 + pulse * 0.3})`);
  halo.addColorStop(1, "rgba(239, 68, 68, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(x - 4, y - 4, CELL + 8, CELL + 8);
  ctx.restore();
  // Stick body — red rounded
  const bodyGrad = ctx.createLinearGradient(x, y + 8, x, y + CELL);
  bodyGrad.addColorStop(0, "#ef4444");
  bodyGrad.addColorStop(0.5, "#dc2626");
  bodyGrad.addColorStop(1, "#7f1d1d");
  ctx.fillStyle = bodyGrad;
  roundedRect(ctx, x + 6, y + 10, CELL - 12, CELL - 14, 2);
  ctx.fill();
  // Label stripe
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(x + 6, y + CELL / 2 + 2, CELL - 12, 2);
  // Fuse
  ctx.strokeStyle = "#92400e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2, y + 10);
  ctx.quadraticCurveTo(x + CELL / 2 + 4, y + 6, x + CELL / 2 + 6, y + 4);
  ctx.stroke();
  // Spark
  const sparkSize = 2 + pulse * 2;
  ctx.fillStyle = `rgba(254, 240, 138, ${pulse})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2 + 6, y + 4, sparkSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(254, 240, 138, ${pulse * 0.6})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2 + 6, y + 4, sparkSize + 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState, interpCol: number, interpRow: number) {
  const px = interpCol * CELL;
  const py = interpRow * CELL;
  const swing = s.pickaxeSwing;
  const animBob = Math.sin(s.animTime * 6) * 0.5;

  // Helmet save flash — ring of light
  if (s.helmetFlash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createRadialGradient(px + CELL / 2, py + CELL / 2, 4, px + CELL / 2, py + CELL / 2, 30);
    grad.addColorStop(0, `rgba(253, 224, 71, ${s.helmetFlash * 0.7})`);
    grad.addColorStop(1, "rgba(253, 224, 71, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(px - 14, py - 14, CELL + 28, CELL + 28);
    ctx.restore();
  }

  // Jetpack flame — drawn under the player
  if (s.jetpackBurning > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const flameH = 12 * s.jetpackBurning;
    const fGrad = ctx.createLinearGradient(0, py + CELL, 0, py + CELL + flameH);
    fGrad.addColorStop(0, "rgba(254, 240, 138, 0.9)");
    fGrad.addColorStop(0.5, "rgba(251, 146, 60, 0.7)");
    fGrad.addColorStop(1, "rgba(239, 68, 68, 0)");
    ctx.fillStyle = fGrad;
    ctx.beginPath();
    ctx.moveTo(px + 6, py + CELL - 2);
    ctx.quadraticCurveTo(px + CELL / 2, py + CELL + flameH, px + CELL - 6, py + CELL - 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(px + CELL / 2, py + CELL - 2, CELL / 2 - 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body — rounded with gradient
  const bodyGrad = ctx.createLinearGradient(px, py, px, py + CELL);
  bodyGrad.addColorStop(0, "#67e8f9");
  bodyGrad.addColorStop(1, "#0e7490");
  ctx.fillStyle = bodyGrad;
  roundedRect(ctx, px + 5, py + 8 + animBob, CELL - 10, CELL - 12, 3);
  ctx.fill();
  // Boots
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(px + 6, py + CELL - 4 + animBob, 5, 3);
  ctx.fillRect(px + CELL - 11, py + CELL - 4 + animBob, 5, 3);

  // Head
  ctx.fillStyle = "#f5e8d4";
  roundedRect(ctx, px + 8, py + 5 + animBob, CELL - 16, 6, 2);
  ctx.fill();
  // Eye dot
  ctx.fillStyle = "#0a0508";
  const eyeX = s.facing > 0 ? px + CELL - 11 : px + 9;
  ctx.fillRect(eyeX, py + 7 + animBob, 2, 2);

  // Helmet — golden when default, cyan when bonus
  const helmGrad = ctx.createLinearGradient(0, py + 2, 0, py + 6);
  helmGrad.addColorStop(0, s.hasHelmet ? "#67e8f9" : "#facc15");
  helmGrad.addColorStop(1, s.hasHelmet ? "#0e7490" : "#a16207");
  ctx.fillStyle = helmGrad;
  roundedRect(ctx, px + 7, py + 2 + animBob, CELL - 14, 3, 1.5);
  ctx.fill();
  // Headlamp glow
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(253, 224, 71, 0.4)";
  ctx.beginPath();
  ctx.arc(px + CELL / 2 + (s.facing > 0 ? 4 : -4), py + 4 + animBob, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = s.hasHelmet ? "#a5f3fc" : "#fef9c3";
  ctx.fillRect(px + CELL / 2 - 1, py + 1 + animBob, 2, 2);

  // Pickaxe swings
  const swingAngle = swing > 0 ? swing * Math.PI * 0.35 : 0;
  const handAtX = px + CELL / 2 + s.facing * 6;
  const handAtY = py + 16 + animBob;
  ctx.save();
  ctx.translate(handAtX, handAtY);
  ctx.rotate(s.facing * swingAngle);
  ctx.fillStyle = "#92400e";
  ctx.fillRect(0, -1, s.facing * 8, 2);
  const headGrad = ctx.createLinearGradient(s.facing * 6, -3, s.facing * 10, 3);
  headGrad.addColorStop(0, "#a3a3a3");
  headGrad.addColorStop(1, "#525252");
  ctx.fillStyle = headGrad;
  ctx.fillRect(s.facing * 6, -3, s.facing * 4, 6);
  ctx.restore();

  // Dig flash
  if (s.digFlash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(253, 224, 71, ${s.digFlash * 0.5})`;
    ctx.fillRect(px, py, CELL, CELL);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Color utility
// ---------------------------------------------------------------------------

function lighten(hex: string, t: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * t);
  const lg = Math.round(g + (255 - g) * t);
  const lb = Math.round(b + (255 - b) * t);
  return `rgb(${lr}, ${lg}, ${lb})`;
}
