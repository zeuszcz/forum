"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "framer-motion";
import { Check, Moon, Palette, SunMoon, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

import { sfx } from "@/lib/audio";
import { THEMES, useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

export function ThemePicker() {
  const { theme, setTheme, autoDimEnabled, toggleAutoDim } = useTheme();
  const [sfxOn, setSfxOn] = useState(false);

  useEffect(() => {
    setSfxOn(sfx.isEnabled());
  }, []);

  function toggleSfx() {
    const next = !sfxOn;
    sfx.setEnabled(next);
    setSfxOn(next);
    if (next) sfx.click();
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ash transition-colors hover:bg-slate hover:text-bone"
          aria-label="Тема"
          title="Сменить тему"
        >
          <Palette className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50"
          asChild
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-72 overflow-hidden rounded-lg glass-strong shadow-xl"
          >
            <header className="border-b border-white/5 px-4 py-2.5">
              <h2 className="text-sm font-semibold tracking-tight text-bone">Тема</h2>
              <p className="mt-0.5 text-[11px] text-smoke">сохраняется в браузере</p>
            </header>
            <div className="grid grid-cols-2 gap-2 p-2">
              {THEMES.map((t) => (
                <DropdownMenu.Item
                  key={t.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    setTheme(t.id);
                  }}
                  className={cn(
                    "group flex cursor-pointer flex-col items-start gap-1.5 rounded-md border border-transparent p-2.5 outline-none transition-colors hover:border-plasma/30 hover:bg-slate",
                    theme === t.id && "border-plasma/50 bg-slate",
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs font-semibold text-bone">{t.title}</span>
                    {theme === t.id && <Check className="h-3 w-3 text-plasma" />}
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded">
                    {t.swatch.map((s, i) => (
                      <div key={i} className="flex-1" style={{ background: s }} />
                    ))}
                  </div>
                  <p className="text-[10px] leading-snug text-smoke line-clamp-2">
                    {t.description}
                  </p>
                </DropdownMenu.Item>
              ))}
            </div>
            <div className="border-t border-white/5 p-2 space-y-1">
              <button
                type="button"
                onClick={toggleAutoDim}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-slate",
                  autoDimEnabled ? "text-bone" : "text-ash",
                )}
              >
                {autoDimEnabled ? (
                  <SunMoon className="h-3.5 w-3.5 text-cyan" />
                ) : (
                  <Moon className="h-3.5 w-3.5 text-smoke" />
                )}
                <span className="flex-1">авто день/ночь</span>
                <Toggle on={autoDimEnabled} />
              </button>
              <button
                type="button"
                onClick={toggleSfx}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-slate",
                  sfxOn ? "text-bone" : "text-ash",
                )}
              >
                {sfxOn ? (
                  <Volume2 className="h-3.5 w-3.5 text-plasma" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 text-smoke" />
                )}
                <span className="flex-1">звуковые эффекты</span>
                <Toggle on={sfxOn} />
              </button>
            </div>
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
        on
          ? "border-plasma/40 bg-plasma/10 text-plasma"
          : "border-border text-smoke",
      )}
    >
      {on ? "вкл" : "выкл"}
    </span>
  );
}
