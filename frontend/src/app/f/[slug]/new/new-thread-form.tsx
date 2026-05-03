"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import type { Thread } from "@/lib/types";

export function NewThreadForm({ sectionSlug }: { sectionSlug: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await api<Thread>(`/sections/${encodeURIComponent(sectionSlug)}/threads`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body }),
      });
      router.push(`/t/${t.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      else setError("Не удалось создать тему");
      setSubmitting(false);
    }
  }

  const titleOk = title.trim().length >= 4 && title.trim().length <= 200;
  const bodyOk = body.trim().length >= 4;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="space-y-2">
        <label htmlFor="title" className="text-xs font-semibold uppercase tracking-widest text-smoke">
          Заголовок
        </label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="О чём тема?"
          maxLength={200}
          required
          autoFocus
        />
        <p className="text-[11px] text-smoke">
          {title.length}/200 · от 4 символов
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="body" className="text-xs font-semibold uppercase tracking-widest text-smoke">
          Сообщение
        </label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Распиши подробно. Поддерживаются переносы строк и > цитаты"
          rows={10}
          maxLength={20000}
          required
        />
        <p className="text-[11px] text-smoke">
          {body.length}/20000 · markdown в Phase 1
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={submitting}>
          Отмена
        </Button>
        <Button
          type="submit"
          variant="gradient"
          disabled={!titleOk || !bodyOk || submitting}
        >
          <Send className="h-4 w-4" />
          {submitting ? "Создаём…" : "Создать тему"}
        </Button>
      </div>

      {error && <p className="text-xs text-ember">{error}</p>}
    </form>
  );
}
