import * as React from "react";

const URL_RE = /(https?:\/\/[^\s<>"]+)/g;

/**
 * Minimal renderer: preserves whitespace, autolinks URLs, styles `>` quote lines.
 * Real Markdown comes in Phase 1 — for now we just render safe text.
 */
export function PostBody({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="space-y-3 text-sm leading-relaxed text-bone whitespace-pre-wrap [overflow-wrap:anywhere]">
      {lines.map((line, idx) => {
        if (line.startsWith(">")) {
          return (
            <blockquote
              key={idx}
              className="border-l-2 border-plasma/50 bg-void/40 pl-3 py-1 text-ash italic"
            >
              {renderInline(line.replace(/^>\s?/, ""))}
            </blockquote>
          );
        }
        if (!line.trim()) return <br key={idx} />;
        return <p key={idx}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    parts.push(
      <a
        key={`${m.index}-${m[0]}`}
        href={m[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-plasma hover:text-plasma-bright underline underline-offset-4"
      >
        {m[0]}
      </a>,
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}
