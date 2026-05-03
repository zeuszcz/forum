"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Coffee,
  Eye,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Pencil,
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
import { MentionTextarea } from "@/components/forum/MentionTextarea";
import { PostBody } from "@/components/forum/PostBody";
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
  const [tab, setTab] = useState<"compose" | "preview">("compose");

  const Icon = ICONS[section.icon] ?? MessageSquare;
  const sectionAccent = ACCENTS[section.accent] ?? "text-plasma";

  const titleOk = title.trim().length >= TITLE_MIN && title.length <= TITLE_MAX;
  const bodyOk = body.trim().length >= BODY_MIN && body.length <= BODY_MAX;
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

      {/* === Compose / Preview tabs === */}
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <header className="flex border-b border-border">
          <TabBtn
            active={tab === "compose"}
            onClick={() => setTab("compose")}
            icon={Pencil}
          >
            Текст
          </TabBtn>
          <TabBtn
            active={tab === "preview"}
            onClick={() => setTab("preview")}
            icon={Eye}
            disabled={body.trim().length < 1}
          >
            Превью
          </TabBtn>
          <div className="ml-auto flex items-center gap-3 px-4 text-[11px] text-smoke">
            <span>
              {bodyOk ? (
                <span className="text-success">✓</span>
              ) : (
                <span>от {BODY_MIN} символов</span>
              )}
            </span>
            <span className="font-mono">
              {body.length}/{BODY_MAX}
            </span>
          </div>
        </header>

        {tab === "compose" ? (
          <div className="p-4">
            <MentionTextarea
              value={body}
              onChange={setBody}
              placeholder="Распиши подробно — @упоминай людей, переносы строк сохраняются…"
              rows={12}
              maxLength={BODY_MAX}
              required
              className="resize-y border-0 bg-transparent text-[15px] leading-relaxed focus-visible:ring-0"
            />
            <p className="mt-2 text-[11px] text-smoke">
              переносы строк сохраняются · ссылки автокликабельны · @ник — упомянуть
            </p>
          </div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="bg-void/30 p-5 min-h-[280px]"
          >
            {body.trim() ? (
              <PostBody body={body} />
            ) : (
              <p className="text-center text-sm text-smoke">
                Сначала напиши что-нибудь во вкладке «Текст»
              </p>
            )}
          </motion.div>
        )}
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

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        active ? "text-bone" : "text-ash hover:text-bone",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
      {active && (
        <motion.span
          layoutId="thread-tab-bg"
          className="absolute inset-x-3 bottom-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgb(var(--plasma-rgb)), transparent)",
          }}
        />
      )}
    </button>
  );
}
