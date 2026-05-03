"use client";

import { Eye, Heart, MessageCircle, Pin } from "lucide-react";
import Link from "next/link";

import { plural, relativeTime } from "@/lib/format";
import type { Post, Thread } from "@/lib/types";

export function UserThreadsList({ threads }: { threads: Thread[] }) {
  if (threads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-void/30 p-8 text-center text-sm text-smoke">
        Тем пока нет
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {threads.map((t) => (
        <li key={t.id}>
          <Link
            href={`/t/${t.id}`}
            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-void/40"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {t.is_pinned && <Pin className="h-3 w-3 text-plasma" />}
                <span className="truncate text-sm font-medium text-bone hover:text-plasma">
                  {t.title}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-smoke">
                <span>{relativeTime(t.created_at)}</span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  {t.reply_count} {plural(t.reply_count, "ответ", "ответа", "ответов")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {t.view_count}
                </span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function UserPostsList({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-void/30 p-8 text-center text-sm text-smoke">
        Сообщений пока нет
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {posts.map((p) => (
        <li key={p.id}>
          <Link
            href={`/t/${p.thread_id}#post-${p.id}`}
            className="block rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-plasma/40"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-semibold text-plasma hover:text-plasma-bright">
                {p.thread_title ?? `Тема #${p.thread_id}`}
              </span>
              <span className="text-smoke">{relativeTime(p.created_at)}</span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ash">
              {p.body.length > 280 ? p.body.slice(0, 280) + "…" : p.body}
            </p>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-smoke">
              {p.is_first && (
                <span className="rounded border border-plasma/40 bg-plasma/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-plasma">
                  OP
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {p.reaction_count}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
