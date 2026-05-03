"use client";

import { motion } from "framer-motion";
import * as React from "react";

import { LetterAvatar } from "@/components/ui/avatar";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { nickColor } from "@/lib/perks";
import type { UserPublic } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MentionTextareaProps extends Omit<TextareaProps, "onChange" | "value"> {
  value: string;
  onChange: (next: string) => void;
}

const MENTION_RE = /(?:^|\s)@([a-z0-9_\-\.]{1,32})$/i;

/**
 * Textarea wrapper that detects `@partial` token at the cursor and shows a
 * popover with matching nicknames from /users/search?q=. Arrow keys navigate,
 * Enter / Tab insert, Esc closes. Click also inserts.
 */
export const MentionTextarea = React.forwardRef<
  HTMLTextAreaElement,
  MentionTextareaProps
>(function MentionTextarea({ value, onChange, ...rest }, refExt) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
  React.useImperativeHandle(refExt, () => innerRef.current as HTMLTextAreaElement);

  const [suggestions, setSuggestions] = React.useState<UserPublic[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [query, setQuery] = React.useState("");

  // Debounced search
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const r = await api<UserPublic[]>(
          `/users/search?q=${encodeURIComponent(query)}&limit=6`,
        );
        setSuggestions(r);
        setActive(0);
      } catch {
        setSuggestions([]);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [query, open]);

  function detectMention(text: string, caretPos: number) {
    const upToCaret = text.slice(0, caretPos);
    const m = upToCaret.match(MENTION_RE);
    if (!m) {
      setOpen(false);
      return;
    }
    setQuery(m[1]);
    setOpen(true);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    detectMention(next, e.target.selectionStart ?? next.length);
  }

  function handleKeyUp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "Home" ||
      e.key === "End"
    ) {
      const ta = e.currentTarget;
      detectMention(ta.value, ta.selectionStart ?? ta.value.length);
    }
  }

  function insertMention(nickname: string) {
    const ta = innerRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const replaced = before.replace(MENTION_RE, (full) => {
      const prefix = full.startsWith("@") ? "" : full[0]; // preserve leading whitespace if any
      return `${prefix}@${nickname} `;
    });
    const next = replaced + after;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      const newCaret = replaced.length;
      ta.focus();
      ta.setSelectionRange(newCaret, newCaret);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const pick = suggestions[active];
      if (pick) insertMention(pick.nickname);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Textarea
        {...rest}
        ref={innerRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      />
      {open && suggestions.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
          className="absolute z-30 mt-1 w-72 max-w-full overflow-hidden rounded-lg glass-strong shadow-xl"
        >
          <div className="border-b border-white/5 px-3 py-1.5 text-[10px] uppercase tracking-widest text-smoke">
            mention — ↑↓ enter
          </div>
          {suggestions.map((u, i) => {
            const role = u.roles?.[0];
            const color = nickColor(u);
            return (
              <li
                key={u.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => insertMention(u.nickname)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors",
                  i === active ? "bg-plasma/15 text-bone" : "text-ash hover:bg-slate",
                )}
              >
                <LetterAvatar nickname={u.nickname} size={20} />
                <span
                  className="flex-1 truncate font-semibold"
                  style={{ color }}
                >
                  {u.nickname}
                </span>
                {role && (
                  <span
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: role.color }}
                  >
                    {role.title}
                  </span>
                )}
              </li>
            );
          })}
        </motion.ul>
      )}
    </div>
  );
});
