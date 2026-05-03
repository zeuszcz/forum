"use client";

import { motion } from "framer-motion";

import type { ActivityDay } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HeatmapProps {
  days: ActivityDay[];
  /** Cell size in px (default 12) */
  cell?: number;
}

const MONTHS_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

const WEEKDAY_LABELS = ["", "Пн", "", "Ср", "", "Пт", ""];

/** Map intensity (post+reaction count) to a Tailwind opacity / color. */
function intensityClass(score: number): string {
  if (score === 0) return "bg-white/[0.04] border border-transparent";
  if (score <= 2) return "bg-plasma/25 border border-plasma/30";
  if (score <= 5) return "bg-plasma/55 border border-plasma/50";
  if (score <= 10) return "bg-plasma/80 border border-plasma/70";
  return "bg-plasma border border-plasma";
}

/**
 * GitHub-style heatmap: weeks as columns, weekday as row (Mon top → Sun bottom).
 * Day count is whatever backend returns (90 default). Cells colored by the
 * sum of posts + reactions on that day.
 */
export function ActivityHeatmap({ days, cell = 12 }: HeatmapProps) {
  if (days.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-xs text-smoke">
        Активности пока нет
      </div>
    );
  }

  // Group into weeks. First column is the partial week containing the first day.
  // We align grid by starting on a fresh week column for the first Monday.
  const parsed = days.map((d) => ({
    ...d,
    dt: new Date(d.date + "T00:00:00Z"),
    score: d.posts + d.reactions,
  }));

  // ISO weekday: Monday = 1, Sunday = 7. Shift to 0-indexed Mon=0..Sun=6.
  function dow(d: Date): number {
    const wd = d.getUTCDay(); // 0=Sun..6=Sat
    return wd === 0 ? 6 : wd - 1;
  }

  // Build 2D grid: cols (weeks) × 7 rows
  const cols: ((typeof parsed)[number] | null)[][] = [];
  let currentCol: ((typeof parsed)[number] | null)[] = Array(7).fill(null);
  parsed.forEach((day, idx) => {
    const row = dow(day.dt);
    if (row === 0 && idx > 0) {
      cols.push(currentCol);
      currentCol = Array(7).fill(null);
    }
    currentCol[row] = day;
  });
  cols.push(currentCol);

  // Compute month labels above columns — show month name at the column where it changes
  const monthLabels = cols.map((col, i) => {
    const firstDay = col.find((d) => d !== null);
    if (!firstDay) return "";
    const m = firstDay.dt.getUTCMonth();
    if (i === 0) return MONTHS_RU[m];
    const prev = cols[i - 1].find((d) => d !== null);
    if (prev && prev.dt.getUTCMonth() !== m) return MONTHS_RU[m];
    return "";
  });

  const gap = 3;
  const totalScore = parsed.reduce((s, d) => s + d.score, 0);
  const activeDays = parsed.filter((d) => d.score > 0).length;
  const longestStreak = computeLongestStreak(parsed.map((d) => d.score));

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-bone">Активность</h3>
          <p className="text-[11px] text-smoke">
            {parsed.length} дней · {activeDays} активных · стрик {longestStreak}
          </p>
        </div>
        <div className="text-[11px] text-smoke">
          {totalScore} событий
        </div>
      </header>

      <div className="relative overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          {/* month-label row */}
          <div className="flex pl-7" style={{ gap }}>
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="text-[9px] uppercase tracking-widest text-smoke"
                style={{ width: cell }}
              >
                {m}
              </div>
            ))}
          </div>

          {/* grid: 7 rows × cols.length cols */}
          <div className="flex gap-[3px]">
            {/* weekday labels column */}
            <div className="flex flex-col" style={{ gap }}>
              {WEEKDAY_LABELS.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center text-[9px] text-smoke"
                  style={{ height: cell, width: 22 }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* cells */}
            <div className="flex" style={{ gap }}>
              {cols.map((col, ci) => (
                <div key={ci} className="flex flex-col" style={{ gap }}>
                  {col.map((day, ri) => (
                    <motion.div
                      key={`${ci}-${ri}`}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: Math.min(0.005 * (ci * 7 + ri), 0.6),
                        duration: 0.18,
                      }}
                      title={
                        day
                          ? `${day.date}\n${day.posts} постов · ${day.reactions} реакций`
                          : ""
                      }
                      className={cn(
                        "rounded-[2px] transition-[transform,box-shadow] duration-150 hover:scale-125 hover:shadow-glow-plasma",
                        day ? intensityClass(day.score) : "bg-transparent",
                      )}
                      style={{ width: cell, height: cell }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-smoke">
        <span>меньше</span>
        {[0, 1, 4, 8, 15].map((s) => (
          <span
            key={s}
            className={cn("h-2.5 w-2.5 rounded-[2px]", intensityClass(s))}
          />
        ))}
        <span>больше</span>
      </div>
    </section>
  );
}

function computeLongestStreak(scores: number[]): number {
  let best = 0;
  let cur = 0;
  for (const s of scores) {
    if (s > 0) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}
