"use client";

import { Heart, Quote } from "lucide-react";
import { useState } from "react";

import { HeartExplosion } from "@/components/effects/HeartExplosion";
import { SpotlightCard } from "@/components/effects/SpotlightCard";
import { PostBody } from "@/components/forum/PostBody";
import { UserHoverCard } from "@/components/forum/UserHoverCard";
import { LetterAvatar } from "@/components/ui/avatar";
import { api, ApiError } from "@/lib/api";
import { sfx } from "@/lib/audio";
import { useAuth } from "@/lib/auth-context";
import { exactTime, relativeTime } from "@/lib/format";
import type { Post } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PostCardProps {
  post: Post;
  index: number;
  onQuote?: (post: Post) => void;
}

export function PostCard({ post, index, onQuote }: PostCardProps) {
  const { user } = useAuth();
  const [count, setCount] = useState(post.reaction_count);
  const [reacted, setReacted] = useState(post.has_reacted);
  const [pending, setPending] = useState(false);
  const [burstKey, setBurstKey] = useState(0);

  const topRole = post.author?.roles?.[0];

  async function handleReact() {
    if (!user || pending) return;
    setPending(true);
    const prevReacted = reacted;
    const prevCount = count;
    const isLiking = !prevReacted;
    setReacted(isLiking);
    setCount(prevCount + (isLiking ? 1 : -1));
    if (isLiking) {
      setBurstKey(Date.now());
      sfx.like();
    }
    try {
      const r = await api<{ count: number; reacted: boolean }>(`/posts/${post.id}/react`, {
        method: "POST",
      });
      setCount(r.count);
      setReacted(r.reacted);
    } catch (err) {
      setReacted(prevReacted);
      setCount(prevCount);
      if (err instanceof ApiError) console.error(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <SpotlightCard
      as="article"
      className={cn(
        "grid grid-cols-1 overflow-hidden rounded-lg border border-border bg-card md:grid-cols-[200px_1fr]",
        post.is_first && "border-plasma/30",
      )}
    >
      <div id={`post-${post.id}`} />
      {/* Author sidebar */}
      <aside className="flex flex-col items-center gap-2 border-b border-border bg-void/40 p-4 md:border-b-0 md:border-r">
        {post.author ? (
          <UserHoverCard user={post.author}>
            <a
              href={`/u/${post.author.nickname}`}
              className="flex flex-col items-center gap-2"
            >
              <LetterAvatar nickname={post.author.nickname} size={64} />
              <span
                className="text-base font-semibold transition-opacity hover:opacity-80"
                style={{ color: topRole?.color ?? "#e8e9f3" }}
              >
                {post.author.nickname}
              </span>
              {topRole && (
                <span className="text-[10px] uppercase tracking-wider text-smoke">
                  {topRole.title}
                </span>
              )}
              {post.author.title && (
                <span className="text-center text-xs italic text-ash">{post.author.title}</span>
              )}
            </a>
          </UserHoverCard>
        ) : (
          <>
            <div className="h-16 w-16 rounded-full bg-slate" />
            <span className="text-sm text-smoke">удалён</span>
          </>
        )}
      </aside>

      {/* Body */}
      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-2.5 text-xs text-smoke">
          <span title={exactTime(post.created_at)}>
            {relativeTime(post.created_at)}
            {post.edited_at && (
              <span className="ml-2 italic">· отредактировано {relativeTime(post.edited_at)}</span>
            )}
          </span>
          <a
            href={`#post-${post.id}`}
            className="font-mono transition-colors hover:text-ash"
          >
            #{index + 1}
          </a>
        </header>

        <div className="px-5 py-5">
          <PostBody body={post.body} />
        </div>

        <footer className="mt-auto flex items-center justify-end gap-2 border-t border-border bg-void/30 px-3 py-2">
          {onQuote && (
            <button
              type="button"
              onClick={() => onQuote(post)}
              className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium text-ash transition-colors hover:border-border hover:bg-slate hover:text-bone"
            >
              <Quote className="h-3.5 w-3.5" />
              Цитата
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={handleReact}
              disabled={!user || pending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ease-premium disabled:cursor-not-allowed disabled:opacity-50",
                reacted
                  ? "border-flame/40 bg-flame/10 text-flame shadow-glow-flame"
                  : "text-ash hover:border-border hover:bg-slate hover:text-bone",
              )}
              aria-pressed={reacted}
            >
              <Heart
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  reacted && "fill-flame scale-110",
                )}
              />
              <span className="font-mono">{count}</span>
            </button>
            <HeartExplosion triggerKey={burstKey} />
          </div>
        </footer>
      </div>
    </SpotlightCard>
  );
}
