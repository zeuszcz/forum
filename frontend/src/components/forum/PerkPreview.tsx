"use client";

import { motion } from "framer-motion";
import {
  Check,
  Heart,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Sparkles,
} from "lucide-react";

import { LetterAvatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface PerkPreviewProps {
  slug: string;
  unlocked: boolean;
  level: number;
  name: string;
  description: string;
}

/**
 * Visual demo of what each perk does. Mounted inside a HoverCard from XPBar.
 * Each preview is a self-contained ~280px wide mini scene.
 */
export function PerkPreview({
  slug,
  unlocked,
  level,
  name,
  description,
}: PerkPreviewProps) {
  return (
    <div className="w-72 overflow-hidden rounded-lg glass-strong">
      {/* Header strip */}
      <header
        className={cn(
          "flex items-center justify-between border-b border-white/5 px-4 py-2.5",
          unlocked
            ? "bg-gradient-to-r from-plasma/20 to-flame/10"
            : "bg-void/60",
        )}
      >
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight text-bone">
            {name}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-smoke">
            {description}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-widest",
            unlocked
              ? "border-success/40 bg-success/10 text-success"
              : "border-border bg-card text-smoke",
          )}
        >
          lvl {level}
        </span>
      </header>

      {/* Preview body */}
      <div className="bg-void/40 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
          Превью
        </div>
        <div className="mt-2">
          <PreviewBody slug={slug} />
        </div>
      </div>

      {/* Footer status */}
      <footer
        className={cn(
          "border-t border-white/5 px-4 py-2 text-[11px]",
          unlocked ? "text-success" : "text-smoke",
        )}
      >
        {unlocked ? (
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3 w-3" />
            Активно для тебя
          </span>
        ) : (
          <span>Откроется на lvl {level} (или выдаст админ)</span>
        )}
      </footer>
    </div>
  );
}

function PreviewBody({ slug }: { slug: string }) {
  switch (slug) {
    case "basic_post":
      return <BasicPostPreview />;
    case "embed_images":
      return <EmbedImagesPreview />;
    case "vote_polls":
      return <VotePollsPreview />;
    case "create_polls":
      return <CreatePollsPreview />;
    case "animated_frame":
      return <AnimatedFramePreview />;
    case "custom_title":
      return <CustomTitlePreview />;
    case "glow_nick":
      return <GlowNickPreview />;
    default:
      return (
        <div className="text-xs text-smoke">Превью пока не нарисовано</div>
      );
  }
}

/* ============================================================ Previews ============================================================ */

function BasicPostPreview() {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <LetterAvatar nickname="ты" size={20} />
        <span className="text-xs font-semibold text-bone">ты</span>
        <span className="text-[10px] text-smoke">только что</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ash">
        Привет всем — это мой первый пост 👋
      </p>
    </div>
  );
}

function EmbedImagesPreview() {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs leading-relaxed text-ash">
        Смотрите что я нашёл на de_jail:
      </p>
      <div
        className="mt-2 flex h-20 items-center justify-center rounded border border-border"
        style={{
          background:
            "linear-gradient(135deg, rgb(var(--plasma-rgb) / 0.2), rgb(var(--flame-rgb) / 0.15))",
        }}
      >
        <ImageIcon className="h-7 w-7 text-plasma" />
      </div>
      <p className="mt-1 text-[10px] text-smoke">screenshot.png · 480 KB</p>
    </div>
  );
}

