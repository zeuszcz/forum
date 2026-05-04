import { Flame, Sparkles, Users } from "lucide-react";

import { MarqueeTicker } from "@/components/effects/MarqueeTicker";
import { MeshBackground } from "@/components/effects/MeshBackground";
import { NumberTicker } from "@/components/effects/NumberTicker";
import {
  ScrollReveal,
  StaggerItem,
  StaggerList,
} from "@/components/effects/ScrollReveal";
import { ActivityPulse } from "@/components/forum/ActivityPulse";
import {
  BirthdaysWidget,
  RecentVisitorsWidget,
  ScandalOfWeekWidget,
} from "@/components/forum/HomeMiniWidgets";
import { HotThreads } from "@/components/forum/HotThreads";
import { LiveActivityFeed } from "@/components/forum/LiveActivityFeed";
import { OnlineList } from "@/components/forum/OnlineList";
import { DailyQuestsWidget } from "@/components/forum/DailyQuestsWidget";
import { PersonalCard } from "@/components/forum/PersonalCard";
import { RecentThreads } from "@/components/forum/RecentThreads";
import { SectionCard } from "@/components/forum/SectionCard";
import { ServerStatusWidget } from "@/components/forum/ServerStatusWidget";
import { Shoutbox } from "@/components/forum/Shoutbox";
import { TopPodium, type TopUser } from "@/components/forum/TopPodium";
import { apiServer } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type {
  ActivityResponse,
  FeedEvent,
  ScandalThread,
  Section,
  SectionPulse,
  ShoutboxMessage,
  SparklineData,
  Thread,
  UserPublic,
} from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadHomeData() {
  const [
    sections,
    recentThreads,
    hotThreads,
    online,
    shoutbox,
    sparklines,
    top,
    activity,
    feed,
    pulse,
    birthdays,
    recentVisitors,
    scandal,
  ] = await Promise.all([
    apiServer<Section[]>("/sections"),
    apiServer<Thread[]>("/threads/recent?limit=8"),
    apiServer<Thread[]>("/threads/hot?limit=5&hours=24"),
    apiServer<UserPublic[]>("/users/online"),
    apiServer<ShoutboxMessage[]>("/shoutbox?limit=50"),
    apiServer<SparklineData[]>("/stats/sparklines?hours=24"),
    apiServer<TopUser[]>("/stats/top-users?period=week&limit=3"),
    apiServer<ActivityResponse>("/stats/activity?hours=24"),
    apiServer<FeedEvent[]>("/stats/feed?limit=20"),
    apiServer<SectionPulse[]>("/stats/section-pulse?minutes=10"),
    apiServer<UserPublic[]>("/users/birthdays-today"),
    apiServer<UserPublic[]>("/users/recent-visitors?hours=24"),
    apiServer<ScandalThread | null>("/stats/scandal-of-week"),
  ]);
  return {
    sections,
    recentThreads,
    hotThreads,
    online,
    shoutbox,
    sparklines,
    top,
    activity,
    feed,
    pulse,
    birthdays,
    recentVisitors,
    scandal,
  };
}

