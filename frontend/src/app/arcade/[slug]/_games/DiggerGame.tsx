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

type Tile = " " | "#" | "h" | "P" | "C" | "X" | "G" | "M" | "T" | "K" | "L";
// " " empty / "#" dirt / "h" pipe-steam (lethal) / "P" crowbar / "C" camera (lethal)
// "X" concrete / "G" gold / "M" helmet / "T" treasure chest
// "K" crystal (rare, +100 score) / "L" lava (lethal, melts crowbar)

type Biome = "surface" | "stone" | "crystal" | "molten";

function biomeAt(depth: number): Biome {
  if (depth < 40) return "surface";
  if (depth < 120) return "stone";
  if (depth < 220) return "crystal";
  return "molten";
}

const BIOME_DIRT: Record<Biome, [string, string, string]> = {
  // [base, dark, pebble]
  surface: ["#4a2c1a", "#3a2010", "#92400e"],
  stone: ["#3f3f46", "#27272a", "#52525b"],
  crystal: ["#312e81", "#1e1b4b", "#7c3aed"],
  molten: ["#7c2d12", "#451a03", "#dc2626"],
};

const BIOME_BG_TOP: Record<Biome, string> = {
  surface: "#1a0a14",
  stone: "#0a0a14",
  crystal: "#1a0a2a",
  molten: "#2a0608",
};

const BIOME_BG_BOTTOM: Record<Biome, string> = {
  surface: "#0a0508",
  stone: "#050508",
  crystal: "#0a0414",
  molten: "#1a0204",
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
  gravity?: number;
};

type FloatText = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  size?: number;
};

type Shake = { mag: number; life: number };

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
  shake: Shake;
  rng: () => number;
  animTime: number;
  ceilingGlow: number;
  nextTreasureDepth: number;
  comboDigs: number;
  comboExpireAt: number;
  hitstop: number;
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
  // Crystal more common in crystal biome
  const crystalP = biome === "crystal" ? 0.020 : 0.004;
  // Lava only in molten biome
  const lavaP = biome === "molten" ? Math.min(0.08, 0.01 + (depth - 220) / 4000) : 0;
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
      pick(goldP, "G") ??
      pick(blockerP, "X") ??
      pick(dirtP, "#");
    t = x ?? " ";
    if (t === " " || t === "P" || t === "M" || t === "G" || t === "K") {
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
  const [base, dark] = BIOME_DIRT[biomeAt(s.depth + s.player.row)];
  for (let i = 0; i < 10; i++) {
    s.particles.push({
      x: cx + (s.rng() - 0.5) * 6,
      y: cy + (s.rng() - 0.5) * 6,
      vx: (s.rng() - 0.5) * 200,
      vy: -s.rng() * 160 - 30,
      life: 0.5 + s.rng() * 0.4,
      color: s.rng() < 0.5 ? base : dark,
      size: 2 + Math.floor(s.rng() * 2),
    });
  }
}

function spawnSparkle(s: GameState, cx: number, cy: number, color: string) {
  for (let i = 0; i < 10; i++) {
    const a = s.rng() * Math.PI * 2;
    const sp = 80 + s.rng() * 80;
    s.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.4 + s.rng() * 0.4,
      color,
      size: 2,
    });
  }
}

function spawnPuff(s: GameState, cx: number, cy: number, color: string) {
  for (let i = 0; i < 14; i++) {
    s.particles.push({
      x: cx,
      y: cy,
      vx: (s.rng() - 0.5) * 240,
      vy: (s.rng() - 0.5) * 240,
      life: 0.5 + s.rng() * 0.6,
      color,
      size: 3,
    });
  }
}

function spawnCrystalShatter(s: GameState, cx: number, cy: number) {
  // 7 colors of the rainbow
  const colors = ["#22d3ee", "#a855f7", "#ec4899", "#f43f5e", "#fbbf24", "#84cc16", "#06b6d4"];
  for (let i = 0; i < 24; i++) {
    const a = s.rng() * Math.PI * 2;
    const sp = 120 + s.rng() * 140;
    s.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.7 + s.rng() * 0.5,
      color: colors[Math.floor(s.rng() * colors.length)],
      size: 2 + Math.floor(s.rng() * 2),
    });
  }
}

