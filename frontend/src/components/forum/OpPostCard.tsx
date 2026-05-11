"use client";

import { motion } from "framer-motion";
import { Eye, MessageCircle, Quote, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { MeshBackground } from "@/components/effects/MeshBackground";
import { PostBody } from "@/components/forum/PostBody";
import { ReactionsBar } from "@/components/forum/ReactionsBar";
import { UserHoverCard } from "@/components/forum/UserHoverCard";
import { LetterAvatar } from "@/components/ui/avatar";
import { exactTime, plural, relativeTime } from "@/lib/format";
import { avatarGlowColor, glowNickProps, nickColor } from "@/lib/perks";
import { computeRank } from "@/lib/rank";
import type { Post, ReactionKind, Thread } from "@/lib/types";
import { cn } from "@/lib/utils";

interface OpPostCardProps {
  post: Post;
  thread: Thread;
  onQuote?: (post: Post) => void;
}

/**
 * Hero / "thread opener" card for the first post in a thread.
 * Visually distinct from replies: full-width body, mesh background,
 * plasma border, author shown in a horizontal header strip.
 */
export function OpPostCard({ post, thread, onQuote }: OpPostCardProps) {
  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === `#post-${post.id}`) {
      setHighlight(true);
      const t = setTimeout(() => setHighlight(false), 2200);
      return () => clearTimeout(t);
    }
  }, [post.id]);

  const author = post.author;
  const roles = author?.roles ?? [];
  const rank = author
    ? computeRank(author.total_posts, author.total_reactions_received, author.bonus_xp ?? 0)
    : null;
  const glow = glowNickProps(author);
  const authorColor = nickColor(author);
  const glowColor = avatarGlowColor(author);

  return (
    <motion.div
      id={`post-${post.id}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="scroll-mt-24"
    >
      <article
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 transition-all duration-300 ease-premium",
          highlight ? "border-plasma shadow-glow-plasma" : "border-plasma/30",
        )}
      >
        {/* Mesh background bound inside */}
        <div className="absolute inset-0 -z-10">
          <MeshBackground />
        </div>
        {/* dotted-grid overlay for premium feel */}
        <div className="dotted-grid pointer-events-none absolute inset-0 -z-[5] opacity-30" />
        {/* card surface tint above mesh */}
        <div className="absolute inset-0 -z-[4] bg-card/55 backdrop-blur-[2px]" />

        {/* OP ribbon corner */}
        <div className="absolute right-0 top-0 z-10 flex items-center gap-1.5 rounded-bl-lg border-b border-l border-plasma/40 bg-plasma/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-plasma backdrop-blur-sm">
          <Sparkles className="h-3 w-3" />
          OP
        </div>

        {/* === Author header strip === */}
        <header className="relative flex flex-wrap items-center gap-4 border-b border-plasma/15 px-5 py-4 sm:px-7 sm:py-5">
          {author ? (
            <UserHoverCard user={author}>
              <Link
                href={`/u/${author.nickname}`}
                className="flex items-center gap-4"
              >
                <div className="relative">
                  <LetterAvatar
                    nickname={author.nickname}
                    size={56}
                    glowColor={glowColor}
                    avatarUrl={author.avatar_url ?? null}
                  />
                  {/* OP-specific plasma→flame ring (only when user has no
                      personal glow override). */}
                  {!glowColor && (
                    <div
                      aria-hidden="true"
                      className="absolute -inset-1 -z-10 rounded-full opacity-50 blur-md"
                      style={{
                        background:
                          "conic-gradient(from 0deg, rgb(var(--plasma-rgb)), rgb(var(--flame-rgb)), rgb(var(--plasma-rgb)))",
                      }}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "text-lg font-bold leading-none transition-opacity hover:opacity-80",
                        glow.className,
                      )}
                      style={{
                        color: authorColor,
                        ...glow.style,
                      }}
                    >
                      {author.nickname}
                    </span>
                    {roles.map((r) => (
                      <span
                        key={r.slug}
                        className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
                        style={{
                          borderColor: `${r.color}55`,
                          color: r.color,
                          backgroundColor: `${r.color}1f`,
                        }}
                      >
                        {r.title}
                      </span>
                    ))}
                    {rank && (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span
                          className="font-mono font-bold"
                          style={{ color: rank.color }}
                        >
                          Lvl {rank.level}
                        </span>
                        <span className="text-smoke">·</span>
                        <span className="text-smoke">{rank.title}</span>
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-smoke">
                    <Sparkles className="h-3 w-3 text-plasma" />
                    <span className="font-semibold uppercase tracking-widest text-plasma">
                      Автор темы
                    </span>
                    <span>·</span>
                    <span title={exactTime(post.created_at)}>
                      {relativeTime(post.created_at)}
                    </span>
                    {post.edited_at && (
                      <>
                        <span>·</span>
                        <span className="italic">
                          ред. {relativeTime(post.edited_at)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            </UserHoverCard>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-slate" />
              <span className="text-sm text-smoke">удалён</span>
            </div>
          )}

          {/* Right-aligned compact stats */}
          {author && (
            <div className="ml-auto flex shrink-0 items-center divide-x divide-plasma/15 rounded-md border border-plasma/20 bg-void/40 text-center">
              <HeaderStat value={author.total_posts} label="постов" />
              <HeaderStat value={author.total_reactions_received} label="реакций" />
            </div>
          )}
        </header>

        {/* === Body — full width, larger typography === */}
        <div className="relative min-w-0 px-5 py-7 sm:px-8 sm:py-8 md:px-12 md:py-10">
          <div className="text-[15px] leading-relaxed">
            <PostBody body={post.body} />
          </div>
        </div>

        {/* === Footer with thread-level stats + reactions === */}
        <footer className="relative flex flex-wrap items-center justify-between gap-3 border-t border-plasma/15 bg-void/30 px-4 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-4 text-xs text-smoke">
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="font-mono text-bone">{thread.reply_count}</span>{" "}
              {plural(thread.reply_count, "ответ", "ответа", "ответов")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              <span className="font-mono text-bone">{thread.view_count}</span>{" "}
              {plural(thread.view_count, "просмотр", "просмотра", "просмотров")}
            </span>
            <a
              href={`#post-${post.id}`}
              className="font-mono transition-colors hover:text-plasma"
              title="Прямая ссылка"
            >
              #{1}
            </a>
          </div>

          <div className="flex items-center gap-2">
            <ReactionsBar
              postId={post.id}
              initialCounts={post.reactions_by_kind ?? {}}
              initialReacted={(post.my_reaction_kinds ?? []) as ReactionKind[]}
            />
            {onQuote && (
              <button
                type="button"
                onClick={() => onQuote(post)}
                className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium text-ash transition-colors hover:border-plasma/30 hover:bg-plasma/5 hover:text-bone"
              >
                <Quote className="h-3.5 w-3.5" />
                Цитата
              </button>
            )}
          </div>
        </footer>
      </article>
    </motion.div>
  );
}

function HeaderStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-3 py-2">
      <div className="font-mono text-sm font-bold text-bone">{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-smoke">{label}</div>
    </div>
  );
}
