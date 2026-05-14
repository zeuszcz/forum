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
const BOSS_W = 44;
const BOSS_H = 88;

type EnemyKind = "grunt" | "veteran" | "zapper" | "shielder" | "boss";

type Player = {
  x: number;
  facing: 1 | -1;
  hp: number;
  hpMax: number;
  hpDisplay: number;
  punchUntil: number;
  dodgeUntil: number;
  parryUntil: number;
  attackCooldownUntil: number;
  hitFlashUntil: number;
  walkPhase: number;
  comboCount: number;
  comboExpiresAt: number;
  rageUntil: number;
  // Super meter — 0..100; level1 unlocked at 50, level2 at 100
  superMeter: number;
  superDisplay: number;
  // Input buffer for combo recognition — list of {code, t}
  inputBuffer: Array<{ key: "J" | "K" | "L"; t: number }>;
  // Special-move animation states
  uppercutUntil: number;
  flurryUntil: number;
  flurryHits: number;
  tornadoUntil: number;       // Level 1 super
  berserkerUntil: number;     // Level 2 super
  // Limb-animation phase
  armPhaseL: number;
  armPhaseR: number;
};

type Enemy = {
  x: number;
  facing: 1 | -1;
  kind: EnemyKind;
  hp: number;
  hpMax: number;
  speed: number;
  attackCooldown: number;
  attacking: number;
  alive: boolean;
  deathTimer: number;
  hitFlashUntil: number;
  walkPhase: number;
  reach: number;
  // For shielder: shield is up unless broken
  shieldUp: boolean;
  shieldHp: number;
};

type Projectile = {
  x: number;
  y: number;
  vx: number;
  fromId: number;
  life: number;
  arcPhase: number;
};

type Pickup = {
  x: number;
  y: number;
  kind: "hp" | "rage";
  bobPhase: number;
  collected: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

type FloatText = { x: number; y: number; text: string; life: number; color: string; size: number };

type CrowdMember = { x: number; y: number; shade: number; bobPhase: number; cheer: number };

type GameState = {
  player: Player;
  enemies: Enemy[];
  pickups: Pickup[];
  projectiles: Projectile[];
  crowd: CrowdMember[];
  wave: number;
  killsThisWave: number;
  killsTotal: number;
  alive: boolean;
  rng: () => number;
  waveStartAt: number;
  waveBannerLife: number;
  waveBannerText: string;
  waveBannerSub: string;
  particles: Particle[];
  floats: FloatText[];
  shake: { mag: number; life: number };
  animTime: number;
  hitstop: number;
  bgFlash: number;
  slowMoUntil: number;
  comboFlash: number;
  // Cinematic finisher: camera zooms toward (x, y) for the duration
  cinematic: { active: boolean; until: number; targetX: number; targetY: number; zoom: number } | null;
};

function spawnWave(s: GameState, ts: number) {
  s.wave += 1;
  s.killsThisWave = 0;
  const isBossWave = s.wave % 5 === 0;
  let bannerText = `ВОЛНА ${s.wave}`;
  let bannerSub: string;
  if (isBossWave) {
    bannerText = `БОСС · ВОЛНА ${s.wave}`;
    bannerSub = "охранник в броне";
    s.enemies.push(makeEnemy(s, "boss", false));
    s.enemies.push(makeEnemy(s, "grunt", true));
    s.enemies.push(makeEnemy(s, "shielder", false));
  } else {
    const count = Math.min(7, 2 + Math.floor(s.wave / 2));
    // Wave variety scales: zapper at wave 3+, shielder at wave 4+
    let zappers = 0;
    let shielders = 0;
    let veterans = 0;
    if (s.wave >= 3) zappers = Math.min(2, Math.floor(s.wave / 3));
    if (s.wave >= 4) shielders = Math.min(2, Math.floor(s.wave / 4));
    if (s.wave >= 3) veterans = Math.max(0, Math.min(count - zappers - shielders - 1, Math.floor(s.wave / 3)));
    const grunts = count - zappers - shielders - veterans;
    const placeholders: EnemyKind[] = [];
    for (let i = 0; i < grunts; i++) placeholders.push("grunt");
    for (let i = 0; i < veterans; i++) placeholders.push("veteran");
    for (let i = 0; i < zappers; i++) placeholders.push("zapper");
    for (let i = 0; i < shielders; i++) placeholders.push("shielder");
    // Shuffle
    for (let i = placeholders.length - 1; i > 0; i--) {
      const j = Math.floor(s.rng() * (i + 1));
      [placeholders[i], placeholders[j]] = [placeholders[j], placeholders[i]];
    }
    for (const kind of placeholders) {
      s.enemies.push(makeEnemy(s, kind, s.rng() < 0.5));
    }
    bannerSub = `${count} противников${zappers ? ` · ${zappers} ⚡` : ""}${shielders ? ` · ${shielders} 🛡` : ""}`;
  }
  s.waveStartAt = ts;
  s.waveBannerLife = 1.8;
  s.waveBannerText = bannerText;
  s.waveBannerSub = bannerSub;
  s.player.hp = Math.min(s.player.hpMax, s.player.hp + (isBossWave ? 30 : 18));
  if (s.wave > 1 && s.rng() < 0.55) {
    s.pickups.push({
      x: 80 + s.rng() * (W - 160),
      y: FLOOR_Y - 16,
      kind: s.rng() < 0.55 ? "hp" : "rage",
      bobPhase: 0,
      collected: false,
    });
  }
  // Crowd cheers between waves
  for (const c of s.crowd) c.cheer = 1.0;
}

function makeEnemy(s: GameState, kind: EnemyKind, fromLeft: boolean): Enemy {
  const wave = s.wave;
  const baseW = kind === "boss" ? BOSS_W : ENEMY_W;
  const baseX = fromLeft ? -baseW : W + baseW;
  const baseFacing: 1 | -1 = fromLeft ? 1 : -1;
  const common = {
    x: baseX,
    facing: baseFacing,
    alive: true,
    deathTimer: 0,
    hitFlashUntil: 0,
    walkPhase: s.rng() * Math.PI * 2,
    attacking: 0,
    shieldUp: false,
    shieldHp: 0,
  };
  if (kind === "boss") {
    return {
      ...common,
      kind: "boss",
      hp: 140 + wave * 8,
      hpMax: 140 + wave * 8,
      speed: 55 + wave * 1.5,
      attackCooldown: 1400 + s.rng() * 400,
      reach: 62,
    };
  }
  if (kind === "veteran") {
    return {
      ...common,
      kind: "veteran",
      hp: 55 + wave * 5,
      hpMax: 55 + wave * 5,
      speed: 80 + wave * 4 + s.rng() * 20,
      attackCooldown: 800 + s.rng() * 400,
      reach: 52,
    };
  }
  if (kind === "zapper") {
    return {
      ...common,
      kind: "zapper",
      hp: 35 + wave * 3,
      hpMax: 35 + wave * 3,
      speed: 50 + wave * 2 + s.rng() * 15,
      attackCooldown: 1500 + s.rng() * 600,
      reach: 220,  // ranged
    };
  }
  if (kind === "shielder") {
    return {
      ...common,
      kind: "shielder",
      hp: 50 + wave * 4,
      hpMax: 50 + wave * 4,
      speed: 50 + wave * 2 + s.rng() * 10,
      attackCooldown: 1300 + s.rng() * 400,
      reach: 48,
      shieldUp: true,
      shieldHp: 40 + wave * 3,
    };
  }
  return {
    ...common,
    kind: "grunt",
    hp: 30 + wave * 3,
    hpMax: 30 + wave * 3,
    speed: 65 + wave * 3 + s.rng() * 20,
    attackCooldown: 1000 + s.rng() * 500,
    reach: 46,
  };
}

function spawnBlood(s: GameState, x: number, y: number, big = false) {
  const n = big ? 18 : 10;
  for (let i = 0; i < n; i++) {
    const a = s.rng() * Math.PI * 2;
    const sp = big ? 140 + s.rng() * 160 : 100 + s.rng() * 120;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 60,
      life: 0.5 + s.rng() * 0.4,
      color: s.rng() < 0.7 ? "#dc2626" : "#7f1d1d",
      size: big ? 4 : 3,
    });
  }
}

