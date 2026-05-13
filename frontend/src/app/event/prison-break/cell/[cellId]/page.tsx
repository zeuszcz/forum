"use client";

import { motion, useAnimation } from "framer-motion";
import {
  ChevronLeft,
  Lock,
  MessageSquare,
  Pickaxe,
  Send,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Cell = {
  id: number;
  block: string;
  number: number;
  tunnel_progress: number;
  tunnel_discovered: boolean;
  locked_until: string | null;
  members: {
    id: number;
    nickname: string;
    tattoo: string;
    ap_current: number;
    ap_max: number;
  }[];
};

type Message = {
  id: number;
  author_id: number;
  body: string;
  created_at: string;
};

export default function PrisonBreakCellPage() {
  const router = useRouter();
  const params = useParams<{ cellId: string }>();
  const cellId = Number(params.cellId);
  const { user } = useAuth();

  const [cell, setCell] = useState<Cell | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [digging, setDigging] = useState(false);
  const [me, setMe] = useState<{ id: number; ap_current: number; ap_max: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const progressControls = useAnimation();

  const fetchCell = useCallback(async () => {
    try {
      const r = await api<Cell>(`/api/event/prison-break/cells/${cellId}`);
      setCell(r);
      void progressControls.start({
        width: `${r.tunnel_progress}%`,
        transition: { duration: 0.6, type: "spring", damping: 18 },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        toast.error("Это не твоя камера");
        router.push("/event/prison-break");
      } else if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
      }
    }
  }, [cellId, router, progressControls]);

  const fetchMessages = useCallback(async () => {
    try {
      const r = await api<Message[]>(
        `/api/event/prison-break/cells/${cellId}/messages`,
      );
      setMessages(r);
    } catch { /* ignore */ }
  }, [cellId]);

  const fetchMe = useCallback(async () => {
    try {
      const r = await api<{ player: { id: number; ap_current: number; ap_max: number } | null }>(
        "/api/event/prison-break/status",
      );
      if (r.player) setMe(r.player);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    void fetchCell();
    void fetchMessages();
    void fetchMe();
  }, [user, router, fetchCell, fetchMessages, fetchMe]);

  // WS subscription for live updates
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    if (!apiUrl) return;
    const wsUrl = apiUrl.replace(/^http(s?):/, "ws$1:") + "/api/event/prison-break/ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data) as {
          t: string;
          kind?: string;
          payload?: Record<string, unknown>;
        };
        if (m.t === "ping") {
          try { ws.send(JSON.stringify({ t: "pong" })); } catch { /* */ }
          return;
        }
        if (m.t === "event") {
          if (m.kind === "cell_chat" && (m.payload as { cell_id?: number }).cell_id === cellId) {
            const p = m.payload as {
              id: number; author_id: number; body: string; created_at: string;
              cell_id: number;
            };
            setMessages((prev) => {
              if (prev.some((x) => x.id === p.id)) return prev;
              return [...prev, p];
            });
          } else if (m.kind === "tunnel_progress" || m.kind === "tunnel_discovered") {
            void fetchCell();
            void fetchMe();
          }
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => { /* silent */ };
    return () => {
      try { ws.close(); } catch { /* */ }
    };
  }, [cellId, fetchCell, fetchMe]);

  // Auto-scroll on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = useCallback(async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      // Prefer WS (faster). Fallback to REST.
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: "chat", cell_id: cellId, body }));
      } else {
        await api(`/api/event/prison-break/cells/${cellId}/messages`, {
          method: "POST",
          body: JSON.stringify({ body }),
        });
        void fetchMessages();
      }
      setInput("");
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("Не отправилось");
    } finally {
      setSending(false);
    }
  }, [input, sending, cellId, fetchMessages]);

  const dig = useCallback(async () => {
    if (digging) return;
    setDigging(true);
    try {
      const r = await api<{
        ok: boolean;
        ap_remaining: number;
        message: string;
        payload: { delta?: number; progress?: number; busted?: boolean };
      }>("/api/event/prison-break/action", {
        method: "POST",
        body: JSON.stringify({
          action_type: "dig",
          idempotency_key: crypto.randomUUID(),
        }),
      });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      void fetchCell();
      void fetchMe();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("Ошибка");
    } finally {
      setDigging(false);
    }
  }, [digging, fetchCell, fetchMe]);

  if (!cell) {
    return (
      <div className="container py-12 text-center text-smoke">
        Загружаем камеру…
      </div>
    );
  }

  const locked = cell.locked_until && new Date(cell.locked_until) > new Date();

  return (
    <div className="container py-6">
      <Link
        href="/event/prison-break"
        className="mb-4 inline-flex items-center gap-1 text-xs text-smoke hover:text-bone"
      >
        <ChevronLeft className="h-3 w-3" />
        дашборд
      </Link>

      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-bone">
            <Lock className="h-6 w-6 text-flame" />
            Камера {cell.block}-{cell.number}
          </h1>
          <p className="mt-1 text-sm text-smoke">
            Закрытый чат + общий тоннель сокамерников
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Left column: tunnel + chat */}
        <div className="space-y-4">
          {/* Tunnel bar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "rounded-lg border p-4",
              cell.tunnel_discovered
                ? "border-flame/50 bg-flame/10"
                : "border-border bg-card",
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
                <Pickaxe className="h-3 w-3" />
                Прогресс тоннеля
              </div>
              <span
                className={cn(
                  "font-mono text-sm font-bold",
                  cell.tunnel_progress >= 100 ? "text-emerald-400" : "text-bone",
                )}
              >
                {cell.tunnel_progress}%
              </span>
            </div>
            <div className="relative h-4 overflow-hidden rounded-full border border-border bg-void">
              <motion.div
                className={cn(
                  "h-full",
                  cell.tunnel_discovered
                    ? "bg-gradient-to-r from-flame/60 to-flame"
                    : cell.tunnel_progress >= 100
                    ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                    : "bg-gradient-to-r from-flame/60 via-amber-500 to-amber-300",
                )}
                initial={{ width: `${cell.tunnel_progress}%` }}
                animate={progressControls}
                style={{ width: `${cell.tunnel_progress}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p
                className={cn(
                  "text-xs",
                  cell.tunnel_discovered ? "text-flame" : "text-smoke",
                )}
              >
                {cell.tunnel_discovered
                  ? "Охрана засекла. Камера заблокирована."
                  : locked
                  ? "В карцере. Копать нельзя."
                  : "Нажми «Копать» чтобы продвинуть."}
              </p>
              <button
                type="button"
                onClick={() => void dig()}
                disabled={
                  digging ||
                  cell.tunnel_discovered ||
                  Boolean(locked) ||
                  cell.tunnel_progress >= 100 ||
                  (me?.ap_current ?? 0) < 2
                }
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-bold uppercase tracking-widest transition-colors",
                  digging || cell.tunnel_discovered || locked || (me?.ap_current ?? 0) < 2
                    ? "border-border bg-void text-smoke opacity-50 cursor-not-allowed"
                    : "border-flame/50 bg-flame/15 text-flame hover:bg-flame/25",
                )}
              >
                <Pickaxe className="h-3 w-3" />
                копать (-2 AP)
              </button>
            </div>
          </motion.div>

          {/* Chat */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="rounded-lg border border-border bg-card"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-[10px] uppercase tracking-widest text-smoke">
              <MessageSquare className="h-3 w-3" />
              Чат камеры
            </div>
            <div className="max-h-[420px] min-h-[200px] overflow-y-auto p-3 space-y-2">
              {messages.length === 0 ? (
                <p className="text-center text-xs text-smoke italic">
                  Пусто. Напиши первое сообщение сокамерникам.
                </p>
              ) : (
                messages.map((m) => {
                  const author = cell.members.find((x) => x.id === m.author_id);
                  const isMe = me?.id === m.author_id;
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, x: isMe ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "flex gap-2 text-xs",
                        isMe ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-lg px-3 py-2",
                          isMe
                            ? "bg-flame/20 text-bone"
                            : "bg-void text-bone",
                        )}
                      >
                        {!isMe && (
                          <div className="mb-1 flex items-center gap-1 text-[10px] text-cyan">
                            <span>{author?.tattoo}</span>
                            <span className="font-semibold">{author?.nickname ?? "?"}</span>
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div className="mt-1 text-[9px] text-smoke">
                          {new Date(m.created_at).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
              className="flex border-t border-border"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="напиши сокамерникам…"
                maxLength={500}
                className="flex-1 bg-transparent px-4 py-3 text-sm text-bone placeholder:text-smoke focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="inline-flex h-12 items-center gap-1 border-l border-border px-4 text-xs uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/10 disabled:opacity-30"
              >
                <Send className="h-4 w-4" />
                отправить
              </button>
            </form>
          </motion.div>
        </div>

        {/* Right column: members */}
        <aside>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-smoke">
              <Users className="h-3 w-3" />
              Сокамерники
            </div>
            <ul className="space-y-2">
              {cell.members.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border/50 bg-void/40 p-2",
                    me?.id === m.id && "border-flame/40 bg-flame/5",
                  )}
                >
                  <span className="text-xl">{m.tattoo}</span>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-bone">
                      {m.nickname}
                      {me?.id === m.id && (
                        <span className="ml-1 text-[9px] text-flame">(ты)</span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-smoke">
                      AP {m.ap_current}/{m.ap_max}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
