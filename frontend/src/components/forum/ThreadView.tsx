"use client";

import { MessageCircle } from "lucide-react";
import { useRef } from "react";

import { ThreadHotkeys } from "@/components/effects/ThreadHotkeys";
import { OpPostCard } from "@/components/forum/OpPostCard";
import { PostCard } from "@/components/forum/PostCard";
import { ReplyForm, type ReplyFormHandle } from "@/components/forum/ReplyForm";
import { plural } from "@/lib/format";
import type { Post, Thread } from "@/lib/types";

interface ThreadViewProps {
  thread: Thread;
  posts: Post[];
}

export function ThreadView({ thread, posts }: ThreadViewProps) {
  const replyRef = useRef<ReplyFormHandle | null>(null);

  function handleQuote(post: Post) {
    replyRef.current?.insertQuote(post);
  }

  // Find the OP (first post) — typically posts[0] but be explicit
  const opPost = posts.find((p) => p.is_first) ?? posts[0];
  const replies = posts.filter((p) => p !== opPost);

  return (
    <div className="space-y-6">
      <ThreadHotkeys threadId={thread.id} />
      {opPost && <OpPostCard post={opPost} thread={thread} onQuote={handleQuote} />}

      {/* Divider — only show if there are replies */}
      {replies.length > 0 && (
        <div className="flex items-center gap-3 px-1 pt-2">
          <div className="flex h-7 items-center gap-2 rounded-full border border-border bg-card/60 px-3 text-[11px] font-semibold uppercase tracking-widest text-ash backdrop-blur-sm">
            <MessageCircle className="h-3 w-3 text-cyan" />
            <span>
              {replies.length}{" "}
              {plural(replies.length, "ответ", "ответа", "ответов")}
            </span>
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-border via-border/30 to-transparent" />
        </div>
      )}

      <div className="space-y-3">
        {replies.map((post, idx) => (
          <PostCard key={post.id} post={post} index={idx + 1} onQuote={handleQuote} />
        ))}
      </div>

      {/* Empty-thread hint */}
      {replies.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-void/30 p-8 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-smoke" />
          <p className="mt-3 text-sm text-ash">Пока никто не ответил</p>
          <p className="mt-1 text-xs text-smoke">Будь первым — напиши ниже</p>
        </div>
      )}

      <div className="pt-2">
        <ReplyForm ref={replyRef} threadId={thread.id} threadLocked={thread.is_locked} />
      </div>
    </div>
  );
}
