import * as React from "react";

import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string; // hex from role.color
}

export function Badge({ className, color, style, children, ...props }: BadgeProps) {
  const customStyle = color
    ? {
        ...style,
        backgroundColor: `${color}1f`,
        color,
        borderColor: `${color}40`,
      }
    : style;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        !color && "border-border bg-slate text-ash",
        className,
      )}
      style={customStyle}
      {...props}
    >
      {children}
    </span>
  );
}
