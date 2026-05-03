import { apiServer } from "@/lib/api";
import type { Section } from "@/lib/types";

import { SectionLockToggle } from "./section-lock-toggle";

export const dynamic = "force-dynamic";

export default async function SectionsAdminPage() {
  const sections = await apiServer<Section[]>("/sections");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-bone">Разделы</h1>
        <p className="text-xs text-smoke">
          закрытие раздела блокирует создание тем; ответы в существующих темах
          по-прежнему возможны.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-void/60 text-[10px] uppercase tracking-widest text-smoke">
            <tr>
              <th className="px-4 py-2.5 text-left">Раздел</th>
              <th className="px-4 py-2.5 text-left">Slug</th>
              <th className="px-4 py-2.5 text-left">Статистика</th>
              <th className="px-4 py-2.5 text-right">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {sections.map((s) => (
              <tr key={s.id} className="transition-colors hover:bg-void/40">
                <td className="px-4 py-3 font-semibold text-bone">{s.title}</td>
                <td className="px-4 py-3 font-mono text-xs text-smoke">{s.slug}</td>
                <td className="px-4 py-3 text-xs text-ash">
                  {s.thread_count} тем · {s.post_count} сообщ.
                </td>
                <td className="px-4 py-3 text-right">
                  <SectionLockToggle slug={s.slug} initialLocked={s.is_locked} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