function VotePollsPreview() {
  const options = [
    { label: "de_jail", percent: 62, leading: true },
    { label: "de_alcatraz", percent: 24 },
    { label: "ze_*", percent: 14 },
  ];
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
        Карта на сегодня?
      </div>
      <div className="mt-2 space-y-1.5">
        {options.map((o, i) => (
          <div
            key={o.label}
            className={cn(
              "relative overflow-hidden rounded border px-2 py-1.5 text-xs",
              i === 0
                ? "border-plasma/40 bg-plasma/10 text-bone"
                : "border-border text-ash",
            )}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${o.percent}%` }}
              transition={{ duration: 0.8, delay: 0.1 + i * 0.08 }}
              className="absolute inset-y-0 left-0 -z-10"
              style={{
                background: o.leading
                  ? "rgb(var(--plasma-rgb) / 0.18)"
                  : "rgb(var(--plasma-rgb) / 0.08)",
              }}
            />
            <div className="flex items-center justify-between">
              <span>{o.label}</span>
              <span className="font-mono">{o.percent}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-smoke">131 голос · твой засчитан</div>
    </div>
  );
}

function CreatePollsPreview() {
  return (
    <div className="rounded-md border border-plasma/30 bg-plasma/5 p-3">
      <div className="flex items-center gap-2">
        <Plus className="h-3 w-3 text-plasma" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-plasma">
          Опрос
        </span>
      </div>
      <input
        readOnly
        value="Какую карту?"
        className="mt-2 w-full rounded border border-border bg-card px-2 py-1 text-xs text-bone outline-none"
      />
      <div className="mt-2 space-y-1">
        {["de_jail", "de_alcatraz", "+ добавить"].map((o, i) => (
          <div
            key={i}
            className={cn(
              "rounded border px-2 py-1 text-[10px]",
              i === 2
                ? "border-dashed border-border text-smoke"
                : "border-border bg-card text-ash",
            )}
          >
            {o}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnimatedFramePreview() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-border bg-card p-4">
      <div className="relative">
        <motion.div
          aria-hidden="true"
          className="absolute -inset-1 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, rgb(var(--plasma-rgb)), rgb(var(--flame-rgb)), rgb(var(--cyan-rgb)), rgb(var(--plasma-rgb)))",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute -inset-1 rounded-full opacity-50 blur-md"
          style={{
            background:
              "conic-gradient(from 0deg, rgb(var(--plasma-rgb)), rgb(var(--flame-rgb)), rgb(var(--plasma-rgb)))",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
        <div className="relative">
          <LetterAvatar nickname="ты" size={56} />
        </div>
      </div>
      <span className="text-xs text-ash">свечение видно у всех</span>
    </div>
  );
}

function CustomTitlePreview() {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <LetterAvatar nickname="ты" size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-plasma">ты</div>
          <div className="text-[11px] italic text-ash">
            🔥 ветеран jail-сервера
          </div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-smoke">
        Свободный текст под ником — на профиле и в каждом посте
      </div>
    </div>
  );
}

function GlowNickPreview() {
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <LetterAvatar nickname="ты" size={20} />
          <span
            className="text-base font-bold"
            style={{
              color: "rgb(var(--plasma-bright-rgb))",
              textShadow:
                "0 0 8px rgb(var(--plasma-rgb) / 0.6), 0 0 18px rgb(var(--plasma-rgb) / 0.35), 0 0 28px rgb(var(--plasma-rgb) / 0.2)",
            }}
          >
            ты
          </span>
        </div>
        <p className="mt-1 text-[10px] text-smoke">в шоутбоксе</p>
      </div>
      <div className="rounded-md border border-border bg-card p-2.5">
        <span
          className="text-sm font-bold"
          style={{
            color: "rgb(var(--flame-rgb))",
            textShadow:
              "0 0 6px rgb(var(--flame-rgb) / 0.6), 0 0 14px rgb(var(--flame-rgb) / 0.35)",
          }}
        >
          ты
        </span>
        <span className="ml-1.5 text-[10px] text-smoke">в постах</span>
      </div>
    </div>
  );
}

/** Self-contained icon for use in the perk list row.
 *  Picks an icon based on the perk slug. */
export function PerkIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon =
    slug === "embed_images"
      ? ImageIcon
      : slug === "vote_polls" || slug === "create_polls"
        ? MessageSquare
        : slug === "animated_frame"
          ? Sparkles
          : slug === "glow_nick"
            ? Sparkles
            : slug === "custom_title"
              ? Heart
              : Check;
  return <Icon className={className} aria-hidden="true" />;
}
