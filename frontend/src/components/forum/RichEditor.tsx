"use client";

import { Extension } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TextStyle from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  ChevronDown,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Palette,
  Pilcrow,
  Quote,
  Redo,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Optional fixed-height container; default = no min-height */
  minHeight?: number;
}

const PRESET_COLORS = [
  "#1a1424", // ink (default)
  "#ec4899", // flame
  "#7c5cff", // plasma
  "#22d3ee", // cyan
  "#22c55e", // green
  "#facc15", // yellow
  "#f97316", // orange
  "#f43f5e", // ember
];

/** Captures Tab inside the editor: nests list items when in a list (delegate
 *  to the default ListItem keymap), otherwise inserts an actual tab character
 *  so paragraphs can have indentation. Without this, browsers move focus out
 *  of the editor on Tab. */
const TabIndent = Extension.create({
  name: "tabIndent",
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (
          editor.isActive("listItem") ||
          editor.isActive("taskItem") ||
          editor.isActive("table")
        ) {
          // Let ListItem.sinkListItem / Table tab navigation own this.
          return false;
        }
        editor.chain().focus().insertContent("\t").run();
        return true;
      },
      "Shift-Tab": ({ editor }) => {
        if (
          editor.isActive("listItem") ||
          editor.isActive("taskItem") ||
          editor.isActive("table")
        ) {
          return false;
        }
        // Outside lists, Shift-Tab is a no-op (don't lose focus to browser).
        return true;
      },
    };
  },
});

/** Wrapper that exposes a single `value/onChange` API on top of TipTap. The
 *  parent stores HTML; rendering pipeline (PostBody → MarkdownRenderer with
 *  rehype-raw) handles HTML safely on display. */
