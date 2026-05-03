"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "framer-motion";
import { Bell, MessageSquare, Heart, AtSign } from "lucide-react";
import * as React from "react";

interface Notification {
  id: number;
  kind: "reply" | "mention" | "like" | "system";
  title: string;
  body?: string;
  href?: string;
  ts: number;
  read: boolean;
}

const ICONS = {
  reply: MessageSquare,
  mention: AtSign,
  like: Heart,
  system: Bell,
};

const COLORS = {
  reply: "text-plasma",
  mention: "text-cyan",
  like: "text-flame",
  system: "text-ash",
};

/**
 * Notification dropdown. Currently uses local state with mock seed data
 * (real backend events come in Phase 2 with WebSocket). Wave 3 ships
 * the UI so that when notifications API exists, swap the source array.
 */
export function NotificationCenter() {
  const [notifs, setNotifs] = React.useState<Notification[]>([]);
  const [open, setOpen] = React.useState(false);

  // Seed local-only welcome notification (only for first session per browser)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const seenKey = "ew_welcomed";
    if (localStorage.getItem(seenKey)) return;
    setNotifs([
      {
        id: 1,
        kind: "system",
        title: "Добро пожаловать в endless·war",
        body: "Это превью v0. WebSocket-уведомления — в Phase 2.",
        ts: Date.now(),
        read: false,
      },
    ]);
    localStorage.setItem(seenKey, "1");
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  function markAllRead() {
    setNotifs((arr) => arr.map((n) => ({ ...n, read: true })));
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ash transition-colors hover:bg-slate hover:text-bone"
          aria-label={`Уведомления (${unread})`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-flame px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
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
            className="w-80 overflow-hidden rounded-lg glass-strong shadow-xl"
          >
            <header className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
              <h2 className="text-sm font-semibold tracking-tight text-bone">Уведомления</h2>
              {notifs.some((n) => !n.read) && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[11px] text-smoke transition-colors hover:text-ash"
                >
                  отметить все
                </button>
              )}
            </header>
            <div className="max-h-[60vh] overflow-y-auto">
              {notifs.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-smoke">Пусто</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {notifs.map((n) => {
                    const Icon = ICONS[n.kind];
                    return (
                      <li
                        key={n.id}
                        className={
                          "flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate " +
                          (n.read ? "opacity-60" : "")
                        }
                      >
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${COLORS[n.kind]}`} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-bone">{n.title}</div>
                          {n.body && <div className="mt-0.5 text-xs text-ash">{n.body}</div>}
                        </div>
                        {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-plasma" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-white/5 bg-void/40 px-4 py-2 text-[10px] uppercase tracking-widest text-smoke">
              реалтайм — phase 2
            </div>
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
