"use client";

import { MessageSquare, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { relativeTime } from "@/lib/format";
import type { CsRconLogRead } from "@/lib/types";
import { cn } from "@/lib/utils";

const TEXT_MAX = 200;
const PREFIX_TEMPLATE = "[ FORUM ] {nick} :: ";
const RECENT_LIMIT = 30;

type SayResult = {
  ok: boolean;
  sent_text: string;
  latency_ms: number;
};

export default function CsChatPage() {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState<CsRconLogRead[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const previewPrefix = useMemo(
    () => PREFIX_TEMPLATE.replace("{nick}", user?.nickname ?? "..."),
    [user?.nickname],
  );
  const previewFull = useMemo(() => previewPrefix + text.trim(), [previewPrefix, text]);
  const previewLen = previewFull.length;
  // The backend caps the final sanitized string at 160 chars, so it is the
  // most useful counter for users (not the raw 200 input cap).
  const remaining = 160 - previewLen;

  const refreshLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const rows = await api<CsRconLogRead[]>(
        `/cs-rcon/log?limit=${RECENT_LIMIT}`,
      );
      // Show only `say ...` lines (omit jbf_uaio_* and other RCON traffic).
      setLog(rows.filter((r) => r.command.startsWith("say ")));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
    } finally {
      setLoadingLog(false);
    }
  }, []);

  useEffect(() => {
    void refreshLog();
  }, [refreshLog]);

  async function send(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (remaining < 0) {
      toast.error("Слишком длинно — сократи (счётчик красный).");
      return;
    }
    setSending(true);
    try {
      const r = await api<SayResult>("/cs-rcon/say", {
        method: "POST",
        body: JSON.stringify({ text: trimmed }),
      });
      toast.success(`В CS чат ушло (${r.latency_ms} ms)`);
      setText("");
      composerRef.current?.focus();
      void refreshLog();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.detail);
      else toast.error("Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-bone">
          <MessageSquare className="h-6 w-6 text-cyan" />
          Чат в CS
        </h1>
        <p className="mt-1 text-sm text-smoke">
          Сообщения уходят в команду <code className="font-mono text-iridescent">say</code> на CS-сервере.
          К тексту автоматически добавляется префикс с твоим ником — спрятать авторство нельзя.
          Лимит: 5 сообщений за 10 секунд. Эмодзи и CJK будут вырезаны (CS чат-шрифт их не показывает).
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4">
        <form onSubmit={send} className="space-y-3">
          <label className="block text-[10px] uppercase tracking-widest text-smoke">
            что отправить в CS чат
          </label>
          <textarea
            ref={composerRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Напиши сообщение, которое уйдёт в игровой чат…"
            maxLength={TEXT_MAX}
            rows={3}
            disabled={sending}
            className="min-h-[80px] w-full resize-none rounded-md border border-border bg-void/40 px-3 py-2 text-sm text-ash outline-none transition-colors placeholder:text-smoke focus:border-plasma/60"
          />
          <div className="rounded-md border border-cyan/20 bg-cyan/5 px-3 py-2 font-mono text-[11px] text-cyan">
            <span className="text-smoke">в игре будет:</span>{" "}
            <span className="break-words">{previewFull}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-widest text-smoke">
              Ctrl/Cmd + Enter — отправить
            </span>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "font-mono text-xs",
                  remaining < 0 && "text-ember",
                  remaining >= 0 && remaining < 20 && "text-flame",
                  remaining >= 20 && "text-smoke",
                )}
                title="осталось символов после сан + префикс (cap 160)"
              >
                {remaining}
              </span>
              <button
                type="submit"
                disabled={!text.trim() || sending || remaining < 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-plasma px-4 text-xs font-semibold text-white transition-all hover:bg-plasma-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Отправить
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-bone">
            Последние сообщения
          </h2>
          <button
            type="button"
            onClick={() => void refreshLog()}
            disabled={loadingLog}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] uppercase tracking-widest text-smoke transition-colors hover:border-cyan/40 hover:text-bone disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", loadingLog && "animate-spin")} />
            обновить
          </button>
        </header>

        {log.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-smoke">
            {loadingLog ? "загружаю…" : "пока никто ничего не писал"}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {log.map((row) => {
              // Strip the literal "say " prefix for cleaner reading.
              const body = row.command.replace(/^say\s+/, "");
              return (
                <li
                  key={row.id}
                  className={cn(
                    "flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-xs",
                    !row.success && "bg-ember/5",
                  )}
                >
                  <span className="font-semibold text-plasma">
                    {row.actor_nickname ?? `user#${row.actor_id ?? "?"}`}
                  </span>
                  <span className="break-words text-ash">{body}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-smoke">
                    {relativeTime(row.created_at)}
                    {row.latency_ms != null && (
                      <span className="ml-2 font-mono">{row.latency_ms} ms</span>
                    )}
                  </span>
                  {!row.success && row.error && (
                    <span className="basis-full text-[10px] text-ember">
                      ошибка: {row.error}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
