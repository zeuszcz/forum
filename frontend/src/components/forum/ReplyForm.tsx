"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useImperativeHandle, useState, forwardRef, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Post } from "@/lib/types";

export interface ReplyFormHandle {
  insertQuote: (post: Post) => void;
  focus: () => void;
}

interface ReplyFormProps {
  threadId: number;
  threadLocked: boolean;
}

export const ReplyForm = forwardRef<ReplyFormHandle, ReplyFormProps>(
  ({ threadId, threadLocked }, ref) => {
    const router = useRouter();
    const { user } = useAuth();
    const [body, setBody] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(ref, () => ({
      insertQuote(post) {
        const quote =
          (post.author ? `> **${post.author.nickname}** написал:\n` : "> Цитата:\n") +
          post.body
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n") +
          "\n\n";
        setBody((prev) => (prev ? `${prev}\n${quote}` : quote));
        textareaRef.current?.focus();
      },
      focus() {
        textareaRef.current?.focus();
      },
    }));

    if (threadLocked) {
      return (
        <div className="rounded-lg border border-border bg-void/60 p-6 text-center text-sm text-smoke">
          Тема закрыта для ответов
        </div>
      );
    }

    if (!user) {
      return (
        <div className="rounded-lg border border-border bg-void/60 p-6 text-center text-sm text-ash">
          <a href="/login" className="link-plasma">
            Войди
          </a>{" "}
          чтобы ответить в этой теме
        </div>
      );
    }

    async function submit(e: React.FormEvent) {
      e.preventDefault();
      const text = body.trim();
      if (text.length < 1 || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        await api(`/threads/${threadId}/posts`, {
          method: "POST",
          body: JSON.stringify({ body: text }),
        });
        setBody("");
        toast.success("Ответ отправлен");
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError) setError(err.detail);
        else setError("Не удалось отправить");
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <form
        onSubmit={submit}
        className="space-y-3 rounded-lg border border-border bg-card p-4"
      >
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Твой ответ…  Поддерживаются переносы строк и > цитаты"
          rows={5}
          maxLength={20000}
          disabled={submitting}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-smoke">
            {body.length}/20000 · markdown в Phase 1
          </span>
          <Button
            type="submit"
            variant="gradient"
            disabled={!body.trim() || submitting}
          >
            <Send className="h-4 w-4" />
            {submitting ? "Отправляем…" : "Отправить"}
          </Button>
        </div>
        {error && <p className="text-xs text-ember">{error}</p>}
      </form>
    );
  },
);
ReplyForm.displayName = "ReplyForm";
