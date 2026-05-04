"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Sparkles, Target, Zap } from "lucide-react";
import * as React from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface QuestEntry {
  id: number;
  quest_id: number;
  slug: string;
  title: string;
  description: string;
  requirement_kind: string;
  requirement_value: number;
  reward_xp: number;
  progress: number;
  completed: boolean;
  completed_at: string | null;
}

interface QuestsResponse {
  quests: QuestEntry[];
  completed_count: number;
  total_count: number;
  bonus_xp: number;
}

export function DailyQuestsWidget() {
  const { user } = useAuth();
  const [data, setData] = React.useState<QuestsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const r = await api<QuestsResponse>("/quests/today");
      setData(r);
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!user) return null;

  return (
    <section className="relative overflow-hidden rounded-lg border border-cyan/30 bg-card">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 100% 0%, rgb(var(--cyan-rgb) / 0.25), transparent 70%)",
        }}
      />
      <header className="relative flex items-center justify-between gap-2 border-b border-cyan/20 px-4 py-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-bone">
          <Target className="h-4 w-4 text-cyan" />
          Сегодняшние квесты
        </h3>
        {data && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-cyan">
              {data.completed_count}/{data.total_count}
            </span>
            {data.bonus_xp > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-flame/40 bg-flame/10 px-2 py-0.5 font-mono text-[10px] font-bold text-flame">
                <Zap className="h-2.5 w-2.5" />
                {data.bonus_xp} xp
              </span>
            )}
          </div>
        )}
      </header>

      <div className="relative">
        {loading ? (
          <div className="px-4 py-6 text-center text-xs text-smoke">
            Загружаем квесты…
          </div>
        ) : !data || data.quests.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-smoke">
            На сегодня квестов нет
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.quests.map((q) => (
              <QuestRow key={q.id} quest={q} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function QuestRow({ quest }: { quest: QuestEntry }) {
  const pct = Math.min(
    100,
    Math.round((quest.progress / Math.max(1, quest.requirement_value)) * 100),
  );

  return (
    <li
      className={cn(
        "relative flex items-center gap-3 px-4 py-3",
        quest.completed ? "bg-success/5" : "",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          quest.completed
            ? "bg-success/20 text-success"
            : "bg-cyan/10 text-cyan",
        )}
      >
        {quest.completed ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "text-sm font-semibold",
              quest.completed ? "text-success" : "text-bone",
            )}
          >
            {quest.title}
          </span>
          <span className="font-mono text-[11px] text-smoke">
            {quest.progress}/{quest.requirement_value}
          </span>
        </div>
        <p className="text-[11px] leading-snug text-smoke">{quest.description}</p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-void/60">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "h-full rounded-full",
              quest.completed
                ? "bg-success"
                : "bg-gradient-to-r from-cyan to-plasma",
            )}
          />
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold",
          quest.completed
            ? "border-success/40 bg-success/10 text-success"
            : "border-flame/40 bg-flame/10 text-flame",
        )}
        title="Награда XP"
      >
        +{quest.reward_xp}
      </span>
    </li>
  );
}
