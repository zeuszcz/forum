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
}: {
  section: Section;
  sparkline?: number[];
}) {
  const Icon = ICONS[section.icon] ?? MessageSquare;
  const sparkSum = sparkline?.reduce((s, v) => s + v, 0) ?? 0;

  return (
    <TiltCard max={6} className="h-full">
      <ConicBorder className="h-full">
        <SpotlightCard className="group block h-full rounded-lg border border-border bg-card p-5 transition-colors duration-200 ease-premium hover:bg-card/85">
          <Link href={`/f/${section.slug}`} className="flex h-full flex-col gap-3">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-slate transition-colors duration-200",
                  "group-hover:border-plasma/40",
                )}
                style={{ transform: "translateZ(20px)" }}
              >
                <Icon className={cn("h-5 w-5 transition-colors", ACCENTS[section.accent])} />
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
