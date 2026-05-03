"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { motion } from "framer-motion";
import { SmilePlus } from "lucide-react";
import { useState } from "react";

import { HeartExplosion } from "@/components/effects/HeartExplosion";
import { api, ApiError } from "@/lib/api";
import { sfx } from "@/lib/audio";
import { useAuth } from "@/lib/auth-context";
import { REACTION_EMOJI, type ReactionKind } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ReactionsBarProps {
  postId: number;
  /** Initial counts of each reaction kind */
  initialCounts: Partial<Record<ReactionKind, number>>;
  /** Reaction kinds the current user has set */
  initialReacted: ReactionKind[];
}

const KINDS: ReactionKind[] = ["like", "fire", "laugh", "wow", "sad", "thinking"];

export function ReactionsBar({
  postId,
  initialCounts,
  initialReacted,
}: ReactionsBarProps) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<ReactionKind, number>>({
    like: initialCounts.like ?? 0,
    fire: initialCounts.fire ?? 0,
    laugh: initialCounts.laugh ?? 0,
    wow: initialCounts.wow ?? 0,
    sad: initialCounts.sad ?? 0,
    thinking: initialCounts.thinking ?? 0,
  });
  const [reacted, setReacted] = useState<Set<ReactionKind>>(
    new Set(initialReacted),
  );
  const [pending, setPending] = useState<ReactionKind | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function toggle(kind: ReactionKind) {
    if (!user || pending) return;
    setPending(kind);
    const wasReacted = reacted.has(kind);
    const prevCount = counts[kind];
    // Optimistic
    setCounts((c) => ({ ...c, [kind]: c[kind] + (wasReacted ? -1 : 1) }));
    setReacted((r) => {
      const next = new Set(r);
      if (wasReacted) next.delete(kind);
      else next.add(kind);
      return next;
    });
    if (!wasReacted) {
      setBurstKey(Date.now());
      sfx.like();
    }
    try {
      const r = await api<{ count: number; reacted: boolean }>(
        `/posts/${postId}/react?kind=${kind}`,
        { method: "POST" },
      );
      setCounts((c) => ({ ...c, [kind]: r.count }));
      setReacted((cur) => {
        const next = new Set(cur);
        if (r.reacted) next.add(kind);
        else next.delete(kind);
        return next;
      });
    } catch (err) {
      // Rollback
      setCounts((c) => ({ ...c, [kind]: prevCount }));
      setReacted((cur) => {
        const next = new Set(cur);
        if (wasReacted) next.add(kind);
        else next.delete(kind);
        return next;
      });
      if (err instanceof ApiError) console.error(err);
    } finally {
      setPending(null);
    }
  }

  // Visible buttons: only kinds with at least one reaction or that user has set
  const visibleKinds = KINDS.filter(
    (k) => counts[k] > 0 || reacted.has(k),
  );

  return (
    <div className="flex items-center gap-1.5">
      {/* Active reactions as pills */}
      {visibleKinds.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => toggle(k)}
          disabled={!user || pending !== null}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-all duration-150 ease-premium disabled:cursor-not-allowed disabled:opacity-50",
            reacted.has(k)
              ? "border-flame/40 bg-flame/10 text-flame shadow-glow-flame"
              : "border-border bg-card text-ash hover:border-plasma/40 hover:bg-slate hover:text-bone",
          )}
          title={
            reacted.has(k)
              ? `убрать реакцию ${REACTION_EMOJI[k]}`
              : `поставить ${REACTION_EMOJI[k]}`
          }
        >
          <span aria-hidden="true">{REACTION_EMOJI[k]}</span>
          <span className="font-mono text-[11px]">{counts[k]}</span>
        </button>
      ))}

      {/* "+ react" picker */}
      {user && (
        <PopoverPrimitive.Root open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              className="relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-ash transition-colors hover:border-border hover:bg-slate hover:text-bone"
              title="Добавить реакцию"
              aria-label="Добавить реакцию"
            >
              <SmilePlus className="h-3.5 w-3.5" />
              <HeartExplosion triggerKey={burstKey} />
            </button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              align="end"
              sideOffset={6}
              className="z-50"
              asChild
            >
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-1 rounded-lg p-1.5 glass-strong shadow-xl"
              >
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setPickerOpen(false);
                      toggle(k);
                    }}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md text-xl transition-all duration-150 hover:scale-125 hover:bg-slate",
                      reacted.has(k) && "bg-flame/15",
                    )}
                    aria-label={k}
                  >
                    {REACTION_EMOJI[k]}
                  </button>
                ))}
              </motion.div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      )}
    </div>
  );
}
