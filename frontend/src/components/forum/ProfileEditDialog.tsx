"use client";

import { motion } from "framer-motion";
import { Lock, Pencil, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { hasPerk, isStaff } from "@/lib/perks";
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
  const [bio, setBio] = useState(user.bio ?? "");
  const [title, setTitle] = useState(user.title ?? "");
  const [birthday, setBirthday] = useState(user.birthday ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rank = computeRank(user.total_posts, user.total_reactions_received);
  const titleUnlocked = isStaff(user) || rank.level >= 25 || hasPerk(user, "custom_title");

  async function save() {
    setPending(true);
    setError(null);
    try {
      const body: Record<string, string | null> = {
        bio: bio.trim() || null,
        birthday: birthday.trim() || "",
      };
      if (titleUnlocked) body.title = title.trim() || null;
      await api<UserPublic>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("Профиль обновлён");
      router.refresh();
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
        className="relative z-10 w-[92vw] max-w-lg overflow-hidden rounded-xl glass-strong"
      >
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
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

        <div className="space-y-5 p-5">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
              О себе (bio)
            </label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
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
              className="h-10 [color-scheme:dark]"
            />
            <p className="text-[10px] text-smoke">
              месяц + день показываются другим в виджете «Сегодня ДР» — год скрыт
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
                  с lvl 25 (сейчас {rank.level})
                </span>
              )}
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Свободный текст под ником (1 строка)"
              disabled={!titleUnlocked}
              className={cn(!titleUnlocked && "cursor-not-allowed opacity-50")}
            />
            <p className="text-[10px] text-smoke">
              {titleUnlocked
                ? `${title.length}/80`
                : "Откроется когда наберёшь 25 уровень или админ выдаст custom_title"}
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-xs text-ember">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-4">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Отмена
            </Button>
            <Button variant="gradient" onClick={save} disabled={pending}>
              {pending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