function addFloat(s: GameState, x: number, y: number, text: string, color: string, size = 12) {
  s.floatTexts.push({ x, y, text, color, life: 1.0, size });
}

function applyShake(s: GameState, mag: number) {
  s.shake.mag = Math.max(s.shake.mag, mag);
  s.shake.life = 0.4;
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
    for (let i = 0; i < 30; i++) {
      embers.push({
        x: rng() * W,
        y: rng() * H,
        size: 1 + rng() * 2,
        speed: 10 + rng() * 20,
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
      shake: { mag: 0, life: 0 },
      rng,
      animTime: 0,
      ceilingGlow: 0,
      nextTreasureDepth: 25,
      comboDigs: 0,
      comboExpireAt: 0,
      hitstop: 0,
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
      const dt = s.hitstop > 0 ? dt0 * 0.2 : dt0;
      if (s.hitstop > 0) s.hitstop = Math.max(0, s.hitstop - dt0);

      // Combo decay
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
            applyShake(s, 12);
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
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ЗАСЁК", "#fca5a5", 14);
          } else if (cell === "h") {
            if (s.hasHelmet) {
              s.hasHelmet = false;
              s.helmetFlash = 1.0;
              s.grid[s.player.row][s.player.col] = " ";
              applyShake(s, 6);
              spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
              addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ШЛЕМ!", "#fde047", 14);
            } else {
              s.alive = false;
              applyShake(s, 8);
              spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#f59e0b");
              addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ПАР", "#fde047", 14);
            }
          } else if (cell === "L") {
            // Lava — kills even with helmet; melts crowbars
            s.alive = false;
            applyShake(s, 14);
            spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#dc2626");
            spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fbbf24");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ЛАВА", "#ef4444", 16);
          } else if (cell === "P") {
            s.hasCrowbar += 1;
            s.grid[s.player.row][s.player.col] = " ";
            s.score += 25;
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+ЛОМ", "#fde047", 12);
          } else if (cell === "G") {
            s.goldCount += 1;
            s.score += 50;
            s.grid[s.player.row][s.player.col] = " ";
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+50", "#fbbf24", 12);
          } else if (cell === "K") {
            s.crystalCount += 1;
            s.score += 100;
            s.grid[s.player.row][s.player.col] = " ";
            spawnCrystalShatter(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2);
            applyShake(s, 4);
            s.hitstop = 0.06;
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL - 4, "✦ КРИСТАЛЛ +100", "#c084fc", 14);
          } else if (cell === "M") {
            s.hasHelmet = true;
            s.grid[s.player.row][s.player.col] = " ";
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#22d3ee");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+ШЛЕМ", "#67e8f9", 12);
          } else if (cell === "T") {
            const reward = 200 + Math.floor(s.depth / 10) * 20;
            s.score += reward;
            s.goldCount += 5;
            s.grid[s.player.row][s.player.col] = " ";
            applyShake(s, 8);
            s.hitstop = 0.1;
            spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fbbf24");
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#ec4899");
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL - 6, `СУНДУК +${reward}`, "#fbbf24", 16);
          }
        }
      }

      if (s.helmetFlash > 0) s.helmetFlash = Math.max(0, s.helmetFlash - dt * 1.5);
      if (s.moveAnim < 1) s.moveAnim = Math.min(1, s.moveAnim + dt * 12);
      if (s.digFlash > 0) s.digFlash = Math.max(0, s.digFlash - dt * 6);
      if (s.pickaxeSwing > 0) s.pickaxeSwing = Math.max(0, s.pickaxeSwing - dt * 8);
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
      // Embers drift up (only in molten biome)
      for (const e of s.embers) {
        e.y -= e.speed * dt;
        e.phase += dt * 2;
        if (e.y < -10) {
          e.y = H + 10;
          e.x = s.rng() * W;
        }
      }

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
        meta: { depth: s.depth, crowbars: s.hasCrowbar, gold: s.goldCount, crystals: s.crystalCount, version: "v3" },
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
      if (now - s.lastInputAt < MOVE_COOLDOWN_MS) return;
      const code = e.code;
      const k = e.key;
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
            {stateRef.current.hasHelmet && (
              <div className="rounded-md border border-cyan/40 bg-cyan/10 px-2 py-1.5 font-mono text-xs text-cyan">
                ⛑
              </div>
            )}
            {stateRef.current.comboDigs >= 3 && (
              <div className="rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1.5 font-mono text-xs text-orange-300">
                ×{stateRef.current.comboDigs}
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
          style={{ aspectRatio: `${W} / ${H}`, imageRendering: "pixelated" }}
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
      addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+10", "#fde047", 12);
    } else {
      return;
    }
  } else if (target === "#") {
    s.grid[s.player.row + 1][s.player.col] = " ";
    s.score += 1;
    s.comboDigs += 1;
    s.comboExpireAt = now + 700;
    if (s.comboDigs === 5) addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "СЕРИЯ x5", "#fb923c", 14);
    if (s.comboDigs === 10) {
      addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "СЕРИЯ x10!", "#ef4444", 16);
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
// Drawing
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
  // BG gradient based on biome
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, BIOME_BG_TOP[biome]);
  bg.addColorStop(0.5, "#0a0508");
  bg.addColorStop(1, BIOME_BG_BOTTOM[biome]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Embers (molten biome)
  if (biome === "molten") {
    for (const e of s.embers) {
      const flicker = 0.5 + Math.sin(e.phase) * 0.5;
      ctx.fillStyle = `rgba(251, 146, 60, ${flicker * 0.6})`;
      ctx.fillRect(e.x, e.y, e.size, e.size);
    }
  } else if (biome === "crystal") {
    // Faint star field
    for (let i = 0; i < 20; i++) {
      const x = (i * 73 + (s.animTime * 6) % W) % W;
      const y = (i * 53) % H;
      ctx.fillStyle = `rgba(168, 85, 247, ${0.2 + (i % 3) * 0.1})`;
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
      else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
        ctx.fillRect(x, y, CELL, CELL);
      }
    }
  }

  // Player torch glow (a soft radial light around the player)
  const e = 1 - Math.pow(1 - s.moveAnim, 3);
  const interpCol = s.prevPlayerCol + (s.player.col - s.prevPlayerCol) * e;
  const interpRow = s.prevPlayerRow + (s.player.row - s.prevPlayerRow) * e;
  const px = interpCol * CELL + CELL / 2;
  const py = interpRow * CELL + CELL / 2;
  const torchR = 90 + Math.sin(s.animTime * 6) * 4;
  const torch = ctx.createRadialGradient(px, py, 8, px, py, torchR);
  torch.addColorStop(0, "rgba(253, 224, 71, 0.18)");
  torch.addColorStop(0.6, "rgba(253, 224, 71, 0.04)");
  torch.addColorStop(1, "rgba(253, 224, 71, 0)");
  ctx.fillStyle = torch;
  ctx.fillRect(0, 0, W, H);

  // Wall-of-death pulse
  if (s.ceilingGlow > 0.05) {
    const pulse = 0.5 + Math.sin(s.animTime * 6) * 0.3;
    const grad = ctx.createLinearGradient(0, 0, 0, 80);
    grad.addColorStop(0, `rgba(220, 38, 38, ${0.4 * s.ceilingGlow * pulse})`);
    grad.addColorStop(1, "rgba(220, 38, 38, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 80);
  }

  // Player
  drawPlayer(ctx, s, interpCol, interpRow);

  // Particles
  for (const p of s.particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // Float texts with subtle shadow
  for (const f of s.floatTexts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.font = `bold ${f.size ?? 12}px monospace`;
    ctx.textAlign = "center";
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";

  // HUD bar
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, W, 28);
  // Biome badge
  const biomeLabel = biome === "surface" ? "ПОВЕРХН." : biome === "stone" ? "КАМЕНЬ" : biome === "crystal" ? "КРИСТАЛЛЫ" : "ЛАВА";
  const biomeColor = biome === "surface" ? "#92400e" : biome === "stone" ? "#a3a3a3" : biome === "crystal" ? "#a855f7" : "#ef4444";
  ctx.fillStyle = biomeColor;
  ctx.font = "bold 9px monospace";
  ctx.fillText(biomeLabel, 6, 12);
  ctx.fillStyle = "#fde047";
  ctx.font = "bold 12px monospace";
  ctx.fillText(`⛏ ${Math.floor(s.depth)}м`, 6, 24);
  ctx.fillStyle = "#22d3ee";
  ctx.fillText(`★ ${Math.floor(s.score + s.depth * 3)}`, 110, 24);
  if (s.hasCrowbar > 0) {
    const glow = 0.5 + Math.sin(s.animTime * 8) * 0.5;
    ctx.fillStyle = `rgba(253, 224, 71, ${0.8 + 0.2 * glow})`;
    ctx.fillText(`🪤×${s.hasCrowbar}`, 220, 24);
  }
  // Speed bar
  const speedFrac = Math.min(1, (s.scrollSpeed - 1.6) / 4.4);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(W - 110, 22, 100, 3);
  ctx.fillStyle = `hsl(${120 - speedFrac * 120}, 70%, 55%)`;
  ctx.fillRect(W - 110, 22, 100 * speedFrac, 3);

  ctx.restore();
}

function drawDirt(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, row: number, biome: Biome) {
  const [base, dark, pebble] = BIOME_DIRT[biome];
  ctx.fillStyle = base;
  ctx.fillRect(x, y, CELL, CELL);
  const seed = col * 31 + row * 17;
  const noise = (n: number) => (Math.sin(seed + n) * 43758.5453) % 1;
  for (let i = 0; i < 3; i++) {
    const pxx = x + 2 + Math.abs(noise(i)) * (CELL - 4);
    const pyy = y + 2 + Math.abs(noise(i + 11)) * (CELL - 4);
    ctx.fillStyle = i === 0 ? pebble : dark;
    ctx.fillRect(pxx, pyy, 2, 2);
  }
  ctx.fillStyle = "rgba(255, 200, 150, 0.05)";
  ctx.fillRect(x, y, CELL, 2);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
}

function drawBlocker(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#525252";
  ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = "#3f3f3f";
  for (let i = 0; i < CELL; i += 6) {
    ctx.fillRect(x + i, y, 2, CELL);
  }
  ctx.fillStyle = "#404040";
  ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
  ctx.strokeStyle = "#262626";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
  // Rivets
  ctx.fillStyle = "#262626";
  ctx.fillRect(x + 3, y + 3, 2, 2);
  ctx.fillRect(x + CELL - 5, y + 3, 2, 2);
  ctx.fillRect(x + 3, y + CELL - 5, 2, 2);
  ctx.fillRect(x + CELL - 5, y + CELL - 5, 2, 2);
}

function drawPipe(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.6 + Math.sin(t * 4 + x) * 0.4;
  // Pipe body
  ctx.fillStyle = "#7f1d1d";
  ctx.fillRect(x + 4, y + 2, CELL - 8, CELL - 4);
  // Hot core
  ctx.fillStyle = `rgba(220, 38, 38, ${pulse})`;
  ctx.fillRect(x + 6, y + 6, CELL - 12, CELL - 12);
  // Bright center
  ctx.fillStyle = `rgba(254, 240, 138, ${pulse * 0.5})`;
  ctx.fillRect(x + CELL / 2 - 2, y + CELL / 2 - 2, 4, 4);
  // Steam clouds
  ctx.fillStyle = `rgba(253, 224, 71, ${pulse * 0.25})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 9 + pulse * 2, 0, Math.PI * 2);
  ctx.fill();
  // Edge bolts
  ctx.fillStyle = "#451a03";
  ctx.fillRect(x + 3, y + 6, 2, 4);
  ctx.fillRect(x + 3, y + CELL - 10, 2, 4);
  ctx.fillRect(x + CELL - 5, y + 6, 2, 4);
  ctx.fillRect(x + CELL - 5, y + CELL - 10, 2, 4);
}

function drawCamera(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, col: number, row: number) {
  ctx.fillStyle = "#1a1014";
  ctx.fillRect(x, y, CELL, CELL);
  // Bracket/mount
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(x + 4, y + CELL - 5, CELL - 8, 4);
  // Eye
  const blink = (Math.sin(t * 3 + col + row) + 1) / 2 > 0.85 ? 0.3 : 1;
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
  // Scanning cone
  const sweep = Math.sin(t * 1.5 + col) * 0.3;
  ctx.save();
  ctx.translate(x + CELL / 2, y + CELL / 2);
  ctx.rotate(sweep);
  ctx.fillStyle = `rgba(250, 204, 21, ${blink * 0.12})`;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-10, 14);
  ctx.lineTo(10, 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCrowbar(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.5 + Math.sin(t * 6) * 0.5;
  ctx.fillStyle = `rgba(253, 224, 71, ${0.12 + pulse * 0.2})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#facc15";
  ctx.fillRect(x + CELL / 2 - 2, y + 4, 4, CELL - 8);
  ctx.fillStyle = "#a16207";
  ctx.fillRect(x + CELL / 2 - 5, y + CELL - 9, 10, 4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fillRect(x + CELL / 2 - 1, y + 5, 1, CELL - 12);
}

function drawGold(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.5 + Math.sin(t * 5) * 0.5;
  ctx.fillStyle = `rgba(251, 191, 36, ${0.15 + pulse * 0.25})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 11, 0, Math.PI * 2);
  ctx.fill();
  // Nugget — diamond shape
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2, y + 6);
  ctx.lineTo(x + CELL - 6, y + CELL / 2);
  ctx.lineTo(x + CELL / 2, y + CELL - 6);
  ctx.lineTo(x + 6, y + CELL / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2, y + 9);
  ctx.lineTo(x + CELL - 9, y + CELL / 2);
  ctx.lineTo(x + CELL / 2, y + CELL / 2 - 2);
  ctx.closePath();
  ctx.fill();
}

function drawHelmet(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.6 + Math.sin(t * 4) * 0.4;
  ctx.fillStyle = `rgba(103, 232, 249, ${0.15 + pulse * 0.2})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#22d3ee";
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2 + 2, 7, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0e7490";
  ctx.fillRect(x + CELL / 2 - 9, y + CELL / 2 + 1, 18, 3);
  ctx.fillStyle = "#a5f3fc";
  ctx.fillRect(x + CELL / 2 - 1, y + CELL / 2 - 5, 2, 2);
}

function drawTreasure(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.6 + Math.sin(t * 3) * 0.4;
  ctx.fillStyle = `rgba(251, 191, 36, ${pulse * 0.45})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7c2d12";
  ctx.fillRect(x + 3, y + 8, CELL - 6, CELL - 11);
  ctx.fillStyle = "#9a3412";
  ctx.fillRect(x + 3, y + 8, CELL - 6, 7);
  ctx.fillStyle = "#451a03";
  ctx.fillRect(x + 3, y + 13, CELL - 6, 2);
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(x + CELL / 2 - 2, y + 12, 4, 6);
  ctx.fillStyle = "#000";
  ctx.fillRect(x + CELL / 2 - 1, y + 14, 2, 2);
  // Sparkles orbit
  for (let i = 0; i < 3; i++) {
    const a = t * 2 + (i * Math.PI * 2) / 3;
    const sx = x + CELL / 2 + Math.cos(a) * 10;
    const sy = y + CELL / 2 - 4 + Math.sin(a) * 5;
    ctx.fillStyle = `rgba(254, 240, 138, ${pulse})`;
    ctx.fillRect(sx - 1, sy - 1, 2, 2);
  }
}

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, col: number, row: number) {
  const seed = col * 7 + row * 13;
  const pulse = 0.5 + Math.sin(t * 4 + seed) * 0.5;
  // Big halo with rainbow shift
  const hue = (t * 30 + seed * 47) % 360;
  ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${0.2 + pulse * 0.25})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 13, 0, Math.PI * 2);
  ctx.fill();
  // Crystal — hexagon-ish facets
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
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2, y + 4);
  ctx.lineTo(x + CELL - 5, y + CELL / 2 - 2);
  ctx.lineTo(x + CELL / 2, y + CELL / 2 - 1);
  ctx.closePath();
  ctx.fill();
  // Sparkle
  ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
  ctx.fillRect(x + CELL / 2 - 1, y + 7, 2, 2);
}

function drawLava(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, col: number) {
  const wobble = Math.sin(t * 5 + col) * 2;
  // Hot bg
  ctx.fillStyle = "#7c2d12";
  ctx.fillRect(x, y, CELL, CELL);
  // Glowing pool surface
  const grad = ctx.createLinearGradient(0, y, 0, y + CELL);
  grad.addColorStop(0, "#fbbf24");
  grad.addColorStop(0.4, "#ea580c");
  grad.addColorStop(1, "#7c2d12");
  ctx.fillStyle = grad;
  ctx.fillRect(x + 2, y + 4 + wobble, CELL - 4, CELL - 6);
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
  // Top rim glow
  ctx.fillStyle = "rgba(254, 240, 138, 0.6)";
  ctx.fillRect(x + 2, y + 4 + wobble, CELL - 4, 1);
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState, interpCol: number, interpRow: number) {
  const px = interpCol * CELL;
  const py = interpRow * CELL;
  const swing = s.pickaxeSwing;
  const animBob = Math.sin(s.animTime * 6) * 0.5;

  // Helmet save flash
  if (s.helmetFlash > 0) {
    ctx.fillStyle = `rgba(253, 224, 71, ${s.helmetFlash * 0.5})`;
    ctx.beginPath();
    ctx.arc(px + CELL / 2, py + CELL / 2, 18 + (1 - s.helmetFlash) * 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shadow on floor below player (if it's an empty cell)
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(px + CELL / 2, py + CELL - 2, CELL / 2 - 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body (jumper)
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(px + 5, py + 8 + animBob, CELL - 10, CELL - 12);
  // Belt
  ctx.fillStyle = "#0e7490";
  ctx.fillRect(px + 5, py + CELL - 8 + animBob, CELL - 10, 4);
  // Boots
  ctx.fillStyle = "#1a0a08";
  ctx.fillRect(px + 6, py + CELL - 4 + animBob, 5, 3);
  ctx.fillRect(px + CELL - 11, py + CELL - 4 + animBob, 5, 3);

  // Head
  ctx.fillStyle = "#f5e8d4";
  ctx.fillRect(px + 8, py + 5 + animBob, CELL - 16, 6);
  ctx.fillStyle = "#0a0508";
  const eyeX = s.facing > 0 ? px + CELL - 11 : px + 9;
  ctx.fillRect(eyeX, py + 7 + animBob, 2, 2);

  // Miner's helmet (always shown — even without pickup it's the player helmet, gold when has pickup)
  ctx.fillStyle = s.hasHelmet ? "#22d3ee" : "#facc15";
  ctx.fillRect(px + 7, py + 2 + animBob, CELL - 14, 3);
  ctx.fillStyle = s.hasHelmet ? "#0e7490" : "#a16207";
  ctx.fillRect(px + 7, py + 5 + animBob, CELL - 14, 1);
  // Headlamp
  ctx.fillStyle = s.hasHelmet ? "#a5f3fc" : "#fef9c3";
  ctx.fillRect(px + CELL / 2 - 1, py + 1 + animBob, 2, 2);
  // Headlamp beam (small glow forward)
  ctx.fillStyle = "rgba(253, 224, 71, 0.18)";
  ctx.fillRect(px + CELL / 2 + (s.facing > 0 ? 1 : -9), py + 1 + animBob, 8, 5);

  // Pickaxe — swings down when active
  const swingAngle = swing > 0 ? swing * Math.PI * 0.3 : 0;
  const handAtX = px + CELL / 2 + s.facing * 6;
  const handAtY = py + 16 + animBob;
  ctx.save();
  ctx.translate(handAtX, handAtY);
  ctx.rotate(s.facing * swingAngle);
  // Handle
  ctx.fillStyle = "#92400e";
  ctx.fillRect(0, 0, s.facing * 8, 2);
  // Head
  ctx.fillStyle = "#a3a3a3";
  ctx.fillRect(s.facing * 6, -3, s.facing * 4, 6);
  ctx.fillStyle = "#71717a";
  ctx.fillRect(s.facing * 8, -3, s.facing * 2, 6);
  ctx.restore();

  // Dig flash overlay
  if (s.digFlash > 0) {
    ctx.fillStyle = `rgba(253, 224, 71, ${s.digFlash * 0.45})`;
    ctx.fillRect(px, py, CELL, CELL);
  }
}
