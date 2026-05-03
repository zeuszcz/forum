"use client";

import { Command, LogOut, Plus, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MagneticButton } from "@/components/effects/MagneticButton";
import { NotificationCenter } from "@/components/effects/NotificationCenter";
import { ThemePicker } from "@/components/effects/ThemePicker";
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
    <header className="sticky top-0 z-40 border-b border-white/5 glass-strong">
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
                  "relative text-sm font-medium tracking-wide transition-colors duration-150 ease-premium",
                  active ? "text-bone" : "text-ash hover:text-bone",
                )}
              >
                {item.label}
                {active && (
                  <span
                    className="absolute -bottom-[21px] left-0 right-0 h-px"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgb(var(--plasma-rgb)), transparent)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
            className="hidden h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-xs text-smoke transition-colors hover:border-plasma/40 hover:text-ash sm:inline-flex"
            aria-label="Open command palette"
          >
            <Command className="h-3.5 w-3.5" />
            <span>поиск</span>
            <kbd className="ml-2 inline-flex h-5 items-center rounded border border-border bg-slate px-1.5 font-mono text-[10px] text-ash">
              ⌘K
            </kbd>
          </button>

          <ThemePicker />

          {user ? (
            <>
              <MagneticButton strength={0.25} className="hidden sm:inline-block">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/f/general/new">
                    <Plus className="h-4 w-4" />
                    Создать тему
                  </Link>
                </Button>
              </MagneticButton>
              <NotificationCenter />
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
              <MagneticButton strength={0.3}>
                <Button variant="gradient" size="sm" asChild>
                  <Link href="/register">Регистрация</Link>
                </Button>
              </MagneticButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
