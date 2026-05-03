"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

import { AvatarRing } from "@/components/forum/AvatarRing";
import { useAuth } from "@/lib/auth-context";
import { avatarGlowColor, glowNickProps, nickColor } from "@/lib/perks";
import { computeRank } from "@/lib/rank";

/**
 * Greeting card for the logged-in user. Shows their avatar with the
 * level ring, current rank, and a CTA to either create a new thread or
 * jump to the section that best matches their last activity.
 *
 * Returns null for anonymous visitors so the home page is dense for
 * them too.
 */
export function PersonalCard() {
  const { user } = useAuth();
  if (!user) return null;

  const rank = computeRank(user.total_posts, user.total_reactions_received);
  const glow = glowNickProps(user);
  const userColor = nickColor(user);
  const glowColor = avatarGlowColor(user);

  return (
    <section className="relative overflow-hidden rounded-lg border border-plasma/30 bg-card">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 0% 0%, rgb(var(--plasma-rgb) / 0.25), transparent 70%)",
        }}
      />
      <div className="relative flex items-center gap-4 px-5 py-4">
        <AvatarRing
          nickname={user.nickname}
          size={56}
          level={rank.level}
          percent={rank.percent}
          color={rank.color}
          glowColor={glowColor}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-smoke">
            <Sparkles className="h-2.5 w-2.5 text-plasma" />
            <span>с возвращением</span>
          </div>
          <Link
            href={`/u/${user.nickname}`}
            className={`text-base font-bold transition-opacity hover:opacity-80 ${glow.className}`}
            style={{
              color: userColor,
              ...glow.style,
            }}
          >
            {user.nickname}
          </Link>
          <div className="mt-0.5 text-[11px] text-smoke">
            <span className="font-mono font-bold" style={{ color: rank.color }}>
              Lvl {rank.level}
            </span>
            <span className="mx-1">·</span>
            <span>{rank.title}</span>
            {rank.next && (
              <>
                <span className="mx-1">·</span>
                <span>
                  до lvl {rank.next.level} —{" "}
                  <span className="text-ash">
                    {rank.xpForNext - rank.xpForLevel - rank.xpInto} XP
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
        <Link
          href="/f/general/new"
          className="hidden shrink-0 items-center gap-1.5 rounded-md border border-plasma/40 bg-plasma/10 px-3 py-1.5 text-xs font-medium text-plasma transition-colors hover:bg-plasma/20 sm:inline-flex"
        >
          новая тема
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="relative h-1 bg-void">
        <div
          className="h-full"
          style={{
            width: `${rank.percent}%`,
            background: `linear-gradient(90deg, ${rank.color}, rgb(var(--flame-rgb)))`,
            boxShadow: `0 0 8px ${rank.color}99`,
          }}
        />
      </div>
    </section>
  );
}
