"use client";

import { CornerDownRight, Quote } from "lucide-react";
import * as React from "react";

import { MarkdownRenderer } from "@/components/forum/MarkdownRenderer";

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

/** Split body into quote-card blocks vs free-form markdown blocks. The quote
 *  detection only fires on consecutive lines that start with `> ` AND the first
 *  matches the legacy author-header pattern — anything else falls through to
 *  markdown which renders `> ` as a regular blockquote. */
function parse(body: string): Block[] {
  const lines = body.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const headerMatch = line.match(QUOTE_HEADER_RE);
    if (headerMatch) {
      const block: QuoteBlock = {
        type: "quote",
        author: headerMatch[1],
        lines: [],
      };
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        block.lines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(block);
      continue;
    }
    // Accumulate text/markdown lines until the next quote-header
    const textBlock: TextBlock = { type: "text", lines: [] };
    while (i < lines.length && !lines[i].match(QUOTE_HEADER_RE)) {
      textBlock.lines.push(lines[i]);
      i++;
    }
    if (textBlock.lines.length > 0) blocks.push(textBlock);
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
          <MarkdownRenderer key={idx} source={block.lines.join("\n")} />
        ),
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
      <div className="px-3 py-2 text-[13px] italic leading-relaxed text-ash">
        <MarkdownRenderer source={visible.join("\n")} />
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
