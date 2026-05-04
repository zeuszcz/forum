"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Pre-process body before markdown rendering. Two responsibilities:
 *
 * 1. TipTap WYSIWYG output uses `<span style="color: #xxx">…</span>` for the
 *    text-color extension. Our sanitizer doesn't allow raw `style`, so we
 *    rewrite to a `data-color` attribute that the components map below
 *    converts into a validated React style.
 *
 * 2. Legacy custom inline tags (used by older threads or hand-typed posts):
 *    `[color:…]…[/color]`, `[size:…]…[/size]`, `[u]…[/u]` → same data-attr
 *    spans.
 *
 * Validation of the values happens at React render time, so even malformed
 * payloads can't smuggle anything dangerous past sanitize.
 */
function preprocess(input: string): string {
  return input
    // TipTap: `<span style="color: #xxx">…</span>` → data-color
    .replace(/<span\s+style="color:\s*([^;"]+);?\s*"\s*>/gi, (_m, c) => {
      return `<span data-color="${String(c).trim()}">`;
    })
    // Legacy bracket tags
    .replace(/\[color:(#[0-9a-fA-F]{3,8})\](.+?)\[\/color\]/gs, (_m, c, t) => {
      return `<span data-color="${c}">${t}</span>`;
    })
    .replace(/\[size:(\d{1,2})\](.+?)\[\/size\]/gs, (_m, n, t) => {
      return `<span data-size="${n}">${t}</span>`;
    })
    .replace(/\[u\](.+?)\[\/u\]/gs, (_m, t) => {
      return `<span data-deco="underline">${t}</span>`;
    });
}

// Extend default sanitize schema: allow our data-* on span, plus img sizing.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      "dataColor",
      "dataSize",
      "dataDeco",
    ],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      "loading",
      "referrerPolicy",
    ],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      "target",
      "rel",
    ],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "span",
    "mark",
    "sub",
    "sup",
    "details",
    "summary",
  ],
};

export function MarkdownRenderer({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const prepared = React.useMemo(() => preprocess(source), [source]);

  return (
    <div
      className={cn(
        "prose-forum text-sm leading-relaxed text-bone [overflow-wrap:anywhere]",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ children, href, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-plasma transition-colors hover:text-plasma-bright underline-offset-4 hover:underline"
              {...props}
            >
              {children}
            </a>
          ),
          img: ({ src, alt, ...props }) => (
            // Embedded images: capped width, rounded, lazy
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={typeof src === "string" ? src : undefined}
              alt={alt ?? ""}
              loading="lazy"
              className="my-3 max-h-[520px] max-w-full rounded-md border border-border"
              {...props}
            />
          ),
          h1: ({ children, ...props }) => (
            <h1 className="mb-2 mt-4 text-2xl font-bold tracking-tight text-bone" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="mb-2 mt-4 text-xl font-bold tracking-tight text-bone" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="mb-1.5 mt-3 text-lg font-semibold tracking-tight text-bone" {...props}>
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 className="mb-1 mt-3 text-base font-semibold text-bone" {...props}>
              {children}
            </h4>
          ),
          p: ({ children, ...props }) => (
            <p className="mb-2 last:mb-0" {...props}>
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul className="my-2 list-disc space-y-1 pl-5" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => <li {...props}>{children}</li>,
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="my-2 rounded-r-md border-l-2 border-plasma/50 bg-plasma/5 px-3 py-1 italic text-ash"
              {...props}
            >
              {children}
            </blockquote>
          ),
          code: ({ className: cls, children, ...props }) => {
            const isInline = !cls;
            if (isInline) {
              return (
                <code
                  className="rounded bg-void px-1.5 py-0.5 font-mono text-[0.85em] text-cyan"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("font-mono text-[13px]", cls)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children, ...props }) => (
            <pre
              className="my-3 overflow-x-auto rounded-md border border-border bg-void p-3 text-[13px]"
              {...props}
            >
              {children}
            </pre>
          ),
          hr: ({ ...props }) => (
            <hr className="my-4 border-border" {...props} />
          ),
          table: ({ children, ...props }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-void/60" {...props}>
              {children}
            </thead>
          ),
          th: ({ children, ...props }) => (
            <th
              className="border border-border px-3 py-1.5 text-left font-semibold text-bone"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-border px-3 py-1.5 align-top" {...props}>
              {children}
            </td>
          ),
          input: ({ type, checked, ...props }) => {
            // GFM task list checkboxes
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-1.5 align-middle accent-plasma"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },
          strong: ({ children, ...props }) => (
            <strong className="font-bold text-bone" {...props}>
              {children}
            </strong>
          ),
          em: ({ children, ...props }) => (
            <em className="italic" {...props}>
              {children}
            </em>
          ),
          del: ({ children, ...props }) => (
            <del className="text-smoke" {...props}>
              {children}
            </del>
          ),
          span: ({ children, ...props }) => {
            // Validated style spans coming from preprocess()
            const dataColor = (props as Record<string, unknown>)["data-color"];
            const dataSize = (props as Record<string, unknown>)["data-size"];
            const dataDeco = (props as Record<string, unknown>)["data-deco"];

            const style: React.CSSProperties = {};
            if (typeof dataColor === "string" && /^#[0-9a-fA-F]{3,8}$/.test(dataColor)) {
              style.color = dataColor;
            }
            if (typeof dataSize === "string" && /^\d{1,2}$/.test(dataSize)) {
              const px = Math.min(32, Math.max(10, parseInt(dataSize, 10)));
              style.fontSize = `${px}px`;
            }
            if (dataDeco === "underline") {
              style.textDecoration = "underline";
              style.textUnderlineOffset = "3px";
            }

            return <span style={style}>{children}</span>;
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
