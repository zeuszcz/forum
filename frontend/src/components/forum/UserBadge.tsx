import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { LetterAvatar } from "@/components/ui/avatar";
import type { UserPublic } from "@/lib/types";
import { cn } from "@/lib/utils";

interface UserBadgeProps {
  user: UserPublic | null;
  size?: number;
  showRole?: boolean;
  className?: string;
}

/** Avatar + nickname (with optional top role colour). Links to the public profile. */
export function UserBadge({ user, size = 28, showRole = true, className }: UserBadgeProps) {
  if (!user) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-smoke", className)}>
        <span
          className="rounded-full bg-slate"
          style={{ width: size, height: size }}
          aria-hidden="true"
        />
        <span className="text-sm">удалён</span>
      </span>
    );
  }
  const topRole = user.roles?.[0];
  return (
    <Link
      href={`/u/${user.nickname}`}
      className={cn("group inline-flex items-center gap-2", className)}
    >
      <LetterAvatar nickname={user.nickname} size={size} />
      <span className="flex flex-col leading-tight">
        <span
          className="text-sm font-semibold tracking-tight transition-colors group-hover:text-plasma-bright"
          style={{ color: topRole?.color ?? "#e8e9f3" }}
        >
          {user.nickname}
        </span>
        {showRole && topRole && (
          <span className="text-[10px] uppercase tracking-wider text-smoke">
            {topRole.title}
          </span>
        )}
      </span>
    </Link>
  );
}

/** Compact inline pill for sidebars. */
export function UserPill({ user }: { user: UserPublic | null }) {
  if (!user) return <span className="text-xs text-smoke">удалён</span>;
  const topRole = user.roles?.[0];
  return (
    <Link
      href={`/u/${user.nickname}`}
      className="inline-flex items-center gap-1.5 text-xs font-medium tracking-tight transition-opacity hover:opacity-80"
      style={{ color: topRole?.color ?? "#e8e9f3" }}
    >
      <LetterAvatar nickname={user.nickname} size={18} />
      {user.nickname}
    </Link>
  );
}

export function RoleBadges({ roles }: { roles: UserPublic["roles"] }) {
  if (!roles?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <Badge key={r.slug} color={r.color}>
          {r.title}
        </Badge>
      ))}
    </div>
  );
}
