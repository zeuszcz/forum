"use client";

import { motion } from "framer-motion";
import { BarChart3, Check, Lock, Vote } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { hasPerk } from "@/lib/perks";
import type { Poll } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PollWidgetProps {
  threadId: number;
  initialPoll: Poll | null;
  /** When true, even if user already voted, allow them to "show form" again
   *  (used by staff/admin overrides — not exposed in UI yet). */
  allowRevote?: boolean;
}

/**
 * Renders the thread poll. Two states:
 *  - hasVoted (or `closed`) → show results with animated bars
 *  - !hasVoted && canVote → show selectable options + Vote button
 *  - !hasVoted && !canVote → results-only with hint about lvl 5
 */
export function PollWidget({ threadId, initialPoll, allowRevote = false }: PollWidgetProps) {
  const { user } = useAuth();
  const [poll, setPoll] = React.useState<Poll | null>(initialPoll);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [showResultsForce, setShowResultsForce] = React.useState(false);

  // Refresh on mount (in case stale RSC data)
  React.useEffect(() => {
    let cancelled = false;
    api<Poll | null>(`/threads/${threadId}/poll`)
      .then((p) => {
        if (!cancelled && p) setPoll(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (!poll) return null;

  const hasVoted = poll.my_votes.length > 0;
  const canVote = !!user && hasPerk(user, "vote_polls");
  const showResults =
    showResultsForce || hasVoted || poll.closed || (!canVote && !user);

  function toggle(optionId: number) {
    if (poll === null) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        if (!poll.multi) next.clear();
        next.add(optionId);
      }
      return next;
    });
  }

  async function submitVote() {
    if (poll === null || selected.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      const res = await api<Poll>(`/polls/${poll.id}/vote`, {
        method: "POST",
        body: JSON.stringify({ option_ids: Array.from(selected) }),
      });
      setPoll(res);
      setSelected(new Set());
      toast.success("Голос засчитан");
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.detail);
      else toast.error("Не удалось проголосовать");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-lg border-2 border-cyan/30 bg-card">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 0% 0%, rgb(var(--cyan-rgb) / 0.25), transparent 70%)",
        }}
      />
      <header className="relative flex items-center gap-2 border-b border-cyan/20 px-4 py-3">
        <Vote className="h-4 w-4 text-cyan" />
        <h3 className="flex-1 text-sm font-semibold tracking-tight text-bone">
          {poll.question}
        </h3>
        {poll.closed && (
          <span className="inline-flex items-center gap-1 rounded-md border border-smoke/30 bg-smoke/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-smoke">
            <Lock className="h-2.5 w-2.5" />
            закрыт
          </span>
        )}
        {poll.multi && (
          <span className="rounded-md border border-cyan/40 bg-cyan/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-cyan">
            мульти
          </span>
        )}
      </header>

      <div className="relative space-y-2 p-4">
        {showResults
          ? poll.options.map((opt) => {
              const pct =
                poll.total_votes > 0
                  ? Math.round((opt.vote_count / poll.total_votes) * 100)
                  : 0;
              const mine = poll.my_votes.includes(opt.id);
              return (
                <div
                  key={opt.id}
                  className={cn(
                    "relative overflow-hidden rounded-md border bg-void/40 px-3 py-2",
                    mine ? "border-cyan/50" : "border-border",
                  )}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className={cn(
                      "absolute inset-y-0 left-0",
                      mine
                        ? "bg-gradient-to-r from-cyan/30 to-cyan/10"
                        : "bg-plasma/15",
                    )}
                  />
                  <div className="relative flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-bone">
                      {mine && <Check className="h-3.5 w-3.5 text-cyan" />}
                      {opt.text}
                    </span>
                    <span className="font-mono text-xs text-ash">
                      {opt.vote_count}{" "}
                      <span className="text-[10px] text-smoke">
                        ({pct}%)
                      </span>
                    </span>
                  </div>
                </div>
              );
            })
          : poll.options.map((opt) => {
              const isSelected = selected.has(opt.id);
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => toggle(opt.id)}
                  disabled={submitting}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border bg-void/40 px-3 py-2 text-left text-sm transition-colors",
                    isSelected
                      ? "border-cyan bg-cyan/10 text-bone"
                      : "border-border text-ash hover:border-cyan/40 hover:bg-cyan/5",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        isSelected ? "border-cyan bg-cyan" : "border-smoke/40",
                      )}
                    >
                      {isSelected && (
                        <Check className="h-3 w-3 text-void" strokeWidth={3} />
                      )}
                    </span>
                    {opt.text}
                  </span>
                </button>
              );
            })}
      </div>

      <footer className="relative flex flex-wrap items-center justify-between gap-2 border-t border-border bg-void/40 px-4 py-2.5">
        <div className="inline-flex items-center gap-2 text-[11px] text-smoke">
          <BarChart3 className="h-3 w-3" />
          <span className="font-mono">{poll.total_votes}</span>{" "}
          {poll.total_votes === 1 ? "голос" : "голос(ов)"}
        </div>
        {!showResults && canVote && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowResultsForce(true)}
              className="text-[11px] text-smoke transition-colors hover:text-ash"
            >
              посмотреть итоги
            </button>
            <Button
              type="button"
              size="sm"
              variant="gradient"
              disabled={selected.size === 0 || submitting}
              onClick={submitVote}
            >
              {submitting ? "…" : "Голосовать"}
            </Button>
          </div>
        )}
        {showResultsForce && !hasVoted && canVote && (
          <button
            type="button"
            onClick={() => setShowResultsForce(false)}
            className="text-[11px] text-cyan hover:underline"
          >
            ← голосовать
          </button>
        )}
        {!user && (
          <span className="text-[11px] text-smoke">
            войди, чтобы проголосовать
          </span>
        )}
        {user && !canVote && !hasVoted && (
          <span className="text-[11px] text-smoke">
            голосование с lvl 5
          </span>
        )}
        {hasVoted && !poll.closed && (
          <span className="text-[11px] text-cyan">твой голос засчитан</span>
        )}
        {allowRevote && hasVoted && (
          <span className="text-[11px] text-smoke">(revote allowed)</span>
        )}
      </footer>
    </section>
  );
}
