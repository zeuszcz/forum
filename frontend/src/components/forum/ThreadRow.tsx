import Link from "next/link";
import { Eye, Lock, MessageCircle, Pin } from "lucide-react";

import { UserPill } from "@/components/forum/UserBadge";
import { LetterAvatar } from "@/components/ui/avatar";
import { plural, relativeTime } from "@/lib/format";
import type { Thread } from "@/lib/types";

export function ThreadRow({ thread }: { thread: Thread }) {
  return (
    <Link
      href={`/t/${thread.id}`}
      className="group flex items-start gap-4 border-b border-border px-5 py-4 transition-colors duration-150 ease-premium last:border-b-0 hover:bg-void"
    >
      {thread.author ? (
        <LetterAvatar nickname={thread.author.nickname} size={40} avatarUrl={thread.author.avatar_url ?? null} />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-full bg-slate" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {thread.is_pinned && <Pin className="h-3.5 w-3.5 text-plasma" aria-label="pinned" />}
          {thread.is_locked && <Lock className="h-3.5 w-3.5 text-smoke" aria-label="locked" />}
          <h3 className="truncate text-sm font-semibold text-bone transition-colors group-hover:text-plasma-bright md:text-base">
            {thread.title}
          </h3>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-smoke">
          <span>
            <UserPill user={thread.author} />
          </span>
          <span>·</span>
          <span>{relativeTime(thread.created_at)}</span>
        </div>
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-1 text-xs text-smoke sm:flex">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            <span className="font-mono text-bone">{thread.reply_count}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            <span className="font-mono text-bone">{thread.view_count}</span>
          </span>
        </div>
        {thread.last_post_at && thread.last_post_author && (
          <div className="text-right">
            <span className="text-smoke">{relativeTime(thread.last_post_at)}</span>
            <span className="px-1 text-smoke/60">·</span>
            <UserPill user={thread.last_post_author} />
          </div>
        )}
      </div>
    </Link>
  );
}

export function ThreadRowCompact({ thread }: { thread: Thread }) {
  return (
    <Link
      href={`/t/${thread.id}`}
      className="group flex items-center gap-3 border-b border-border/60 px-3 py-2.5 transition-colors hover:bg-void last:border-b-0"
    >
      {thread.author && <LetterAvatar nickname={thread.author.nickname} size={20} avatarUrl={thread.author.avatar_url ?? null} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-bone transition-colors group-hover:text-plasma-bright">
          {thread.title}
        </div>
        <div className="text-xs text-smoke">
          {thread.reply_count} {plural(thread.reply_count, "ответ", "ответа", "ответов")} ·{" "}
          {relativeTime(thread.last_post_at ?? thread.created_at)}
        </div>
      </div>
    </Link>
  );
}
