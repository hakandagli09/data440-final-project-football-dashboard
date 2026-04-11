"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={`${part}-${index}`} className="font-semibold text-aa-text">{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}

function renderLines(content: string): JSX.Element[] {
  return content.split("\n").map((line, index) => {
    const key = `${index}-${line}`;
    const trimmed = line.trim();

    if (/^[-*]\s+/.test(trimmed)) {
      return (
        <div key={key} className="flex items-start gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current/70" />
          <span>{renderInlineMarkdown(trimmed.replace(/^[-*]\s+/, ""))}</span>
        </div>
      );
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const [, number = "", text = ""] = trimmed.match(/^(\d+)\.\s+(.*)$/) ?? [];
      return (
        <div key={key} className="flex items-start gap-2">
          <span className="min-w-[1.1rem] text-aa-text-secondary">{number}.</span>
          <span>{renderInlineMarkdown(text)}</span>
        </div>
      );
    }

    return (
      <p key={key} className={trimmed.length === 0 ? "h-4" : ""}>
        {trimmed.length === 0 ? "\u00a0" : renderInlineMarkdown(line)}
      </p>
    );
  });
}

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
                  <div key={`text-${index}`} className="space-y-2 break-words">
                    {renderLines(block.content)}
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
