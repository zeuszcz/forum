"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type BookEntry = { id: number; owner_id: number; qty: number; price: number };
type RecentTrade = { id: number; side: string; qty: number; price: number; owner_id: number };
type Book = {
  resource: string;
  bids: BookEntry[];
  asks: BookEntry[];
  recent: RecentTrade[];
};
type OwnOrder = {
  id: number;
  side: "bid" | "ask";
  resource: string;
  qty: number;
  qty_total: number;
  price: number;
  status: string;
};
type Player = {
  id: number;
  ap_current: number;
  ap_max: number;
  money: number;
  resource_scrap: number;
  resource_paper: number;
};

const RESOURCES: { slug: string; label: string; emoji: string }[] = [
  { slug: "scrap", label: "Шарашка", emoji: "🔩" },
  { slug: "paper", label: "Макулатура", emoji: "📜" },
  { slug: "crowbar", label: "Лом", emoji: "🪤" },
  { slug: "forged_key", label: "Поддельный ключ", emoji: "🗝" },
  { slug: "radio", label: "Радио", emoji: "📻" },
  { slug: "screwdriver", label: "Отвёртка", emoji: "🔦" },
  { slug: "syringe", label: "Шприц", emoji: "💉" },
];

export default function MarketPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [resource, setResource] = useState("scrap");
  const [book, setBook] = useState<Book | null>(null);
  const [own, setOwn] = useState<OwnOrder[]>([]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [side, setSide] = useState<"bid" | "ask">("bid");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(50);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [b, o, st] = await Promise.all([
        api<Book>(`/api/event/prison-break/market/book/${resource}`),
        api<OwnOrder[]>("/api/event/prison-break/market/my-orders"),
        api<{ player: Player | null }>("/api/event/prison-break/status"),
      ]);
      setBook(b);
      setOwn(o);
      if (st.player) setPlayer(st.player);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push("/login");
    }
  }, [resource, router]);

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    void refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [user, router, refresh]);

  const place = useCallback(async () => {
    if (busy) return;
    if (qty < 1 || price < 1) {
      toast.error("qty / price > 0");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ status: string; qty_filled: number; trades: unknown[] }>(
        "/api/event/prison-break/market/orders",
        {
          method: "POST",
          body: JSON.stringify({ side, resource, qty, price }),
        },
      );
      if (r.qty_filled > 0) toast.success(`Заполнено ${r.qty_filled} шт. сразу`);
      else toast.success(`Заявка размещена в стакане`);
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
      else toast.error("Ошибка");
    } finally {
      setBusy(false);
    }
  }, [busy, side, resource, qty, price, refresh]);

  const cancel = useCallback(async (orderId: number) => {
    setBusy(true);
    try {
      await api(`/api/event/prison-break/market/orders/${orderId}`, { method: "DELETE" });
      toast.success("Отменено");
      void refresh();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.detail);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const current = RESOURCES.find((r) => r.slug === resource);

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
          <ShoppingBag className="h-6 w-6 text-cyan" />
          Чёрный рынок
        </h1>
        <p className="mt-1 text-sm text-smoke">
          Order book: bid = покупаю, ask = продаю. Налог 5% уходит в победный пул.
        </p>
      </header>

      {player && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs">
          <span className="font-mono">🪙 {player.money}</span>
          <span className="font-mono">🔩 {player.resource_scrap}</span>
          <span className="font-mono">📜 {player.resource_paper}</span>
        </div>
      )}

      {/* Resource picker */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {RESOURCES.map((r) => (
          <button
            key={r.slug}
            type="button"
            onClick={() => setResource(r.slug)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs",
              resource === r.slug
                ? "border-cyan/60 bg-cyan/10 text-cyan"
                : "border-border bg-card text-smoke hover:border-cyan/40",
            )}
          >
            <span>{r.emoji}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Order book */}
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* BIDS (buy) */}
            <div className="rounded-lg border border-emerald-700/30 bg-emerald-700/5 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-emerald-400">
                <ArrowUp className="h-3 w-3" />
                покупают
              </div>
              <ul className="space-y-0.5 text-xs">
                {(book?.bids ?? []).length === 0 ? (
                  <li className="italic text-smoke">пусто</li>
                ) : (
                  book?.bids.map((o) => (
                    <li
                      key={o.id}
                      className="flex justify-between font-mono"
                    >
                      <span className="text-emerald-400">{o.price} 🪙</span>
                      <span className="text-bone">×{o.qty}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* ASKS (sell) */}
            <div className="rounded-lg border border-flame/30 bg-flame/5 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-flame">
                <ArrowDown className="h-3 w-3" />
                продают
              </div>
              <ul className="space-y-0.5 text-xs">
                {(book?.asks ?? []).length === 0 ? (
                  <li className="italic text-smoke">пусто</li>
                ) : (
                  book?.asks.map((o) => (
                    <li
                      key={o.id}
                      className="flex justify-between font-mono"
                    >
                      <span className="text-flame">{o.price} 🪙</span>
                      <span className="text-bone">×{o.qty}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          {/* Recent fills */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-smoke">
              Последние сделки
            </div>
            {(book?.recent ?? []).length === 0 ? (
              <p className="text-xs italic text-smoke">никто пока не торговал</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {book?.recent.map((t) => (
                  <li key={t.id} className="flex justify-between font-mono">
                    <span className="text-smoke">{t.qty} {current?.emoji}</span>
                    <span className="text-bone">{t.price} 🪙</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Place order + my orders */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 text-[10px] uppercase tracking-widest text-smoke">
              Новая заявка
            </div>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setSide("bid")}
                className={cn(
                  "flex-1 rounded-md border py-2 text-xs uppercase tracking-widest",
                  side === "bid"
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-border text-smoke",
                )}
              >
                купить
              </button>
              <button
                type="button"
                onClick={() => setSide("ask")}
                className={cn(
                  "flex-1 rounded-md border py-2 text-xs uppercase tracking-widest",
                  side === "ask"
                    ? "border-flame/50 bg-flame/10 text-flame"
                    : "border-border text-smoke",
                )}
              >
                продать
              </button>
            </div>
            <label className="mb-2 block text-[10px] uppercase tracking-widest text-smoke">
              Количество
              <input
                type="number"
                value={qty}
                min={1}
                max={999}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-md border border-border bg-void px-2 py-1.5 text-sm text-bone"
              />
            </label>
            <label className="mb-3 block text-[10px] uppercase tracking-widest text-smoke">
              Цена / шт. (🪙)
              <input
                type="number"
                value={price}
                min={1}
                max={100000}
                onChange={(e) => setPrice(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-md border border-border bg-void px-2 py-1.5 text-sm text-bone"
              />
            </label>
            <div className="mb-3 flex justify-between text-[11px] text-smoke">
              <span>Итого:</span>
              <span className="font-mono">{qty * price} 🪙</span>
            </div>
            <button
              type="button"
              onClick={place}
              disabled={busy}
              className={cn(
                "w-full rounded-md border py-2 text-xs uppercase tracking-widest transition-colors",
                side === "bid"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "border-flame/50 bg-flame/10 text-flame hover:bg-flame/20",
                busy && "opacity-50",
              )}
            >
              {busy ? "…" : "разместить"}
            </button>
          </div>

          {/* My orders */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-smoke">
              Мои заявки
            </div>
            {own.length === 0 ? (
              <p className="text-xs italic text-smoke">нет активных</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {own.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between rounded-md border border-border/40 bg-void/40 p-2 font-mono"
                  >
                    <span>
                      <span className={o.side === "bid" ? "text-emerald-400" : "text-flame"}>
                        {o.side === "bid" ? "B" : "S"}
                      </span>{" "}
                      {o.qty}/{o.qty_total} × {o.price} 🪙 [{o.resource}]
                    </span>
                    <button
                      type="button"
                      onClick={() => void cancel(o.id)}
                      className="text-smoke hover:text-flame"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
