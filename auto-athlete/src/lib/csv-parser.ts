/**
 * CSV Parser — auto-detects CSV type by column headers and maps to DB columns.
 *
 * Supports 4 CSV types:
 * - GPS (StatSports Apex) — detected by "Session Date" column
 * - Jump (Force Plate CMJ) — detected by "Test Type" + "BW [KG]"
 * - ForceFrame (Hip AD/AB) — detected by "Direction" + "Mode"
 * - NordBord (Nordic Hamstring) — detected by "Date UTC" + "L Max Torque (Nm)"
 *
 * Only columns present in the uploaded CSV are mapped — missing optional columns
 * are simply omitted from the insert payload.
 */

import Papa from "papaparse";

export type CsvType = "gps" | "jump" | "force_frame" | "nordbord";

export interface ParseResult {
  csvType: CsvType;
  /** Player names extracted from the CSV (for upsert into players table). */
  players: { name: string; position?: string }[];
  /** Rows ready for DB insert (player_id resolved later by the API route). */
  rows: Record<string, unknown>[];
  /** Columns that were present in the CSV. */
  mappedColumns: string[];
  /** CSV headers that didn't match any known mapping (informational). */
  unmappedHeaders: string[];
  /** Rows that were skipped due to missing required fields. */
  skippedRows: { row: number; reason: string }[];
}

// ─── Column Mappings ──────────────────────────────────────────────────────
// Maps CSV header → DB column name. Only headers listed here are ingested.

const GPS_COLUMNS: Record<string, string> = {
  "Session Date": "session_date",
  "Session Title": "session_title",
  "Drill Title": "drill_title",
  "Drill Start Time": "drill_start_time",
  "Drill End Time": "drill_end_time",
  "Total Distance": "total_distance",
  "Distance Zone 1 (Relative)": "distance_zone_1",
  "Distance Zone 2 (Relative)": "distance_zone_2",
  "Distance Zone 3 (Relative)": "distance_zone_3",
  "Distance Zone 4 (Relative)": "distance_zone_4",
  "Distance Zone 5 (Relative)": "distance_zone_5",
  "Distance Zone 6 (Relative)": "distance_zone_6",
  "Distance Zone 4 - Zone 6 (Relative)": "distance_zone_4_6",
  "Max Speed": "max_speed",
  "% Max Speed": "pct_max_speed",
  "High Speed Running (Relative)": "high_speed_running",
  "HSR Per Minute (Relative)": "hsr_per_minute",
  "Distance Per Min": "distance_per_min",
  "Speed Intensity": "speed_intensity",
  "Accelerations (Relative)": "accelerations",
  "Accelerations Zone 3 - Zone 6 (Relative)": "accelerations_zone_3_6",
  "Accelerations Zone 4 - Zone 6 (Relative)": "accelerations_zone_4_6",
  "Accelerations Zone 5 - Zone 6 (Relative)": "accelerations_zone_5_6",
  "Player Max Accel": "player_max_accel",
  "Max Acceleration": "max_acceleration",
  "Accelerations Per Min (Relative)": "accelerations_per_min",
  "Decelerations (Relative)": "decelerations",
  "Decelerations Zone 3 - Zone 6 (Relative)": "decelerations_zone_3_6",
  "Decelerations Zone 4 - Zone 6 (Relative)": "decelerations_zone_4_6",
  "Decelerations Zone 5 - Zone 6 (Relative)": "decelerations_zone_5_6",
  "Player Max Decel": "player_max_decel",
  "Max Deceleration": "max_deceleration",
  "Decelerations Per Min (Relative)": "decelerations_per_min",
  "HML Distance": "hml_distance",
  "HML Efforts Total Distance": "hml_efforts_total_distance",
  "HML Efforts": "hml_efforts",
  "HMLD Per Minute": "hmld_per_minute",
  "Fatigue Index": "fatigue_index",
  "Dynamic Stress Load": "dynamic_stress_load",
  "Dynamic Stress Load Zone 4 - Zone 6": "dynamic_stress_load_zone_4_6",
  "Dynamic Stress Load Zone 5 - Zone 6": "dynamic_stress_load_zone_5_6",
  "Total Loading": "total_loading",
  "Collisions": "collisions",
  "Collision Load": "collision_load",
  "Lower Speed Loading": "lower_speed_loading",
  "Impacts Zone 3 - Zone 6 (Relative)": "impacts_zone_3_6_relative",
  "Impacts Zone 4 - Zone 6 (Absolute)": "impacts_zone_4_6_absolute",
  "Impacts Zone 4 - Zone 6 (Relative)": "impacts_zone_4_6_relative",
  "Impacts Zone 5 - Zone 6 (Absolute)": "impacts_zone_5_6_absolute",
  "Impacts Zone 5 - Zone 6 (Relative)": "impacts_zone_5_6_relative",
  "Mechanical Load": "mechanical_load",
  "Total Metabolic Power": "total_metabolic_power",
};

