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

type Tile = " " | "#" | "h" | "P" | "C" | "X" | "G" | "M" | "T";
// " " empty / "#" dirt / "h" hazard pipe / "P" crowbar / "C" camera / "X" concrete
// "G" gold nugget / "M" helmet (1 free hazard) / "T" treasure chest (depth milestone)

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

type FloatText = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
};

type Shake = { mag: number; life: number };

type GameState = {
  player: { col: number; row: number };
  prevPlayerCol: number;
  prevPlayerRow: number;
  moveAnim: number;
  digFlash: number;
  facing: 1 | -1;
  depth: number;
  score: number;
  goldCount: number;
  scrolls: number;
  alive: boolean;
  scrollSpeed: number;
  hasCrowbar: number;
  hasHelmet: boolean;
  helmetFlash: number;         // brief gold flash when helmet saves you
  grid: Tile[][];
  lastInputAt: number;
  particles: Particle[];
  floatTexts: FloatText[];
  shake: Shake;
  rng: () => number;
  animTime: number;
  ceilingGlow: number;
  nextTreasureDepth: number;   // schedule of milestone treasures
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
  const dirtP = 0.45 + Math.min(0.2, depth / 2000);
  const hazardP = Math.min(0.1, 0.005 + depth / 8000);
  const crowbarP = 0.012;
  const camP = Math.min(0.04, 0.001 + depth / 12000);
  const blockerP = Math.min(0.06, 0.005 + depth / 6000);
  const goldP = 0.025;
  const helmetP = 0.006;
  const row: Tile[] = [];
  let hasPassable = false;
  for (let c = 0; c < COLS; c++) {
    const r = rng();
    let t: Tile;
    if (r < camP) t = "C";
    else if (r < camP + hazardP) t = "h";
    else if (r < camP + hazardP + crowbarP) {
      t = "P";
      hasPassable = true;
    } else if (r < camP + hazardP + crowbarP + helmetP) {
      t = "M";
      hasPassable = true;
    } else if (r < camP + hazardP + crowbarP + helmetP + goldP) {
      t = "G";
      hasPassable = true;
    } else if (r < camP + hazardP + crowbarP + helmetP + goldP + blockerP) {
      t = "X";
    } else if (r < camP + hazardP + crowbarP + helmetP + goldP + blockerP + dirtP) {
      t = "#";
    } else {
      t = " ";
      hasPassable = true;
    }
    row.push(t);
  }
  if (!hasPassable) {
    row[Math.floor(rng() * COLS)] = " ";
  }
  if (withTreasure) {
    // Replace a dirt cell (or empty) with treasure chest near middle
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
  for (let i = 0; i < 10; i++) {
    s.particles.push({
      x: cx + (s.rng() - 0.5) * 6,
      y: cy + (s.rng() - 0.5) * 6,
      vx: (s.rng() - 0.5) * 180,
      vy: -s.rng() * 140 - 30,
      life: 0.5 + s.rng() * 0.4,
      color: s.rng() < 0.5 ? "#92400e" : "#6b3410",
      size: 2 + Math.floor(s.rng() * 2),
    });
  }
}

function spawnSparkle(s: GameState, cx: number, cy: number, color: string) {
  for (let i = 0; i < 8; i++) {
    const a = s.rng() * Math.PI * 2;
    const sp = 80 + s.rng() * 60;
    s.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.4 + s.rng() * 0.3,
      color,
      size: 2,
    });
  }
}

function spawnPuff(s: GameState, cx: number, cy: number, color: string) {
  for (let i = 0; i < 12; i++) {
    s.particles.push({
      x: cx,
      y: cy,
      vx: (s.rng() - 0.5) * 220,
      vy: (s.rng() - 0.5) * 220,
      life: 0.5 + s.rng() * 0.5,
      color,
      size: 3,
    });
  }
}

