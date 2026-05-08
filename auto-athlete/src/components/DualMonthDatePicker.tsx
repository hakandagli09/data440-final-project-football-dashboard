"use client";

/**
 * DualMonthDatePicker — single calendar popover used on Reports and
 * Dashboard. The "Dual" name is historical; today the picker shows
 * one calendar panel that supports range selection within itself
 * (click once for start, navigate months, click again for end —
 * same UX as flight-booking pickers).
 *
 * Why captionLayout="dropdown":
 *   Data spans 2023-08 → 2025-11 (38 months). Stepping by month with
 *   prev/next arrows is too slow. v9's `captionLayout="dropdown"`
 *   surfaces native <select> dropdowns for month + year, scoped to
 *   startMonth / endMonth so the user can't navigate outside the data
 *   window.
 *
 * `allowRange` controls behavior, not layout:
 *   - false (Dashboard): a click commits the single date and closes.
 *   - true  (Reports):   first click sets `from`, second sets `to`,
 *                        Apply commits whatever's selected.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { formatSessionDate, subtractDays } from "@/lib/date-utils";
import { getWeekStart } from "@/lib/derived-metrics";

/** Quick-select chip identifiers for Reports mode. */
type QuickSelectId = "latest" | "this-week" | "last-week" | "last-14";

interface QuickSelectOption {
  readonly id: QuickSelectId;
  readonly label: string;
}

const QUICK_SELECTS: readonly QuickSelectOption[] = [
  { id: "latest", label: "Latest" },
  { id: "this-week", label: "This Week" },
  { id: "last-week", label: "Last Week" },
  { id: "last-14", label: "Last 14 Days" },
];

interface DualMonthDatePickerProps {
  /** Currently-selected start (inclusive). YYYY-MM-DD. */
  readonly startDate: string;
  /** Currently-selected end (inclusive). YYYY-MM-DD. Equal to startDate
   *  when the active selection is a single day. */
  readonly endDate: string;
  /** Every date with at least one aggregated session — drawn as accent
   *  dots on the day cells. */
  readonly availableDates: readonly string[];
  /** When true, render the right calendar panel and emit
   *  onSelectRange when both ends are picked. When false, only the
   *  left panel is rendered and only onSelectSingle fires. */
  readonly allowRange: boolean;
  /** When true, render the Latest / This Week / Last Week / Last 14
   *  Days chip row above the calendars. */
  readonly showQuickSelects: boolean;
  /** Fires when the user picks a single day. */
  readonly onSelectSingle: (date: string) => void;
  /** Fires when the user picks a multi-day range (allowRange=true only). */
  readonly onSelectRange?: (start: string, end: string) => void;
}

/**
 * Convert a "YYYY-MM-DD" string to a real Date in the user's local
 * timezone (anchored at noon to avoid DST edge cases pushing the day).
 */