const JUMP_COLUMNS: Record<string, string> = {
  "Test Type": "test_type",
  "Date": "test_date",
  "Time": "test_time",
  "BW [KG]": "body_weight_kg",
  "Reps": "reps",
  "Tags": "tags",
  "Additional Load [lb]": "additional_load_lb",
  "Bodyweight in Pounds [lbs] ": "bodyweight_lbs",
  "Bodyweight in Pounds [lbs]": "bodyweight_lbs",
  "Jump Height (Imp-Mom) in Inches [in] ": "jump_height_in",
  "Jump Height (Imp-Mom) in Inches [in]": "jump_height_in",
  "Jump Height (Imp-Mom) [cm] ": "jump_height_cm",
  "Jump Height (Imp-Mom) [cm]": "jump_height_cm",
  "RSI-modified (Imp-Mom) [m/s] ": "rsi_modified",
  "RSI-modified (Imp-Mom) [m/s]": "rsi_modified",
  "Peak Power / BM [W/kg] ": "peak_power_per_bm",
  "Peak Power / BM [W/kg]": "peak_power_per_bm",
  "P1 Concentric Impulse [N s] ": "concentric_impulse",
  "P1 Concentric Impulse [N s]": "concentric_impulse",
  "Concentric Peak Force / BM [N/kg] ": "concentric_peak_force_per_bm",
  "Concentric Peak Force / BM [N/kg]": "concentric_peak_force_per_bm",
  "Eccentric Deceleration RFD [N/s] ": "eccentric_deceleration_rfd",
  "Eccentric Deceleration RFD [N/s]": "eccentric_deceleration_rfd",
  "Eccentric Braking Impulse [N s] ": "eccentric_braking_impulse",
  "Eccentric Braking Impulse [N s]": "eccentric_braking_impulse",
  "Braking Phase Duration [ms] ": "braking_phase_duration_ms",
  "Braking Phase Duration [ms]": "braking_phase_duration_ms",
  "Force at Zero Velocity [N] ": "force_at_zero_velocity",
  "Force at Zero Velocity [N]": "force_at_zero_velocity",
  "Force at Zero Velocity / BM [N/kg] ": "force_at_zero_velocity_per_bm",
  "Force at Zero Velocity / BM [N/kg]": "force_at_zero_velocity_per_bm",
  "Eccentric Peak Force / BM [N/kg] ": "eccentric_peak_force_per_bm",
  "Eccentric Peak Force / BM [N/kg]": "eccentric_peak_force_per_bm",
  "Eccentric Peak Velocity [m/s] ": "eccentric_peak_velocity",
  "Eccentric Peak Velocity [m/s]": "eccentric_peak_velocity",
  "Eccentric Duration [ms] ": "eccentric_duration_ms",
  "Eccentric Duration [ms]": "eccentric_duration_ms",
  "Countermovement Depth [cm] ": "countermovement_depth_cm",
  "Countermovement Depth [cm]": "countermovement_depth_cm",
  "Concentric Mean Force % (Asym) (%)": "concentric_mean_force_asym",
  "Eccentric Braking Impulse % (Asym) (%)": "eccentric_braking_impulse_asym",
  "Eccentric Deceleration RFD % (Asym) (%)": "eccentric_decel_rfd_asym",
  "Eccentric Peak Force % (Asym) (%)": "eccentric_peak_force_asym",
};

