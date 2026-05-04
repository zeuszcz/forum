"use client";

import {
  Bold,
  Code,
  Eye,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Palette,
  Pencil,
  Quote,
  Strikethrough,
  Table as TableIcon,
  Type,
  Underline,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { MarkdownRenderer } from "@/components/forum/MarkdownRenderer";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MarkdownEditorProps extends Omit<TextareaProps, "onChange" | "value"> {
  value: string;
  onChange: (next: string) => void;
  /** Show the integrated preview tab. Default true. */
  withPreview?: boolean;
}

const PRESET_COLORS = [
  "#ec4899", // flame
  "#7c5cff", // plasma
  "#22d3ee", // cyan
  "#22c55e", // green
  "#facc15", // yellow
  "#f97316", // orange
  "#f43f5e", // ember
  "#a0a3b8", // smoke
];

const PRESET_SIZES = [12, 14, 16, 18, 22, 28];

/** Wrap or insert text at the textarea's current selection. */
function applySelection(
  ta: HTMLTextAreaElement,
  before: string,
  after: string,
  fallback: string,
): { value: string; caretStart: number; caretEnd: number } {
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? 0;
  const v = ta.value;
  const selected = v.slice(start, end) || fallback;
  const next = v.slice(0, start) + before + selected + after + v.slice(end);
  return {
    value: next,
    caretStart: start + before.length,
    caretEnd: start + before.length + selected.length,
  };
}

/** Insert text at line start, e.g. for `> `, `# `, `- `. */
function applyLinePrefix(
  ta: HTMLTextAreaElement,
  prefix: string,
): { value: string; caretStart: number; caretEnd: number } {
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? 0;
  const v = ta.value;
  // Expand selection to full line(s)
  const lineStart = v.lastIndexOf("\n", start - 1) + 1;
  const sliceEnd = v.indexOf("\n", end);
  const lineEnd = sliceEnd === -1 ? v.length : sliceEnd;
  const block = v.slice(lineStart, lineEnd);
  const replaced = block
    .split("\n")
    .map((l) => (l.startsWith(prefix) ? l : prefix + l))
    .join("\n");
  const next = v.slice(0, lineStart) + replaced + v.slice(lineEnd);
  return {
    value: next,
    caretStart: lineStart,
    caretEnd: lineStart + replaced.length,
  };
}

export function MarkdownEditor({
  value,
  onChange,
  withPreview = true,
  className,
  rows = 8,
  ...rest
}: MarkdownEditorProps) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = React.useState<"compose" | "preview">("compose");
  const [uploading, setUploading] = React.useState(false);

  function applyAndFocus(action: (ta: HTMLTextAreaElement) => {
    value: string;
    caretStart: number;
    caretEnd: number;
  }) {
    const ta = ref.current;
    if (!ta) return;
    const r = action(ta);
    onChange(r.value);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(r.caretStart, r.caretEnd);
    });
  }

  function wrap(before: string, after = before, fallback = "текст") {
    applyAndFocus((ta) => applySelection(ta, before, after, fallback));
  }

  function linePrefix(prefix: string) {
    applyAndFocus((ta) => applyLinePrefix(ta, prefix));
  }

  function insertAtCursor(text: string) {
    applyAndFocus((ta) => {
      const start = ta.selectionStart ?? 0;
      const v = ta.value;
      return {
        value: v.slice(0, start) + text + v.slice(start),
        caretStart: start + text.length,
        caretEnd: start + text.length,
      };
    });
  }

  function insertLink() {
    const url = window.prompt("URL ссылки:");
    if (!url) return;
    applyAndFocus((ta) => applySelection(ta, "[", `](${url})`, "ссылка"));
  }

  function insertTable() {
    const text =
      "\n| Колонка 1 | Колонка 2 | Колонка 3 |\n|---|---|---|\n| ячейка | ячейка | ячейка |\n| ячейка | ячейка | ячейка |\n";
    insertAtCursor(text);
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // We use raw fetch here because `api()` defaults to JSON content-type.
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/attachments`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new ApiError(res.status, j.detail ?? res.statusText);
      }
      const { url } = (await res.json()) as { url: string };
      insertAtCursor(`\n![${file.name}](${url})\n`);
      toast.success("Картинка вставлена");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Не удалось загрузить");
    } finally {
      setUploading(false);
    }
  }

  function pickImage() {
    fileRef.current?.click();
  }

  function setColor(color: string) {
    wrap(`[color:${color}]`, "[/color]", "текст");
  }
  function setSize(size: number) {
    wrap(`[size:${size}]`, "[/size]", "текст");
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-void/40 p-1.5">
        <ToolbarBtn icon={Bold} onClick={() => wrap("**", "**", "жирный")} title="Жирный (Ctrl+B)" />
        <ToolbarBtn icon={Italic} onClick={() => wrap("*", "*", "курсив")} title="Курсив (Ctrl+I)" />
        <ToolbarBtn icon={Strikethrough} onClick={() => wrap("~~", "~~", "зачёркнутый")} title="Зачёркнутый" />
        <ToolbarBtn icon={Underline} onClick={() => wrap("[u]", "[/u]", "подчёркнутый")} title="Подчёркнутый" />

        <Divider />

        <ToolbarBtn icon={Heading2} onClick={() => linePrefix("## ")} title="Заголовок H2" />
        <ToolbarBtn icon={Heading3} onClick={() => linePrefix("### ")} title="Заголовок H3" />

        <Divider />

        <ToolbarBtn icon={List} onClick={() => linePrefix("- ")} title="Маркированный список" />
        <ToolbarBtn icon={ListOrdered} onClick={() => linePrefix("1. ")} title="Нумерованный список" />
        <ToolbarBtn icon={Quote} onClick={() => linePrefix("> ")} title="Цитата" />

        <Divider />

        <ToolbarBtn icon={Link2} onClick={insertLink} title="Ссылка" />
        <ToolbarBtn
          icon={uploading ? Loader2 : ImageIcon}
          onClick={pickImage}
          title={uploading ? "Загрузка…" : "Картинка"}
          spin={uploading}
        />
        <ToolbarBtn icon={Code} onClick={() => wrap("`", "`", "код")} title="Inline код" />
        <ToolbarBtn icon={TableIcon} onClick={insertTable} title="Таблица" />

        <Divider />

        <ColorMenu onPick={setColor} />
        <SizeMenu onPick={setSize} />

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = ""; // allow re-uploading same file
          }}
        />

        {withPreview && (
          <div className="ml-auto flex items-center gap-1">
            <ToolbarBtn
              icon={Pencil}
              onClick={() => setTab("compose")}
              title="Редактор"
              active={tab === "compose"}
            />
            <ToolbarBtn
              icon={Eye}
              onClick={() => setTab("preview")}
              title="Превью"
              active={tab === "preview"}
            />
          </div>
        )}
      </div>

      {tab === "compose" || !withPreview ? (
        <Textarea
          {...rest}
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
        />
      ) : (
        <div className="min-h-[160px] rounded-md border border-border bg-void/30 p-4">
          {value.trim() ? (
            <MarkdownRenderer source={value} />
          ) : (
            <p className="text-center text-sm text-smoke">
              Сначала напиши что-нибудь во вкладке «Редактор»
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({
  icon: Icon,
  onClick,
  title,
  active,
  spin,
}: {
  icon: React.ElementType;
  onClick: () => void;
  title: string;
  active?: boolean;
  spin?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-ash transition-colors hover:bg-slate hover:text-bone",
        active && "bg-plasma/15 text-plasma",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", spin && "animate-spin")} />
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

function ColorMenu({ onPick }: { onPick: (c: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onAway(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onAway);
    return () => document.removeEventListener("mousedown", onAway);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Цвет текста"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ash transition-colors hover:bg-slate hover:text-bone"
      >
        <Palette className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-40 rounded-md border border-border bg-card p-2 shadow-xl">
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-smoke">
            цвет текста
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                className="h-7 w-7 rounded border border-border transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
                aria-label={`Цвет ${c}`}
              />
            ))}
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-[10px] text-smoke">
            свой:
            <input
              type="color"
              defaultValue="#7c5cff"
              onChange={(e) => {
                onPick(e.target.value);
                setOpen(false);
              }}
              className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function SizeMenu({ onPick }: { onPick: (n: number) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onAway(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onAway);
    return () => document.removeEventListener("mousedown", onAway);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Размер шрифта"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ash transition-colors hover:bg-slate hover:text-bone"
      >
        <Type className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-32 rounded-md border border-border bg-card p-1.5 shadow-xl">
          <div className="mb-1 px-1.5 text-[10px] uppercase tracking-widest text-smoke">
            размер
          </div>
          {PRESET_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                onPick(n);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-ash transition-colors hover:bg-slate hover:text-bone"
            >
              <span style={{ fontSize: `${n}px` }}>текст</span>
              <span className="font-mono text-[10px] text-smoke">{n}px</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
