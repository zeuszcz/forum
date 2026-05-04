"use client";

import {
  AlertTriangle,
  Coffee,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Send,
  Shield,
  Sparkles,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { MeshBackground } from "@/components/effects/MeshBackground";
import { RichEditor } from "@/components/forum/RichEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { nickColor } from "@/lib/perks";
import { useAuth } from "@/lib/auth-context";
import type { Section, Thread } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "message-square": MessageSquare,
  megaphone: Megaphone,
  shield: Shield,
  "alert-triangle": AlertTriangle,
  "user-check": UserCheck,
  lightbulb: Lightbulb,
  coffee: Coffee,
};

const ACCENTS: Record<string, string> = {
  plasma: "text-plasma",
  flame: "text-flame",
  cyan: "text-cyan",
  ember: "text-ember",
};

const TITLE_MIN = 4;
const TITLE_MAX = 200;
const BODY_MIN = 4;
const BODY_MAX = 20000;

export function NewThreadForm({ section }: { section: Section }) {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const Icon = ICONS[section.icon] ?? MessageSquare;
  const sectionAccent = ACCENTS[section.accent] ?? "text-plasma";

  const titleOk = title.trim().length >= TITLE_MIN && title.length <= TITLE_MAX;
  // TipTap stores HTML — measure plain-text length for the min-content check.
  const bodyText = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const bodyOk = bodyText.length >= BODY_MIN && body.length <= BODY_MAX;
  const canSubmit = titleOk && bodyOk && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await api<Thread>(
        `/sections/${encodeURIComponent(section.slug)}/threads`,
        {
          method: "POST",
          body: JSON.stringify({ title: title.trim(), body }),
        },
      );
      toast.success("Тема создана");
      router.push(`/t/${t.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      else setError("Не удалось создать тему");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* === Hero card === */}
      <section className="relative overflow-hidden rounded-2xl border-2 border-plasma/30 bg-card">
        <div className="absolute inset-0 -z-10">
          <MeshBackground />
        </div>
        <div className="dotted-grid pointer-events-none absolute inset-0 -z-[5] opacity-30" />

        <div className="relative px-5 py-6 md:px-8 md:py-7">
          {/* Section context */}
          <div className="mb-5 inline-flex items-center gap-3 rounded-md border border-border bg-card/60 px-3 py-2 backdrop-blur-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-slate">
              <Icon className={cn("h-4 w-4", sectionAccent)} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-smoke">
                раздел
              </div>
              <div className="text-sm font-semibold text-bone">{section.title}</div>
            </div>
          </div>

          {/* Big title input */}
          <label
            htmlFor="thread-title"
            className="block text-[10px] font-semibold uppercase tracking-widest text-smoke"
          >
            Заголовок темы
          </label>
          <Input
            id="thread-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="О чём твоя тема? Кратко и по делу"
            maxLength={TITLE_MAX}
            required
            autoFocus
            className="mt-2 h-12 border-0 bg-void/40 px-3 text-xl font-bold text-bone placeholder:text-smoke focus-visible:ring-2 focus-visible:ring-plasma/40 md:text-2xl"
          />
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-smoke">
            <span>
              {titleOk ? (
                <span className="text-success">✓ норм</span>
              ) : title.length === 0 ? (
                <span>от {TITLE_MIN} символов</span>
              ) : (
                <span className="text-flame">
                  ещё {Math.max(0, TITLE_MIN - title.trim().length)} символ(ов)
                </span>
              )}
            </span>
            <span className="font-mono">
              {title.length}/{TITLE_MAX}
            </span>
          </div>

          {/* Author hint */}
          {user && (
            <div className="mt-4 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-smoke">
              <Sparkles className="h-2.5 w-2.5 text-plasma" />
              автор —{" "}
              <span
                className="font-semibold"
                style={{ color: nickColor(user) }}
              >
                {user.nickname}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* === WYSIWYG editor — what you see is what posts === */}
      <section className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-smoke">
          <span className="font-semibold uppercase tracking-widest">текст темы</span>
          <span className="flex items-center gap-3">
            {bodyOk ? (
              <span className="text-success">✓ норм</span>
            ) : (
              <span>от {BODY_MIN} символов</span>
            )}
            <span className="font-mono">
              {bodyText.length}/{BODY_MAX}
            </span>
          </span>
        </div>
        <RichEditor
          value={body}
          onChange={setBody}
          placeholder="Распиши подробно — выдели текст и используй панель сверху для оформления"
          minHeight={280}
        />
        <p className="text-[11px] text-smoke">
          форматирование сразу как будет выглядеть · картинки до 8МБ перетаскиванием на «📷» · таблицы по кнопке
        </p>
      </section>

      {/* === Submit row === */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Отмена
        </Button>
        <Button type="submit" variant="gradient" disabled={!canSubmit}>
          <Send className="h-4 w-4" />
          {submitting ? "Создаём…" : "Создать тему"}
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
          {error}
        </p>
      )}
    </form>
  );
}
