import { ArrowRight, Flame, Lock, ShieldOff, Swords, Users } from "lucide-react";
import Link from "next/link";

type EventPublic = {
  id: number;
  season: string;
  title: string;
  status: string; // draft|signup|active|finished|cancelled
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

type EventStatus = {
  event: EventPublic | null;
  player: { id: number } | null;
};

const PHASE_LABEL: Record<string, { label: string; emoji: string }> = {
  setup: { label: "Прибытие", emoji: "🏚" },
  plotting: { label: "Заговор", emoji: "⛏" },
  action: { label: "Действие", emoji: "⚔" },
  endgame: { label: "Финал", emoji: "🔥" },
  closed: { label: "Завершено", emoji: "✓" },
};

/**
 * Homepage CTA for the Prison Break event. Server-component, no client JS.
 * Renders different messaging depending on event.status + whether the
 * viewer is already signed up.
 */
export function PrisonBreakBanner({ status }: { status: EventStatus | null }) {
  const event = status?.event ?? null;

  // Determine messaging
  let cta: string;
  let headline: string;
  let blurb: string;
  let pillText: string | null = null;

  if (!event) {
    headline = "Тюремный Бунт";
    blurb = "21-дневное ролевое событие с тоннелями, ареной и финалом. Скоро следующий сезон.";
    cta = "Посмотреть";
  } else if (event.status === "draft") {
    headline = `Тюремный Бунт · ${event.season}`;
    blurb = "Сезон готовится. Скоро откроется регистрация.";
    cta = "Подробнее";
    pillText = "DRAFT";
  } else if (event.status === "signup") {
    if (status?.player) {
      headline = `Ты в деле · ${event.season}`;
      blurb = `Старт сезона через ${formatDelta(event.starts_at)}. Дождись Day 1.`;
      cta = "К моему делу";
    } else {
      headline = `Открыта регистрация · ${event.season}`;
      blurb = `${event.registered_count} участников уже в списке. Места ограничены — заходи.`;
      cta = "Записаться";
    }
    pillText = "SIGNUP";
  } else if (event.status === "active") {
    const phase = PHASE_LABEL[event.current_phase] ?? null;
    if (status?.player) {
      headline = `День ${event.current_day}/21 · ${event.season}`;
      blurb = phase
        ? `Фаза «${phase.label}». Действуй, пока AP не сгорели.`
        : "События идут прямо сейчас.";
      cta = "В дашборд";
    } else {
      headline = `Идёт сезон · день ${event.current_day}/21`;
      blurb = phase
        ? `Фаза «${phase.label}» ${phase.emoji}. Зайди наблюдать или поставить на арену.`
        : "Открой дашборд — увидишь хронику и арену.";
      cta = "Смотреть";
    }
    pillText = "LIVE";
  } else if (event.status === "finished") {
    headline = `Сезон ${event.season} завершён`;
    blurb = "Финальный занавес поднят. Загляни в хронику — узнаешь все роли.";
    cta = "Хроника";
  } else {
    headline = `Сезон ${event.season}`;
    blurb = "Сезон отменён.";
    cta = "Подробнее";
  }

  return (
    <Link
      href="/event/prison-break"
      className="group relative block overflow-hidden rounded-xl border border-flame/30 bg-gradient-to-br from-flame/10 via-flame/5 to-rose-500/5 p-4 transition-all hover:border-flame/60 hover:from-flame/15 hover:via-flame/10 hover:to-rose-500/10 md:p-5"
    >
      {/* Decorative bars */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-flame/80" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, #f87171 0 1px, transparent 1px 12px)",
        }}
      />

      <div className="relative flex flex-wrap items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-flame/40 bg-flame/10 text-flame">
          <ShieldOff className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-flame">
              ивент
            </span>
            {pillText && (
              <span
                className={
                  "rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest " +
                  (pillText === "LIVE"
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 animate-pulse"
                    : pillText === "SIGNUP"
                      ? "border-cyan/50 bg-cyan/10 text-cyan"
                      : "border-border bg-void/40 text-smoke")
                }
              >
                {pillText}
              </span>
            )}
            {event && event.registered_count > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-smoke">
                <Users className="h-3 w-3" />
                <span className="font-mono">{event.registered_count}</span>
                <span>участников</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-bone md:text-base">
            <Flame className="h-4 w-4 text-flame" />
            {headline}
          </div>
          <p className="mt-0.5 text-xs text-ash md:text-sm">{blurb}</p>

          {/* Feature pills — visible on wider screens */}
          <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex">
            <FeaturePill icon={<Lock className="h-3 w-3" />} label="Тоннели" />
            <FeaturePill icon={<Swords className="h-3 w-3" />} label="Арена 1×1" />
            <FeaturePill icon={<Flame className="h-3 w-3" />} label="Финал" />
            <FeaturePill icon={<Users className="h-3 w-3" />} label="Альянсы" />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 rounded-md border border-flame/50 bg-flame/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-flame transition-all group-hover:border-flame/80 group-hover:bg-flame/25">
          {cta}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

function FeaturePill({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-void/40 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-smoke">
      {icon}
      {label}
    </span>
  );
}

function formatDelta(iso: string | null): string {
  if (!iso) return "скоро";
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return "уже скоро";
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} д.`;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} ч.`;
  const minutes = Math.floor(diff / (60 * 1000));
  return `${Math.max(1, minutes)} мин.`;
}
