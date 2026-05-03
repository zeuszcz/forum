"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import * as React from "react";

interface NumberTickerProps {
  value: number;
  duration?: number;
  className?: string;
}

/**
 * Smoothly animates a number from 0 to its current value when it scrolls into
 * view. Used on stat counters.
 */
export function NumberTicker({ value, duration = 1.2, className }: NumberTickerProps) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString("ru-RU"));

  React.useEffect(() => {
    if (reduced) {
      mv.set(value);
      return;
    }
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [value, duration, mv, reduced]);

  return (
    <motion.span ref={ref} className={className}>
      {rounded}
    </motion.span>
  );
}