const FORCE_FRAME_COLUMNS: Record<string, string> = {
  "Date": "test_date",
  "Time": "test_time",
  "Device": "device",
  "Mode": "mode",
  "Test": "test_type",
  "Direction": "direction",
  "Position": "position",
  "L Reps": "l_reps",
  "R Reps": "r_reps",
  "L Max Force (N)": "l_max_force",
  "R Max Force (N)": "r_max_force",
  "Max Imbalance": "max_imbalance",
  "L Max Ratio": "l_max_ratio",
  "R Max Ratio": "r_max_ratio",
  "L Avg Force (N)": "l_avg_force",
  "R Avg Force (N)": "r_avg_force",
  "Avg Imbalance": "avg_imbalance",
  "L Avg Ratio": "l_avg_ratio",
  "R Avg Ratio": "r_avg_ratio",
  "L Max Impulse (Ns)": "l_max_impulse",
  "R Max Impulse (Ns)": "r_max_impulse",
  "Impulse Imbalance (%)": "impulse_imbalance",
  "L Max Force Per kg (N/kg)": "l_max_force_per_kg",
  "R Max Force Per kg (N/kg)": "r_max_force_per_kg",
  "L Avg Force Per kg (N/kg)": "l_avg_force_per_kg",
  "R Avg Force Per kg (N/kg)": "r_avg_force_per_kg",
  "L Max RFD (N/s)": "l_max_rfd",
  "R Max RFD (N/s)": "r_max_rfd",
  "L Avg RFD (N/s)": "l_avg_rfd",
  "R Avg RFD (N/s)": "r_avg_rfd",
  "L Min Time To Peak Force (s)": "l_min_time_to_peak",
  "R Min Time To Peak Force (s)": "r_min_time_to_peak",
  "L Avg Time To Max Force (s)": "l_avg_time_to_peak",
  "R Avg Time To Max Force (s)": "r_avg_time_to_peak",
  "L Max RFD 50ms (N/s)": "l_max_rfd_50ms",
  "R Max RFD 50ms (N/s)": "r_max_rfd_50ms",
  "L Avg RFD 50ms (N/s)": "l_avg_rfd_50ms",
  "R Avg RFD 50ms (N/s)": "r_avg_rfd_50ms",
  "L Max RFD 100ms (N/s)": "l_max_rfd_100ms",
  "R Max RFD 100ms (N/s)": "r_max_rfd_100ms",
  "L Avg RFD 100ms (N/s)": "l_avg_rfd_100ms",
  "R Avg RFD 100ms (N/s)": "r_avg_rfd_100ms",
  "L Max RFD 150ms (N/s)": "l_max_rfd_150ms",
  "R Max RFD 150ms (N/s)": "r_max_rfd_150ms",
  "L Avg RFD 150ms (N/s)": "l_avg_rfd_150ms",
  "R Avg RFD 150ms (N/s)": "r_avg_rfd_150ms",
  "L Max RFD 200ms (N/s)": "l_max_rfd_200ms",
  "R Max RFD 200ms (N/s)": "r_max_rfd_200ms",
  "L Avg RFD 200ms (N/s)": "l_avg_rfd_200ms",
  "R Avg RFD 200ms (N/s)": "r_avg_rfd_200ms",
  "L Max RFD 250ms (N/s)": "l_max_rfd_250ms",
  "R Max RFD 250ms (N/s)": "r_max_rfd_250ms",
  "L Avg RFD 250ms (N/s)": "l_avg_rfd_250ms",
  "R Avg RFD 250ms (N/s)": "r_avg_rfd_250ms",
  "L Max Impulse 50ms (Ns)": "l_max_impulse_50ms",
  "R Max Impulse 50ms (Ns)": "r_max_impulse_50ms",
  "L Avg Impulse 50ms (Ns)": "l_avg_impulse_50ms",
  "R Avg Impulse 50ms (Ns)": "r_avg_impulse_50ms",
  "L Max Impulse 100ms (Ns)": "l_max_impulse_100ms",
  "R Max Impulse 100ms (Ns)": "r_max_impulse_100ms",
  "L Avg Impulse 100ms (Ns)": "l_avg_impulse_100ms",
  "R Avg Impulse 100ms (Ns)": "r_avg_impulse_100ms",
  "L Max Impulse 150ms (Ns)": "l_max_impulse_150ms",
  "R Max Impulse 150ms (Ns)": "r_max_impulse_150ms",
  "L Avg Impulse 150ms (Ns)": "l_avg_impulse_150ms",
  "R Avg Impulse 150ms (Ns)": "r_avg_impulse_150ms",
  "L Max Impulse 200ms (Ns)": "l_max_impulse_200ms",
  "R Max Impulse 200ms (Ns)": "r_max_impulse_200ms",
  "L Avg Impulse 200ms (Ns)": "l_avg_impulse_200ms",
  "R Avg Impulse 200ms (Ns)": "r_avg_impulse_200ms",
  "L Max Impulse 250ms (Ns)": "l_max_impulse_250ms",
  "R Max Impulse 250ms (Ns)": "r_max_impulse_250ms",
  "L Avg Impulse 250ms (Ns)": "l_avg_impulse_250ms",
  "R Avg Impulse 250ms (Ns)": "r_avg_impulse_250ms",
  "Notes": "notes",
};

