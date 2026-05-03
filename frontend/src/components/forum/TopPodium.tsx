import Link from "next/link";
import { Crown, Medal } from "lucide-react";

import { LetterAvatar } from "@/components/ui/avatar";
import { plural } from "@/lib/format";

export interface TopUser {
  id: number;
  rank: number;
  nickname: string;
  avatar_url: string | null;
  title: string | null;
  posts: number;
  reactions: number;
  score: number;
}

const RANK_STYLE = {
  1: {
    bg: "from-flame/30 to-flame/0",
    glow: "shadow-glow-flame",
    icon: Crown,
    color: "rgb(var(--flame-rgb))",
    height: "h-28",
    label: "1 место",
    avatarSize: 56,
  },
  2: {
    bg: "from-plasma/25 to-plasma/0",
    glow: "shadow-glow-plasma",
    icon: Medal,
    color: "rgb(var(--plasma-rgb))",
    height: "h-24",
    label: "2 место",
    avatarSize: 48,
  },
  3: {
    bg: "from-cyan/20 to-cyan/0",
    glow: "",
    icon: Medal,
    color: "rgb(var(--cyan-rgb))",
    height: "h-20",
    label: "3 место",
    avatarSize: 44,
  },
} as const;

export function TopPodium({ users }: { users: TopUser[] }) {
  const byRank: Record<number, TopUser | undefined> = {};
  users.forEach((u) => (byRank[u.rank] = u));
  const order = [2, 1, 3]; // visual order: silver — gold — bronze

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-bone">
          Топ недели
        </h2>
        <p className="mt-0.5 text-[11px] text-smoke">
          по постам и реакциям за 7 дней
        </p>
      </header>
      <div className="grid grid-cols-3 gap-2 p-4">
        {order.map((rank) => {
          const u = byRank[rank];
          const style = RANK_STYLE[rank as 1 | 2 | 3];
          const Icon = style.icon;
          return (
            <div
              key={rank}
              className={`relative flex flex-col items-center justify-end rounded-md border border-border bg-gradient-to-t ${style.bg} ${style.height} ${style.glow} px-2 pb-3 pt-2`}
            >
              {u ? (
                <Link
                  href={`/u/${u.nickname}`}
                  className="flex flex-col items-center gap-1 text-center"
                >
                  <Icon
                    className="absolute -top-2.5 h-5 w-5"
                    style={{ color: style.color }}
                  />
                  <LetterAvatar nickname={u.nickname} size={style.avatarSize} />
                  <span
                    className="line-clamp-1 text-xs font-semibold"
                    style={{ color: style.color }}
                    title={u.nickname}
                  >
                    {u.nickname}
                  </span>
                  <span className="font-mono text-[10px] text-smoke">
                    {u.posts} {plural(u.posts, "пост", "поста", "постов")}
                  </span>
                </Link>
              ) : (
                <div className="text-[10px] text-smoke">—</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
