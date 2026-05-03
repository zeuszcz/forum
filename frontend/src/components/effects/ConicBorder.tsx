import * as React from "react";

import { cn } from "@/lib/utils";

interface ConicBorderProps extends React.HTMLAttributes<HTMLDivElement> {
  innerClassName?: string;
}

/**
 * Wraps content with a conic-gradient border that rotates on hover.
 * Pure CSS (no JS). Cooperates with `.conic-border` in globals.css.
 */
export function ConicBorder({
  className,
  innerClassName,
  children,
  ...props
}: ConicBorderProps) {
  return (
    <div className={cn("conic-border rounded-lg", className)} {...props}>
      <div className={cn("relative z-[1] rounded-[inherit]", innerClassName)}>{children}</div>
    </div>
  );
}
