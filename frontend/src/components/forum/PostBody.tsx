"use client";

import { CornerDownRight, Quote } from "lucide-react";
import * as React from "react";

const URL_RE = /(https?:\/\/[^\s<>"]+)/g;

/** Detect quote header pattern produced by ReplyForm: `> **author** написал:` */
const QUOTE_HEADER_RE = /^>\s+\*\*(.+?)\*\*\s+(?:написал|сказал)\s*:\s*$/;

interface QuoteBlock {
  type: "quote";
  author: string | null;
  lines: string[];
}
interface TextBlock {
  type: "text";
  lines: string[];
}
type Block = QuoteBlock | TextBlock;

function parse(body: string): Block[] {
  const lines = body.split("\n");
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(QUOTE_HEADER_RE);
    if (headerMatch) {
      // start a new quote block
      cur = { type: "quote", author: headerMatch[1], lines: [] };
      blocks.push(cur);
      continue;
    }
    if (line.startsWith(">")) {
      if (!cur || cur.type !== "quote") {
        cur = { type: "quote", author: null, lines: [] };
        blocks.push(cur);
      }
      cur.lines.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (!cur || cur.type !== "text") {
      cur = { type: "text", lines: [] };
      blocks.push(cur);
    }
    cur.lines.push(line);
  }
  return blocks;
}

export function PostBody({ body }: { body: string }) {
  const blocks = React.useMemo(() => parse(body), [body]);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-bone [overflow-wrap:anywhere]">
      {blocks.map((block, idx) =>
        block.type === "quote" ? (
          <QuoteCard key={idx} author={block.author} lines={block.lines} />
        ) : (
          <TextChunk key={idx} lines={block.lines} />
        ),
      )}
    </div>
  );
}

function TextChunk({ lines }: { lines: string[] }) {
  // collapse leading/trailing blanks
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return null;
  return (
    <div className="space-y-2 whitespace-pre-wrap">
      {lines.map((l, i) =>
        l.trim() ? <p key={i}>{renderInline(l)}</p> : <br key={i} />,
      )}
    </div>
  );
}

function QuoteCard({ author, lines }: { author: string | null; lines: string[] }) {
  const [expanded, setExpanded] = React.useState(false);
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return null;
  const collapsedHeight = lines.length > 4;
  const visible = expanded || !collapsedHeight ? lines : lines.slice(0, 4);

  return (
    <div className="overflow-hidden rounded-md border border-plasma/30 bg-void/40">
      <header className="flex items-center justify-between border-b border-plasma/20 bg-plasma/10 px-3 py-1.5">
        <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest">
          <Quote className="h-3 w-3 text-plasma" />
          {author ? (
            <>
              <span className="text-smoke">цитата</span>
              <span className="font-semibold text-plasma">{author}</span>
            </>
          ) : (
            <span className="text-smoke">цитата</span>
          )}
        </div>
      </header>
      <div className="space-y-1 px-3 py-2 text-[13px] italic leading-relaxed text-ash whitespace-pre-wrap">
        {visible.map((l, i) => (
          <p key={i}>{renderInline(l)}</p>
        ))}
      </div>
      {collapsedHeight && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center justify-center gap-1 border-t border-plasma/15 bg-plasma/5 py-1 text-[11px] text-plasma transition-colors hover:bg-plasma/10"
        >
          <CornerDownRight className="h-3 w-3" />
          {expanded ? "свернуть" : `показать ещё ${lines.length - 4}`}
        </button>
      )}
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
