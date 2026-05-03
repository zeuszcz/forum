"use client";

import { Quote as QuoteIcon, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";

import { MentionTextarea } from "@/components/forum/MentionTextarea";
import { LetterAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { nickColor } from "@/lib/perks";
import { useAuth } from "@/lib/auth-context";
import type { Post } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ReplyFormHandle {
  insertQuote: (post: Post) => void;
  focus: () => void;
}

interface ReplyFormProps {
  threadId: number;
  threadLocked: boolean;
}

interface QuoteBlock {
  uid: string;
  postId: number;
  author: string | null;
  authorColor: string | null;
  body: string;
}

const MAX_QUOTE_LINES_VISIBLE = 4;

export const ReplyForm = forwardRef<ReplyFormHandle, ReplyFormProps>(
  ({ threadId, threadLocked }, ref) => {
    const router = useRouter();
    const { user } = useAuth();
    const [body, setBody] = useState("");
    const [quotes, setQuotes] = useState<QuoteBlock[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(ref, () => ({
      insertQuote(post) {
        // Skip if already quoted
        setQuotes((prev) => {
          if (prev.some((q) => q.postId === post.id)) return prev;
          return [
            ...prev,
            {
              uid: `${post.id}-${Date.now()}`,
              postId: post.id,
              author: post.author?.nickname ?? null,
              authorColor: post.author ? nickColor(post.author) : null,
              body: post.body,
            },
          ];
        });
        // Defer focus so DOM updates first
        requestAnimationFrame(() => textareaRef.current?.focus());
      },
      focus() {
        textareaRef.current?.focus();
      },
    }));

    function removeQuote(uid: string) {
      setQuotes((qs) => qs.filter((q) => q.uid !== uid));
    }

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

    function serialize(): string {
      // Strip leading `>` from quoted bodies (in case user is quoting a post
      // that itself contains quotes — flatten one level for the new quote).
      const stripQuoteMarkers = (raw: string): string =>
        raw
          .split("\n")
          .filter((l) => !/^>\s*\*\*.+\*\*\s+(?:написал|сказал)\s*:\s*$/i.test(l))
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n")
          .trim();

      const parts: string[] = [];
      for (const q of quotes) {
        const cleaned = stripQuoteMarkers(q.body);
        const lines = cleaned.split("\n").map((l) => `> ${l}`).join("\n");
        const header = q.author
          ? `> **${q.author}** написал:`
          : `> цитата:`;
        parts.push(`${header}\n${lines}`);
      }
      const text = body.trim();
      if (text) parts.push(text);
      return parts.join("\n\n");
    }

    async function submit(e: React.FormEvent) {
      e.preventDefault();
      const fullBody = serialize().trim();
      if (fullBody.length < 1 || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        await api(`/threads/${threadId}/posts`, {
          method: "POST",
          body: JSON.stringify({ body: fullBody }),
        });
        setBody("");
        setQuotes([]);
        toast.success("Ответ отправлен");
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError) setError(err.detail);
        else setError("Не удалось отправить");
      } finally {
        setSubmitting(false);
      }
    }

    const canSubmit = quotes.length > 0 || body.trim().length > 0;

    return (
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-border bg-card p-4">
        {/* Quote cards (above input) */}
        {quotes.length > 0 && (
          <ul className="space-y-2">
            {quotes.map((q) => (
              <QuoteChip key={q.uid} quote={q} onRemove={() => removeQuote(q.uid)} />
            ))}
          </ul>
        )}

        <MentionTextarea
          ref={textareaRef}
          value={body}
          onChange={setBody}
          placeholder={
            quotes.length > 0
              ? "Твой ответ к цитате… @ник для упоминания"
              : "Напиши ответ… используй @ник чтобы упомянуть"
          }
          rows={5}
          maxLength={20000}
          disabled={submitting}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-smoke">
            {quotes.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-plasma/30 bg-plasma/10 px-2 py-0.5 text-plasma">
                <QuoteIcon className="h-3 w-3" />
                {quotes.length}{" "}
                {quotes.length === 1 ? "цитата" : "цитат"}
              </span>
            )}
            <span>{body.length}/20000</span>
          </div>
          <Button type="submit" variant="gradient" disabled={!canSubmit || submitting}>
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

function QuoteChip({ quote, onRemove }: { quote: QuoteBlock; onRemove: () => void }) {
  const lines = quote.body.split("\n");
  const collapsed = lines.length > MAX_QUOTE_LINES_VISIBLE;
  const visible = collapsed
    ? lines.slice(0, MAX_QUOTE_LINES_VISIBLE).join("\n") + "\n…"
    : quote.body;

  return (
    <li className="overflow-hidden rounded-md border border-plasma/30 bg-plasma/5">
      <header className="flex items-center justify-between gap-2 border-b border-plasma/20 bg-plasma/10 px-3 py-1.5">
        <div className="inline-flex items-center gap-2 text-[11px]">
          <QuoteIcon className="h-3 w-3 text-plasma" />
          <span className="uppercase tracking-widest text-smoke">цитата</span>
          {quote.author && (
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <LetterAvatar nickname={quote.author} size={14} />
              <span style={{ color: quote.authorColor ?? "#e8e9f3" }}>
                {quote.author}
              </span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-smoke transition-colors hover:bg-slate hover:text-bone"
          aria-label="Убрать цитату"
        >
          <X className="h-3 w-3" />
        </button>
      </header>
      <p
        className={cn(
          "whitespace-pre-wrap px-3 py-2 text-xs italic leading-relaxed text-ash [overflow-wrap:anywhere]",
        )}
      >
        {visible}
      </p>
    </li>
  );
}
