import {
  AlertTriangle,
  Ban,
  Lock,
  MessageSquare,
  MicOff,
  ScrollText,
  Users,
} from "lucide-react";
import Link from "next/link";

import { NumberTicker } from "@/components/effects/NumberTicker";
import { apiServer } from "@/lib/api";
import type { AdminStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  let stats: AdminStats;
  try {
    stats = await apiServer<AdminStats>("/admin/stats");
  } catch {
    return (
      <div className="rounded-lg border border-ember/30 bg-ember/5 p-5 text-sm text-ember">
        Не удалось загрузить статистику. Возможно, бэкенд недоступен.
      </div>
    );
  }

  const cards = [
    { label: "Всего пользователей", value: stats.users_total, icon: Users, accent: "plasma" },
    { label: "Забанено", value: stats.users_banned, icon: Ban, accent: "ember" },
    { label: "В муте", value: stats.users_muted, icon: MicOff, accent: "flame" },
    { label: "Тем", value: stats.threads_total, icon: MessageSquare, accent: "cyan" },
    { label: "Сообщений", value: stats.posts_total, icon: ScrollText, accent: "plasma" },
    { label: "Закрытые разделы", value: stats.sections_locked, icon: Lock, accent: "flame" },
  ] as const;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-bone">Админ-панель</h1>
        <p className="mt-1 text-sm text-smoke">обзор и управление</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-plasma/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-smoke">{c.label}</span>
              <c.icon
                className={`h-4 w-4 ${
                  c.accent === "plasma"
                    ? "text-plasma"
                    : c.accent === "flame"
                      ? "text-flame"
                      : c.accent === "cyan"
                        ? "text-cyan"
                        : "text-ember"
                }`}
              />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold text-bone">
              <NumberTicker value={c.value} />
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold tracking-tight text-bone">Быстрые действия</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link
            href="/admin/users"
            className="group flex items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-plasma/40 hover:bg-slate"
          >
            <Users className="h-4 w-4 text-plasma" />
            <span className="flex-1 text-sm text-bone">Пользователи</span>
            <span className="text-xs text-smoke">бан / мьют / роли</span>
          </Link>
          <Link
            href="/admin/audit"
            className="group flex items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-plasma/40 hover:bg-slate"
          >
            <ScrollText className="h-4 w-4 text-cyan" />
            <span className="flex-1 text-sm text-bone">Аудит-лог</span>
            <span className="text-xs text-smoke">все действия</span>
          </Link>
          <Link
            href="/admin/sections"
            className="group flex items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-plasma/40 hover:bg-slate"
          >
            <Lock className="h-4 w-4 text-flame" />
            <span className="flex-1 text-sm text-bone">Разделы</span>
            <span className="text-xs text-smoke">закрыть / открыть</span>
          </Link>
        </div>
      </section>

      {stats.users_banned + stats.users_muted > 0 && (
        <section className="rounded-lg border border-flame/30 bg-flame/5 p-4 text-sm text-ash">
          <div className="inline-flex items-center gap-2 font-medium text-flame">
            <AlertTriangle className="h-4 w-4" />
            Активных ограничений: {stats.users_banned + stats.users_muted}
          </div>
          <p className="mt-1 text-xs text-smoke">
            <Link href="/admin/users?filter=banned" className="link-plasma">
              забаненные
            </Link>
            {" · "}
            <Link href="/admin/users?filter=muted" className="link-plasma">
              в муте
            </Link>
          </p>
        </section>
      )}
    </div>
  );
}
