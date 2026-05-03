"use client";

import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { motion } from "framer-motion";
import Link from "next/link";

import { LetterAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { exactTime, relativeTime } from "@/lib/format";
import { computeRank } from "@/lib/rank";
import type { UserPublic } from "@/lib/types";

interface UserHoverCardProps {
  user: UserPublic;
  children: React.ReactNode;
}

export function UserHoverCard({ user, children }: UserHoverCardProps) {
  const topRole = user.roles?.[0];
  const isOnline =
    user.last_seen_at &&
    Date.now() - new Date(user.last_seen_at).getTime() < 10 * 60 * 1000;

  return (
    <HoverCardPrimitive.Root openDelay={250} closeDelay={120}>
      <HoverCardPrimitive.Trigger asChild>{children}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          sideOffset={8}
          align="start"
          collisionPadding={12}
          className="z-50"
          asChild
        >
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-72 overflow-hidden rounded-lg glass-strong"
          >
            <div className="hero-mesh relative px-4 pb-3 pt-4">
              <div className="flex items-start gap-3">
                <LetterAvatar nickname={user.nickname} size={48} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/u/${user.nickname}`}
                    className="block truncate text-base font-semibold transition-opacity hover:opacity-80"
                    style={{ color: topRole?.color ?? "#e8e9f3" }}
                  >
                    {user.nickname}
                  </Link>
                  {user.title && (
                    <p className="truncate text-xs italic text-ash">{user.title}</p>
                  )}
                  {isOnline && (
                    <span className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-cyan">
                      <span className="dot-live animate-pulse-slow" /> онлайн
                    </span>
                  )}
                </div>
              </div>
              {user.roles?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {user.roles.slice(0, 4).map((r) => (
                    <Badge key={r.slug} color={r.color}>
                      {r.title}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {(() => {
              const rank = computeRank(
                user.total_posts,
                user.total_reactions_received,
              );
              return (
                <div className="border-t border-white/5 bg-void/60 px-4 py-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="inline-flex items-center gap-1.5">
                      <span
                        className="font-mono text-sm font-bold"
                        style={{ color: rank.color }}
                      >
                        Lvl {rank.level}
                      </span>
                      <span className="text-smoke">{rank.title}</span>
                    </div>
                    <span className="font-mono text-smoke">
                      {rank.xpInto}/{rank.xpForNext - rank.xpForLevel}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${rank.percent}%`,
                        background: `linear-gradient(90deg, ${rank.color}, rgb(var(--flame-rgb)))`,
                      }}
                    />
                  </div>
                </div>
              );
            })()}
            <div className="grid grid-cols-3 gap-2 border-t border-white/5 bg-void/60 px-4 py-3 text-[11px] text-smoke">
              <div>
                <div className="uppercase tracking-wider text-smoke/70">постов</div>
                <div className="mt-0.5 font-mono text-ash">{user.total_posts}</div>
              </div>
              <div>
                <div className="uppercase tracking-wider text-smoke/70">реакций</div>
                <div className="mt-0.5 font-mono text-ash">
                  {user.total_reactions_received}
                </div>
              </div>
              <div>
                <div className="uppercase tracking-wider text-smoke/70">в сети</div>
                <div
                  className="mt-0.5 font-mono text-ash"
                  title={user.last_seen_at ? exactTime(user.last_seen_at) : ""}
                >
                  {user.last_seen_at ? relativeTime(user.last_seen_at) : "—"}
                </div>
              </div>
            </div>
            {user.bio && (
              <div className="border-t border-white/5 px-4 py-3 text-xs leading-relaxed text-ash line-clamp-3">
                {user.bio}
              </div>
            )}
            <HoverCardPrimitive.Arrow className="fill-[hsl(var(--popover))]" />
          </motion.div>
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}
