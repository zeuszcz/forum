"use client";

import { LogOut, Plus, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LetterAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Главная" },
  { href: "/f/general", label: "Общение" },
  { href: "/f/ban-appeals", label: "Бан-апелляции" },
  { href: "/f/player-reports", label: "Жалобы" },
];

export function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const topRole = user?.roles?.[0];

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
          aria-label="endless·war"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="endless·war" className="h-8 w-auto" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm font-medium tracking-wide transition-colors duration-150 ease-premium",
                  active ? "text-bone" : "text-ash hover:text-bone",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/f/general/new">
                  <Plus className="h-4 w-4" />
                  Создать тему
                </Link>
              </Button>
              <Link
                href={`/u/${user.nickname}`}
                className="group inline-flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-slate"
              >
                <LetterAvatar nickname={user.nickname} size={26} />
                <span className="hidden flex-col leading-tight sm:flex">
                  <span
                    className="text-xs font-semibold tracking-tight"
                    style={{ color: topRole?.color ?? "#e8e9f3" }}
                  >
                    {user.nickname}
                  </span>
                  {topRole && (
                    <span className="text-[10px] uppercase tracking-wider text-smoke">
                      {topRole.title}
                    </span>
                  )}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => logout()}
                aria-label="Выйти"
                title="Выйти"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">
                  <UserIcon className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">Войти</span>
                </Link>
              </Button>
              <Button variant="gradient" size="sm" asChild>
                <Link href="/register">Регистрация</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
