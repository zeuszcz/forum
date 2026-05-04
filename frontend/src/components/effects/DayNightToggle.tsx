"use client";

import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/theme-context";

/**
 * One-click theme flip between daylight and the user's last dark theme.
 * Lives next to the palette picker — palette is for choosing *which* dark
 * variant; this is the fast day/night switch users actually want.
 */
export function DayNightToggle() {
  const { isLight, toggleDayNight } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleDayNight}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ash transition-colors hover:bg-slate hover:text-bone"
      aria-label={isLight ? "Включить тёмную тему" : "Включить светлую тему"}
      title={isLight ? "Тёмная тема" : "Светлая тема"}
    >
      <motion.span
        key={isLight ? "sun" : "moon"}
        initial={{ rotate: -45, opacity: 0, scale: 0.7 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="inline-flex"
      >
        {isLight ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </motion.span>
    </button>
  );
}
