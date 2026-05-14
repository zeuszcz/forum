"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  Coins,
  Flame,
  Gift,
  Joystick,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Game = {
  slug: string;
  title: string;
  short: string;
  emoji: string;
  accent: string;
  description: string;
  controls: string;
  score_unit: string;
};

type Stat = {
  game_slug: string;
  best_score: number;
  runs_count: number;
  last_played: string | null;
  rank_month: number | null;
  rank_all_time: number | null;
};

type DailyBonus = {
  granted: boolean;
  karma_granted: number;
  streak: number;
  next_in_seconds: number;
};

export default function ArcadeCatalogPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [bonus, setBonus] = useState<DailyBonus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimBusy, setClaimBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [gs, st, db] = await Promise.all([
        api<Game[]>("/api/arcade/games"),
        api<Stat[]>("/api/arcade/me/stats").catch(() => [] as Stat[]),
        api<DailyBonus>("/api/arcade/me/daily-bonus").catch(() => null),
      ]);
      setGames(gs);
      setStats(st);
      setBonus(db);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить каталог.");
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

  const claimBonus = useCallback(async () => {
    setClaimBusy(true);
    try {
      const res = await api<DailyBonus>(
        "/api/arcade/me/daily-bonus/claim",
        { method: "POST" },
      );
      if (res.granted) {
        toast.success(`+${res.karma_granted} karma · стрик ${res.streak}`);
      }
      setBonus(res);
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Ошибка.";
      toast.error(msg);
    } finally {
      setClaimBusy(false);
    }
  }, []);

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка…
      </div>
    );
  }

  const statBySlug = new Map(stats.map((s) => [s.game_slug, s] as const));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-bone">
            <Joystick className="h-6 w-6 text-flame" />
            Аркада
          </h1>
          <p className="mt-1 text-sm text-smoke">
            Бесконечные мини-игры в jail-стиле. Топ-3 каждого месяца получают
            karma + кейс-ключи + временный титул «Король».
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/arcade/hall-of-fame"
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-amber-300 transition-colors hover:bg-amber-500/20"
          >
            <Trophy className="h-3.5 w-3.5" />
            Hall of fame
          </Link>
        </div>
      </div>

      {/* Daily bonus card */}
      {bonus && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Gift className="h-5 w-5 text-emerald-400" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-bone">
                Ежедневный бонус ·{" "}
                <span className="text-emerald-300">
                  стрик {bonus.streak} {bonus.streak === 1 ? "день" : "дн."}
                </span>
              </div>
              <div className="text-[11px] text-smoke">
                Заходи каждый день — растёт стрик, растёт karma-бонус (10..38 за заход).
              </div>
            </div>
            {bonus.granted === false && bonus.next_in_seconds > 0 ? (
              <span className="rounded-md border border-border bg-void/40 px-3 py-1.5 text-[11px] text-smoke">
                до сброса {formatDelta(bonus.next_in_seconds)}
              </span>
            ) : (
              <button
                type="button"
                onClick={claimBonus}
                disabled={claimBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
              >
                <Coins className="h-3.5 w-3.5" />
                {claimBusy ? "..." : "Забрать"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Game tiles */}
      <div className="grid gap-4 sm:grid-cols-2">
        {games.map((g) => {
          const s = statBySlug.get(g.slug);
          return (
            <motion.div
              key={g.slug}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Link
                href={`/arcade/${g.slug}`}
                className="group block rounded-lg border border-border bg-card p-4 transition-all hover:border-flame/40 hover:bg-flame/5"
              >
                <div className="flex items-start gap-3">
                  <span className="text-4xl">{g.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-lg font-bold", g.accent)}>
                      {g.title}
                    </div>
                    <p className="mt-0.5 text-[12px] text-smoke">{g.short}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-smoke transition-transform group-hover:translate-x-0.5" />
                </div>
                {s && s.best_score > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-[10px]">
                    <Mini label="лучший" value={s.best_score.toLocaleString("ru-RU")} />
                    <Mini label="попыток" value={s.runs_count.toString()} />
                    <Mini
                      label="место (мес.)"
                      value={s.rank_month ? `#${s.rank_month}` : "—"}
                      accent={
                        s.rank_month && s.rank_month <= 3
                          ? "text-amber-300"
                          : undefined
                      }
                    />
                  </div>
                )}
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Prize info */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-smoke">
        <div className="mb-2 flex items-center gap-2 text-amber-300">
          <Calendar className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-widest">
            Награды каждый месяц (1-го числа в 00:05 МСК)
          </span>
        </div>
        <ul className="space-y-0.5">
          <li>
            <Flame className="mr-1 inline h-3 w-3 text-amber-400" />
            <strong className="text-amber-300">1-е место</strong>: +2000 karma · 5 кейс-ключей · титул «Король игры» на месяц
          </li>
          <li>
            <Flame className="mr-1 inline h-3 w-3 text-cyan" />
            <strong className="text-cyan">2-е место</strong>: +1000 karma · 3 кейс-ключа
          </li>
          <li>
            <Flame className="mr-1 inline h-3 w-3 text-orange-400" />
            <strong className="text-orange-300">3-е место</strong>: +500 karma · 1 кейс-ключ
          </li>
          <li className="text-smoke/80">
            4-10 место: +100 karma (попал в топ-10)
          </li>
        </ul>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-md bg-void/40 p-2 text-center">
      <div className="text-[9px] uppercase tracking-widest text-smoke">
        {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-xs font-semibold", accent ?? "text-bone")}>
        {value}
      </div>
    </div>
  );
}

function formatDelta(seconds: number): string {
  if (seconds < 60) return `${seconds}с`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 1) return `${h}ч ${m}м`;
  return `${m}м`;
}
