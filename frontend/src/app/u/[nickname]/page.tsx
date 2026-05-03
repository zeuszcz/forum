import { Calendar, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";

import { MeshBackground } from "@/components/effects/MeshBackground";
import { ActivityHeatmap } from "@/components/forum/ActivityHeatmap";
import { AvatarRing } from "@/components/forum/AvatarRing";
import { ProfileContentTabs } from "@/components/forum/ProfileContentTabs";
import { ProfileEditButton } from "@/components/forum/ProfileEditDialog";
import { RoleBadges } from "@/components/forum/UserBadge";
import { XPBar } from "@/components/forum/XPBar";
import { apiServer, ApiError, apiServerOptional } from "@/lib/api";
import { exactTime, relativeTime } from "@/lib/format";
import { avatarGlowColor, glowNickProps, hasPerk, nickColor } from "@/lib/perks";
import { computeKarma, computeRank } from "@/lib/rank";
import type {
  Post,
  Thread,
  UserActivityResponse,
  UserPublic,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  let user: UserPublic;
  let threads: Thread[] = [];
  let posts: Post[] = [];
  let activity: UserActivityResponse = { days: [], total_days: 0 };

  try {
    const [u, t, p, a] = await Promise.all([
      apiServer<UserPublic>(`/users/${encodeURIComponent(nickname)}`),
      apiServer<Thread[]>(`/users/${encodeURIComponent(nickname)}/threads?limit=20`),
      apiServer<Post[]>(`/users/${encodeURIComponent(nickname)}/posts?limit=20`),
      apiServer<UserActivityResponse>(
        `/users/${encodeURIComponent(nickname)}/activity?days=90`,
      ),
    ]);
    user = u;
    threads = t;
    posts = p;
    activity = a;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const me = await apiServerOptional<UserPublic>("/auth/me");
  const isMe = Boolean(me && me.id === user.id);

  const rank = computeRank(user.total_posts, user.total_reactions_received);
  const karma = computeKarma(user.total_posts, user.total_reactions_received);
  const isOnline =
    user.last_seen_at &&
    Date.now() - new Date(user.last_seen_at).getTime() < 10 * 60 * 1000;

  const glow = glowNickProps(user);
  const heroNickColor = nickColor(user);
  const heroGlowColor = avatarGlowColor(user);
  const hasAnimatedFrame = hasPerk(user, "animated_frame");

  return (
    <div className="container max-w-4xl py-6 md:py-10">
      {/* === Hero === */}
      <section className="relative overflow-hidden rounded-2xl border-2 border-plasma/30 bg-card">
        <div className="absolute inset-0 -z-10">
          <MeshBackground />
        </div>
        <div className="dotted-grid pointer-events-none absolute inset-0 -z-[5] opacity-25" />

        <div className="relative flex flex-wrap items-start gap-6 p-6 md:p-8">
          <div className={hasAnimatedFrame ? "animate-pulse-slow" : undefined}>
            <AvatarRing
              nickname={user.nickname}
              size={104}
              level={rank.level}
              percent={rank.percent}
              color={rank.color}
              glowColor={heroGlowColor}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1
                className={`text-2xl font-bold tracking-tight md:text-3xl ${glow.className}`}
                style={{
                  color: heroNickColor,
                  ...glow.style,
                }}
              >
                {user.nickname}
              </h1>
              {isOnline && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan/10 px-2.5 py-0.5 text-xs font-medium text-cyan">
                  <span className="dot-live animate-pulse-slow" />
                  онлайн
                </span>
              )}
              {!isOnline && user.last_seen_at && (
                <span
                  className="inline-flex items-center gap-1.5 text-xs text-smoke"
                  title={exactTime(user.last_seen_at)}
                >
                  <Clock className="h-3 w-3" />
                  {relativeTime(user.last_seen_at)}
                </span>
              )}
            </div>

            {user.title && (
              <p className="mt-1 text-sm italic text-ash">{user.title}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest"
                style={{
                  borderColor: `${rank.color}55`,
                  color: rank.color,
                  backgroundColor: `${rank.color}1f`,
                }}
              >
                Lvl {rank.level}
              </span>
              <span className="text-xs font-semibold" style={{ color: rank.color }}>
                {rank.title}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-mono font-bold"
                title={`Карма растёт от постов и полученных реакций. Текущий тир: ${karma.title}.`}
                style={{
                  borderColor: `${karma.color}55`,
                  color: karma.color,
                  backgroundColor: `${karma.color}10`,
                }}
              >
                ⚡ {karma.value}
                <span className="text-[9px] uppercase tracking-widest opacity-70">
                  карма
                </span>
              </span>
            </div>

            <div className="mt-4">
              <RoleBadges roles={user.roles} />
            </div>
          </div>

          {isMe && (
            <div className="ml-auto">
              <ProfileEditButton user={user} />
            </div>
          )}
        </div>

        {/* Stats strip below hero */}
        <div className="relative grid grid-cols-3 gap-px border-t border-plasma/20 bg-border/40">
          <HeroStat value={user.total_posts} label="постов" accent="plasma" />
          <HeroStat
            value={user.total_reactions_received}
            label="реакций"
            accent="flame"
          />
          <HeroStat value={threads.length} label="тем" accent="cyan" />
        </div>
      </section>

      {/* === Bio === */}
      {user.bio && (
        <section className="mt-4 rounded-lg border border-border bg-card p-5">
          <header className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-plasma" />
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-smoke">
              О себе
            </h2>
          </header>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ash [overflow-wrap:anywhere]">
            {user.bio}
          </p>
        </section>
      )}

      {/* === Granted perks ribbon (if any) === */}
      {user.granted_perks?.length > 0 && (
        <section className="mt-4 rounded-lg border border-plasma/30 bg-plasma/5 p-4">
          <header className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-plasma" />
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-plasma">
              Перки от админа
            </h2>
          </header>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {user.granted_perks.map((p) => (
              <span
                key={p}
                className="rounded-md border border-plasma/40 bg-plasma/15 px-2.5 py-1 font-mono text-[11px] text-plasma"
              >
                {p}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* === Level + perks card === */}
      <section className="mt-4">
        <XPBar posts={user.total_posts} reactions={user.total_reactions_received} />
      </section>

      {/* === Activity heatmap === */}
      <section className="mt-4">
        <ActivityHeatmap days={activity.days} />
      </section>

      {/* === Content tabs === */}
      <section className="mt-4">
        <ProfileContentTabs
          threads={threads}
          posts={posts}
          totalPosts={user.total_posts}
          totalReactions={user.total_reactions_received}
        />
      </section>

      {/* === Footer meta === */}
      <footer className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[11px] text-smoke">
        <span
          className="inline-flex items-center gap-1.5"
          title={exactTime(user.created_at)}
        >
          <Calendar className="h-3 w-3" />
          На форуме {relativeTime(user.created_at)}
        </span>
        {user.last_seen_at && (
          <span
            className="inline-flex items-center gap-1.5"
            title={exactTime(user.last_seen_at)}
          >
            <Clock className="h-3 w-3" />
            Последний визит {relativeTime(user.last_seen_at)}
          </span>
        )}
      </footer>
    </div>
  );
}

function HeroStat({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent: "plasma" | "flame" | "cyan";
}) {
  const color =
    accent === "plasma"
      ? "text-plasma"
      : accent === "flame"
        ? "text-flame"
        : "text-cyan";
  return (
    <div className="bg-card px-4 py-3 text-center">
      <div className={`font-mono text-xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-smoke">
        {label}
      </div>
    </div>
  );
}