function spawnSparks(s: GameState, x: number, y: number) {
  for (let i = 0; i < 10; i++) {
    const a = s.rng() * Math.PI * 2;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * (120 + s.rng() * 80),
      vy: Math.sin(a) * (120 + s.rng() * 80),
      life: 0.3 + s.rng() * 0.3,
      color: s.rng() < 0.5 ? "#facc15" : "#fbbf24",
      size: 2,
    });
  }
}

function spawnRageFlare(s: GameState, x: number, y: number) {
  for (let i = 0; i < 24; i++) {
    const a = s.rng() * Math.PI * 2;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * (140 + s.rng() * 100),
      vy: Math.sin(a) * (140 + s.rng() * 100) - 40,
      life: 0.6 + s.rng() * 0.5,
      color: s.rng() < 0.5 ? "#ef4444" : "#fbbf24",
      size: 3,
    });
  }
}

function addFloat(s: GameState, x: number, y: number, text: string, color: string, size = 14) {
  s.floats.push({ x, y, text, color, life: 1.0, size });
}

function applyShake(s: GameState, mag: number) {
  s.shake.mag = Math.max(s.shake.mag, mag);
  s.shake.life = 0.35;
}

function killEnemy(s: GameState, e: Enemy, now: number) {
  if (!e.alive) return;
  e.alive = false;
  e.deathTimer = 0.5;
  s.killsThisWave += 1;
  s.killsTotal += 1;
  // Award super-meter for kill
  s.player.superMeter = Math.min(100, s.player.superMeter + (e.kind === "boss" ? 40 : e.kind === "veteran" ? 15 : 10));
  if (e.kind === "boss") {
    // Boss finisher — cinematic camera zoom + slow-mo
    s.slowMoUntil = now + 1200;
    s.hitstop = 0.3;
    applyShake(s, 16);
    s.bgFlash = 0.7;
    s.comboFlash = 1.0;
    s.cinematic = {
      active: true,
      until: now + 1500,
      targetX: e.x,
      targetY: FLOOR_Y - BOSS_H / 2,
      zoom: 1.6,
    };
    spawnRageFlare(s, e.x, FLOOR_Y - BOSS_H / 2);
    addFloat(s, e.x, FLOOR_Y - BOSS_H - 6, "БОСС ПАЛ!", "#fb923c", 22);
    // HP drop
    s.pickups.push({
      x: e.x,
      y: FLOOR_Y - 16,
      kind: "hp",
      bobPhase: 0,
      collected: false,
    });
    // Crowd cheers
    for (const c of s.crowd) c.cheer = 1.0;
  } else {
    addFloat(s, e.x, FLOOR_Y - ENEMY_H, e.kind === "veteran" ? "+2" : e.kind === "zapper" ? "+2" : e.kind === "shielder" ? "+3" : "+1", "#fde047", 14);
    applyShake(s, 4);
  }
}

function makeCrowd(rng: () => number): CrowdMember[] {
  const crowd: CrowdMember[] = [];
  for (let i = 0; i < 12; i++) {
    crowd.push({
      x: 20 + i * 50 + rng() * 12,
      y: 56 + rng() * 14,
      shade: 40 + Math.floor(rng() * 30),
      bobPhase: rng() * Math.PI * 2,
      cheer: 0,
    });
  }
  return crowd;
}

// Robust key tracking by physical key code (layout-independent).
function pressedActionCode(set: Set<string>, code: string): boolean {
  if (set.has(code)) {
    set.delete(code);
    return true;
  }
  return false;
}

// Combo recognition — checks recent input buffer against known patterns.
// Returns the recognised combo or null. Consumes buffer on hit.
type Combo =
  | "uppercut"  // J,J,K — power launch
  | "sweep"     // K,J,J — low sweep
  | "flurry"    // J,J,J,J — barrage hits
  | "counter"   // L,J    — parry → counter
  | null;

function recogniseCombo(s: GameState, now: number): Combo {
  const buf = s.player.inputBuffer;
  // Expire entries older than 800ms
  while (buf.length > 0 && now - buf[0].t > 800) buf.shift();
  if (buf.length === 0) return null;
  const seq = buf.map((b) => b.key).join("");
  // Test longest patterns first
  if (seq.endsWith("JJJJ")) {
    s.player.inputBuffer = [];
    return "flurry";
  }
  if (seq.endsWith("KJJ")) {
    s.player.inputBuffer = [];
    return "sweep";
  }
  if (seq.endsWith("JJK")) {
    s.player.inputBuffer = [];
    return "uppercut";
  }
  if (seq.endsWith("LJ")) {
    s.player.inputBuffer = [];
    return "counter";
  }
  return null;
}

function addInputToBuffer(s: GameState, key: "J" | "K" | "L", now: number) {
  s.player.inputBuffer.push({ key, t: now });
  if (s.player.inputBuffer.length > 8) s.player.inputBuffer.shift();
}

function bumpSuperMeter(s: GameState, amount: number) {
  s.player.superMeter = Math.min(100, s.player.superMeter + amount);
}

// ---------------------------------------------------------------------------
// Special moves
// ---------------------------------------------------------------------------

function performUppercut(s: GameState, now: number) {
  // Big upward arc — long reach, knockback
  s.player.uppercutUntil = now + 280;
  s.player.attackCooldownUntil = now + 600;
  s.player.punchUntil = now + 240;
  let hit = false;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const dx = e.x - s.player.x;
    if (s.player.facing * dx > 0 && Math.abs(dx) < 65) {
      const dmg = 32 + Math.floor((now < s.player.berserkerUntil ? 24 : 0) + s.player.comboCount * 2);
      // Shielder absorbs into shield
      if (e.kind === "shielder" && e.shieldUp) {
        e.shieldHp -= dmg;
        if (e.shieldHp <= 0) e.shieldUp = false;
        e.hitFlashUntil = now + 150;
        spawnSparks(s, e.x, FLOOR_Y - ENEMY_H / 2);
        continue;
      }
      e.hp -= dmg;
      e.hitFlashUntil = now + 200;
      spawnBlood(s, e.x, FLOOR_Y - ENEMY_H / 2, true);
      spawnSparks(s, e.x, FLOOR_Y - ENEMY_H);
      hit = true;
      bumpSuperMeter(s, 12);
      if (e.hp <= 0) killEnemy(s, e, now);
    }
  }
  if (hit) {
    applyShake(s, 7);
    s.hitstop = 0.12;
    addFloat(s, s.player.x, FLOOR_Y - PLAYER_H - 8, "АПЕРКОТ!", "#fde047", 18);
    s.player.comboCount += 2;
    s.player.comboExpiresAt = now + 2200;
  }
}

