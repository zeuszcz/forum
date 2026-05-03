"use client";

import { motion } from "framer-motion";
import { ListChecks, Plus, Trash2, Vote, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { hasPerk, isStaff } from "@/lib/perks";
import type { Poll } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PollComposerProps {
  threadId: number;
  threadAuthorId: number | null | undefined;
  onCreated: (poll: Poll) => void;
}

const MAX_OPTIONS = 10;
const MIN_OPTIONS = 2;

export function PollComposer({
  threadId,
  threadAuthorId,
  onCreated,
}: PollComposerProps) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState<string[]>(["", ""]);
  const [multi, setMulti] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Show only to author (or staff) who has the perk
  const isAuthor = !!user && threadAuthorId !== null && user.id === threadAuthorId;
  const canCreate =
    !!user && (isAuthor || isStaff(user)) && hasPerk(user, "create_polls");

  if (!canCreate) return null;

  const cleanOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
  const valid =
    question.trim().length >= 4 &&
    cleanOptions.length >= MIN_OPTIONS &&
    cleanOptions.length <= MAX_OPTIONS &&
    new Set(cleanOptions).size === cleanOptions.length;

  function setOpt(i: number, v: string) {
    setOptions((prev) => prev.map((o, j) => (j === i ? v : o)));
  }

  function addOpt() {
    setOptions((prev) => (prev.length < MAX_OPTIONS ? [...prev, ""] : prev));
  }

  function removeOpt(i: number) {
    setOptions((prev) =>
      prev.length > MIN_OPTIONS ? prev.filter((_, j) => j !== i) : prev,
    );
  }

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const poll = await api<Poll>(`/threads/${threadId}/poll`, {
        method: "POST",
        body: JSON.stringify({
          question: question.trim(),
          multi,
          options: cleanOptions.map((text) => ({ text })),
        }),
      });
      toast.success("Опрос создан");
      onCreated(poll);
      setOpen(false);
      setQuestion("");
      setOptions(["", ""]);
      setMulti(false);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.detail);
      else toast.error("Не удалось создать опрос");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-cyan/40 bg-cyan/5 px-4 py-2.5 text-xs font-medium text-cyan transition-colors hover:bg-cyan/10"
      >
        <Vote className="h-3.5 w-3.5" />
        Прикрепить опрос к теме
      </button>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden rounded-lg border-2 border-cyan/40 bg-card"
    >
      <header className="flex items-center gap-2 border-b border-cyan/20 bg-cyan/10 px-4 py-2.5">
        <ListChecks className="h-4 w-4 text-cyan" />
        <h3 className="text-sm font-semibold text-bone">Новый опрос</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto rounded-md p-1 text-smoke transition-colors hover:bg-slate hover:text-bone"
          aria-label="Закрыть"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="space-y-3 p-4">
        <div>
          <label
            htmlFor="poll-question"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-smoke"
          >
            Вопрос
          </label>
          <Input
            id="poll-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Что хочешь спросить?"
            maxLength={280}
            className="bg-void/40"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-smoke">
              Варианты ответа
            </label>
            <span className="font-mono text-[10px] text-smoke">
              {options.length}/{MAX_OPTIONS}
            </span>
          </div>
          <div className="space-y-1.5">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-smoke">
                  {i + 1}.
                </span>
                <Input
                  value={opt}
                  onChange={(e) => setOpt(i, e.target.value)}
                  placeholder={`Вариант ${i + 1}`}
                  maxLength={120}
                  className="bg-void/40"
                />
                {options.length > MIN_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => removeOpt(i)}
                    className="rounded-md p-1.5 text-smoke transition-colors hover:bg-ember/10 hover:text-ember"
                    aria-label="Удалить вариант"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOpt}
              className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-cyan transition-colors hover:text-cyan/80"
            >
              <Plus className="h-3 w-3" />
              добавить вариант
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-ash">
          <input
            type="checkbox"
            checked={multi}
            onChange={(e) => setMulti(e.target.checked)}
            className={cn(
              "h-4 w-4 rounded border-border bg-void accent-cyan",
            )}
          />
          разрешить выбрать несколько вариантов
        </label>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border bg-void/40 px-4 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          Отмена
        </Button>
        <Button
          type="button"
          variant="gradient"
          size="sm"
          disabled={!valid || submitting}
          onClick={submit}
        >
          {submitting ? "Создаём…" : "Создать опрос"}
        </Button>
      </footer>
    </motion.section>
  );
}
