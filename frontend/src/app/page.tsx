import { Activity, Flame, Sparkles, Users } from "lucide-react";

import { MarqueeTicker } from "@/components/effects/MarqueeTicker";
import { MeshBackground } from "@/components/effects/MeshBackground";
import { NumberTicker } from "@/components/effects/NumberTicker";
import {
  ScrollReveal,
  StaggerItem,
  StaggerList,
} from "@/components/effects/ScrollReveal";
import { OnlineList } from "@/components/forum/OnlineList";
import { RecentThreads } from "@/components/forum/RecentThreads";
import { SectionCard } from "@/components/forum/SectionCard";
import { Shoutbox } from "@/components/forum/Shoutbox";
import { apiServer } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { Section, ShoutboxMessage, Thread, UserPublic } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadHomeData() {
  const [sections, recentThreads, online, shoutbox] = await Promise.all([
    apiServer<Section[]>("/sections"),
    apiServer<Thread[]>("/threads/recent?limit=8"),
    apiServer<UserPublic[]>("/users/online"),
    apiServer<ShoutboxMessage[]>("/shoutbox?limit=50"),
  ]);
  return { sections, recentThreads, online, shoutbox };
}

export default async function HomePage() {
  const { sections, recentThreads, online, shoutbox } = await loadHomeData();
  const totalThreads = sections.reduce((s, x) => s + x.thread_count, 0);
  const totalPosts = sections.reduce((s, x) => s + x.post_count, 0);

  // Marquee items: latest 6 threads + online count
  const tickerItems = [
    <span key="online">
      <Users className="h-3 w-3 text-cyan" /> {online.length} онлайн
    </span>,
    ...recentThreads.slice(0, 5).map((t) => (
      <span key={t.id}>
        <Flame className="h-3 w-3 text-flame" />{" "}
        <span className="text-ash">{t.title}</span>{" "}
        <span className="text-smoke/60">· {relativeTime(t.last_post_at ?? t.created_at)}</span>
      </span>
    )),
    <span key="welcome">
      <Sparkles className="h-3 w-3 text-plasma" /> endless·war v0
    </span>,
  ];

  return (
    <div className="relative">
      {/* === Hero with mesh + marquee === */}
      <section className="relative overflow-hidden border-b border-border/40">
        <MeshBackground />
        <div className="dotted-grid absolute inset-0 -z-[5] opacity-50" />

        <div className="container relative z-10 pt-10 pb-8 md:pt-14 md:pb-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="font-sans text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
                <span className="text-bone">сообщество </span>
                <span className="text-iridescent">endless·war</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm text-ash md:text-base">
                CS 1.6 jail mode. Ниже — разделы форума, общий чат и кто сейчас в сети.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-6 text-center md:gap-10">
              <Stat label="Тем" value={totalThreads} accent="plasma" />
              <Stat label="Сообщений" value={totalPosts} accent="flame" />
              <Stat label="Онлайн" value={online.length} accent="cyan" live />
            </div>
          </div>

          <div className="mt-8 rounded-md glass px-4 py-2.5">
            <MarqueeTicker items={tickerItems} />
          </div>
        </div>
      </section>

      {/* === Main grid === */}
      <div className="container py-8 md:py-10">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* main column */}
          <div className="space-y-8">
            <section>
              <header className="mb-4 flex items-center gap-3">
                <Activity className="h-4 w-4 text-plasma" />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-smoke">
                  разделы
                </h2>
                <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
              </header>

              {sections.length === 0 ? (
                <div className="card-premium p-10 text-center text-sm text-smoke">
                  Разделы ещё не созданы. Запусти{" "}
                  <code className="font-mono text-ash">scripts/seed.py</code>.
                </div>
              ) : (
                <StaggerList stagger={0.05} className="grid gap-4 sm:grid-cols-2">
                  {sections.map((s) => (
                    <StaggerItem key={s.id}>
                      <SectionCard section={s} />
                    </StaggerItem>
                  ))}
                </StaggerList>
              )}
            </section>

            <ScrollReveal>
              <RecentThreads threads={recentThreads} />
            </ScrollReveal>
          </div>

          {/* sidebar */}
          <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
            <ScrollReveal>
              <Shoutbox initialMessages={shoutbox} />
            </ScrollReveal>
            <ScrollReveal delay={0.05}>
              <OnlineList users={online} />
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
    accent === "plasma" ? "text-plasma" : accent === "flame" ? "text-flame" : "text-cyan";
  return (
    <div className="text-center">
      <div className={`flex items-baseline justify-center gap-1.5 font-mono text-2xl font-bold ${colorClass} md:text-3xl`}>
        <NumberTicker value={value} />
        {live && (
          <span className="dot-live ml-1 inline-block animate-pulse-slow self-center" />
        )}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-smoke">{label}</div>
    </div>
  );
}