export default async function HomePage() {
  const {
    sections,
    recentThreads,
    hotThreads,
    online,
    shoutbox,
    sparklines,
    top,
    activity,
    feed,
    pulse,
    birthdays,
    recentVisitors,
    scandal,
  } = await loadHomeData();

  const totalThreads = sections.reduce((s, x) => s + x.thread_count, 0);
  const totalPosts = sections.reduce((s, x) => s + x.post_count, 0);
  const sparkBySlug = Object.fromEntries(sparklines.map((s) => [s.slug, s.values]));
  const pulseBySection = Object.fromEntries(
    pulse.map((p) => [p.section_id, p.count]),
  );

  const tickerItems = [
    <span key="online" className="inline-flex items-center gap-1.5">
      <Users className="h-3 w-3 text-cyan" />
      <span className="font-mono text-cyan">{online.length}</span> онлайн
    </span>,
    ...recentThreads.slice(0, 5).map((t) => (
      <span key={t.id} className="inline-flex items-center gap-1.5">
        <Flame className="h-3 w-3 text-flame" />
        <span className="text-ash">{t.title}</span>
        <span className="text-smoke/60">
          · {relativeTime(t.last_post_at ?? t.created_at)}
        </span>
      </span>
    )),
    <span key="welcome" className="inline-flex items-center gap-1.5">
      <Sparkles className="h-3 w-3 text-plasma" /> endless·war v0
    </span>,
  ];

  return (
    <div className="relative">
      {/* === Compact hero === */}
      <section className="relative overflow-hidden border-b border-border/40">
        <MeshBackground />
        <div className="dotted-grid absolute inset-0 -z-[5] opacity-50" />

        <div className="container relative z-10 pt-8 pb-6 md:pt-10 md:pb-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="font-sans text-3xl font-extrabold leading-[1.05] tracking-tight md:text-4xl">
                <span className="text-bone">сообщество </span>
                <span className="text-iridescent">endless·war</span>
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-ash">
                CS 1.6 jail — общение, бан-апелляции, жалобы и движ
              </p>
            </div>
            <div className="grid grid-cols-3 gap-6 text-center md:gap-10">
              <Stat label="Тем" value={totalThreads} accent="plasma" />
              <Stat label="Сообщений" value={totalPosts} accent="flame" />
              <Stat label="Онлайн" value={online.length} accent="cyan" live />
            </div>
          </div>

          <div className="mt-6 rounded-md glass px-4 py-2.5">
            <MarqueeTicker items={tickerItems} />
          </div>
        </div>
      </section>

      {/* === Pulse strip — full width === */}
      <section className="border-b border-border/40">
        <div className="container py-4">
          <ActivityPulse initial={activity} />
        </div>
      </section>

      {/* === Personal greeting + daily quests (logged-in only) === */}
      <div className="container space-y-4 pt-6">
        <PersonalCard />
        <DailyQuestsWidget />
      </div>

      {/* === Main grid === */}
      <div className="container py-6 md:py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* === Main column === */}
          <div className="space-y-6">
            <section>
              <header className="mb-3 flex items-center gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-smoke">
                  разделы
                </h2>
                <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                <span className="text-[10px] uppercase tracking-widest text-smoke">
                  ●{" "}
                  <span className="text-flame">
                    {pulse.reduce((s, p) => s + p.count, 0)}
                  </span>{" "}
                  за 10 мин
                </span>
              </header>

              {sections.length === 0 ? (
                <div className="card-premium p-10 text-center text-sm text-smoke">
                  Разделы ещё не созданы. Запусти{" "}
                  <code className="font-mono text-ash">scripts/seed.py</code>.
                </div>
              ) : (
                <div className="space-y-6">
                  {sections.map((s) => (
                    <div key={s.id} className="space-y-3">
                      {s.children && s.children.length > 0 ? (
                        <>
                          <div className="flex items-center gap-3">
                            <h3 className="text-[11px] font-bold uppercase tracking-widest text-plasma">
                              {s.title}
                            </h3>
                            <div className="h-px flex-1 bg-gradient-to-r from-plasma/30 to-transparent" />
                          </div>
                          <StaggerList stagger={0.04} className="grid gap-4 sm:grid-cols-2">
                            {s.children.map((c) => (
                              <StaggerItem key={c.id}>
                                <SectionCard
                                  section={c}
                                  sparkline={sparkBySlug[c.slug]}
                                  pulseCount={pulseBySection[c.id] ?? 0}
                                />
                              </StaggerItem>
                            ))}
                          </StaggerList>
                        </>
                      ) : (
                        <StaggerList
                          stagger={0.04}
                          className="grid gap-4 sm:grid-cols-2"
                        >
                          <StaggerItem key={s.id}>
                            <SectionCard
                              section={s}
                              sparkline={sparkBySlug[s.slug]}
                              pulseCount={pulseBySection[s.id] ?? 0}
                            />
                          </StaggerItem>
                        </StaggerList>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {scandal && (
              <ScrollReveal>
                <ScandalOfWeekWidget thread={scandal} />
              </ScrollReveal>
            )}

            <ScrollReveal>
              <LiveActivityFeed initialEvents={feed} visible={12} />
            </ScrollReveal>

            <ScrollReveal>
              <RecentThreads threads={recentThreads} />
            </ScrollReveal>
          </div>

          {/* === Sticky sidebar === */}
          <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
            <ScrollReveal>
              <Shoutbox initialMessages={shoutbox} />
            </ScrollReveal>
            {birthdays.length > 0 && (
              <ScrollReveal delay={0.03}>
                <BirthdaysWidget users={birthdays} />
              </ScrollReveal>
            )}
            <ScrollReveal delay={0.05}>
              <ServerStatusWidget />
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <HotThreads threads={hotThreads} />
            </ScrollReveal>
            {top.length > 0 && (
              <ScrollReveal delay={0.15}>
                <TopPodium users={top} />
              </ScrollReveal>
            )}
            <ScrollReveal delay={0.18}>
              <OnlineList users={online} />
            </ScrollReveal>
            <ScrollReveal delay={0.22}>
              <RecentVisitorsWidget users={recentVisitors} hours={24} />
            </ScrollReveal>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  live = false,
}: {
  label: string;
  value: number;
  accent: "plasma" | "flame" | "cyan";
  live?: boolean;
}) {
  const colorClass =
    accent === "plasma"
      ? "text-plasma"
      : accent === "flame"
        ? "text-flame"
        : "text-cyan";
  return (
    <div className="text-center">
      <div
        className={`flex items-baseline justify-center gap-1.5 font-mono text-2xl font-bold ${colorClass} md:text-3xl`}
      >
        <NumberTicker value={value} />
        {live && (
          <span className="dot-live ml-1 inline-block animate-pulse-slow self-center" />
        )}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-smoke">
        {label}
      </div>
    </div>
  );
}
