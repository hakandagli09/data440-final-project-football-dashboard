/**
 * Unit formatting helpers.
 *
 * W&M's StatSports Apex export is configured for the American system: the CSV
 * (and therefore Supabase) already stores distance in yards, speed in mph,
 * HMLD/min in yd/min, jump height in inches, and body weight in kilograms
 * (the one non-imperial holdout, which is converted only at display time).
 */

// ─── Conversion constants ──────────────────────────────────────────────

const LBS_PER_KG = 2.2046226218;           // 1 kg ≈ 2.2046 lb

// ─── Active imperial conversions ───────────────────────────────────────

/**
 * Convert kilograms to pounds. Used for body-weight display on the Player
 * Profile (body_weight_kg is the one metric field still stored in kg).
 *
 * @param kg Body weight in kilograms.
 * @returns Body weight in pounds, or null when input is null/undefined.
 */
export function kgToLbs(kg: number | null | undefined): number | null {
  if (kg == null || Number.isNaN(kg)) return null;
  return kg * LBS_PER_KG;
}

// ─── Formatters ────────────────────────────────────────────────────────

/**
 * Format a yardage value with thousands separators (e.g. "4,615").
 * Returns an em-dash when input is null — matches the rest of the UI.
 *
 * @param yards Value already expressed in yards.
 * @param decimals Number of decimal places to render.
 */
export function formatYards(yards: number | null | undefined, decimals = 0): string {
  if (yards == null) return "—";
  return yards.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format an mph value (e.g. "17.9" or "17.90"). Input is already mph.
 */
export function formatMph(mph: number | null | undefined, decimals = 1): string {
  if (mph == null) return "—";
  return mph.toFixed(decimals);
}

/**
 * Format a pound value with thousands separators (e.g. "210.4").
 * Input is already in lbs.
 */
export function formatLbs(lbs: number | null | undefined, decimals = 1): string {
  if (lbs == null) return "—";
  return lbs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format an inch value (e.g. "15.3"). Input is already in inches.
 */
export function formatInches(inches: number | null | undefined, decimals = 1): string {
  if (inches == null) return "—";
  return inches.toFixed(decimals);
}

/**
 * Convenience wrapper: accept kg, return a formatted pound string.
 */
export function formatKgAsLbs(kg: number | null | undefined, decimals = 1): string {
  return formatLbs(kgToLbs(kg), decimals);
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

// ─── Unit label constants ──────────────────────────────────────────────

/**
 * Unit label constants — use these instead of inline strings so future
 * global replacements (e.g. toggling back to metric) only touch this file.
 */
export const UNIT_LABELS = {
  distance: "yd",
  speed: "mph",
  distancePerMin: "yd/min",
  height: "in",
  weight: "lb",
  count: "",
  au: "AU",
} as const;
