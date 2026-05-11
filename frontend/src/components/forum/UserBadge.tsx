"use client";

import Link from "next/link";

import { UserHoverCard } from "@/components/forum/UserHoverCard";
import { Badge } from "@/components/ui/badge";
import { LetterAvatar } from "@/components/ui/avatar";
import { avatarGlowColor, glowNickProps, nickColor } from "@/lib/perks";
import type { UserPublic } from "@/lib/types";
import { cn } from "@/lib/utils";

interface UserBadgeProps {
  user: UserPublic | null;
  size?: number;
  showRole?: boolean;
  className?: string;
  /** Disable the hover-card popover */
  noHover?: boolean;
}

export function UserBadge({ user, size = 28, showRole = true, className, noHover }: UserBadgeProps) {
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
  const glow = glowNickProps(user);
  const color = nickColor(user);
  const aGlow = avatarGlowColor(user);
  const inner = (
    <Link
      href={`/u/${user.nickname}`}
      className={cn("group inline-flex items-center gap-2", className)}
    >
      <LetterAvatar nickname={user.nickname} size={size} glowColor={aGlow} avatarUrl={user.avatar_url ?? null} />
      <span className="flex flex-col leading-tight">
        <span
          className={cn(
            "text-sm font-semibold tracking-tight transition-colors group-hover:text-plasma-bright",
            glow.className,
          )}
          style={{ color, ...glow.style }}
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
  if (noHover) return inner;
  return <UserHoverCard user={user}>{inner}</UserHoverCard>;
}

export function UserPill({ user, noHover }: { user: UserPublic | null; noHover?: boolean }) {
  if (!user) return <span className="text-xs text-smoke">удалён</span>;
  const glow = glowNickProps(user);
  const color = nickColor(user);
  const aGlow = avatarGlowColor(user);
  const inner = (
    <Link
      href={`/u/${user.nickname}`}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium tracking-tight transition-opacity hover:opacity-80",
        glow.className,
      )}
      style={{ color, ...glow.style }}
    >
      <LetterAvatar nickname={user.nickname} size={18} glowColor={aGlow} avatarUrl={user.avatar_url ?? null} />
      {user.nickname}
    </Link>
  );
  if (noHover) return inner;
  return <UserHoverCard user={user}>{inner}</UserHoverCard>;
}

export function RoleBadges({ roles }: { roles: UserPublic["roles"] }) {
  if (!roles?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <Badge key={r.slug} color={r.color}>
          {r.affiliation_tag ? `${r.title} ► ${r.affiliation_tag}` : r.title}
        </Badge>
      ))}
    </div>
  );
}
