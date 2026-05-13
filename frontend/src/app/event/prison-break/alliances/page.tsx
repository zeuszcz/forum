"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlarmClockOff,
  ChevronLeft,
  CircleSlash,
  FileSignature,
  Handshake,
  Hourglass,
  Plus,
  ShieldCheck,
  Sparkles,
  Swords,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Alliance = {
  id: number;
  parties: number[];
  pact_type: string;
  terms: Record<string, unknown>;
  status: "proposed" | "active" | "expired" | "broken" | "cancelled";
  proposed_at: string;
  signed_at: string | null;
  expires_at: string | null;
  broken_at: string | null;
  broken_by_id: number | null;
  signatures: number[];
  required_signers: number[];
  is_signed_by_me: boolean;
};

type PlayerCard = {
  id: number;
  nickname: string;
  tattoo: string;
  block: string | null;
  cell_id: number | null;
  status: string;
};

type PlayerMe = { id: number; ap_current: number; ap_max: number };

const PACT_TYPES: Array<{ slug: string; label: string; blurb: string; icon: React.ReactNode }> = [
  {
    slug: "nonaggression",
    label: "Ненападение",
    blurb: "Не снитчить друг на друга. Базовый альянс.",
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
  },
  {
    slug: "mutual_dig",
    label: "Совместный подкоп",
    blurb: "Делимся scrap и crowbar при копке.",
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
  {
    slug: "intel_share",
    label: "Обмен intel",
    blurb: "Пересылаем друг другу каждую утечку.",
    icon: <Handshake className="h-3.5 w-3.5" />,
  },
  {
    slug: "loan",
    label: "Заём",
    blurb: "Кредит — возврат до дня N.",
    icon: <FileSignature className="h-3.5 w-3.5" />,
  },
  {
    slug: "backup_arena",
    label: "Дружеский ринг",
    blurb: "Отказываемся от арены друг с другом.",
    icon: <Swords className="h-3.5 w-3.5" />,
  },
];

const STATUS_META: Record<
  Alliance["status"],
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  proposed: {
    label: "Предложен",
    color: "text-amber-300",
    bg: "border-amber-500/30 bg-amber-500/5",
    icon: <Hourglass className="h-3 w-3" />,
  },
  active: {
    label: "Активен",
    color: "text-emerald-400",
    bg: "border-emerald-500/30 bg-emerald-500/5",
    icon: <ShieldCheck className="h-3 w-3" />,
  },
  expired: {
    label: "Истёк",
    color: "text-smoke",
    bg: "border-border bg-void/40",
    icon: <AlarmClockOff className="h-3 w-3" />,
  },
  broken: {
    label: "Разорван",
    color: "text-rose-400",
    bg: "border-rose-500/30 bg-rose-500/5",
    icon: <CircleSlash className="h-3 w-3" />,
  },
  cancelled: {
    label: "Отменён",
    color: "text-smoke",
    bg: "border-border bg-void/30",
    icon: <X className="h-3 w-3" />,
  },
};

