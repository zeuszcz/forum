import { Cake, Eye, Flame, MessageCircle, Users } from "lucide-react";
import Link from "next/link";

import { UserPill } from "@/components/forum/UserBadge";
import type { ScandalThread, UserPublic } from "@/lib/types";
import { plural, relativeTime } from "@/lib/format";

export function BirthdaysWidget({ users }: { users: UserPublic[] }) {
  if (users.length === 0) return null;
  return (
    <section className="rounded-lg border border-flame/30 bg-gradient-to-br from-flame/10 to-card p-4">
      <header className="flex items-center gap-2">
        <Cake className="h-4 w-4 text-flame" />
        <h3 className="text-sm font-semibold tracking-tight text-bone">
          Сегодня день рождения
        </h3>
      </header>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {users.map((u) => (
          <UserPill key={u.id} user={u} noHover />
        ))}
      </div>
      <p className="mt-2 text-[10px] text-smoke">
        🎂 поздравь — это +1 хорошая карма
      </p>
    </section>
  );
}

export function RecentVisitorsWidget({
  users,
  hours = 24,
}: {
  users: UserPublic[];
  hours?: number;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-bone">
          <Users className="h-4 w-4 text-cyan" />
          За {hours}ч
        </h3>
        <span className="font-mono text-xs text-cyan">{users.length}</span>
      </header>
      {users.length === 0 ? (
        <p className="mt-3 text-center text-xs text-smoke">Никто не заходил</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {users.slice(0, 30).map((u) => (
            <UserPill key={u.id} user={u} noHover />
          ))}
          {users.length > 30 && (
            <span className="text-[10px] text-smoke">
              +{users.length - 30} ещё
            </span>
          )}
        </div>
      )}
    </section>
  );
}

export function ScandalOfWeekWidget({ thread }: { thread: ScandalThread | null }) {
  if (!thread) return null;
  return (
    <section className="relative overflow-hidden rounded-lg border-2 border-flame/40 bg-card">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 0% 0%, rgb(var(--flame-rgb) / 0.25), transparent 70%)",
        }}
      />
      <header className="relative flex items-center gap-2 border-b border-flame/20 px-4 py-3">
        <Flame className="h-4 w-4 text-flame animate-pulse-slow" />
        <h3 className="text-sm font-semibold tracking-tight text-bone">
          Скандал недели
        </h3>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-flame">
          🍿
        </span>
      </header>
      <Link
        href={`/t/${thread.id}`}
        className="relative block px-4 py-3 transition-colors hover:bg-void/40"
      >
        <h4 className="text-sm font-semibold leading-snug text-bone hover:text-flame-bright">
          {thread.title}
        </h4>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-smoke">
          {thread.author_nickname && (
            <span>от {thread.author_nickname}</span>
          )}
          {thread.section_title && (
            <Link
              href={`/f/${thread.section_slug}`}
              className="inline-flex items-center text-cyan hover:underline"
            >
              {thread.section_title}
            </Link>
          )}
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />
            {thread.reply_count}{" "}
            {plural(thread.reply_count, "ответ", "ответа", "ответов")}
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {thread.view_count}
          </span>
          {thread.last_post_at && (
            <span>· обновлено {relativeTime(thread.last_post_at)}</span>
          )}
        </div>
      </Link>
    </section>
  );
}
