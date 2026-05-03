"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "framer-motion";
import { AtSign, Bell, Heart, MessageSquare } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { relativeTime } from "@/lib/format";
import type { NotificationItem, NotificationsResponse } from "@/lib/types";

const POLL_MS = 30_000;

const ICONS: Record<string, React.ElementType> = {
  reply: MessageSquare,
  mention: AtSign,
  reaction: Heart,
  like: Heart,
  system: Bell,
};

const COLORS: Record<string, string> = {
  reply: "text-plasma",
  mention: "text-cyan",
  reaction: "text-flame",
  like: "text-flame",
  system: "text-ash",
};

export function NotificationCenter() {
  const { user } = useAuth();
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const fetch = React.useCallback(async () => {
    if (!user) {
      setItems([]);
      setUnread(0);
      return;
    }
    try {
      const r = await api<NotificationsResponse>("/notifications?limit=20");
      setItems(r.items);
      setUnread(r.unread);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setItems([]);
        setUnread(0);
      }
    }
  }, [user]);

  React.useEffect(() => {
    fetch();
    if (!user) return;
    const id = window.setInterval(fetch, POLL_MS);
    return () => window.clearInterval(id);
  }, [fetch, user]);

  async function markAllRead() {
    try {
      await api("/notifications/read-all", { method: "POST" });
      setItems((arr) => arr.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      /* no-op */
    }
  }

  async function clickItem(n: NotificationItem) {
    if (!n.read) {
      try {
        await api(`/notifications/${n.id}/read`, { method: "POST" });
      } catch {
        /* no-op */
      }
      setItems((arr) =>
        arr.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
  }

  if (!user) return null;

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
              <h2 className="text-sm font-semibold tracking-tight text-bone">
                Уведомления
              </h2>
              {unread > 0 && (
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
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-smoke">
                  Пусто
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {items.map((n) => {
                    const Icon = ICONS[n.kind] ?? Bell;
                    const colorCls = COLORS[n.kind] ?? "text-ash";
                    const inner = (
                      <li
                        className={
                          "flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate " +
                          (n.read ? "opacity-60" : "")
                        }
                      >
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${colorCls}`} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-bone">{n.title}</div>
                          {n.body && (
                            <div className="mt-0.5 text-xs text-ash line-clamp-2">
                              {n.body}
                            </div>
                          )}
                          <div className="mt-0.5 text-[10px] text-smoke">
                            {relativeTime(n.created_at)}
                          </div>
                        </div>
                        {!n.read && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-plasma" />
                        )}
                      </li>
                    );
                    return n.href ? (
                      <Link
                        key={n.id}
                        href={n.href}
                        onClick={() => clickItem(n)}
                        className="block"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => clickItem(n)}
                        className="block w-full text-left"
                      >
                        {inner}
                      </button>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-white/5 bg-void/40 px-4 py-2 text-[10px] uppercase tracking-widest text-smoke">
              poll каждые 30 сек
            </div>
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
