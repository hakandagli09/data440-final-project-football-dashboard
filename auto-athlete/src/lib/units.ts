/**
 * Unit formatting helpers.
 *
 * W&M's StatSports Apex export is configured for the American system: the CSV
 * (and therefore Supabase) already stores distance in yards, speed in mph,
 * HMLD/min in yd/min, jump height in inches, and body weight in kilograms
 * (the one non-imperial holdout, which is converted only at display time).
 *
 * The conversion helpers below (metersToYards, msToMph, …) are kept — and
 * marked @deprecated — as insurance for any future metric-sourced data. They
 * should NOT be applied to DB values from this team; doing so double-converts
 * and produces impossible numbers (e.g. 46.93 mph max speeds).
 */

// ─── Conversion constants ──────────────────────────────────────────────

const METERS_PER_YARD = 0.9144;            // 1 yd = 0.9144 m
const MPS_PER_MPH = 0.44704;               // 1 mph = 0.44704 m/s
const LBS_PER_KG = 2.2046226218;           // 1 kg ≈ 2.2046 lb
const INCHES_PER_CM = 0.393700787;         // 1 cm ≈ 0.3937 in

// ─── Deprecated metric→imperial conversions ────────────────────────────
//     Kept for future-proofing; never call these on DB values for W&M.

/**
 * @deprecated DB already stores yards for this team; do not convert.
 * @param meters Distance in meters.
 * @returns Distance in yards, or null when input is null/undefined.
 */
export function metersToYards(meters: number | null | undefined): number | null {
  if (meters == null || Number.isNaN(meters)) return null;
  return meters / METERS_PER_YARD;
}

/**
 * @deprecated DB already stores mph for this team; do not convert.
 * @param mps Speed in meters per second.
 * @returns Speed in mph, or null when input is null/undefined.
 */
export function msToMph(mps: number | null | undefined): number | null {
  if (mps == null || Number.isNaN(mps)) return null;
  return mps / MPS_PER_MPH;
}

/**
 * @deprecated DB already stores yd/min for this team; do not convert.
 */
export function metersPerMinToYardsPerMin(mpm: number | null | undefined): number | null {
  if (mpm == null || Number.isNaN(mpm)) return null;
  return mpm / METERS_PER_YARD;
}

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

/**
 * Convert centimeters to inches. Not used on jump height (we read
 * `jump_height_in` directly) but available for CMJ depth or future fields.
 */
export function cmToInches(cm: number | null | undefined): number | null {
  if (cm == null || Number.isNaN(cm)) return null;
  return cm * INCHES_PER_CM;
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
 * @deprecated DB already stores yards for this team. Use formatYards.
 */
export function formatMetersAsYards(meters: number | null | undefined, decimals = 0): string {
  return formatYards(metersToYards(meters), decimals);
}

/**
 * @deprecated DB already stores mph for this team. Use formatMph.
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
