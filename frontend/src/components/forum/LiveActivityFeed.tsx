"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Heart,
  MessageCircle,
  PartyPopper,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { LetterAvatar } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { avatarGlowColor, glowNickProps, nickColor } from "@/lib/perks";
import type { FeedEvent, FeedEventKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_MS = 20_000;

const KIND_META: Record<
  FeedEventKind,
  { icon: React.ElementType; color: string; verb: string; bg: string }
> = {
  thread_created: {
    icon: Sparkles,
    color: "text-plasma",
    bg: "bg-plasma/10",
    verb: "создал тему",
  },
  post_created: {
    icon: MessageCircle,
    color: "text-cyan",
    bg: "bg-cyan/10",
    verb: "ответил в",
  },
  reaction: {
    icon: Heart,
    color: "text-flame",
    bg: "bg-flame/10",
    verb: "лайкнул пост в",
  },
  user_registered: {
    icon: PartyPopper,
    color: "text-success",
    bg: "bg-success/10",
    verb: "присоединился",
  },
};

interface Props {
  initialEvents: FeedEvent[];
  /** how many events to show at once (rest scroll out the bottom) */
  visible?: number;
}

export function LiveActivityFeed({ initialEvents, visible = 12 }: Props) {
  const [events, setEvents] = useState<FeedEvent[]>(initialEvents);
  const [livePulse, setLivePulse] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const next = await api<FeedEvent[]>(`/stats/feed?limit=${visible * 2}`);
      // Detect new events and pulse the indicator
      if (next.length > 0 && events.length > 0 && next[0].ts !== events[0].ts) {
        setLivePulse((p) => p + 1);
      }
      setEvents(next);
    } catch {
      /* swallow polling errors */
    }
  }, [events, visible]);

  useEffect(() => {
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const shown = events.slice(0, visible);

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-bone">
          <Activity className="h-4 w-4 text-plasma" />
          Что происходит
        </h2>
        <div className="flex items-center gap-1.5">
          <motion.span
            key={livePulse}
            initial={{ scale: 1.6, opacity: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="dot-live animate-pulse-slow"
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
            live
          </span>
        </div>
      </header>

      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-smoke">Тишина</p>
      ) : (
        <ul className="divide-y divide-border/60">
          <AnimatePresence initial={false}>
            {shown.map((e) => (
              <FeedRow key={`${e.kind}-${e.ts}-${e.actor?.id ?? "anon"}`} event={e} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function FeedRow({ event }: { event: FeedEvent }) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const actor = event.actor;
  const glow = glowNickProps(actor);
  const actorColor = nickColor(actor);

  // Build the URL the row links to
  const href =
    event.kind === "user_registered" && actor
      ? `/u/${actor.nickname}`
      : event.thread_id
        ? `/t/${event.thread_id}${event.post_id ? `#post-${event.post_id}` : ""}`
        : "#";

  return (
    <motion.li
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      layout
    >
      <Link
        href={href}
        className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-void/40"
      >
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            meta.bg,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", meta.color)} />
        </div>
        <div className="min-w-0 flex-1 text-xs">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            {actor ? (
              <span
                className={cn("inline-flex items-center gap-1.5", glow.className)}
                style={glow.style}
              >
                <LetterAvatar
                  nickname={actor.nickname}
                  size={14}
                  glowColor={avatarGlowColor(actor)}
                />
                <span
                  className="font-semibold"
                  style={{ color: actorColor }}
                >
                  {actor.nickname}
                </span>
              </span>
            ) : (
              <span className="text-smoke">кто-то</span>
            )}
            <span className="text-ash">{meta.verb}</span>
            {event.thread_title && (
              <span className="line-clamp-1 max-w-[60%] truncate text-bone">
                «{event.thread_title}»
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[10px] text-smoke">
            {relativeTime(event.ts)}
          </div>
        </div>
      </Link>
    </motion.li>
  );
}
