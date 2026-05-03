import { OnlineList } from "@/components/forum/OnlineList";
import { RecentThreads } from "@/components/forum/RecentThreads";
import { SectionCard } from "@/components/forum/SectionCard";
import { Shoutbox } from "@/components/forum/Shoutbox";
import { apiServer } from "@/lib/api";
import type { Section, ShoutboxMessage, Thread, UserPublic } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadHomeData() {
  const [sections, recentThreads, online, shoutbox] = await Promise.all([
    apiServer<Section[]>("/sections"),
    apiServer<Thread[]>("/threads/recent?limit=8"),
    apiServer<UserPublic[]>("/users/online"),
    apiServer<ShoutboxMessage[]>("/shoutbox?limit=50"),
  ]);
  return { sections, recentThreads, online, shoutbox };
}

export default async function HomePage() {
  const { sections, recentThreads, online, shoutbox } = await loadHomeData();
  const totalThreads = sections.reduce((s, x) => s + x.thread_count, 0);
  const totalPosts = sections.reduce((s, x) => s + x.post_count, 0);

  return (
    <div className="container py-6 md:py-10">
      {/* Compact header strip */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-5 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-bone">Форум сообщества</h1>
          <p className="mt-0.5 text-xs text-smoke">
            <span className="font-mono text-ash">{totalThreads}</span> тем ·{" "}
            <span className="font-mono text-ash">{totalPosts}</span> сообщений ·{" "}
            <span className="font-mono text-cyan">{online.length}</span> онлайн
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* --- main column --- */}
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-smoke">
              Разделы
            </h2>
            {sections.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-smoke">
                Разделы ещё не созданы. Запусти{" "}
                <code className="font-mono text-ash">scripts/seed.py</code>.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {sections.map((s) => (
                  <SectionCard key={s.id} section={s} />
                ))}
              </div>
            )}
          </section>

          <RecentThreads threads={recentThreads} />
        </div>

        {/* --- sidebar --- */}
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Shoutbox initialMessages={shoutbox} />
          <OnlineList users={online} />
        </aside>
      </div>
    </div>
  );
}