function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Convert a Date back to "YYYY-MM-DD" using local timezone fields. */
function fromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DualMonthDatePicker({
  startDate,
  endDate,
  availableDates,
  allowRange,
  showQuickSelects,
  onSelectSingle,
  onSelectRange,
}: DualMonthDatePickerProps) {
  const [open, setOpen] = useState(false);
  // Used for outside-click detection so we don't leak a global listener
  // while the popover is hidden.
  const containerRef = useRef<HTMLDivElement>(null);

  // Real-Date versions of the available dates, memoized so DayPicker
  // modifier comparisons stay cheap on re-render.
  const availableDateObjs = useMemo(
    () => availableDates.map(toDate),
    [availableDates]
  );

  // Bounds for navigation — both calendars share these so the user
  // can't paginate outside the data window.
  const earliest = availableDates[availableDates.length - 1];
  const latest = availableDates[0];
  const startMonthDate = useMemo(
    () => (earliest ? toDate(earliest) : undefined),
    [earliest]
  );
  const endMonthDate = useMemo(
    () => (latest ? toDate(latest) : undefined),
    [latest]
  );

  /** Anchor for the calendar's currently-displayed month. */
  const [leftMonth, setLeftMonth] = useState<Date>(() =>
    startDate ? toDate(startDate) : latest ? toDate(latest) : new Date()
  );

  /** The shared selection — undefined .to means a partial selection. */
  const [draft, setDraft] = useState<DateRange>(() =>
    startDate && endDate
      ? { from: toDate(startDate), to: toDate(endDate) }
      : { from: undefined, to: undefined }
  );

  // Keep the draft in sync whenever the parent passes a new selection
  // (e.g. router-driven URL change). Without this, an external date
  // change would not reflect in the popover when reopened.
  useEffect(() => {
    setDraft(
      startDate && endDate
        ? { from: toDate(startDate), to: toDate(endDate) }
        : { from: undefined, to: undefined }
    );
  }, [startDate, endDate]);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        commitAndClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  /**
   * Render the currently-selected (or just-applied) range as the
   * trigger button label. Uses startDate / endDate (the committed
   * values) rather than draft so the trigger doesn't flicker mid-pick.
   */
  function triggerLabel(): string {
    if (!startDate || !endDate) return "Select date";
    if (startDate === endDate) return formatSessionDate(startDate);
    return `${formatSessionDate(startDate)} → ${formatSessionDate(endDate)}`;
  }

  /**
   * Commit whatever is in the draft and close. Used when the user
   * clicks Apply or clicks outside. If the draft has a partial
   * selection (from but no to), treat it as a single-day pick.
   */
  function commitAndClose() {
    if (draft.from) {
      const startStr = fromDate(draft.from);
      const endStr = draft.to ? fromDate(draft.to) : startStr;
      if (startStr === endStr || !allowRange || !onSelectRange) {
        onSelectSingle(startStr);
      } else {
        onSelectRange(startStr, endStr);
      }
    }
    setOpen(false);
  }

  /**
   * Resolve a quick-select chip into concrete start/end dates.
   * Quick-selects always commit immediately and close the popover.
   */
  function applyQuickSelect(id: QuickSelectId) {
    if (!latest) return;
    if (id === "latest") {
      onSelectSingle(latest);
      setOpen(false);
      return;
    }
    if (id === "this-week") {
      const start = getWeekStart(latest);
      onSelectRange?.(start, latest);
      setOpen(false);
      return;
    }
    if (id === "last-week") {
      const thisStart = getWeekStart(latest);
      const lastEnd = subtractDays(thisStart, 1);
      const lastStart = getWeekStart(lastEnd);
      onSelectRange?.(lastStart, lastEnd);
      setOpen(false);
      return;
    }
    if (id === "last-14") {
      const start = subtractDays(latest, 13);
      onSelectRange?.(start, latest);
      setOpen(false);
    }
  }

  /**
   * Click handler shared by both DayPicker panels. Implements the
   * documented model:
   *   - Empty draft, OR a complete draft → start a new selection.
   *   - Partial draft (from only) → complete the range; swap if needed
   *     so from ≤ to.
   *
   * In single-day mode (`allowRange=false`) we always commit
   * immediately and close — there is no "second click" path.
   */
  function handleDayClick(day: Date) {
    if (!allowRange) {
      onSelectSingle(fromDate(day));
      setDraft({ from: day, to: day });
      setOpen(false);
      return;
    }

    if (!draft.from || (draft.from && draft.to)) {
      // Begin a new selection — clears any prior range visually.
      setDraft({ from: day, to: undefined });
      return;
    }

    // Completing a partial range. Swap so from ≤ to.
    if (day < draft.from) {
      setDraft({ from: day, to: draft.from });
    } else {
      setDraft({ from: draft.from, to: day });
    }
  }

  // Shared modifier classes — keep the existing aa-day-* CSS hooks.
  const sharedClassNames = {
    root: "aa-day-picker text-aa-text",
    month_caption: "px-2 py-1 text-aa-text font-display tracking-wider text-sm",
    caption_label:
      "px-2 py-1 text-aa-text font-display tracking-wider text-sm",
    nav: "flex items-center gap-1",
    weekdays: "text-aa-text-dim text-[10px] font-mono uppercase",
    day_button:
      "h-7 w-7 text-[11px] font-mono rounded hover:bg-aa-elevated focus:bg-aa-elevated focus:outline-none",
    outside: "text-aa-text-dim/40",
    dropdowns: "flex items-center gap-1.5",
  };

  const sharedModifiersClassNames = {
    hasData: "aa-day-has-data",
    selected: "aa-day-selected",
    range_start: "aa-day-range-edge",
    range_end: "aa-day-range-edge",
    range_middle: "aa-day-range-mid",
    today: "aa-day-today",
  };

  return (
    <div className="relative z-50 print:hidden" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="appearance-none flex items-center gap-2 px-4 py-2 rounded-lg border border-aa-border bg-aa-surface text-xs font-mono text-aa-text-secondary hover:border-aa-border-bright transition-colors cursor-pointer"
      >
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
          className={`w-3 h-3 text-aa-text-dim transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {open && (
        <div
          // z-50 keeps the popover above dashboard cards while the chat panel
          // still wins through its fixed stacking context.
          // the noise overlay. Width adapts to one or two panels.
          className="absolute right-0 mt-2 z-50 w-[340px] rounded-lg border border-aa-border bg-aa-surface shadow-xl overflow-hidden animate-fade-in"
        >
          {showQuickSelects && (
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
          )}

          {/* Single calendar — range mode lets the user click two days
              within the same panel (navigating months between clicks)
              for a multi-day range, with the "in-between" days
              highlighted gray à la flight-booking pickers. */}
          <div className="px-2 py-2">
            <DayPicker
              mode="range"
              selected={draft}
              onDayClick={handleDayClick}
              month={leftMonth}
              onMonthChange={setLeftMonth}
              captionLayout="dropdown"
              startMonth={startMonthDate}
              endMonth={endMonthDate}
              showOutsideDays
              modifiers={{ hasData: availableDateObjs }}
              modifiersClassNames={sharedModifiersClassNames}
              classNames={sharedClassNames}
            />
          </div>

          <div className="px-3 py-2 border-t border-aa-border bg-aa-elevated flex items-center justify-between gap-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-aa-text-dim">
              {allowRange
                ? "Click once for a day · click again for a range"
                : "Click a day to select"}
            </span>
            {allowRange && (
              <button
                type="button"
                onClick={commitAndClose}
                disabled={!draft.from}
                className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider rounded border border-aa-accent/40 text-aa-accent hover:bg-aa-accent/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
