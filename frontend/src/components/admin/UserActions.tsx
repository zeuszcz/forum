"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "framer-motion";
import {
  Ban,
  Check,
  Key,
  KeyRound,
  Lock,
  MicOff,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Unlock,
  Voicemail,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { GRANTABLE_PERKS, type AdminUserRead, type RoleAdminRead } from "@/lib/types";
import { cn } from "@/lib/utils";

interface UserActionsProps {
  user: AdminUserRead;
}

type Dialog = "ban" | "mute" | "roles" | "perks" | "keys" | null;

const PRESET_DURATIONS = [
  { label: "1ч", h: 1 },
  { label: "24ч", h: 24 },
  { label: "7д", h: 24 * 7 },
  { label: "30д", h: 24 * 30 },
  { label: "навсегда", h: null },
];

export function UserActions({ user }: UserActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState<number | null>(24);
  const [pending, setPending] = useState(false);
  const [allRoles, setAllRoles] = useState<RoleAdminRead[]>([]);
  const userRoleSlugs = new Set((user.roles ?? []).map((r) => r.slug));

  function close() {
    setDialog(null);
    setReason("");
    setHours(24);
  }

  // Lazy-load roles list when dialog="roles" first opens
  useEffect(() => {
    if (dialog !== "roles" || allRoles.length > 0) return;
    api<RoleAdminRead[]>("/admin/roles")
      .then(setAllRoles)
      .catch(() => toast.error("Не удалось загрузить роли"));
  }, [dialog, allRoles.length]);

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
      toast.error(err instanceof ApiError ? err.detail : "Не удалось");
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
      reason: null,
    });
    toast(
      next
        ? `${user.nickname} снова может создавать темы`
        : `${user.nickname} больше не может создавать темы`,
    );
  }

  async function toggleRole(slug: string) {
    if (userRoleSlugs.has(slug)) {
      await call(`/admin/users/${user.id}/role/${encodeURIComponent(slug)}`, undefined, "DELETE");
      toast(`Снята роль ${slug}`);
    } else {
      await call(`/admin/users/${user.id}/role/${encodeURIComponent(slug)}`);
      toast.success(`Выдана роль ${slug}`);
    }
  }

  async function applyPerks(perks: string[]) {
    await call(`/admin/users/${user.id}/perks`, { perks });
    toast.success(`Перки обновлены: ${perks.length || "—"}`);
    close();
  }

  async function applyKeys(amount: number, reasonText: string) {
    await call(`/admin/users/${user.id}/keys`, { amount, reason: reasonText || null });
    const sign = amount > 0 ? "+" : "";
    toast.success(`Ключи: ${sign}${amount}`);
    close();
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
              className="w-60 overflow-hidden rounded-lg glass-strong shadow-xl"
            >
              {user.is_banned ? (
                <Item icon={ShieldCheck} onSelect={unban} accent="cyan" disabled={pending}>
                  Разбанить
                </Item>
              ) : (
                <Item icon={Ban} onSelect={() => setDialog("ban")} accent="ember" disabled={pending}>
                  Забанить…
                </Item>
              )}
              {user.is_muted ? (
                <Item icon={Voicemail} onSelect={unmute} accent="cyan" disabled={pending}>
                  Размьютить
                </Item>
              ) : (
                <Item icon={MicOff} onSelect={() => setDialog("mute")} accent="flame" disabled={pending}>
                  Замьютить…
                </Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-white/5" />
              <Item icon={KeyRound} onSelect={() => setDialog("roles")} disabled={pending}>
                Управление ролями…
              </Item>
              <Item icon={Sparkles} onSelect={() => setDialog("perks")} disabled={pending}>
                Выдать перки…
              </Item>
              <Item icon={Key} onSelect={() => setDialog("keys")} disabled={pending}>
                Ключи кейсов…
                {(user.case_keys ?? 0) > 0 && (
                  <span className="ml-auto font-mono text-[10px] text-flame">
                    {user.case_keys}
                  </span>
                )}
              </Item>
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

      {(dialog === "ban" || dialog === "mute") && (
        <RestrictionDialog
          title={dialog === "ban" ? `Бан ${user.nickname}` : `Мьют ${user.nickname}`}
          accent={dialog === "ban" ? "ember" : "flame"}
          reason={reason}
          setReason={setReason}
          hours={hours}
          setHours={setHours}
          pending={pending}
          onCancel={close}
          onSubmit={dialog === "ban" ? applyBan : applyMute}
        />
      )}

      {dialog === "roles" && (
        <RolesDialog
          user={user}
          allRoles={allRoles}
          userRoleSlugs={userRoleSlugs}
          pending={pending}
          onToggle={toggleRole}
          onClose={close}
        />
      )}

      {dialog === "keys" && (
        <KeysDialog
          user={user}
          pending={pending}
          onApply={applyKeys}
          onClose={close}
        />
      )}

      {dialog === "perks" && (
        <PerksDialog
          user={user}
          pending={pending}
          onApply={applyPerks}
          onClose={close}
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

function ModalShell({
  title,
  accent = "plasma",
  onClose,
  children,
}: {
  title: string;
  accent?: "plasma" | "ember" | "flame";
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div role="dialog" aria-label={title} className="fixed inset-0 z-[80] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 w-[92vw] max-w-md overflow-hidden rounded-xl glass-strong"
      >
        <header
          className="flex items-center justify-between border-b border-white/5 px-5 py-3"
          style={{
            background:
              accent === "ember"
                ? "rgba(244, 63, 94, 0.08)"
                : accent === "flame"
                  ? "rgba(236, 72, 153, 0.08)"
                  : "rgba(124, 92, 255, 0.08)",
          }}
        >
          <h2 className="text-sm font-semibold tracking-tight text-bone">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-smoke transition-colors hover:bg-slate hover:text-bone"
            aria-label="Закрыть"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        {children}
      </motion.div>
    </div>
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
    <ModalShell title={title} accent={accent} onClose={onCancel}>
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
    </ModalShell>
  );
}

function RolesDialog({
  user,
  allRoles,
  userRoleSlugs,
  pending,
  onToggle,
  onClose,
}: {
  user: AdminUserRead;
  allRoles: RoleAdminRead[];
  userRoleSlugs: Set<string>;
  pending: boolean;
  onToggle: (slug: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <ModalShell title={`Роли ${user.nickname}`} accent="plasma" onClose={onClose}>
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {allRoles.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-smoke">Загружаю…</div>
        ) : (
          <ul className="space-y-1">
            {allRoles.map((role) => {
              const has = userRoleSlugs.has(role.slug);
              return (
                <li key={role.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(role.slug)}
                    disabled={pending}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-50",
                      has
                        ? "border-plasma/40 bg-plasma/10"
                        : "border-border bg-card hover:border-plasma/40 hover:bg-slate",
                    )}
                  >
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
                      style={{
                        backgroundColor: has ? `${role.color}30` : "transparent",
                        border: has ? `1px solid ${role.color}` : "1px solid #2a2a35",
                      }}
                    >
                      {has && <Check className="h-3 w-3" style={{ color: role.color }} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className="block text-sm font-semibold"
                        style={{ color: role.color }}
                      >
                        {role.title}
                      </span>
                      <span className="block font-mono text-[10px] text-smoke">
                        {role.slug}
                        {role.is_staff && " · staff"}
                        {(role.can_ban || role.can_mute || role.can_manage_threads ||
                          role.can_manage_users || role.can_manage_roles ||
                          role.can_grant_perks || role.can_view_audit) && (
                          <span className="ml-1 text-plasma">· перм</span>
                        )}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-smoke">
                      {role.member_count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-white/5 bg-void/40 px-5 py-2.5 text-[11px] text-smoke">
        <span>клик — переключить</span>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          Готово
        </Button>
      </div>
    </ModalShell>
  );
}

function PerksDialog({
  user,
  pending,
  onApply,
  onClose,
}: {
  user: AdminUserRead;
  pending: boolean;
  onApply: (perks: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const initial = useRef(user.granted_perks ?? []);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial.current));

  function toggle(slug: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const dirty =
    selected.size !== initial.current.length ||
    [...selected].some((p) => !initial.current.includes(p));

  return (
    <ModalShell title={`Перки ${user.nickname}`} accent="plasma" onClose={onClose}>
      <div className="space-y-3 p-5">
        <p className="text-xs text-smoke">
          Выданные перки <span className="text-ash">обходят level-gate</span>. Например, юзер lvl 1
          с перком <code className="font-mono text-plasma">custom_title</code> сможет поставить кастомный титул, не дожидаясь lvl 25.
        </p>
        <ul className="space-y-1.5">
          {GRANTABLE_PERKS.map((p) => {
            const has = selected.has(p.slug);
            return (
              <li key={p.slug}>
                <button
                  type="button"
                  onClick={() => toggle(p.slug)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                    has
                      ? "border-plasma/40 bg-plasma/10"
                      : "border-border bg-card hover:border-plasma/40 hover:bg-slate",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border",
                      has
                        ? "border-plasma bg-plasma/20 text-plasma"
                        : "border-border text-smoke",
                    )}
                  >
                    {has ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-bone">{p.label}</span>
                    <span className="mt-0.5 block text-xs text-smoke">{p.description}</span>
                  </span>
                  <span className="font-mono text-[10px] text-smoke">{p.slug}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-white/5 bg-void/40 px-5 py-3">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button
          variant="gradient"
          onClick={() => onApply([...selected])}
          disabled={!dirty || pending}
        >
          {pending ? "Применяю…" : "Сохранить"}
        </Button>
      </div>
    </ModalShell>
  );
}

function KeysDialog({
  user,
  pending,
  onApply,
  onClose,
}: {
  user: AdminUserRead;
  pending: boolean;
  onApply: (amount: number, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState<number>(1);
  const [reason, setReason] = useState("");

  const presets = [1, 3, 5, 10, -1];

  return (
    <ModalShell
      title={`Ключи кейсов ${user.nickname}`}
      accent="flame"
      onClose={onClose}
    >
      <div className="space-y-4 p-5">
        <div className="rounded-md border border-flame/30 bg-flame/5 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
              сейчас у юзера
            </span>
            <span className="font-mono text-2xl font-bold text-flame">
              {user.case_keys ?? 0}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-smoke">
            Положительное число — выдать ключи. Отрицательное — отозвать
            (списываются самые старые невыпотраченные).
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
            Количество (±)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(n)}
                className={cn(
                  "rounded-md border px-3 py-1.5 font-mono text-xs transition-colors",
                  amount === n
                    ? n < 0
                      ? "border-ember bg-ember/15 text-ember"
                      : "border-flame bg-flame/15 text-flame"
                    : "border-border bg-card text-ash hover:border-flame/40 hover:bg-flame/5",
                )}
              >
                {n > 0 ? `+${n}` : n}
              </button>
            ))}
          </div>
          <Input
            type="number"
            value={amount}
            onChange={(e) => {
              const v = parseInt(e.target.value || "0", 10);
              setAmount(Math.max(-100, Math.min(100, isNaN(v) ? 0 : v)));
            }}
            min={-100}
            max={100}
            className="font-mono"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
            Причина (опционально)
          </label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={120}
            placeholder="напр. победа в розыгрыше, компенсация за бан…"
          />
          <p className="text-[10px] text-smoke">
            Сохраняется в moderation log + audit row user_keys.granted_for
          </p>
        </div>

        <div className="rounded-md border border-border bg-void/40 px-3 py-2 text-[11px] text-smoke">
          После применения у юзера станет:{" "}
          <span className="font-mono font-bold text-flame">
            {Math.max(0, (user.case_keys ?? 0) + amount)}
          </span>{" "}
          {amount < 0 && (user.case_keys ?? 0) + amount < 0 && (
            <span className="text-ember">
              (отзыв ограничен текущим балансом)
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-white/5 bg-void/40 px-5 py-3">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button
          variant="gradient"
          onClick={() => onApply(amount, reason)}
          disabled={amount === 0 || pending}
        >
          {pending
            ? "Применяю…"
            : amount > 0
              ? `Выдать +${amount}`
              : `Отозвать ${amount}`}
        </Button>
      </div>
    </ModalShell>
  );
}
