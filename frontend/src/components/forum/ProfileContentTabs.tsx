"use client";

import { motion } from "framer-motion";
import { Heart, MessageCircle, MessageSquare } from "lucide-react";
import { useState } from "react";

import { UserPostsList, UserThreadsList } from "@/components/forum/UserContentLists";
import { plural } from "@/lib/format";
import type { Post, Thread } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  threads: Thread[];
  posts: Post[];
  totalPosts: number;
  totalReactions: number;
}

type TabId = "threads" | "posts" | "stats";

export function ProfileContentTabs({ threads, posts, totalPosts, totalReactions }: Props) {
  const [tab, setTab] = useState<TabId>("threads");

  const TABS: { id: TabId; label: string; icon: React.ElementType; count: number }[] = [
    { id: "threads", label: "Темы", icon: MessageSquare, count: threads.length },
    { id: "posts", label: "Сообщения", icon: MessageCircle, count: posts.length },
    { id: "stats", label: "Статистика", icon: Heart, count: totalReactions },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 pt-2">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex items-center gap-2 rounded-t-md px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "text-bone"
                  : "text-ash hover:text-bone",
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              <span
                className={cn(
                  "rounded px-1.5 py-px font-mono text-[10px]",
                  active
                    ? "bg-plasma/15 text-plasma"
                    : "bg-slate text-smoke",
                )}
              >
                {t.count}
              </span>
              {active && (
                <motion.span
                  layoutId="profile-tab-bg"
                  className="absolute inset-x-1 bottom-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgb(var(--plasma-rgb)), transparent)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        {tab === "threads" && (
          <div>
            {threads.length > 0 ? (
              <UserThreadsList threads={threads} />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-void/30 p-8 text-center text-sm text-smoke">
                Юзер ещё не создал ни одной темы
              </div>
            )}
          </div>
        )}
        {tab === "posts" && (
          <div>
            {posts.length > 0 ? (
              <UserPostsList posts={posts} />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-void/30 p-8 text-center text-sm text-smoke">
                Юзер ещё ничего не написал
              </div>
            )}
          </div>
        )}
        {tab === "stats" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatBlock label="Темы" value={threads.length} accent="cyan" />
            <StatBlock
              label="Сообщения"
              value={totalPosts}
              accent="plasma"
              note={plural(totalPosts, "пост", "поста", "постов")}
            />
            <StatBlock
              label="Реакции получено"
              value={totalReactions}
              accent="flame"
              note={plural(totalReactions, "реакция", "реакции", "реакций")}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function StatBlock({
  label,
  value,
  accent,
  note,
}: {
  label: string;
  value: number;
  accent: "plasma" | "flame" | "cyan";
  note?: string;
}) {
  const color =
    accent === "plasma"
      ? "text-plasma"
      : accent === "flame"
        ? "text-flame"
        : "text-cyan";
  return (
    <div className="rounded-lg border border-border bg-void/40 p-4">
      <div className="text-[10px] uppercase tracking-widest text-smoke">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-bold ${color}`}>{value}</div>
      {note && <div className="text-[10px] text-smoke">{note}</div>}
    </div>
  );
}
