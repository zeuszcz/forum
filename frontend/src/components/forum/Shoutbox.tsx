"use client";

import {
  Check,
  ChevronUp,
  Copy,
  CornerDownRight,
  Eraser,
  ExternalLink,
  Pencil,
  Pin,
  PinOff,
  Radio,
  Reply,
  Send,
  Server,
  Smile,
  SmilePlus,
  Sticker as StickerIcon,
  Trash2,
  Vote,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { LetterAvatar } from "@/components/ui/avatar";
import { api, ApiError } from "@/lib/api";
import { sfx } from "@/lib/audio";
import { useAuth } from "@/lib/auth-context";
import { EMOJI_GROUPS } from "@/lib/chat-emoji";
import { applySlashCommand, KNOWN_SLASH_HELP } from "@/lib/chat-slash";
import { canUseSticker, STICKERS } from "@/lib/chat-stickers";
import { relativeTime } from "@/lib/format";
import { avatarGlowColor, glowNickProps, nickColor } from "@/lib/perks";
import {
  type CsServerStatus,
  type MapVoteMeta,
  REACTION_EMOJI,
  type ReactionKind,
  type ShoutboxMessage,
  type UserPublic,
} from "@/lib/types";
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
const REACTION_KINDS: ReactionKind[] = [
  "like", "fire", "laugh", "wow", "sad", "thinking", "thanks",
];

type WsEvent =
  | { type: "hello"; user_id: number | null }
  | { type: "new"; message: ShoutboxMessage }
  | { type: "edit"; message: ShoutboxMessage }
  | { type: "delete"; id: number }
  | { type: "pin"; message: ShoutboxMessage; unpinned: number[] }
  | { type: "unpin"; id: number; message: ShoutboxMessage }
  | { type: "react"; id: number; reactions: Partial<Record<ReactionKind, number>> }
  | { type: "vote"; id: number; vote_counts: Record<string, number> };

const MARKDOWN_SCHEMA = {
  ...defaultSchema,
  tagNames: ["p", "br", "strong", "em", "code", "a", "del", "s"],
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ["href", /^https?:\/\//, /^\/[^/]/, /^steam:/],
      ["title"],
      ["target"],
      ["rel"],
    ],
  },
};

