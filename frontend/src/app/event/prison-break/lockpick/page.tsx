"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  CircleSlash,
  Crosshair,
  Key,
  Lock,
  LockOpen,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type LockpickStatus = {
  id: number;
  target_cell_id: number;
  difficulty: number;
  current_pin: number;
  misses: number;
  forgive_misses: number;
  key_quality: string;
  status: "active" | "won" | "lost" | "abandoned";
  started_at: string;
  ended_at: string | null;
  outcome: Record<string, unknown>;
};

type LockpickTapResult = {
  correct: boolean;
  current_pin: number;
  misses: number;
  forgive_misses: number;
  status: "active" | "won" | "lost";
  outcome: Record<string, unknown>;
};

type CellInfo = {
  id: number;
  block: string;
  number: number;
  tunnel_progress: number;
  tunnel_discovered: boolean;
};

type PlayerMe = {
  id: number;
  ap_current: number;
  ap_max: number;
  cell_id: number | null;
  block: string | null;
};

const QUALITY_LABEL: Record<string, string> = {
  master: "Мастерская",
  good: "Обычная",
  crooked: "Кривая",
};

export default function LockpickPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [me, setMe] = useState<PlayerMe | null>(null);
  const [active, setActive] = useState<LockpickStatus | null>(null);
  const [history, setHistory] = useState<LockpickStatus[]>([]);
  const [cells, setCells] = useState<CellInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenCell, setChosenCell] = useState<number | null>(null);
  const [lastTap, setLastTap] = useState<{ pin: number; correct: boolean } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [st, hist, cellsRaw] = await Promise.all([
        api<{ player: PlayerMe | null }>("/api/event/prison-break/status"),
        api<LockpickStatus[]>("/api/event/prison-break/lockpick/history?limit=8"),
        fetchAllCells(),
      ]);
      setMe(st.player);
      setHistory(hist);
      setCells(cellsRaw);
      const a = await api<LockpickStatus | null>(
        "/api/event/prison-break/lockpick/active",
      );
      setActive(a);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить состояние.");
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

  const targetCellMeta = useMemo(
    () => cells.find((c) => c.id === active?.target_cell_id) ?? null,
    [cells, active?.target_cell_id],
  );

  const startSession = useCallback(async () => {
    if (!chosenCell) return;
    setBusy(true);
    try {
      const res = await api<LockpickStatus>(
        "/api/event/prison-break/lockpick/start",
        { method: "POST", body: JSON.stringify({ target_cell_id: chosenCell }) },
      );
      setActive(res);
      setPickerOpen(false);
      setChosenCell(null);
      toast.success(
        `Лом-сессия открыта. Сложность ${res.difficulty}, прощений ${res.forgive_misses}.`,
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Не удалось начать.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [chosenCell]);

  const submitTap = useCallback(
    async (pin: number) => {
      if (!active || active.status !== "active") return;
      setBusy(true);
      try {
        const res = await api<LockpickTapResult>(
          "/api/event/prison-break/lockpick/tap",
          { method: "POST", body: JSON.stringify({ pin_pick: pin }) },
        );
        setLastTap({ pin, correct: res.correct });
        setActive((prev) =>
          prev
            ? {
                ...prev,
                current_pin: res.current_pin,
                misses: res.misses,
                forgive_misses: res.forgive_misses,
                status: res.status as LockpickStatus["status"],
                outcome: res.outcome,
              }
            : prev,
        );
        if (res.status === "won") {
          toast.success("Замок открыт! Ты в новой камере.");
          await fetchAll();
        } else if (res.status === "lost") {
          const caught = res.outcome?.caught;
          toast.error(caught ? "ЗАСТУКАЛИ — карцер 6ч." : "Сломал отмычку. Ушёл тихо.");
          await fetchAll();
        }
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : "Ошибка тапа.";
        toast.error(msg);
      } finally {
        setBusy(false);
      }
    },
    [active, fetchAll],
  );

  const abandon = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    try {
      await api<LockpickStatus>(
        "/api/event/prison-break/lockpick/abandon",
        { method: "POST" },
      );
      toast.message("Бросил замок.");
      await fetchAll();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Ошибка.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [active, fetchAll]);

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
          href="/event/prison-break"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          К дашборду
        </Link>
        {me && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
            <Zap className="h-3.5 w-3.5 text-cyan" />
            <span className="font-mono text-bone">
              {me.ap_current}/{me.ap_max} AP
            </span>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-300">
          <Key className="h-3.5 w-3.5" />
          Взлом замка
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          Нужен `forged_key` из мастерской + 2 AP. Качество ключа определяет
          сколько ошибок прощается. Победа = ты в новой камере.
        </p>
      </div>

      {active && active.status === "active" ? (
        <ActivePinTumbler
          session={active}
          targetCell={targetCellMeta}
          lastTap={lastTap}
          onTap={submitTap}
          onAbandon={abandon}
          busy={busy}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-bone">
            <Lock className="h-4 w-4 text-cyan" />
            Нет активной сессии
          </div>
          <p className="mb-4 text-xs text-smoke">
            Выбери камеру в любом блоке — собственную ломать нельзя.
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-cyan/40 bg-cyan/10 px-4 py-2 text-sm font-semibold text-cyan transition-colors hover:bg-cyan/20"
          >
            <Crosshair className="h-4 w-4" />
            Выбрать цель
          </button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 text-[10px] uppercase tracking-widest text-smoke">
          История последних попыток
        </div>
        {history.length === 0 ? (
          <div className="text-xs text-smoke">Пока пусто.</div>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {history.map((h) => {
              const cell = cells.find((c) => c.id === h.target_cell_id);
              return (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-void/30 px-3 py-1.5"
                >
                  <span className="text-bone">
                    {cell ? `${cell.block}-${cell.number}` : `cell #${h.target_cell_id}`}
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-smoke">
                      {QUALITY_LABEL[h.key_quality] ?? h.key_quality}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-widest",
                      h.status === "won" && "text-emerald-400",
                      h.status === "lost" && "text-rose-400",
                      h.status === "abandoned" && "text-smoke",
                    )}
                  >
                    {h.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-cyan/40 bg-card p-5 shadow-2xl"
            >
              <div className="mb-3 flex items-center gap-2 text-cyan">
                <Crosshair className="h-4 w-4" />
                <span className="text-sm font-semibold">Цель</span>
              </div>
              <div className="mb-3 space-y-1 text-xs">
                {cells
                  .filter((c) => c.id !== me?.cell_id && !c.tunnel_discovered)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChosenCell(c.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border px-2 py-1.5 transition-colors",
                        chosenCell === c.id
                          ? "border-cyan/60 bg-cyan/10 text-cyan"
                          : "border-border bg-void/40 hover:bg-void/60 text-bone",
                      )}
                    >
                      <span>
                        Блок {c.block} · камера {c.number}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-smoke">
                        тоннель {c.tunnel_progress}%
                      </span>
                    </button>
                  ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    setChosenCell(null);
                  }}
                  disabled={busy}
                  className="flex-1 rounded-md border border-border bg-void/40 px-3 py-2 text-xs uppercase tracking-widest text-smoke transition-colors hover:bg-void/60 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={startSession}
                  disabled={busy || !chosenCell}
                  className="flex-1 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-50"
                >
                  {busy ? "…" : "Начать (2 AP)"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

async function fetchAllCells(): Promise<CellInfo[]> {
  try {
    const raw = await api<
      Array<{
        id: number;
        block: string;
        number: number;
        tunnel_progress: number;
        tunnel_discovered: boolean;
      }>
    >("/api/event/prison-break/cells");
    return raw;
  } catch {
    return [];
  }
}

function ActivePinTumbler({
  session,
  targetCell,
  lastTap,
  onTap,
  onAbandon,
  busy,
}: {
  session: LockpickStatus;
  targetCell: CellInfo | null;
  lastTap: { pin: number; correct: boolean } | null;
  onTap: (pin: number) => void;
  onAbandon: () => void;
  busy: boolean;
}) {
  const pins = Array.from({ length: session.difficulty }, (_, i) => i);
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
          <Lock className="h-4 w-4" />
          Замок {targetCell ? `${targetCell.block}-${targetCell.number}` : `#${session.target_cell_id}`}
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-smoke">
          <span>
            ключ: <span className="text-bone">{QUALITY_LABEL[session.key_quality] ?? session.key_quality}</span>
          </span>
          <span>
            прогресс: <span className="text-emerald-400">{session.current_pin}</span>/{session.difficulty}
          </span>
          <span>
            промахи:{" "}
            <span className={cn(session.misses === 0 ? "text-emerald-400" : "text-rose-400")}>
              {session.misses}
            </span>
            /{session.forgive_misses}
          </span>
        </div>
      </div>

      <div
        className="grid gap-2 mb-4"
        style={{ gridTemplateColumns: `repeat(${session.difficulty}, minmax(0, 1fr))` }}
      >
        {pins.map((p) => {
          const opened = p < session.current_pin;
          const wasLast = lastTap?.pin === p;
          return (
            <button
              key={p}
              type="button"
              disabled={busy || opened}
              onClick={() => onTap(p)}
              className={cn(
                "group relative flex h-24 items-center justify-center rounded-lg border-2 transition-all",
                opened
                  ? "border-emerald-500/60 bg-emerald-500/10"
                  : "border-border bg-void/40 hover:border-cyan/40 hover:bg-cyan/5",
                wasLast && !lastTap?.correct && "border-rose-500/60 bg-rose-500/10",
                busy && !opened && "opacity-60",
              )}
            >
              <motion.div
                initial={false}
                animate={{ y: opened ? -8 : wasLast && !lastTap?.correct ? 6 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="flex flex-col items-center gap-1"
              >
                {opened ? (
                  <LockOpen className="h-7 w-7 text-emerald-400" />
                ) : (
                  <Lock className="h-7 w-7 text-bone" />
                )}
                <span className="text-[10px] uppercase tracking-widest text-smoke">
                  pin {p + 1}
                </span>
              </motion.div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-smoke">
          Нажми пин — если порядок совпадает, штифт поднимается. Сложный замок
          требует точной последовательности.
        </p>
        <button
          type="button"
          onClick={onAbandon}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs uppercase tracking-widest text-rose-300 transition-colors hover:bg-rose-500/15 disabled:opacity-50"
        >
          <CircleSlash className="h-3 w-3" />
          Бросить
        </button>
      </div>

      {session.status !== "active" && (
        <div
          className={cn(
            "mt-4 rounded-md border p-3 text-xs",
            session.status === "won"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/40 bg-rose-500/10 text-rose-200",
          )}
        >
          {session.status === "won"
            ? "✅ Открыт. Ты переехал в новую камеру."
            : "❌ Замок сломан. " +
              (session.outcome?.caught ? "ЗАСТУКАЛИ — карцер 6ч." : "Ушёл тихо.")}
        </div>
      )}
    </div>
  );
}
