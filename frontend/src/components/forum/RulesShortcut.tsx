"use client";

import { motion } from "framer-motion";
import { ArrowRight, Scroll, ShieldCheck } from "lucide-react";
import Link from "next/link";

/**
 * Prominent home-page shortcut to the server rules thread.
 * Mounted under the section list. Hard-codes the thread id since rules are
 * pinned content the admin team maintains — no need to fetch a section.
 */
export function RulesShortcut({ threadId = 3 }: { threadId?: number }) {
  return (
    <Link
      href={`/t/${threadId}`}
      className="group relative block overflow-hidden rounded-xl border-2 border-plasma/40 bg-gradient-to-br from-plasma/15 via-flame/5 to-cyan/10 p-5 transition-all hover:border-plasma/70 hover:shadow-glow-plasma"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 100% 0%, rgb(var(--plasma-rgb) / 0.25), transparent 70%)",
        }}
      />
      <div className="relative flex items-center gap-4">
        <motion.div
          initial={{ rotate: -8 }}
          whileHover={{ rotate: 0, scale: 1.05 }}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-plasma/50 bg-plasma/20"
        >
          <Scroll className="h-7 w-7 text-plasma" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-plasma">
            <ShieldCheck className="h-3 w-3" />
            обязательно к прочтению
          </div>
          <h3 className="truncate text-lg font-bold tracking-tight text-bone md:text-xl">
            📜 Правила сервера
          </h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-ash">
            8 разделов: игровой процесс, коммуникация, ТТ, КТ, начальник,
            привилегии, ФД, дуэли
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-widest text-plasma transition-transform group-hover:translate-x-1 sm:flex">
          читать
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
