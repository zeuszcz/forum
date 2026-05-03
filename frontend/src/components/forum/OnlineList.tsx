import { Users } from "lucide-react";

import { StaggerItem, StaggerList } from "@/components/effects/ScrollReveal";
import { UserPill } from "@/components/forum/UserBadge";
import type { UserPublic } from "@/lib/types";

export function OnlineList({ users }: { users: UserPublic[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-bone">
          <Users className="h-4 w-4 text-cyan" />
          Онлайн
        </h2>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-cyan">
          <span className="dot-live animate-pulse-slow" />
          {users.length}
        </span>
      </header>
      <div className="p-4">
        {users.length === 0 ? (
          <p className="py-2 text-center text-xs text-smoke">Никого нет</p>
        ) : (
          <StaggerList stagger={0.03} className="flex flex-wrap gap-1.5">
            {users.map((u) => (
              <StaggerItem key={u.id} y={6}>
                <UserPill user={u} />
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </div>
    </section>
  );
}
