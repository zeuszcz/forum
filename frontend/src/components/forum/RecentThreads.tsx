import Link from "next/link";

import { StaggerItem, StaggerList } from "@/components/effects/ScrollReveal";
import { ThreadRowCompact } from "@/components/forum/ThreadRow";
import type { Thread } from "@/lib/types";

export function RecentThreads({ threads }: { threads: Thread[] }) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-bone">Последняя активность</h2>
        <Link href="/recent" className="text-xs text-smoke transition-colors hover:text-ash">
          все →
        </Link>
      </header>
      {threads.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-smoke">Тем пока нет</p>
      ) : (
        <StaggerList stagger={0.04}>
          {threads.map((t) => (
            <StaggerItem key={t.id} y={8}>
              <ThreadRowCompact thread={t} />
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </section>
  );
}
