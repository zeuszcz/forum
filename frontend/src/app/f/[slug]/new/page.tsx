import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { NewThreadForm } from "./new-thread-form";

import { apiServer, ApiError, apiServerOptional } from "@/lib/api";
import type { Section, UserPublic } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = await apiServerOptional<UserPublic>("/auth/me");
  if (!user) redirect(`/login?next=/f/${encodeURIComponent(slug)}/new`);

  let section: Section;
  try {
    section = await apiServer<Section>(`/sections/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  if (section.is_locked) {
    return (
      <div className="container max-w-3xl py-10">
        <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-smoke">
          Раздел закрыт для постинга
        </p>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-6 md:py-10">
      <nav className="mb-4 flex items-center gap-1 text-xs text-smoke">
        <Link href="/" className="transition-colors hover:text-ash">
          Форум
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/f/${section.slug}`} className="transition-colors hover:text-ash">
          {section.title}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-ash">Новая тема</span>
      </nav>

      <h1 className="mb-1 text-xl font-bold tracking-tight text-bone">Новая тема</h1>
      <p className="mb-6 text-sm text-smoke">
        в разделе <span className="text-ash">{section.title}</span>
      </p>

      <NewThreadForm sectionSlug={section.slug} />
    </div>
  );
}
