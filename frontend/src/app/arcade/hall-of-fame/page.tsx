"use client";

import { motion } from "framer-motion";
import { ChevronLeft, Crown, Medal, Award, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Game = { slug: string; title: string; emoji: string; accent: string };

type Row = {
  rank: number;
  user_id: number;
  user_nickname: string;
  user_avatar_url: string | null;
  score: number;
  payout_karma: number;
  payout_keys: number;
  title_grant: string | null;
};

type Section = {
  year_month: string;
  game_slug: string;
  entries: Row[];
};

export default function HallOfFamePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [gs, hof] = await Promise.all([
        api<Game[]>("/api/arcade/games"),
        api<Section[]>("/api/arcade/hall-of-fame?limit_months=12"),
      ]);
      setGames(gs);
      setSections(hof);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (user === null) {
      router.push("/login");
      return;
    }
    if (user) void fetchAll();
  }, [user, fetchAll, router]);

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка…
      </div>
    );
  }

  // Group by year_month for nicer display
  const byMonth: Record<string, Section[]> = {};
  for (const s of sections) {
    byMonth[s.year_month] ??= [];
    byMonth[s.year_month].push(s);
  }
  const months = Object.keys(byMonth).sort((a, b) => (a > b ? -1 : 1));
  const gameMap = new Map(games.map((g) => [g.slug, g] as const));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/arcade"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          К аркаде
        </Link>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-300">
          <Trophy className="h-3.5 w-3.5" />
          Зал славы
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          Топ-3 каждой игры по месяцам. Замораживается 1-го числа.
        </p>
      </div>

      {months.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-void/20 p-10 text-center text-sm text-smoke">
          Ещё ни одного месяца не подведено. Первая заморозка — 1-го числа.
        </div>
      ) : (
        months.map((ym) => (
          <section key={ym} className="space-y-3">
            <div className="text-sm font-semibold text-bone">{prettyMonth(ym)}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(byMonth[ym] || []).map((s) => {
                const game = gameMap.get(s.game_slug);
                const podium = s.entries.filter((e) => e.rank <= 3);
                return (
                  <motion.div
                    key={`${ym}-${s.game_slug}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-2xl">{game?.emoji ?? "🎮"}</span>
                      <div className={cn("text-sm font-semibold", game?.accent ?? "text-bone")}>
                        {game?.title ?? s.game_slug}
                      </div>
                    </div>
                    {podium.length === 0 ? (
                      <div className="text-xs text-smoke italic">пусто</div>
                    ) : (
                      <ul className="space-y-1">
                        {podium.map((e) => (
                          <li
                            key={e.rank}
                            className={cn(
                              "flex items-center gap-2 rounded-md border border-border bg-void/30 p-2 text-xs",
                              e.rank === 1 && "border-amber-500/40 bg-amber-500/5",
                              e.rank === 2 && "border-cyan/40 bg-cyan/5",
                              e.rank === 3 && "border-orange-500/40 bg-orange-500/5",
                            )}
                          >
                            <RankIcon rank={e.rank} />
                            <span className="flex-1 truncate text-bone">
                              {e.user_nickname}
                            </span>
                            <span className="font-mono text-bone">
                              {e.score.toLocaleString("ru-RU")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-cyan" />;
  if (rank === 3) return <Award className="h-4 w-4 text-orange-400" />;
  return <span className="text-smoke">#{rank}</span>;
}

function prettyMonth(ym: string): string {
  const months = [
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
  ];
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${months[idx]} ${y}` : ym;
}
