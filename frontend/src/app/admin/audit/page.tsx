import {
  Ban,
  Lock,
  MessageSquareOff,
  MicOff,
  ScrollText,
  ShieldCheck,
  Unlock,
  Voicemail,
  XOctagon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { apiServer } from "@/lib/api";
import { exactTime, relativeTime } from "@/lib/format";
import type { ModerationLogRead } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTION_META: Record<
  string,
  { icon: LucideIcon; label: string; color: string }
> = {
  ban: { icon: Ban, label: "Бан", color: "text-ember" },
  unban: { icon: ShieldCheck, label: "Разбан", color: "text-cyan" },
  mute: { icon: MicOff, label: "Мьют", color: "text-flame" },
  unmute: { icon: Voicemail, label: "Размьют", color: "text-cyan" },
  thread_lock: { icon: Lock, label: "Закрыть тему", color: "text-flame" },
  thread_unlock: { icon: Unlock, label: "Открыть тему", color: "text-cyan" },
  section_lock: { icon: Lock, label: "Закрыть раздел", color: "text-flame" },
  section_unlock: { icon: Unlock, label: "Открыть раздел", color: "text-cyan" },
  post_delete: { icon: MessageSquareOff, label: "Удалить пост", color: "text-ember" },
  thread_delete: { icon: XOctagon, label: "Удалить тему", color: "text-ember" },
  user_threads_disabled: { icon: Lock, label: "Закрыть создание тем", color: "text-flame" },
  user_threads_enabled: { icon: Unlock, label: "Открыть создание тем", color: "text-cyan" },
  role_grant: { icon: ShieldCheck, label: "Дать роль", color: "text-plasma" },
  role_revoke: { icon: ShieldCheck, label: "Снять роль", color: "text-ash" },
  perks_granted: { icon: ScrollText, label: "Выдать перки", color: "text-plasma" },
};

export default async function AuditPage() {
  const log = await apiServer<ModerationLogRead[]>("/admin/audit?limit=100");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-bone">Аудит-лог</h1>
        <p className="text-xs text-smoke">последние 100 действий, новейшие сверху</p>
      </header>

      {log.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-smoke">
          Здесь будут все действия модерации. Пока тихо.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {log.map((row) => {
            const meta = ACTION_META[row.action] ?? {
              icon: ScrollText,
              label: row.action,
              color: "text-ash",
            };
            return (
              <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-slate">
                  <meta.icon className={`h-3.5 w-3.5 ${meta.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-semibold text-bone">{meta.label}</span>
                    {row.target_user_id && (
                      <span className="text-xs text-smoke">
                        →{" "}
                        {row.target_user_nickname ? (
                          <Link
                            href={`/u/${row.target_user_nickname}`}
                            className="font-medium text-plasma transition-colors hover:text-plasma/80"
                          >
                            @{row.target_user_nickname}
                          </Link>
                        ) : (
                          <span className="text-smoke">user #{row.target_user_id}</span>
                        )}
                      </span>
                    )}
                    {row.target_post_id && (
                      <span className="text-xs text-smoke">
                        →{" "}
                        {row.target_thread_id ? (
                          <Link
                            href={`/t/${row.target_thread_id}#post-${row.target_post_id}`}
                            className="text-cyan transition-colors hover:text-cyan/80"
                          >
                            пост #{row.target_post_id}
                          </Link>
                        ) : (
                          <>пост #{row.target_post_id}</>
                        )}
                      </span>
                    )}
                    {row.target_thread_id && !row.target_post_id && (
                      <span className="text-xs text-smoke">
                        →{" "}
                        <Link
                          href={`/t/${row.target_thread_id}`}
                          className="text-cyan transition-colors hover:text-cyan/80"
                        >
                          {row.target_thread_title
                            ? `«${row.target_thread_title}»`
                            : `тема #${row.target_thread_id}`}
                        </Link>
                      </span>
                    )}
                    {row.target_section_id && (
                      <span className="text-xs text-smoke">
                        →{" "}
                        <span className="text-flame">
                          {row.target_section_title
                            ? `раздел «${row.target_section_title}»`
                            : `section #${row.target_section_id}`}
                        </span>
                      </span>
                    )}
                  </div>
                  {row.reason && (
                    <p className="mt-0.5 text-xs italic text-ash">&quot;{row.reason}&quot;</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-smoke">
                    <span title={exactTime(row.created_at)}>
                      {relativeTime(row.created_at)}
                    </span>
                    {row.actor_id && (
                      <span>
                        actor:{" "}
                        {row.actor_nickname ? (
                          <Link
                            href={`/u/${row.actor_nickname}`}
                            className="font-medium text-ash transition-colors hover:text-bone"
                          >
                            @{row.actor_nickname}
                          </Link>
                        ) : (
                          <>#{row.actor_id}</>
                        )}
                      </span>
                    )}
                    {row.expires_at && (
                      <span className="text-flame">
                        истекает {relativeTime(row.expires_at)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
