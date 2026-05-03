import { Ban, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";

import { LetterAvatar } from "@/components/ui/avatar";
import { apiServer } from "@/lib/api";
import { exactTime, relativeTime } from "@/lib/format";
import type { BanlistEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Banlist" };

export default async function BanlistPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const sp = await searchParams;
  const includeExpired = sp.all === "1";
  const entries = await apiServer<BanlistEntry[]>(
    `/stats/banlist?limit=100${includeExpired ? "&include_expired=true" : ""}`,
  );

  return (
    <div className="container max-w-3xl py-6 md:py-10">
      <nav className="mb-4 flex items-center gap-1 text-xs text-smoke">
        <Link href="/" className="transition-colors hover:text-ash">
          Форум
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-iridescent font-semibold uppercase tracking-widest">
          Banlist
        </span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight text-bone">
            <Ban className="h-5 w-5 text-ember" />
            Banlist
          </h1>
          <p className="mt-1 text-xs text-smoke">
            Публичный реестр забаненных пользователей
          </p>
        </div>
        <div className="flex gap-1">
          <Link
            href="/banlist"
            className={
              "rounded-md border px-3 py-1 text-xs font-medium transition-colors " +
              (!includeExpired
                ? "border-ember/40 bg-ember/10 text-ember"
                : "border-border text-ash hover:border-plasma/40 hover:text-bone")
            }
          >
            активные
          </Link>
          <Link
            href="/banlist?all=1"
            className={
              "rounded-md border px-3 py-1 text-xs font-medium transition-colors " +
              (includeExpired
                ? "border-plasma/40 bg-plasma/10 text-plasma"
                : "border-border text-ash hover:border-plasma/40 hover:text-bone")
            }
          >
            все (включая истёкшие)
          </Link>
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-sm text-smoke">
          {includeExpired
            ? "Никто никогда не был забанен — слишком чисто чтоб быть правдой 🤔"
            : "Сейчас никто не забанен. Чисто."}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
          {entries.map((b) => {
            const isPermanent = !b.banned_until;
            return (
              <li key={b.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <LetterAvatar nickname={b.nickname} size={32} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/u/${b.nickname}`}
                    className="font-semibold text-ember transition-opacity hover:opacity-80"
                  >
                    {b.nickname}
                  </Link>
                  {b.ban_reason && (
                    <p className="mt-0.5 text-xs italic text-ash [overflow-wrap:anywhere]">
                      {b.ban_reason}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {isPermanent ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-ember/40 bg-ember/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ember">
                      навсегда
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] text-smoke"
                      title={exactTime(b.banned_until)}
                    >
                      <Clock className="h-3 w-3" />
                      до {relativeTime(b.banned_until)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-4 text-center text-[11px] text-smoke">
        обновляется в реальном времени · {entries.length} запис(ей)
      </footer>
    </div>
  );
}
