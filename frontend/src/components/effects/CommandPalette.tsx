"use client";

import { Command } from "cmdk";
import {
  Activity,
  Compass,
  Hash,
  LogIn,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { nickColor } from "@/lib/perks";
import type { Section, Thread, UserPublic } from "@/lib/types";

interface SearchState {
  sections: Section[];
  threads: Thread[];
  users: UserPublic[];
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [data, setData] = React.useState<SearchState>({
    sections: [],
    threads: [],
    users: [],
  });
  const router = useRouter();
  const { user, logout } = useAuth();

  // Open via Cmd/Ctrl+K, Escape closes (cmdk handles)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen as EventListener);
    };
  }, []);

  // Load sections + recent threads + a few online users on first open
  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [sections, threads, users] = await Promise.all([
          api<Section[]>("/sections"),
          api<Thread[]>("/threads/recent?limit=20"),
          api<UserPublic[]>("/users/online"),
        ]);
        setData({ sections, threads, users });
      } catch {
        /* swallow */
      }
    })();
  }, [open]);

  function go(path: string) {
    setOpen(false);
    setQuery("");
    router.push(path);
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[80] bg-background/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Командная панель"
        className="fixed left-1/2 top-[15vh] z-[90] w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl glass-strong shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <Search className="h-4 w-4 text-smoke" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Перейти, найти тему, юзера…"
            className="w-full bg-transparent text-sm text-bone placeholder:text-smoke focus:outline-none"
            autoFocus
          />
          <kbd className="hidden h-5 items-center rounded border border-border bg-slate px-1.5 font-mono text-[10px] text-ash sm:inline-flex">
            esc
          </kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto px-2 py-2">
          <Command.Empty className="px-4 py-6 text-center text-sm text-smoke">
            Ничего не найдено
          </Command.Empty>

          <Group heading="Навигация">
            <Item icon={Compass} onSelect={() => go("/")}>
              Главная
            </Item>
            <Item icon={Plus} onSelect={() => go("/f/general/new")} hint="новая тема">
              Создать тему
            </Item>
            {user && (
              <Item icon={UserIcon} onSelect={() => go(`/u/${user.nickname}`)}>
                Мой профиль
              </Item>
            )}
            {user ? (
              <Item icon={LogOut} onSelect={async () => { setOpen(false); await logout(); }}>
                Выйти
              </Item>
            ) : (
              <>
                <Item icon={LogIn} onSelect={() => go("/login")}>Войти</Item>
                <Item icon={UserIcon} onSelect={() => go("/register")}>Регистрация</Item>
              </>
            )}
            <Item
              icon={Settings}
              onSelect={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent("open-shortcuts"));
              }}
              hint="?"
            >
              Горячие клавиши
            </Item>
          </Group>

          {data.sections.length > 0 && (
            <Group heading="Разделы">
              {data.sections.map((s) => (
                <Item
                  key={s.id}
                  icon={Hash}
                  onSelect={() => go(`/f/${s.slug}`)}
                  hint={`${s.thread_count} тем`}
                  keywords={[s.slug, s.title, s.description]}
                >
                  {s.title}
                </Item>
              ))}
            </Group>
          )}

          {data.threads.length > 0 && (
            <Group heading="Темы">
              {data.threads.map((t) => (
                <Item
                  key={t.id}
                  icon={MessageSquare}
                  onSelect={() => go(`/t/${t.id}`)}
                  hint={`${t.reply_count} ответов`}
                  keywords={[t.title, t.author?.nickname ?? "", t.slug]}
                >
                  {t.title}
                </Item>
              ))}
            </Group>
          )}

          {data.users.length > 0 && (
            <Group heading="Игроки онлайн">
              {data.users.map((u) => (
                <Item
                  key={u.id}
                  icon={Activity}
                  onSelect={() => go(`/u/${u.nickname}`)}
                  hint={u.roles?.[0]?.title ?? ""}
                  keywords={[u.nickname, u.title ?? ""]}
                >
                  <span style={{ color: nickColor(u) }}>{u.nickname}</span>
                </Item>
              ))}
            </Group>
          )}
        </Command.List>

        <div className="flex items-center justify-between border-t border-white/5 bg-void/40 px-4 py-2 text-[11px] text-smoke">
          <div className="flex items-center gap-3">
            <kbd className="rounded border border-border bg-slate px-1.5 py-0.5 font-mono">↑↓</kbd>
            навигация
            <kbd className="rounded border border-border bg-slate px-1.5 py-0.5 font-mono">↵</kbd>
            выбор
          </div>
          <span className="text-plasma">endless·war</span>
        </div>
      </Command.Dialog>
    </>
  );
}

function Group({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-smoke"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  icon: Icon,
  children,
  hint,
  onSelect,
  keywords,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  hint?: string;
  onSelect: () => void;
  keywords?: string[];
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      keywords={keywords}
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-ash transition-colors data-[selected=true]:bg-plasma/10 data-[selected=true]:text-bone"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-smoke" />
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-[11px] text-smoke">{hint}</span>}
    </Command.Item>
  );
}
