"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Hammer, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Recipe = {
  slug: string;
  name: string;
  emoji: string;
  ap_cost: number;
  cost_money: number;
  cost_scrap: number;
  cost_paper: number;
  required_taps: number;
  description: string;
  effect_summary: string;
};

type Inventory = {
  id: number;
  item_type: string;
  quality: string;
  acquired_at: string;
};

type CraftState = {
  active: boolean;
  recipe?: Recipe | null;
  tap_count: number;
  required_taps: number;
  perfect_count: number;
  perfect_ratio: number;
  complete: boolean;
  quality?: string | null;
  item_name?: string | null;
  item_emoji?: string | null;
};

type Player = {
  ap_current: number;
  ap_max: number;
  money: number;
  resource_scrap: number;
  resource_paper: number;
};

export default function WorkshopPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [state, setState] = useState<CraftState>({
    active: false, tap_count: 0, required_taps: 0,
    perfect_count: 0, perfect_ratio: 0, complete: false,
  });
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<CraftState | null>(null);

  const lastTapAtRef = useRef<number>(0);
  const [hitPulse, setHitPulse] = useState(0);
  const [perfectFlash, setPerfectFlash] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [rcs, inv, st] = await Promise.all([
        api<Recipe[]>("/api/event/prison-break/workshop/recipes"),
        api<Inventory[]>("/api/event/prison-break/workshop/inventory"),
        api<{ player: Player | null }>("/api/event/prison-break/status"),
      ]);
      setRecipes(rcs);
      setInventory(inv);
      if (st.player) setPlayer(st.player);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    void refresh();
  }, [user, router, refresh]);

  const startCraft = useCallback(async (slug: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<CraftState>("/api/event/prison-break/workshop/start", {
        method: "POST",
        body: JSON.stringify({ recipe_slug: slug }),
      });
      setState(r);
      lastTapAtRef.current = Date.now();
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("Ошибка");
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  const cancelCraft = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/event/prison-break/workshop/cancel", { method: "POST" });
      setState({
        active: false, tap_count: 0, required_taps: 0,
        perfect_count: 0, perfect_ratio: 0, complete: false,
      });
      void refresh();
    } catch { /* ignore */ } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  const tap = useCallback(async () => {
    if (busy || !state.active) return;
    setBusy(true);
    const now = Date.now();
    const delta = (now - lastTapAtRef.current) / 1000;
    lastTapAtRef.current = now;
    const wasPerfect = delta >= 0.8 && delta <= 1.2;
    setHitPulse((n) => n + 1);
    if (wasPerfect) {
      setPerfectFlash(true);
      setTimeout(() => setPerfectFlash(false), 300);
    }
    try {
      const r = await api<CraftState>("/api/event/prison-break/workshop/tap", {
        method: "POST",
      });
      if (r.complete) {
        setCompleted(r);
        setState({
          active: false, tap_count: 0, required_taps: 0,
          perfect_count: 0, perfect_ratio: 0, complete: true,
        });
        void refresh();
      } else {
        setState(r);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.detail === "слишком быстро") {
          // soft ignore
        } else {
          toast.error(e.detail);
          if (e.detail.includes("отменена")) {
            setState({
              active: false, tap_count: 0, required_taps: 0,
              perfect_count: 0, perfect_ratio: 0, complete: false,
            });
          }
        }
      } else toast.error("Ошибка");
    } finally {
      setBusy(false);
    }
  }, [busy, state.active, refresh]);

  // Spacebar tap shortcut
  useEffect(() => {
    if (!state.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        void tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.active, tap]);

  return (
    <div className="container py-6">
      <Link
        href="/event/prison-break"
        className="mb-4 inline-flex items-center gap-1 text-xs text-smoke hover:text-bone"
      >
        <ChevronLeft className="h-3 w-3" />
        дашборд
      </Link>

      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-bone">
          <Hammer className="h-6 w-6 text-flame" />
          Мастерская
        </h1>
        <p className="mt-1 text-sm text-smoke">
          Тапай по молотку с ритмом ~1 раз в секунду. Чем точнее ритм — тем качественнее предмет.
        </p>
      </header>

      {player && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs">
          <span className="font-mono text-cyan">AP {player.ap_current}/{player.ap_max}</span>
          <span className="font-mono">🪙 {player.money}</span>
          <span className="font-mono">🔩 {player.resource_scrap}</span>
          <span className="font-mono">📜 {player.resource_paper}</span>
        </div>
      )}

      {state.active ? (
        <TapGame
          state={state}
          hitPulse={hitPulse}
          perfectFlash={perfectFlash}
          onTap={tap}
          onCancel={cancelCraft}
          busy={busy}
        />
      ) : (
        <RecipeGrid recipes={recipes} player={player} onStart={startCraft} busy={busy} />
      )}

      {/* Completion modal */}
      <AnimatePresence>
        {completed && (
          <CompletionModal
            completed={completed}
            onClose={() => setCompleted(null)}
          />
        )}
      </AnimatePresence>

      {/* Inventory */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-smoke">
          Инвентарь ({inventory.length})
        </h2>
        {inventory.length === 0 ? (
          <p className="text-xs text-smoke italic">пусто, скуй что-нибудь</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {inventory.map((it) => (
              <div
                key={it.id}
                className={cn(
                  "rounded-md border bg-card p-3 text-center",
                  it.quality === "master"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : it.quality === "crooked"
                    ? "border-flame/30 bg-flame/5"
                    : "border-border",
                )}
              >
                <div className="text-2xl">{itemEmoji(it.item_type)}</div>
                <div className="mt-1 text-[10px] font-semibold text-bone">
                  {itemName(it.item_type)}
                </div>
                <div className={cn(
                  "text-[9px] uppercase tracking-widest",
                  it.quality === "master" ? "text-amber-400"
                    : it.quality === "crooked" ? "text-flame"
                    : "text-smoke",
                )}>
                  {qualityLabel(it.quality)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tap game
// ---------------------------------------------------------------------------

function TapGame({
  state,
  hitPulse,
  perfectFlash,
  onTap,
  onCancel,
  busy,
}: {
  state: CraftState;
  hitPulse: number;
  perfectFlash: boolean;
  onTap: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const pct = (state.tap_count / Math.max(1, state.required_taps)) * 100;
  const perfectPct = state.required_taps > 0
    ? (state.perfect_count / Math.max(1, state.tap_count - 1)) * 100
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-2xl space-y-4"
    >
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <div className="mb-2 text-[10px] uppercase tracking-widest text-smoke">
          Куём
        </div>
        <div className="text-4xl">{state.recipe?.emoji}</div>
        <div className="mt-1 text-lg font-bold text-bone">{state.recipe?.name}</div>
      </div>

      {/* Tap area */}
      <button
        type="button"
        onClick={onTap}
        disabled={busy}
        className={cn(
          "group relative flex h-72 w-full items-center justify-center overflow-hidden rounded-lg border-2 bg-void transition-colors",
          perfectFlash ? "border-amber-400 bg-amber-500/10" : "border-flame/40 hover:border-flame/60",
        )}
      >
        <motion.div
          key={hitPulse}
          initial={{ scale: 1, rotate: 0 }}
          animate={{ scale: [1, 0.85, 1], rotate: [0, -25, 0] }}
          transition={{ duration: 0.25 }}
          className="text-9xl"
        >
          🔨
        </motion.div>
        {perfectFlash && (
          <motion.div
            initial={{ opacity: 1, scale: 0.5 }}
            animate={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Sparkles className="h-32 w-32 text-amber-400" />
          </motion.div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-xs uppercase tracking-widest text-smoke">
          клик / SPACE — каждую секунду
        </div>
      </button>

      {/* Progress + perfect ratio */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-smoke">
            Удары: <span className="font-mono text-bone">{state.tap_count}/{state.required_taps}</span>
          </span>
          <span className="text-smoke">
            Идеальный ритм: <span className={cn(
              "font-mono",
              perfectPct >= 85 ? "text-amber-400" : perfectPct >= 50 ? "text-cyan" : "text-smoke",
            )}>{perfectPct.toFixed(0)}%</span>
          </span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-full border border-border bg-void">
          <motion.div
            className="h-full bg-gradient-to-r from-flame/60 via-amber-500 to-amber-300"
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", damping: 18 }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="w-full rounded-md border border-flame/30 bg-flame/5 py-2 text-xs uppercase tracking-widest text-flame transition-colors hover:bg-flame/10"
      >
        <X className="mr-1 inline h-3 w-3" />
        отменить (вернёт 80% ресурсов)
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Recipe grid
// ---------------------------------------------------------------------------

function RecipeGrid({
  recipes,
  player,
  onStart,
  busy,
}: {
  recipes: Recipe[];
  player: Player | null;
  onStart: (slug: string) => void;
  busy: boolean;
}) {
  const canAfford = (r: Recipe) =>
    player &&
    player.ap_current >= r.ap_cost &&
    player.money >= r.cost_money &&
    player.resource_scrap >= r.cost_scrap &&
    player.resource_paper >= r.cost_paper;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((r) => {
        const ok = canAfford(r);
        return (
          <motion.div
            key={r.slug}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-lg border bg-card p-4",
              ok ? "border-border" : "border-border/40 opacity-60",
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-3xl">{r.emoji}</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-bone">{r.name}</div>
                <div className="text-[10px] text-smoke">{r.required_taps} ударов</div>
              </div>
            </div>
            <p className="mb-2 text-[11px] text-smoke">{r.description}</p>
            <p className="mb-3 text-[10px] italic text-cyan">{r.effect_summary}</p>
            <div className="mb-3 flex flex-wrap gap-1.5 text-[10px]">
              <Cost label="AP" value={r.ap_cost} />
              {r.cost_money > 0 && <Cost label="🪙" value={r.cost_money} />}
              {r.cost_scrap > 0 && <Cost label="🔩" value={r.cost_scrap} />}
              {r.cost_paper > 0 && <Cost label="📜" value={r.cost_paper} />}
            </div>
            <button
              type="button"
              disabled={!ok || busy}
              onClick={() => onStart(r.slug)}
              className={cn(
                "w-full rounded-md border py-2 text-xs uppercase tracking-widest transition-colors",
                ok && !busy
                  ? "border-flame/40 bg-flame/10 text-flame hover:bg-flame/20"
                  : "border-border bg-void text-smoke cursor-not-allowed",
              )}
            >
              {ok ? "начать ковать" : "не хватает"}
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}

function Cost({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded border border-border bg-void px-1.5 py-0.5 font-mono">
      {label} {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Completion modal
// ---------------------------------------------------------------------------

function CompletionModal({
  completed,
  onClose,
}: {
  completed: CraftState;
  onClose: () => void;
}) {
  const q = completed.quality ?? "good";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur"
    >
      <motion.div
        initial={{ scale: 0.6, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 14 }}
        className={cn(
          "max-w-sm rounded-lg border-2 bg-card p-8 text-center shadow-2xl",
          q === "master" ? "border-amber-400" : q === "crooked" ? "border-flame" : "border-cyan",
        )}
      >
        <div className="text-[10px] uppercase tracking-widest text-smoke">
          предмет готов
        </div>
        <div className="my-5 text-7xl">{completed.item_emoji}</div>
        <div className="text-xl font-bold text-bone">{completed.item_name}</div>
        <div className={cn(
          "mt-2 text-sm font-semibold uppercase tracking-widest",
          q === "master" ? "text-amber-400" : q === "crooked" ? "text-flame" : "text-cyan",
        )}>
          {qualityLabel(q)}
        </div>
        <div className="mt-1 text-[10px] text-smoke">
          ритм {Math.round((completed.perfect_ratio ?? 0) * 100)}%
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-md border border-flame/40 bg-flame/10 py-2 text-xs uppercase tracking-widest text-flame transition-colors hover:bg-flame/20"
        >
          ок
        </button>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Item lookup
// ---------------------------------------------------------------------------

const ITEM_TABLE: Record<string, { emoji: string; name: string }> = {
  crowbar: { emoji: "🪤", name: "Лом" },
  forged_key: { emoji: "🗝", name: "Поддельный ключ" },
  cipher_note: { emoji: "🚬", name: "Шифр-записка" },
  radio: { emoji: "📻", name: "Радио" },
  screwdriver: { emoji: "🔦", name: "Отвёртка" },
  syringe: { emoji: "💉", name: "Шприц" },
  prayer: { emoji: "📿", name: "Молитвенник" },
};

function itemEmoji(slug: string): string {
  return ITEM_TABLE[slug]?.emoji ?? "❓";
}
function itemName(slug: string): string {
  return ITEM_TABLE[slug]?.name ?? slug;
}
function qualityLabel(q: string): string {
  return q === "master" ? "✦ Мастерский" : q === "crooked" ? "✕ Кривой" : "✓ Хороший";
}
