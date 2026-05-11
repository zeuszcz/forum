"use client";

import {
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronUp,
  Crosshair,
  Flame,
  Gamepad2,
  Hand,
  KeyRound,
  LogIn,
  LogOut,
  MessageSquare,
  Server,
  ShieldAlert,
  Trophy,
  Users,
  Vote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { exactTime, relativeTime } from "@/lib/format";
import {
  JBF_CATEGORY_LABEL,
  JBF_CATEGORY_TONE,
  type JbfCategory,
  type JbfCommand,
  type JbfKind,
  groupJbfCommands,
} from "@/lib/jbf-commands";
import type { ShoutboxMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  tone: string;
  border: string;
  bg: string;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  rebel: {
    label: "Бунт",
    icon: ShieldAlert,
    tone: "text-ember",
    border: "border-ember/40",
    bg: "bg-ember/5",
  },
  bunt: {
    label: "Бунт-чат",
    icon: ShieldAlert,
    tone: "text-ember",
    border: "border-ember/40",
    bg: "bg-ember/5",
  },
  freekill: {
    label: "Freekill",
    icon: Flame,
    tone: "text-flame",
    border: "border-flame/40",
    bg: "bg-flame/5",
  },
  mass: {
    label: "Раздача",
    icon: Flame,
    tone: "text-flame",
    border: "border-flame/40",
    bg: "bg-flame/5",
  },
  lr: {
    label: "LR",
    icon: Vote,
    tone: "text-plasma",
    border: "border-plasma/40",
    bg: "bg-plasma/5",
  },
  freeday: {
    label: "Freeday",
    icon: Hand,
    tone: "text-cyan",
    border: "border-cyan/40",
    bg: "bg-cyan/5",
  },
  round: {
    label: "Раунд",
    icon: Trophy,
    tone: "text-smoke",
    border: "border-border",
    bg: "bg-void/40",
  },
  killfeed: {
    label: "Killfeed",
    icon: Crosshair,
    tone: "text-cyan",
    border: "border-cyan/30",
    bg: "bg-void/40",
  },
  join: {
    label: "Join",
    icon: LogIn,
    tone: "text-smoke",
    border: "border-border",
    bg: "bg-void/30",
  },
  leave: {
    label: "Leave",
    icon: LogOut,
    tone: "text-smoke",
    border: "border-border",
    bg: "bg-void/30",
  },
  admin_action: {
    label: "Админ-меню",
    icon: KeyRound,
    tone: "text-plasma",
    border: "border-plasma/30",
    bg: "bg-plasma/5",
  },
  default: {
    label: "Прочее",
    icon: MessageSquare,
    tone: "text-ash",
    border: "border-border",
    bg: "bg-card",
  },
};

const GAME_CATEGORIES = new Set([
  "rebel",
  "bunt",
  "freekill",
  "mass",
  "lr",
  "freeday",
  "round",
  "killfeed",
  "join",
  "leave",
]);

const ADMIN_CATEGORIES = new Set(["admin_action"]);

type Tab = "game" | "admin" | "commands";

const TAB_LABEL: Record<Tab, string> = {
  game: "Игровые события",
  admin: "Админ-меню",
  commands: "Справочник команд",
};

const TAB_ICON: Record<Tab, LucideIcon> = {
  game: Gamepad2,
  admin: KeyRound,
  commands: BookOpen,
};

const JBF_KIND_LABEL: Record<JbfKind, { label: string; tone: string }> = {
  toggle: { label: "переключатель", tone: "text-cyan border-cyan/40" },
  setter: { label: "значение", tone: "text-plasma border-plasma/40" },
  action: { label: "действие", tone: "text-flame border-flame/40" },
  give: { label: "выдача", tone: "text-ash border-border" },
  clear: { label: "очистка", tone: "text-ember border-ember/40" },
};

const GAME_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "все" },
  { value: "rebel", label: "🔴 Бунт" },
  { value: "mass", label: "🟠 Раздача" },
  { value: "killfeed", label: "🔵 Killfeed" },
  { value: "round", label: "🏆 Раунд" },
  { value: "lr", label: "🟣 LR" },
  { value: "freeday", label: "🆓 Freeday" },
  { value: "bunt", label: "🚨 Бунт-чат" },
  { value: "join", label: "🚪 Join" },
  { value: "leave", label: "🚪 Leave" },
];

