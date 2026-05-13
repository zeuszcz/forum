"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  EyeOff,
  PlayCircle,
  RotateCcw,
  Save,
  Shield,
  Skull,
  Target,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type CellInfo = {
  cell_id: number;
  block: string;
  number: number;
  tunnel_progress: number;
  tunnel_discovered: boolean;
};

type Plan = {
  id: number;
  block: string;
  route: number[];
  focus: "balanced" | "aggressive" | "stealth";
  valid_for_day: number;
  executed: boolean;
  executed_at: string | null;
  result: Record<string, unknown>;
  created_at: string;
};

type PlayerMe = {
  id: number;
  role: string | null;
  block: string | null;
  ap_current: number;
  ap_max: number;
};

type ExecuteResult = {
  ok: boolean;
  plan_id: number;
  ap_spent: number;
  ap_remaining: number;
  steps: Array<{
    cell_id: number;
    block: string;
    number: number;
    outcome: "busted" | "empty" | "stealth_pass";
    tunnel_progress_before: number;
    tunnel_progress_after: number;
  }>;
};

const FOCUS_META: Record<Plan["focus"], { label: string; blurb: string; ap: number; color: string }> = {
  balanced: {
    label: "Баланс",
    blurb: "+0% детект, 1 AP",
    ap: 1,
    color: "border-cyan/40 bg-cyan/10 text-cyan",
  },
  aggressive: {
    label: "Жёстко",
    blurb: "+15% детект, 2 AP, +intel",
    ap: 2,
    color: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  },
  stealth: {
    label: "Тихо",
    blurb: "+5% детект, 1 AP, бесшумно",
    ap: 1,
    color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
};

export default function PatrolPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [me, setMe] = useState<PlayerMe | null>(null);
  const [cells, setCells] = useState<CellInfo[]>([]);
  const [todayPlan, setTodayPlan] = useState<Plan | null>(null);
  const [route, setRoute] = useState<number[]>([]);
  const [focus, setFocus] = useState<Plan["focus"]>("balanced");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastExec, setLastExec] = useState<ExecuteResult | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const st = await api<{ player: PlayerMe | null }>(
        "/api/event/prison-break/status",
      );
      setMe(st.player);
      if (!st.player || st.player.role !== "guard") {
        setLoading(false);
        return;
      }
      const [cellsRaw, planRaw] = await Promise.all([
        api<CellInfo[]>("/api/event/prison-break/patrol/block-cells"),
        api<Plan | null>("/api/event/prison-break/patrol/today"),
      ]);
      setCells(cellsRaw);
      setTodayPlan(planRaw);
      if (planRaw) {
        setRoute(planRaw.route);
        setFocus(planRaw.focus);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить план.");
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

  const addToRoute = useCallback(
    (cellId: number) => {
      if (route.length >= 6) {
        toast.error("Маршрут не больше 6 камер.");
        return;
      }
      setRoute((prev) => [...prev, cellId]);
    },
    [route.length],
  );

  const removeFromRoute = useCallback((idx: number) => {
    setRoute((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const moveRouteItem = useCallback(
    (idx: number, dir: -1 | 1) => {
      const target = idx + dir;
      if (target < 0 || target >= route.length) return;
      setRoute((prev) => {
        const copy = [...prev];
        [copy[idx], copy[target]] = [copy[target], copy[idx]];
        return copy;
      });
    },
    [route.length],
  );

  const savePlan = useCallback(async () => {
    if (route.length === 0) {
      toast.error("Маршрут пуст.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<Plan>("/api/event/prison-break/patrol/plan", {
        method: "POST",
        body: JSON.stringify({ route, focus }),
      });
      setTodayPlan(res);
      toast.success("План сохранён.");
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Ошибка.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [route, focus]);

  const executePlan = useCallback(async () => {
    if (!todayPlan) {
      toast.error("Сохрани план перед выполнением.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<ExecuteResult>(
        `/api/event/prison-break/patrol/plan/${todayPlan.id}/execute`,
        { method: "POST" },
      );
      setLastExec(res);
      toast.success(`Обход завершён. ${res.steps.filter((s) => s.outcome === "busted").length} bust.`);
      await fetchAll();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Ошибка.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [todayPlan, fetchAll]);

  const reset = useCallback(() => {
    setRoute([]);
  }, []);

  const cellById = useMemo(() => {
    const m = new Map<number, CellInfo>();
    for (const c of cells) m.set(c.cell_id, c);
    return m;
  }, [cells]);

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка…
      </div>
    );
  }

  if (!me || me.role !== "guard") {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Link
          href="/event/prison-break"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          К дашборду
        </Link>
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-8 text-center">
          <Skull className="mx-auto h-8 w-8 text-rose-400" />
          <div className="mt-2 text-sm text-rose-200">
            Только охрана может планировать патруль.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/event/prison-break"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          К дашборду
        </Link>
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <Zap className="h-3.5 w-3.5 text-cyan" />
          <span className="font-mono text-bone">
            {me.ap_current}/{me.ap_max} AP
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan">
          <Shield className="h-3.5 w-3.5" />
          Планировщик патруля · Блок {me.block}
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          Составь маршрут на сегодня. Фокус определяет AP-стоимость и шанс
          обнаружить копателей.
        </p>
      </div>

      {/* Focus pick */}
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(FOCUS_META) as Plan["focus"][]).map((k) => {
          const meta = FOCUS_META[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFocus(k)}
              disabled={todayPlan?.executed}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                focus === k ? meta.color : "border-border bg-void/40 hover:bg-void/60",
                todayPlan?.executed && "opacity-50",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{meta.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest">
                  {meta.ap} AP
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-smoke">{meta.blurb}</div>
            </button>
          );
        })}
      </div>

      {/* Route builder */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-smoke">
            <span>Камеры блока</span>
            <span className="text-[10px]">{cells.length} шт.</span>
          </div>
          <ul className="space-y-1">
            {cells.map((c) => {
              const inRoute = route.includes(c.cell_id);
              return (
                <li key={c.cell_id}>
                  <button
                    type="button"
                    onClick={() => addToRoute(c.cell_id)}
                    disabled={todayPlan?.executed || inRoute || route.length >= 6}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs transition-colors",
                      inRoute
                        ? "border-cyan/40 bg-cyan/10 text-cyan"
                        : c.tunnel_discovered
                          ? "border-border bg-void/30 text-smoke opacity-60"
                          : "border-border bg-void/40 text-bone hover:bg-void/60",
                    )}
                  >
                    <span className="font-mono">
                      {c.block}-{c.number}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-smoke">
                      <span>тоннель</span>
                      <span
                        className={cn(
                          "font-mono",
                          c.tunnel_progress >= 50 ? "text-amber-400" :
                          c.tunnel_progress >= 25 ? "text-cyan" : "text-smoke",
                        )}
                      >
                        {c.tunnel_progress}%
                      </span>
                      {c.tunnel_discovered && <EyeOff className="h-3 w-3 text-rose-400" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-smoke">
            <span>Маршрут</span>
            <span className="text-[10px]">{route.length}/6</span>
          </div>
          {route.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-void/20 p-6 text-center text-xs text-smoke">
              Тыкай камеры слева, чтобы собрать порядок.
            </div>
          ) : (
            <ol className="space-y-1.5">
              {route.map((cid, idx) => {
                const c = cellById.get(cid);
                return (
                  <li
                    key={`${cid}-${idx}`}
                    className="flex items-center gap-2 rounded-md border border-border bg-void/40 px-2 py-1.5 text-xs"
                  >
                    <span className="font-mono text-cyan">{idx + 1}.</span>
                    <span className="flex-1 text-bone">
                      {c ? `${c.block}-${c.number}` : `cell #${cid}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => moveRouteItem(idx, -1)}
                      disabled={idx === 0 || todayPlan?.executed}
                      className="rounded p-1 text-smoke hover:bg-void/60 hover:text-bone disabled:opacity-30"
                      title="вверх"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRouteItem(idx, +1)}
                      disabled={idx === route.length - 1 || todayPlan?.executed}
                      className="rounded p-1 text-smoke hover:bg-void/60 hover:text-bone disabled:opacity-30"
                      title="вниз"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromRoute(idx)}
                      disabled={todayPlan?.executed}
                      className="rounded p-1 text-rose-400 hover:bg-rose-500/15 disabled:opacity-30"
                      title="убрать"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={busy || route.length === 0 || todayPlan?.executed}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-void/40 px-3 py-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:bg-void/60 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Очистить
            </button>
            <button
              type="button"
              onClick={savePlan}
              disabled={busy || route.length === 0 || todayPlan?.executed}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              {todayPlan ? "Обновить" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={executePlan}
              disabled={busy || !todayPlan || todayPlan.executed}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-amber-300 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
            >
              <PlayCircle className="h-3 w-3" />
              Идти ({FOCUS_META[focus].ap} AP)
            </button>
          </div>

          {todayPlan?.executed && (
            <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-[11px] text-emerald-200">
              Сегодняшний обход уже выполнен. Новый план — завтра.
            </div>
          )}
        </div>
      </div>

      {/* Execution result */}
      <AnimatePresence>
        {lastExec && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-smoke">
              <Target className="h-3.5 w-3.5" />
              Итог обхода — {lastExec.ap_spent} AP потрачено
            </div>
            <ul className="space-y-1.5 text-xs">
              {lastExec.steps.map((s, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-3 py-1.5",
                    s.outcome === "busted"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                      : s.outcome === "stealth_pass"
                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
                        : "border-border bg-void/30 text-smoke",
                  )}
                >
                  <span className="font-mono text-bone">
                    {s.block}-{s.number}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest">
                    {s.outcome === "busted"
                      ? "БУСТ"
                      : s.outcome === "stealth_pass"
                        ? "Тихо прошёл"
                        : "Пусто"}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
