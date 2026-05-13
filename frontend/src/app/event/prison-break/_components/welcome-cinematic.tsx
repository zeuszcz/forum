"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type PlayerMe = {
  nickname: string;
  tattoo: string;
  article: string;
  role: string | null;
  block: string | null;
  cell_id: number | null;
};

/**
 * Day 0 cinematic. Shown once per player per event.
 * - Typewriter intro
 * - Player card slides in
 * - Mission text typewriter
 * - "ENTER" button to dismiss
 */
export function WelcomeCinematic({
  player,
  onClose,
}: {
  player: PlayerMe;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  // Advance through the script automatically; user can also click to skip.
  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 1500);
    const t2 = setTimeout(() => setStep(2), 3000);
    const t3 = setTimeout(() => setStep(3), 4800);
    const t4 = setTimeout(() => setStep(4), 6600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-void/95 backdrop-blur"
    >
      {/* Pulsing prison silhouette */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center text-flame/10"
        animate={{ opacity: [0.05, 0.18, 0.05] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg viewBox="0 0 200 100" className="h-full w-full">
          <rect x="20" y="40" width="20" height="50" fill="currentColor" />
          <rect x="50" y="30" width="20" height="60" fill="currentColor" />
          <rect x="80" y="20" width="40" height="70" fill="currentColor" />
          <rect x="130" y="30" width="20" height="60" fill="currentColor" />
          <rect x="160" y="40" width="20" height="50" fill="currentColor" />
          {/* Spotlight beams */}
          <line x1="100" y1="20" x2="60" y2="0" stroke="currentColor" strokeWidth="0.3" />
          <line x1="100" y1="20" x2="140" y2="0" stroke="currentColor" strokeWidth="0.3" />
        </svg>
      </motion.div>

      {/* Content */}
      <div className="relative z-10 max-w-xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-2 font-mono text-xs uppercase tracking-widest text-flame"
        >
          {step >= 0 && <TypeText text="ТЮРЕМНАЯ КАНЦЕЛЯРИЯ" />}
        </motion.div>

        {step >= 1 && (
          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, type: "spring", damping: 14 }}
            className="text-3xl font-bold text-bone"
          >
            <TypeText text={`Добро пожаловать в Блок ${player.block ?? "?"}, камера ${player.cell_id ?? "?"}`} />
          </motion.h1>
        )}

        {step >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, type: "spring", damping: 16 }}
            className="mt-6 rounded-lg border border-flame/30 bg-flame/5 p-5 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-4xl">{player.tattoo}</span>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-smoke">
                  Заключённый
                </div>
                <div className="text-lg font-bold text-bone">{player.nickname}</div>
                {player.article && (
                  <div className="text-xs italic text-smoke">«{player.article}»</div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {step >= 3 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="mt-5 text-sm text-smoke leading-relaxed"
          >
            <TypeText
              text={
                player.role
                  ? "Роль уже распределена. Помни: на форуме ты в игре. Никому не доверяй на пустом месте."
                  : "Жди начала сезона. В Day 0 роль будет назначена."
              }
            />
          </motion.p>
        )}

        {step >= 4 && (
          <motion.button
            type="button"
            onClick={onClose}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-md border border-flame/40 bg-flame/20 px-6 text-sm font-bold uppercase tracking-widest text-flame transition-colors hover:bg-flame/30"
          >
            войти в игру
          </motion.button>
        )}
      </div>

      {/* Skip */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 text-xs uppercase text-smoke hover:text-bone"
      >
        пропустить →
      </button>
    </motion.div>
  );
}

function TypeText({ text }: { text: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const step = () => setShown((n) => (n < text.length ? n + 1 : n));
    const id = setInterval(step, 28);
    return () => clearInterval(id);
  }, [text]);
  return <>{text.slice(0, shown)}</>;
}
