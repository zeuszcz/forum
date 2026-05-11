"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Command,
  Key,
  LogOut,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Shield,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DayNightToggle } from "@/components/effects/DayNightToggle";
import { MagneticButton } from "@/components/effects/MagneticButton";
import { NotificationCenter } from "@/components/effects/NotificationCenter";
import { ThemePicker } from "@/components/effects/ThemePicker";
import { LetterAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { avatarGlowColor, glowNickProps, nickColor } from "@/lib/perks";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Главная" },
  { href: "/privileges", label: "Привилегии" },
  { href: "/models", label: "Модели" },
  { href: "/cases", label: "Кейсы" },
];

const FORUM_SECTIONS = [
  { href: "/f/rules", label: "📜 Правила сервера" },
  { href: "/f/ban-appeals", label: "Бан-апелляции" },
  { href: "/f/player-reports", label: "Жалобы на игроков" },
  { href: "/f/admin-applications", label: "Заявки в администрацию" },
  { href: "/f/suggestions", label: "Предложения" },
  { href: "/f/general", label: "Общение" },
  { href: "/f/off-topic", label: "Off-topic" },
  { href: "/f/releases", label: "Релизы и обновления" },
  { href: "/f/promo", label: "Промо и VIP" },
  { href: "/f/demos", label: "Демки" },
];

function openCommandPalette() {
  window.dispatchEvent(new CustomEvent("open-command-palette"));
}

export function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const topRole = user?.roles?.[0];
  const isStaff = user?.roles?.some((r) => r.is_staff);
  const forumActive = pathname?.startsWith("/f/") ?? false;
  const caseKeys = user?.case_keys ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 glass-strong">
      <div className="container flex h-16 items-center justify-between gap-2">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 transition-opacity hover:opacity-80"
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

          <ForumDropdown active={forumActive} />
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-xs text-smoke transition-colors hover:border-plasma/40 hover:text-ash lg:inline-flex"
            aria-label="Open command palette"
          >
            <Command className="h-3.5 w-3.5" />
            <span>поиск</span>
            <kbd className="ml-2 inline-flex h-5 items-center rounded border border-border bg-slate px-1.5 font-mono text-[10px] text-ash">
              ⌘K
            </kbd>
          </button>

          {isStaff && (
            <Link
              href="/admin"
              className="hidden h-9 items-center gap-1.5 rounded-md border border-plasma/40 bg-plasma/10 px-3 text-xs font-semibold uppercase tracking-widest text-plasma transition-colors hover:bg-plasma/20 md:inline-flex"
            >
              <Shield className="h-3.5 w-3.5" />
              admin
            </Link>
          )}

          <div className="hidden md:inline-flex">
            <DayNightToggle />
          </div>
          <div className="hidden md:inline-flex">
            <ThemePicker />
          </div>

          {user ? (
            <>
              <MagneticButton strength={0.25} className="hidden md:inline-block">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/f/general/new">
                    <Plus className="h-4 w-4" />
                    Создать тему
                  </Link>
                </Button>
              </MagneticButton>
              {caseKeys > 0 && (
                <Link
                  href="/cases"
                  title="Ключи от кейсов"
                  className="hidden h-9 items-center gap-1.5 rounded-md border border-flame/40 bg-flame/10 px-2.5 font-mono text-xs font-bold text-flame transition-colors hover:bg-flame/20 md:inline-flex"
                >
                  <Key className="h-3.5 w-3.5" />
                  {caseKeys}
                </Link>
              )}
              <NotificationCenter />
              <Link
                href={`/u/${user.nickname}`}
                className="group inline-flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-slate"
              >
                <LetterAvatar nickname={user.nickname} size={26} glowColor={avatarGlowColor(user)} avatarUrl={user.avatar_url ?? null} />
                <span className="hidden flex-col leading-tight sm:flex">
                  {(() => {
                    const glow = glowNickProps(user);
                    return (
                      <span
                        className={cn(
                          "text-xs font-semibold tracking-tight",
                          glow.className,
                        )}
                        style={{ color: nickColor(user), ...glow.style }}
                      >
                        {user.nickname}
                      </span>
                    );
                  })()}
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
                className="hidden md:inline-flex"
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

          <MobileMoreMenu
            isStaff={!!isStaff}
            isLoggedIn={!!user}
            caseKeys={caseKeys}
            pathname={pathname}
            onLogout={() => logout()}
          />
        </div>
      </div>
    </header>
  );
}

