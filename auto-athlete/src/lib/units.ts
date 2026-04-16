/**
 * Unit conversion + formatting helpers.
 *
 * StatSports exports everything in metric (meters, m/s). William & Mary's
 * coaching staff works in imperial (yards, mph). We store raw metric values
 * in Supabase and convert only at display time. All conversions live here
 * so switching back to metric in the future is a one-file change.
 */

const METERS_PER_YARD = 0.9144;
const MPS_PER_MPH = 0.44704;

/**
 * Convert meters to yards. 1 yard = 0.9144 m.
 *
 * @param meters Distance in meters (from StatSports raw export).
 * @returns Distance in yards, or null when input is null/undefined.
 */
export function metersToYards(meters: number | null | undefined): number | null {
  if (meters == null || Number.isNaN(meters)) return null;
  return meters / METERS_PER_YARD;
}

/**
 * Convert meters per second to miles per hour. 1 mph = 0.44704 m/s.
 *
 * @param mps Speed in meters per second.
 * @returns Speed in mph, or null when input is null/undefined.
 */
export function msToMph(mps: number | null | undefined): number | null {
  if (mps == null || Number.isNaN(mps)) return null;
  return mps / MPS_PER_MPH;
}

/**
 * Convert meters-per-minute (HMLD/min is recorded in m/min) to yards/min.
 * Simple linear conversion — same factor as meters → yards.
 */
export function metersPerMinToYardsPerMin(mpm: number | null | undefined): number | null {
  if (mpm == null || Number.isNaN(mpm)) return null;
  return mpm / METERS_PER_YARD;
}

/**
 * Format a yardage value with thousands separators (e.g. "4,615").
 * Returns an em-dash when input is null — matches the rest of the UI.
 */
export function formatYards(yards: number | null | undefined, decimals = 0): string {
  if (yards == null) return "—";
  return yards.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format an mph value (e.g. "17.9" or "17.90").
 */
export function formatMph(mph: number | null | undefined, decimals = 1): string {
  if (mph == null) return "—";
  return mph.toFixed(decimals);
}

/**
 * Convenience wrapper: accept meters, return a formatted yard string.
 */
export function formatMetersAsYards(meters: number | null | undefined, decimals = 0): string {
  return formatYards(metersToYards(meters), decimals);
}

/**
 * Convenience wrapper: accept m/s, return a formatted mph string.
 */
export function formatMpsAsMph(mps: number | null | undefined, decimals = 1): string {
  return formatMph(msToMph(mps), decimals);
}

/**
 * Format a plain number with comma thousands separator and fixed decimals.
 * Used for unit-less counts (accels, explosive efforts) and AU metrics (DSL).
 */
export function formatCount(value: number | null | undefined, decimals = 0): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Unit label constants — use these instead of inline strings so future
 * global replacements (e.g. toggling back to metric) only touch this file.
 */
export const UNIT_LABELS = {
  distance: "yd",
  speed: "mph",
  distancePerMin: "yd/min",
  count: "",
  au: "AU",
} as const;
