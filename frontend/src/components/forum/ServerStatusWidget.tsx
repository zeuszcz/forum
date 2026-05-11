"use client";

import { motion } from "framer-motion";
import { Check, Copy, Server, Users, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { CsServerStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Live CS 1.6 jail server widget. Backed by GET /shoutbox/server-status
 * which does a real A2S_INFO query against the configured address with a
 * 5-second server-side cache. We poll every 15s on the client.
 *
 * When the server is unreachable the endpoint still returns a complete
 * shape with `online=false`; we render an offline state and keep the
 * connect button so the user can still copy the address. */

const POLL_MS = 15_000;

export function ServerStatusWidget() {
  const [status, setStatus] = useState<CsServerStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api<CsServerStatus>("/shoutbox/server-status");
        if (alive) setStatus(s);
      } catch {
        /* swallow */
      }
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  function copyConnect() {
    if (!status || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(`connect ${status.address}`)
      .then(() => {
        setCopied(true);
        toast.success("connect-команда в буфере");
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Не удалось скопировать"));
  }

  const online = Boolean(status?.online);
  const fillPct = status
    ? Math.min(100, (status.players / Math.max(status.max_players, 1)) * 100)
    : 0;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card",
        online ? "border-cyan/30" : "border-border",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-50"
        style={{
          background: online
            ? "radial-gradient(ellipse 60% 100% at 50% 0%, rgb(var(--cyan-rgb) / 0.18), transparent 70%)"
            : "radial-gradient(ellipse 60% 100% at 50% 0%, rgb(var(--border-rgb, 60 60 80) / 0.2), transparent 70%)",
        }}
      />

      <header
        className={cn(
          "relative flex items-center justify-between border-b px-4 py-3",
          online ? "border-cyan/15" : "border-border",
        )}
      >
        <div className="inline-flex items-center gap-2">
          <Server className={cn("h-4 w-4", online ? "text-cyan" : "text-smoke")} />
          <h2 className="text-sm font-semibold tracking-tight text-bone">
            CS 1.6 сервер
          </h2>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              online ? "bg-cyan animate-pulse-slow" : "bg-smoke/50",
            )}
          />
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-widest",
              online ? "text-cyan" : "text-smoke",
            )}
          >
            {status ? (online ? "online" : "offline") : "…"}
          </span>
        </div>
      </header>

      <div className="relative space-y-3 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-smoke">имя</div>
          <div className="truncate text-sm font-semibold text-bone">
            {status?.name ?? "…"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-smoke">
              карта
            </div>
            <motion.div
              key={status?.map ?? "—"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={cn(
                "truncate font-mono text-xs",
                online ? "text-cyan" : "text-smoke",
              )}
            >
              {status?.map ?? "—"}
            </motion.div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-smoke">
              пинг
            </div>
            <div className="font-mono text-xs text-ash">
              <Wifi className="mr-1 inline h-3 w-3" />
              {status?.ping_ms != null ? `${status.ping_ms} ms` : "—"}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between text-[10px] uppercase tracking-widest text-smoke">
            <span>
              <Users className="mr-1 inline h-3 w-3" />
              игроки
            </span>
            <span>
              <span className="font-mono text-bone">{status?.players ?? 0}</span>
              {" / "}
              {status?.max_players ?? 32}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-void">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: online
                  ? "linear-gradient(90deg, rgb(var(--cyan-rgb)), rgb(var(--plasma-rgb)))"
                  : "rgb(var(--smoke-rgb, 100 100 120) / 0.4)",
                boxShadow: online ? "0 0 8px rgb(var(--cyan-rgb) / 0.6)" : undefined,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${fillPct}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={copyConnect}
          disabled={!status}
          className={cn(
            "group flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-mono transition-colors disabled:opacity-50",
            copied
              ? "border-success/40 bg-success/10 text-success"
              : "border-border bg-void/60 text-ash hover:border-cyan/40 hover:bg-cyan/5 hover:text-bone",
          )}
        >
          <span className="truncate">
            <span className="text-smoke">$</span> connect {status?.address ?? "…"}
          </span>
          {copied ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Copy className="h-3.5 w-3.5 shrink-0 transition-colors group-hover:text-cyan" />
          )}
        </button>
      </div>
    </section>
  );
}