function ForumDropdown({ active }: { active: boolean }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group relative inline-flex items-center gap-1 text-sm font-medium tracking-wide transition-colors duration-150 ease-premium",
            active ? "text-bone" : "text-ash hover:text-bone",
          )}
          aria-label="Форум"
        >
          Форум
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
          {active && (
            <span
              className="absolute -bottom-[21px] left-0 right-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgb(var(--plasma-rgb)), transparent)",
              }}
            />
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={20} className="z-50" asChild>
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-64 overflow-hidden rounded-lg glass-strong shadow-xl"
          >
            <header className="border-b border-white/5 px-4 py-2.5">
              <h2 className="text-sm font-semibold tracking-tight text-bone">Разделы форума</h2>
              <p className="mt-0.5 text-[11px] text-smoke">
                апелляции, жалобы и обсуждения
              </p>
            </header>
            <div className="p-1.5">
              {FORUM_SECTIONS.map((s) => (
                <DropdownMenu.Item
                  key={s.href}
                  asChild
                  className="cursor-pointer rounded-md outline-none"
                >
                  <Link
                    href={s.href}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-ash transition-colors hover:bg-slate hover:text-bone"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-smoke" />
                    {s.label}
                  </Link>
                </DropdownMenu.Item>
              ))}
            </div>
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MobileMoreMenu({
  isStaff,
  isLoggedIn,
  caseKeys,
  pathname,
  onLogout,
}: {
  isStaff: boolean;
  isLoggedIn: boolean;
  caseKeys: number;
  pathname: string | null;
  onLogout: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ash transition-colors hover:bg-slate hover:text-bone md:hidden"
          aria-label="Меню"
          title="Меню"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={10} className="z-50" asChild>
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-72 overflow-hidden rounded-lg glass-strong shadow-xl"
          >
            {isStaff && (
              <div className="border-b border-white/5 p-1.5">
                <p className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-widest text-smoke">
                  Быстрый доступ
                </p>
                <DropdownMenu.Item asChild className="cursor-pointer rounded-md outline-none">
                  <Link
                    href="/admin"
                    className="flex w-full items-center gap-2.5 rounded-md border border-plasma/30 bg-plasma/10 px-2.5 py-2 text-xs font-semibold uppercase tracking-widest text-plasma transition-colors hover:bg-plasma/20"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Админ-панель
                  </Link>
                </DropdownMenu.Item>
              </div>
            )}

            <div className="border-b border-white/5 p-1.5">
              <p className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-widest text-smoke">
                Меню
              </p>
              {NAV.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname?.startsWith(item.href);
                return (
                  <DropdownMenu.Item
                    key={item.href}
                    asChild
                    className="cursor-pointer rounded-md outline-none"
                  >
                    <Link
                      href={item.href}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-xs transition-colors hover:bg-slate hover:text-bone",
                        active ? "text-bone bg-slate/50" : "text-ash",
                      )}
                    >
                      {item.label}
                      {item.href === "/cases" && caseKeys > 0 && (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full border border-flame/40 bg-flame/10 px-2 font-mono text-[10px] font-bold text-flame">
                          <Key className="h-3 w-3" />
                          {caseKeys}
                        </span>
                      )}
                    </Link>
                  </DropdownMenu.Item>
                );
              })}
            </div>

            <div className="border-b border-white/5 p-1.5">
              <p className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-widest text-smoke">
                Форум
              </p>
              {FORUM_SECTIONS.map((s) => {
                const active = pathname?.startsWith(s.href);
                return (
                  <DropdownMenu.Item
                    key={s.href}
                    asChild
                    className="cursor-pointer rounded-md outline-none"
                  >
                    <Link
                      href={s.href}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors hover:bg-slate hover:text-bone",
                        active ? "text-bone bg-slate/50" : "text-ash",
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-smoke" />
                      {s.label}
                    </Link>
                  </DropdownMenu.Item>
                );
              })}
            </div>

            <div className="p-1.5">
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  openCommandPalette();
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-ash outline-none transition-colors hover:bg-slate hover:text-bone"
              >
                <Search className="h-3.5 w-3.5 text-smoke" />
                <span className="flex-1">Поиск</span>
                <kbd className="inline-flex h-5 items-center rounded border border-border bg-slate px-1.5 font-mono text-[10px] text-ash">
                  ⌘K
                </kbd>
              </DropdownMenu.Item>

              {isLoggedIn && (
                <DropdownMenu.Item asChild className="cursor-pointer rounded-md outline-none">
                  <Link
                    href="/f/general/new"
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-ash transition-colors hover:bg-slate hover:text-bone"
                  >
                    <Plus className="h-3.5 w-3.5 text-smoke" />
                    Создать тему
                  </Link>
                </DropdownMenu.Item>
              )}

              {isLoggedIn && (
                <DropdownMenu.Item
                  onSelect={(e) => {
                    e.preventDefault();
                    onLogout();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-ash outline-none transition-colors hover:bg-slate hover:text-bone"
                >
                  <LogOut className="h-3.5 w-3.5 text-smoke" />
                  <span>Выйти</span>
                </DropdownMenu.Item>
              )}
            </div>
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