function addFloat(s: GameState, x: number, y: number, text: string, color: string) {
  s.floatTexts.push({ x, y, text, color, life: 0.9 });
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
    stateRef.current = {
      player: { col: Math.floor(COLS / 2), row: 4 },
      prevPlayerCol: Math.floor(COLS / 2),
      prevPlayerRow: 4,
      moveAnim: 1,
      digFlash: 0,
      facing: 1,
      depth: 0,
      score: 0,
      goldCount: 0,
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
      shake: { mag: 0, life: 0 },
      rng,
      animTime: 0,
      ceilingGlow: 0,
      nextTreasureDepth: 25,
    };
    milestonesRef.current = [];
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

      if (s.alive) {
        s.scrollSpeed = Math.min(6.0, 1.6 + s.depth * 0.005);
        const rowsToScroll = s.scrollSpeed * dt;
        s.scrolls += rowsToScroll;
        while (s.scrolls >= 1) {
          s.scrolls -= 1;
          s.grid.shift();
          // Spawn treasure rows at depth milestones (25, 50, 100, 200, ...)
          const treasureDepth = s.depth + s.player.row;
          const withTreasure = treasureDepth >= s.nextTreasureDepth;
          s.grid.push(generateRow(treasureDepth, s.rng, withTreasure));
          if (withTreasure) {
            // Double the next milestone (25 → 50 → 100 → 200 → 400)
            s.nextTreasureDepth *= 2;
          }
          s.player.row -= 1;
          s.prevPlayerRow -= 1;
          if (s.player.row < 0) {
            s.alive = false;
            applyShake(s, 12);
            spawnPuff(s, s.player.col * CELL + CELL / 2, 6, "#ef4444");
            break;
          }
        }

        // Proximity glow — pulses red as player nears the top.
        const dangerRatio = 1 - Math.max(0, s.player.row) / 6;
        s.ceilingGlow = Math.max(0, Math.min(1, dangerRatio));

        if (s.alive) {
          const cell = s.grid[s.player.row]?.[s.player.col];
          if (cell === "C") {
            // Camera always kills — helmet doesn't save you from a sighting.
            s.alive = false;
            applyShake(s, 10);
            spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#ef4444");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ЗАСЁК", "#fca5a5");
          } else if (cell === "h") {
            // Pipe steam — helmet can absorb one
            if (s.hasHelmet) {
              s.hasHelmet = false;
              s.helmetFlash = 1.0;
              s.grid[s.player.row][s.player.col] = " ";
              applyShake(s, 6);
              spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
              addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ШЛЕМ!", "#fde047");
            } else {
              s.alive = false;
              applyShake(s, 8);
              spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#f59e0b");
              addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "ПАР", "#fde047");
            }
          } else if (cell === "P") {
            s.hasCrowbar += 1;
            s.grid[s.player.row][s.player.col] = " ";
            s.score += 25;
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+ЛОМ", "#fde047");
          } else if (cell === "G") {
            s.goldCount += 1;
            s.score += 50;
            s.grid[s.player.row][s.player.col] = " ";
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fef3c7");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+50 ЗОЛОТО", "#fbbf24");
          } else if (cell === "M") {
            s.hasHelmet = true;
            s.grid[s.player.row][s.player.col] = " ";
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#22d3ee");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+ШЛЕМ", "#67e8f9");
          } else if (cell === "T") {
            // Treasure chest — big score reward
            const reward = 200 + Math.floor(s.depth / 10) * 20;
            s.score += reward;
            s.goldCount += 5;
            s.grid[s.player.row][s.player.col] = " ";
            applyShake(s, 6);
            spawnPuff(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fbbf24");
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#fde047");
            spawnSparkle(s, s.player.col * CELL + CELL / 2, s.player.row * CELL + CELL / 2, "#ec4899");
            addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL - 6, `СУНДУК +${reward}`, "#fbbf24");
          }
        }
      }

      if (s.helmetFlash > 0) s.helmetFlash = Math.max(0, s.helmetFlash - dt * 1.5);

      // Animation easings
      if (s.moveAnim < 1) {
        s.moveAnim = Math.min(1, s.moveAnim + dt * 12);
      }
      if (s.digFlash > 0) {
        s.digFlash = Math.max(0, s.digFlash - dt * 6);
      }
      if (s.shake.life > 0) {
        s.shake.life -= dt;
        if (s.shake.life <= 0) s.shake.mag = 0;
      }

      // Particles
      for (const p of s.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 380 * dt;
        p.life -= dt * 1.4;
      }
      s.particles = s.particles.filter((p) => p.life > 0);

      // Float texts
      for (const f of s.floatTexts) {
        f.y -= 40 * dt;
        f.life -= dt;
      }
      s.floatTexts = s.floatTexts.filter((f) => f.life > 0);

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
        meta: { depth: s.depth, crowbars: s.hasCrowbar, version: "v2" },
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
      // Use e.code (layout-independent) for letters; e.key for arrows.
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
          style={{ aspectRatio: `${W} / ${H}`, imageRendering: "pixelated" }}
        />
      }
    />
  );
}

