"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeId =
  | "plasma"
  | "neon-arcade"
  | "hacker-mono"
  | "glass-foil"
  | "retro-jail"
  | "high-contrast";

export interface ThemeMeta {
  id: ThemeId;
  title: string;
  description: string;
  swatch: string[]; // 3 hex colors for preview
}

export const THEMES: ThemeMeta[] = [
  {
    id: "plasma",
    title: "Plasma",
    description: "Стандарт. Электрический фиолет → магента → циан.",
    swatch: ["#7c5cff", "#a855f7", "#ec4899"],
  },
  {
    id: "neon-arcade",
    title: "Neon Arcade",
    description: "80-е аркады. Жёлтый и циан на чёрном.",
    swatch: ["#00f0ff", "#ffe600", "#270a4d"],
  },
  {
    id: "hacker-mono",
    title: "Hacker Mono",
    description: "Терминал. Зелёный на фосфорном чёрном.",
    swatch: ["#40f050", "#0f1d10", "#0a0a0a"],
  },
  {
    id: "glass-foil",
    title: "Glass Foil",
    description: "Иридесцентное стекло. Циан-маджента переливы.",
    swatch: ["#60c8ff", "#dc82ff", "#1a1f2c"],
  },
  {
    id: "retro-jail",
    title: "Retro Jail",
    description: "Тюремная роба. Янтарь и сепия.",
    swatch: ["#ff8232", "#ff5a1e", "#1f1611"],
  },
  {
    id: "high-contrast",
    title: "High Contrast",
    description: "Доступность AAA. Чистые жёлтый/чёрный/белый.",
    swatch: ["#ffff00", "#ffffff", "#000000"],
  },
];

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  /** auto day-night gentle saturation shift */
  autoDimEnabled: boolean;
  toggleAutoDim: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "ew_theme";
const AUTO_DIM_KEY = "ew_auto_dim";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("plasma");
  const [autoDimEnabled, setAutoDimEnabled] = useState(true);

  // Hydrate from localStorage / temporarily-applied attribute
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeId | null) ?? "plasma";
    setThemeState(saved);
    document.documentElement.setAttribute("data-theme", saved);
    const dim = localStorage.getItem(AUTO_DIM_KEY);
    setAutoDimEnabled(dim !== "0");
  }, []);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  const toggleAutoDim = useCallback(() => {
    setAutoDimEnabled((v) => {
      const next = !v;
      localStorage.setItem(AUTO_DIM_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  // Auto day/night — gentle filter shift based on local hour
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!autoDimEnabled) {
      document.documentElement.style.filter = "";
      return;
    }
    const apply = () => {
      const hour = new Date().getHours();
      // Late-night (22-6) → slightly warmer + darker; mid-day → neutral
      let filter = "";
      if (hour >= 22 || hour < 6) {
        filter = "saturate(0.92) brightness(0.92) hue-rotate(-4deg)";
      } else if (hour >= 6 && hour < 10) {
        filter = "saturate(1.05) brightness(1.02)";
      } else {
        filter = "";
      }
      document.documentElement.style.filter = filter;
    };
    apply();
    const id = window.setInterval(apply, 1000 * 60 * 30);
    return () => window.clearInterval(id);
  }, [autoDimEnabled]);

  const value = useMemo(
    () => ({ theme, setTheme, autoDimEnabled, toggleAutoDim }),
    [theme, setTheme, autoDimEnabled, toggleAutoDim],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
