"use client";

import { Lock, Unlock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function SectionLockToggle({
  slug,
  initialLocked,
}: {
  slug: string;
  initialLocked: boolean;
}) {
  const router = useRouter();
  const [locked, setLocked] = useState(initialLocked);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const next = !locked;
    setLocked(next);
    try {
      await api(`/admin/sections/${encodeURIComponent(slug)}/lock`, {
        method: "POST",
        body: JSON.stringify({ locked: next }),
      });
      toast.success(next ? `${slug} закрыт` : `${slug} открыт`);
      router.refresh();
    } catch (err) {
      setLocked(!next);
      toast.error(err instanceof ApiError ? err.detail : "Не удалось");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
        locked
          ? "border-flame/40 bg-flame/10 text-flame hover:bg-flame/20"
          : "border-border text-ash hover:border-plasma/40 hover:text-bone",
      )}
      title={locked ? "Открыть раздел" : "Закрыть раздел"}
    >
      {locked ? (
        <>
          <Lock className="h-3 w-3" />
          закрыт
        </>
      ) : (
        <>
          <Unlock className="h-3 w-3" />
          открыт
        </>
      )}
    </button>
  );
}
