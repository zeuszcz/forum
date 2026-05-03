"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "framer-motion";
import {
  Ban,
  ChevronDown,
  Lock,
  MicOff,
  MoreHorizontal,
  ShieldCheck,
  Unlock,
  Voicemail,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import type { AdminUserRead } from "@/lib/types";
import { cn } from "@/lib/utils";

interface UserActionsProps {
  user: AdminUserRead;
}

type Action = "ban" | "mute" | "thread-creation" | null;

const PRESET_DURATIONS = [
  { label: "1ч", h: 1 },
  { label: "24ч", h: 24 },
  { label: "7д", h: 24 * 7 },
  { label: "30д", h: 24 * 30 },
  { label: "навсегда", h: null },
];

export function UserActions({ user }: UserActionsProps) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState<number | null>(24);
  const [pending, setPending] = useState(false);

  function close() {
    setAction(null);
    setReason("");
    setHours(24);
  }

  async function call<T>(path: string, body?: unknown, method: "POST" | "DELETE" = "POST") {
    setPending(true);
    try {
      const r = await api<T>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      router.refresh();
      return r;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Не удалось выполнить");
      throw err;
    } finally {
      setPending(false);
    }
  }

  async function applyBan() {
    await call(`/admin/users/${user.id}/ban`, {
      reason: reason.trim() || null,
      duration_hours: hours,
    });
    toast.success(`${user.nickname} забанен`);
    close();
  }
  async function applyMute() {
    await call(`/admin/users/${user.id}/mute`, {
      reason: reason.trim() || null,
      duration_hours: hours,
    });
    toast.success(`${user.nickname} замьючен`);
    close();
  }
  async function unban() {
    await call(`/admin/users/${user.id}/unban`);
    toast(`${user.nickname} разбанен`);
  }
  async function unmute() {
    await call(`/admin/users/${user.id}/unmute`);
    toast(`${user.nickname} размьючен`);
  }
  async function toggleThreadCreation() {
    const next = !user.can_create_threads;
    await call(`/admin/users/${user.id}/thread-creation`, {
      can_create: next,
      reason: reason.trim() || null,
    });
    toast(
      next
        ? `${user.nickname} снова может создавать темы`
        : `${user.nickname} больше не может создавать темы`,
    );
    if (action) close();
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ash transition-colors hover:bg-slate hover:text-bone"
            aria-label={`Действия для ${user.nickname}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content asChild align="end" sideOffset={6} className="z-50">
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.15 }}
              className="w-56 overflow-hidden rounded-lg glass-strong shadow-xl"
            >
              {user.is_banned ? (
                <Item icon={ShieldCheck} onSelect={unban} accent="cyan" disabled={pending}>
                  Разбанить
                </Item>
              ) : (
                <Item icon={Ban} onSelect={() => setAction("ban")} accent="ember" disabled={pending}>
                  Забанить…
                </Item>
              )}
              {user.is_muted ? (
                <Item icon={Voicemail} onSelect={unmute} accent="cyan" disabled={pending}>
                  Размьютить
                </Item>
              ) : (
                <Item icon={MicOff} onSelect={() => setAction("mute")} accent="flame" disabled={pending}>
                  Замьютить…
                </Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-white/5" />
              <Item
                icon={user.can_create_threads ? Lock : Unlock}
                onSelect={toggleThreadCreation}
                disabled={pending}
              >
                {user.can_create_threads ? "Закрыть создание тем" : "Открыть создание тем"}
              </Item>
            </motion.div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {action && (
        <RestrictionDialog
          title={action === "ban" ? `Бан ${user.nickname}` : `Мьют ${user.nickname}`}
          accent={action === "ban" ? "ember" : "flame"}
          reason={reason}
          setReason={setReason}
          hours={hours}
          setHours={setHours}
          pending={pending}
          onCancel={close}
          onSubmit={action === "ban" ? applyBan : applyMute}
        />
      )}
    </>
  );
}

function Item({
  icon: Icon,
  children,
  onSelect,
  accent,
  disabled,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  onSelect: () => void;
  accent?: "ember" | "flame" | "cyan";
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none transition-colors data-[disabled]:opacity-50",
        accent === "ember"
          ? "text-ember data-[highlighted]:bg-ember/10"
          : accent === "flame"
            ? "text-flame data-[highlighted]:bg-flame/10"
            : accent === "cyan"
              ? "text-cyan data-[highlighted]:bg-cyan/10"
              : "text-ash data-[highlighted]:bg-slate data-[highlighted]:text-bone",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </DropdownMenu.Item>
  );
}

function RestrictionDialog({
  title,
  accent,
  reason,
  setReason,
  hours,
  setHours,
  pending,
  onCancel,
  onSubmit,
}: {
  title: string;
  accent: "ember" | "flame";
  reason: string;
  setReason: (v: string) => void;
  hours: number | null;
  setHours: (v: number | null) => void;
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-[80] flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 w-[92vw] max-w-md overflow-hidden rounded-xl glass-strong"
      >
        <header
          className="border-b border-white/5 px-5 py-3"
          style={{
            background:
              accent === "ember"
                ? "rgba(244, 63, 94, 0.08)"
                : "rgba(236, 72, 153, 0.08)",
          }}
        >
          <h2 className="text-sm font-semibold tracking-tight text-bone">{title}</h2>
        </header>
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
              Длительность
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_DURATIONS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setHours(p.h)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs transition-colors",
                    hours === p.h
                      ? accent === "ember"
                        ? "border-ember bg-ember/15 text-ember"
                        : "border-flame bg-flame/15 text-flame"
                      : "border-border text-ash hover:border-plasma/40 hover:text-bone",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={24 * 365}
                value={hours ?? ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setHours(isNaN(v) ? null : v);
                }}
                placeholder="часов"
                className="h-8 w-32"
              />
              <span className="text-xs text-smoke">пусто = навсегда</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
              Причина (видно пользователю)
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={accent === "ember" ? "За что банишь?" : "За что мут?"}
              rows={3}
              maxLength={500}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onCancel} disabled={pending}>
              Отмена
            </Button>
            <Button
              variant={accent === "ember" ? "destructive" : "default"}
              onClick={onSubmit}
              disabled={pending}
            >
              {pending ? "Применяю…" : accent === "ember" ? "Забанить" : "Замьютить"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