const NORDBORD_COLUMNS: Record<string, string> = {
  "Date UTC": "test_date",
  "Time UTC": "test_time",
  "Device": "device",
  "Test": "test_type",
  "L Reps": "l_reps",
  "R Reps": "r_reps",
  "L Max Force (N)": "l_max_force",
  "R Max Force (N)": "r_max_force",
  "Max Imbalance (%)": "max_imbalance",
  "L Max Torque (Nm)": "l_max_torque",
  "R Max Torque (Nm)": "r_max_torque",
  "L Avg Force (N)": "l_avg_force",
  "R Avg Force (N)": "r_avg_force",
  "Avg Imbalance (%)": "avg_imbalance",
  "L Max Impulse (Ns)": "l_max_impulse",
  "R Max Impulse (Ns)": "r_max_impulse",
  "Impulse Imbalance (%)": "impulse_imbalance",
  "L Min Time to Peak Force (s)": "l_min_time_to_peak",
  "R Min Time to PeakForce (s)": "r_min_time_to_peak",
  "R Min Time to Peak Force (s)": "r_min_time_to_peak",
  "L Avg Time to Peak Force (s)": "l_avg_time_to_peak",
  "R Avg Time to Peak Force (s)": "r_avg_time_to_peak",
  "L Max Force Per Kg (N/kg)": "l_max_force_per_kg",
  "R Max Force Per Kg (N/kg)": "r_max_force_per_kg",
  "L Avg Force Per Kg (N/kg)": "l_avg_force_per_kg",
  "R Avg Force Per Kg (N/kg)": "r_avg_force_per_kg",
  "L Max RFD 50ms (N/s)": "l_max_rfd_50ms",
  "L Avg RFD 50ms (N/s)": "l_avg_rfd_50ms",
  "R Max RFD 50ms (N/s)": "r_max_rfd_50ms",
  "R Avg RFD 50ms (N/s)": "r_avg_rfd_50ms",
  "L Max RFD 100ms (N/s)": "l_max_rfd_100ms",
  "L Avg RFD 100ms (N/s)": "l_avg_rfd_100ms",
  "R Max RFD 100ms (N/s)": "r_max_rfd_100ms",
  "R Avg RFD 100ms (N/s)": "r_avg_rfd_100ms",
  "L Max RFD 150ms (N/s)": "l_max_rfd_150ms",
  "L Avg RFD 150ms (N/s)": "l_avg_rfd_150ms",
  "R Max RFD 150ms (N/s)": "r_max_rfd_150ms",
  "R Avg RFD 150ms (N/s)": "r_avg_rfd_150ms",
  "L Max RFD 200ms (N/s)": "l_max_rfd_200ms",
  "L Avg RFD 200ms (N/s)": "l_avg_rfd_200ms",
  "R Max RFD 200ms (N/s)": "r_max_rfd_200ms",
  "R Avg RFD 200ms (N/s)": "r_avg_rfd_200ms",
  "L Max RFD 250ms (N/s)": "l_max_rfd_250ms",
  "L Avg RFD 250ms (N/s)": "l_avg_rfd_250ms",
  "R Max RFD 250ms (N/s)": "r_max_rfd_250ms",
  "R Avg RFD 250ms (N/s)": "r_avg_rfd_250ms",
  // Impulse columns — NordBord uses N⋅s (middle dot) instead of Ns
  "L Max Impulse 50ms (N⋅s)": "l_max_impulse_50ms",
  "L Avg Impulse 50ms (N⋅s)": "l_avg_impulse_50ms",
  "R Max Impulse 50ms (N⋅s)": "r_max_impulse_50ms",
  "R Avg Impulse 50ms (N⋅s)": "r_avg_impulse_50ms",
  "L Max Impulse 100ms (N⋅s)": "l_max_impulse_100ms",
  "L Avg Impulse 100ms (N⋅s)": "l_avg_impulse_100ms",
  "R Max Impulse 100ms (N⋅s)": "r_max_impulse_100ms",
  "R Avg Impulse 100ms (N⋅s)": "r_avg_impulse_100ms",
  "L Max Impulse 150ms (N⋅s)": "l_max_impulse_150ms",
  "L Avg Impulse 150ms (N⋅s)": "l_avg_impulse_150ms",
  "R Max Impulse 150ms (N⋅s)": "r_max_impulse_150ms",
  "R Avg Impulse 150ms (N⋅s)": "r_avg_impulse_150ms",
  "L Max Impulse 200ms (N⋅s)": "l_max_impulse_200ms",
  "L Avg Impulse 200ms (N⋅s)": "l_avg_impulse_200ms",
  "R Max Impulse 200ms (N⋅s)": "r_max_impulse_200ms",
  "R Avg Impulse 200ms (N⋅s)": "r_avg_impulse_200ms",
  "L Max Impulse 250ms (N⋅s)": "l_max_impulse_250ms",
  "L Avg Impulse 250ms (N⋅s)": "l_avg_impulse_250ms",
  "R Max Impulse 250ms (N⋅s)": "r_max_impulse_250ms",
  "R Avg Impulse 250ms (N⋅s)": "r_avg_impulse_250ms",
  // Fallback: some exports use Ns instead of N⋅s
  "L Max Impulse 50ms (Ns)": "l_max_impulse_50ms",
  "L Avg Impulse 50ms (Ns)": "l_avg_impulse_50ms",
  "R Max Impulse 50ms (Ns)": "r_max_impulse_50ms",
  "R Avg Impulse 50ms (Ns)": "r_avg_impulse_50ms",
  "L Max Impulse 100ms (Ns)": "l_max_impulse_100ms",
  "L Avg Impulse 100ms (Ns)": "l_avg_impulse_100ms",
  "R Max Impulse 100ms (Ns)": "r_max_impulse_100ms",
  "R Avg Impulse 100ms (Ns)": "r_avg_impulse_100ms",
  "L Max Impulse 150ms (Ns)": "l_max_impulse_150ms",
  "L Avg Impulse 150ms (Ns)": "l_avg_impulse_150ms",
  "R Max Impulse 150ms (Ns)": "r_max_impulse_150ms",
  "R Avg Impulse 150ms (Ns)": "r_avg_impulse_150ms",
  "L Max Impulse 200ms (Ns)": "l_max_impulse_200ms",
  "L Avg Impulse 200ms (Ns)": "l_avg_impulse_200ms",
  "R Max Impulse 200ms (Ns)": "r_max_impulse_200ms",
  "R Avg Impulse 200ms (Ns)": "r_avg_impulse_200ms",
  "L Max Impulse 250ms (Ns)": "l_max_impulse_250ms",
  "L Avg Impulse 250ms (Ns)": "l_avg_impulse_250ms",
  "R Max Impulse 250ms (Ns)": "r_max_impulse_250ms",
  "R Avg Impulse 250ms (Ns)": "r_avg_impulse_250ms",
  "L Max Torque Per Kg (Nm/kg)": "l_max_torque_per_kg",
  "R Max Torque Per Kg (Nm/kg)": "r_max_torque_per_kg",
  "L Avg Torque Per Kg (Nm/kg)": "l_avg_torque_per_kg",
  "R Avg Torque Per Kg (Nm/kg)": "r_avg_torque_per_kg",
  "Notes": "notes",
};

