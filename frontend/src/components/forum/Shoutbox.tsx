"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { LetterAvatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { sfx } from "@/lib/audio";
import { useAuth } from "@/lib/auth-context";
import { relativeTime } from "@/lib/format";
import type { ShoutboxMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_MS = 5000;

export function Shoutbox({ initialMessages }: { initialMessages: ShoutboxMessage[] }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ShoutboxMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api<ShoutboxMessage[]>("/shoutbox?limit=50");
      setMessages(next);
    } catch {
      /* swallow polling errors */
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await api<ShoutboxMessage>("/shoutbox", {
        method: "POST",
        body: JSON.stringify({ body: body.trim() }),
      });
      setMessages((prev) => [...prev, msg].slice(-50));
      setBody("");
      sfx.message();
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      else setError("Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex h-full flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="dot-live animate-pulse-slow" />
          <h2 className="text-sm font-semibold tracking-tight text-bone">Общий чат</h2>
        </div>
        <span className="text-xs text-smoke">{messages.length}/50</span>
      </header>

      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm"
        style={{ maxHeight: 360, minHeight: 280 }}
      >
        {messages.length === 0 && (
          <p className="py-8 text-center text-xs text-smoke">
            Тишина. Напиши первое сообщение.
          </p>
        )}
        {messages.map((m) => {
          const role = m.author?.roles?.[0];
          return (
            <div key={m.id} className="flex items-start gap-2">
              {m.author && <LetterAvatar nickname={m.author.nickname} size={24} />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {m.author ? (
                    <Link
                      href={`/u/${m.author.nickname}`}
                      className="text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{ color: role?.color ?? "#e8e9f3" }}
                    >
                      {m.author.nickname}
                    </Link>
                  ) : (
                    <span className="text-xs text-smoke">удалён</span>
                  )}
                  <span className="text-[10px] text-smoke">{relativeTime(m.created_at)}</span>
                </div>
                <p className="mt-0.5 break-words text-sm leading-snug text-ash">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={send}
        className="flex items-center gap-2 border-t border-border bg-void/40 p-3"
      >
        {user ? (
          <>
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Написать в чат…"
              maxLength={280}
              disabled={sending}
              className="h-9"
            />
            <button
              type="submit"
              disabled={!body.trim() || sending}
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-plasma text-white transition-all duration-150 ease-premium hover:bg-plasma-bright disabled:cursor-not-allowed disabled:opacity-50",
              )}
              aria-label="Отправить"
            >
              <Send className="h-4 w-4" />
            </button>
          </>
        ) : (
          <p className="w-full text-center text-xs text-smoke">
            <Link href="/login" className="link-plasma">
              Войди
            </Link>{" "}
            чтобы писать в чат
          </p>
        )}
      </form>
      {error && <p className="px-3 pb-2 text-xs text-ember">{error}</p>}
    </section>
  );
}
