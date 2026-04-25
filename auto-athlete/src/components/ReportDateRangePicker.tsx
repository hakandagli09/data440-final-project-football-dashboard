"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { formatSessionDate, subtractDays } from "@/lib/date-utils";
import { getWeekStart } from "@/lib/derived-metrics";

/**
 * Quick-select chip identifiers — kept in a small enum so the click
 * handler can dispatch without relying on string typos.
 */
type QuickSelectId = "latest" | "this-week" | "last-week" | "last-14";

interface QuickSelectOption {
  id: QuickSelectId;
  label: string;
}

const QUICK_SELECTS: QuickSelectOption[] = [
  { id: "latest", label: "Latest" },
  { id: "this-week", label: "This Week" },
  { id: "last-week", label: "Last Week" },
  { id: "last-14", label: "Last 14 Days" },
];

interface ReportDateRangePickerProps {
  /** Currently-selected start (inclusive). YYYY-MM-DD. */
  startDate: string;
  /** Currently-selected end (inclusive). YYYY-MM-DD. */
  endDate: string;
  /** Every date with at least one aggregated session — drawn as accent dots. */
  availableDates: string[];
  /** Fires when the user picks a single day. */
  onSelectSingle: (date: string) => void;
  /** Fires when the user picks a multi-day range. */
  onSelectRange: (start: string, end: string) => void;
}

/**
 * Convert a "YYYY-MM-DD" string to a real Date in the user's local
 * timezone (anchored at noon to avoid DST edge cases pushing the day).
 */
function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Convert a Date back to "YYYY-MM-DD" using local timezone fields so
 * the value matches what `getWeekStart` and the rest of the app expect.
 */
function fromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Calendar popover with optional drag-select for multi-day ranges and
 * quick-select chips for the windows coaches reach for daily.
 */
export default function ReportDateRangePicker({
  startDate,
  endDate,
  availableDates,
  onSelectSingle,
  onSelectRange,
}: ReportDateRangePickerProps) {
  const [open, setOpen] = useState(false);
  // Containing the popover in a ref lets us close on outside-click
  // without leaking a global listener while it's hidden.
  const containerRef = useRef<HTMLDivElement>(null);

  // Available dates as real Date objects — memoized to keep the calendar
  // modifier comparisons cheap on re-render.
  const availableDateObjs = useMemo(
    () => availableDates.map(toDate),
    [availableDates]
  );

  // The DayPicker's controlled `selected` state — DateRange in range
  // mode. We always treat the picker as range-mode internally even for
  // single-day selections (from === to is a valid range), and emit
  // either onSelectSingle or onSelectRange based on what the user did.
  const selected: DateRange = useMemo(
    () =>
      startDate && endDate
        ? { from: toDate(startDate), to: toDate(endDate) }
        : { from: undefined, to: undefined },
    [startDate, endDate]
  );

  // Earliest selectable date — month nav default; using earliest data
  // point (or one year back if none) so the calendar opens to relevant content.
  const earliest = availableDates[availableDates.length - 1];
  const latest = availableDates[0];

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape so keyboard users have a quick exit.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  /** Render the current selection as a single-line label on the trigger. */
  function triggerLabel(): string {
    if (!startDate || !endDate) return "Select date";
    if (startDate === endDate) return formatSessionDate(startDate);
    return `${formatSessionDate(startDate)} → ${formatSessionDate(endDate)}`;
  }

  /** Resolve a quick-select chip into concrete start/end dates. */
  function applyQuickSelect(id: QuickSelectId) {
    if (!latest) return;
    if (id === "latest") {
      onSelectSingle(latest);
      setOpen(false);
      return;
    }
    if (id === "this-week") {
      const start = getWeekStart(latest);
      // Anchor "this week" to the latest data point so empty future
      // days don't make the report look broken.
      onSelectRange(start, latest);
      setOpen(false);
      return;
    }
    if (id === "last-week") {
      const thisStart = getWeekStart(latest);
      const lastEnd = subtractDays(thisStart, 1);
      const lastStart = getWeekStart(lastEnd);
      onSelectRange(lastStart, lastEnd);
      setOpen(false);
      return;
    }
    if (id === "last-14") {
      const start = subtractDays(latest, 13);
      onSelectRange(start, latest);
      setOpen(false);
    }
  }

  /**
   * react-day-picker emits both completed ranges (from + to) and
   * partially-selected ranges (from only, while the user picks the
   * second click). We only commit when both ends are present.
   */
  function handleRangeChange(range: DateRange | undefined) {
    if (!range?.from) return;
    if (range.to) {
      const start = fromDate(range.from);
      const end = fromDate(range.to);
      if (start === end) {
        onSelectSingle(start);
      } else {
        onSelectRange(start, end);
      }
      setOpen(false);
    }
    // If the user has only clicked once (range.to undefined), keep the
    // popover open and let them click the end date.
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="appearance-none flex items-center gap-2 px-4 py-2 rounded-lg border border-aa-border bg-aa-surface text-xs font-mono text-aa-text-secondary hover:border-aa-border-bright transition-colors cursor-pointer"
      >
        {/* Calendar glyph — same icon family as the original date select. */}
        <svg
          className="w-3.5 h-3.5 text-aa-text-dim"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
          />
        </svg>
        <span>{triggerLabel()}</span>
        <svg
          className={`w-3 h-3 text-aa-text-dim transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div
          // The popover sits above the rest of the page. z-40 keeps it
          // below the chat panel (z-50) but above the noise overlay.
          className="absolute right-0 mt-2 z-40 w-[340px] rounded-lg border border-aa-border bg-aa-surface shadow-xl overflow-hidden animate-fade-in"
        >
          <div className="px-3 py-2 border-b border-aa-border bg-aa-elevated flex items-center gap-2 flex-wrap">
            {QUICK_SELECTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => applyQuickSelect(opt.id)}
                className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-aa-text-secondary border border-aa-border rounded hover:border-aa-accent hover:text-aa-accent transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="px-2 py-2">
            <DayPicker
              mode="range"
              selected={selected}
              onSelect={handleRangeChange}
              defaultMonth={latest ? toDate(latest) : undefined}
              startMonth={earliest ? toDate(earliest) : undefined}
              endMonth={latest ? toDate(latest) : undefined}
              showOutsideDays
              modifiers={{ hasData: availableDateObjs }}
              modifiersClassNames={{
                hasData: "aa-day-has-data",
                selected: "aa-day-selected",
                range_start: "aa-day-range-edge",
                range_end: "aa-day-range-edge",
                range_middle: "aa-day-range-mid",
                today: "aa-day-today",
              }}
              classNames={{
                root: "aa-day-picker text-aa-text",
                month_caption: "px-2 py-1 text-aa-text font-display tracking-wider text-sm",
                caption_label: "px-2 py-1 text-aa-text font-display tracking-wider text-sm",
                nav: "flex items-center gap-1",
                weekdays: "text-aa-text-dim text-[10px] font-mono uppercase",
                day_button: "h-7 w-7 text-[11px] font-mono rounded hover:bg-aa-elevated focus:bg-aa-elevated focus:outline-none",
                outside: "text-aa-text-dim/40",
              }}
            />
          </div>
          <div className="px-3 py-2 border-t border-aa-border bg-aa-elevated text-[10px] font-mono uppercase tracking-wider text-aa-text-dim">
            Click once for a day · click + click another for a range
          </div>
        </div>
      )}
    </div>
  );
}
