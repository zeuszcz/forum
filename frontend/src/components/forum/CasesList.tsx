"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Key, Package, Sparkles, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CaseItemDef {
  id: number;
  title: string;
  rarity: string;
  weight: number;
  reward_kind: string;
  reward_value: number;
  reward_payload: string | null;
  icon_color: string | null;
}
interface CaseDef {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
  key_cost: number;
  items: CaseItemDef[];
}

interface OpenResult {
  case: { id: number; slug: string; title: string };
  reward: CaseItemDef;
  remaining_keys: number;
  bonus_xp: number;
}

const RARITY_COLOR: Record<string, string> = {
  common: "#a0a3b8",
  uncommon: "#22d3ee",
  rare: "#7c5cff",
  epic: "#ec4899",
  legendary: "#facc15",
};

export function CasesList({
  cases,
  initialKeys,
}: {
  cases: CaseDef[];
  initialKeys: number;
}) {
  const [keys, setKeys] = React.useState(initialKeys);
  const [opening, setOpening] = React.useState<number | null>(null);
  const [result, setResult] = React.useState<OpenResult | null>(null);

  async function openCase(c: CaseDef) {
    if (opening !== null) return;
    if (keys < c.key_cost) {
      toast.error("Не хватает ключей");
      return;
    }
    setOpening(c.id);
    try {
      const r = await api<OpenResult>(`/cases/${c.id}/open`, { method: "POST" });
      setKeys(r.remaining_keys);
      setResult(r);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Не удалось открыть");
    } finally {
      setOpening(null);
    }
  }

  return (
    <>
      <header className="mb-6 flex items-center justify-between rounded-lg border border-flame/30 bg-flame/5 p-4">
        <div className="inline-flex items-center gap-2.5">
          <Key className="h-5 w-5 text-flame" />
          <span className="text-sm text-ash">Твои ключи:</span>
          <span className="font-mono text-2xl font-bold text-flame">{keys}</span>
        </div>
        <a
          href="/"
          className="text-[11px] uppercase tracking-widest text-smoke hover:text-ash"
        >
          ← на главную
        </a>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cases.map((c) => (
          <CaseCard
            key={c.id}
            caseDef={c}
            keys={keys}
            opening={opening === c.id}
            onOpen={() => openCase(c)}
          />
        ))}
      </div>

      {/* Drop-result modal */}
      <AnimatePresence>
        {result && <DropModal result={result} onClose={() => setResult(null)} />}
      </AnimatePresence>
    </>
  );
}

function CaseCard({
  caseDef,
  keys,
  opening,
  onOpen,
}: {
  caseDef: CaseDef;
  keys: number;
  opening: boolean;
  onOpen: () => void;
}) {
  const totalWeight = caseDef.items.reduce((s, i) => s + i.weight, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden rounded-lg border-2 border-plasma/30 bg-card"
    >
      <div className="relative bg-gradient-to-br from-plasma/15 via-flame/5 to-cyan/10 p-6 text-center">
        <Package className="mx-auto h-16 w-16 text-plasma" />
        <h3 className="mt-3 text-lg font-bold tracking-tight text-bone">
          {caseDef.title}
        </h3>
        <p className="mt-1 text-[11px] text-smoke">{caseDef.description}</p>
      </div>

      <div className="space-y-1 px-3 py-3 text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
          Шансы дропа
        </div>
        {caseDef.items.map((item) => {
          const pct = (item.weight / totalWeight) * 100;
          const c = item.icon_color ?? RARITY_COLOR[item.rarity] ?? "#a0a3b8";
          return (
            <div key={item.id} className="flex items-center justify-between gap-2">
              <span style={{ color: c }} className="truncate">
                {item.title}
              </span>
              <span className="font-mono text-[10px] text-smoke">
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border bg-void/40 p-3">
        <Button
          variant="gradient"
          size="md"
          disabled={opening || keys < caseDef.key_cost}
          onClick={onOpen}
          className="w-full"
        >
          <Key className="h-3.5 w-3.5" />
          {opening
            ? "Открываем…"
            : keys < caseDef.key_cost
              ? `Нужно ${caseDef.key_cost} ключ(а)`
              : `Открыть · ${caseDef.key_cost} ключ`}
        </Button>
      </div>
    </motion.div>
  );
}

function DropModal({
  result,
  onClose,
}: {
  result: OpenResult;
  onClose: () => void;
}) {
  const c = result.reward.icon_color ?? RARITY_COLOR[result.reward.rarity] ?? "#7c5cff";
  return (
    <motion.div
      role="dialog"
      aria-label="Награда"
      className="fixed inset-0 z-[80] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        initial={{ scale: 0.6, y: 30, rotateX: -20 }}
        animate={{ scale: 1, y: 0, rotateX: 0 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-[92vw] max-w-md overflow-hidden rounded-2xl glass-strong"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-smoke transition-colors hover:bg-slate hover:text-bone"
        >
          <X className="h-4 w-4" />
        </button>

        <div
          className="relative px-6 pt-12 pb-6 text-center"
          style={{
            background: `radial-gradient(ellipse at center, ${c}33, transparent 70%)`,
          }}
        >
          <motion.div
            animate={{ scale: [0.5, 1.2, 1], rotate: [0, 360] }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mb-3 inline-flex"
          >
            <Sparkles className="h-16 w-16" style={{ color: c }} />
          </motion.div>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: c }}>
            {result.reward.rarity}
          </p>
          <h3 className="mt-1 text-xl font-bold text-bone">{result.reward.title}</h3>
          <p className="mt-3 text-xs text-smoke">из «{result.case.title}»</p>
        </div>

        <div className="grid grid-cols-2 gap-px border-t border-border bg-border">
          <div className="bg-card px-4 py-3 text-center">
            <div className="font-mono text-lg font-bold text-flame">
              {result.remaining_keys}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-smoke">
              ключей осталось
            </div>
          </div>
          <div className="bg-card px-4 py-3 text-center">
            <div className="font-mono text-lg font-bold text-cyan">
              {result.bonus_xp}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-smoke">
              бонус XP
            </div>
          </div>
        </div>

        <div className="bg-card p-3">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
