"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ChatInput from "@/components/ChatInput";
import ChatMessage from "@/components/ChatMessage";
import SuggestedQuestions from "@/components/SuggestedQuestions";
import { useChat } from "@/lib/chat-context";
import { getSuggestions } from "@/lib/chat-suggestions";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SESSION_STORAGE_KEY = "auto-athlete-chat-messages";
const MAX_AUTO_RETRIES = 1;

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function parseSseEvents(buffer: string): {
  events: string[];
  remaining: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const segments = normalized.split("\n\n");
  const remaining = segments.pop() ?? "";
  const events = segments
    .map((segment) =>
      segment
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n")
    )
    .filter(Boolean);

  return { events, remaining };
}

export default function ChatPanel(): JSX.Element | null {
  const { isChatOpen, closeChat } = useChat();
  const pathname = usePathname();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [lastRequestMessages, setLastRequestMessages] = useState<UiMessage[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as UiMessage[];
      if (Array.isArray(parsed)) {
        setMessages(parsed);
      }
    } catch {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isLoading, isChatOpen]);

  function updateAssistantContent(messageId: string, updater: (current: string) => string): void {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, content: updater(message.content) }
          : message
      )
    );
  }

  async function streamAssistantReply(
    requestMessages: UiMessage[],
    retryCount: number = 0
  ): Promise<void> {
    const assistantMessageId = createMessageId();
    setLastRequestMessages(requestMessages);
    setStreamingMessageId(assistantMessageId);
    setIsLoading(true);
    setError(null);
    setStatusNotice(null);
    setMessages([...requestMessages, { id: assistantMessageId, role: "assistant", content: "" }]);

    try {
      const playerPageMatch = pathname.match(/^\/dashboard\/players\/([^/]+)$/);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: requestMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          context: {
            page: pathname,
            ...(playerPageMatch ? { playerId: playerPageMatch[1] } : {}),
          },
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Chat request failed.");
      }

      if (!response.body) {
        throw new Error("Chat stream did not include a response body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSseEvents(buffer);
        buffer = remaining;

        for (const event of events) {
          if (event === "[DONE]") {
            continue;
          }

          const payload = JSON.parse(event) as {
            token?: string;
            error?: string;
            rateLimited?: boolean;
            retryAfterMs?: number;
          };

          if (payload.error) {
            const rateLimitError = Object.assign(new Error(payload.error), {
              rateLimited: payload.rateLimited ?? false,
              retryAfterMs: payload.retryAfterMs ?? 0,
            });
            throw rateLimitError;
          }

          if (payload.token) {
            updateAssistantContent(assistantMessageId, (current) => current + payload.token);
          }
        }
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId && message.content.trim().length === 0
            ? { ...message, content: "I couldn't generate a reply." }
            : message
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      const retryAfterMs =
        typeof (err as { retryAfterMs?: unknown })?.retryAfterMs === "number"
          ? ((err as { retryAfterMs?: number }).retryAfterMs ?? 0)
          : 0;
      const isRateLimited =
        (err as { rateLimited?: unknown })?.rateLimited === true;

      if (isRateLimited && retryCount < MAX_AUTO_RETRIES) {
        const waitMs = Math.max(retryAfterMs, 1500);
        setStatusNotice(`Rate limited. Retrying in ${Math.ceil(waitMs / 1000)}s...`);
        await sleep(waitMs);
        setMessages((current) => current.filter((item) => item.id !== assistantMessageId));
        setStatusNotice(null);
        await streamAssistantReply(requestMessages, retryCount + 1);
        return;
      }

      setMessages((current) => {
        const assistantMessage = current.find((item) => item.id === assistantMessageId);
        if (!assistantMessage || assistantMessage.content.trim().length === 0) {
          return current.filter((item) => item.id !== assistantMessageId);
        }
        return current;
      });
      setError(message);
    } finally {
      setStatusNotice((current) => (current?.includes("Retrying") ? current : null));
      setStreamingMessageId(null);
      setIsLoading(false);
    }
  }

  async function sendMessage(contentOverride?: string | unknown): Promise<void> {
    const override = typeof contentOverride === "string" ? contentOverride : undefined;
    const content = (override ?? draft).trim();
    if (!content || isLoading) return;

    const userMessage: UiMessage = {
      id: createMessageId(),
      role: "user",
      content,
    };

    const nextMessages = [...messages, userMessage];
    setDraft("");
    await streamAssistantReply(nextMessages);
  }

  async function retryLastMessage(): Promise<void> {
    if (!lastRequestMessages || isLoading) return;
    await streamAssistantReply(lastRequestMessages);
  }

  function clearConversation(): void {
    if (isLoading) return;

    setMessages([]);
    setError(null);
    setStatusNotice(null);
    setDraft("");
    setLastRequestMessages(null);
    setStreamingMessageId(null);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  const suggestionQuestions = getSuggestions(messages.length > 0);

  return (
    <div
      className={`fixed inset-0 z-50 ${
        isChatOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <button
        type="button"
        aria-label="Close chat"
        onClick={closeChat}
        className={`absolute inset-0 bg-aa-bg/60 backdrop-blur-[2px] transition-opacity duration-300 ${
          isChatOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`absolute right-0 top-0 flex h-full w-[420px] flex-col overflow-hidden border-l border-aa-border bg-aa-surface/96 shadow-2xl backdrop-blur-xl transition-transform duration-300 ${
          isChatOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="relative border-b border-aa-border bg-gradient-to-b from-aa-elevated via-aa-surface to-aa-surface px-5 py-4 noise-overlay">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-[30px] leading-none tracking-[0.06em] text-aa-text">
                AI ASSISTANT
              </p>
              <p className="mt-1 text-xs text-aa-text-secondary">
                Ask natural-language questions about roster, load, flags, and sessions.
              </p>
              <p className="mt-2 text-[11px] font-mono text-aa-text-dim">Cmd+J to toggle</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearConversation}
                disabled={isLoading || messages.length === 0}
                className="rounded-xl border border-aa-border bg-aa-bg/60 px-3 py-2 text-[11px] font-mono text-aa-text-secondary transition-colors hover:border-aa-border-bright hover:text-aa-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={closeChat}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-aa-border bg-aa-bg/60 text-aa-text-secondary transition-all duration-150 ease-out hover:border-aa-border-bright hover:text-aa-text active:scale-[0.97]"
                aria-label="Close chat panel"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !isLoading && (
            <div className="rounded-2xl border border-dashed border-aa-border bg-aa-bg/35 p-5 text-sm text-aa-text-secondary">
              <p className="text-aa-text">Ask about athletes, load, fatigue, flags, or whatever page you are on.</p>
              <p className="mt-2 text-aa-text-secondary">
                The assistant now sees the current route and can use structured cards when helpful.
              </p>
            </div>
          )}

          {statusNotice && (
            <div className="rounded-2xl border border-aa-warning/40 bg-aa-warning/10 px-4 py-3 text-sm text-aa-text">
              <p className="font-semibold text-aa-warning">Assistant status</p>
              <p className="mt-1 text-aa-text-secondary">{statusNotice}</p>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              isLoading={streamingMessageId === message.id && message.content.length === 0}
              isStreaming={streamingMessageId === message.id && message.content.length > 0}
            />
          ))}

          {error && (
            <div className="rounded-2xl border border-aa-danger/40 bg-aa-danger/10 px-4 py-3 text-sm text-aa-text">
              <p className="font-semibold text-aa-danger">Chat request failed</p>
              <p className="mt-1 text-aa-text-secondary">{error}</p>
              <button
                type="button"
                onClick={() => void retryLastMessage()}
                className="mt-3 rounded-xl border border-aa-danger/30 bg-aa-bg/55 px-3 py-2 text-xs font-semibold text-aa-text transition-colors hover:border-aa-danger/60 hover:bg-aa-bg"
              >
                Retry last message
              </button>
            </div>
          )}
        </div>

        <SuggestedQuestions
          questions={suggestionQuestions}
          onSelect={(question) => {
            void sendMessage(question);
          }}
        />

        <ChatInput
          value={draft}
          isLoading={isLoading}
          onChange={setDraft}
          onSubmit={sendMessage}
        />
      </aside>
    </div>
  );
}
