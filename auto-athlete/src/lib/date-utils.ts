/**
 * Timezone-safe date utilities for date-only strings (YYYY-MM-DD).
 *
 * JavaScript's Date constructor treats "YYYY-MM-DD" as UTC midnight,
 * which displays as the previous day in western-hemisphere timezones.
 * These helpers parse date parts directly to avoid timezone shifts.
 */

/**
 * Parse a "YYYY-MM-DD" string into { year, month, day } without
 * going through the Date constructor, avoiding any timezone shift.
 */
function parseParts(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m, day: d };
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format a date-only string as "Mar 30, 2026".
 * Timezone-safe — never shifts days.
 */
export function formatSessionDate(dateStr: string): string {
  const { year, month, day } = parseParts(dateStr);
  return `${MONTH_NAMES[month - 1]} ${String(day).padStart(2, "0")}, ${year}`;
}

/**
 * Format a date-only string as "MAR 30, 2026" (uppercase).
 */
export function formatSessionDateUpper(dateStr: string): string {
  return formatSessionDate(dateStr).toUpperCase();
}

/**
 * Subtract N days from a "YYYY-MM-DD" string, returning "YYYY-MM-DD".
 * Uses UTC methods exclusively to avoid DST edge cases.
 */
export function subtractDays(dateStr: string, days: number): string {
  const { year, month, day } = parseParts(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day - days));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Format a full ISO timestamp (from Supabase timestamptz) as "Mar 30, 2026".
 * Safe for timestamps that already include timezone info.
 */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

/**
 * Format a full ISO timestamp as "3:45 PM".
 */
export function formatTimestampTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