function canEnter(t: Tile | undefined, hasHelmet: boolean): boolean {
  if (t === undefined) return false;
  if (t === "X" || t === "C") return false;
  if (t === "h" && !hasHelmet) return false;
  return true;
}

function moveLeft(s: GameState, now: number) {
  if (s.player.col > 0) {
    const target = s.grid[s.player.row]?.[s.player.col - 1];
    if (canEnter(target, s.hasHelmet)) {
      s.prevPlayerCol = s.player.col;
      s.prevPlayerRow = s.player.row;
      s.moveAnim = 0;
      if (target === "#") {
        s.grid[s.player.row][s.player.col - 1] = " ";
        s.score += 1;
        spawnDirtBurst(s, (s.player.col - 1) * CELL + CELL / 2, s.player.row * CELL + CELL / 2);
        s.digFlash = 1;
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
    if (canEnter(target, s.hasHelmet)) {
      s.prevPlayerCol = s.player.col;
      s.prevPlayerRow = s.player.row;
      s.moveAnim = 0;
      if (target === "#") {
        s.grid[s.player.row][s.player.col + 1] = " ";
        s.score += 1;
        spawnDirtBurst(s, (s.player.col + 1) * CELL + CELL / 2, s.player.row * CELL + CELL / 2);
        s.digFlash = 1;
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
      addFloat(s, s.player.col * CELL + CELL / 2, s.player.row * CELL, "+10", "#fde047");
    } else {
      return;
    }
  } else if (target === "C") {
    return; // can't dig into a camera
  } else if (target === "h" && !s.hasHelmet) {
    return; // can't dig into pipe steam without helmet
  } else if (target === "#") {
    s.grid[s.player.row + 1][s.player.col] = " ";
    s.score += 1;
    spawnDirtBurst(s, s.player.col * CELL + CELL / 2, (s.player.row + 1) * CELL + CELL / 2);
    s.digFlash = 1;
  }
  s.prevPlayerCol = s.player.col;
  s.prevPlayerRow = s.player.row;
  s.moveAnim = 0;
  s.player.row += 1;
  s.depth += 1;
  s.lastInputAt = now;
}

function draw(canvas: HTMLCanvasElement, s: GameState) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Apply shake
  let shakeX = 0;
  let shakeY = 0;
  if (s.shake.mag > 0 && s.shake.life > 0) {
    shakeX = (Math.random() - 0.5) * s.shake.mag;
    shakeY = (Math.random() - 0.5) * s.shake.mag;
  }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Background — vertical gradient from dark sky to deep earth
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1a0a14");
  bg.addColorStop(0.15, "#0e0710");
  bg.addColorStop(0.4, "#1a0e0a");
  bg.addColorStop(1, "#0a0508");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Tile grid
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = s.grid[r]?.[c] ?? " ";
      const x = c * CELL;
      const y = r * CELL;
      if (t === "#") drawDirt(ctx, x, y, c, r, s.animTime);
      else if (t === "X") drawBlocker(ctx, x, y);
      else if (t === "h") drawPipe(ctx, x, y, s.animTime);
      else if (t === "C") drawCamera(ctx, x, y, s.animTime, c, r);
      else if (t === "P") drawCrowbar(ctx, x, y, s.animTime);
      else if (t === "G") drawGold(ctx, x, y, s.animTime);
      else if (t === "M") drawHelmet(ctx, x, y, s.animTime);
      else if (t === "T") drawTreasure(ctx, x, y, s.animTime);
      else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
        ctx.fillRect(x, y, CELL, CELL);
      }
    }
  }

  // Wall-of-death glow at top — pulses when player is close to ceiling
  if (s.ceilingGlow > 0.05) {
    const pulse = 0.5 + Math.sin(s.animTime * 6) * 0.3;
    const grad = ctx.createLinearGradient(0, 0, 0, 80);
    grad.addColorStop(0, `rgba(220, 38, 38, ${0.4 * s.ceilingGlow * pulse})`);
    grad.addColorStop(1, "rgba(220, 38, 38, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 80);
  }

  // Player
  drawPlayer(ctx, s);

  // Particles
  for (const p of s.particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // Float texts
  for (const f of s.floatTexts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = f.color;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";

  // HUD bar
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, W, 26);
  ctx.fillStyle = "#fde047";
  ctx.font = "bold 12px monospace";
  ctx.fillText(`⛏ ${Math.floor(s.depth)}м`, 6, 17);
  ctx.fillStyle = "#22d3ee";
  ctx.fillText(`SCORE ${Math.floor(s.score + s.depth * 3)}`, 110, 17);
  if (s.hasCrowbar > 0) {
    const glow = 0.5 + Math.sin(s.animTime * 8) * 0.5;
    ctx.fillStyle = `rgba(253, 224, 71, ${0.8 + 0.2 * glow})`;
    ctx.fillText(`🪤 ×${s.hasCrowbar}`, W - 70, 17);
  }
  // Speed indicator
  const speedFrac = Math.min(1, (s.scrollSpeed - 1.6) / 4.4);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(W - 110, 22, 100, 2);
  ctx.fillStyle = `hsl(${120 - speedFrac * 120}, 70%, 55%)`;
  ctx.fillRect(W - 110, 22, 100 * speedFrac, 2);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Tile drawing helpers
// ---------------------------------------------------------------------------

function drawDirt(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, row: number, _t: number) {
  // Base
  ctx.fillStyle = "#4a2c1a";
  ctx.fillRect(x, y, CELL, CELL);
  // Pseudo-random pebbles based on cell coords (stable per cell)
  const seed = col * 31 + row * 17;
  const noise = (n: number) => (Math.sin(seed + n) * 43758.5453) % 1;
  for (let i = 0; i < 3; i++) {
    const px = x + 2 + Math.abs(noise(i)) * (CELL - 4);
    const py = y + 2 + Math.abs(noise(i + 11)) * (CELL - 4);
    ctx.fillStyle = i === 0 ? "#92400e" : "#3a2010";
    ctx.fillRect(px, py, 2, 2);
  }
  // Top highlight
  ctx.fillStyle = "rgba(255, 200, 150, 0.06)";
  ctx.fillRect(x, y, CELL, 2);
  // Outline
  ctx.strokeStyle = "#2a1810";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
}

function drawBlocker(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#525252";
  ctx.fillRect(x, y, CELL, CELL);
  // Hatched concrete pattern
  ctx.fillStyle = "#3f3f3f";
  for (let i = 0; i < CELL; i += 6) {
    ctx.fillRect(x + i, y, 2, CELL);
  }
  ctx.fillStyle = "#404040";
  ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
  ctx.strokeStyle = "#262626";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
}

function drawPipe(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  // Vertical pipe with pulsing steam glow
  const pulse = 0.6 + Math.sin(t * 4 + x) * 0.4;
  ctx.fillStyle = "#7f1d1d";
  ctx.fillRect(x + 4, y + 2, CELL - 8, CELL - 4);
  ctx.fillStyle = `rgba(220, 38, 38, ${pulse})`;
  ctx.fillRect(x + 6, y + 6, CELL - 12, CELL - 12);
  // Steam puff
  ctx.fillStyle = `rgba(253, 224, 71, ${pulse * 0.3})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 8 + pulse * 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawCamera(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, col: number, row: number) {
  // Mounted box
  ctx.fillStyle = "#1a1014";
  ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(x + 4, y + CELL - 5, CELL - 8, 4);
  // Eye — blinks
  const blink = (Math.sin(t * 3 + col + row) + 1) / 2 > 0.85 ? 0.3 : 1;
  ctx.fillStyle = `rgba(250, 204, 21, ${blink})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2 - 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(0, 0, 0, ${blink})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2 - 2, 2, 0, Math.PI * 2);
  ctx.fill();
  // Cone hint
  ctx.fillStyle = `rgba(250, 204, 21, ${blink * 0.15})`;
  ctx.beginPath();
  ctx.moveTo(x + CELL / 2, y + CELL / 2);
  ctx.lineTo(x + 2, y + CELL - 2);
  ctx.lineTo(x + CELL - 2, y + CELL - 2);
  ctx.closePath();
  ctx.fill();
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
  // Helmet dome
  ctx.fillStyle = "#22d3ee";
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2 + 2, 7, Math.PI, Math.PI * 2);
  ctx.fill();
  // Brim
  ctx.fillStyle = "#0e7490";
  ctx.fillRect(x + CELL / 2 - 9, y + CELL / 2 + 1, 18, 3);
  // Crest
  ctx.fillStyle = "#a5f3fc";
  ctx.fillRect(x + CELL / 2 - 1, y + CELL / 2 - 5, 2, 2);
}

