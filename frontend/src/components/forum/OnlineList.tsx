import { UserPill } from "@/components/forum/UserBadge";
import type { UserPublic } from "@/lib/types";

export function OnlineList({ users }: { users: UserPublic[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-bone">Онлайн</h2>
        <span className="font-mono text-xs text-cyan">{users.length}</span>
      </header>
      <div className="p-4">
        {users.length === 0 ? (
          <p className="py-2 text-center text-xs text-smoke">Никого нет</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {users.map((u) => (
              <UserPill key={u.id} user={u} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
