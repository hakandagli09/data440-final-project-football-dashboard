"use client";

interface SuggestedQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
}

export default function SuggestedQuestions({
  questions,
  onSelect,
}: SuggestedQuestionsProps): JSX.Element | null {
  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-aa-border/80 bg-aa-surface/92 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-mono uppercase tracking-wider text-aa-text-dim">
          Suggested Questions
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {questions.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onSelect(question)}
            className="shrink-0 rounded-full border border-aa-border bg-aa-bg/60 px-3 py-2 text-xs text-aa-text-secondary transition-colors hover:border-aa-border-bright hover:bg-aa-elevated/80 hover:text-aa-text active:scale-[0.98]"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
