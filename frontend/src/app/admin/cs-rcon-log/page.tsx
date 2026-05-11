"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  Filter,
  RotateCw,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { exactTime, relativeTime } from "@/lib/format";
import type { CsRconLogRead } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE = 100;

export default function CsRconLogPage() {
  const [rows, setRows] = useState<CsRconLogRead[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (beforeId: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams();
        q.set("limit", String(PAGE));
        if (beforeId) q.set("before_id", String(beforeId));
        if (mineOnly) q.set("mine", "true");
        const data = await api<CsRconLogRead[]>(`/cs-rcon/log?${q}`);
        if (beforeId == null) setRows(data);
        else setRows((prev) => [...prev, ...data]);
        setHasMore(data.length >= PAGE);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить");
      } finally {
        setLoading(false);
      }
    },
    [mineOnly],
  );

  useEffect(() => {
    void fetchPage(null);
  }, [fetchPage]);

  function loadMore() {
    if (rows.length === 0) return;
    void fetchPage(rows[rows.length - 1]!.id);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-bone">
            <Terminal className="h-4 w-4 text-flame" />
            RCON-аудит
          </h1>
          <p className="text-xs text-smoke">
            Каждое нажатие «▶ Запустить» в{" "}
            <Link href="/tools/bind-builder" className="link-plasma">
              конструкторе биндов
            </Link>{" "}
            попадает сюда — кто, что, когда, с каким ответом.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-ash">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
              className="h-3 w-3 accent-plasma"
            />
            <Filter className="h-3 w-3" />
            только мои
          </label>
          <button
            type="button"
            onClick={() => fetchPage(null)}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-ash hover:border-plasma/40 hover:text-bone disabled:opacity-50"
          >
            <RotateCw className={cn("h-3 w-3", loading && "animate-spin")} />
            обновить
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-ember/40 bg-ember/5 p-3 text-xs text-ember">
          {error}
        </div>
      )}

      {rows.length === 0 && !loading && (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-smoke">
          Пока никто не запускал RCON-команды с форума.
        </div>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start gap-3 px-4 py-2.5">
              <div
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                  row.success
                    ? "border-success/40 bg-success/10"
                    : "border-ember/40 bg-ember/10",
                )}
              >
                {row.success ? (
                  <CheckCircle2 className="h-3 w-3 text-success" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-ember" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-smoke">
                  {row.actor_nickname ? (
                    <Link
                      href={`/u/${row.actor_nickname}`}
                      className="font-semibold text-plasma transition-colors hover:text-plasma/80"
                    >
                      @{row.actor_nickname}
                    </Link>
                  ) : row.actor_id ? (
                    <span>actor #{row.actor_id}</span>
                  ) : (
                    <span>—</span>
                  )}
                  <span title={exactTime(row.created_at)}>
                    {relativeTime(row.created_at)}
                  </span>
                  {row.latency_ms != null && (
                    <span className="font-mono text-smoke/70">
                      {row.latency_ms} ms
                    </span>
                  )}
                </div>
                <code className="mt-0.5 block break-all font-mono text-xs text-ash">
                  {row.command}
                </code>
                {row.error && (
                  <p className="mt-0.5 text-[11px] italic text-ember">
                    ⚠ {row.error}
                  </p>
                )}
                {row.response && (
                  <pre className="mt-1 overflow-x-auto rounded bg-void/50 p-1.5 font-mono text-[10px] text-iridescent">
                    {row.response.slice(0, 400)}
                    {row.response.length > 400 ? "…" : ""}
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && rows.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-smoke transition-colors hover:border-plasma/40 hover:text-ash disabled:opacity-50"
          >
            <ChevronUp className="h-3 w-3 rotate-180" />
            ещё
          </button>
        </div>
      )}
    </div>
  );
}
