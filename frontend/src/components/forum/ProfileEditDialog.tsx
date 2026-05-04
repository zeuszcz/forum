"use client";

import { motion } from "framer-motion";
import { Check, Lock, Pencil, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { hasPerk } from "@/lib/perks";
import { computeRank } from "@/lib/rank";
import type { UserPublic } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProfileEditButton({ user }: { user: UserPublic }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Редактировать
      </Button>
      {open && <ProfileEditDialog user={user} onClose={() => setOpen(false)} />}
    </>
  );
}

function ProfileEditDialog({
  user,
  onClose,
}: {
  user: UserPublic;
  onClose: () => void;
}) {
  const router = useRouter();
  const { refresh: refreshAuth } = useAuth();
  // Hold a live copy of the current user so perk gates reflect the latest
  // granted_perks even if the prop is stale (e.g. admin revoked elsewhere).
  const [me, setMe] = useState<UserPublic>(user);
  const [bio, setBio] = useState(user.bio ?? "");
  const [title, setTitle] = useState(user.title ?? "");
  const [birthday, setBirthday] = useState(user.birthday ?? "");
  const [nickColor, setNickColor] = useState(user.nick_color ?? "");
  const [glowColor, setGlowColor] = useState(user.avatar_glow_color ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, hit /auth/me to grab fresh granted_perks / level / colors.
  useEffect(() => {
    let cancelled = false;
    api<UserPublic>("/auth/me")
      .then((fresh) => {
        if (cancelled) return;
        setMe(fresh);
        // Sync editable fields if the latest copy differs from the prop
        setBio(fresh.bio ?? "");
        setTitle(fresh.title ?? "");
        setBirthday(fresh.birthday ?? "");
        setNickColor(fresh.nick_color ?? "");
        setGlowColor(fresh.avatar_glow_color ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rank = computeRank(me.total_posts, me.total_reactions_received);
  // Gates are perk-honest: only granted_perks or unlocked level qualify.
  // Staff role does NOT auto-bypass — admins must grant themselves the
  // perk explicitly (or hit the level) to use these visual customisations.
  const titleUnlocked = hasPerk(me, "custom_title");
  const nickColorUnlocked = hasPerk(me, "glow_nick");
  const glowColorUnlocked = hasPerk(me, "animated_frame");

  async function save() {
    setPending(true);
    setError(null);
    try {
      const body: Record<string, string | null> = {
        bio: bio.trim() || null,
        birthday: birthday.trim() || "",
      };
      if (titleUnlocked) body.title = title.trim() || null;
      if (nickColorUnlocked) body.nick_color = nickColor.trim() || "";
      if (glowColorUnlocked) body.avatar_glow_color = glowColor.trim() || "";
      await api<UserPublic>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      // Refresh both the RSC tree (server data) AND auth-context so client-side
      // components like PersonalCard pick up the new nick/glow color immediately.
      await refreshAuth().catch(() => {});
      router.refresh();
      toast.success("Профиль обновлён");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  return (
    <div role="dialog" aria-label="Редактировать профиль" className="fixed inset-0 z-[80] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 flex max-h-[90vh] w-[94vw] max-w-3xl flex-col overflow-hidden rounded-xl glass-strong"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-bone">
            Редактировать профиль
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-smoke transition-colors hover:bg-slate hover:text-bone"
            aria-label="Закрыть"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
              О себе (bio)
            </label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={1024}
              placeholder="Несколько слов о себе. Будет видно на странице профиля."
            />
            <p className="text-[10px] text-smoke">{bio.length}/1024</p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="profile-bday"
              className="text-[10px] font-semibold uppercase tracking-widest text-smoke"
            >
              День рождения
            </label>
            <Input
              id="profile-bday"
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              min="1920-01-01"
              className="h-10"
            />
            <p className="text-[10px] text-smoke">
              месяц+день в виджете ДР — год скрыт
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
                Кастомный титул
              </label>
              {titleUnlocked ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-plasma">
                  <Sparkles className="h-3 w-3" />
                  доступно
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-smoke">
                  <Lock className="h-3 w-3" />
                  с lvl 25 ({rank.level})
                </span>
              )}
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Текст под ником (1 строка)"
              disabled={!titleUnlocked}
              className={cn("h-10", !titleUnlocked && "cursor-not-allowed opacity-50")}
            />
            <p className="text-[10px] text-smoke">
              {titleUnlocked
                ? `${title.length}/80`
                : "Откроется на lvl 25 или от админа"}
            </p>
          </div>

          <SteamRow user={me} onUnlink={() => setMe({ ...me, steam_id: null })} />

          <ColorPickerRow
            label="Цвет свечения ника"
            value={nickColor}
            onChange={setNickColor}
            unlocked={nickColorUnlocked}
            unlockHint={`Откроется на lvl 50 (Свечение ника) — сейчас ${rank.level}`}
            preview={(c) => (
              <span
                className="font-bold"
                style={{ color: c || (me.roles?.[0]?.color ?? "#e8e9f3") }}
              >
                {me.nickname}
              </span>
            )}
          />

          <ColorPickerRow
            label="Цвет свечения аватара"
            value={glowColor}
            onChange={setGlowColor}
            unlocked={glowColorUnlocked}
            unlockHint={`Откроется на lvl 15 (Свечение аватара) — сейчас ${rank.level}`}
            preview={(c) => (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="h-7 w-7 rounded-full bg-slate text-center text-[10px] font-bold leading-7 text-bone">
                    {me.nickname[0]?.toUpperCase()}
                  </div>
                  {c && (
                    <div
                      aria-hidden="true"
                      className="absolute -inset-0.5 -z-10 rounded-full opacity-70 blur-md"
                      style={{ backgroundColor: c }}
                    />
                  )}
                </div>
                <span className="text-[11px] text-smoke">
                  {c ? "свечение активно" : "без свечения"}
                </span>
              </div>
            )}
          />

          {error && (
            <p className="md:col-span-2 rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-xs text-ember">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/5 bg-background/30 px-5 py-3 backdrop-blur-sm">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button variant="gradient" onClick={save} disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function ColorPickerRow({
  label,
  value,
  onChange,
  unlocked,
  unlockHint,
  preview,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unlocked: boolean;
  unlockHint: string;
  preview: (color: string) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
          {label}
        </label>
        {unlocked ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-plasma">
            <Sparkles className="h-3 w-3" />
            доступно
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-smoke">
            <Lock className="h-3 w-3" />
            закрыто
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#7c5cff"}
          onChange={(e) => onChange(e.target.value)}
          disabled={!unlocked}
          className={cn(
            "h-10 w-14 cursor-pointer rounded-md border border-border bg-void",
            !unlocked && "cursor-not-allowed opacity-40",
          )}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#7c5cff"
          maxLength={9}
          disabled={!unlocked}
          className={cn(
            "h-10 font-mono",
            !unlocked && "cursor-not-allowed opacity-50",
          )}
        />
        {value && unlocked && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-md border border-border bg-void px-2 py-1 text-[10px] uppercase tracking-widest text-smoke transition-colors hover:bg-slate hover:text-bone"
          >
            сбросить
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-void/40 px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-smoke">
          превью
        </span>
        {preview(value)}
      </div>
      {!unlocked && (
        <p className="text-[10px] text-smoke">{unlockHint}</p>
      )}
    </div>
  );
}

function SteamRow({
  user,
  onUnlink,
}: {
  user: UserPublic;
  onUnlink: () => void;
}) {
  const [pending, setPending] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  async function unlink() {
    setPending(true);
    try {
      await api("/auth/steam/unlink", { method: "POST" });
      toast.success("Steam отвязан");
      onUnlink();
    } catch {
      toast.error("Не удалось отвязать");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 md:col-span-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
          Steam
        </label>
        {user.steam_id ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-success">
            <Check className="h-3 w-3" />
            привязан
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 rounded-md border border-border bg-void/40 px-3 py-2">
        {user.steam_id ? (
          <>
            <span className="font-mono text-xs text-bone">{user.steam_id}</span>
            <a
              href={`https://steamcommunity.com/profiles/${user.steam_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-[11px] text-cyan hover:underline"
            >
              профиль ↗
            </a>
            <button
              type="button"
              onClick={unlink}
              disabled={pending}
              className="rounded-md border border-border bg-void px-2 py-1 text-[10px] uppercase tracking-widest text-smoke transition-colors hover:bg-slate hover:text-bone"
            >
              отвязать
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-xs text-smoke">
              Привяжи Steam, чтобы получить бейдж и доступ к ежедневным заданиям.
            </span>
            <a
              href={`${apiBase}/auth/steam/init`}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/10 px-3 py-1.5 text-xs font-semibold text-cyan transition-colors hover:bg-cyan/20"
            >
              <svg
                viewBox="0 0 32 32"
                className="h-4 w-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M16 0C7.18 0 0 7.18 0 16s7.18 16 16 16 16-7.18 16-16S24.82 0 16 0zm-1.5 12l-4.62 4.65 4.34 1.85a4 4 0 0 1 4.5-1.5l5.78-4.31A4.93 4.93 0 1 1 23.43 18l-5.27 3.78a3.6 3.6 0 0 1-3.69 4.27 3.66 3.66 0 0 1-3.55-2.69l-3.4-1.45a8 8 0 0 0 1.27 1.95 8.5 8.5 0 1 0 5.71-11.86z" />
              </svg>
              Привязать Steam
            </a>
          </>
        )}
      </div>
    </div>
  );
}
