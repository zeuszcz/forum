"use client";

import { Check, ChevronUp, Pencil, Pin, PinOff, Send, Trash2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LetterAvatar } from "@/components/ui/avatar";
import { api, ApiError } from "@/lib/api";
import { sfx } from "@/lib/audio";
import { useAuth } from "@/lib/auth-context";
import { relativeTime } from "@/lib/format";
import { avatarGlowColor, glowNickProps, nickColor } from "@/lib/perks";
import type { ShoutboxMessage, UserPublic } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_FALLBACK_MS = 5000;
const PAGE_SIZE = 50;
const EDIT_WINDOW_MS = 5 * 60_000;
const MUTE_OPTIONS = [
  { min: 5, label: "5 мин" },
  { min: 30, label: "30 мин" },
  { min: 60, label: "1 ч" },
  { min: 60 * 24, label: "24 ч" },
];

type WsEvent =
  | { type: "hello"; user_id: number | null }
  | { type: "new"; message: ShoutboxMessage }
  | { type: "edit"; message: ShoutboxMessage }
  | { type: "delete"; id: number }
  | { type: "pin"; message: ShoutboxMessage; unpinned: number[] }
  | { type: "unpin"; id: number; message: ShoutboxMessage };

export function Shoutbox({ initialMessages }: { initialMessages: ShoutboxMessage[] }) {
  const { user } = useAuth();
  const isStaff = useMemo(
    () => Boolean(user?.roles?.some((r) => r.is_staff)),
    [user],
  );

  const initialChrono = useMemo(
    () => initialMessages.filter((m) => !m.is_deleted && !m.is_pinned),
    [initialMessages],
  );

  const [messages, setMessages] = useState<ShoutboxMessage[]>(initialChrono);
  const [pinned, setPinned] = useState<ShoutboxMessage | null>(
    initialMessages.find((m) => m.is_pinned && !m.is_deleted) ?? null,
  );
  const [hasMore, setHasMore] = useState(initialChrono.length >= PAGE_SIZE);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [muteOpenFor, setMuteOpenFor] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const wsConnectedRef = useRef(false);

  // -------- WebSocket --------
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    if (!apiUrl) return; // dev edge case
    const wsUrl = apiUrl.replace(/^http(s?):/, "ws$1:") + "/shoutbox/ws";

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let backoff = 1000;
    let alive = true;

    const handleEvent = (evt: WsEvent) => {
      switch (evt.type) {
        case "hello":
          break;
        case "new": {
          const msg = evt.message;
          if (msg.is_pinned) {
            setPinned(msg);
          } else {
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
            );
          }
          if (msg.author?.id !== user?.id) sfx.message();
          break;
        }
        case "edit": {
          const msg = evt.message;
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
          setPinned((p) => (p && p.id === msg.id ? msg : p));
          break;
        }
        case "delete": {
          setMessages((prev) => prev.filter((m) => m.id !== evt.id));
          setPinned((p) => (p && p.id === evt.id ? null : p));
          break;
        }
        case "pin": {
          setPinned(evt.message);
          // remove from chrono list (it's shown only in pinned slot)
          setMessages((prev) => prev.filter((m) => m.id !== evt.message.id));
          break;
        }
        case "unpin": {
          setPinned((p) => (p && p.id === evt.id ? null : p));
          // re-insert into chrono list at correct position
          setMessages((prev) => {
            if (prev.some((m) => m.id === evt.message.id)) return prev;
            const next = [...prev, evt.message];
            next.sort((a, b) => a.id - b.id);
            return next;
          });
          break;
        }
      }
    };

    const connect = () => {
      if (!alive) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        setWsConnected(true);
        wsConnectedRef.current = true;
        backoff = 1000;
      };
      ws.onmessage = (e) => {
        try {
          handleEvent(JSON.parse(e.data) as WsEvent);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setWsConnected(false);
        wsConnectedRef.current = false;
        ws = null;
        scheduleReconnect();
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    };

    const scheduleReconnect = () => {
      if (!alive) return;
      reconnectTimer = window.setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [user?.id]);

  // -------- Polling fallback when WS is offline --------
  const refresh = useCallback(async () => {
    try {
      const next = await api<ShoutboxMessage[]>(`/shoutbox?limit=${PAGE_SIZE}`);
      const live = next.filter((m) => !m.is_deleted);
      setPinned(live.find((m) => m.is_pinned) ?? null);
      setMessages(live.filter((m) => !m.is_pinned));
    } catch {
      /* swallow */
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!wsConnectedRef.current) void refresh();
    }, POLL_FALLBACK_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // -------- Autoscroll on new --------
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Only autoscroll if user is already near the bottom (within 120px) to
    // avoid yanking the view while they read history.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // -------- Load older on scroll up --------
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    const beforeId = messages[0]!.id;
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const older = await api<ShoutboxMessage[]>(
        `/shoutbox?limit=${PAGE_SIZE}&before_id=${beforeId}`,
      );
      const filtered = older.filter((m) => !m.is_deleted && !m.is_pinned);
      setMessages((prev) => [...filtered, ...prev]);
      setHasMore(filtered.length >= PAGE_SIZE);
      // Preserve visual scroll position so the user stays at the same message.
      window.requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch {
      /* swallow */
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMore, messages]);

  // -------- Send --------
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!user || !trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await api<ShoutboxMessage>("/shoutbox", {
        method: "POST",
        body: JSON.stringify({ body: trimmed }),
      });
      // optimistic — WS will dedupe; falls back to local insert if WS dead
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
      setBody("");
      sfx.message();
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      else setError("Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  // -------- Edit --------
  function startEdit(msg: ShoutboxMessage) {
    setEditingId(msg.id);
    setEditBody(msg.body);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditBody("");
  }
  async function saveEdit(id: number) {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    try {
      await api<ShoutboxMessage>(`/shoutbox/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ body: trimmed }),
      });
      cancelEdit();
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
    }
  }

  // -------- Delete / Pin / Mute --------
  async function deleteMsg(id: number) {
    if (!window.confirm("Удалить сообщение?")) return;
    try {
      await api(`/shoutbox/${id}`, { method: "DELETE" });
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
    }
  }
  async function pinMsg(id: number, pin: boolean) {
    try {
      await api(`/shoutbox/${id}/pin`, { method: pin ? "POST" : "DELETE" });
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
    }
  }
  async function muteUser(userId: number, durationMin: number) {
    try {
      await api(`/shoutbox/mute`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, duration_min: durationMin }),
      });
      setMuteOpenFor(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
    }
  }

  // -------- Render --------
  const charsLeft = 500 - body.length;
  const charsLow = charsLeft < 50;

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              wsConnected ? "bg-cyan animate-pulse-slow" : "bg-smoke",
            )}
            title={wsConnected ? "Realtime подключен" : "Polling fallback"}
          />
          <h2 className="text-sm font-semibold tracking-tight text-bone">Общий чат</h2>
        </div>
        <span className="text-xs text-smoke">{messages.length}</span>
      </header>

      {pinned && (
        <div className="border-b border-plasma/30 bg-plasma/5 px-3 py-2">
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-widest text-plasma">
            <Pin className="h-3 w-3" />
            закреплено
            {isStaff && (
              <button
                onClick={() => pinMsg(pinned.id, false)}
                className="ml-auto text-smoke transition-colors hover:text-bone"
                title="Открепить"
              >
                <PinOff className="h-3 w-3" />
              </button>
            )}
          </div>
          <MessageBody msg={pinned} />
        </div>
      )}

      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm"
      >
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-3 py-1 text-[11px] text-smoke transition-colors hover:border-plasma/40 hover:text-ash disabled:opacity-50"
            >
              <ChevronUp className="h-3 w-3" />
              {loadingOlder ? "загружаю…" : "старше"}
            </button>
          </div>
        )}
        {!hasMore && messages.length === 0 && (
          <p className="py-8 text-center text-xs text-smoke">
            Тишина. Напиши первое сообщение.
          </p>
        )}

        {messages.map((m) => {
          const isOwn = m.author?.id === user?.id;
          const ageMs = Date.now() - new Date(m.created_at).getTime();
          const canEdit = isOwn && ageMs < EDIT_WINDOW_MS;
          const canDelete = isOwn || isStaff;
          const canMute =
            isStaff && m.author && m.author.id !== user?.id;
          const isEditing = editingId === m.id;

          return (
            <div
              key={m.id}
              className="group/msg relative flex items-start gap-2"
            >
              {m.author && (
                <LetterAvatar
                  nickname={m.author.nickname}
                  size={24}
                  glowColor={avatarGlowColor(m.author)}
                  avatarUrl={m.author.avatar_url ?? null}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <AuthorName author={m.author} />
                  <span className="text-[10px] text-smoke">
                    {relativeTime(m.created_at)}
                    {m.edited_at && (
                      <span className="ml-1 italic text-smoke/70">(ред.)</span>
                    )}
                  </span>
                </div>

                {isEditing ? (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      maxLength={500}
                      rows={2}
                      className="w-full resize-none rounded-md border border-plasma/40 bg-void/40 px-2 py-1 text-sm text-ash outline-none focus:border-plasma"
                      autoFocus
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={cancelEdit}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-smoke transition-colors hover:text-ash"
                      >
                        <X className="h-3 w-3" />
                        отмена
                      </button>
                      <button
                        onClick={() => saveEdit(m.id)}
                        className="inline-flex h-7 items-center gap-1 rounded-md bg-plasma px-2 text-[11px] font-semibold text-white transition-colors hover:bg-plasma-bright"
                      >
                        <Check className="h-3 w-3" />
                        сохранить
                      </button>
                    </div>
                  </div>
                ) : (
                  <MessageBody msg={m} />
                )}
              </div>

              {!isEditing && (canEdit || canDelete || isStaff || canMute) && (
                <div className="absolute right-1 top-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
                  {canEdit && (
                    <ActionButton
                      label="Редактировать"
                      onClick={() => startEdit(m)}
                    >
                      <Pencil className="h-3 w-3" />
                    </ActionButton>
                  )}
                  {isStaff && (
                    <ActionButton
                      label={pinned?.id === m.id ? "Открепить" : "Закрепить"}
                      onClick={() => pinMsg(m.id, pinned?.id !== m.id)}
                    >
                      {pinned?.id === m.id ? (
                        <PinOff className="h-3 w-3" />
                      ) : (
                        <Pin className="h-3 w-3" />
                      )}
                    </ActionButton>
                  )}
                  {canMute && (
                    <div className="relative">
                      <ActionButton
                        label="Чат-мут"
                        onClick={() =>
                          setMuteOpenFor((curr) => (curr === m.id ? null : m.id))
                        }
                      >
                        <VolumeX className="h-3 w-3" />
                      </ActionButton>
                      {muteOpenFor === m.id && m.author && (
                        <div className="absolute right-0 top-7 z-10 w-40 overflow-hidden rounded-md border border-border bg-card shadow-xl">
                          <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-smoke">
                            мут на
                          </div>
                          {MUTE_OPTIONS.map((opt) => (
                            <button
                              key={opt.min}
                              onClick={() => muteUser(m.author!.id, opt.min)}
                              className="block w-full px-2 py-1.5 text-left text-xs text-ash transition-colors hover:bg-slate hover:text-bone"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {canDelete && (
                    <ActionButton
                      label="Удалить"
                      onClick={() => deleteMsg(m.id)}
                    >
                      <Trash2 className="h-3 w-3 text-ember" />
                    </ActionButton>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form
        onSubmit={send}
        className="flex flex-col gap-2 border-t border-border bg-void/40 p-3"
      >
        {user ? (
          <>
            <div className="flex items-end gap-2">
              <textarea
                ref={composerRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Написать в чат… (Shift+Enter — перенос)"
                maxLength={500}
                disabled={sending}
                rows={1}
                className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-ash outline-none transition-colors placeholder:text-smoke focus:border-plasma/60"
              />
              <button
                type="submit"
                disabled={!body.trim() || sending}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-plasma text-white transition-all duration-150 ease-premium hover:bg-plasma-bright disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Отправить"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-smoke">
              <span>Enter — отправить, Shift+Enter — перенос строки</span>
              <span
                className={cn(
                  "font-mono",
                  charsLow && charsLeft >= 0 && "text-flame",
                  charsLeft < 0 && "text-ember",
                )}
              >
                {charsLeft}
              </span>
            </div>
          </>
        ) : (
          <p className="text-center text-xs text-smoke">
            <Link href="/login" className="link-plasma">
              Войди
            </Link>{" "}
            чтобы писать в чат
          </p>
        )}
      </form>
      {error && (
        <p className="border-t border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember">
          {error}
        </p>
      )}
    </section>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-card/80 text-smoke transition-colors hover:border-plasma/40 hover:text-bone"
    >
      {children}
    </button>
  );
}

function AuthorName({ author }: { author: UserPublic | null }) {
  if (!author) return <span className="text-xs text-smoke">удалён</span>;
  const color = nickColor(author);
  const glow = glowNickProps(author);
  return (
    <Link
      href={`/u/${author.nickname}`}
      className={cn(
        "text-xs font-semibold transition-opacity hover:opacity-80",
        glow.className,
      )}
      style={{ color, ...glow.style }}
    >
      {author.nickname}
    </Link>
  );
}

function MessageBody({ msg }: { msg: ShoutboxMessage }) {
  return (
    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-snug text-ash">
      {msg.body}
    </p>
  );
}
