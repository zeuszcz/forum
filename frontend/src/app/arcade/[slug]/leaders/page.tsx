"use client";

import { ChevronLeft, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

import { Leaderboard } from "../../_components/Leaderboard";

type Game = {
  slug: string;
  title: string;
  emoji: string;
  accent: string;
  score_unit: string;
};

export default function FullLeaderboardPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const { user } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user === null) {
      router.push("/login");
      return;
    }
    if (!user || !slug) return;
    setLoading(true);
    api<Game[]>("/api/arcade/games")
      .then((all) => setGame(all.find((g) => g.slug === slug) ?? null))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.push("/login");
      })
      .finally(() => setLoading(false));
  }, [user, slug, router]);

  if (loading || user === undefined) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка…
      </div>
    );
  }

  if (!game) {
    return (
      <div className="mx-auto max-w-5xl py-32 text-center text-sm text-smoke">
        Игра не найдена.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/arcade/${game.slug}`}
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          К игре
        </Link>
      </div>
      <header className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{game.emoji}</span>
          <div>
            <h1 className={`text-xl font-bold ${game.accent}`}>{game.title}</h1>
            <p className="text-xs text-smoke">Полный лидерборд</p>
          </div>
          <Trophy className="ml-auto h-6 w-6 text-amber-400" />
        </div>
      </header>
      <Leaderboard
        slug={game.slug}
        initialPeriod="month"
        limit={100}
        scoreUnit={game.score_unit}
      />
    </div>
  );
}
