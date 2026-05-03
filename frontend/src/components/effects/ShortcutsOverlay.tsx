"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import * as React from "react";

const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Открыть командную панель" },
  { keys: ["?"], label: "Показать эти подсказки" },
  { keys: ["G", "H"], label: "На главную" },
  { keys: ["G", "P"], label: "В профиль" },
  { keys: ["N"], label: "Создать новую тему" },
  { keys: ["L"], label: "Лайкнуть пост (в фокусе)" },
  { keys: ["R"], label: "Ответить (в открытой теме)" },
  { keys: ["/"], label: "Сфокусировать поиск" },
  { keys: ["Esc"], label: "Закрыть всё" },
];

export function ShortcutsOverlay() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-shortcuts", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-shortcuts", onOpen as EventListener);
    };
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[80] bg-background/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-label="Горячие клавиши"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-1/2 z-[90] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl glass-strong shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-white/5 px-5 py-3.5">
              <h2 className="text-sm font-semibold tracking-tight text-bone">Горячие клавиши</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-smoke transition-colors hover:bg-slate hover:text-bone"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <ul className="divide-y divide-white/5">
              {SHORTCUTS.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between px-5 py-2.5 text-sm text-ash"
                >
                  <span>{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className="text-smoke text-xs">→</span>}
                        <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border bg-slate px-1.5 font-mono text-[11px] text-bone">
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-white/5 bg-void/40 px-5 py-2.5 text-[11px] text-smoke">
              Нажми <kbd className="font-mono">?</kbd> где угодно чтобы открыть эту шпаргалку
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!target) return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