// ─── Player name column per CSV type ──────────────────────────────────────
// GPS uses "Player Name", all others use "Name"
const PLAYER_NAME_HEADER: Record<CsvType, string> = {
  gps: "Player Name",
  jump: "Name",
  force_frame: "Name",
  nordbord: "Name",
};

// GPS is the only type that carries position info
const PLAYER_POSITION_HEADER = "Player Primary Position";

// ─── Required columns per type (at least one must be present) ─────────────
const REQUIRED_COLUMNS: Record<CsvType, string[]> = {
  gps: ["Session Date"],
  jump: ["Date"],
  force_frame: ["Date"],
  nordbord: ["Date UTC"],
};

// ─── Type Detection ───────────────────────────────────────────────────────

/** Strip BOM and trim whitespace from header strings. */
function cleanHeader(h: string): string {
  return h.replace(/^\uFEFF/, "").trim();
}

/**
 * Detect CSV type by inspecting column headers.
 * Returns null if no known type matches.
 */
export function detectCsvType(headers: string[]): CsvType | null {
  const clean = new Set(headers.map(cleanHeader));

  // Order matters — check most specific first
  if (clean.has("Date UTC") && clean.has("L Max Torque (Nm)")) return "nordbord";
  if (clean.has("Direction") && clean.has("Mode")) return "force_frame";
  if (clean.has("Test Type") && clean.has("BW [KG]")) return "jump";
  if (clean.has("Session Date") && clean.has("Player Name")) return "gps";

  return null;
}

