"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronLeft,
  CircleSlash,
  Gavel,
  Handshake,
  HelpCircle,
  MessageCircle,
  Mic,
  MicOff,
  Plus,
  ScrollText,
  Search,
  Send,
  Sword,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Turn = {
  id: number;
  role: "question" | "answer" | "system";
  speaker_id: number;
  tactic: string;
  body: string;
  delta_pressure: number;
  created_at: string;
};

type Session = {
  id: number;
  interrogator_id: number;
  suspect_id: number;
  topic: string;
  status: string;
  rounds_remaining: number;
  pressure: number;
  trust_loss: number;
  started_at: string;
  ended_at: string | null;
  outcome: Record<string, unknown>;
  turns: Turn[];
  is_interrogator: boolean;
  is_suspect: boolean;
};

type PlayerCard = {
  id: number;
  nickname: string;
  tattoo: string;
  block: string | null;
};

type PlayerMe = {
  id: number;
  role: string | null;
  ap_current: number;
  ap_max: number;
};

const TOPIC_LABEL: Record<string, string> = {
  general: "Общий",
  tunnel: "Тоннель",
  alliance: "Альянс",
  intel_leak: "Утечка intel",
  role: "Роль",
};

const INT_TACTICS = [
  { slug: "ask", label: "Спросить", delta: "+2", icon: <HelpCircle className="h-3 w-3" /> },
  { slug: "bluff", label: "Блеф", delta: "+6", icon: <MessageCircle className="h-3 w-3" /> },
  { slug: "threat", label: "Угроза", delta: "+10", icon: <Sword className="h-3 w-3" /> },
  { slug: "offer", label: "Сделка", delta: "+4", icon: <Handshake className="h-3 w-3" /> },
] as const;

const SUS_TACTICS = [
  { slug: "truth", label: "Правда", delta: "-10", icon: <ScrollText className="h-3 w-3" /> },
  { slug: "lie", label: "Ложь", delta: "+4", icon: <AlertTriangle className="h-3 w-3" /> },
  { slug: "silence", label: "Молчать", delta: "-3", icon: <MicOff className="h-3 w-3" /> },
] as const;

const ELIGIBLE_INTERROGATOR_ROLES = new Set(["guard", "authority", "boss"]);

