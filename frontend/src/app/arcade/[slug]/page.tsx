"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

import { BrawlerGame } from "./_games/BrawlerGame";
import { DiggerGame } from "./_games/DiggerGame";
import { RunnerGame } from "./_games/RunnerGame";
import { SpotlightGame } from "./_games/SpotlightGame";

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

export default function ArcadeGamePage() {
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
      .then((all) => {
        const g = all.find((x) => x.slug === slug);
        setGame(g ?? null);
        if (!g) toast.error("Игра не найдена.");
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.push("/login");
        }
      })
      .finally(() => setLoading(false));
  }, [user, slug, router]);

  if (loading || user === undefined) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 py-32 text-smoke">
        <Loader2 className="h-4 w-4 animate-spin" />
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

  switch (game.slug) {
    case "digger":
      return <DiggerGame game={game} />;
    case "spotlight":
      return <SpotlightGame game={game} />;
    case "brawler":
      return <BrawlerGame game={game} />;
    case "runner":
      return <RunnerGame game={game} />;
    default:
      return (
        <div className="mx-auto max-w-5xl py-32 text-center text-sm text-smoke">
          Эта игра пока недоступна.
        </div>
      );
  }
}
