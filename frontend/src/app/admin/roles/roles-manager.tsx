"use client";

import { Lock, Plus, Save, Shield, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import type { RoleAdminRead } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROTECTED = new Set(["owner", "admin", "member"]);

const PRESET_COLORS = [
  "#ec4899",
  "#a855f7",
  "#7c5cff",
  "#22d3ee",
  "#34d399",
  "#fbbf24",
  "#f43f5e",
  "#a0a3b8",
];

export function RolesManager({ initialRoles }: { initialRoles: RoleAdminRead[] }) {
  const [roles, setRoles] = useState<RoleAdminRead[]>(initialRoles);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      const next = await api<RoleAdminRead[]>("/admin/roles");
      setRoles(next);
    } catch {
      // ignore — already showed toast
    }
  }

  async function handleCreate(payload: {
    slug: string;
    title: string;
    color: string;
    is_staff: boolean;
    display_order: number;
  }) {
    try {
      const created = await api<RoleAdminRead>("/admin/roles", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success(`Роль ${created.slug} создана`);
      setCreating(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Не удалось создать");
    }
  }

  async function handleUpdate(slug: string, patch: Partial<RoleAdminRead>) {
    try {
      await api<RoleAdminRead>(`/admin/roles/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      toast.success(`${slug} обновлён`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Не удалось обновить");
    }
  }

  async function handleDelete(slug: string) {
    if (!confirm(`Удалить роль "${slug}"? Все назначения этой роли пользователям также удалятся.`)) {
      return;
    }
    try {
      await api(`/admin/roles/${encodeURIComponent(slug)}`, { method: "DELETE" });
      toast.success(`${slug} удалён`);
      setRoles((rs) => rs.filter((r) => r.slug !== slug));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Не удалось удалить");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        {!creating && (
          <Button variant="gradient" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Новая роль
          </Button>
        )}
      </div>

      {creating && (
        <CreateRoleForm onCancel={() => setCreating(false)} onSubmit={handleCreate} />
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-void/60 text-[10px] uppercase tracking-widest text-smoke">
            <tr>
              <th className="px-3 py-2.5 text-left">Slug</th>
              <th className="px-3 py-2.5 text-left">Название</th>
              <th className="px-3 py-2.5 text-left">Цвет</th>
              <th className="px-3 py-2.5 text-left">Staff</th>
              <th className="px-3 py-2.5 text-left">Order</th>
              <th className="px-3 py-2.5 text-left">Юзеров</th>
              <th className="px-3 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {roles.map((r) => (
              <RoleRow
                key={r.id}
                role={r}
                onUpdate={(patch) => handleUpdate(r.slug, patch)}
                onDelete={() => handleDelete(r.slug)}
                protected={PROTECTED.has(r.slug)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleRow({
  role,
  onUpdate,
  onDelete,
  protected: isProtected,
}: {
  role: RoleAdminRead;
  onUpdate: (patch: Partial<RoleAdminRead>) => Promise<void>;
  onDelete: () => Promise<void>;
  protected: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(role.title);
  const [color, setColor] = useState(role.color);
  const [isStaff, setIsStaff] = useState(role.is_staff);
  const [order, setOrder] = useState(role.display_order);

  async function save() {
    const patch: Partial<RoleAdminRead> = {};
    if (title !== role.title) patch.title = title;
    if (color !== role.color) patch.color = color;
    if (isStaff !== role.is_staff) patch.is_staff = isStaff;
    if (order !== role.display_order) patch.display_order = order;
    if (Object.keys(patch).length > 0) await onUpdate(patch);
    setEditing(false);
  }

  return (
    <tr className="transition-colors hover:bg-void/40">
      <td className="px-3 py-2 font-mono text-xs">
        {role.slug}
        {isProtected && (
          <Lock className="ml-1 inline h-3 w-3 text-smoke" aria-label="protected" />
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 w-32"
            maxLength={64}
          />
        ) : (
          <span style={{ color: role.color }} className="font-semibold">
            {role.title}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-6 w-6 rounded-md border border-border"
              style={{ background: color }}
            />
            <Input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-24 font-mono text-[11px]"
            />
            <div className="flex gap-0.5">
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-5 w-5 rounded-sm border border-border transition-transform hover:scale-110"
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 rounded border border-border"
              style={{ background: role.color }}
            />
            <span className="font-mono text-xs text-smoke">{role.color}</span>
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={isStaff}
              onChange={(e) => setIsStaff(e.target.checked)}
              className="accent-plasma"
            />
            staff
          </label>
        ) : role.is_staff ? (
          <span className="inline-flex items-center gap-1 text-xs text-plasma">
            <Shield className="h-3 w-3" /> staff
          </span>
        ) : (
          <span className="text-xs text-smoke">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <Input
            type="number"
            value={order}
            onChange={(e) => setOrder(parseInt(e.target.value, 10) || 0)}
            className="h-8 w-20"
            min={0}
            max={9999}
          />
        ) : (
          <span className="font-mono text-xs text-ash">{role.display_order}</span>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-ash">{role.member_count}</td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <div className="inline-flex gap-1">
            <button
              type="button"
              onClick={save}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-plasma/40 bg-plasma/10 px-2 text-xs text-plasma transition-colors hover:bg-plasma/20"
            >
              <Save className="h-3 w-3" />
              ок
            </button>
            <button
              type="button"
              onClick={() => {
                setTitle(role.title);
                setColor(role.color);
                setIsStaff(role.is_staff);
                setOrder(role.display_order);
                setEditing(false);
              }}
              className="inline-flex h-7 items-center rounded-md px-2 text-xs text-smoke transition-colors hover:bg-slate hover:text-bone"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="inline-flex gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md px-2 py-1 text-xs text-ash transition-colors hover:bg-slate hover:text-bone"
            >
              edit
            </button>
            {!isProtected && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md p-1 text-ember transition-colors hover:bg-ember/10"
                aria-label="Удалить"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function CreateRoleForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (payload: {
    slug: string;
    title: string;
    color: string;
    is_staff: boolean;
    display_order: number;
  }) => Promise<void>;
}) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#7c5cff");
  const [isStaff, setIsStaff] = useState(false);
  const [order, setOrder] = useState(100);
  const [pending, setPending] = useState(false);

  const slugValid = /^[a-z0-9][a-z0-9_-]{1,31}$/.test(slug);
  const titleValid = title.trim().length >= 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slugValid || !titleValid || pending) return;
    setPending(true);
    try {
      await onSubmit({
        slug,
        title: title.trim(),
        color,
        is_staff: isStaff,
        display_order: order,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-plasma/30 bg-plasma/5 p-4"
    >
      <div className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto_auto_auto_auto]">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-smoke">slug</label>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="vip-сlub"
            className={cn("h-8 font-mono", !slugValid && slug && "border-ember/50")}
            required
            maxLength={32}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-smoke">название</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VIP-клуб"
            className="h-8"
            required
            maxLength={64}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-smoke">цвет</label>
          <div className="flex items-center gap-1.5">
            <span
              className="h-8 w-8 shrink-0 rounded border border-border"
              style={{ background: color }}
            />
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-24 font-mono text-[11px]"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-widest text-smoke">order</label>
          <Input
            type="number"
            value={order}
            onChange={(e) => setOrder(parseInt(e.target.value, 10) || 0)}
            className="h-8 w-20"
            min={0}
            max={9999}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-widest text-smoke">staff</label>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-void px-2.5 text-xs">
            <input
              type="checkbox"
              checked={isStaff}
              onChange={(e) => setIsStaff(e.target.checked)}
              className="accent-plasma"
            />
            staff
          </label>
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-widest text-smoke">&nbsp;</label>
          <div className="flex gap-1">
            <Button
              type="submit"
              size="sm"
              variant="gradient"
              disabled={!slugValid || !titleValid || pending}
            >
              {pending ? "…" : "Создать"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1">
        {PRESET_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => setColor(c)}
            className="h-5 w-5 rounded-sm border border-border transition-transform hover:scale-110"
            style={{ background: c }}
            aria-label={c}
          />
        ))}
      </div>
      {!slugValid && slug && (
        <p className="mt-2 text-[11px] text-ember">
          slug: 2-32 символа, латиница/цифры/_/-, не начинается с дефиса
        </p>
      )}
    </form>
  );
}