export function RichEditor({
  value,
  onChange,
  placeholder = "Что у тебя на уме?",
  minHeight = 240,
}: RichEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: "rich-codeblock" } },
      }),
      TabIndent,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
          class: "text-plasma underline-offset-4 hover:underline",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "rich-img my-3 max-h-[520px] max-w-full rounded-md border border-border",
        },
        allowBase64: false,
      }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "rich-editor prose prose-invert max-w-none focus:outline-none px-4 py-3 min-h-[var(--rich-min-h)]",
      },
    },
  });

  // Keep external value in sync (e.g. parent reset)
  React.useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      // emitUpdate=false prevents loop: parent set → editor → onUpdate → parent
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="rounded-md border border-border bg-void/30 p-4 text-sm text-smoke">
        Загрузка редактора…
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-md border border-border bg-card"
      style={{ ["--rich-min-h" as string]: `${minHeight}px` }}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/attachments`,
        { method: "POST", body: fd, credentials: "include" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new ApiError(res.status, j.detail ?? res.statusText);
      }
      const { url } = (await res.json()) as { url: string };
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Не удалось загрузить");
    } finally {
      setUploading(false);
    }
  }

  function setLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL ссылки (пусто = убрать):", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function insertTable() {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-void/40 p-1.5">
      <HeadingMenu editor={editor} />

      <Divider />

      <BtnIcon
        editor={editor}
        cmd="toggleBold"
        active="bold"
        icon={Bold}
        label="Жирный"
        kbd="Ctrl+B"
      />
      <BtnIcon
        editor={editor}
        cmd="toggleItalic"
        active="italic"
        icon={Italic}
        label="Курсив"
        kbd="Ctrl+I"
      />
      <BtnIcon
        editor={editor}
        cmd="toggleUnderline"
        active="underline"
        icon={UnderlineIcon}
        label="Подчёркнутый"
        kbd="Ctrl+U"
      />
      <BtnIcon
        editor={editor}
        cmd="toggleStrike"
        active="strike"
        icon={Strikethrough}
        label="Зачёркнутый"
      />

      <Divider />

      <BtnIcon
        editor={editor}
        cmd="toggleBulletList"
        active="bulletList"
        icon={List}
        label="Маркированный список"
      />
      <BtnIcon
        editor={editor}
        cmd="toggleOrderedList"
        active="orderedList"
        icon={ListOrdered}
        label="Нумерованный список"
      />
      <BtnIcon
        editor={editor}
        cmd="toggleBlockquote"
        active="blockquote"
        icon={Quote}
        label="Цитата"
      />

      <Divider />

      <button
        type="button"
        onClick={setLink}
        title="Ссылка"
        className={cn(toolbarBtnCls, editor.isActive("link") && activeBtnCls)}
      >
        <Link2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title={uploading ? "Загрузка…" : "Картинка"}
        className={toolbarBtnCls}
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImageIcon className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={insertTable}
        title="Таблица"
        className={toolbarBtnCls}
      >
        <TableIcon className="h-3.5 w-3.5" />
      </button>

      <Divider />

      <ColorMenu editor={editor} />

      <Divider />

      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Отменить (Ctrl+Z)"
        className={cn(toolbarBtnCls, "disabled:opacity-30")}
      >
        <Undo className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Вернуть (Ctrl+Shift+Z)"
        className={cn(toolbarBtnCls, "disabled:opacity-30")}
      >
        <Redo className="h-3.5 w-3.5" />
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const toolbarBtnCls =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-ash transition-colors hover:bg-slate hover:text-bone";
const activeBtnCls = "bg-plasma/15 text-plasma";

function BtnIcon({
  editor,
  cmd,
  active,
  icon: Icon,
  label,
  kbd,
}: {
  editor: Editor;
  cmd: string;
  active: string;
  icon: React.ElementType;
  label: string;
  kbd?: string;
}) {
  const isActive = editor.isActive(active);
  return (
    <button
      type="button"
      onClick={() => {
        // We index commands by name string for compactness
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((editor.chain().focus() as any)[cmd]() as any).run();
      }}
      title={kbd ? `${label} (${kbd})` : label}
      className={cn(toolbarBtnCls, isActive && activeBtnCls)}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

function HeadingMenu({ editor }: { editor: Editor }) {
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

  const isP = editor.isActive("paragraph");
  const isH2 = editor.isActive("heading", { level: 2 });
  const isH3 = editor.isActive("heading", { level: 3 });

  let label = "Текст";
  let Icon: React.ElementType = Pilcrow;
  if (isH2) {
    label = "H2";
    Icon = Heading2;
  } else if (isH3) {
    label = "H3";
    Icon = Heading3;
  } else if (isP) {
    label = "Текст";
    Icon = Pilcrow;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-ash transition-colors hover:bg-slate hover:text-bone"
        title="Стиль текста"
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md border border-border bg-card shadow-xl">
          <HeadingItem
            onClick={() => {
              editor.chain().focus().setParagraph().run();
              setOpen(false);
            }}
            active={isP}
          >
            <Pilcrow className="h-4 w-4 text-smoke" />
            <span className="text-sm">Обычный текст</span>
          </HeadingItem>
          <HeadingItem
            onClick={() => {
              editor.chain().focus().toggleHeading({ level: 2 }).run();
              setOpen(false);
            }}
            active={isH2}
          >
            <Heading2 className="h-4 w-4 text-plasma" />
            <span className="text-base font-bold">Заголовок</span>
          </HeadingItem>
          <HeadingItem
            onClick={() => {
              editor.chain().focus().toggleHeading({ level: 3 }).run();
              setOpen(false);
            }}
            active={isH3}
          >
            <Heading3 className="h-4 w-4 text-cyan" />
            <span className="text-sm font-semibold">Подзаголовок</span>
          </HeadingItem>
        </div>
      )}
    </div>
  );
}

function HeadingItem({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
        active ? "bg-plasma/15 text-bone" : "text-ash hover:bg-slate",
      )}
    >
      {children}
    </button>
  );
}

function ColorMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const current = (editor.getAttributes("textStyle").color as string | undefined) ?? "";

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
        className={toolbarBtnCls}
      >
        <Palette className="h-3.5 w-3.5" style={current ? { color: current } : undefined} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-md border border-border bg-card p-2 shadow-xl">
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-smoke">
            цвет текста
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  editor.chain().focus().setColor(c).run();
                  setOpen(false);
                }}
                className={cn(
                  "h-7 w-7 rounded border transition-transform hover:scale-110",
                  current.toLowerCase() === c.toLowerCase()
                    ? "border-bone ring-2 ring-plasma"
                    : "border-border",
                )}
                style={{ backgroundColor: c }}
                aria-label={`Цвет ${c}`}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-smoke">
            <label className="flex items-center gap-1.5">
              свой:
              <input
                type="color"
                defaultValue={current || "#7c5cff"}
                onChange={(e) => {
                  editor.chain().focus().setColor(e.target.value).run();
                }}
                className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
              />
            </label>
            {current && (
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setOpen(false);
                }}
                className="text-plasma hover:underline"
              >
                сбросить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
