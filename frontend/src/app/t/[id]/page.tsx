import { ChevronRight, Eye, Lock, MessageCircle, Pin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ThreadView } from "@/components/forum/ThreadView";
import { apiServer, ApiError } from "@/lib/api";
import { plural } from "@/lib/format";
import type { ThreadWithPosts } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const threadId = Number.parseInt(id, 10);
  if (Number.isNaN(threadId)) notFound();

  let data: ThreadWithPosts;
  try {
    data = await apiServer<ThreadWithPosts>(`/threads/${threadId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const { thread, posts, section, total_posts } = data;

  return (
    <div className="container max-w-4xl py-6 md:py-10">
      <nav className="mb-4 flex items-center gap-1 text-xs text-smoke">
        <Link href="/" className="transition-colors hover:text-ash">
          Форум
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/f/${section.slug}`} className="transition-colors hover:text-ash">
          {section.title}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="truncate text-ash">{thread.title}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-start gap-2">
          {thread.is_pinned && <Pin className="mt-2 h-5 w-5 shrink-0 text-plasma" />}
          {thread.is_locked && <Lock className="mt-2 h-5 w-5 shrink-0 text-smoke" />}
          <h1 className="text-2xl font-bold tracking-tight text-bone md:text-3xl">
            {thread.title}
          </h1>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-smoke">
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" />
            <span className="font-mono text-ash">{total_posts}</span>{" "}
            {plural(total_posts, "сообщение", "сообщения", "сообщений")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            <span className="font-mono text-ash">{thread.view_count}</span> просмотров
          </span>
        </div>
      </header>

      <ThreadView thread={thread} posts={posts} />
    </div>
  );
}