// ─── Date Parsing ─────────────────────────────────────────────────────────

/** Convert "M/D/YYYY" or "MM/DD/YYYY" to "YYYY-MM-DD" for Postgres date. */
function parseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // M/D/YYYY or MM/DD/YYYY
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

/** Convert "H:MM:SS AM/PM" to "HH:MM:SS" (24h) for Postgres time. */
function parseTime(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Already 24h format
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return trimmed;

  // 12h format: "3:00:00 PM"
  const match = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let [, h, min, sec, period] = match;
    let hour = parseInt(h, 10);
    if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
    if (period.toUpperCase() === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${min}:${sec}`;
  }

  // Time without seconds: "4:48 PM"
  const match2 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match2) {
    let [, h, min, period] = match2;
    let hour = parseInt(h, 10);
    if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
    if (period.toUpperCase() === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${min}:00`;
  }

  return null;
}

/** Parse a numeric value, returning null for empty/invalid strings. */
function parseNum(raw: string): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = Number(raw.trim().replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

// Columns that should be parsed as dates
const DATE_COLUMNS = new Set([
  "session_date", "test_date",
]);

// Columns that should be parsed as times
const TIME_COLUMNS = new Set([
  "drill_start_time", "drill_end_time", "test_time",
]);

// Columns that stay as text (not numeric)
const TEXT_COLUMNS = new Set([
  "session_title", "drill_title", "test_type", "tags", "device", "mode",
  "direction", "position", "notes",
  "concentric_mean_force_asym", "eccentric_braking_impulse_asym",
  "eccentric_decel_rfd_asym", "eccentric_peak_force_asym",
]);

// Columns that should be parsed as integers
const INT_COLUMNS = new Set([
  "reps", "l_reps", "r_reps",
]);

// ─── Main Parser ──────────────────────────────────────────────────────────

function getColumnMap(csvType: CsvType): Record<string, string> {
  switch (csvType) {
    case "gps": return GPS_COLUMNS;
    case "jump": return JUMP_COLUMNS;
    case "force_frame": return FORCE_FRAME_COLUMNS;
    case "nordbord": return NORDBORD_COLUMNS;
  }
}

export function parseCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: cleanHeader,
  });

  const headers = parsed.meta.fields ?? [];
  const csvType = detectCsvType(headers);

  if (!csvType) {
    throw new Error(
      `Could not detect CSV type. Headers found: ${headers.slice(0, 5).join(", ")}...`
    );
  }

  const columnMap = getColumnMap(csvType);
  const nameHeader = PLAYER_NAME_HEADER[csvType];
  const requiredCols = REQUIRED_COLUMNS[csvType];

  // Check that required columns exist
  const missingRequired = requiredCols.filter(c => !headers.includes(c));
  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required columns for ${csvType}: ${missingRequired.join(", ")}`
    );
  }

  // Build the set of mapped columns (CSV headers that we recognize)
  const mappedHeaders = headers.filter(h => h === nameHeader || h === PLAYER_POSITION_HEADER || columnMap[h]);
  const unmappedHeaders = headers.filter(h => h !== nameHeader && h !== PLAYER_POSITION_HEADER && h !== "ExternalId" && !columnMap[h]);
  const mappedDbColumns = mappedHeaders
    .map(h => columnMap[h])
    .filter(Boolean);

  const playersMap = new Map<string, string | undefined>();
  const rows: Record<string, unknown>[] = [];
  const skippedRows: { row: number; reason: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const csvRow = parsed.data[i];
    const playerName = csvRow[nameHeader]?.trim();

    if (!playerName) {
      skippedRows.push({ row: i + 2, reason: "Missing player name" });
      continue;
    }

    // Track players
    const position = csvType === "gps" ? csvRow[PLAYER_POSITION_HEADER]?.trim() : undefined;
    if (!playersMap.has(playerName)) {
      playersMap.set(playerName, position);
    } else if (position && !playersMap.get(playerName)) {
      playersMap.set(playerName, position);
    }

    // Map columns
    const dbRow: Record<string, unknown> = {
      __player_name: playerName,
    };

    for (const header of headers) {
      const dbCol = columnMap[header];
      if (!dbCol) continue;

      const rawValue = csvRow[header];

      if (DATE_COLUMNS.has(dbCol)) {
        dbRow[dbCol] = parseDate(rawValue);
      } else if (TIME_COLUMNS.has(dbCol)) {
        dbRow[dbCol] = parseTime(rawValue);
      } else if (TEXT_COLUMNS.has(dbCol)) {
        dbRow[dbCol] = rawValue?.trim() || null;
      } else if (INT_COLUMNS.has(dbCol)) {
        const n = parseNum(rawValue);
        dbRow[dbCol] = n !== null ? Math.round(n) : null;
      } else {
        dbRow[dbCol] = parseNum(rawValue);
      }
    }

    rows.push(dbRow);
  }

  const players = Array.from(playersMap.entries()).map(([name, position]) => ({
    name,
    position,
  }));

  return {
    csvType,
    players,
    rows,
    mappedColumns: mappedDbColumns,
    unmappedHeaders,
    skippedRows,
  };
}
