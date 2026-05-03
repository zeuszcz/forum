"use client";

/**
 * Tiny Web-Audio "ui sounds" library.
 * Off by default. Enabled via localStorage key `ew_sfx`.
 *
 * Usage:
 *   import { sfx } from "@/lib/audio";
 *   sfx.click();    sfx.like();    sfx.message();
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return ctx;
}

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("ew_sfx") === "1";
}

function tone(
  freq: number,
  durMs: number,
  type: OscillatorType = "sine",
  volume: number = 0.05,
) {
  if (!isEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + durMs / 1000 + 0.05);
}

export const sfx = {
  click: () => tone(880, 60, "sine", 0.04),
  like: () => {
    tone(660, 80, "triangle", 0.05);
    setTimeout(() => tone(880, 80, "triangle", 0.04), 50);
  },
  message: () => {
    tone(523, 70, "sine", 0.05);
    setTimeout(() => tone(659, 70, "sine", 0.04), 60);
  },
  achievement: () => {
    tone(523, 80, "triangle", 0.05);
    setTimeout(() => tone(659, 80, "triangle", 0.05), 80);
    setTimeout(() => tone(784, 120, "triangle", 0.05), 160);
  },
  setEnabled(enabled: boolean) {
    if (typeof window === "undefined") return;
    localStorage.setItem("ew_sfx", enabled ? "1" : "0");
  },
  isEnabled,
};
