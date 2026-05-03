"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "div" | "section" | "article" | "a";
  href?: string;
}

/**
 * Card with a cursor-following radial gradient highlight (Vercel-style).
 * Cooperates with `.spotlight` class in globals.css.
 */
export function SpotlightCard({
  as = "div",
  className,
  children,
  href,
  ...props
}: SpotlightCardProps) {
  const ref = React.useRef<HTMLElement | null>(null);

  function onMove(e: React.MouseEvent<HTMLElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
  }

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref as React.Ref<HTMLElement>}
      onMouseMove={onMove}
      href={href}
      className={cn("spotlight", className)}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Tag>
  );
}
