import { ChevronRight, Lock } from "lucide-react";
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
      <div className="container max-w-3xl py-12">
        <div className="rounded-lg border border-flame/30 bg-flame/5 p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-flame" />
          <h1 className="mt-3 text-xl font-bold text-bone">Раздел закрыт</h1>
          <p className="mt-1 text-sm text-ash">
            В разделе «{section.title}» сейчас нельзя создавать темы
          </p>
          <Link
            href={`/f/${section.slug}`}
            className="mt-4 inline-block link-plasma"
          >
            ← Вернуться в раздел
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-6 md:py-8">
      <nav className="mb-4 flex items-center gap-1 text-xs text-smoke">
        <Link href="/" className="transition-colors hover:text-ash">
          Форум
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link
          href={`/f/${section.slug}`}
          className="transition-colors hover:text-ash"
        >
          {section.title}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-iridescent font-semibold uppercase tracking-widest">
          Новая тема
        </span>
      </nav>

      <NewThreadForm section={section} />
    </div>
  );
}
