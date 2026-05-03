"use client";

import { motion } from "framer-motion";
import { Check, Pencil, Quote, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ReactionsBar } from "@/components/forum/ReactionsBar";
import { SpotlightCard } from "@/components/effects/SpotlightCard";
import { PostBody } from "@/components/forum/PostBody";
import { UserHoverCard } from "@/components/forum/UserHoverCard";
import { LetterAvatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { exactTime, relativeTime } from "@/lib/format";
import { glowNickProps, isStaff, nickColor } from "@/lib/perks";
import { computeRank } from "@/lib/rank";
import type { Post, ReactionKind } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PostCardProps {
  post: Post;
  index: number;
  onQuote?: (post: Post) => void;
}

export function PostCard({ post, index, onQuote }: PostCardProps) {
  const { user } = useAuth();
  const [highlight, setHighlight] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [editPending, setEditPending] = useState(false);
  const [body, setBody] = useState(post.body);
  const [editedAt, setEditedAt] = useState(post.edited_at);

  // Sync from props if parent re-fetches
  useEffect(() => {
    setBody(post.body);
    setEditedAt(post.edited_at);
  }, [post.body, post.edited_at]);

  // Highlight when this post is the URL hash target
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === `#post-${post.id}`) {
      setHighlight(true);
      const t = setTimeout(() => setHighlight(false), 2200);
      return () => clearTimeout(t);
    }
  }, [post.id]);

  const roles = post.author?.roles ?? [];
  const rank = post.author
    ? computeRank(post.author.total_posts, post.author.total_reactions_received)
    : null;
  const glow = glowNickProps(post.author);
  const authorColor = nickColor(post.author);

  const canEdit =
    !!user && post.author?.id === user.id;
  const canStaffEdit = !!user && isStaff(user);
  const showEditButton = canEdit || canStaffEdit;

  async function saveEdit() {
    const text = editBody.trim();
    if (text.length < 1 || editPending) return;
    setEditPending(true);
    try {
      const r = await api<Post>(`/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body: text }),
      });
      setBody(r.body);
      setEditedAt(r.edited_at);
      setEditing(false);
      toast.success("Пост обновлён");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Не удалось сохранить");
    } finally {
      setEditPending(false);
    }
  }

  function cancelEdit() {
    setEditBody(body);
    setEditing(false);
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
        {/* === Author sidebar === */}
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
                    className={cn(
                      "text-base font-semibold leading-none transition-opacity hover:opacity-80",
                      glow.className,
                    )}
                    style={{ color: authorColor, ...glow.style }}
                  >
                    {post.author.nickname}
                  </span>
                  {roles.length > 0 && (
                    <div className="flex flex-wrap gap-1 md:justify-center">
                      {roles.map((r) => (
                        <span
                          key={r.slug}
                          className="inline-flex items-center self-start rounded-sm border px-1.5 py-px text-[9px] font-semibold uppercase tracking-widest"
                          style={{
                            borderColor: `${r.color}40`,
                            color: r.color,
                            backgroundColor: `${r.color}1a`,
                          }}
                        >
                          {r.title}
                        </span>
                      ))}
                    </div>
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

        {/* === Body === */}
        <div className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between border-b border-border px-5 py-2.5 text-xs text-smoke">
            <span title={exactTime(post.created_at)}>
              {relativeTime(post.created_at)}
              {editedAt && (
                <span className="ml-2 italic">
                  · отредактировано {relativeTime(editedAt)}
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {showEditButton && !editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditBody(body);
                    setEditing(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[11px] text-smoke transition-colors hover:border-border hover:bg-slate hover:text-bone"
                  title={canStaffEdit && !canEdit ? "Редактировать (staff)" : "Редактировать"}
                >
                  <Pencil className="h-3 w-3" />
                  ред.
                </button>
              )}
              <a
                href={`#post-${post.id}`}
                className="font-mono text-smoke transition-colors hover:text-plasma"
                title="Прямая ссылка"
              >
                #{index + 1}
              </a>
            </div>
          </header>

          <div className="min-w-0 px-5 py-5">
            {editing ? (
              <div className="space-y-2">
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={6}
                  maxLength={20000}
                  disabled={editPending}
                  autoFocus
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={editPending}
                    className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-ash transition-colors hover:bg-slate hover:text-bone"
                  >
                    <X className="h-3.5 w-3.5" />
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={editPending || editBody.trim().length < 1}
                    className="inline-flex items-center gap-1 rounded-md border border-plasma/40 bg-plasma/10 px-3 py-1.5 text-xs text-plasma transition-colors hover:bg-plasma/20 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {editPending ? "Сохраняем…" : "Сохранить"}
                  </button>
                </div>
              </div>
            ) : (
              <PostBody body={body} />
            )}
          </div>

          <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border bg-void/30 px-3 py-2">
            <ReactionsBar
              postId={post.id}
              initialCounts={post.reactions_by_kind ?? {}}
              initialReacted={(post.my_reaction_kinds ?? []) as ReactionKind[]}
            />
            {onQuote && !editing && (
              <button
                type="button"
                onClick={() => onQuote(post)}
                className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium text-ash transition-colors hover:border-border hover:bg-slate hover:text-bone"
              >
                <Quote className="h-3.5 w-3.5" />
                Цитата
              </button>
            )}
          </footer>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}
