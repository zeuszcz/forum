"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useEffect, useRef, useState } from "react";

import { mulberry32, useArcadeRun } from "../../_components/useArcadeRun";

import { GameShell } from "./GameShell";

const W = 480;
const H = 600;
const CELL = 24;       // grid pixel size
const COLS = W / CELL; // 20 columns
const ROWS = H / CELL; // 25 rows
const MOVE_COOLDOWN_MS = 110;

type Tile = " " | "#" | "h" | "P" | "C" | "X"; // empty / dirt / hazard / pickup-crowbar / cam / blocker

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
};

type GameState = {
  player: { col: number; row: number };
  depth: number;             // in metres = rows dug
  score: number;
  scrolls: number;           // total rows scrolled
  alive: boolean;
  speedupAccum: number;
  scrollSpeed: number;       // rows/sec the world scrolls
  hasCrowbar: number;        // crowbar charges
  grid: Tile[][];            // [ROWS][COLS] viewport
  lastInputAt: number;
  particles: Particle[];
  rng: () => number;
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

function generateRow(depth: number, rng: () => number): Tile[] {
  // Difficulty curve based on depth
  const dirtP = 0.45 + Math.min(0.2, depth / 2000);
  const hazardP = Math.min(0.1, 0.005 + depth / 8000);
  const crowbarP = 0.012;
  const camP = Math.min(0.04, 0.001 + depth / 12000);
  const blockerP = Math.min(0.06, 0.005 + depth / 6000);
  const row: Tile[] = [];
  for (let c = 0; c < COLS; c++) {
    const r = rng();
    if (r < camP) row.push("C");
    else if (r < camP + hazardP) row.push("h");
    else if (r < camP + hazardP + crowbarP) row.push("P");
    else if (r < camP + hazardP + crowbarP + blockerP) row.push("X");
    else if (r < camP + hazardP + crowbarP + blockerP + dirtP) row.push("#");
    else row.push(" ");
  }
  // Always leave at least one passable cell.
  if (row.every((t) => t === "#" || t === "X" || t === "C" || t === "h")) {
    row[Math.floor(rng() * COLS)] = " ";
  }
  return row;
}

function spawnParticles(state: GameState, x: number, y: number, color: string) {
  for (let i = 0; i < 6; i++) {
    state.particles.push({
      x,
      y,
      vx: (state.rng() - 0.5) * 120,
      vy: -state.rng() * 100 - 20,
      life: 1.0,
      color,
    });
  }
}

export function DiggerGame({ game }: { game: { slug: string; title: string; emoji: string; accent: string; description: string; controls: string; score_unit: string } }) {
  const { state: runState, error, start, end } = useArcadeRun(game.slug);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const rafRef = useRef<number | null>(null);
  const milestonesRef = useRef<Array<{ t: number; depth: number }>>([]);
  const [tick, setTick] = useState(0); // forces re-render of HUD

  // Init on run start
  useEffect(() => {
    if (runState.phase !== "running") return;
    const rng = mulberry32(runState.seed);
    stateRef.current = {
      player: { col: Math.floor(COLS / 2), row: 4 },
      depth: 0,
      score: 0,
      scrolls: 0,
      alive: true,
      speedupAccum: 0,
      scrollSpeed: 1.6,
      hasCrowbar: 0,
      grid: emptyGrid(rng),
      lastInputAt: 0,
      particles: [],
      rng,
    };
    milestonesRef.current = [];
    setTick((t) => t + 1);
  }, [runState.phase, runState.phase === "running" ? runState.seed : 0]);

  // Game loop
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
        // Speedup
        s.speedupAccum += dt;
        s.scrollSpeed = Math.min(6.0, 1.6 + s.depth * 0.005);

        // Scroll world down
        const rowsToScroll = s.scrollSpeed * dt;
        s.scrolls += rowsToScroll;

        while (s.scrolls >= 1) {
          s.scrolls -= 1;
          // Shift down: remove top row, push new bottom row.
          s.grid.shift();
          s.grid.push(generateRow(s.depth + s.player.row, s.rng));
          s.player.row -= 1;
          if (s.player.row < 0) {
            // The wall caught up — death.
            s.alive = false;
            break;
          }
        }

        // Auto-collect & death check on player tile
        if (s.alive) {
          const cell = s.grid[s.player.row]?.[s.player.col];
          if (cell === "C") {
            s.alive = false;
            spawnParticles(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#ef4444");
          } else if (cell === "h") {
            s.alive = false;
            spawnParticles(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#f59e0b");
          } else if (cell === "P") {
            s.hasCrowbar += 1;
            s.grid[s.player.row][s.player.col] = " ";
            s.score += 25;
            spawnParticles(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
          }
        }

        // Particles
        for (const p of s.particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 240 * dt;
          p.life -= dt * 1.6;
        }
        s.particles = s.particles.filter((p) => p.life > 0);
      }

      draw(canvas, s);

      if (s.alive) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        // End run when dead.
        const finalScore = Math.floor(s.score + s.depth * 5);
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
      // Push final milestone
      milestonesRef.current.push({ t: Date.now(), depth: s.depth });
      end(score, {
        milestones: milestonesRef.current,
        meta: { depth: s.depth, crowbars: s.hasCrowbar, version: "v1" },
      });
    },
    [end, runState.phase],
  );

  // Input
  useEffect(() => {
    if (runState.phase !== "running") return;
    const handleKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s || !s.alive) return;
      const now = performance.now();
      if (now - s.lastInputAt < MOVE_COOLDOWN_MS) return;
      const k = e.key;
      if (k === "a" || k === "A" || k === "ArrowLeft") {
        moveLeft(s, now);
      } else if (k === "d" || k === "D" || k === "ArrowRight") {
        moveRight(s, now);
      } else if (k === " " || k === "ArrowDown" || k === "s" || k === "S") {
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
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-mono text-sm text-amber-300">
            {Math.floor(stateRef.current.depth)} м · {Math.floor(stateRef.current.score + stateRef.current.depth * 5)}
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

function moveLeft(s: GameState, now: number) {
  if (s.player.col > 0) {
    const target = s.grid[s.player.row]?.[s.player.col - 1];
    if (target !== "X" && target !== "C" && target !== "h") {
      if (target === "#") {
        s.grid[s.player.row][s.player.col - 1] = " ";
        s.score += 1;
        spawnParticles(s, (s.player.col - 1) * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#92400e");
      }
      s.player.col -= 1;
      s.lastInputAt = now;
    } else if (target === "P") {
      s.player.col -= 1;
      s.lastInputAt = now;
    }
  }
}

function moveRight(s: GameState, now: number) {
  if (s.player.col < COLS - 1) {
    const target = s.grid[s.player.row]?.[s.player.col + 1];
    if (target !== "X" && target !== "C" && target !== "h") {
      if (target === "#") {
        s.grid[s.player.row][s.player.col + 1] = " ";
        s.score += 1;
        spawnParticles(s, (s.player.col + 1) * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#92400e");
      }
      s.player.col += 1;
      s.lastInputAt = now;
    } else if (target === "P") {
      s.player.col += 1;
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
      spawnParticles(s, s.player.col * CELL + CELL / 2, (s.player.row + 1) * CELL + CELL / 2, "#fde047");
    } else {
      return;
    }
  } else if (target === "C" || target === "h") {
    return; // refuse to walk into death — must avoid by moving sideways
  } else if (target === "#") {
    s.grid[s.player.row + 1][s.player.col] = " ";
    s.score += 1;
    spawnParticles(s, s.player.col * CELL + CELL / 2, (s.player.row + 1) * CELL + CELL / 2, "#92400e");
  }
  s.player.row += 1;
  s.depth += 1;
  s.lastInputAt = now;
}

function draw(canvas: HTMLCanvasElement, s: GameState) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(0, 0, W, H);

  // Grid
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = s.grid[r]?.[c] ?? " ";
      const x = c * CELL;
      const y = r * CELL;
      if (t === "#") {
        ctx.fillStyle = "#4a2c1a";
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = "#2a1810";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      } else if (t === "X") {
        // blocker — concrete
        ctx.fillStyle = "#525252";
        ctx.fillRect(x, y, CELL, CELL);
        ctx.fillStyle = "#404040";
        ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
      } else if (t === "h") {
        // hazard — pipe (red)
        ctx.fillStyle = "#7f1d1d";
        ctx.fillRect(x + 4, y + 2, CELL - 8, CELL - 4);
        ctx.fillStyle = "#dc2626";
        ctx.fillRect(x + 6, y + 6, CELL - 12, CELL - 12);
      } else if (t === "C") {
        // camera — yellow eye
        ctx.fillStyle = "#1a1014";
        ctx.fillRect(x, y, CELL, CELL);
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (t === "P") {
        // pickup — crowbar
        ctx.fillStyle = "#facc15";
        ctx.fillRect(x + CELL / 2 - 2, y + 4, 4, CELL - 8);
        ctx.fillStyle = "#a16207";
        ctx.fillRect(x + CELL / 2 - 5, y + CELL - 9, 10, 4);
      }
    }
  }

  // Player
  const px = s.player.col * CELL;
  const py = s.player.row * CELL;
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(px + 8, py + 8, CELL - 16, 4);
  if (s.hasCrowbar > 0) {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(px + CELL - 6, py + 2, 3, CELL - 4);
  }

  // Particles
  for (const p of s.particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
  }
  ctx.globalAlpha = 1;

  // HUD top
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, W, 24);
  ctx.fillStyle = "#fde047";
  ctx.font = "12px monospace";
  ctx.fillText(`Глубина ${Math.floor(s.depth)} м`, 6, 16);
  ctx.fillStyle = "#22d3ee";
  ctx.fillText(`Score ${Math.floor(s.score + s.depth * 5)}`, 130, 16);
  if (s.hasCrowbar > 0) {
    ctx.fillStyle = "#facc15";
    ctx.fillText(`🪤×${s.hasCrowbar}`, 260, 16);
  }
}
