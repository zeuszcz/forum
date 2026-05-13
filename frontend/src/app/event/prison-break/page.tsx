"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Coins,
  Hammer,
  Handshake,
  Heart,
  Info,
  Lock,
  Newspaper,
  Play,
  Power,
  Settings,
  ShieldOff,
  ShoppingBag,
  Sparkles,
  Swords,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

import { WelcomeCinematic } from "./_components/welcome-cinematic";

// ---------------------------------------------------------------------------
// API types — mirror backend Pydantic
// ---------------------------------------------------------------------------
type PlayerMe = {
  id: number;
  event_id: number;
  nickname: string;
  tattoo: string;
  article: string;
  role: string | null;
  faction: string | null;
  block: string | null;
  cell_id: number | null;
  ap_current: number;
  ap_max: number;
  money: number;
  resource_scrap: number;
  resource_paper: number;
  status: string;
  welcome_seen_at: string | null;
  joined_at: string;
};
type EventPublic = {
  id: number;
  season: string;
  title: string;
  description: string;
  status: string;
  current_phase: string;
  current_day: number;
  signup_opens_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  config: Record<string, unknown>;
  registered_count: number;
  is_signed_up: boolean;
  can_signup: boolean;
};
type EventStatusResponse = {
  event: EventPublic | null;
  player: PlayerMe | null;
};

