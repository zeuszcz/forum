"use client";

import { motion } from "framer-motion";
import {
  Bookmark,
  Check,
  Hash,
  Pencil,
  Quote,
  Reply,
  Share2,
  X,
} from "lucide-react";
import Link from "next/link";
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
import { avatarGlowColor, glowNickProps, isStaff, nickColor } from "@/lib/perks";
import { computeRank } from "@/lib/rank";
import type { Post, ReactionKind } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Visual badge mapping for granted_perks — shown as little icons under
 *  the avatar (achievements row in the screenshot). */
const PERK_BADGES: { slug: string; emoji: string; title: string }[] = [
  { slug: "glow_nick", emoji: "✨", title: "Свечение ника" },
  { slug: "animated_frame", emoji: "💫", title: "Свечение аватара" },
  { slug: "custom_title", emoji: "🏆", title: "Кастомный титул" },
  { slug: "profile_banner", emoji: "🎨", title: "Баннер профиля" },
  { slug: "server_vip", emoji: "🟦", title: "VIP на сервере" },
  { slug: "server_admin", emoji: "🛡", title: "Админ на сервере" },
];

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
  const topRole = roles[0];
  const rank = post.author
    ? computeRank(
        post.author.total_posts,
        post.author.total_reactions_received,
        post.author.bonus_xp ?? 0,
      )
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
          "grid grid-cols-1 overflow-hidden rounded-xl border bg-card transition-all duration-300 ease-premium md:grid-cols-[210px_1fr]",
          "border-border",
          highlight && "border-plasma shadow-glow-plasma",
        )}
      >
        {/* === Author sidebar (classic forum style) === */}
        <aside className="relative flex flex-col items-center gap-3 border-b border-border bg-void/50 p-4 md:border-b-0 md:border-r">
          {post.author ? (
            <>
              {/* Square avatar 128px with online dot + role color frame */}
              <UserHoverCard user={post.author}>
                <Link
                  href={`/u/${post.author.nickname}`}
                  className="relative block transition-transform hover:scale-[1.02]"
                >
                  <div
                    className="relative h-32 w-32 overflow-hidden rounded-lg border-2"
                    style={{
                      borderColor: topRole?.color
                        ? `${topRole.color}80`
                        : undefined,
                      boxShadow: avatarGlowColor(post.author)
                        ? `0 0 18px ${avatarGlowColor(post.author)}55`
                        : undefined,
                    }}
                  >
                    {post.author.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.author.avatar_url}
                        alt={post.author.nickname}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <LetterAvatar
                        nickname={post.author.nickname}
                        size={128}
                        className="!rounded-none"
                      />
                    )}
                  </div>
                  {/* Online indicator */}
                  {post.author.last_seen_at &&
                    Date.now() -
                      new Date(post.author.last_seen_at).getTime() <
                      10 * 60 * 1000 && (
                      <span
                        className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-card bg-success"
                        title="онлайн"
                      />
                    )}
                </Link>
              </UserHoverCard>

              {/* Nickname */}
              <Link
                href={`/u/${post.author.nickname}`}
                className={cn(
                  "max-w-full truncate text-base font-bold leading-none transition-opacity hover:opacity-80",
                  glow.className,
                )}
                style={{ color: authorColor, ...glow.style }}
              >
                {post.author.nickname}
              </Link>

              {/* Custom title (italic, single line) */}
              {post.author.title && (
                <p className="-mt-1 line-clamp-2 max-w-full text-center text-[11px] italic text-ash">
                  {post.author.title}
                </p>
              )}

              {/* Role pills — vertical stack, gradient pills with role color */}
              {roles.length > 0 && (
                <div className="flex w-full flex-col gap-1">
                  {roles.map((r) => (
                    <RolePill key={r.slug} role={r} />
                  ))}
                </div>
              )}

              {/* Level meter — circle + progress bar */}
              {rank && (
                <div className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-mono text-xs font-bold"
                    style={{
                      borderColor: rank.color,
                      color: rank.color,
                    }}
                  >
                    {rank.level}
                  </span>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <div className="h-1.5 overflow-hidden rounded-full bg-void/60">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${rank.percent}%`,
                          background: `linear-gradient(90deg, ${rank.color}, rgb(var(--flame-rgb)))`,
                        }}
                      />
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-smoke">
                      LVL {rank.level}
                    </span>
                  </div>
                </div>
              )}

              {/* Achievement badges row from granted_perks */}
              {post.author.granted_perks &&
                post.author.granted_perks.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {PERK_BADGES.filter((b) =>
                      post.author?.granted_perks?.includes(b.slug),
                    )
                      .slice(0, 6)
                      .map((b) => (
                        <span
                          key={b.slug}
                          title={b.title}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-void/40 text-sm"
                        >
                          {b.emoji}
                        </span>
                      ))}
                  </div>
                )}
            </>
          ) : (
            <>
              <div className="h-32 w-32 rounded-lg bg-slate" />
              <span className="text-sm text-smoke">удалён</span>
            </>
          )}
        </aside>

        {/* === Body column === */}
        <div className="flex min-w-0 flex-col">
          {/* Header: timestamp left, action icons + post-id right */}
          <header className="flex items-center justify-between gap-3 border-b border-border bg-void/20 px-5 py-2.5 text-xs">
            <span className="text-smoke" title={exactTime(post.created_at)}>
              {relativeTime(post.created_at)}
              {editedAt && (
                <span className="ml-2 italic">
                  · ред. {relativeTime(editedAt)}
                  {post.edited_by &&
                    post.edited_by.id !== post.author?.id && (
                      <span className="not-italic text-flame">
                        {" "}
                        ({post.edited_by.nickname}
                        {post.edited_by.roles?.some((r) => r.is_staff)
                          ? " · staff"
                          : ""}
                        )
                      </span>
                    )}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <HeaderIconBtn
                icon={Share2}
                title="Поделиться ссылкой"
                onClick={() => {
                  const url = `${window.location.origin}/t/${post.thread_id}#post-${post.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success("Ссылка скопирована");
                }}
              />
              <HeaderIconBtn icon={Bookmark} title="Закладка (скоро)" disabled />
              <a
                href={`#post-${post.id}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] text-smoke transition-colors hover:bg-slate hover:text-plasma"
                title="Прямая ссылка"
              >
                <Hash className="h-3 w-3" />
                {index + 1}
              </a>
            </div>
          </header>

          {/* Body */}
          <div className="min-w-0 flex-1 px-5 py-5">
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

          {/* Thanked-by strip */}
          {post.thanked_by && post.thanked_by.length > 0 && (
            <div className="border-t border-border bg-plasma/5 px-5 py-2 text-[11px] text-smoke">
              <span className="font-semibold text-plasma">
                Сказали спасибо ({post.thanked_by.length}):
              </span>{" "}
              {post.thanked_by.slice(0, 8).join(", ")}
              {post.thanked_by.length > 8 && (
                <span className="text-smoke">
                  {" "}
                  и ещё {post.thanked_by.length - 8}
                </span>
              )}
            </div>
          )}

          {/* Footer toolbar — mod actions left, user actions right */}
          <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border bg-void/30 px-4 py-2">
            <div className="flex items-center gap-1">
              {showEditButton && !editing && (
                <ToolbarBtn
                  icon={Pencil}
                  label="Изменить"
                  onClick={() => {
                    setEditBody(body);
                    setEditing(true);
                  }}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <ReactionsBar
                postId={post.id}
                initialCounts={post.reactions_by_kind ?? {}}
                initialReacted={(post.my_reaction_kinds ?? []) as ReactionKind[]}
              />
              {onQuote && !editing && (
                <>
                  <ToolbarBtn
                    icon={Quote}
                    label="Цитата"
                    onClick={() => onQuote(post)}
                    accent="plasma"
                  />
                  <ToolbarBtn
                    icon={Reply}
                    label="Ответить"
                    onClick={() => onQuote(post)}
                    accent="cyan"
                  />
                </>
              )}
            </div>
          </footer>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

/* ---------- helpers ---------- */

function RolePill({ role }: { role: { slug: string; title: string; color: string; affiliation_tag?: string | null } }) {
  return (
    <span
      className="inline-flex w-full items-center justify-center rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm"
      style={{
        background: `linear-gradient(135deg, ${role.color}, ${role.color}cc)`,
        boxShadow: `0 1px 0 ${role.color}40 inset, 0 2px 4px ${role.color}33`,
      }}
    >
      {role.affiliation_tag ? `${role.title} ► ${role.affiliation_tag}` : role.title}
    </span>
  );
}

function HeaderIconBtn({
  icon: Icon,
  title,
  onClick,
  disabled,
}: {
  icon: React.ElementType;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-smoke transition-colors",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:bg-slate hover:text-bone",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  accent?: "plasma" | "cyan";
}) {
  const accentCls = accent === "plasma"
    ? "hover:border-plasma/40 hover:bg-plasma/10 hover:text-plasma"
    : accent === "cyan"
      ? "hover:border-cyan/40 hover:bg-cyan/10 hover:text-cyan"
      : "hover:border-border hover:bg-slate hover:text-bone";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium text-ash transition-colors",
        accentCls,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
