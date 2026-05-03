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
  plasma: "text-plasma group-hover:text-plasma-bright",
  flame: "text-flame group-hover:text-flame-bright",
  cyan: "text-cyan group-hover:text-cyan",
  ember: "text-ember group-hover:text-ember",
};

const ACCENT_BG: Record<Section["accent"], string> = {
  plasma: "border-plasma/30 group-hover:border-plasma/60 group-hover:shadow-glow-plasma",
  flame: "border-flame/30 group-hover:border-flame/60 group-hover:shadow-glow-flame",
  cyan: "border-cyan/30 group-hover:border-cyan/60",
  ember: "border-ember/30 group-hover:border-ember/60",
};

export function SectionCard({ section }: { section: Section }) {
  const Icon = ICONS[section.icon] ?? MessageSquare;
  return (
    <Link
      href={`/f/${section.slug}`}
      className="group block rounded-lg border border-border bg-card p-5 transition-all duration-200 ease-premium hover:border-plasma/40 hover:bg-card/80"
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-slate transition-all duration-200 ease-premium",
            ACCENT_BG[section.accent],
          )}
        >
          <Icon className={cn("h-5 w-5 transition-colors", ACCENTS[section.accent])} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-bone transition-colors group-hover:text-plasma-bright">
              {section.title}
            </h3>
            {section.is_locked && <Lock className="h-3 w-3 text-smoke" aria-label="locked" />}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-ash">{section.description}</p>
          <div className="mt-3 flex items-center gap-4 text-xs text-smoke">
            <span>
              <span className="font-mono text-bone">{section.thread_count}</span>{" "}
              {plural(section.thread_count, "тема", "темы", "тем")}
            </span>
            <span>
              <span className="font-mono text-bone">{section.post_count}</span>{" "}
              {plural(section.post_count, "сообщение", "сообщения", "сообщений")}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