export default function ServerLogPage() {
  const [tab, setTab] = useState<Tab>("game");
  const [filter, setFilter] = useState<string>("");
  const [rows, setRows] = useState<ShoutboxMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedCategories = useMemo(
    () => (tab === "game" ? GAME_CATEGORIES : ADMIN_CATEGORIES),
    [tab],
  );

  const fetchPage = useCallback(
    async (beforeId: number | null = null) => {
      // The static reference tab doesn't hit the API at all.
      if (tab === "commands") return;
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams();
        q.set("limit", String(PAGE_SIZE));
        if (beforeId) q.set("before_id", String(beforeId));
        if (filter && tab === "game") q.set("category", filter);
        const data = await api<ShoutboxMessage[]>(`/shoutbox/system-log?${q}`);
        // Backend returns most-recent first via the cursor query. Filter
        // client-side by tab as well so we never leak admin rows into the
        // game tab even without a server-side filter.
        const filtered = data.filter((m) => {
          const cat =
            (m.meta as { category?: string } | null)?.category ?? "";
          return allowedCategories.has(cat);
        });
        if (beforeId == null) {
          setRows(filtered);
        } else {
          setRows((prev) => [...prev, ...filtered]);
        }
        setHasMore(data.length >= PAGE_SIZE);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить");
      } finally {
        setLoading(false);
      }
    },
    [filter, tab, allowedCategories],
  );

  useEffect(() => {
    void fetchPage(null);
  }, [fetchPage]);

  function loadMore() {
    if (rows.length === 0) return;
    const oldest = rows[rows.length - 1]!.id;
    void fetchPage(oldest);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-bone">
          Логи сервера
        </h1>
        <p className="text-xs text-smoke">
          Игровые события и админ-действия с CS-сервера. Перенесены из чата.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => {
          const Icon = TAB_ICON[t];
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setFilter("");
              }}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-widest transition-colors",
                active
                  ? "border-plasma text-plasma"
                  : "border-transparent text-smoke hover:text-ash",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {TAB_LABEL[t]}
            </button>
          );
        })}
      </div>

      {/* Commands reference (static, no API) */}
      {tab === "commands" && <JbfCommandsReference />}

      {/* Filters (only for game tab) */}
      {tab === "game" && (
        <div className="flex flex-wrap items-center gap-1.5">
          {GAME_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] transition-colors",
                filter === f.value
                  ? "border-plasma/50 bg-plasma/10 text-plasma"
                  : "border-border bg-card text-ash hover:border-plasma/40 hover:text-bone",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Admin tab notice */}
      {tab === "admin" && rows.length === 0 && !loading && (
        <div className="rounded-lg border border-plasma/30 bg-plasma/5 p-5 text-sm">
          <div className="mb-2 flex items-center gap-2 text-plasma">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-semibold uppercase tracking-widest">
              Источник не подключён
            </span>
          </div>
          <p className="text-ash">
            Действия из <code className="font-mono text-bone">jbf_uaio_menu</code>{" "}
            (бессмертие, скрытые стены, скорость, гравитация и т. д.) идут через
            AMX-X <code>client_print</code> прямо в консоль игрока и{" "}
            <strong>не попадают в стандартный UDP-log</strong>.
          </p>
          <p className="mt-2 text-ash">
            Чтобы они появились здесь, нужен один из двух вариантов:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-smoke">
            <li>
              сопровождающий AMX-плагин, который дублирует каждое действие через{" "}
              <code className="font-mono text-bone">log_amx</code> в формате{" "}
              <code className="font-mono text-bone">
                [JBF-UAIO] admin=&quot;NICK&quot; action=&quot;enabled&quot;
                feature=&quot;immortality&quot; scope=&quot;basic&quot;
                target=&quot;self&quot;
              </code>
              ;
            </li>
            <li>
              либо FTP-поллер, который читает{" "}
              <code className="font-mono text-bone">
                cstrike/addons/amxmodx/logs/L*_*.log
              </code>{" "}
              и постит изменения на{" "}
              <code className="font-mono text-bone">/shoutbox/system</code>.
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-smoke">
            Парсер уже понимает обе разметки — как только источник появится,
            события начнут сюда падать без правок фронта.
          </p>
        </div>
      )}

      {/* Empty for game */}
      {tab === "game" && rows.length === 0 && !loading && (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-smoke">
          {filter
            ? "По этому фильтру пусто. Попробуй другой или общий список."
            : "Сервер пока тихий. События появятся, как только начнётся игра."}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-ember/40 bg-ember/5 p-3 text-xs text-ember">
          {error}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {rows.map((m) => {
            const cat =
              (m.meta as { category?: string; tag?: string } | null)?.category ??
              "default";
            const tag = (m.meta as { tag?: string } | null)?.tag;
            const meta = CATEGORY_META[cat] ?? CATEGORY_META.default!;
            return (
              <li
                key={m.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-2.5",
                  meta.bg,
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                    meta.border,
                  )}
                >
                  <meta.icon className={cn("h-3.5 w-3.5", meta.tone)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={cn(
                        "rounded border px-1.5 font-mono text-[9px] font-bold uppercase tracking-widest",
                        meta.border,
                        meta.tone,
                      )}
                    >
                      {tag ?? meta.label}
                    </span>
                    <span className="break-words font-mono text-xs text-ash">
                      {m.body}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-smoke">
                    <span title={exactTime(m.created_at)}>
                      {relativeTime(m.created_at)}
                    </span>
                    <span>#{m.id}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && rows.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-smoke transition-colors hover:border-plasma/40 hover:text-ash disabled:opacity-50"
          >
            <ChevronUp className="h-3 w-3 rotate-180" />
            {loading ? "загружаю…" : "ещё"}
          </button>
        </div>
      )}

      {/* Tiny legend — hidden on the static reference tab */}
      {tab !== "commands" && (
        <div className="rounded-md border border-border bg-card/50 p-3 text-[10px] text-smoke">
          <div className="mb-1 flex items-center gap-1 text-[9px] uppercase tracking-widest text-ash">
            <Activity className="h-3 w-3" />
            источник
          </div>
          Listener <code className="font-mono">cs-log-listener</code> на VPS слушает
          UDP 27500, парсит HL-логи и пишет в БД через{" "}
          <code className="font-mono">/shoutbox/system</code>. Игровые события
          больше не показываются в публичном чате — только здесь.
          <br />
          <Users className="mr-1 inline h-3 w-3" />
          Сервер:{" "}
          <code className="font-mono">
            <Server className="mr-0.5 inline h-3 w-3" />
            37.230.228.248:27015
          </code>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Static reference panel — jbf_uaio_modular admin commands
// ─────────────────────────────────────────────────────────────────────

function JbfCommandsReference() {
  const grouped = useMemo(() => groupJbfCommands(), []);
  const [query, setQuery] = useState("");

  const filterCmd = (c: JbfCommand) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.cmd.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) ||
      (c.notes?.toLowerCase().includes(q) ?? false)
    );
  };

  const totalCount = Object.values(grouped).reduce((s, l) => s + l.length, 0);
  const matchedCount = Object.values(grouped).reduce(
    (s, l) => s + l.filter(filterCmd).length,
    0,
  );

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-cyan/30 bg-cyan/5 p-3 text-xs text-ash">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cyan">
          <BookOpen className="h-3 w-3" />
          справочник jbf_uaio_modular ({totalCount} команд)
        </div>
        Команды плагина админ-меню. Параметры собраны из наблюдений в логах
        и конвенций jbf_uaio (компилированные .amxx зашифрованы AMX-X
        protector'ом, плагин не возвращает usage из RCON). Если что-то
        неверно — поправь в{" "}
        <code className="font-mono">frontend/src/lib/jbf-commands.ts</code>.
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по cmd / лейблу / заметке…"
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-ash outline-none transition-colors placeholder:text-smoke focus:border-plasma/60"
      />

      {query && (
        <div className="text-[11px] text-smoke">
          {matchedCount === 0 ? "ничего не найдено" : `совпадений: ${matchedCount}`}
        </div>
      )}

      {(Object.keys(grouped) as JbfCategory[]).map((cat) => {
        const list = grouped[cat].filter(filterCmd);
        if (list.length === 0) return null;
        return (
          <section key={cat} className="space-y-2">
            <header className="flex items-baseline gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-bone">
                {JBF_CATEGORY_LABEL[cat]}
              </h2>
              <span className="text-[10px] text-smoke">{list.length} шт.</span>
              <div className="h-px flex-1 bg-border" />
            </header>
            <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {list.map((c) => (
                <JbfCommandCard key={c.cmd} cmd={c} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function JbfCommandCard({ cmd }: { cmd: JbfCommand }) {
  const kindMeta = JBF_KIND_LABEL[cmd.kind];
  const tone = JBF_CATEGORY_TONE[cmd.category];
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-card/60 p-3 transition-colors",
        tone.split(" ").filter((c) => c.startsWith("border-"))[0],
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <code className="font-mono text-xs text-bone break-all">{cmd.cmd}</code>
        <span className="flex shrink-0 items-center gap-1">
          {cmd.verified ? (
            <span
              className="rounded border border-success/40 bg-success/10 px-1 font-mono text-[8px] uppercase tracking-widest text-success"
              title="Параметры подтверждены реальным выводом плагина"
            >
              verified
            </span>
          ) : (
            <span
              className="rounded border border-smoke/40 px-1 font-mono text-[8px] uppercase tracking-widest text-smoke"
              title="Параметры угаданы по конвенции — нужен дамп от плагина"
            >
              guess
            </span>
          )}
          <span
            className={cn(
              "rounded border px-1.5 font-mono text-[9px] uppercase tracking-widest",
              kindMeta.tone,
            )}
          >
            {kindMeta.label}
          </span>
        </span>
      </div>
      <div className="text-xs font-semibold text-ash">{cmd.label}</div>

      {cmd.flags && cmd.flags.length > 0 ? (
        <div className="space-y-1">
          <table className="w-full text-[11px]">
            <tbody>
              {cmd.flags.map((f) => (
                <tr key={f.flag} className="align-top">
                  <td className="pr-2 align-top font-mono text-plasma">{f.flag}</td>
                  <td className="text-ash">
                    {f.label}
                    {f.values && (
                      <span className="ml-1 font-mono text-smoke">({f.values})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cmd.example && (
            <code className="block rounded bg-void/40 px-1.5 py-0.5 font-mono text-[11px] text-iridescent">
              {cmd.example}
            </code>
          )}
        </div>
      ) : cmd.params ? (
        <code className="rounded bg-void/40 px-1.5 py-0.5 font-mono text-[11px] text-iridescent">
          {cmd.cmd} {cmd.params}
        </code>
      ) : null}

      {(cmd.verb || cmd.notes) && (
        <div className="space-y-0.5 text-[11px] text-smoke">
          {cmd.verb && (
            <div>
              <span className="text-[9px] uppercase tracking-widest text-smoke/70">
                лог-глагол:
              </span>{" "}
              <span className="font-mono text-ash">{cmd.verb}(а)</span>
            </div>
          )}
          {cmd.notes && <p className="italic">{cmd.notes}</p>}
        </div>
      )}
    </div>
  );
}
