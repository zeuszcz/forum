"use client";

import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { motion, useInView } from "framer-motion";
import { Check, Lock } from "lucide-react";
import { useRef } from "react";

import { NumberTicker } from "@/components/effects/NumberTicker";
import { PerkPreview } from "@/components/forum/PerkPreview";
import { computeRank, PERKS } from "@/lib/rank";
import { cn } from "@/lib/utils";

interface XPBarProps {
  posts: number;
  reactions: number;
  bonusXp?: number;
}

export function XPBar({ posts, reactions, bonusXp = 0 }: XPBarProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const rank = computeRank(posts, reactions, bonusXp);

  return (
    <div ref={ref} className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-smoke">уровень</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span
              className="font-mono text-3xl font-bold"
              style={{ color: rank.color }}
            >
              <NumberTicker value={rank.level} />
            </span>
            <span className="text-sm font-semibold" style={{ color: rank.color }}>
              {rank.title}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-smoke">XP</div>
          <div className="mt-0.5 font-mono text-sm text-ash">
            <NumberTicker value={rank.xpInto} /> / {rank.xpForNext - rank.xpForLevel}
          </div>
          {rank.next && (
            <div className="text-[10px] text-smoke">
              до{" "}
              <span className="font-semibold text-ash">
                lvl {rank.next.level} {rank.next.title}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-void">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${rank.color}, rgb(var(--flame-rgb)))`,
            boxShadow: `0 0 12px ${rank.color}99`,
          }}
          initial={{ width: 0 }}
          animate={{ width: inView ? `${rank.percent}%` : 0 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-smoke">
        <div>
          <span className="block font-mono font-semibold text-ash">{posts}</span>
          постов
        </div>
        <div>
          <span className="block font-mono font-semibold text-ash">{reactions}</span>
          реакций
        </div>
        <div>
          <span className="block font-mono font-semibold text-ash">{rank.xp}</span>
          total XP
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
            Привилегии
          </h3>
          <span className="text-[10px] text-smoke">наведи для превью</span>
        </div>
        <ul className="space-y-1">
          {PERKS.map((perk) => {
            const unlocked = rank.level >= perk.level;
            return (
              <PerkRow
                key={perk.slug}
                slug={perk.slug}
                level={perk.level}
                name={perk.name}
                description={perk.description}
                unlocked={unlocked}
              />
            );
          })}
        </ul>
      </div>
    </div>
  );
}

interface PerkRowProps {
  slug: string;
  level: number;
  name: string;
  description: string;
  unlocked: boolean;
}

function PerkRow({ slug, level, name, description, unlocked }: PerkRowProps) {
  return (
    <HoverCardPrimitive.Root openDelay={150} closeDelay={120}>
      <HoverCardPrimitive.Trigger asChild>
        <li
          className={cn(
            "group flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-all duration-150 ease-premium",
            unlocked
              ? "bg-plasma/5 text-bone hover:bg-plasma/10"
              : "text-smoke hover:bg-slate hover:text-ash",
          )}
          tabIndex={0}
        >
          <span
            className={cn(
              "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm",
              unlocked
                ? "bg-plasma/20 text-plasma"
                : "border border-border text-smoke",
            )}
          >
            {unlocked ? (
              <Check className="h-3 w-3" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
          </span>
          <span className="flex-1">
            <span
              className={cn(
                "transition-colors group-hover:text-bone",
                unlocked && "font-medium",
              )}
            >
              {name}
            </span>
            <span className="ml-2 text-smoke">{description}</span>
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-[10px]",
              unlocked ? "text-plasma" : "text-smoke",
            )}
          >
            lvl {level}
          </span>
        </li>
      </HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side="right"
          align="start"
          sideOffset={12}
          collisionPadding={16}
          className="z-50"
          asChild
        >
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <PerkPreview
              slug={slug}
              unlocked={unlocked}
              level={level}
              name={name}
              description={description}
            />
            <HoverCardPrimitive.Arrow className="fill-[hsl(var(--popover))]" />
          </motion.div>
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}
