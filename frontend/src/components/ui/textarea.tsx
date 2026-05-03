import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[88px] w-full rounded-md border border-border bg-void px-3 py-2 text-sm leading-relaxed text-bone placeholder:text-smoke transition-colors duration-150 ease-premium focus-visible:outline-none focus-visible:border-plasma focus-visible:ring-2 focus-visible:ring-plasma/30 disabled:cursor-not-allowed disabled:opacity-50 resize-vertical",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