const PHASE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  setup: { label: "Прибытие", emoji: "🏚", color: "text-cyan" },
  plotting: { label: "Заговор", emoji: "⛏", color: "text-amber-300" },
  action: { label: "Действие", emoji: "⚔", color: "text-orange-400" },
  endgame: { label: "Финал", emoji: "🔥", color: "text-flame" },
  closed: { label: "Завершено", emoji: "✓", color: "text-smoke" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Черновик", color: "text-smoke" },
  signup: { label: "Регистрация", color: "text-cyan" },
  active: { label: "Идёт игра", color: "text-ember" },
  finished: { label: "Завершён", color: "text-smoke" },
  cancelled: { label: "Отменён", color: "text-flame" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PrisonBreakDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isStaff = useMemo(
    () => Boolean(user?.roles?.some((r) => r.is_staff)),
    [user],
  );

  const [data, setData] = useState<EventStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await api<EventStatusResponse>("/api/event/prison-break/status");
      setData(r);
      if (r.player && !r.player.welcome_seen_at) {
        setShowWelcome(true);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchStatus();
    // Refresh every 10s in case admin starts/transitions event.
    const id = window.setInterval(fetchStatus, 10_000);
    return () => window.clearInterval(id);
  }, [fetchStatus]);

  const handleWelcomeClose = useCallback(async () => {
    setShowWelcome(false);
    try {
      await api("/api/event/prison-break/welcome-ack", { method: "POST" });
    } catch { /* ignore */ }
    void fetchStatus();
  }, [fetchStatus]);

  const adminAction = useCallback(
    async (action: "open_signup" | "start" | "finish" | "cancel") => {
      if (busy) return;
      const confirmText: Record<typeof action, string> = {
        open_signup: "Открыть регистрацию на ивент?",
        start: "Запустить ивент? Это распределит роли и стартует Day 1.",
        finish: "Завершить ивент досрочно? Действие нельзя отменить.",
        cancel: "Отменить ивент? Игроки потеряют прогресс.",
      };
      if (!window.confirm(confirmText[action])) return;
      setBusy(true);
      try {
        const r = await api<{ ok: boolean; message: string | null }>(
          "/api/event/prison-break/admin/action",
          { method: "POST", body: JSON.stringify({ action }) },
        );
        toast.success(r.message ?? `Действие ${action} выполнено`);
        await fetchStatus();
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.detail);
        else toast.error("Ошибка");
      } finally {
        setBusy(false);
      }
    },
    [busy, fetchStatus],
  );

  const createDraft = useCallback(async () => {
    if (busy) return;
    const season = window.prompt(
      "Сезон (формат 2026.Q4):",
      `${new Date().getUTCFullYear()}.Q${Math.floor(new Date().getUTCMonth() / 3) + 1}`,
    );
    if (!season) return;
    setBusy(true);
    try {
      await api("/api/event/prison-break/admin/create", {
        method: "POST",
        body: JSON.stringify({
          season,
          title: "Тюремный Бунт",
          description: "21-дневный flagship-event JBF-форума.",
          duration_days: 21,
        }),
      });
      toast.success(`Сезон ${season} создан в черновике`);
      await fetchStatus();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("Ошибка создания");
    } finally {
      setBusy(false);
    }
  }, [busy, fetchStatus]);

  if (loading) {
    return (
      <div className="container py-12 text-center text-smoke">
        Загружаем тюрьму…
      </div>
    );
  }

  const event = data?.event;
  const player = data?.player;

  return (
    <div className="container py-6">
      <AnimatePresence>
        {showWelcome && player && (
          <WelcomeCinematic player={player} onClose={handleWelcomeClose} />
        )}
      </AnimatePresence>

      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-bone">
            <ShieldOff className="h-6 w-6 text-flame" />
            Тюремный Бунт
          </h1>
          <p className="mt-1 text-sm text-smoke">
            21-дневная игра-метаивент для JBF-комьюнити.{" "}
            <Link
              href="/event/prison-break/info"
              className="text-cyan underline decoration-cyan/40 underline-offset-2 hover:decoration-cyan"
            >
              Правила и подробности →
            </Link>
          </p>
        </div>
        <Link
          href="/event/prison-break/info"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/10 px-3 text-xs uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/15"
        >
          <Info className="h-3 w-3" />
          подробности
        </Link>
      </header>

      {/* ---------- Admin panel (always shown for staff, top-of-page) ---------- */}
      {isStaff && (
        <AdminPanel
          event={event}
          busy={busy}
          onCreateDraft={createDraft}
          onAction={adminAction}
        />
      )}

      {/* ---------- Main content ---------- */}
      {!event ? (
        <NoEventScreen isStaff={isStaff} onCreateDraft={createDraft} busy={busy} />
      ) : !player ? (
        <NotSignedUpScreen event={event} />
      ) : (
        <PlayerView event={event} player={player} onRefresh={fetchStatus} />
      )}

      {/* ---------- Debug indicator (visible to everyone, helps diagnose) ---------- */}
      <div className="mt-8 text-center text-[10px] text-smoke/40 font-mono">
        debug: user={user?.nickname ?? "anon"} · isStaff={String(isStaff)} · event={event?.season ?? "none"} · status={event?.status ?? "—"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AdminPanel({
  event,
  busy,
  onCreateDraft,
  onAction,
}: {
  event: EventPublic | null | undefined;
  busy: boolean;
  onCreateDraft: () => void;
  onAction: (a: "open_signup" | "start" | "finish" | "cancel") => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6 rounded-lg border border-flame/30 bg-flame/5 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Settings className="h-4 w-4 text-flame" />
        <span className="text-xs font-semibold uppercase tracking-widest text-flame">
          Управление ивентом (staff)
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {!event || ["finished", "cancelled"].includes(event.status) ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCreateDraft}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/10 px-3 uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-50"
          >
            <Play className="h-3 w-3" />
            создать сезон
          </button>
        ) : (
          <>
            {event.status === "draft" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("open_signup")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/10 px-3 uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-50"
              >
                <UserPlus className="h-3 w-3" />
                открыть регистрацию
              </button>
            )}
            {event.status === "signup" && (
              <button
                type="button"
                disabled={busy || event.registered_count < 4}
                onClick={() => onAction("start")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ember/40 bg-ember/10 px-3 uppercase tracking-widest text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
              >
                <Power className="h-3 w-3" />
                запустить (Day 1)
              </button>
            )}
            {event.status === "active" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("finish")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 uppercase tracking-widest text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
              >
                ✓ завершить
              </button>
            )}
            {["draft", "signup", "active"].includes(event.status) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("cancel")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-flame/40 bg-flame/10 px-3 uppercase tracking-widest text-flame transition-colors hover:bg-flame/20 disabled:opacity-50"
              >
                <Power className="h-3 w-3" />
                отменить
              </button>
            )}
          </>
        )}
        {event && (
          <span className="ml-auto font-mono text-smoke">
            {event.season} · status:{" "}
            <span className={STATUS_LABELS[event.status]?.color ?? "text-bone"}>
              {STATUS_LABELS[event.status]?.label ?? event.status}
            </span>
            {" · "}
            <span>{event.registered_count} участников</span>
          </span>
        )}
      </div>
    </motion.section>
  );
}