const CONNECT_RE =
  /\bconnect\s+((?:[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d{1,5})\b/gi;

/** Rewrite "connect host:port" runs to a markdown link with the steam://
 * scheme so the markdown renderer's <a> override can style them as a button.
 * Idempotent: anything already inside an existing markdown link is skipped
 * because the regex requires the `connect` keyword on a word boundary. */
function preprocessConnect(body: string): string {
  return body.replace(CONNECT_RE, (_m, addr) => `[connect ${addr}](steam://connect/${addr})`);
}

export function Shoutbox({ initialMessages }: { initialMessages: ShoutboxMessage[] }) {
  const { user } = useAuth();
  const isStaff = useMemo(
    () => Boolean(user?.roles?.some((r) => r.is_staff)),
    [user],
  );

  // System messages (bot-cast events, admin actions) are visible only in the
  // admin panel at /admin/server-log — never in the public chat.
  const initialChrono = useMemo(
    () =>
      initialMessages.filter(
        (m) => !m.is_deleted && !m.is_pinned && m.kind !== "system",
      ),
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
  const [replyTo, setReplyTo] = useState<ShoutboxMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [muteOpenFor, setMuteOpenFor] = useState<number | null>(null);
  const [reactPickerFor, setReactPickerFor] = useState<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState<CsServerStatus | null>(null);
  const [mentionState, setMentionState] = useState<{
    query: string;
    start: number;
    items: UserPublic[];
    activeIdx: number;
  } | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const wsConnectedRef = useRef(false);

  // -------- WebSocket --------
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    if (!apiUrl) return;
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
          // System events (bot-cast, admin) go only to the admin log page.
          if (msg.kind === "system") break;
          if (msg.is_pinned) setPinned(msg);
          else
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
            );
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
          setReplyTo((r) => (r && r.id === evt.id ? null : r));
          break;
        }
        case "pin": {
          setPinned(evt.message);
          setMessages((prev) => prev.filter((m) => m.id !== evt.message.id));
          break;
        }
        case "unpin": {
          setPinned((p) => (p && p.id === evt.id ? null : p));
          setMessages((prev) => {
            if (prev.some((m) => m.id === evt.message.id)) return prev;
            const next = [...prev, evt.message];
            next.sort((a, b) => a.id - b.id);
            return next;
          });
          break;
        }
        case "react": {
          // Don't overwrite our own `reacted` list — the toggle endpoint
          // already updated us. We only refresh counts here.
          setMessages((prev) =>
            prev.map((m) => (m.id === evt.id ? { ...m, reactions: evt.reactions } : m)),
          );
          setPinned((p) =>
            p && p.id === evt.id ? { ...p, reactions: evt.reactions } : p,
          );
          break;
        }
        case "vote": {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === evt.id ? { ...m, vote_counts: evt.vote_counts } : m,
            ),
          );
          setPinned((p) =>
            p && p.id === evt.id ? { ...p, vote_counts: evt.vote_counts } : p,
          );
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

  // -------- Polling fallback --------
  const refresh = useCallback(async () => {
    try {
      const next = await api<ShoutboxMessage[]>(`/shoutbox?limit=${PAGE_SIZE}`);
      const live = next.filter((m) => !m.is_deleted && m.kind !== "system");
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

  // -------- CS server status (5s cached server-side, refreshed every 15s) --------
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api<CsServerStatus>("/shoutbox/server-status");
        if (alive) setServerStatus(s);
      } catch {
        /* swallow */
      }
    };
    void tick();
    const id = window.setInterval(tick, 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  // -------- Autoscroll --------
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // -------- Load older --------
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
      const filtered = older.filter(
        (m) => !m.is_deleted && !m.is_pinned && m.kind !== "system",
      );
      setMessages((prev) => [...filtered, ...prev]);
      setHasMore(filtered.length >= PAGE_SIZE);
      window.requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch {
      /* swallow */
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMore, messages]);

  // -------- Mention autocomplete --------
  const updateMentionFromInput = useCallback(
    (value: string, caret: number) => {
      // Find the most recent `@` before the caret with no whitespace between.
      let i = caret - 1;
      while (i >= 0 && /[a-zA-Z0-9_.\-]/.test(value[i] ?? "")) i--;
      if (i < 0 || value[i] !== "@") {
        setMentionState(null);
        return;
      }
      const start = i;
      const query = value.slice(start + 1, caret);
      if (query.length < 1) {
        setMentionState({ query: "", start, items: [], activeIdx: 0 });
        return;
      }
      setMentionState((prev) => ({
        query,
        start,
        items: prev?.items ?? [],
        activeIdx: 0,
      }));
    },
    [],
  );

  const mentionQuery = mentionState?.query ?? "";
  useEffect(() => {
    if (mentionQuery.length < 2) return;
    const q = mentionQuery;
    const handle = window.setTimeout(async () => {
      try {
        const r = await api<UserPublic[]>(
          `/users/search?q=${encodeURIComponent(q)}&limit=6`,
        );
        setMentionState((prev) =>
          prev && prev.query === q
            ? { ...prev, items: r, activeIdx: 0 }
            : prev,
        );
      } catch {
        /* swallow */
      }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [mentionQuery]);

  function applyMentionPick(u: UserPublic) {
    if (!mentionState || !composerRef.current) return;
    const before = body.slice(0, mentionState.start);
    const afterCaret = body.slice(composerRef.current.selectionStart);
    const inserted = `@${u.nickname} `;
    const next = `${before}${inserted}${afterCaret}`;
    setBody(next);
    setMentionState(null);
    window.requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + inserted.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // -------- Send --------
  async function clearChat() {
    if (!isStaff) return;
    if (!window.confirm("Очистить чат? Будут soft-удалены последние сообщения.")) return;
    try {
      await api("/shoutbox/clear", { method: "POST" });
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
    }
  }

  async function send(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = body.trim();
    if (!user || !trimmed || sending) return;

    const cmd = applySlashCommand(trimmed, { nickname: user.nickname });
    if (cmd.error) {
      setError(cmd.error);
      return;
    }
    if (cmd.sideEffect === "clear") {
      setBody("");
      await clearChat();
      return;
    }
    if (cmd.sideEffect === "mapvote" && cmd.mapvote) {
      if (!isStaff) {
        setError("Только модераторы могут запускать голосование");
        return;
      }
      setBody("");
      try {
        await api("/shoutbox/mapvote", {
          method: "POST",
          body: JSON.stringify({
            question: cmd.mapvote.question,
            options: cmd.mapvote.options,
            duration_min: cmd.mapvote.durationMin,
          }),
        });
      } catch (err) {
        if (err instanceof ApiError) setError(err.detail);
      }
      return;
    }
    const finalBody = cmd.body;
    if (!finalBody) return;

    setSending(true);
    setError(null);
    const replyId = replyTo?.id ?? null;
    try {
      const msg = await api<ShoutboxMessage>("/shoutbox", {
        method: "POST",
        body: JSON.stringify({ body: finalBody, reply_to_id: replyId }),
      });
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
      setBody("");
      setReplyTo(null);
      sfx.message();
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      else setError("Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  function insertAtCaret(text: string) {
    const el = composerRef.current;
    if (!el) {
      setBody((b) => b + text);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // -------- Edit / Delete / Pin / Mute --------
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
  async function reactTo(id: number, kind: ReactionKind) {
    if (!user) return;
    // Optimistic: toggle local reacted + count
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const had = (m.reacted ?? []).includes(kind);
        const reactions = { ...(m.reactions ?? {}) };
        reactions[kind] = Math.max(0, (reactions[kind] ?? 0) + (had ? -1 : 1));
        const reacted = had
          ? (m.reacted ?? []).filter((k) => k !== kind)
          : [...(m.reacted ?? []), kind];
        return { ...m, reactions, reacted };
      }),
    );
    try {
      const r = await api<{
        id: number;
        reactions: Partial<Record<ReactionKind, number>>;
        reacted: ReactionKind[];
      }>(`/shoutbox/${id}/react?kind=${kind}`, { method: "POST" });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, reactions: r.reactions, reacted: r.reacted } : m,
        ),
      );
    } catch (err) {
      // Rollback on failure
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const had = (m.reacted ?? []).includes(kind);
          const reactions = { ...(m.reactions ?? {}) };
          reactions[kind] = Math.max(0, (reactions[kind] ?? 0) + (had ? -1 : 1));
          const reacted = had
            ? (m.reacted ?? []).filter((k) => k !== kind)
            : [...(m.reacted ?? []), kind];
          return { ...m, reactions, reacted };
        }),
      );
      if (err instanceof ApiError) setError(err.detail);
    }
  }

  async function castVote(id: number, optionIdx: number) {
    if (!user) return;
    // Optimistic — bump local count + mark my_vote.
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const next: Record<string, number> = { ...(m.vote_counts ?? {}) };
        if (m.my_vote != null) {
          const prevKey = String(m.my_vote);
          next[prevKey] = Math.max(0, (next[prevKey] ?? 0) - 1);
        }
        const newKey = String(optionIdx);
        next[newKey] = (next[newKey] ?? 0) + 1;
        return { ...m, vote_counts: next, my_vote: optionIdx };
      }),
    );
    try {
      const r = await api<{
        id: number;
        vote_counts: Record<string, number>;
        my_vote: number;
      }>(`/shoutbox/${id}/vote`, {
        method: "POST",
        body: JSON.stringify({ option_idx: optionIdx }),
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, vote_counts: r.vote_counts, my_vote: r.my_vote }
            : m,
        ),
      );
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail);
      // Reload state from server to drop the optimistic change.
      void refresh();
    }
  }

  function insertStickerBody(body: string) {
    insertAtCaret(body);
    setStickerOpen(false);
  }

  // -------- Render --------
  const charsLeft = 500 - body.length;
  const charsLow = charsLeft < 50;
  const slashHint = body.trim().startsWith("/")
    ? KNOWN_SLASH_HELP.find((c) => body.trim().toLowerCase().startsWith(c.cmd))
    : null;

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              wsConnected ? "bg-cyan animate-pulse-slow" : "bg-smoke",
            )}
            title={wsConnected ? "Realtime подключен" : "Polling fallback"}
          />
          <h2 className="shrink-0 text-sm font-semibold tracking-tight text-bone">
            Общий чат
          </h2>
          {serverStatus && <ServerStatusPill status={serverStatus} />}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isStaff && (
            <button
              type="button"
              onClick={clearChat}
              title="Очистить чат"
              className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[10px] uppercase tracking-widest text-smoke transition-colors hover:border-ember/40 hover:text-ember"
            >
              <Eraser className="h-3 w-3" />
              clear
            </button>
          )}
          <span className="text-xs text-smoke">{messages.length}</span>
        </div>
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
          <MessageBody body={pinned.body} />
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
          if (m.kind === "system") {
            return (
              <SystemMessageRow
                key={m.id}
                msg={m}
                canDelete={isStaff}
                onDelete={() => deleteMsg(m.id)}
              />
            );
          }
          if (m.kind === "mapvote") {
            return (
              <MapVoteRow
                key={m.id}
                msg={m}
                canVote={!!user}
                canDelete={isStaff || m.author?.id === user?.id}
                onVote={(idx) => castVote(m.id, idx)}
                onDelete={() => deleteMsg(m.id)}
              />
            );
          }
          const isOwn = m.author?.id === user?.id;
          const ageMs = Date.now() - new Date(m.created_at).getTime();
          const canEdit = isOwn && ageMs < EDIT_WINDOW_MS;
          const canDelete = isOwn || isStaff;
          const canMute = isStaff && m.author && m.author.id !== user?.id;
          const isEditing = editingId === m.id;
          const reactions = m.reactions ?? {};
          const reacted = new Set(m.reacted ?? []);
          const visibleReactions = REACTION_KINDS.filter(
            (k) => (reactions[k] ?? 0) > 0,
          );

          return (
            <div
              key={m.id}
              className="group/msg relative flex items-start gap-2"
              id={`chat-${m.id}`}
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
                {m.reply_to && (
                  <ReplyPreview reply={m.reply_to} />
                )}
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
                  <MessageBody body={m.body} />
                )}

                {visibleReactions.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {visibleReactions.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => reactTo(m.id, k)}
                        disabled={!user}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          reacted.has(k)
                            ? "border-flame/40 bg-flame/10 text-flame"
                            : "border-border bg-card text-ash hover:border-plasma/40 hover:text-bone",
                        )}
                      >
                        <span aria-hidden>{REACTION_EMOJI[k]}</span>
                        <span className="font-mono">{reactions[k]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!isEditing && user && (
                <div className="absolute right-1 top-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
                  <div className="relative">
                    <ActionButton
                      label="Реакция"
                      onClick={() =>
                        setReactPickerFor((curr) => (curr === m.id ? null : m.id))
                      }
                    >
                      <SmilePlus className="h-3 w-3" />
                    </ActionButton>
                    {reactPickerFor === m.id && (
                      <div className="absolute right-0 top-7 z-10 flex items-center gap-1 rounded-md border border-border bg-card p-1 shadow-xl">
                        {REACTION_KINDS.map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => {
                              setReactPickerFor(null);
                              reactTo(m.id, k);
                            }}
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-md text-base transition-transform hover:scale-125 hover:bg-slate",
                              reacted.has(k) && "bg-flame/15",
                            )}
                            aria-label={k}
                          >
                            {REACTION_EMOJI[k]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <ActionButton
                    label="Ответить"
                    onClick={() => {
                      setReplyTo(m);
                      composerRef.current?.focus();
                    }}
                  >
                    <Reply className="h-3 w-3" />
                  </ActionButton>
                  {canEdit && (
                    <ActionButton label="Редактировать" onClick={() => startEdit(m)}>
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
                    <ActionButton label="Удалить" onClick={() => deleteMsg(m.id)}>
                      <Trash2 className="h-3 w-3 text-ember" />
                    </ActionButton>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {replyTo && (
        <div className="border-t border-cyan/30 bg-cyan/5 px-3 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 text-[11px]">
              <span className="inline-flex items-center gap-1 text-cyan">
                <CornerDownRight className="h-3 w-3" />
                ответ {replyTo.author?.nickname ?? "анон"}
              </span>
              <span className="ml-2 text-smoke truncate">
                {replyTo.body.slice(0, 80)}
                {replyTo.body.length > 80 && "…"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-smoke transition-colors hover:text-bone"
              aria-label="Отменить ответ"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={send}
        className="relative flex flex-col gap-2 border-t border-border bg-void/40 p-3"
      >
        {user ? (
          <>
            <div className="flex items-end gap-2">
              <textarea
                ref={composerRef}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  updateMentionFromInput(
                    e.target.value,
                    e.target.selectionStart ?? e.target.value.length,
                  );
                }}
                onSelect={(e) => {
                  const t = e.currentTarget;
                  updateMentionFromInput(t.value, t.selectionStart ?? 0);
                }}
                onKeyDown={(e) => {
                  if (mentionState && mentionState.items.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setMentionState((s) =>
                        s
                          ? {
                              ...s,
                              activeIdx: Math.min(
                                s.activeIdx + 1,
                                s.items.length - 1,
                              ),
                            }
                          : s,
                      );
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setMentionState((s) =>
                        s ? { ...s, activeIdx: Math.max(0, s.activeIdx - 1) } : s,
                      );
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      applyMentionPick(mentionState.items[mentionState.activeIdx]!);
                      return;
                    }
                    if (e.key === "Escape") {
                      setMentionState(null);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Написать в чат…"
                maxLength={500}
                disabled={sending}
                rows={1}
                className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-ash outline-none transition-colors placeholder:text-smoke focus:border-plasma/60"
              />
              <button
                type="button"
                onClick={() => {
                  setStickerOpen((v) => !v);
                  setEmojiOpen(false);
                }}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-smoke transition-colors hover:border-flame/40 hover:text-bone"
                title="Стикеры"
              >
                <StickerIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmojiOpen((v) => !v);
                  setStickerOpen(false);
                }}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-smoke transition-colors hover:border-plasma/40 hover:text-bone"
                title="Эмодзи"
              >
                <Smile className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={!body.trim() || sending}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-plasma text-white transition-all duration-150 ease-premium hover:bg-plasma-bright disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Отправить"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-3 text-[10px] text-smoke">
              {slashHint && (
                <span className="text-plasma">
                  {slashHint.cmd} — {slashHint.desc}
                </span>
              )}
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

            {mentionState && mentionState.items.length > 0 && (
              <div className="absolute bottom-[68px] left-3 z-20 w-64 overflow-hidden rounded-md border border-border bg-card shadow-xl">
                {mentionState.items.map((u, idx) => (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyMentionPick(u);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors",
                      idx === mentionState.activeIdx
                        ? "bg-slate text-bone"
                        : "text-ash hover:bg-slate hover:text-bone",
                    )}
                  >
                    <LetterAvatar
                      nickname={u.nickname}
                      size={18}
                      avatarUrl={u.avatar_url ?? null}
                    />
                    <span style={{ color: nickColor(u) }}>@{u.nickname}</span>
                    {u.title && (
                      <span className="ml-auto text-[10px] text-smoke">{u.title}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {emojiOpen && (
              <div className="absolute bottom-[68px] right-12 z-20 w-72 overflow-hidden rounded-md border border-border bg-card shadow-xl">
                {EMOJI_GROUPS.map((group) => (
                  <div key={group.name} className="border-b border-border last:border-b-0">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-smoke">
                      {group.name}
                    </div>
                    <div className="grid grid-cols-8 gap-0.5 p-1">
                      {group.emojis.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => {
                            insertAtCaret(e);
                            setEmojiOpen(false);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-base transition-transform hover:scale-125 hover:bg-slate"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {stickerOpen && (
              <div className="absolute bottom-[68px] right-24 z-20 w-72 overflow-hidden rounded-md border border-border bg-card shadow-xl">
                <div className="border-b border-border px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-widest text-smoke">
                    CS·стикеры
                  </div>
                  <p className="text-[9px] text-smoke/80">
                    🔒 — нужен VIP/Premium на сервере
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-1 p-2">
                  {STICKERS.map((s) => {
                    const unlocked = canUseSticker(
                      s,
                      user?.granted_perks ?? [],
                    );
                    return (
                      <button
                        key={s.slug}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => insertStickerBody(s.body)}
                        className={cn(
                          "flex flex-col items-center gap-0.5 rounded-md border border-border bg-void/30 p-2 text-center text-[10px] transition-all",
                          unlocked
                            ? "cursor-pointer text-ash hover:scale-105 hover:border-flame/40 hover:bg-flame/5 hover:text-bone"
                            : "cursor-not-allowed opacity-50",
                        )}
                        title={
                          unlocked
                            ? s.label
                            : `Нужен perk ${s.perkRequired}`
                        }
                      >
                        <span className="text-lg leading-none">
                          {s.body.match(/[\p{Emoji_Presentation}\u{1F3FB}-\u{1F3FF}]/u)?.[0] ?? "🎯"}
                        </span>
                        <span className="font-mono uppercase tracking-widest">
                          {unlocked ? s.label : `🔒 ${s.label}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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

function ReplyPreview({
  reply,
}: {
  reply: NonNullable<ShoutboxMessage["reply_to"]>;
}) {
  return (
    <div className="mb-1 inline-flex max-w-full items-center gap-1.5 rounded-l border-l-2 border-cyan/50 bg-cyan/5 px-2 py-0.5">
      <CornerDownRight className="h-3 w-3 shrink-0 text-cyan" />
      {reply.author_nickname ? (
        <Link
          href={`/u/${reply.author_nickname}`}
          className="text-[11px] font-semibold text-cyan hover:underline"
        >
          @{reply.author_nickname}
        </Link>
      ) : (
        <span className="text-[11px] text-smoke">аноним</span>
      )}
      <span className="truncate text-[11px] text-smoke">
        {reply.is_deleted ? "[удалено]" : reply.body}
      </span>
    </div>
  );
}

const MENTION_RE = /(^|[\s(\[{>«„"'\-])@([a-zA-Z0-9_.]{2,32})\b/g;

function renderTextWithMentions(text: string, keyPrefix: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const at = m.index + m[1].length;
    if (at > last) out.push(text.slice(last, at));
    const nick = m[2]!;
    out.push(
      <Link
        key={`${keyPrefix}-${at}`}
        href={`/u/${nick}`}
        className="mention-pill rounded-md border border-plasma/30 bg-plasma/10 px-1 font-medium text-plasma transition-colors hover:border-plasma/60 hover:bg-plasma/20"
      >
        @{nick}
      </Link>,
    );
    last = at + 1 + nick.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}

function MessageBody({ body }: { body: string }) {
  const processed = useMemo(() => preprocessConnect(body), [body]);
  return (
    <div className="mt-0.5 text-sm leading-snug text-ash">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, MARKDOWN_SCHEMA]]}
        components={{
          p: ({ children }) => (
            <p className="whitespace-pre-wrap break-words">
              {walkMentions(children)}
            </p>
          ),
          a: ({ href, children }) => {
            if (href && href.startsWith("steam:")) {
              return <ConnectButton href={href}>{children}</ConnectButton>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="link-plasma break-all"
              >
                {children}
              </a>
            );
          },
          code: ({ children }) => (
            <code className="rounded bg-void/60 px-1 py-0.5 font-mono text-[12px] text-iridescent">
              {children}
            </code>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-bone">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-bone/90">{children}</em>,
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

function ConnectButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const addr = href.replace(/^steam:\/\/connect\//, "");
  function copyConnect() {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(`connect ${addr}`);
      toast.success("connect-команда в буфере");
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      <a
        href={href}
        className="inline-flex items-center gap-1 rounded-md border border-cyan/40 bg-cyan/10 px-2 py-0.5 font-mono text-xs font-semibold text-cyan transition-colors hover:border-cyan/70 hover:bg-cyan/20"
        title="Открыть Steam → connect"
      >
        <ExternalLink className="h-3 w-3" />
        {children}
      </a>
      <button
        type="button"
        onClick={copyConnect}
        title="Скопировать connect-команду"
        className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-border text-smoke transition-colors hover:border-cyan/40 hover:text-cyan"
      >
        <Copy className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function walkMentions(children: React.ReactNode): React.ReactNode {
  return walkChildren(children, 0);
}

function walkChildren(node: React.ReactNode, depth: number): React.ReactNode {
  if (depth > 4) return node;
  if (typeof node === "string") return renderTextWithMentions(node, `m${depth}`);
  if (Array.isArray(node)) {
    return node.map((c, i) => (
      <span key={i}>{walkChildren(c, depth + 1)}</span>
    ));
  }
  return node;
}

// -----------------------------------------------------------------------------
// Server status pill
// -----------------------------------------------------------------------------

function ServerStatusPill({ status }: { status: CsServerStatus }) {
  function copyConnect() {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(`connect ${status.address}`);
      toast.success("connect-команда в буфере");
    }
  }
  if (!status.online) {
    return (
      <button
        type="button"
        onClick={copyConnect}
        title={`Сервер недоступен · ${status.address}`}
        className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-card/60 px-2 py-0.5 text-[10px] text-smoke transition-colors hover:border-cyan/40 hover:text-ash"
      >
        <Server className="h-3 w-3" />
        <span className="font-mono">offline</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={copyConnect}
      title={`${status.name} · клик → копировать connect ${status.address}`}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/5 px-2 py-0.5 text-[10px] text-cyan transition-colors hover:bg-cyan/10"
    >
      <Radio className="h-3 w-3" />
      <span className="font-mono font-semibold">
        {status.players}/{status.max_players}
      </span>
      {status.map && (
        <span className="hidden truncate font-mono text-smoke sm:inline">
          · {status.map}
        </span>
      )}
    </button>
  );
}

// -----------------------------------------------------------------------------
// System message row (bot-cast / game events)
// -----------------------------------------------------------------------------

/** Visual styling per jail event category. Defaults to neutral border/smoke
 * for unrecognised categories so an unknown UDP listener event still renders
 * without throwing. */
const SYSTEM_CATEGORY_STYLE: Record<
  string,
  { border: string; bg: string; badge: string; text: string }
> = {
  rebel: {
    border: "border-ember/40",
    bg: "bg-ember/5",
    badge: "border-ember/40 bg-ember/15 text-ember",
    text: "text-ash",
  },
  bunt: {
    border: "border-ember/40",
    bg: "bg-ember/5",
    badge: "border-ember/40 bg-ember/15 text-ember",
    text: "text-ash",
  },
  freekill: {
    border: "border-flame/40",
    bg: "bg-flame/5",
    badge: "border-flame/40 bg-flame/15 text-flame",
    text: "text-ash",
  },
  mass: {
    border: "border-flame/40",
    bg: "bg-flame/5",
    badge: "border-flame/40 bg-flame/15 text-flame",
    text: "text-ash",
  },
  lr: {
    border: "border-plasma/30",
    bg: "bg-plasma/5",
    badge: "border-plasma/40 bg-plasma/15 text-plasma",
    text: "text-ash",
  },
  freeday: {
    border: "border-cyan/30",
    bg: "bg-cyan/5",
    badge: "border-cyan/40 bg-cyan/15 text-cyan",
    text: "text-ash",
  },
  round: {
    border: "border-border",
    bg: "bg-void/40",
    badge: "border-border bg-card text-smoke",
    text: "text-smoke",
  },
  killfeed: {
    border: "border-border",
    bg: "bg-void/40",
    badge: "border-cyan/30 bg-cyan/10 text-cyan",
    text: "text-ash",
  },
  join: {
    border: "border-border",
    bg: "bg-void/30",
    badge: "border-border bg-card text-smoke",
    text: "text-smoke/80",
  },
  leave: {
    border: "border-border",
    bg: "bg-void/30",
    badge: "border-border bg-card text-smoke",
    text: "text-smoke/80",
  },
};

function SystemMessageRow({
  msg,
  canDelete,
  onDelete,
}: {
  msg: ShoutboxMessage;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const meta = (msg.meta as { tag?: string; category?: string } | null) ?? null;
  const style =
    SYSTEM_CATEGORY_STYLE[meta?.category ?? ""] ??
    SYSTEM_CATEGORY_STYLE.killfeed!;
  return (
    <div
      id={`chat-${msg.id}`}
      className={cn(
        "group/sys relative rounded-md border px-3 py-1.5 font-mono text-[12px]",
        style.border,
        style.bg,
      )}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 text-[9px] font-bold uppercase tracking-widest",
            style.badge,
          )}
        >
          {meta?.tag ?? meta?.category ?? "jail"}
        </span>
        <span className={cn("min-w-0 flex-1 break-words", style.text)}>
          {msg.body}
        </span>
        <span className="shrink-0 text-[9px] text-smoke/60">
          {relativeTime(msg.created_at)}
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Удалить"
            className="shrink-0 text-smoke opacity-0 transition-opacity hover:text-ember group-hover/sys:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Map-vote inline widget
// -----------------------------------------------------------------------------

function MapVoteRow({
  msg,
  canVote,
  canDelete,
  onVote,
  onDelete,
}: {
  msg: ShoutboxMessage;
  canVote: boolean;
  canDelete: boolean;
  onVote: (idx: number) => void;
  onDelete: () => void;
}) {
  const meta = (msg.meta as MapVoteMeta | null) ?? null;
  const options = meta?.options ?? [];
  const counts = msg.vote_counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + Number(b ?? 0), 0);
  const closesAt = meta?.closes_at ? new Date(meta.closes_at) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const closed = closesAt ? closesAt.getTime() <= now : false;
  const secondsLeft = closesAt
    ? Math.max(0, Math.floor((closesAt.getTime() - now) / 1000))
    : 0;

  return (
    <div
      id={`chat-${msg.id}`}
      className="group/vote relative rounded-md border border-flame/40 bg-flame/5 px-3 py-2.5"
    >
      <div className="mb-2 flex items-center gap-2">
        <Vote className="h-3.5 w-3.5 text-flame" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-flame">
          {meta?.question ?? "map vote"}
        </span>
        {!closed ? (
          <span className="ml-auto rounded border border-flame/30 px-1.5 py-px font-mono text-[10px] text-flame">
            ⌛ {Math.floor(secondsLeft / 60)}:
            {String(secondsLeft % 60).padStart(2, "0")}
          </span>
        ) : (
          <span className="ml-auto rounded border border-border px-1.5 py-px font-mono text-[10px] text-smoke">
            закрыто
          </span>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="opacity-0 transition-opacity hover:text-ember group-hover/vote:opacity-100"
            title="Удалить голосование"
          >
            <Trash2 className="h-3 w-3 text-smoke" />
          </button>
        )}
      </div>

      <div className="space-y-1">
        {options.map((opt, idx) => {
          const count = Number(counts[String(idx)] ?? 0);
          const pct = total > 0 ? (count / total) * 100 : 0;
          const mine = msg.my_vote === idx;
          return (
            <button
              key={idx}
              type="button"
              disabled={!canVote || closed}
              onClick={() => onVote(idx)}
              className={cn(
                "group/opt relative flex w-full items-center justify-between overflow-hidden rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed",
                mine
                  ? "border-flame/60 bg-flame/10 text-bone"
                  : "border-border bg-card text-ash hover:border-flame/40 hover:text-bone",
              )}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 transition-[width] duration-300"
                style={{
                  width: `${pct}%`,
                  background: mine
                    ? "rgb(var(--flame-rgb) / 0.18)"
                    : "rgb(var(--flame-rgb) / 0.08)",
                }}
              />
              <span className="relative z-10 font-mono font-semibold">
                {mine ? "✓ " : ""}
                {opt}
              </span>
              <span className="relative z-10 font-mono text-[11px] text-smoke">
                {count} · {Math.round(pct)}%
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] text-smoke">
        {total} {total === 1 ? "голос" : "голосов"}
        {msg.author && <> · от @{msg.author.nickname}</>}
      </p>
    </div>
  );
}
