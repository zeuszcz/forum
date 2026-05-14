"use client";

import { ChevronLeft, Crown, Play, RotateCw, Trophy } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";

import { Leaderboard } from "../../_components/Leaderboard";
import { ArcadeRunState } from "../../_components/useArcadeRun";
import { cn } from "@/lib/utils";

type GameMeta = {
  slug: string;
  title: string;
  emoji: string;
  accent: string;
  description: string;
  controls: string;
  score_unit: string;
};

export function GameShell({
  game,
  runState,
  error,
  onStart,
  canvasArea,
  scoreBadge,
}: {
  game: GameMeta;
  runState: ArcadeRunState;
  error: string | null;
  onStart: () => void;
  canvasArea: ReactNode;
  scoreBadge?: ReactNode;
}) {
  const isIdle = runState.phase === "idle";
  const isEnded = runState.phase === "ended";

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/arcade"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          К аркаде
        </Link>
        {scoreBadge}
      </div>

      <header className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="text-4xl">{game.emoji}</span>
          <div className="min-w-0 flex-1">
            <h1 className={cn("text-xl font-bold", game.accent)}>
              {game.title}
            </h1>
            <p className="mt-1 text-xs text-smoke">{game.description}</p>
            <div className="mt-2 text-[10px] uppercase tracking-widest text-smoke">
              <span className="text-bone">{game.controls}</span>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        {/* Game canvas + controls */}
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg border border-border bg-void/60">
            {canvasArea}
            {(isIdle || isEnded) && (
              <div className="absolute inset-0 flex items-center justify-center bg-void/80 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-center shadow-2xl">
                  {isEnded && runState.phase === "ended" && (
                    <EndedSummary state={runState} unit={game.score_unit} />
                  )}
                  <button
                    type="button"
                    onClick={onStart}
                    className="mx-auto inline-flex items-center gap-2 rounded-md border border-flame/50 bg-flame/15 px-6 py-2.5 text-sm font-semibold uppercase tracking-widest text-flame transition-colors hover:bg-flame/25"
                  >
                    {isEnded ? (
                      <>
                        <RotateCw className="h-4 w-4" /> Ещё раз
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" /> Начать
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            {runState.phase === "submitting" && (
              <div className="absolute inset-0 flex items-center justify-center bg-void/80 text-sm text-smoke">
                Отправка результата…
              </div>
            )}
          </div>
        </div>

        {/* Sidebar leaderboard */}
        <aside>
          <Leaderboard slug={game.slug} scoreUnit={game.score_unit} limit={10} />
        </aside>
      </div>

      <Link
        href={`/arcade/${game.slug}/leaders`}
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
      >
        <Trophy className="h-3.5 w-3.5" />
        Полный лидерборд
      </Link>
    </div>
  );
}

function EndedSummary({
  state,
  unit,
}: {
  state: Extract<ArcadeRunState, { phase: "ended" }>;
  unit: string;
}) {
  return (
    <div className="mb-4 space-y-2">
      {state.accepted ? (
        <>
          <div className="text-[10px] uppercase tracking-widest text-smoke">
            Итог
          </div>
          <div className="font-mono text-3xl font-bold text-bone">
            {state.score.toLocaleString("ru-RU")}{" "}
            <span className="text-xs uppercase tracking-widest text-smoke">
              {unit}
            </span>
          </div>
          {state.rankMonth && (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
              <Crown className="h-3.5 w-3.5" />
              место в месяце: #{state.rankMonth}
            </div>
          )}
          {state.rankAll && (
            <div className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/10 px-3 py-1 text-xs text-cyan">
              all-time: #{state.rankAll}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          Результат отклонён ({state.reason ?? "anti-cheat"}). Сыграй ещё.
        </div>
      )}
    </div>
  );
}
