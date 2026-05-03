"use client";

import { motion } from "framer-motion";
import { Check, Copy, Server, Users, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

/**
 * Mock CS 1.6 jail server widget. Stays as the visual scaffold until real
 * RCON / amxx HTTP plugin is wired up — see Phase 3 roadmap.
 *
 * Slowly cycles map and player count to feel "alive" while the data
 * source is mocked. Click connect-pill to copy "connect IP:PORT".
 */

const MOCK_MAPS = [
  "jail_war_2026_b3",
  "jail_alcatraz_v8",
  "jail_winter_x",
  "jail_industrial",
];

const MOCK_PLAYER_COUNT = [12, 14, 17, 22, 19, 24, 28, 26, 21, 18, 16, 14];

const SERVER_NAME = "endless-war jail · #1";
const SERVER_ADDRESS = "ew-jail.innertalk.space:27015";

export function ServerStatusWidget() {
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 8000);
    return () => window.clearInterval(id);
  }, []);

  const map = MOCK_MAPS[tick % MOCK_MAPS.length];
  const players = MOCK_PLAYER_COUNT[tick % MOCK_PLAYER_COUNT.length];
  const ping = 14 + ((tick * 7) % 28);
  const fillPct = (players / 32) * 100;

  function copyConnect() {
    const cmd = `connect ${SERVER_ADDRESS}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(cmd)
        .then(() => {
          setCopied(true);
          toast.success("connect-команда в буфере");
          setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => toast.error("Не удалось скопировать"));
    }
  }

  return (
    <section className="relative overflow-hidden rounded-lg border border-cyan/30 bg-card">
      {/* Subtle radial cyan glow at top */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse 60% 100% at 50% 0%, rgb(var(--cyan-rgb) / 0.18), transparent 70%)",
        }}
      />

      <header className="relative flex items-center justify-between border-b border-cyan/15 px-4 py-3">
        <div className="inline-flex items-center gap-2">
          <Server className="h-4 w-4 text-cyan" />
          <h2 className="text-sm font-semibold tracking-tight text-bone">
            CS 1.6 сервер
          </h2>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="dot-live animate-pulse-slow" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-cyan">
            online
          </span>
        </div>
      </header>

      <div className="relative space-y-3 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-smoke">имя</div>
          <div className="truncate text-sm font-semibold text-bone">
            {SERVER_NAME}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-smoke">
              карта
            </div>
            <motion.div
              key={map}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="font-mono text-xs text-cyan"
            >
              {map}
            </motion.div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-smoke">
              пинг
            </div>
            <div className="font-mono text-xs text-ash">
              <Wifi className="mr-1 inline h-3 w-3" />
              {ping} ms
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between text-[10px] uppercase tracking-widest text-smoke">
            <span>
              <Users className="mr-1 inline h-3 w-3" />
              игроки
            </span>
            <span>
              <span className="font-mono text-bone">{players}</span> / 32
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-void">
            <motion.div
              className="h-full rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, rgb(var(--cyan-rgb)), rgb(var(--plasma-rgb)))",
                boxShadow: "0 0 8px rgb(var(--cyan-rgb) / 0.6)",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${fillPct}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={copyConnect}
          className={cn(
            "group flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-mono transition-colors",
            copied
              ? "border-success/40 bg-success/10 text-success"
              : "border-border bg-void/60 text-ash hover:border-cyan/40 hover:bg-cyan/5 hover:text-bone",
          )}
        >
          <span className="truncate">
            <span className="text-smoke">$</span> connect {SERVER_ADDRESS}
          </span>
          {copied ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Copy className="h-3.5 w-3.5 shrink-0 transition-colors group-hover:text-cyan" />
          )}
        </button>
        <p className="text-[10px] text-smoke">
          mock-данные · реальный RCON в Phase 3
        </p>
      </div>
    </section>
  );
}
