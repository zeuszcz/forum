"use client";

import { motion } from "framer-motion";
import { ChevronLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const TATTOOS = [
  { emoji: "💀", name: "Череп", special: "Бросок ножа" },
  { emoji: "⚡", name: "Молния", special: "Рывок 5м" },
  { emoji: "🌹", name: "Роза", special: "Газ-паралич" },
  { emoji: "🔥", name: "Огонь", special: "Поджог DoT" },
  { emoji: "🐺", name: "Волк", special: "Ярость +50%" },
  { emoji: "🗡", name: "Кинжал", special: "Стелс 2с" },
  { emoji: "⚓", name: "Якорь", special: "Цепь-притяг" },
  { emoji: "☠", name: "Череп-2", special: "Жажда крови" },
  { emoji: "🦂", name: "Скорпион", special: "Яд 8с" },
  { emoji: "🐍", name: "Змея", special: "Уклонение I-frame" },
  { emoji: "🃏", name: "Джокер", special: "Случайный" },
  { emoji: "👁", name: "Глаз", special: "Прозрение" },
];

type EventPublic = {
  id: number;
  season: string;
  status: string;
  registered_count: number;
  is_signed_up: boolean;
};

export default function PrisonBreakSignupPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<EventPublic | null>(null);
  const [nickname, setNickname] = useState("");
  const [tattoo, setTattoo] = useState<string | null>(null);
  const [article, setArticle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push("/login?next=/event/prison-break/signup");
      return;
    }
    void api<{ event: EventPublic | null }>("/api/event/prison-break/status").then((r) => {
      setEvent(r.event);
      if (r.event?.is_signed_up) {
        router.push("/event/prison-break");
      }
    });
  }, [user, router]);

  const submit = async () => {
    if (!tattoo) {
      toast.error("Выбери татуировку");
      return;
    }
    if (nickname.trim().length < 2) {
      toast.error("Прозвище должно быть от 2 символов");
      return;
    }
    setSubmitting(true);
    try {
      await api("/api/event/prison-break/signup", {
        method: "POST",
        body: JSON.stringify({ nickname, tattoo, article }),
      });
      toast.success("Ты в игре. Жди начала сезона.");
      router.push("/event/prison-break");
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("Не удалось зарегаться");
    } finally {
      setSubmitting(false);
    }
  };

  if (!event) {
    return (
      <div className="container py-12 text-center text-smoke">Загрузка…</div>
    );
  }

  if (event.status !== "signup") {
    return (
      <div className="container py-12 text-center">
        <Lock className="mx-auto mb-3 h-10 w-10 text-smoke" />
        <h2 className="text-lg font-bold text-bone">
          Регистрация закрыта
        </h2>
        <p className="mt-2 text-sm text-smoke">
          {event.status === "active"
            ? "Сезон уже идёт. Жди следующего."
            : "Регистрация ещё не открыта."}
        </p>
        <Link
          href="/event/prison-break"
          className="mt-5 inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-xs uppercase tracking-widest text-smoke transition-colors hover:border-cyan/40 hover:text-bone"
        >
          <ChevronLeft className="h-3 w-3" />
          назад
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <Link
        href="/event/prison-break"
        className="mb-4 inline-flex items-center gap-1 text-xs text-smoke hover:text-bone"
      >
        <ChevronLeft className="h-3 w-3" />
        назад
      </Link>

      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-bone">Регистрация в тюрьму</h1>
        <p className="mt-1 text-sm text-smoke">
          Сезон {event.season} · {event.registered_count} человек уже села
        </p>
      </header>

      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mx-auto max-w-2xl space-y-6"
      >
        <div>
          <label className="mb-2 block text-xs uppercase tracking-widest text-smoke">
            Прозвище в тюрьме <span className="text-flame">*</span>
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={32}
            placeholder='например, "Чёрный Лом"'
            className="w-full rounded-md border border-border bg-void px-3 py-2.5 text-sm text-bone focus:border-cyan/40 focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-smoke">2-32 символа. Без `|` и переносов.</p>
        </div>

        <div>
          <label className="mb-2 block text-xs uppercase tracking-widest text-smoke">
            Кулак-татуировка <span className="text-flame">*</span>
          </label>
          <p className="mb-3 text-[10px] text-smoke">
            Каждая татуировка даёт уникальный special-move в Арене.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {TATTOOS.map((t) => (
              <button
                key={t.emoji}
                type="button"
                onClick={() => setTattoo(t.emoji)}
                className={cn(
                  "group flex flex-col items-center rounded-md border bg-void p-3 transition-colors",
                  tattoo === t.emoji
                    ? "border-flame/60 bg-flame/10"
                    : "border-border hover:border-cyan/40",
                )}
                title={`${t.name} · ${t.special}`}
              >
                <span className="text-2xl">{t.emoji}</span>
                <span className="mt-1 text-[10px] text-bone">{t.name}</span>
                <span className="text-[8px] text-cyan/70 group-hover:text-cyan">
                  {t.special}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs uppercase tracking-widest text-smoke">
            Любимая статья (необязательно)
          </label>
          <input
            type="text"
            value={article}
            onChange={(e) => setArticle(e.target.value)}
            maxLength={80}
            placeholder='флавор-текст: "за дезу"'
            className="w-full rounded-md border border-border bg-void px-3 py-2.5 text-sm text-bone focus:border-cyan/40 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !tattoo || nickname.trim().length < 2}
          className="w-full rounded-md border border-flame/40 bg-flame/15 py-3 text-sm font-bold uppercase tracking-widest text-flame transition-colors hover:bg-flame/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "ждём канцелярию…" : "сесть в тюрьму"}
        </button>
      </motion.form>
    </div>
  );
}
