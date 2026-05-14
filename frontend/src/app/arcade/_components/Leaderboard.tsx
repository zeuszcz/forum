"use client";

import { Award, Crown, Medal, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type LeaderEntry = {
  rank: number;
  user_id: number;
  user_nickname: string;
  user_title: string | null;
  user_avatar_url: string | null;
  score: number;
  ended_at: string;
  run_id: number;
};

type LeaderboardResponse = {
  game_slug: string;
  period: string;
  year_month: string | null;
  entries: LeaderEntry[];
};

export function Leaderboard({
  slug,
  initialPeriod = "month",
  limit = 50,
  scoreUnit = "score",
}: {
  slug: string;
  initialPeriod?: "month" | "all";
  limit?: number;
  scoreUnit?: string;
}) {
  const [period, setPeriod] = useState<"month" | "all">(initialPeriod);
  const [data, setData] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<LeaderboardResponse>(
        `/api/arcade/games/${slug}/leaderboard?period=${period}&limit=${limit}`,
      );
      setData(res.entries);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [slug, period, limit]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-smoke">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          Лидерборд
        </div>
        <div className="flex rounded-md border border-border bg-void/30 p-0.5 text-[10px] uppercase tracking-widest">
          <button
            type="button"
            onClick={() => setPeriod("month")}
            className={cn(
              "rounded-sm px-2 py-1 transition-colors",
              period === "month"
                ? "bg-cyan/15 text-cyan"
                : "text-smoke hover:text-bone",
            )}
          >
            месяц
          </button>
          <button
            type="button"
            onClick={() => setPeriod("all")}
            className={cn(
              "rounded-sm px-2 py-1 transition-colors",
              period === "all"
                ? "bg-cyan/15 text-cyan"
                : "text-smoke hover:text-bone",
            )}
          >
            все
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-smoke">Загрузка…</div>
      ) : data.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-void/20 p-6 text-center text-xs text-smoke">
          Пусто. Будь первым.
        </div>
      ) : (
        <ul className="space-y-1">
          {data.map((e) => (
            <li
              key={e.run_id}
              className={cn(
                "flex items-center gap-3 rounded-md border border-border bg-void/30 p-2",
                e.rank === 1 && "border-amber-500/40 bg-amber-500/5",
                e.rank === 2 && "border-cyan/40 bg-cyan/5",
                e.rank === 3 && "border-orange-500/40 bg-orange-500/5",
              )}
            >
              <RankBadge rank={e.rank} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-bone">
                  {e.user_nickname}
                </div>
                {e.user_title && (
                  <div className="truncate text-[10px] uppercase tracking-widest text-amber-300">
                    {e.user_title}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-bold text-bone">
                  {e.score.toLocaleString("ru-RU")}
                </div>
                <div className="text-[9px] uppercase tracking-widest text-smoke">
                  {scoreUnit}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-5 w-5 shrink-0 text-amber-400" />;
  if (rank === 2) return <Medal className="h-5 w-5 shrink-0 text-cyan" />;
  if (rank === 3) return <Award className="h-5 w-5 shrink-0 text-orange-400" />;
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-void/40 font-mono text-[10px] text-smoke">
      {rank}
    </div>
  );
}
