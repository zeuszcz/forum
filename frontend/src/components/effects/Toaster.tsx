"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Premium toast stack. Sonner with custom styling tied to our theme tokens.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      theme="dark"
      toastOptions={{
        style: {
          background: "rgba(15, 15, 20, 0.85)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          color: "#e8e9f3",
          fontFamily: "Inter, system-ui, sans-serif",
        },
        className: "shadow-[0_8px_30px_rgba(0,0,0,0.45)]",
      }}
    />
  );
}
