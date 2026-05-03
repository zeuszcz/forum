import { ChevronRight, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ThreadRow } from "@/components/forum/ThreadRow";
import { Button } from "@/components/ui/button";
import { apiServer, ApiError } from "@/lib/api";
import type { SectionThreadsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let data: SectionThreadsResponse;
  try {
    data = await apiServer<SectionThreadsResponse>(
      `/sections/${encodeURIComponent(slug)}/threads?limit=30`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const { section, threads, total } = data;

  return (
    <div className="container py-6 md:py-10">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-xs text-smoke">
        <Link href="/" className="transition-colors hover:text-ash">
          Форум
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-ash">{section.title}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-card p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-bone">{section.title}</h1>
            {section.is_locked && <Lock className="h-4 w-4 text-smoke" />}
          </div>
          <p className="mt-1 text-sm text-ash">{section.description}</p>
          <p className="mt-2 text-xs text-smoke">
            <span className="font-mono text-ash">{total}</span> тем всего ·{" "}
            <span className="font-mono text-ash">{section.post_count}</span> сообщений
          </p>
        </div>
        {!section.is_locked && (
          <Button variant="gradient" asChild>
            <Link href={`/f/${section.slug}/new`}>
              <Plus className="h-4 w-4" />
              Новая тема
            </Link>
          </Button>
        )}
      </div>

      {/* Threads list */}
      <section className="rounded-lg border border-border bg-card">
        {threads.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm text-ash">В разделе ещё нет тем</p>
            {!section.is_locked && (
              <Button variant="outline" size="sm" asChild className="mt-4">
                <Link href={`/f/${section.slug}/new`}>
                  <Plus className="h-4 w-4" />
                  Создать первую
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div>
            {threads.map((t) => (
              <ThreadRow key={t.id} thread={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
