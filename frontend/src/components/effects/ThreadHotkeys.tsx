"use client";

import { useEffect } from "react";

interface Props {
  /** thread id — for keyboard navigation between posts */
  threadId?: number;
}

/**
 * Global thread-page keyboard shortcuts:
 *   j     next post
 *   k     prev post
 *   r     focus reply textarea
 *   q     quote currently-focused post (if any)
 *   t     scroll to top
 *   esc   blur active input
 *
 * Listener attaches at /t/[id] page only (mounted in ThreadView).
 * No-ops while user is typing in input/textarea.
 */
export function ThreadHotkeys(_props: Props) {
  useEffect(() => {
    function isTyping(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable
      );
    }

    function postElements(): HTMLElement[] {
      return Array.from(
        document.querySelectorAll('[id^="post-"]'),
      ) as HTMLElement[];
    }

    function nearestPostInView(): HTMLElement | null {
      const posts = postElements();
      if (posts.length === 0) return null;
      const viewportTop = window.scrollY;
      // Find first post whose top is below 100px from viewport top
      let best: { el: HTMLElement; dist: number } | null = null;
      for (const el of posts) {
        const top = el.getBoundingClientRect().top + window.scrollY;
        const dist = Math.abs(top - viewportTop - 100);
        if (best === null || dist < best.dist) {
          best = { el, dist };
        }
      }
      return best?.el ?? null;
    }

    function indexOfCurrent(): number {
      const posts = postElements();
      const current = nearestPostInView();
      if (!current) return -1;
      return posts.indexOf(current);
    }

    function jumpTo(el: HTMLElement) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;

      const posts = postElements();
      if (posts.length === 0) return;
      const cur = indexOfCurrent();

      if (e.key === "j") {
        e.preventDefault();
        const next = posts[Math.min(cur + 1, posts.length - 1)];
        if (next) jumpTo(next);
      } else if (e.key === "k") {
        e.preventDefault();
        const prev = posts[Math.max(cur - 1, 0)];
        if (prev) jumpTo(prev);
      } else if (e.key === "r") {
        e.preventDefault();
        const ta = document.querySelector<HTMLTextAreaElement>(
          'form textarea[placeholder*="ответ"], form textarea[placeholder*="Твой ответ"]',
        );
        if (ta) {
          ta.focus();
          ta.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else if (e.key === "t") {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (e.key === "Escape") {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
