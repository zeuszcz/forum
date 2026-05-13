"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { motion } from "framer-motion";
import {
  ChevronLeft,
  Eye,
  Film,
  Flame,
  Handshake,
  Lock,
  Newspaper,
  Skull,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Reveal = {
  id: number;
  day: number;
  reveal_type: string;
  payload: Record<string, any>;
  scheduled_for: string;
  revealed_at: string | null;
};

const REVEAL_META: Record<
  string,
  { title: string; icon: React.ReactNode; color: string }
> = {
  role_reveal: {
    title: "Раскрытие роли",
    icon: <Eye className="h-4 w-4" />,
    color: "border-rose-500/40 bg-rose-500/5 text-rose-200",
  },
  alliance_dump: {
    title: "Слив альянсов",
    icon: <Handshake className="h-4 w-4" />,
    color: "border-purple-500/40 bg-purple-500/5 text-purple-200",
  },
  tunnel_status: {
    title: "Статус тоннелей",
    icon: <Lock className="h-4 w-4" />,
    color: "border-amber-500/40 bg-amber-500/5 text-amber-200",
  },
  intel_truth: {
    title: "Правда об intel",
    icon: <Newspaper className="h-4 w-4" />,
    color: "border-cyan/40 bg-cyan/5 text-cyan",
  },
  faction_count: {
    title: "Подсчёт фракций",
    icon: <Users className="h-4 w-4" />,
    color: "border-emerald-500/40 bg-emerald-500/5 text-emerald-200",
  },
  boss_reveal: {
    title: "Раскрытие босса",
    icon: <Skull className="h-4 w-4" />,
    color: "border-flame/40 bg-flame/5 text-flame",
  },
  final_curtain: {
    title: "Финальный занавес",
    icon: <Flame className="h-4 w-4" />,
    color: "border-flame/60 bg-flame/10 text-flame",
  },
};

export default function RevealsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [reveals, setReveals] = useState<Reveal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const rs = await api<Reveal[]>(
        "/api/event/prison-break/reveals?limit=40",
      );
      setReveals(rs);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
        return;
      }
      toast.error("Не удалось загрузить хронику.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (user === null) {
      router.push("/login");
      return;
    }
    if (user) void fetchAll();
  }, [user, fetchAll, router]);

  if (user === undefined || loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-32 text-smoke">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <Link
        href="/event/prison-break"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-smoke transition-colors hover:text-cyan"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        К дашборду
      </Link>

      <div className="rounded-lg border border-flame/30 bg-flame/5 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-flame">
          <Film className="h-3.5 w-3.5" />
          Хроника раскрытий
        </div>
        <p className="mt-1 text-[11px] text-smoke">
          7 запланированных раскрытий в течение 21 дня. Каждое срывает покровы
          с разных частей события.
        </p>
      </div>

      {reveals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-void/20 p-8 text-center text-sm text-smoke">
          Пока ничего не раскрыто. Первое раскрытие — на Day 5.
        </div>
      ) : (
        <ol className="relative space-y-4 border-l-2 border-border pl-6">
          {reveals.map((r, i) => {
            const meta = REVEAL_META[r.reveal_type] ?? {
              title: r.reveal_type,
              icon: <Eye className="h-4 w-4" />,
              color: "border-border bg-void/40 text-bone",
            };
            return (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="relative"
              >
                <span
                  className={cn(
                    "absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full border-2",
                    meta.color,
                  )}
                >
                  {meta.icon}
                </span>
                <div className={cn("rounded-lg border p-4", meta.color)}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-widest">
                    <span className="font-semibold">{meta.title}</span>
                    <span className="text-smoke">
                      Day {r.day} ·{" "}
                      {r.revealed_at
                        ? new Date(r.revealed_at).toLocaleString("ru-RU", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "..."}
                    </span>
                  </div>
                  <div className="mt-3">
                    <RevealBody reveal={r} />
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function RevealBody({ reveal }: { reveal: Reveal }) {
  const p = reveal.payload || {};
  if (reveal.reveal_type === "role_reveal" || reveal.reveal_type === "boss_reveal") {
    if (p.empty) {
      return <p className="text-xs text-smoke italic">Никого не осталось для раскрытия.</p>;
    }
    return (
      <div className="space-y-1">
        <p className="text-sm text-bone">
          <span className="text-xl">{p.target_tattoo}</span>{" "}
          <strong>{p.target_nickname}</strong> — это <strong>{p.role}</strong>.
        </p>
      </div>
    );
  }
  if (reveal.reveal_type === "alliance_dump") {
    const list = (p.alliances ?? []) as Array<{
      id: number;
      pact_type: string;
      parties: number[];
      expires_at: string | null;
    }>;
    if (list.length === 0) {
      return <p className="text-xs text-smoke">Активных альянсов нет.</p>;
    }
    return (
      <ul className="space-y-1.5 text-sm">
        {list.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between rounded-md border border-border bg-void/30 px-2 py-1.5 text-xs"
          >
            <span className="text-bone">{a.pact_type}</span>
            <span className="font-mono text-smoke">
              {a.parties.join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (reveal.reveal_type === "tunnel_status") {
    const cells = (p.cells ?? []) as Array<{
      id: number;
      block: string;
      number: number;
      tunnel_progress: number;
      tunnel_discovered: boolean;
    }>;
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cells.map((c) => (
          <div
            key={c.id}
            className="rounded-md border border-border bg-void/30 p-2 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-bone">
                {c.block}-{c.number}
              </span>
              {c.tunnel_discovered && (
                <span className="text-[9px] uppercase tracking-widest text-rose-400">
                  обнаружен
                </span>
              )}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-void/60">
              <div
                className={cn(
                  "h-full transition-all",
                  c.tunnel_discovered
                    ? "bg-rose-500"
                    : c.tunnel_progress >= 75
                      ? "bg-amber-400"
                      : c.tunnel_progress >= 30
                        ? "bg-cyan"
                        : "bg-bone/40",
                )}
                style={{ width: `${c.tunnel_progress}%` }}
              />
            </div>
            <div className="mt-1 text-right font-mono text-[10px] text-smoke">
              {c.tunnel_progress}%
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (reveal.reveal_type === "intel_truth") {
    return (
      <div className="space-y-1 text-xs">
        <div>
          Всего intel-атомов: <span className="text-bone">{p.total ?? 0}</span>
        </div>
        <div>
          Правдивых:{" "}
          <span className="text-emerald-400">{p.true_count ?? 0}</span>
        </div>
        <div>
          Сфабрикованных:{" "}
          <span className="text-rose-400">{p.fabricated_count ?? 0}</span>
        </div>
      </div>
    );
  }
  if (reveal.reveal_type === "faction_count") {
    const data = (p.by_faction ?? {}) as Record<string, number>;
    return (
      <div className="flex flex-wrap gap-3 text-sm">
        {Object.entries(data).map(([fac, n]) => (
          <div
            key={fac}
            className="rounded-md border border-border bg-void/30 px-3 py-1.5"
          >
            <span className="text-smoke text-[10px] uppercase tracking-widest">
              {fac}
            </span>
            <span className="ml-2 font-mono text-bone">{n}</span>
          </div>
        ))}
      </div>
    );
  }
  if (reveal.reveal_type === "final_curtain") {
    const players = (p.players ?? []) as Array<{
      id: number;
      nickname: string;
      tattoo: string;
      role: string;
      faction: string;
      status: string;
    }>;
    return (
      <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 md:grid-cols-3">
        {players.map((pl) => (
          <div
            key={pl.id}
            className="flex items-center gap-2 rounded-md border border-border bg-void/30 px-2 py-1.5"
          >
            <span>{pl.tattoo}</span>
            <span className="flex-1 truncate text-bone">{pl.nickname}</span>
            <span className="text-[10px] uppercase tracking-widest text-cyan">
              {pl.role}
            </span>
          </div>
        ))}
      </div>
    );
  }
  // Unknown / empty payload
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-smoke">
      {JSON.stringify(p, null, 2)}
    </pre>
  );
}
