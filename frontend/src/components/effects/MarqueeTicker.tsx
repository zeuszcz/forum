import * as React from "react";

interface MarqueeTickerProps {
  items: React.ReactNode[];
  /** Number of duplicates to render for seamless scroll */
  copies?: number;
  className?: string;
}

/**
 * Endless horizontal marquee (CSS-driven). Items repeat seamlessly.
 * Pure server-render-safe.
 */
export function MarqueeTicker({ items, copies = 2, className }: MarqueeTickerProps) {
  return (
    <div className={`marquee ${className ?? ""}`} aria-hidden="false">
      {Array.from({ length: copies }).map((_, c) => (
        <div className="marquee-track" key={c} aria-hidden={c > 0}>
          {items.map((item, i) => (
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-smoke" key={i}>
              {item}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