function performSweep(s: GameState, now: number) {
  // Wide low arc — hits multiple
  s.player.uppercutUntil = now + 200;
  s.player.attackCooldownUntil = now + 560;
  s.player.punchUntil = now + 220;
  let hits = 0;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const dx = e.x - s.player.x;
    if (s.player.facing * dx > 0 && Math.abs(dx) < 70) {
      const dmg = 22 + Math.floor((now < s.player.berserkerUntil ? 14 : 0) + s.player.comboCount);
      if (e.kind === "shielder" && e.shieldUp) {
        e.shieldHp -= dmg;
        if (e.shieldHp <= 0) e.shieldUp = false;
        e.hitFlashUntil = now + 150;
        continue;
      }
      e.hp -= dmg;
      e.hitFlashUntil = now + 150;
      spawnBlood(s, e.x, FLOOR_Y - ENEMY_H / 2);
      hits += 1;
      bumpSuperMeter(s, 8);
      if (e.hp <= 0) killEnemy(s, e, now);
    }
  }
  if (hits > 0) {
    applyShake(s, 5);
    s.hitstop = 0.08;
    addFloat(s, s.player.x, FLOOR_Y - PLAYER_H - 8, `СВИП ×${hits}`, "#fb923c", 16);
    s.player.comboCount += hits;
    s.player.comboExpiresAt = now + 2400;
  }
}

function performFlurry(s: GameState, now: number) {
  // Barrage — 5 rapid hits over 500ms
  s.player.flurryUntil = now + 600;
  s.player.flurryHits = 5;
  s.player.attackCooldownUntil = now + 800;
  s.player.punchUntil = now + 600;
  addFloat(s, s.player.x, FLOOR_Y - PLAYER_H - 6, "ШКВАЛ!", "#ec4899", 18);
}

function performCounter(s: GameState, now: number) {
  // Counter — requires parry first, deals huge damage to anyone in range
  s.player.attackCooldownUntil = now + 700;
  let landed = false;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const dx = e.x - s.player.x;
    if (s.player.facing * dx > 0 && Math.abs(dx) < 55) {
      const dmg = 38 + (now < s.player.berserkerUntil ? 18 : 0);
      e.hp -= dmg;
      e.hitFlashUntil = now + 200;
      e.shieldUp = false; // shatters shields
      e.shieldHp = 0;
      spawnBlood(s, e.x, FLOOR_Y - ENEMY_H / 2, true);
      spawnSparks(s, e.x, FLOOR_Y - ENEMY_H / 2);
      landed = true;
      bumpSuperMeter(s, 15);
      if (e.hp <= 0) killEnemy(s, e, now);
    }
  }
  if (landed) {
    applyShake(s, 8);
    s.hitstop = 0.14;
    addFloat(s, s.player.x, FLOOR_Y - PLAYER_H - 8, "КОНТРА!", "#a855f7", 20);
    s.player.comboCount += 3;
    s.player.comboExpiresAt = now + 2400;
  }
}

