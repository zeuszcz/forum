import { notFound } from "next/navigation";

import { RoleBadges } from "@/components/forum/UserBadge";
import { LetterAvatar } from "@/components/ui/avatar";
import { apiServer, ApiError } from "@/lib/api";
import { exactTime, relativeTime } from "@/lib/format";
import type { UserPublic } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  let user: UserPublic;
  try {
    user = await apiServer<UserPublic>(`/users/${encodeURIComponent(nickname)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const topRole = user.roles?.[0];
  const isOnline = user.last_seen_at && Date.now() - new Date(user.last_seen_at).getTime() < 10 * 60 * 1000;

  return (
    <div className="container max-w-3xl py-6 md:py-10">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="hero-bg p-8">
          <div className="flex items-start gap-6">
            <LetterAvatar nickname={user.nickname} size={96} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1
                  className="text-2xl font-bold tracking-tight md:text-3xl"
                  style={{ color: topRole?.color ?? "#e8e9f3" }}
                >
                  {user.nickname}
                </h1>
                {isOnline && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan/10 px-2.5 py-0.5 text-xs font-medium text-cyan">
                    <span className="dot-live animate-pulse-slow" />
                    онлайн
                  </span>
                )}
              </div>
              {user.title && <p className="mt-1 text-sm italic text-ash">{user.title}</p>}
              <div className="mt-4">
                <RoleBadges roles={user.roles} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 border-t border-border p-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-smoke">
              Регистрация
            </h2>
            <p className="text-sm text-ash" title={exactTime(user.created_at)}>
              {relativeTime(user.created_at)}
            </p>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-smoke">
              Был в сети
            </h2>
            <p className="text-sm text-ash" title={exactTime(user.last_seen_at)}>
              {user.last_seen_at ? relativeTime(user.last_seen_at) : "—"}
            </p>
          </div>
          {user.bio && (
            <div className="sm:col-span-2">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-smoke">
                О себе
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ash">{user.bio}</p>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-smoke">
        Темы и сообщения пользователя — в Phase 1
      </p>
    </div>
  );
}
