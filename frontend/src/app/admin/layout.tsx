import { ChevronRight, ScrollText, Settings, Shield, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { apiServerOptional } from "@/lib/api";
import type { UserPublic } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Админка",
};

const NAV = [
  { href: "/admin", label: "Дашборд", icon: Shield },
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/audit", label: "Аудит", icon: ScrollText },
  { href: "/admin/sections", label: "Разделы", icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await apiServerOptional<UserPublic>("/auth/me");
  if (!user) redirect("/login?next=/admin");
  const isStaff = user.roles?.some((r) => r.is_staff);
  if (!isStaff) {
    return (
      <div className="container max-w-md py-20 text-center">
        <Shield className="mx-auto h-12 w-12 text-ember" />
        <h1 className="mt-4 text-2xl font-bold text-bone">403 — нет доступа</h1>
        <p className="mt-2 text-sm text-ash">
          Этот раздел только для модераторов и администраторов.
        </p>
        <Link href="/" className="mt-6 inline-block link-plasma">
          На главную
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-6 md:py-10">
      <nav className="mb-6 flex items-center gap-1 text-xs text-smoke">
        <Link href="/" className="transition-colors hover:text-ash">
          Форум
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-iridescent font-semibold uppercase tracking-widest">
          Админ-панель
        </span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-1 lg:sticky lg:top-20 lg:self-start">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ash transition-colors hover:bg-slate hover:text-bone"
            >
              <item.icon className="h-4 w-4 shrink-0 text-smoke transition-colors group-hover:text-plasma" />
              {item.label}
            </Link>
          ))}
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}
