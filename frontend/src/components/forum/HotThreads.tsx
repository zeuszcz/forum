import Link from "next/link";
import { Eye, Flame, MessageCircle } from "lucide-react";

import { StaggerItem, StaggerList } from "@/components/effects/ScrollReveal";
import { UserPill } from "@/components/forum/UserBadge";
import { plural, relativeTime } from "@/lib/format";
import type { Thread } from "@/lib/types";

export function HotThreads({ threads }: { threads: Thread[] }) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-flame/30 bg-card">
      {/* pulsing flame border accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 60% 30% at 50% 0%, rgb(var(--flame-rgb) / 0.18), transparent 70%)",
        }}
      />
      <header className="relative flex items-center justify-between border-b border-border px-4 py-3">
        <div className="inline-flex items-center gap-2">
          <Flame className="h-4 w-4 text-flame animate-pulse-slow" />
          <h2 className="text-sm font-semibold tracking-tight text-bone">Горячие темы</h2>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-smoke">24ч</span>
      </header>
      {threads.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-smoke">Сейчас тихо</p>
      ) : (
        <StaggerList stagger={0.04}>
          {threads.map((t) => (
            <StaggerItem key={t.id} y={6}>
              <Link
                href={`/t/${t.id}`}
                className="group flex items-start gap-3 border-b border-border/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-void/60"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-flame/10 text-flame">
                  <Flame className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-bone transition-colors group-hover:text-flame-bright">
                    {t.title}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-smoke">
                    <UserPill user={t.author} noHover />
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {t.reply_count} {plural(t.reply_count, "ответ", "ответа", "ответов")}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {t.view_count}
                    </span>
                    <span>·</span>
                    <span>{relativeTime(t.last_post_at ?? t.created_at)}</span>
                  </div>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </section>
  );
}