export default function InterrogationPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [me, setMe] = useState<PlayerMe | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [suspectId, setSuspectId] = useState<number | null>(null);
  const [topic, setTopic] = useState<string>("general");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [bodyText, setBodyText] = useState("");
  const [chosenTactic, setChosenTactic] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [st, list, ps] = await Promise.all([
        api<{ player: PlayerMe | null }>("/api/event/prison-break/status"),
        api<Session[]>("/api/event/prison-break/interrogation/list"),
        api<PlayerCard[]>("/api/event/prison-break/players"),
      ]);
      setMe(st.player);
      setSessions(list);
      setPlayers(ps);
      if (!activeId && list.length > 0) {
        setActiveId(list.find((s) => s.status === "active")?.id ?? list[0].id);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить допросы.");
    } finally {
      setLoading(false);
    }
  }, [router, activeId]);

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
    () => players.filter((p) => p.id !== me?.id),
    [players, me?.id],
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  const canInterrogate = me && ELIGIBLE_INTERROGATOR_ROLES.has(me.role ?? "");

  const startSession = useCallback(async () => {
    if (!suspectId) return;
    setBusy(true);
    try {
      const s = await api<Session>("/api/event/prison-break/interrogation/start", {
        method: "POST",
        body: JSON.stringify({ suspect_player_id: suspectId, topic }),
      });
      setStartOpen(false);
      setSuspectId(null);
      toast.success("Допрос начат.");
      setActiveId(s.id);
      await fetchAll();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Ошибка.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [suspectId, topic, fetchAll]);

  const submitTurn = useCallback(async () => {
    if (!activeSession || !chosenTactic) return;
    const isQ = activeSession.is_interrogator;
    setBusy(true);
    try {
      const path = isQ ? "question" : "answer";
      await api<{
        ok: boolean;
        pressure: number;
        rounds_remaining: number;
        status: string;
      }>(`/api/event/prison-break/interrogation/${activeSession.id}/${path}`, {
        method: "POST",
        body: JSON.stringify({ tactic: chosenTactic, body: bodyText.trim() }),
      });
      setBodyText("");
      setChosenTactic(null);
      await fetchAll();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Ошибка.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [activeSession, chosenTactic, bodyText, fetchAll]);

  const abortSession = useCallback(async () => {
    if (!activeSession || !activeSession.is_interrogator) return;
    setBusy(true);
    try {
      await api<Session>(
        `/api/event/prison-break/interrogation/${activeSession.id}/abort`,
        { method: "POST" },
      );
      toast.message("Допрос прерван.");
      await fetchAll();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "Ошибка.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [activeSession, fetchAll]);

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/event/prison-break"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          К дашборду
        </Link>
        <div className="flex items-center gap-2">
          {me && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
              <Zap className="h-3.5 w-3.5 text-cyan" />
              <span className="font-mono text-bone">
                {me.ap_current}/{me.ap_max} AP
              </span>
            </div>
          )}
          {canInterrogate && (
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Новый допрос
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-rose-300">
          <Gavel className="h-3.5 w-3.5" />
          Допросная
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          3 раунда. Поднимаешь pressure до 80+ — признание. Падает до 20- —
          молчание. Цена вопроса — 1 AP охранника.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Session list */}
        <aside className="space-y-1.5">
          {sessions.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-4 text-xs text-smoke">
              Допросов ещё не было.
            </div>
          ) : (
            sessions.map((s) => {
              const other =
                playerById.get(s.is_interrogator ? s.suspect_id : s.interrogator_id);
              const isActiveSession = s.status === "active";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setActiveId(s.id);
                    setBodyText("");
                    setChosenTactic(null);
                  }}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-md border p-2.5 text-left transition-colors",
                    activeId === s.id
                      ? "border-rose-500/60 bg-rose-500/10"
                      : "border-border bg-card hover:bg-void/60",
                  )}
                >
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                    <span
                      className={cn(
                        s.is_interrogator ? "text-cyan" : "text-amber-300",
                      )}
                    >
                      {s.is_interrogator ? "ты допрашиваешь" : "тебя допрашивают"}
                    </span>
                    <span
                      className={cn(
                        isActiveSession ? "text-emerald-400" :
                        s.status === "confession" ? "text-amber-300" :
                        s.status === "silence" ? "text-cyan" : "text-smoke",
                      )}
                    >
                      {s.status}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-bone">
                    {other?.tattoo} {other?.nickname ?? `#${other?.id ?? "?"}`}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-smoke">
                    <span>тема: {TOPIC_LABEL[s.topic] ?? s.topic}</span>
                    <span>P: {s.pressure}</span>
                  </div>
                </button>
              );
            })
          )}
        </aside>

        {/* Theatre */}
        <section>
          {!activeSession ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-smoke">
              Выбери допрос слева, или начни новый.
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              <header className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-smoke">
                    Тема — {TOPIC_LABEL[activeSession.topic] ?? activeSession.topic}
                  </div>
                  <div className="text-sm font-semibold text-bone">
                    {activeSession.is_interrogator
                      ? "Допрашиваешь "
                      : "Допрашивают тебя ("}
                    {playerById.get(
                      activeSession.is_interrogator
                        ? activeSession.suspect_id
                        : activeSession.interrogator_id,
                    )?.nickname ?? "?"}
                    {!activeSession.is_interrogator && ")"}
                  </div>
                </div>
                <PressureGauge pressure={activeSession.pressure} />
              </header>

              <div className="flex items-center gap-3 text-[11px] text-smoke">
                <span>раундов: <span className="text-bone">{activeSession.rounds_remaining}</span></span>
                <span>·</span>
                <span>статус: <span className="text-bone">{activeSession.status}</span></span>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-void/30 p-3 space-y-2">
                {activeSession.turns.length === 0 ? (
                  <div className="text-xs text-smoke">Пока ничего не сказано.</div>
                ) : (
                  activeSession.turns.map((t) => {
                    const isSystem = t.role === "system";
                    const speaker = playerById.get(t.speaker_id);
                    const isInt = t.speaker_id === activeSession.interrogator_id;
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "flex gap-2",
                          isSystem
                            ? "justify-center"
                            : isInt
                              ? "justify-start"
                              : "justify-end",
                        )}
                      >
                        {!isSystem && (
                          <div
                            className={cn(
                              "max-w-[80%] rounded-md border p-2 text-xs",
                              isInt
                                ? "border-cyan/30 bg-cyan/5 text-bone"
                                : "border-amber-500/30 bg-amber-500/5 text-bone",
                            )}
                          >
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-smoke">
                              <span>{speaker?.nickname ?? `#${t.speaker_id}`}</span>
                              <span>·</span>
                              <span>{t.tactic}</span>
                              <span
                                className={cn(
                                  t.delta_pressure > 0
                                    ? "text-rose-400"
                                    : t.delta_pressure < 0
                                      ? "text-emerald-400"
                                      : "text-smoke",
                                )}
                              >
                                {t.delta_pressure > 0 ? "+" : ""}
                                {t.delta_pressure}
                              </span>
                            </div>
                            <div className="mt-1">{t.body || "…"}</div>
                          </div>
                        )}
                        {isSystem && (
                          <div className="text-[10px] uppercase tracking-widest text-smoke">
                            {t.body}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {activeSession.status === "active" && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {(activeSession.is_interrogator ? INT_TACTICS : SUS_TACTICS).map((t) => (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() => setChosenTactic(t.slug)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors",
                          chosenTactic === t.slug
                            ? "border-rose-500/60 bg-rose-500/15 text-rose-200"
                            : "border-border bg-void/40 text-smoke hover:bg-void/60",
                        )}
                      >
                        {t.icon}
                        <span>{t.label}</span>
                        <span className="font-mono text-[10px] text-smoke">{t.delta}</span>
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value.slice(0, 500))}
                    placeholder={
                      activeSession.is_interrogator
                        ? "Что спрашиваешь?"
                        : "Что отвечаешь?"
                    }
                    className="w-full rounded-md border border-border bg-void/50 px-3 py-2 text-xs text-bone focus:border-rose-500/60 focus:outline-none"
                    rows={2}
                  />

                  <div className="flex justify-between gap-2">
                    {activeSession.is_interrogator && (
                      <button
                        type="button"
                        onClick={abortSession}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-void/40 px-3 py-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:bg-void/60 disabled:opacity-50"
                      >
                        <CircleSlash className="h-3 w-3" />
                        Прервать
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={submitTurn}
                      disabled={busy || !chosenTactic}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-rose-500/50 bg-rose-500/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-rose-200 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                      {activeSession.is_interrogator ? "Спросить (1 AP)" : "Ответить"}
                    </button>
                  </div>
                </>
              )}

              {activeSession.status !== "active" && (
                <OutcomeCard session={activeSession} />
              )}
            </div>
          )}
        </section>
      </div>

      {/* Start modal */}
      <AnimatePresence>
        {startOpen && (
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
              className="w-full max-w-md rounded-xl border border-rose-500/40 bg-card p-5 shadow-2xl"
            >
              <div className="mb-3 flex items-center gap-2 text-rose-300">
                <Search className="h-4 w-4" />
                <span className="text-sm font-semibold">Начать допрос</span>
              </div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-smoke">
                Подозреваемый
              </label>
              <select
                value={suspectId ?? ""}
                onChange={(e) =>
                  setSuspectId(e.target.value ? Number(e.target.value) : null)
                }
                className="mb-3 w-full rounded-md border border-border bg-void/60 px-3 py-2 text-sm text-bone focus:border-rose-500/60 focus:outline-none"
              >
                <option value="">— выбери —</option>
                {otherPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.tattoo} {p.nickname}
                    {p.block ? ` · блок ${p.block}` : ""}
                  </option>
                ))}
              </select>

              <label className="mb-1 block text-[10px] uppercase tracking-widest text-smoke">
                Тема
              </label>
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {Object.entries(TOPIC_LABEL).map(([k, label]) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setTopic(k)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-xs transition-colors",
                      topic === k
                        ? "border-rose-500/60 bg-rose-500/10 text-rose-200"
                        : "border-border bg-void/40 hover:bg-void/60 text-bone",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStartOpen(false)}
                  disabled={busy}
                  className="flex-1 rounded-md border border-border bg-void/40 px-3 py-2 text-xs uppercase tracking-widest text-smoke transition-colors hover:bg-void/60 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={startSession}
                  disabled={busy || !suspectId}
                  className="flex-1 rounded-md border border-rose-500/50 bg-rose-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-rose-200 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
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

function PressureGauge({ pressure }: { pressure: number }) {
  const color =
    pressure >= 80 ? "text-rose-400" :
    pressure >= 60 ? "text-amber-400" :
    pressure <= 20 ? "text-cyan" :
    pressure <= 40 ? "text-emerald-400" : "text-bone";
  return (
    <div className="flex items-center gap-2">
      <div className="text-[10px] uppercase tracking-widest text-smoke">давление</div>
      <div className={cn("font-mono text-2xl font-bold", color)}>{pressure}</div>
      <div className="h-10 w-2 overflow-hidden rounded-full bg-void/60">
        <div
          className={cn(
            "w-full transition-all",
            pressure >= 80 ? "bg-rose-500" :
            pressure >= 60 ? "bg-amber-500" :
            pressure <= 20 ? "bg-cyan" :
            pressure <= 40 ? "bg-emerald-500" : "bg-bone/60",
          )}
          style={{ height: `${pressure}%`, marginTop: `${100 - pressure}%` }}
        />
      </div>
    </div>
  );
}

function OutcomeCard({
  session,
}: {
  session: Session;
}) {
  const cls =
    session.status === "confession"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : session.status === "silence"
        ? "border-cyan/40 bg-cyan/10 text-cyan"
        : "border-border bg-void/40 text-smoke";
  return (
    <div className={cn("rounded-md border p-3 text-xs", cls)}>
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest">
        {session.status === "confession" && <Mic className="h-3 w-3" />}
        {session.status === "silence" && <MicOff className="h-3 w-3" />}
        <span>{session.status}</span>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
        {JSON.stringify(session.outcome ?? {}, null, 2)}
      </pre>
    </div>
  );
}
