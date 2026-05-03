"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { useTheme } from "@/lib/theme-context";

const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

/**
 * Listens for the Konami code globally. On hit:
 *  - Switches theme to neon-arcade for 5 minutes
 *  - Fires achievement reveal
 */
export function Konami() {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    let buffer: string[] = [];
    function onKey(e: KeyboardEvent) {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      buffer.push(k);
      if (buffer.length > SEQUENCE.length) buffer = buffer.slice(-SEQUENCE.length);
      if (buffer.length === SEQUENCE.length && buffer.every((v, i) => v === SEQUENCE[i])) {
        buffer = [];
        const previous = theme;
        setTheme("neon-arcade");
        toast.success("Arcade mode", {
          description: "5 минут на тебя смотрит 80-е. Никто не помешает.",
        });
        window.dispatchEvent(
          new CustomEvent("ew-achievement", {
            detail: {
              title: "Konami master",
              description: "Ты ввёл легендарный код",
              icon: "🕹️",
              accent: "cyan",
            },
          }),
        );
        // Revert after 5 minutes
        window.setTimeout(() => setTheme(previous), 5 * 60 * 1000);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theme, setTheme]);

  return null;
}
