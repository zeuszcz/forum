"use client";

import { motion } from "framer-motion";
import {
  ChevronLeft,
  Save,
  Shield,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Special = {
  slug: string;
  name: string;
  emoji: string;
  description: string;
  stamina_cost: number;
  damage: number;
  range: number;
  height: string;
  startup_ticks: number;
  active_ticks: number;
  recovery_ticks: number;
  cooldown_ticks: number;
  knockback_x: number;
  parry: boolean;
  dash: boolean;
};

type Loadout = { specials: string[]; wins: number; losses: number };

const TARGET_SIZE = 3;

export default function LoadoutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [specials, setSpecials] = useState<Special[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [stats, setStats] = useState<Loadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, current] = await Promise.all([
        api<Special[]>("/api/event/prison-break/arena/specials"),
        api<Loadout>("/api/event/prison-break/arena/loadout"),
      ]);
      setSpecials(catalog);
      setStats(current);
      setChosen(current.specials || []);
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

  const toggle = useCallback((slug: string) => {
    setChosen((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= TARGET_SIZE) {
        toast.error(`Можно выбрать ровно ${TARGET_SIZE} приёма.`);
        return prev;
      }
      return [...prev, slug];
    });
  }, []);

  const save = useCallback(async () => {
    if (chosen.length !== TARGET_SIZE) {
      toast.error(`Нужно выбрать ровно ${TARGET_SIZE} приёма.`);
      return;
    }
    setBusy(true);
    try {
      const ld = await api<Loadout>("/api/event/prison-break/arena/loadout", {
        method: "PUT",
        body: JSON.stringify({ specials: chosen }),
      });
      setStats(ld);
      toast.success("Loadout сохранён.");
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Ошибка.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [chosen]);

  const slotByIndex = useMemo(
    () => Array.from({ length: TARGET_SIZE }, (_, i) => chosen[i] ?? null),
    [chosen],
  );

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/event/prison-break/arena"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          К арене
        </Link>
        {stats && (
          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-emerald-400">{stats.wins} W</span>
            <span className="text-smoke">/</span>
            <span className="text-rose-400">{stats.losses} L</span>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan">
          <Swords className="h-3.5 w-3.5" />
          Loadout · 3 приёма
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          Выбери баланс быстрых + сильных + контр-приёмов. После старта матча
          loadout не меняется.
        </p>
      </div>

      {/* Slots */}
      <div className="grid gap-2 sm:grid-cols-3">
        {slotByIndex.map((slug, idx) => {
          const s = specials.find((x) => x.slug === slug);
          return (
            <div
              key={idx}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                s
                  ? "border-cyan/40 bg-cyan/5"
                  : "border-dashed border-border bg-void/30",
              )}
            >
              <div className="text-[10px] uppercase tracking-widest text-smoke">
                Слот {idx + 1}
              </div>
              {s ? (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-2xl">{s.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-bone truncate">
                      {s.name}
                    </div>
                    <div className="text-[10px] text-smoke">
                      урон {s.damage} · stam {s.stamina_cost}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-smoke italic">пусто</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Catalog */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {specials.map((s) => {
          const picked = chosen.includes(s.slug);
          return (
            <motion.button
              key={s.slug}
              type="button"
              onClick={() => toggle(s.slug)}
              whileHover={{ y: -1 }}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                picked
                  ? "border-cyan/60 bg-cyan/10"
                  : "border-border bg-card hover:bg-void/60",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-bone">
                    {s.name}
                    {s.parry && (
                      <Shield className="h-3 w-3 text-cyan" aria-label="parry" />
                    )}
                    {s.dash && (
                      <Zap className="h-3 w-3 text-amber-400" aria-label="dash" />
                    )}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-smoke">
                    {s.height} · range {s.range}
                  </div>
                </div>
                {picked && (
                  <span className="rounded-md border border-cyan/40 bg-cyan/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan">
                    ✓
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-[11px] text-smoke">
                {s.description}
              </p>
              <div className="mt-2 flex flex-wrap gap-1 text-[9px] uppercase tracking-widest text-smoke">
                <Stat label="dmg" value={s.damage} color="text-rose-400" />
                <Stat label="stam" value={s.stamina_cost} color="text-emerald-400" />
                <Stat label="startup" value={`${s.startup_ticks}t`} />
                <Stat label="recov" value={`${s.recovery_ticks}t`} />
                <Stat label="cd" value={`${s.cooldown_ticks}t`} />
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="sticky bottom-3 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={busy || chosen.length !== TARGET_SIZE}
          className="inline-flex items-center gap-2 rounded-md border border-cyan/50 bg-cyan/20 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/30 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {busy ? "Сохранение…" : `Сохранить (${chosen.length}/${TARGET_SIZE})`}
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-md border border-border bg-void/40 px-1.5 py-0.5">
      <span className={color ?? "text-bone"}>{value}</span>
      <span>{label}</span>
    </span>
  );
}
