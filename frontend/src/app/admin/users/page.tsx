import { Ban, MicOff, Lock, Search } from "lucide-react";
import Link from "next/link";

import { UserActions } from "@/components/admin/UserActions";
import { LetterAvatar } from "@/components/ui/avatar";
import { apiServer } from "@/lib/api";
import { plural, relativeTime } from "@/lib/format";
import type { AdminUsersResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

import { UserSearchForm } from "./search-form";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "all", label: "Все" },
  { value: "banned", label: "Забаненные" },
  { value: "muted", label: "В муте" },
  { value: "staff", label: "Персонал" },
];

export default async function UsersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter ?? "all";
  const q = sp.q ?? "";
  const params = new URLSearchParams({ filter, limit: "100" });
  if (q) params.set("q", q);
  const data = await apiServer<AdminUsersResponse>(`/admin/users?${params.toString()}`);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-bone">Пользователи</h1>
          <p className="text-xs text-smoke">
            всего {data.total} {plural(data.total, "юзер", "юзера", "юзеров")}
          </p>
        </div>
        <UserSearchForm initialQ={q} />
      </header>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const url = new URLSearchParams();
          if (q) url.set("q", q);
          if (f.value !== "all") url.set("filter", f.value);
          const active = filter === f.value;
          return (
            <Link
              key={f.value}
              href={`/admin/users?${url.toString()}`}
              className={cn(
                "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-plasma bg-plasma/10 text-plasma"
                  : "border-border text-ash hover:border-plasma/40 hover:text-bone",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {data.users.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-smoke">
          {q ? "Ничего не найдено" : "Нет пользователей под этот фильтр"}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-void/60 text-[10px] uppercase tracking-widest text-smoke">
              <tr>
                <th className="px-4 py-2.5 text-left">Пользователь</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">Email</th>
                <th className="px-4 py-2.5 text-left hidden sm:table-cell">Роли</th>
                <th className="px-4 py-2.5 text-left">Статус</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">Зарег.</th>
                <th className="px-4 py-2.5 text-right w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {data.users.map((u) => {
                const topRole = u.roles?.[0];
                return (
                  <tr key={u.id} className="transition-colors hover:bg-void/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/u/${u.nickname}`}
                        className="inline-flex items-center gap-2"
                      >
                        <LetterAvatar nickname={u.nickname} size={28} />
                        <span
                          className="font-semibold"
                          style={{ color: topRole?.color ?? "#e8e9f3" }}
                        >
                          {u.nickname}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-smoke hidden md:table-cell">
                      {u.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {u.roles?.slice(0, 3).map((r) => (
                          <span
                            key={r.slug}
                            className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                            style={{
                              borderColor: `${r.color}40`,
                              backgroundColor: `${r.color}1a`,
                              color: r.color,
                            }}
                          >
                            {r.title}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {u.is_banned && (
                          <Pill icon={Ban} accent="ember">
                            бан
                            {u.banned_until ? ` до ${relativeTime(u.banned_until)}` : ""}
                          </Pill>
                        )}
                        {u.is_muted && (
                          <Pill icon={MicOff} accent="flame">
                            мьют
                            {u.muted_until ? ` до ${relativeTime(u.muted_until)}` : ""}
                          </Pill>
                        )}
                        {!u.can_create_threads && (
                          <Pill icon={Lock} accent="ash">
                            нет тем
                          </Pill>
                        )}
                        {!u.is_banned && !u.is_muted && u.can_create_threads && (
                          <span className="text-[10px] uppercase tracking-wider text-success">
                            ok
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-smoke hidden md:table-cell">
                      {relativeTime(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <UserActions user={u} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Pill({
  icon: Icon,
  accent,
  children,
}: {
  icon: React.ElementType;
  accent: "ember" | "flame" | "ash";
  children: React.ReactNode;
}) {
  const cls =
    accent === "ember"
      ? "border-ember/40 bg-ember/10 text-ember"
      : accent === "flame"
        ? "border-flame/40 bg-flame/10 text-flame"
        : "border-border bg-slate text-ash";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}
