"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronLeft,
  Eye,
  Forward,
  Lightbulb,
  Newspaper,
  Send,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type IntelItem = {
  intel_id: number;
  content: string;
  category: "rumor" | "warning" | "secret" | "leak" | "tip";
  received_at: string;
  forwarded_from_id: number | null;
  is_truth: boolean | null;
  fabricated: boolean | null;
  source_role: string | null;
};

type PlayerCard = {
  id: number;
  nickname: string;
  tattoo: string;
  block: string | null;
  cell_id: number | null;
  status: string;
};

type PlayerMe = {
  id: number;
  ap_current: number;
  ap_max: number;
  nickname: string;
};

const CATEGORY_META: Record<
  IntelItem["category"],
  { icon: React.ReactNode; label: string; color: string; bg: string }
> = {
  rumor:   { icon: <Newspaper className="h-3 w-3" />, label: "Слух",       color: "text-cyan",    bg: "border-cyan/30 bg-cyan/5" },
  warning: { icon: <AlertTriangle className="h-3 w-3" />, label: "Сигнал", color: "text-amber-400", bg: "border-amber-500/30 bg-amber-500/5" },
  secret:  { icon: <Eye className="h-3 w-3" />,       label: "Секрет",    color: "text-flame",   bg: "border-flame/30 bg-flame/5" },
  leak:    { icon: <ShieldAlert className="h-3 w-3" />, label: "Утечка",  color: "text-rose-400", bg: "border-rose-500/30 bg-rose-500/5" },
  tip:     { icon: <Lightbulb className="h-3 w-3" />, label: "Подсказка", color: "text-emerald-400", bg: "border-emerald-500/30 bg-emerald-500/5" },
};

export default function IntelPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [me, setMe] = useState<PlayerMe | null>(null);
  const [items, setItems] = useState<IntelItem[]>([]);
  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [forwarding, setForwarding] = useState<{ intelId: number } | null>(null);
  const [forwardTarget, setForwardTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [feed, ps, status] = await Promise.all([
        api<IntelItem[]>("/api/event/prison-break/intel?limit=80"),
        api<PlayerCard[]>("/api/event/prison-break/players"),
        api<{ player: PlayerMe | null }>("/api/event/prison-break/status"),
      ]);
      setItems(feed);
      setPlayers(ps);
      setMe(status.player);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить intel-ленту.");
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

  const playerById = useMemo(() => {
    const m = new Map<number, PlayerCard>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const otherPlayers = useMemo(
    () => players.filter((p) => p.id !== me?.id && p.status === "active"),
    [players, me?.id],
  );

  const handleForward = useCallback(async () => {
    if (!forwarding || !forwardTarget) return;
    setBusy(true);
    try {
      const res = await api<{
        ok: boolean;
        delivered_to: number;
        trust_now: number | null;
        ap_remaining: number;
      }>("/api/event/prison-break/intel/forward", {
        method: "POST",
        body: JSON.stringify({
          intel_id: forwarding.intelId,
          target_player_id: forwardTarget,
        }),
      });
      if (res.ok) {
        toast.success(
          `Переслано! ${
            res.trust_now != null ? `Trust теперь ${res.trust_now}.` : ""
          }`,
        );
        setForwarding(null);
        setForwardTarget(null);
        await fetchAll();
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Не удалось переслать.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [forwarding, forwardTarget, fetchAll]);

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка intel-ленты…
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

      <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan">
          <Newspaper className="h-3.5 w-3.5" />
          Intel-лента
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          Слухи, утечки и подсказки. Не всё правда. Переслать — стоит 1 AP, +2 trust.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-smoke">
          Пока ничего нет. Свежий intel приходит каждый день.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const meta = CATEGORY_META[it.category] ?? CATEGORY_META.rumor;
            const sender =
              it.forwarded_from_id != null
                ? playerById.get(it.forwarded_from_id)?.nickname ?? "?"
                : null;
            return (
              <motion.li
                key={it.intel_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  meta.bg,
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-void/40",
                      meta.color,
                    )}
                  >
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
                      <span className={meta.color}>{meta.label}</span>
                      <span>·</span>
                      <span>
                        {new Date(it.received_at).toLocaleString("ru-RU", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                      {sender && (
                        <>
                          <span>·</span>
                          <span className="text-amber-400">от {sender}</span>
                        </>
                      )}
                      {it.fabricated && (
                        <>
                          <span>·</span>
                          <span className="text-rose-400">фальсификация</span>
                        </>
                      )}
                      {it.is_truth === true && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-400">правда</span>
                        </>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-bone">{it.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForwarding({ intelId: it.intel_id });
                      setForwardTarget(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-cyan/40 bg-cyan/5 px-2 py-1 text-[10px] uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/15"
                  >
                    <Forward className="h-3 w-3" />
                    Переслать
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* Forward modal */}
      <AnimatePresence>
        {forwarding && (
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
              className="w-full max-w-md rounded-xl border border-cyan/40 bg-card p-5 shadow-2xl"
            >
              <div className="mb-3 flex items-center gap-2 text-cyan">
                <Send className="h-4 w-4" />
                <span className="text-sm font-semibold">Переслать intel</span>
              </div>
              <p className="mb-3 text-xs text-smoke">
                Стоит 1 AP. Получатель увидит intel со ссылкой на тебя. Trust +2.
              </p>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-smoke">
                Получатель
              </label>
              <select
                value={forwardTarget ?? ""}
                onChange={(e) =>
                  setForwardTarget(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full rounded-md border border-border bg-void/60 px-3 py-2 text-sm text-bone focus:border-cyan focus:outline-none"
              >
                <option value="">— выбери игрока —</option>
                {otherPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.tattoo} {p.nickname}
                    {p.block ? ` · блок ${p.block}` : ""}
                  </option>
                ))}
              </select>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setForwarding(null);
                    setForwardTarget(null);
                  }}
                  disabled={busy}
                  className="flex-1 rounded-md border border-border bg-void/40 px-3 py-2 text-xs uppercase tracking-widest text-smoke transition-colors hover:bg-void/60 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleForward}
                  disabled={busy || !forwardTarget}
                  className="flex-1 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-50"
                >
                  {busy ? "Отправка…" : "Переслать (1 AP)"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
