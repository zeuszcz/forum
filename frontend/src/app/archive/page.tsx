import { Archive as ArchiveIcon, ChevronRight, Eye, MessageCircle } from "lucide-react";
import Link from "next/link";

import { apiServer } from "@/lib/api";
import { exactTime, plural, relativeTime } from "@/lib/format";
import type { ArchiveEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Архив" };

export default async function ArchivePage() {
  const entries = await apiServer<ArchiveEntry[]>("/stats/archive?limit=100");

  return (
    <div className="container max-w-3xl py-6 md:py-10">
      <nav className="mb-4 flex items-center gap-1 text-xs text-smoke">
        <Link href="/" className="transition-colors hover:text-ash">
          Форум
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-iridescent font-semibold uppercase tracking-widest">
          Архив
        </span>
      </nav>

      <header className="mb-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight text-bone">
          <ArchiveIcon className="h-5 w-5 text-smoke" />
          Архив тем
        </h1>
        <p className="mt-1 text-xs text-smoke">
          Удалённые темы — только просмотр, ответ закрыт
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-sm text-smoke">
          Удалённых тем нет
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
          {entries.map((t) => (
            <li key={t.id} className="px-4 py-3 opacity-70">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/t/${t.id}`}
                  className="truncate font-semibold text-ash transition-colors hover:text-bone"
                >
                  {t.title}
                </Link>
                <span
                  className="text-[11px] text-smoke"
                  title={exactTime(t.deleted_at)}
                >
                  удалено {relativeTime(t.deleted_at)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-smoke">
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  {t.reply_count} {plural(t.reply_count, "ответ", "ответа", "ответов")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {t.view_count}
                </span>
                <span>создано {relativeTime(t.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