function drawTreasure(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const pulse = 0.6 + Math.sin(t * 3) * 0.4;
  // Glow halo
  ctx.fillStyle = `rgba(251, 191, 36, ${pulse * 0.4})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 16, 0, Math.PI * 2);
  ctx.fill();
  // Chest body
  ctx.fillStyle = "#7c2d12";
  ctx.fillRect(x + 3, y + 8, CELL - 6, CELL - 11);
  ctx.fillStyle = "#9a3412";
  ctx.fillRect(x + 3, y + 8, CELL - 6, 7);
  // Lid edge
  ctx.fillStyle = "#451a03";
  ctx.fillRect(x + 3, y + 13, CELL - 6, 2);
  // Lock
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(x + CELL / 2 - 2, y + 12, 4, 6);
  ctx.fillStyle = "#000";
  ctx.fillRect(x + CELL / 2 - 1, y + 14, 2, 2);
  // Sparkles
  const sx = x + CELL / 2 + Math.cos(t * 2) * 8;
  const sy = y + CELL / 2 - 6 + Math.sin(t * 2) * 4;
  ctx.fillStyle = `rgba(254, 240, 138, ${pulse})`;
  ctx.fillRect(sx - 1, sy - 1, 2, 2);
}

function drawCrowbar(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  // Pulsing gleam halo
  const pulse = 0.5 + Math.sin(t * 6) * 0.5;
  ctx.fillStyle = `rgba(253, 224, 71, ${0.1 + pulse * 0.2})`;
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, 12, 0, Math.PI * 2);
  ctx.fill();
  // Crowbar body
  ctx.fillStyle = "#facc15";
  ctx.fillRect(x + CELL / 2 - 2, y + 4, 4, CELL - 8);
  ctx.fillStyle = "#a16207";
  ctx.fillRect(x + CELL / 2 - 5, y + CELL - 9, 10, 4);
  // Highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.fillRect(x + CELL / 2 - 1, y + 4, 1, CELL - 8);
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState) {
  const e = 1 - Math.pow(1 - s.moveAnim, 3);
  const interpCol = s.prevPlayerCol + (s.player.col - s.prevPlayerCol) * e;
  const interpRow = s.prevPlayerRow + (s.player.row - s.prevPlayerRow) * e;
  const px = interpCol * CELL;
  const py = interpRow * CELL;

  // Helmet save flash — ring of light around player
  if (s.helmetFlash > 0) {
    ctx.fillStyle = `rgba(253, 224, 71, ${s.helmetFlash * 0.5})`;
    ctx.beginPath();
    ctx.arc(px + CELL / 2, py + CELL / 2, 18 + (1 - s.helmetFlash) * 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(px + 5, py + 6, CELL - 10, CELL - 10);
  ctx.fillStyle = "#0e7490";
  ctx.fillRect(px + 5, py + CELL - 8, CELL - 10, 4);
  // Head
  ctx.fillStyle = "#f5e8d4";
  ctx.fillRect(px + 8, py + 4, CELL - 16, 6);
  ctx.fillStyle = "#0a0508";
  const eyeX = s.facing > 0 ? px + CELL - 11 : px + 9;
  ctx.fillRect(eyeX, py + 6, 2, 2);
  // Helmet on top of head
  if (s.hasHelmet) {
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(px + 7, py + 2, CELL - 14, 3);
    ctx.fillStyle = "#0e7490";
    ctx.fillRect(px + 7, py + 5, CELL - 14, 1);
    ctx.fillStyle = "#a5f3fc";
    ctx.fillRect(px + CELL / 2 - 1, py, 2, 2);
  }
  // Crowbar in hand
  if (s.hasCrowbar > 0) {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(px + (s.facing > 0 ? CELL - 4 : 2), py + 8, 2, CELL - 14);
  }
  // Dig flash
  if (s.digFlash > 0) {
    ctx.fillStyle = `rgba(253, 224, 71, ${s.digFlash * 0.5})`;
    ctx.fillRect(px, py, CELL, CELL);
  }
}