function NoEventScreen({
  isStaff,
  onCreateDraft,
  busy,
}: {
  isStaff: boolean;
  onCreateDraft: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <ShieldOff className="mx-auto mb-3 h-10 w-10 text-smoke" />
      <h2 className="text-xl font-bold text-bone">Сейчас никакого сезона нет</h2>
      <p className="mt-2 text-sm text-smoke">
        Следующий «Тюремный Бунт» начнётся когда модераторы запустят новый сезон.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/event/prison-break/info"
          className="inline-flex h-10 items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/10 px-4 text-xs uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/15"
        >
          <Info className="h-4 w-4" />
          что это вообще
        </Link>
        {isStaff && (
          <button
            type="button"
            onClick={onCreateDraft}
            disabled={busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-flame/50 bg-flame/15 px-5 text-sm font-bold uppercase tracking-widest text-flame transition-colors hover:bg-flame/25 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            создать первый сезон
          </button>
        )}
      </div>
    </div>
  );
}

function NotSignedUpScreen({ event }: { event: EventPublic }) {
  const phase = PHASE_LABELS[event.current_phase] ?? PHASE_LABELS.setup;
  if (event.status === "draft") {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold text-bone">
          Сезон {event.season} — черновик
        </h2>
        <p className="mt-2 text-sm text-smoke">
          Регистрация ещё не открыта. Жди когда модераторы откроют запись.
        </p>
      </div>
    );
  }
  if (event.status === "signup") {
    return (
      <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-8 text-center">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-cyan" />
        <h2 className="text-xl font-bold text-bone">
          {event.title} · {event.season}
        </h2>
        <p className="mt-2 text-sm text-smoke">
          {event.description || "Регистрация открыта."}{" "}
          <span className="text-cyan">{event.registered_count} участников</span> уже сели.
        </p>
        <Link
          href="/event/prison-break/signup"
          className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-md border border-flame/40 bg-flame/10 px-5 text-sm font-semibold uppercase tracking-widest text-flame transition-colors hover:bg-flame/15"
        >
          <Lock className="h-4 w-4" />
          сесть в тюрьму
        </Link>
      </div>
    );
  }
  // active / finished / cancelled
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold text-bone">
        Сезон {event.season} {event.status === "active" ? "идёт" : "завершён"}
      </h2>
      <p className="mt-2 text-sm text-smoke">
        Day {event.current_day}/{event.config["duration_days"] as number ?? 21}
        {" · "}
        <span className={phase.color}>
          {phase.emoji} {phase.label}
        </span>
      </p>
      {event.status === "active" && (
        <p className="mt-3 text-xs text-smoke">
          Регистрация на этот сезон закрыта. Жди следующего.
        </p>
      )}
    </div>
  );
}

