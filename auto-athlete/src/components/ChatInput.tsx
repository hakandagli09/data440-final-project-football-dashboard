"use client";

import { useEffect, useRef } from "react";

interface ChatInputProps {
  value: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export default function ChatInput({
  value,
  isLoading,
  onChange,
  onSubmit,
}: ChatInputProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isLoading && value.trim().length > 0) {
        onSubmit();
      }
    }
  }

  return (
    <div className="border-t border-aa-border bg-aa-surface/95 p-4">
      <div className="rounded-2xl border border-aa-border bg-aa-bg/70 px-3 py-3 shadow-[0_0_0_1px_rgba(0,240,255,0.02)] transition-colors focus-within:border-aa-border-bright">
        <textarea
          ref={textareaRef}
          value={value}
          disabled={isLoading}
          rows={1}
          placeholder="Ask about players, load, flags, or session trends..."
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="max-h-40 min-h-[24px] w-full resize-none bg-transparent text-sm leading-6 text-aa-text placeholder:text-aa-text-dim focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] font-mono text-aa-text-dim">Enter to send · Shift+Enter for newline</p>
          <button
            type="button"
            disabled={isLoading || value.trim().length === 0}
            onClick={onSubmit}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-aa-accent/25 bg-aa-accent/10 text-aa-accent transition-all duration-150 ease-out hover:bg-aa-accent/18 disabled:cursor-not-allowed disabled:border-aa-border disabled:bg-aa-elevated disabled:text-aa-text-dim active:scale-[0.97]"
            aria-label="Send message"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L6 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
