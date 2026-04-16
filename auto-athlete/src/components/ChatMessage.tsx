"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import PlayerStatusBadge from "@/components/PlayerStatusBadge";
import type { PlayerStatus } from "@/lib/player-queries";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
  isStreaming?: boolean;
}

interface PlayerCardPayload {
  id?: string;
  name: string;
  position?: string;
  status?: PlayerStatus;
}

interface MetricCardPayload {
  label: string;
  value: string;
  subtext?: string;
}

type ParsedBlock =
  | { type: "text"; content: string }
  | { type: "player-card"; payload: PlayerCardPayload }
  | { type: "metric-card"; payload: MetricCardPayload };

function parseStructuredBlocks(content: string): ParsedBlock[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const pattern = /:::(player-card|metric-card)\n([\s\S]*?)\n:::/g;
  const blocks: ParsedBlock[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(normalized);

  while (match) {
    const fullMatch = match[0];
    const markerType = match[1];
    const rawJson = match[2];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      blocks.push({
        type: "text",
        content: normalized.slice(lastIndex, matchIndex),
      });
    }

    try {
      const parsed = JSON.parse(rawJson) as PlayerCardPayload | MetricCardPayload;
      if (markerType === "player-card" && typeof (parsed as PlayerCardPayload).name === "string") {
        blocks.push({
          type: "player-card",
          payload: parsed as PlayerCardPayload,
        });
      } else if (
        markerType === "metric-card" &&
        typeof (parsed as MetricCardPayload).label === "string" &&
        typeof (parsed as MetricCardPayload).value === "string"
      ) {
        blocks.push({
          type: "metric-card",
          payload: parsed as MetricCardPayload,
        });
      } else {
        blocks.push({ type: "text", content: fullMatch });
      }
    } catch {
      blocks.push({ type: "text", content: fullMatch });
    }

    lastIndex = matchIndex + fullMatch.length;
    match = pattern.exec(normalized);
  }

  if (lastIndex < normalized.length) {
    blocks.push({
      type: "text",
      content: normalized.slice(lastIndex),
    });
  }

  return blocks.length > 0 ? blocks : [{ type: "text", content: normalized }];
}

// Custom renderers that map markdown elements onto the Auto Athlete dark theme.
// Covers headings, paragraphs, lists, tables, inline/block code, blockquotes,
// horizontal rules, and links. Raw HTML is dropped by default (react-markdown
// does not render it unless rehype-raw is added) which keeps LLM output safe.
const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="font-display text-lg uppercase tracking-wider text-aa-text">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-display text-base uppercase tracking-wider text-aa-text">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-display text-sm uppercase tracking-wider text-aa-text-secondary">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold uppercase tracking-wide text-aa-text-secondary">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="leading-6 text-aa-text">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-aa-text">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-aa-text">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-5 marker:text-aa-accent/70">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-5 marker:text-aa-text-secondary">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-6">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-aa-accent underline decoration-aa-accent/40 underline-offset-2 hover:decoration-aa-accent"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-aa-accent/50 pl-3 text-aa-text-secondary italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-aa-border" />,
  // Render tables inside a horizontal-scroll wrapper so wide stat tables
  // (common in this app) don't blow out the chat panel width.
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-xl border border-aa-border bg-aa-bg/45">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-aa-elevated text-[11px] uppercase tracking-wider text-aa-text-secondary">
      {children}
    </thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-aa-border">{children}</tbody>,
  tr: ({ children }) => <tr className="align-top">{children}</tr>,
  th: ({ children, style }) => (
    <th
      className="px-3 py-2 text-left font-semibold"
      style={style}
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td className="px-3 py-2 font-mono text-aa-text" style={style}>
      {children}
    </td>
  ),
  // react-markdown v10 removed the `inline` prop. Fenced code blocks are
  // wrapped in a <pre> and their children string preserves a trailing newline,
  // while inline code never contains newlines — use that to differentiate.
  code: ({
    className,
    children,
    ...rest
  }: React.HTMLAttributes<HTMLElement> & { className?: string; children?: React.ReactNode }) => {
    const text = typeof children === "string" ? children : "";
    const isBlock = text.includes("\n") || (className ?? "").startsWith("language-");

    if (!isBlock) {
      return (
        <code
          className="rounded bg-aa-bg/70 px-1.5 py-0.5 font-mono text-[0.85em] text-aa-accent"
          {...rest}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`${className ?? ""} font-mono text-xs text-aa-text`} {...rest}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-xl border border-aa-border bg-aa-bg/70 p-3 text-xs leading-5">
      {children}
    </pre>
  ),
};

export default function ChatMessage({
  role,
  content,
  isLoading = false,
  isStreaming = false,
}: ChatMessageProps): JSX.Element {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const blocks = parseStructuredBlocks(content);

  async function copyMessage(): Promise<void> {
    if (!content.trim()) return;

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-6 shadow-lg ${
          isUser
            ? "border-aa-accent/25 bg-aa-accent/10 text-aa-text"
            : "border-aa-border bg-aa-elevated/90 text-aa-text"
        }`}
      >
        {!isUser && !isLoading && (
          <div className="mb-2 flex items-center justify-end">
            <button
              type="button"
              onClick={copyMessage}
              className="rounded-lg border border-aa-border bg-aa-bg/45 px-2 py-1 text-[11px] font-mono text-aa-text-secondary transition-colors hover:border-aa-border-bright hover:text-aa-text active:scale-[0.97]"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center gap-2 text-aa-text-secondary">
            <span className="h-2 w-2 rounded-full bg-aa-accent animate-pulse-glow" />
            <span>Thinking...</span>
          </div>
        ) : (
          <div className="space-y-2 break-words">
            {blocks.map((block, index) => {
              if (block.type === "text") {
                return (
                  <div
                    key={`text-${index}`}
                    className="space-y-2 break-words text-sm leading-6"
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {block.content}
                    </ReactMarkdown>
                  </div>
                );
              }

              if (block.type === "player-card") {
                const payload = block.payload;
                const isClickable = typeof payload.id === "string" && payload.id.length > 0;

                return (
                  <button
                    key={`player-${index}`}
                    type="button"
                    disabled={!isClickable}
                    onClick={() => {
                      if (payload.id) {
                        router.push(`/dashboard/players/${payload.id}`);
                      }
                    }}
                    className={`w-full rounded-2xl border border-aa-border bg-aa-bg/55 p-4 text-left transition-colors ${
                      isClickable
                        ? "hover:border-aa-border-bright hover:bg-aa-bg/75 active:scale-[0.99]"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-aa-text">{payload.name}</p>
                        <p className="mt-1 text-xs text-aa-text-secondary">
                          {payload.position ?? "Unknown position"}
                        </p>
                      </div>
                      {payload.status ? (
                        <PlayerStatusBadge status={payload.status} />
                      ) : null}
                    </div>
                  </button>
                );
              }

              return (
                <div
                  key={`metric-${index}`}
                  className="rounded-2xl border border-aa-accent/15 bg-aa-bg/55 p-4"
                >
                  <p className="text-[11px] font-mono uppercase tracking-wider text-aa-text-dim">
                    {block.payload.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-aa-text">
                    {block.payload.value}
                  </p>
                  {block.payload.subtext ? (
                    <p className="mt-1 text-xs text-aa-text-secondary">
                      {block.payload.subtext}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {isStreaming && (
              <span className="inline-block h-4 w-[2px] translate-y-[3px] animate-pulse rounded-full bg-aa-accent align-baseline" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