function PlayerView({
  event,
  player,
  onRefresh,
}: {
  event: EventPublic;
  player: PlayerMe;
  onRefresh: () => void;
}) {
  const phase = PHASE_LABELS[event.current_phase] ?? PHASE_LABELS.setup;
  const durationDays = (event.config["duration_days"] as number) ?? 21;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      {/* LEFT: dashboard */}
      <div className="space-y-4">
        {/* Hero card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-lg border border-border bg-card p-5 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-smoke">
                Ты в этом сезоне
              </div>
              <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-bone">
                <span>{player.tattoo}</span>
                <span>{player.nickname || "(без прозвища)"}</span>
              </div>
              {player.article && (
                <div className="mt-0.5 text-xs italic text-smoke">
                  ст. «{player.article}»
                </div>
              )}
            </div>
            <div className="text-right text-xs">
              <div className="font-mono text-smoke">
                Day {event.current_day}/{durationDays}
              </div>
              <div className={cn("font-semibold uppercase tracking-widest", phase.color)}>
                {phase.emoji} {phase.label}
              </div>
            </div>
          </div>
          {player.role ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3 text-xs">
              <StatBox label="Роль" value={roleLabel(player.role)} />
              <StatBox label="Блок" value={player.block ?? "—"} />
              <StatBox label="AP" value={`${player.ap_current}/${player.ap_max}`} />
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-cyan/30 bg-cyan/5 p-3 text-xs text-cyan">
              <Sparkles className="mr-1 inline h-3 w-3" />
              Роль будет определена когда сезон стартует
            </div>
          )}
        </motion.div>

        {/* Resources */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="rounded-lg border border-border bg-card p-4"
        >
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
            <Coins className="h-3 w-3" />
            Ресурсы
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <ResourceBlock emoji="🪙" label="Валюта" value={player.money} />
            <ResourceBlock emoji="🔩" label="Шарашка" value={player.resource_scrap} />
            <ResourceBlock emoji="📜" label="Макулатура" value={player.resource_paper} />
          </div>
        </motion.div>

        {/* Actions — wired to backend (EPIC 2) */}
        <ActionsPanel player={player} onRefresh={onRefresh} />

        {/* Quick links: cell / workshop / market */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="grid gap-2 sm:grid-cols-3"
        >
          {player.cell_id && (
            <Link
              href={`/event/prison-break/cell/${player.cell_id}`}
              className="flex items-center gap-3 rounded-lg border border-cyan/30 bg-cyan/5 p-3 transition-colors hover:border-cyan/60 hover:bg-cyan/10"
            >
              <Lock className="h-5 w-5 text-cyan" />
              <div className="flex-1">
                <div className="text-xs font-semibold text-bone">
                  Камера {player.block}-{player.cell_id}
                </div>
                <div className="text-[9px] uppercase tracking-widest text-smoke">
                  чат + тоннель
                </div>
              </div>
              <span className="text-cyan">→</span>
            </Link>
          )}
          <Link
            href="/event/prison-break/workshop"
            className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 transition-colors hover:border-amber-500/60 hover:bg-amber-500/10"
          >
            <Hammer className="h-5 w-5 text-amber-400" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-bone">Мастерская</div>
              <div className="text-[9px] uppercase tracking-widest text-smoke">
                крафтить предметы
              </div>
            </div>
            <span className="text-amber-400">→</span>
          </Link>
          <Link
            href="/event/prison-break/market"
            className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10"
          >
            <ShoppingBag className="h-5 w-5 text-emerald-400" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-bone">Чёрный рынок</div>
              <div className="text-[9px] uppercase tracking-widest text-smoke">
                торговля order-book
              </div>
            </div>
            <span className="text-emerald-400">→</span>
          </Link>
        </motion.div>

        {/* EPIC 4 social-layer links */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18 }}
          className="grid gap-2 sm:grid-cols-3"
        >
          <Link
            href="/event/prison-break/intel"
            className="flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10"
          >
            <Newspaper className="h-5 w-5 text-rose-400" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-bone">Intel-лента</div>
              <div className="text-[9px] uppercase tracking-widest text-smoke">
                слухи · утечки · подсказки
              </div>
            </div>
            <span className="text-rose-400">→</span>
          </Link>
          <Link
            href="/event/prison-break/trust"
            className="flex items-center gap-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 transition-colors hover:border-fuchsia-500/60 hover:bg-fuchsia-500/10"
          >
            <Heart className="h-5 w-5 text-fuchsia-400" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-bone">Trust</div>
              <div className="text-[9px] uppercase tracking-widest text-smoke">
                связи · подарки · история
              </div>
            </div>
            <span className="text-fuchsia-400">→</span>
          </Link>
          <Link
            href="/event/prison-break/alliances"
            className="flex items-center gap-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 transition-colors hover:border-purple-500/60 hover:bg-purple-500/10"
          >
            <Handshake className="h-5 w-5 text-purple-400" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-bone">Альянсы</div>
              <div className="text-[9px] uppercase tracking-widest text-smoke">
                пакты · подписи · разрывы
              </div>
            </div>
            <span className="text-purple-400">→</span>
          </Link>
        </motion.div>
      </div>

      {/* RIGHT: side info */}
      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
            <Users className="h-3 w-3" />
            Сезон
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-smoke">Название</dt>
              <dd className="text-bone">{event.title}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-smoke">Период</dt>
              <dd className="text-bone">{event.season}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-smoke">Участников</dt>
              <dd className="text-bone">{event.registered_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-smoke">Статус</dt>
              <dd className={STATUS_LABELS[event.status]?.color ?? "text-bone"}>
                {STATUS_LABELS[event.status]?.label ?? event.status}
              </dd>
            </div>
          </dl>
        </div>

        <IntelTeaser />

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
            <Handshake className="h-3 w-3" />
            Альянсы
          </div>
          <AlliancesTeaser />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
            <Hammer className="h-3 w-3" />
            Мини-игры
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {[
              { icon: <Swords className="h-3 w-3" />, name: "Арена" },
              { icon: <Hammer className="h-3 w-3" />, name: "Мастерская" },
              { icon: <Lock className="h-3 w-3" />, name: "Взлом" },
              { icon: "👮", name: "Патруль" },
              { icon: "🚨", name: "Допрос" },
              { icon: "🛒", name: "Рынок" },
            ].map((m, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-md border border-border bg-void/40 px-2 py-1.5 text-smoke"
              >
                <span>{m.icon}</span>
                <span className="flex-1">{m.name}</span>
                <span className="text-[8px] uppercase text-cyan/60">soon</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-void/40 p-2.5">
      <div className="text-[9px] uppercase tracking-widest text-smoke">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-bone">
        {value}
      </div>
    </div>
  );
}

function ResourceBlock({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-border bg-void/40 p-3 text-center">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 font-mono text-lg font-bold text-bone">{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-smoke">{label}</div>
    </div>
  );
}

function roleLabel(role: string): string {
  return ({
    prisoner: "🔒 Зек",
    guard: "👮 Охрана",
    authority: "👑 Авторитет",
    spy: "🕵 Шпион",
    boss: "💀 Начальник",
  } as Record<string, string>)[role] ?? role;
}

// ---------------------------------------------------------------------------
// EPIC 4 sidebar teasers — pull last 3 intel + active alliances
// ---------------------------------------------------------------------------

type IntelTeaserItem = {
  intel_id: number;
  content: string;
  category: string;
  received_at: string;
};

function IntelTeaser() {
  const [items, setItems] = useState<IntelTeaserItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<IntelTeaserItem[]>("/api/event/prison-break/intel?limit=3")
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
        <Newspaper className="h-3 w-3" />
        Свежий intel
        <Link
          href="/event/prison-break/intel"
          className="ml-auto text-[9px] text-cyan hover:underline"
        >
          все →
        </Link>
      </div>
      {!loaded ? (
        <div className="text-xs text-smoke italic">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-smoke italic">
          Лента пуста. Свежие данные приходят раз в день.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li
              key={it.intel_id}
              className="rounded-md border border-border bg-void/40 px-2 py-1.5 text-[11px] text-bone"
            >
              <div className="text-[9px] uppercase tracking-widest text-cyan">
                {it.category}
              </div>
              <div className="line-clamp-2">{it.content}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type AllianceTeaserItem = {
  id: number;
  pact_type: string;
  status: string;
  parties: number[];
};

function AlliancesTeaser() {
  const [items, setItems] = useState<AllianceTeaserItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<AllianceTeaserItem[]>("/api/event/prison-break/alliances")
      .then((data) => {
        if (!cancelled) setItems(data.slice(0, 4));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!loaded) {
    return <div className="text-xs text-smoke italic">Загрузка…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="text-xs text-smoke italic">
        Пакты не заключены.{" "}
        <Link
          href="/event/prison-break/alliances"
          className="text-cyan hover:underline"
        >
          предложить
        </Link>
        .
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((a) => (
        <li
          key={a.id}
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-void/40 px-2 py-1.5 text-[11px]"
        >
          <span className="truncate text-bone">{a.pact_type}</span>
          <span
            className={cn(
              "text-[9px] uppercase tracking-widest",
              a.status === "active" && "text-emerald-400",
              a.status === "proposed" && "text-amber-300",
              a.status === "broken" && "text-rose-400",
              a.status === "expired" && "text-smoke",
              a.status === "cancelled" && "text-smoke",
            )}
          >
            {a.status} · {a.parties.length} стор.
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Actions panel — fires real action endpoint, updates AP optimistically
// ---------------------------------------------------------------------------

type ActionDef = {
  slug: "dig" | "visit" | "patrol" | "snitch" | "rest";
  icon: string;
  label: string;
  ap: number;
  requiresTarget?: boolean;
  roles?: string[];
};

const ACTION_CATALOG: ActionDef[] = [
  { slug: "dig", icon: "⛏", label: "Копать тоннель", ap: 2, roles: ["prisoner", "authority", "spy", "boss"] },
  { slug: "patrol", icon: "👮", label: "Патрулировать", ap: 1, roles: ["guard"] },
  { slug: "visit", icon: "🤝", label: "Визит к игроку", ap: 1, requiresTarget: true },
  { slug: "snitch", icon: "🚨", label: "Снитчить", ap: 2, requiresTarget: true, roles: ["prisoner", "authority", "spy", "boss"] },
  { slug: "rest", icon: "🛏", label: "Отдых", ap: 0 },
];

function ActionsPanel({
  player,
  onRefresh,
}: {
  player: PlayerMe;
  onRefresh: () => void;
}) {
  const [submitting, setSubmitting] = useState<string | null>(null);

  const runAction = async (slug: ActionDef["slug"], targetId?: number) => {
    if (submitting) return;
    setSubmitting(slug);
    try {
      const r = await api<{
        ok: boolean;
        ap_remaining: number;
        message: string;
        payload: Record<string, unknown>;
      }>("/api/event/prison-break/action", {
        method: "POST",
        body: JSON.stringify({
          action_type: slug,
          target_id: targetId ?? null,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      onRefresh();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("Ошибка действия");
    } finally {
      setSubmitting(null);
    }
  };

  const available = ACTION_CATALOG.filter((a) => {
    if (a.roles && player.role && !a.roles.includes(player.role)) return false;
    return true;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
          <Zap className="h-3 w-3" />
          Действия
        </span>
        <span className="font-mono text-[10px] text-cyan">
          {player.ap_current}/{player.ap_max} AP
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {available.map((a) => {
          const disabled =
            submitting !== null ||
            a.ap > player.ap_current ||
            a.requiresTarget; // TODO: target picker UI
          return (
            <button
              key={a.slug}
              type="button"
              disabled={disabled}
              onClick={() => void runAction(a.slug)}
              className={cn(
                "inline-flex h-12 items-center gap-2 rounded-md border px-3 text-xs transition-colors",
                disabled
                  ? "border-border bg-void text-smoke opacity-50 cursor-not-allowed"
                  : "border-flame/40 bg-flame/10 text-flame hover:bg-flame/20",
              )}
              title={a.requiresTarget ? "Нужна цель — UI выбора скоро" : undefined}
            >
              <span className="text-lg">{a.icon}</span>
              <span className="flex-1 text-left">{a.label}</span>
              <span className="font-mono">
                {a.ap > 0 ? `-${a.ap}AP` : "0AP"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-smoke italic">
        AP обнуляются ежедневно в 00:00 МСК. Цели для визит/снитч — UI выбора в следующей итерации.
      </p>
    </motion.div>
  );
}
