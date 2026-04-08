"use client";

import { useRouter } from "next/navigation";

interface DateSelectorProps {
  dates: string[];
  currentDate: string;
}

export default function DateSelector({ dates, currentDate }: DateSelectorProps) {
  const router = useRouter();

  const formatDate = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  };

  return (
    <div className="relative">
      <select
        value={currentDate}
        onChange={(e) => router.replace(`/dashboard?date=${e.target.value}`)}
        className="appearance-none flex items-center gap-2 px-4 py-2 pr-8 rounded-lg border border-aa-border bg-aa-surface text-xs font-mono text-aa-text-secondary hover:border-aa-border-bright transition-colors cursor-pointer"
      >
        {dates.map((d) => (
          <option key={d} value={d} className="bg-aa-surface text-aa-text">
            {formatDate(d)}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-aa-text-dim pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    </div>
  );
}