export default function AlliancesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [me, setMe] = useState<PlayerMe | null>(null);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [propOpen, setPropOpen] = useState(false);
  const [propPact, setPropPact] = useState<string>("nonaggression");
  const [propParties, setPropParties] = useState<number[]>([]);
  const [propDuration, setPropDuration] = useState<number>(5);
  const [propTermsText, setPropTermsText] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, ps, st] = await Promise.all([
        api<Alliance[]>("/api/event/prison-break/alliances"),
        api<PlayerCard[]>("/api/event/prison-break/players"),
        api<{ player: PlayerMe | null }>("/api/event/prison-break/status"),
      ]);
      setAlliances(list);
      setPlayers(ps);
      setMe(st.player);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить альянсы.");
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

  const callAction = useCallback(
    async (id: number, kind: "sign" | "cancel" | "break") => {
      setBusyId(id);
      try {
        const res = await api<{
          ok: boolean;
          new_status: string;
          message?: string;
        }>(`/api/event/prison-break/alliances/${id}/${kind}`, { method: "POST" });
        if (res.ok) toast.success(res.message ?? `Статус: ${res.new_status}`);
        await fetchAll();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : "Не удалось.";
        toast.error(msg);
      } finally {
        setBusyId(null);
      }
    },
    [fetchAll],
  );

  const createPact = useCallback(async () => {
    if (propParties.length === 0) {
      toast.error("Нужен хотя бы один партнёр.");
      return;
    }
    let parsedTerms: Record<string, unknown> = {};
    if (propTermsText.trim()) {
      try {
        parsedTerms = JSON.parse(propTermsText);
      } catch {
        toast.error("Условия должны быть валидным JSON.");
        return;
      }
    }
    setCreating(true);
    try {
      await api<Alliance>("/api/event/prison-break/alliances", {
        method: "POST",
        body: JSON.stringify({
          parties: propParties,
          pact_type: propPact,
          terms: parsedTerms,
          duration_days: propDuration,
        }),
      });
      toast.success("Пакт предложен. Ждём подписи.");
      setPropOpen(false);
      setPropParties([]);
      setPropTermsText("");
      await fetchAll();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Не удалось предложить пакт.";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }, [propParties, propPact, propDuration, propTermsText, fetchAll]);

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка альянсов…
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
        <button
          type="button"
          onClick={() => setPropOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20"
        >
          <Plus className="h-3.5 w-3.5" />
          Новый пакт
        </button>
      </div>

      <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan">
          <Handshake className="h-3.5 w-3.5" />
          Альянсы и пакты
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          Пакт активируется когда все стороны подписали. Разрыв стоит -15 trust с каждым.
        </p>
      </div>

      {alliances.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-smoke">
          У тебя пока нет альянсов. Предложи кому-нибудь пакт.
        </div>
      ) : (
        <ul className="space-y-2">
          {alliances.map((a) => {
            const meta = STATUS_META[a.status];
            const pactInfo = PACT_TYPES.find((p) => p.slug === a.pact_type);
            const others = (a.parties ?? []).filter((pid) => pid !== me?.id);
            const everyone = a.parties ?? [];
            const signedSet = new Set(a.signatures);
            return (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-lg border p-4 transition-colors",
                  meta.bg,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border border-border bg-void/40 px-2 py-0.5 text-[10px] uppercase tracking-widest",
                          meta.color,
                        )}
                      >
                        {meta.icon}
                        {meta.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-cyan">
                        {pactInfo?.icon}
                        {pactInfo?.label ?? a.pact_type}
                      </span>
                      {a.expires_at && (a.status === "proposed" || a.status === "active") && (
                        <span className="text-[10px] uppercase tracking-widest text-smoke">
                          · до{" "}
                          {new Date(a.expires_at).toLocaleString("ru-RU", {
                            dateStyle: "short",
                          })}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {everyone.map((pid) => {
                        const p = playerById.get(pid);
                        const signed = signedSet.has(pid);
                        const isMe = me?.id === pid;
                        return (
                          <span
                            key={pid}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]",
                              signed
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                : "border-border bg-void/40 text-smoke",
                              isMe && "ring-1 ring-cyan/60",
                            )}
                            title={signed ? "Подписал" : "Не подписал"}
                          >
                            <span>{p?.tattoo ?? "❓"}</span>
                            <span>{p?.nickname ?? `#${pid}`}</span>
                            {signed && <span className="text-emerald-300">✓</span>}
                          </span>
                        );
                      })}
                    </div>
                    {a.terms && Object.keys(a.terms).length > 0 && (
                      <details className="mt-2 text-[11px] text-smoke">
                        <summary className="cursor-pointer uppercase tracking-widest">
                          Условия
                        </summary>
                        <pre className="mt-1 max-h-32 overflow-auto rounded-md border border-border bg-void/50 p-2 text-[10px]">
                          {JSON.stringify(a.terms, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {a.status === "proposed" && !a.is_signed_by_me && (
                      <button
                        type="button"
                        onClick={() => callAction(a.id, "sign")}
                        disabled={busyId === a.id}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        <FileSignature className="h-3 w-3" />
                        Подписать
                      </button>
                    )}
                    {a.status === "proposed" && a.is_signed_by_me && (
                      <button
                        type="button"
                        onClick={() => callAction(a.id, "cancel")}
                        disabled={busyId === a.id}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-void/50 px-2 py-1 text-[10px] uppercase tracking-widest text-smoke transition-colors hover:bg-void/70 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        Отменить
                      </button>
                    )}
                    {a.status === "active" && (
                      <button
                        type="button"
                        onClick={() => callAction(a.id, "break")}
                        disabled={busyId === a.id}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        <CircleSlash className="h-3 w-3" />
                        Разорвать (-15 trust)
                      </button>
                    )}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* Propose modal */}
      <AnimatePresence>
        {propOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-cyan/40 bg-card p-5 shadow-2xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan">
                  <Handshake className="h-4 w-4" />
                  <span className="text-sm font-semibold">Предложить пакт</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPropOpen(false)}
                  className="text-smoke hover:text-bone"
                  disabled={creating}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label className="mb-1 block text-[10px] uppercase tracking-widest text-smoke">
                Тип пакта
              </label>
              <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {PACT_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t.slug}
                    onClick={() => setPropPact(t.slug)}
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-2 text-left transition-colors",
                      propPact === t.slug
                        ? "border-cyan/60 bg-cyan/10"
                        : "border-border bg-void/40 hover:bg-void/60",
                    )}
                  >
                    <div className="mt-0.5 text-cyan">{t.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-bone">
                        {t.label}
                      </div>
                      <div className="text-[10px] text-smoke">{t.blurb}</div>
                    </div>
                  </button>
                ))}
              </div>

              <label className="mb-1 block text-[10px] uppercase tracking-widest text-smoke">
                Партнёры
              </label>
              <div className="mb-3 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-void/40 p-2">
                {otherPlayers.map((p) => {
                  const checked = propParties.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-void/60"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setPropParties((prev) =>
                            e.target.checked
                              ? [...prev, p.id]
                              : prev.filter((x) => x !== p.id),
                          )
                        }
                      />
                      <span>{p.tattoo}</span>
                      <span className="text-bone">{p.nickname}</span>
                      {p.block && (
                        <span className="text-smoke">· блок {p.block}</span>
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-widest text-smoke">
                    Срок (дней)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={21}
                    value={propDuration}
                    onChange={(e) =>
                      setPropDuration(
                        Math.max(1, Math.min(21, Number(e.target.value) || 1)),
                      )
                    }
                    className="w-full rounded-md border border-border bg-void/60 px-2 py-1.5 text-sm text-bone focus:border-cyan focus:outline-none"
                  />
                </div>
              </div>

              <label className="mb-1 block text-[10px] uppercase tracking-widest text-smoke">
                Условия JSON (опционально)
              </label>
              <textarea
                value={propTermsText}
                onChange={(e) => setPropTermsText(e.target.value)}
                rows={3}
                placeholder='{"amount": 100, "due_day": 12}'
                className="mb-3 w-full rounded-md border border-border bg-void/60 px-2 py-1.5 font-mono text-xs text-bone focus:border-cyan focus:outline-none"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPropOpen(false)}
                  disabled={creating}
                  className="flex-1 rounded-md border border-border bg-void/40 px-3 py-2 text-xs uppercase tracking-widest text-smoke transition-colors hover:bg-void/60 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={createPact}
                  disabled={creating || propParties.length === 0}
                  className="flex-1 rounded-md border border-cyan/50 bg-cyan/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-50"
                >
                  {creating ? "Создаю…" : "Предложить"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
