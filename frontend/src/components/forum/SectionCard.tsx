"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Coffee,
  Lightbulb,
  Lock,
  Megaphone,
  MessageSquare,
  Shield,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { ConicBorder } from "@/components/effects/ConicBorder";
import { NumberTicker } from "@/components/effects/NumberTicker";
import { SpotlightCard } from "@/components/effects/SpotlightCard";
import { TiltCard } from "@/components/effects/TiltCard";
import { Sparkline } from "@/components/forum/Sparkline";
import { plural } from "@/lib/format";
import type { Section } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "message-square": MessageSquare,
  megaphone: Megaphone,
  shield: Shield,
  "alert-triangle": AlertTriangle,
  "user-check": UserCheck,
  lightbulb: Lightbulb,
  coffee: Coffee,
};

const ACCENTS: Record<Section["accent"], string> = {
  plasma: "text-plasma",
  flame: "text-flame",
  cyan: "text-cyan",
  ember: "text-ember",
};

const SPARK_COLOR: Record<Section["accent"], string> = {
  plasma: "rgb(var(--plasma-rgb))",
  flame: "rgb(var(--flame-rgb))",
  cyan: "rgb(var(--cyan-rgb))",
  ember: "rgb(var(--ember-rgb))",
};

export function SectionCard({
  section,
  sparkline,
  pulseCount = 0,
}: {
  section: Section;
  sparkline?: number[];
  /** number of posts in this section over the last 10 minutes — drives "hot" indicator */
  pulseCount?: number;
}) {
  const Icon = ICONS[section.icon] ?? MessageSquare;
  const sparkSum = sparkline?.reduce((s, v) => s + v, 0) ?? 0;
  const hot = pulseCount > 0;

  return (
    <TiltCard max={6} className="h-full">
      <ConicBorder className="h-full">
        <SpotlightCard
          className={cn(
            "group block h-full rounded-lg border bg-card p-5 transition-colors duration-200 ease-premium hover:bg-card/85",
            hot ? "border-flame/40" : "border-border",
          )}
        >
          <Link href={`/f/${section.slug}`} className="flex h-full flex-col gap-3">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-slate transition-colors duration-200",
                  "group-hover:border-plasma/40",
                )}
                style={{ transform: "translateZ(20px)" }}
              >
                <Icon className={cn("h-5 w-5 transition-colors", ACCENTS[section.accent])} />
                {hot && (
                  <span
                    className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                    title={`${pulseCount} новых за 10 мин`}
                    style={{
                      background: "rgb(var(--flame-rgb))",
                      boxShadow: "0 0 10px rgb(var(--flame-rgb) / 0.7)",
                    }}
                  >
                    <span className="absolute inset-0 animate-ping rounded-full bg-flame opacity-60" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-bone transition-colors group-hover:text-plasma-bright">
                    {section.title}
                  </h3>
                  {section.is_locked && <Lock className="h-3 w-3 text-smoke" />}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-ash">{section.description}</p>
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-smoke">
              <div className="flex items-center gap-3">
                <span>
                  <NumberTicker value={section.thread_count} className="font-mono text-bone" />{" "}
                  {plural(section.thread_count, "тема", "темы", "тем")}
                </span>
                <span>
                  <NumberTicker value={section.post_count} className="font-mono text-bone" />{" "}
                  {plural(section.post_count, "сообщ.", "сообщ.", "сообщ.")}
                </span>
              </div>
              {sparkline && sparkline.length > 0 && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Sparkline
                    values={sparkline}
                    color={SPARK_COLOR[section.accent]}
                    width={56}
                    height={16}
                  />
                  <span className="font-mono text-[10px] text-smoke">
                    {sparkSum}/24ч
                  </span>
                </div>
              )}
            </div>
          </Link>
        </SpotlightCard>
      </ConicBorder>
    </TiltCard>
  );
}