function performTornado(s: GameState, now: number) {
  // 360° super move — hits everyone within range
  s.player.tornadoUntil = now + 900;
  s.player.attackCooldownUntil = now + 1100;
  applyShake(s, 10);
  spawnRageFlare(s, s.player.x, FLOOR_Y - PLAYER_H / 2);
  let killed = 0;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const dx = e.x - s.player.x;
    if (Math.abs(dx) < 90) {
      const dmg = 60 + (now < s.player.berserkerUntil ? 20 : 0);
      e.hp -= dmg;
      e.hitFlashUntil = now + 200;
      e.shieldUp = false;
      e.shieldHp = 0;
      spawnBlood(s, e.x, FLOOR_Y - ENEMY_H / 2, true);
      spawnSparks(s, e.x, FLOOR_Y - ENEMY_H / 2);
      if (e.hp <= 0) {
        killEnemy(s, e, now);
        killed += 1;
      }
    }
  }
  addFloat(s, s.player.x, FLOOR_Y - PLAYER_H - 10, `ТОРНАДО! ×${killed}`, "#22d3ee", 22);
  s.hitstop = 0.16;
  s.slowMoUntil = now + 400;
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
  const heldRef = useRef<Set<string>>(new Set()); // continuously held keys (move)
  const pressedRef = useRef<Set<string>>(new Set()); // one-shot keys consumed on use (attacks)
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
        comboCount: 0,
        comboExpiresAt: 0,
        rageUntil: 0,
        superMeter: 0,
        superDisplay: 0,
        inputBuffer: [],
        uppercutUntil: 0,
        flurryUntil: 0,
        flurryHits: 0,
        tornadoUntil: 0,
        berserkerUntil: 0,
        armPhaseL: 0,
        armPhaseR: Math.PI,
      },
      enemies: [],
      pickups: [],
      projectiles: [],
      crowd: makeCrowd(rng),
      wave: 0,
      killsThisWave: 0,
      killsTotal: 0,
      alive: true,
      rng,
      waveStartAt: performance.now(),
      waveBannerLife: 0,
      waveBannerText: "",
      waveBannerSub: "",
      particles: [],
      floats: [],
      shake: { mag: 0, life: 0 },
      animTime: 0,
      hitstop: 0,
      bgFlash: 0,
      slowMoUntil: 0,
      comboFlash: 0,
      cinematic: null,
    };
    spawnWave(st, performance.now());
    stateRef.current = st;
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

      // Hitstop + global slow-mo on boss-finisher
      const inSlowMo = now < s.slowMoUntil;
      let dt = s.hitstop > 0 ? dt0 * 0.15 : dt0;
      if (inSlowMo) dt *= 0.35;

      // Flurry barrage — fires hits at intervals
      if (s.player.flurryHits > 0 && now < s.player.flurryUntil) {
        const interval = 120;
        const remaining = s.player.flurryUntil - now;
        const idx = Math.floor((600 - remaining) / interval);
        if (idx >= 5 - s.player.flurryHits) {
          // Land next hit
          s.player.flurryHits -= 1;
          for (const e of s.enemies) {
            if (!e.alive) continue;
            const dxx = e.x - s.player.x;
            if (s.player.facing * dxx > 0 && Math.abs(dxx) < 50) {
              const dmg = 11 + (now < s.player.berserkerUntil ? 5 : 0);
              if (e.kind === "shielder" && e.shieldUp) {
                e.shieldHp -= dmg;
                if (e.shieldHp <= 0) e.shieldUp = false;
                e.hitFlashUntil = now + 100;
                continue;
              }
              e.hp -= dmg;
              e.hitFlashUntil = now + 100;
              spawnBlood(s, e.x, FLOOR_Y - ENEMY_H / 2);
              bumpSuperMeter(s, 5);
              if (e.hp <= 0) killEnemy(s, e, now);
              break;
            }
          }
        }
      }
      // Tornado super — radial damage tick
      if (now < s.player.tornadoUntil) {
        // Reapply visual + tick damage handled via punch but here just spawn spinning particles
        if (s.rng() < 0.6) {
          const ang = s.rng() * Math.PI * 2;
          s.particles.push({
            x: s.player.x + Math.cos(ang) * 50,
            y: FLOOR_Y - PLAYER_H / 2 + Math.sin(ang) * 40,
            vx: Math.cos(ang) * 60,
            vy: Math.sin(ang) * 60,
            life: 0.4,
            color: s.rng() < 0.5 ? "#22d3ee" : "#67e8f9",
            size: 3,
          });
        }
      }
      // Cinematic camera fade-out
      if (s.cinematic && now > s.cinematic.until) {
        s.cinematic = null;
      }
      if (s.hitstop > 0) s.hitstop = Math.max(0, s.hitstop - dt0);
      if (s.bgFlash > 0) s.bgFlash = Math.max(0, s.bgFlash - dt0 * 2);
      if (s.comboFlash > 0) s.comboFlash = Math.max(0, s.comboFlash - dt0 * 1.4);
      // Crowd bob + cheer decay (real-time, no slow-mo)
      for (const c of s.crowd) {
        c.bobPhase += dt0 * 5;
        if (c.cheer > 0) c.cheer = Math.max(0, c.cheer - dt0 * 0.7);
      }

      if (s.waveBannerLife > 0) s.waveBannerLife -= dt;
      if (s.shake.life > 0) {
        s.shake.life -= dt;
        if (s.shake.life <= 0) s.shake.mag = 0;
      }

      // HP display lerp
      if (Math.abs(s.player.hpDisplay - s.player.hp) > 0.5) {
        s.player.hpDisplay += (s.player.hp - s.player.hpDisplay) * Math.min(1, dt * 6);
      } else {
        s.player.hpDisplay = s.player.hp;
      }

      // Combo decay
      if (s.player.comboCount > 0 && now > s.player.comboExpiresAt) {
        s.player.comboCount = 0;
      }

      if (!s.alive) {
        end(s.killsTotal + s.wave * 5, {
          milestones: [{ wave: s.wave, kills: s.killsTotal, t: Date.now() }],
          meta: { wave: s.wave, kills: s.killsTotal },
        });
        return;
      }

      // Movement (continuous)
      const held = heldRef.current;
      const speed = 220;
      let moving = false;
      if (held.has("KeyA") || held.has("ArrowLeft")) {
        s.player.x = Math.max(20, s.player.x - speed * dt);
        s.player.facing = -1;
        moving = true;
      }
      if (held.has("KeyD") || held.has("ArrowRight")) {
        s.player.x = Math.min(W - 20, s.player.x + speed * dt);
        s.player.facing = 1;
        moving = true;
      }
      if (moving) s.player.walkPhase += dt * 14;

      // Pickups — collect on overlap
      for (const p of s.pickups) {
        if (p.collected) continue;
        p.bobPhase += dt * 4;
        if (Math.abs(p.x - s.player.x) < 22 && Math.abs((FLOOR_Y - PLAYER_H + PLAYER_H / 2) - p.y) < 50) {
          p.collected = true;
          if (p.kind === "hp") {
            const heal = 35;
            s.player.hp = Math.min(s.player.hpMax, s.player.hp + heal);
            addFloat(s, s.player.x, FLOOR_Y - PLAYER_H, `+${heal} HP`, "#22c55e", 16);
            for (let i = 0; i < 16; i++) {
              const a = s.rng() * Math.PI * 2;
              s.particles.push({
                x: p.x,
                y: p.y,
                vx: Math.cos(a) * 90,
                vy: Math.sin(a) * 90 - 40,
                life: 0.7,
                color: "#22c55e",
                size: 3,
              });
            }
          } else if (p.kind === "rage") {
            s.player.rageUntil = now + 5000;
            addFloat(s, s.player.x, FLOOR_Y - PLAYER_H, "ЯРОСТЬ ×2", "#ef4444", 18);
            spawnRageFlare(s, s.player.x, FLOOR_Y - PLAYER_H / 2);
            applyShake(s, 4);
          }
        }
      }
      s.pickups = s.pickups.filter((p) => !p.collected);

      // Smooth super-meter display lerp
      if (Math.abs(s.player.superDisplay - s.player.superMeter) > 0.5) {
        s.player.superDisplay += (s.player.superMeter - s.player.superDisplay) * Math.min(1, dt * 6);
      } else {
        s.player.superDisplay = s.player.superMeter;
      }

      // Action keys (one-shot)
      const pressed = pressedRef.current;
      if (pressedActionCode(pressed, "KeyJ")) {
        addInputToBuffer(s, "J", now);
        // Try combo recognition
        const combo = recogniseCombo(s, now);
        if (combo === "uppercut") {
          performUppercut(s, now);
        } else if (combo === "flurry") {
          performFlurry(s, now);
        } else if (combo === "counter") {
          performCounter(s, now);
        } else if (now > s.player.attackCooldownUntil) {
          const isRaging = now < s.player.rageUntil || now < s.player.berserkerUntil;
          const isCombo = s.player.comboCount >= 3;
          s.player.punchUntil = now + 180;
          s.player.attackCooldownUntil = now + (isCombo ? 280 : 380);
          let landed = false;
          let critOnBoss = false;
          for (const e of s.enemies) {
            if (!e.alive) continue;
            const dx = e.x - s.player.x;
            if (s.player.facing * dx > 0 && Math.abs(dx) < 50) {
              landed = true;
              let dmg = 18;
              if (isRaging) dmg *= 2;
              if (s.player.comboCount >= 5) dmg = Math.round(dmg * 1.4);
              else if (s.player.comboCount >= 3) dmg = Math.round(dmg * 1.2);
              const critRoll = s.rng();
              const critChance = 0.12 + s.player.comboCount * 0.02;
              const isCrit = critRoll < critChance;
              if (isCrit) {
                dmg = Math.round(dmg * 1.7);
                addFloat(s, e.x, FLOOR_Y - ENEMY_H - 8, "КРИТ!", "#fde047", 18);
                spawnSparks(s, e.x, FLOOR_Y - ENEMY_H / 2);
                applyShake(s, 6);
                s.hitstop = 0.08;
                if (e.kind === "boss") critOnBoss = true;
              }
              // Shielder absorbs punches until shield breaks
              if (e.kind === "shielder" && e.shieldUp) {
                e.shieldHp -= dmg;
                e.hitFlashUntil = now + 100;
                spawnSparks(s, e.x + e.facing * 14, FLOOR_Y - ENEMY_H / 2);
                addFloat(s, e.x, FLOOR_Y - ENEMY_H - 4, "🛡", "#22d3ee", 16);
                if (e.shieldHp <= 0) {
                  e.shieldUp = false;
                  applyShake(s, 5);
                  spawnSparks(s, e.x, FLOOR_Y - ENEMY_H / 2);
                  addFloat(s, e.x, FLOOR_Y - ENEMY_H - 8, "ЩИТ СЛОМАН", "#fbbf24", 14);
                }
                continue;
              }
              e.hp -= dmg;
              e.hitFlashUntil = now + 140;
              spawnBlood(s, e.x, FLOOR_Y - ENEMY_H / 2, isCrit || e.kind === "boss");
              if (!isCrit) applyShake(s, 3);
              if (e.hp <= 0) {
                killEnemy(s, e, now);
              } else {
                // Hit (not kill) — super meter gain
                bumpSuperMeter(s, isCrit ? 15 : 8);
              }
            }
          }
          if (landed) {
            s.player.comboCount += 1;
            s.player.comboExpiresAt = now + 1800;
            if (s.player.comboCount === 5) {
              addFloat(s, s.player.x, FLOOR_Y - PLAYER_H - 10, "СЕРИЯ ×5!", "#fb923c", 16);
              applyShake(s, 5);
            } else if (s.player.comboCount === 10) {
              addFloat(s, s.player.x, FLOOR_Y - PLAYER_H - 10, "СЕРИЯ ×10!!", "#ef4444", 20);
              applyShake(s, 8);
              spawnRageFlare(s, s.player.x, FLOOR_Y - PLAYER_H / 2);
            }
          } else {
            // Whiff resets combo a bit
            s.player.comboCount = Math.max(0, s.player.comboCount - 1);
          }
          if (critOnBoss) s.bgFlash = 0.5;
        }
      }
      if (pressedActionCode(pressed, "KeyK")) {
        addInputToBuffer(s, "K", now);
        // Try sweep combo
        const combo = recogniseCombo(s, now);
        if (combo === "sweep") {
          performSweep(s, now);
        } else if (now > s.player.dodgeUntil + 200) {
          s.player.dodgeUntil = now + 280;
          s.player.x = Math.max(20, Math.min(W - 20, s.player.x - s.player.facing * 28));
          // Brief afterimage particles
          for (let i = 0; i < 6; i++) {
            s.particles.push({
              x: s.player.x + s.rng() * 20 - 10,
              y: FLOOR_Y - PLAYER_H + 10 + s.rng() * 50,
              vx: -s.player.facing * 30,
              vy: 0,
              life: 0.3,
              color: "#67e8f9",
              size: 2,
            });
          }
        }
      }
      if (pressedActionCode(pressed, "KeyL")) {
        addInputToBuffer(s, "L", now);
        if (now > s.player.parryUntil + 800) {
          s.player.parryUntil = now + 260;
        }
      }
      // SUPER MOVES — M for tornado kick (level 1, 50 meter), N for berserker (level 2, 100 meter)
      if (pressedActionCode(pressed, "KeyM") && s.player.superMeter >= 50) {
        s.player.superMeter -= 50;
        performTornado(s, now);
      }
      if (pressedActionCode(pressed, "KeyN") && s.player.superMeter >= 100) {
        s.player.superMeter = 0;
        s.player.berserkerUntil = now + 8000;
        s.bgFlash = 0.8;
        s.hitstop = 0.18;
        applyShake(s, 12);
        spawnRageFlare(s, s.player.x, FLOOR_Y - PLAYER_H / 2);
        spawnRageFlare(s, s.player.x, FLOOR_Y - PLAYER_H / 2);
        addFloat(s, s.player.x, FLOOR_Y - PLAYER_H - 12, "БЕРСЕРКЕР!", "#ef4444", 22);
        // Crowd cheers when berserker fires
        for (const c of s.crowd) c.cheer = 1.0;
      }

      // Enemies
      for (let ei = 0; ei < s.enemies.length; ei++) {
        const e = s.enemies[ei];
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
          if (e.attacking <= 0) {
            // Zapper fires a projectile instead of melee
            if (e.kind === "zapper") {
              const vx = e.facing * 360;
              s.projectiles.push({
                x: e.x + e.facing * 18,
                y: FLOOR_Y - ENEMY_H / 2 + 4,
                vx,
                fromId: ei,
                life: 2.0,
                arcPhase: 0,
              });
              addFloat(s, e.x, FLOOR_Y - ENEMY_H, "⚡", "#fde047", 14);
              spawnSparks(s, e.x + e.facing * 14, FLOOR_Y - ENEMY_H / 2);
              continue;
            }
            if (dist < e.reach + 6) {
              const dodging = now < s.player.dodgeUntil;
              const parrying = now < s.player.parryUntil;
              const baseDmg =
                e.kind === "boss" ? 18 :
                e.kind === "veteran" ? 14 :
                e.kind === "shielder" ? 11 :
                10;
              if (parrying) {
                const refl = e.kind === "boss" ? 22 : 14;
                e.hp -= refl;
                e.hitFlashUntil = now + 140;
                spawnSparks(s, e.x, FLOOR_Y - ENEMY_H / 2);
                applyShake(s, 5);
                addFloat(s, e.x, FLOOR_Y - ENEMY_H - 4, "PARRY", "#a855f7", 14);
                if (e.hp <= 0) {
                  killEnemy(s, e, now);
                }
                e.attackCooldown = 1700;
                s.player.comboCount += 1;
                s.player.comboExpiresAt = now + 2200;
              } else if (!dodging) {
                s.player.hp = Math.max(0, s.player.hp - baseDmg);
                s.player.hitFlashUntil = now + 220;
                s.bgFlash = 0.35;
                addFloat(s, s.player.x, FLOOR_Y - PLAYER_H, `-${baseDmg}`, "#fda4af", 14);
                applyShake(s, e.kind === "boss" ? 8 : 5);
                spawnBlood(s, s.player.x, FLOOR_Y - PLAYER_H / 2);
                s.player.comboCount = 0;
              }
            }
          }
        } else {
          // For zapper: keep distance, attack from range
          if (e.kind === "zapper") {
            const ideal = 180;
            if (dist > ideal + 30) {
              e.x += Math.sign(dx) * e.speed * dt;
            } else if (dist < ideal - 30) {
              e.x -= Math.sign(dx) * e.speed * dt;
            }
            e.attackCooldown -= dt * 1000;
            if (e.attackCooldown <= 0 && dist <= e.reach) {
              e.attacking = 400;
              e.attackCooldown = 1800 + s.rng() * 800;
            }
          } else if (e.kind === "shielder") {
            if (dist > e.reach - 2) {
              e.x += Math.sign(dx) * e.speed * dt;
            } else {
              e.attackCooldown -= dt * 1000;
              if (e.attackCooldown <= 0) {
                e.attacking = 280;
                e.attackCooldown = 1300 + s.rng() * 600;
              }
            }
          } else {
            if (dist > e.reach - 2) {
              e.x += Math.sign(dx) * e.speed * dt;
            } else {
              e.attackCooldown -= dt * 1000;
              if (e.attackCooldown <= 0) {
                e.attacking = e.kind === "boss" ? 380 : 280;
                e.attackCooldown = (e.kind === "boss" ? 1500 : 1200) + s.rng() * 600;
              }
            }
          }
        }
      }

      // Projectiles
      for (const pr of s.projectiles) {
        pr.x += pr.vx * dt;
        pr.life -= dt;
        pr.arcPhase += dt * 18;
        // Hit player
        const dx2 = pr.x - s.player.x;
        if (Math.abs(dx2) < 18 && Math.abs(pr.y - (FLOOR_Y - PLAYER_H / 2)) < PLAYER_H / 2) {
          if (now < s.player.parryUntil) {
            // Reflect: zap goes back fast, doubled
            pr.vx = -pr.vx * 1.5;
            pr.fromId = -1;
            spawnSparks(s, pr.x, pr.y);
            addFloat(s, pr.x, pr.y - 12, "PARRY ⚡", "#a855f7", 14);
            applyShake(s, 4);
            s.player.comboCount += 1;
            s.player.comboExpiresAt = now + 2200;
          } else if (now < s.player.dodgeUntil) {
            // Pass through
          } else {
            const dmg = 11;
            s.player.hp = Math.max(0, s.player.hp - dmg);
            s.player.hitFlashUntil = now + 220;
            s.bgFlash = 0.35;
            addFloat(s, s.player.x, FLOOR_Y - PLAYER_H, `-${dmg}`, "#fda4af", 14);
            applyShake(s, 5);
            spawnSparks(s, s.player.x, FLOOR_Y - PLAYER_H / 2);
            s.player.comboCount = 0;
            pr.life = 0;
          }
        }
        // Reflected zap hits enemy
        if (pr.fromId === -1) {
          for (const e of s.enemies) {
            if (!e.alive) continue;
            if (Math.abs(pr.x - e.x) < 18 && Math.abs(pr.y - (FLOOR_Y - ENEMY_H / 2)) < ENEMY_H / 2) {
              e.hp -= 22;
              e.hitFlashUntil = now + 140;
              spawnSparks(s, e.x, FLOOR_Y - ENEMY_H / 2);
              pr.life = 0;
              if (e.hp <= 0) killEnemy(s, e, now);
              break;
            }
          }
        }
      }
      s.projectiles = s.projectiles.filter((p) => p.life > 0 && p.x > -40 && p.x < W + 40);
      s.enemies = s.enemies.filter((e) => e.alive || e.attacking > 0 || e.deathTimer > 0);

      if (s.enemies.every((e) => !e.alive)) {
        if (now - s.waveStartAt > 1500) spawnWave(s, now);
      }
      if (s.player.hp <= 0) s.alive = false;

      // Particles + floats
      for (const p of s.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 480 * dt;
        p.life -= dt * 1.4;
      }
      s.particles = s.particles.filter((p) => p.life > 0);
      for (const f of s.floats) {
        f.y -= 48 * dt;
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
      if (e.repeat) return;
      // Track held (continuous) keys
      heldRef.current.add(e.code);
      heldRef.current.add(e.key);
      // Track one-shot pressed keys for actions
      pressedRef.current.add(e.code);
      if (["ArrowLeft", "ArrowRight", " ", "Space"].includes(e.key) ||
          ["ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
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
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-sm text-rose-200">
              В{stateRef.current.wave} · {stateRef.current.killsTotal}🗡
            </div>
            {stateRef.current.player.comboCount >= 2 && (
              <div className="rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 font-mono text-sm text-orange-300">
                ×{stateRef.current.player.comboCount}
              </div>
            )}
            {stateRef.current.player.superMeter >= 50 && (
              <div className={"rounded-md border px-3 py-1.5 font-mono text-sm " + (stateRef.current.player.superMeter >= 100 ? "border-rose-500/60 bg-rose-500/20 text-rose-200 animate-pulse" : "border-cyan/50 bg-cyan/15 text-cyan")}>
                {stateRef.current.player.superMeter >= 100 ? "БЕРСЕРК ⚡" : "ТОРНАДО ✦"}
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

function draw(canvas: HTMLCanvasElement, s: GameState, now: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let shakeX = 0;
  let shakeY = 0;
  if (s.shake.mag > 0 && s.shake.life > 0) {
    shakeX = (Math.random() - 0.5) * s.shake.mag;
    shakeY = (Math.random() - 0.5) * s.shake.mag;
  }
  ctx.save();
  // Cinematic camera zoom
  if (s.cinematic && s.cinematic.active) {
    const remain = (s.cinematic.until - now) / 1500;
    const t = Math.max(0, Math.min(1, remain));
    const zoom = 1 + (s.cinematic.zoom - 1) * t;
    ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-s.cinematic.targetX, -s.cinematic.targetY);
  } else {
    ctx.translate(shakeX, shakeY);
  }

  // BG
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#2a0f10");
  grad.addColorStop(0.5, "#1a0a08");
  grad.addColorStop(1, "#0a0508");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // BG flash on heavy hits
  if (s.bgFlash > 0) {
    ctx.fillStyle = `rgba(220, 38, 38, ${s.bgFlash * 0.4})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Ceiling lamps
  for (let i = 0; i < 3; i++) {
    const lx = W * (0.2 + i * 0.3);
    const sway = Math.sin(s.animTime * 1.2 + i) * 6;
    ctx.strokeStyle = "rgba(255, 255, 200, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx + sway, 0);
    ctx.lineTo(lx, 40);
    ctx.stroke();
    ctx.fillStyle = "#1a1014";
    ctx.fillRect(lx - 8, 40, 16, 8);
    // Lamp pulse on rage
    const ragePulse = now < s.player.rageUntil ? 0.5 + Math.sin(s.animTime * 12) * 0.5 : 1;
    ctx.fillStyle = now < s.player.rageUntil ? `rgba(239, 68, 68, ${ragePulse})` : "#facc15";
    ctx.beginPath();
    ctx.arc(lx, 50, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = now < s.player.rageUntil ? `rgba(239, 68, 68, ${ragePulse * 0.08})` : "rgba(250, 204, 21, 0.06)";
    ctx.beginPath();
    ctx.moveTo(lx - 4, 50);
    ctx.lineTo(lx + 4, 50);
    ctx.lineTo(lx + 50, FLOOR_Y);
    ctx.lineTo(lx - 50, FLOOR_Y);
    ctx.closePath();
    ctx.fill();
  }

  // Back wall
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

  // Crowd silhouettes — sit at top, bob, cheer (arms-up) after wave clear
  for (const c of s.crowd) {
    const bob = Math.sin(c.bobPhase) * 1.5 + (c.cheer > 0 ? Math.sin(c.bobPhase * 3) * 3 * c.cheer : 0);
    const armUp = c.cheer > 0.3;
    const baseColor = `rgb(${c.shade}, ${Math.max(0, c.shade - 10)}, ${Math.max(0, c.shade - 20)})`;
    ctx.fillStyle = baseColor;
    // Head
    ctx.fillRect(c.x - 4, c.y + bob, 8, 6);
    // Body
    ctx.fillRect(c.x - 5, c.y + 6 + bob, 10, 12);
    // Arms
    if (armUp) {
      ctx.fillRect(c.x - 7, c.y - 4 + bob, 3, 8);
      ctx.fillRect(c.x + 4, c.y - 4 + bob, 3, 8);
    } else {
      ctx.fillRect(c.x - 7, c.y + 8 + bob, 3, 6);
      ctx.fillRect(c.x + 4, c.y + 8 + bob, 3, 6);
    }
  }

  ctx.fillStyle = "rgba(255, 80, 40, 0.04)";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * 160 + 20, FLOOR_Y - 18, 140, 14);
  }

  // Floor
  ctx.fillStyle = "#3a1820";
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.fillStyle = "rgba(255, 80, 80, 0.05)";
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(i * 80, FLOOR_Y + 5 + (i % 2) * 3, 60, 2);
  }

  // Pickups
  for (const p of s.pickups) {
    drawPickup(ctx, p);
  }

  // Enemies — sort: alive first
  const sortedEnemies = [...s.enemies].sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0));
  for (const e of sortedEnemies) drawEnemy(ctx, e, now);

  // Tornado visual ring around player
  if (now < s.player.tornadoUntil) {
    const remaining = (s.player.tornadoUntil - now) / 900;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const r = 30 + i * 12 + Math.sin(now / 100 + i) * 5;
      const grad = ctx.createRadialGradient(s.player.x, FLOOR_Y - PLAYER_H / 2, 4, s.player.x, FLOOR_Y - PLAYER_H / 2, r);
      grad.addColorStop(0, `rgba(34, 211, 238, ${0.6 * remaining})`);
      grad.addColorStop(1, "rgba(34, 211, 238, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.player.x, FLOOR_Y - PLAYER_H / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Swirling streaks
    for (let i = 0; i < 5; i++) {
      const ang = (now / 70 + i * Math.PI * 0.4) % (Math.PI * 2);
      const rr = 50 + Math.sin(now / 80 + i) * 10;
      const x1 = s.player.x + Math.cos(ang) * rr;
      const y1 = FLOOR_Y - PLAYER_H / 2 + Math.sin(ang) * 30;
      ctx.strokeStyle = `rgba(167, 243, 208, ${remaining * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.player.x, FLOOR_Y - PLAYER_H / 2);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Player
  drawPlayer(ctx, s.player, now);

  // Projectiles (zaps)
  for (const pr of s.projectiles) {
    const reflected = pr.fromId === -1;
    // Trail
    ctx.fillStyle = reflected ? "rgba(168, 85, 247, 0.5)" : "rgba(253, 224, 71, 0.4)";
    for (let i = 1; i < 5; i++) {
      ctx.fillRect(pr.x - pr.vx * 0.005 * i, pr.y - 1, 4, 2);
    }
    // Bolt — zigzag
    ctx.fillStyle = reflected ? "#c084fc" : "#fde047";
    ctx.fillRect(pr.x - 4, pr.y - 1, 8, 2);
    const wob = Math.sin(pr.arcPhase) * 2;
    ctx.fillRect(pr.x - 2, pr.y - 3 + wob, 4, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(pr.x - 2, pr.y, 2, 1);
  }

  // Particles
  for (const p of s.particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  // Floats
  for (const f of s.floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = f.color;
    ctx.font = `bold ${f.size}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";

  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, W, 30);
  // HP bar
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
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px monospace";
  ctx.fillText(`HP ${Math.ceil(p.hpDisplay)}`, 12, 18);
  // Super meter bar — below HP
  const superFrac = Math.max(0, Math.min(1, p.superDisplay / 100));
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(8, 24, 180, 4);
  if (superFrac > 0) {
    const sg = ctx.createLinearGradient(8, 0, 188, 0);
    if (p.superMeter >= 100) {
      // Berserker ready — pulsing red
      const pulse = 0.7 + Math.sin(now / 80) * 0.3;
      sg.addColorStop(0, `rgba(239, 68, 68, ${pulse})`);
      sg.addColorStop(1, `rgba(251, 146, 60, ${pulse})`);
    } else if (p.superMeter >= 50) {
      sg.addColorStop(0, "#22d3ee");
      sg.addColorStop(0.5, "#a855f7");
      sg.addColorStop(1, "#ec4899");
    } else {
      sg.addColorStop(0, "#22d3ee");
      sg.addColorStop(1, "#0ea5e9");
    }
    ctx.fillStyle = sg;
    ctx.fillRect(8, 24, 180 * superFrac, 4);
  }
  // Super tick marks at 50, 100
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fillRect(8 + 90, 23, 1, 6);
  ctx.fillRect(8 + 180, 23, 1, 6);
  // Super-meter readout
  ctx.fillStyle = p.superMeter >= 100 ? "#ef4444" : p.superMeter >= 50 ? "#a855f7" : "#94a3b8";
  ctx.font = "bold 8px monospace";
  ctx.fillText(
    p.superMeter >= 100 ? "БЕРСЕРК (N)" : p.superMeter >= 50 ? "ТОРНАДО (M)" : "СУПЕР",
    192,
    27,
  );
  // Combo counter
  if (p.comboCount >= 2) {
    const pulse = 0.7 + Math.sin(s.animTime * 12) * 0.3;
    ctx.fillStyle = `rgba(251, 146, 60, ${pulse})`;
    ctx.font = "bold 13px monospace";
    ctx.fillText(`COMBO ×${p.comboCount}`, 196, 19);
  }
  ctx.fillStyle = "#fda4af";
  ctx.font = "bold 11px monospace";
  ctx.fillText(`ВОЛНА ${s.wave}`, W - 200, 18);
  ctx.fillStyle = "#fde047";
  ctx.fillText(`🗡 ${s.killsTotal}`, W - 130, 18);
  // Rage timer
  if (now < p.rageUntil) {
    const remain = Math.max(0, (p.rageUntil - now) / 1000);
    ctx.fillStyle = "#ef4444";
    ctx.fillText(`🔥 ${remain.toFixed(1)}s`, W - 70, 18);
  } else {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px monospace";
    ctx.fillText(`J·K·L`, W - 50, 19);
  }

  // Slow-mo edges + center vignette
  if (now < s.slowMoUntil) {
    const remainingMs = s.slowMoUntil - now;
    const alpha = Math.min(1, remainingMs / 400);
    ctx.fillStyle = `rgba(251, 146, 60, ${alpha * 0.18})`;
    ctx.fillRect(0, 0, W, H);
    // Diagonal speed-tear lines
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.12})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 110, 0);
      ctx.lineTo(i * 110 + 50, H);
      ctx.stroke();
    }
  }
  // Combo screen-edge flash on big combos (10+)
  if (s.comboFlash > 0) {
    const edge = ctx.createLinearGradient(0, 0, 30, 0);
    edge.addColorStop(0, `rgba(251, 146, 60, ${s.comboFlash * 0.5})`);
    edge.addColorStop(1, "rgba(251, 146, 60, 0)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 30, 40, H - 30);
    const edgeR = ctx.createLinearGradient(W - 30, 0, W, 0);
    edgeR.addColorStop(0, "rgba(251, 146, 60, 0)");
    edgeR.addColorStop(1, `rgba(251, 146, 60, ${s.comboFlash * 0.5})`);
    ctx.fillStyle = edgeR;
    ctx.fillRect(W - 40, 30, 40, H - 30);
  }

  // Wave banner
  if (s.waveBannerLife > 0) {
    const alpha = Math.min(1, s.waveBannerLife * 1.4);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(0, H / 2 - 32, W, 64);
    ctx.fillStyle = s.waveBannerText.includes("БОСС") ? "#fb923c" : "#dc2626";
    ctx.font = "bold 26px monospace";
    ctx.textAlign = "center";
    ctx.fillText(s.waveBannerText, W / 2, H / 2 + 2);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 12px monospace";
    ctx.fillText(s.waveBannerSub, W / 2, H / 2 + 22);
    ctx.globalAlpha = 1;
    ctx.textAlign = "start";
  }

  ctx.restore();
}

function drawPickup(ctx: CanvasRenderingContext2D, p: Pickup) {
  const bob = Math.sin(p.bobPhase) * 4;
  const x = p.x;
  const y = p.y + bob;
  // Halo
  ctx.fillStyle = p.kind === "hp"
    ? "rgba(34, 197, 94, 0.2)"
    : "rgba(239, 68, 68, 0.25)";
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();
  // Icon
  if (p.kind === "hp") {
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(x - 6, y - 2, 12, 4);
    ctx.fillRect(x - 2, y - 6, 4, 12);
  } else {
    // Rage = flame
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.bezierCurveTo(x - 6, y - 4, x - 6, y + 4, x, y + 6);
    ctx.bezierCurveTo(x + 6, y + 4, x + 6, y - 4, x, y - 8);
    ctx.fill();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.bezierCurveTo(x - 3, y - 2, x - 3, y + 3, x, y + 4);
    ctx.bezierCurveTo(x + 3, y + 3, x + 3, y - 2, x, y - 4);
    ctx.fill();
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, now: number) {
  const py = FLOOR_Y - PLAYER_H;
  const isPunching = now < p.punchUntil;
  const isParrying = now < p.parryUntil;
  const isDodging = now < p.dodgeUntil;
  const isHit = now < p.hitFlashUntil;
  const isRaging = now < p.rageUntil;
  const wob = Math.sin(p.walkPhase) * 1.5;
  const yOff = isDodging ? 4 : wob;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(p.x, FLOOR_Y + 2, PLAYER_W / 2 + 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rage glow
  if (isRaging) {
    const pulse = 0.5 + Math.sin(now / 80) * 0.5;
    ctx.fillStyle = `rgba(239, 68, 68, ${pulse * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(p.x, py + PLAYER_H / 2 + yOff, PLAYER_W / 2 + 8, PLAYER_H / 2 + 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body
  const bodyColor = isHit ? "#fee2e2" : isDodging ? "#67e8f9" : isRaging ? "#fda4af" : "#22d3ee";
  ctx.fillStyle = bodyColor;
  ctx.fillRect(p.x - PLAYER_W / 2, py + yOff, PLAYER_W, PLAYER_H);
  ctx.fillStyle = isRaging ? "#dc2626" : "#0e7490";
  ctx.fillRect(p.x - PLAYER_W / 2, py + PLAYER_H - 14 + yOff, PLAYER_W, 14);
  // Head
  ctx.fillStyle = "#f5e8d4";
  ctx.fillRect(p.x - 10, py + 6 + yOff, 20, 18);
  ctx.fillStyle = "#0a0508";
  if (p.facing > 0) ctx.fillRect(p.x + 3, py + 14 + yOff, 2, 2);
  else ctx.fillRect(p.x - 5, py + 14 + yOff, 2, 2);
  // Combo indicator above head
  if (p.comboCount >= 3) {
    ctx.fillStyle = "#fb923c";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`×${p.comboCount}`, p.x, py - 4 + yOff);
    ctx.textAlign = "start";
  }
  // Arms
  if (isPunching) {
    ctx.fillStyle = isRaging ? "#fde047" : "#fde047";
    ctx.fillRect(p.x + (p.facing > 0 ? PLAYER_W / 2 : -PLAYER_W / 2 - 14), py + 28 + yOff, 14, 6);
    ctx.fillStyle = isRaging ? "rgba(239, 68, 68, 0.5)" : "rgba(253, 224, 71, 0.4)";
    for (let i = 1; i <= 3; i++) {
      ctx.fillRect(
        p.x + (p.facing > 0 ? PLAYER_W / 2 - i * 6 : -PLAYER_W / 2 + i * 6 - 14),
        py + 32 + yOff,
        14 - i * 2,
        2,
      );
    }
  } else {
    const armSwing = Math.sin(p.walkPhase) * 3;
    ctx.fillStyle = bodyColor;
    ctx.fillRect(p.x - PLAYER_W / 2 - 1, py + 24 + yOff + armSwing, 4, 18);
    ctx.fillRect(p.x + PLAYER_W / 2 - 3, py + 24 + yOff - armSwing, 4, 18);
  }
  if (isParrying) {
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x - PLAYER_W / 2 - 3, py - 3, PLAYER_W + 6, PLAYER_H + 6);
    const t = (now / 80) % (Math.PI * 2);
    ctx.fillStyle = `rgba(168, 85, 247, ${0.3 + Math.sin(t) * 0.2})`;
    ctx.fillRect(p.x - PLAYER_W / 2 - 1, py - 1, PLAYER_W + 2, PLAYER_H + 2);
  }
  if (isDodging) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(p.x - PLAYER_W / 2 - p.facing * 12, py + yOff, PLAYER_W, PLAYER_H);
    ctx.globalAlpha = 1;
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, now: number) {
  const isBoss = e.kind === "boss";
  const isVeteran = e.kind === "veteran";
  const isZapper = e.kind === "zapper";
  const isShielder = e.kind === "shielder";
  const w = isBoss ? BOSS_W : ENEMY_W;
  const h = isBoss ? BOSS_H : ENEMY_H;
  const py = FLOOR_Y - h;
  const isHit = now < e.hitFlashUntil;
  const isDead = !e.alive;
  const fadeAlpha = isDead ? Math.max(0, e.deathTimer / 0.5) : 1;

  ctx.globalAlpha = fadeAlpha;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(e.x, FLOOR_Y + 2, w / 2 + 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isDead) {
    ctx.save();
    ctx.translate(e.x, FLOOR_Y);
    ctx.rotate((1 - fadeAlpha) * Math.PI * 0.5);
    ctx.fillStyle = isBoss ? "#581c1c" : "#7f1d1d";
    ctx.fillRect(-w / 2, -h, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  const wob = Math.sin(e.walkPhase) * 1.5;
  const yOff = wob;
  // Body
  const bodyColor = isHit
    ? "#fee2e2"
    : isBoss
      ? "#4c0519"
      : isVeteran
        ? "#991b1b"
        : isZapper
          ? "#3b0764"
          : isShielder
            ? "#1e3a8a"
            : "#7f1d1d";
  ctx.fillStyle = bodyColor;
  ctx.fillRect(e.x - w / 2, py + yOff, w, h);
  // Armor / belt
  ctx.fillStyle = isBoss ? "#a16207" : isVeteran ? "#dc2626" : "#dc2626";
  ctx.fillRect(e.x - w / 2, py + h - 16 + yOff, w, 14);
  if (isBoss) {
    // Boss armor stripes
    ctx.fillStyle = "#facc15";
    ctx.fillRect(e.x - w / 2, py + h * 0.35 + yOff, w, 4);
    ctx.fillRect(e.x - w / 2, py + h * 0.55 + yOff, w, 4);
  }
  // Head
  ctx.fillStyle = isBoss ? "#fcd34d" : "#fde047";
  ctx.fillRect(e.x - (isBoss ? 12 : 9), py + 6 + yOff, isBoss ? 24 : 18, isBoss ? 18 : 14);
  // Visor
  ctx.fillStyle = isBoss ? "#7c2d12" : "#0a0508";
  ctx.fillRect(e.x - (isBoss ? 10 : 7), py + 12 + yOff, isBoss ? 20 : 14, isBoss ? 5 : 4);
  if (isBoss) {
    // Glowing visor
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(e.x - 8, py + 14 + yOff, 16, 1);
  }
  // HP bar
  const barW = isBoss ? 48 : 32;
  ctx.fillStyle = "#1a0a08";
  ctx.fillRect(e.x - barW / 2, py - 10, barW, 5);
  const hpFrac = Math.max(0, e.hp / e.hpMax);
  ctx.fillStyle = hpFrac > 0.5 ? "#22c55e" : hpFrac > 0.25 ? "#fbbf24" : "#dc2626";
  ctx.fillRect(e.x - barW / 2, py - 10, barW * hpFrac, 5);
  // Wind-up indicator
  if (e.attacking > 0) {
    const pulse = 0.5 + Math.sin(now / 30) * 0.5;
    ctx.fillStyle = `rgba(${isBoss ? "239, 68, 68" : "253, 224, 71"}, ${pulse})`;
    ctx.beginPath();
    ctx.moveTo(e.x, py - 18);
    ctx.lineTo(e.x - 6, py - 11);
    ctx.lineTo(e.x + 6, py - 11);
    ctx.closePath();
    ctx.fill();
  }
  // Type-specific visual flourishes
  if (isZapper) {
    // Antenna + spark on head
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(e.x - 1, py - 4 + yOff, 2, 6);
    const sparkPulse = (Math.sin(now / 100) + 1) / 2;
    ctx.fillStyle = `rgba(253, 224, 71, ${sparkPulse})`;
    ctx.fillRect(e.x - 2, py - 6 + yOff, 4, 2);
    // Zap gun in hand
    ctx.fillStyle = "#1e1b4b";
    ctx.fillRect(e.x + e.facing * (w / 2 - 2), py + 28 + yOff, e.facing * 8, 4);
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(e.x + e.facing * (w / 2 + 4), py + 28 + yOff, 2, 4);
  }
  if (isShielder) {
    // Riot shield in front
    const sx = e.x + e.facing * (w / 2 + 1);
    if (e.shieldUp) {
      // Translucent base
      ctx.fillStyle = "rgba(34, 211, 238, 0.4)";
      ctx.fillRect(sx, py + 4 + yOff, e.facing * 5, h - 14);
      // Border
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(sx, py + 4 + yOff, e.facing * 1, h - 14);
      ctx.fillRect(sx + e.facing * 4, py + 4 + yOff, e.facing * 1, h - 14);
      // Cross
      ctx.fillStyle = "#a5f3fc";
      ctx.fillRect(sx + e.facing * 1, py + h / 2 - 1 + yOff, e.facing * 3, 2);
      ctx.fillRect(sx + e.facing * 2, py + h / 2 - 4 + yOff, e.facing * 1, 8);
      // Shield HP mini-bar
      const sFrac = Math.max(0, e.shieldHp / (40 + s_brawler_wave_for_label_only(e.hpMax)));
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(e.x - 14, py - 4, 28, 3);
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(e.x - 14, py - 4, 28 * sFrac, 3);
    }
  }
  // Kind label badge
  if (isBoss) {
    ctx.fillStyle = "#fb923c";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("БОСС", e.x, py - 18);
    ctx.textAlign = "start";
  } else if (isVeteran) {
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("ВЕТ", e.x, py - 16);
    ctx.textAlign = "start";
  } else if (isZapper) {
    ctx.fillStyle = "#c084fc";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("ЗАП ⚡", e.x, py - 16);
    ctx.textAlign = "start";
  } else if (isShielder) {
    ctx.fillStyle = "#67e8f9";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("ЩИТ 🛡", e.x, py - 16);
    ctx.textAlign = "start";
  }
  ctx.globalAlpha = 1;
}

// Helper used only for shielder bar normalisation; harmless if hpMax 0
function s_brawler_wave_for_label_only(hpMax: number): number {
  // 40 (base shielder shield) + wave * 3 (scaling). Wave is approx hpMax/4.
  return Math.max(40, hpMax * 0.8);
}
