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

export function SectionCard({ section }: { section: Section }) {
  const Icon = ICONS[section.icon] ?? MessageSquare;
  return (
    <TiltCard max={6} className="h-full">
      <ConicBorder className="h-full">
        <SpotlightCard
          as="a"
          href={`/f/${section.slug}`}
          className="group block h-full rounded-lg border border-border bg-card p-5 transition-colors duration-200 ease-premium hover:bg-card/85"
        >
          <Link href={`/f/${section.slug}`} className="flex h-full items-start gap-4">
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
              <div className="mt-3 flex items-center gap-4 text-xs text-smoke">
                <span>
                  <NumberTicker value={section.thread_count} className="font-mono text-bone" />{" "}
                  {plural(section.thread_count, "тема", "темы", "тем")}
                </span>
                <span>
                  <NumberTicker value={section.post_count} className="font-mono text-bone" />{" "}
                  {plural(section.post_count, "сообщение", "сообщения", "сообщений")}
                </span>
              </div>
            </div>
          </Link>
        </SpotlightCard>
      </ConicBorder>
    </TiltCard>
  );
}
