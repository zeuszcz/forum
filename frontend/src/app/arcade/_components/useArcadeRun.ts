"use client";

import { useCallback, useRef, useState } from "react";

import { api, ApiError } from "@/lib/api";

export type StartRunResponse = {
  run_id: number;
  seed: number;
  started_at: string;
  client_version: string;
};

export type EndRunResponse = {
  ok: boolean;
  accepted: boolean;
  reason: string | null;
  score: number;
  rank_in_month: number | null;
  rank_all_time: number | null;
};

export type ArcadeRunState =
  | { phase: "idle" }
  | { phase: "starting" }
  | {
      phase: "running";
      runId: number;
      seed: number;
      startedAtMs: number;
    }
  | { phase: "submitting" }
  | {
      phase: "ended";
      score: number;
      accepted: boolean;
      reason: string | null;
      rankMonth: number | null;
      rankAll: number | null;
    };

const CLIENT_VERSION = "v1";

/** Manages start/end of an arcade run + last submission outcome. */
export function useArcadeRun(slug: string) {
  const [state, setState] = useState<ArcadeRunState>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef<{ runId: number; startedAtMs: number; seed: number } | null>(
    null,
  );

  const start = useCallback(async () => {
    setError(null);
    setState({ phase: "starting" });
    try {
      const res = await api<StartRunResponse>(
        `/api/arcade/games/${slug}/start`,
        {
          method: "POST",
          body: JSON.stringify({ client_version: CLIENT_VERSION }),
        },
      );
      const ms = Date.now();
      ranRef.current = { runId: res.run_id, startedAtMs: ms, seed: res.seed };
      setState({
        phase: "running",
        runId: res.run_id,
        seed: res.seed,
        startedAtMs: ms,
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : "не удалось начать";
      setError(msg);
      setState({ phase: "idle" });
    }
  }, [slug]);

  const end = useCallback(
    async (
      score: number,
      replay: { milestones?: unknown[]; input_log?: unknown[]; meta?: unknown },
    ) => {
      const r = ranRef.current;
      if (!r) return;
      setState({ phase: "submitting" });
      const duration = Math.max(0, Date.now() - r.startedAtMs);
      try {
        const res = await api<EndRunResponse>(
          `/api/arcade/games/${slug}/end`,
          {
            method: "POST",
            body: JSON.stringify({
              run_id: r.runId,
              score,
              duration_ms: duration,
              replay: { ...replay, version: CLIENT_VERSION, seed: r.seed },
            }),
          },
        );
        setState({
          phase: "ended",
          score: res.score,
          accepted: res.accepted,
          reason: res.reason,
          rankMonth: res.rank_in_month,
          rankAll: res.rank_all_time,
        });
        ranRef.current = null;
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : "не удалось сохранить";
        setError(msg);
        setState({ phase: "idle" });
      }
    },
    [slug],
  );

  const reset = useCallback(() => {
    ranRef.current = null;
    setError(null);
    setState({ phase: "idle" });
  }, []);

  return { state, error, start, end, reset };
}

/**
 * Mulberry32 — same algorithm we use everywhere for deterministic
 * client-side RNG seeded from server-issued seed.
 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
