"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import * as React from "react";

interface MagneticProps {
  children: React.ReactNode;
  strength?: number;
  className?: string;
  asChild?: boolean;
}

/**
 * Magnetic wrapper — children gently follow the cursor while it hovers.
 * Use around primary CTAs.
 */
export function MagneticButton({
  children,
  strength = 0.35,
  className,
}: MagneticProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    x.set(dx * strength);
    y.set(dy * strength);
  }
  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x: sx, y: sy }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
