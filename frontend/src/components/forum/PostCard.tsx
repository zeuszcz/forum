"use client";

import { motion } from "framer-motion";
import { Heart, Quote } from "lucide-react";
import { useEffect, useState } from "react";

import { HeartExplosion } from "@/components/effects/HeartExplosion";
import { SpotlightCard } from "@/components/effects/SpotlightCard";
import { PostBody } from "@/components/forum/PostBody";
import { UserHoverCard } from "@/components/forum/UserHoverCard";
import { LetterAvatar } from "@/components/ui/avatar";
import { api, ApiError } from "@/lib/api";
import { sfx } from "@/lib/audio";
import { useAuth } from "@/lib/auth-context";
import { exactTime, relativeTime } from "@/lib/format";
import { computeRank } from "@/lib/rank";
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
  const [highlight, setHighlight] = useState(false);

  // Highlight when this post is the URL hash target
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === `#post-${post.id}`) {
      setHighlight(true);
      const t = setTimeout(() => setHighlight(false), 2200);
      return () => clearTimeout(t);
    }
  }, [post.id]);

  const topRole = post.author?.roles?.[0];
  const rank = post.author
    ? computeRank(post.author.total_posts, post.author.total_reactions_received)
    : null;

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
    <motion.div
      id={`post-${post.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1],
        delay: Math.min(index * 0.04, 0.4),
      }}
      className="scroll-mt-24"
    >
      <SpotlightCard
        as="article"
        className={cn(
          "grid grid-cols-1 overflow-hidden rounded-xl border bg-card transition-all duration-300 ease-premium md:grid-cols-[180px_1fr]",
          "border-border",
          highlight && "border-plasma shadow-glow-plasma",
        )}
      >
        {/* === Author sidebar (LEFT on desktop, top on mobile) === */}
        <aside className="relative flex flex-row items-center gap-3 border-b border-border bg-void/50 p-3.5 md:flex-col md:items-center md:gap-2 md:border-b-0 md:border-r md:p-4">
          {post.author ? (
            <UserHoverCard user={post.author}>
              <a
                href={`/u/${post.author.nickname}`}
                className="flex flex-row items-center gap-3 md:flex-col md:gap-2 md:text-center"
              >
                <LetterAvatar nickname={post.author.nickname} size={48} />
                <div className="flex flex-col gap-0.5 md:items-center">
                  <span
                    className="text-base font-semibold leading-none transition-opacity hover:opacity-80"
                    style={{ color: topRole?.color ?? "#e8e9f3" }}
                  >
                    {post.author.nickname}
                  </span>
                  {topRole && (
                    <span
                      className="inline-flex items-center self-start rounded-sm border px-1.5 py-px text-[9px] font-semibold uppercase tracking-widest md:self-center"
                      style={{
                        borderColor: `${topRole.color}40`,
                        color: topRole.color,
                        backgroundColor: `${topRole.color}1a`,
                      }}
                    >
                      {topRole.title}
                    </span>
                  )}
                  {rank && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] text-smoke">
                      <span className="font-mono font-bold" style={{ color: rank.color }}>
                        Lvl {rank.level}
                      </span>
                      <span>·</span>
                      <span>{rank.title}</span>
                    </span>
                  )}
                  {post.author.title && (
                    <span className="mt-1 hidden text-center text-xs italic text-ash md:line-clamp-2">
                      {post.author.title}
                    </span>
                  )}
                </div>
              </a>
            </UserHoverCard>
          ) : (
            <>
              <div className="h-16 w-16 rounded-full bg-slate" />
              <span className="text-sm text-smoke">удалён</span>
            </>
          )}

        </aside>

        {/* === Body (RIGHT) === */}
        <div className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between border-b border-border px-5 py-2.5 text-xs text-smoke">
            <span title={exactTime(post.created_at)}>
              {relativeTime(post.created_at)}
              {post.edited_at && (
                <span className="ml-2 italic">
                  · отредактировано {relativeTime(post.edited_at)}
                </span>
              )}
            </span>
            <a
              href={`#post-${post.id}`}
              className="font-mono text-smoke transition-colors hover:text-plasma"
              title="Прямая ссылка"
            >
              #{index + 1}
            </a>
          </header>

          <div className="min-w-0 px-5 py-5">
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
    </motion.div>
  );
}

