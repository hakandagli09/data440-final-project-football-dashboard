import { computeEwma, computeSprintRecency } from "@/lib/derived-metrics";

export type PlayerStatus = "modified_load" | "injured" | "rehab" | "return_to_play" | "cleared";

export type ReadinessColor = "green" | "yellow" | "red" | "neutral";

export type FlagCategory = "speed" | "gps_load" | "cmj_output" | "cmj_strategy";

export interface PlayerFlag {
  key: string;
  label: string;
  category: FlagCategory;
  severity: "warning";
  value: number | null;
  threshold: number;
}

export interface FlagGpsRow {
  player_id: string;
  session_date: string;
  max_speed: number | null;
  high_speed_running?: number | null;
  distance_zone_4_6?: number | null;
  accelerations_zone_4_6?: number | null;
  decelerations_zone_4_6?: number | null;
}

export interface FlagJumpRow {
  player_id?: string;
  test_date: string;
  test_time?: string | null;
  jump_height_cm?: number | null;
  jump_height_in?: number | null;
  rsi_modified?: number | null;
  concentric_impulse?: number | null;
  eccentric_braking_impulse?: number | null;
  eccentric_duration_ms?: number | null;
  contraction_time_ms?: number | null;
}

export interface PlayerFlagInput {
  status: PlayerStatus;
  gpsRows: FlagGpsRow[];
  jumpRows?: FlagJumpRow[];
}

export interface SprintRecencySummary {
  daysSince90: number | null;
  daysSince85: number | null;
  maxSpeed: number | null;
}

type DailyGpsLoad = {
  date: string;
  hsr: number;
  accelDecel: number;
  maxSpeed: number;
};

const HSR_2026_START_DATE = "2026-01-01";
const EWMA_FLAG_THRESHOLD = 1.3;
const MIN_GPS_BASELINE_DAYS = 5;
const OUTLIER_STD_DEV_MULTIPLIER = 2;
const CMJ_CHANGE_THRESHOLD_PCT = 10;

function finiteOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Number.isFinite(value) ? value : null;
}

function valueOrZero(value: number | null | undefined): number {
  return finiteOrNull(value) ?? 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = average(values);
  if (mean == null) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function sameCalendarYear(date: string, referenceDate: string): boolean {
  return date.slice(0, 4) === referenceDate.slice(0, 4);
}

/**
 * HSR source changed with the 2026 GPS export. Flagging should read the
 * coach-defined metric, not whichever historical column happens to be filled.
 */
export function getNormalizedHsr(row: Pick<FlagGpsRow, "session_date" | "high_speed_running" | "distance_zone_4_6">): number {
  const legacyHsr = finiteOrNull(row.high_speed_running);
  const zone46Hsr = finiteOrNull(row.distance_zone_4_6);
  if (row.session_date >= HSR_2026_START_DATE) return zone46Hsr ?? legacyHsr ?? 0;
  return legacyHsr ?? zone46Hsr ?? 0;
}

export function readinessFromFlagCount(flagCount: number, hasData = true): ReadinessColor {
  if (!hasData) return "neutral";
  if (flagCount === 0) return "green";
  if (flagCount >= 3) return "red";
  return "yellow";
}

export function computeSprintRecencySummary(rows: FlagGpsRow[]): SprintRecencySummary {
  const recency = computeSprintRecency(
    rows.map((row) => ({ date: row.session_date, maxSpeed: valueOrZero(row.max_speed) }))
  );
  return {
    daysSince90: recency.daysSince90,
    daysSince85: recency.daysSince85,
    maxSpeed: recency.allTimeMax,
  };
}

function aggregateDailyGpsLoads(rows: FlagGpsRow[]): DailyGpsLoad[] {
  const byDate = new Map<string, DailyGpsLoad>();
  for (const row of rows) {
    const current = byDate.get(row.session_date) ?? {
      date: row.session_date,
      hsr: 0,
      accelDecel: 0,
      maxSpeed: 0,
    };
    current.hsr += getNormalizedHsr(row);
    current.accelDecel += valueOrZero(row.accelerations_zone_4_6) + valueOrZero(row.decelerations_zone_4_6);
    current.maxSpeed = Math.max(current.maxSpeed, valueOrZero(row.max_speed));
    byDate.set(row.session_date, current);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function addEwmaFlag(
  flags: PlayerFlag[],
  key: string,
  label: string,
  category: FlagCategory,
  series: number[]
) {
  if (series.length <= MIN_GPS_BASELINE_DAYS) return;
  const ewma = computeEwma(series);
  const latest = ewma[ewma.length - 1] ?? null;
  const priorBaseline = average(ewma.slice(0, -1));
  if (latest == null || priorBaseline == null || priorBaseline <= 0) return;

  const ratio = latest / priorBaseline;
  if (ratio > EWMA_FLAG_THRESHOLD) {
    flags.push({
      key,
      label: `${label} EWMA above ${EWMA_FLAG_THRESHOLD}`,
      category,
      severity: "warning",
      value: ratio,
      threshold: EWMA_FLAG_THRESHOLD,
    });
  }
}

function addHighOutlierFlag(
  flags: PlayerFlag[],
  key: string,
  label: string,
  category: FlagCategory,
  latestValue: number,
  baselineValues: number[]
) {
  if (baselineValues.length < MIN_GPS_BASELINE_DAYS) return;
  const mean = average(baselineValues);
  const sd = stdDev(baselineValues);
  if (mean == null || sd == null || sd <= 0) return;
  const threshold = mean + OUTLIER_STD_DEV_MULTIPLIER * sd;
  if (latestValue > threshold) {
    flags.push({
      key,
      label: `${label} more than ${OUTLIER_STD_DEV_MULTIPLIER} SD above calendar-year baseline`,
      category,
      severity: "warning",
      value: latestValue,
      threshold,
    });
  }
}

function sortJumpRows(rows: FlagJumpRow[]): FlagJumpRow[] {
  return [...rows].sort((a, b) => {
    const dateOrder = a.test_date.localeCompare(b.test_date);
    if (dateOrder !== 0) return dateOrder;
    return (a.test_time ?? "").localeCompare(b.test_time ?? "");
  });
}

function bestPriorValue(rows: FlagJumpRow[], selector: (row: FlagJumpRow) => number | null): number | null {
  const values = rows.map(selector).filter((value): value is number => value != null && value > 0);
  if (values.length === 0) return null;
  return Math.max(...values);
}

function addDownFromBestFlag(
  flags: PlayerFlag[],
  key: string,
  label: string,
  category: FlagCategory,
  latest: number | null,
  best: number | null
) {
  if (latest == null || best == null || best <= 0) return;
  const pctDown = ((best - latest) / best) * 100;
  if (pctDown >= CMJ_CHANGE_THRESHOLD_PCT) {
    flags.push({
      key,
      label: `${label} down ${pctDown.toFixed(1)}% from recent best`,
      category,
      severity: "warning",
      value: latest,
      threshold: best * (1 - CMJ_CHANGE_THRESHOLD_PCT / 100),
    });
  }
}

function addUpFromBestFlag(
  flags: PlayerFlag[],
  key: string,
  label: string,
  category: FlagCategory,
  latest: number | null,
  priorBest: number | null
) {
  if (latest == null || priorBest == null || priorBest <= 0) return;
  const pctUp = ((latest - priorBest) / priorBest) * 100;
  if (pctUp >= CMJ_CHANGE_THRESHOLD_PCT) {
    flags.push({
      key,
      label: `${label} up ${pctUp.toFixed(1)}% from recent best`,
      category,
      severity: "warning",
      value: latest,
      threshold: priorBest * (1 + CMJ_CHANGE_THRESHOLD_PCT / 100),
    });
  }
}

function computeGpsFlags(rows: FlagGpsRow[]): PlayerFlag[] {
  const sortedRows = [...rows].sort((a, b) => a.session_date.localeCompare(b.session_date));
  if (sortedRows.length === 0) return [];

  const flags: PlayerFlag[] = [];
  const latestDate = sortedRows[sortedRows.length - 1].session_date;
  const yearRows = sortedRows.filter((row) => sameCalendarYear(row.session_date, latestDate));
  const dailyLoads = aggregateDailyGpsLoads(yearRows);
  const latestDailyLoad = dailyLoads[dailyLoads.length - 1];
  const baselineLoads = latestDailyLoad
    ? dailyLoads.filter((load) => load.date !== latestDailyLoad.date)
    : [];

  // The first week of spring ball should establish a healthy baseline.
  // With fewer prior days, EWMA/SD/sprint-recency flags are too noisy to act on.
  if (!latestDailyLoad || baselineLoads.length < MIN_GPS_BASELINE_DAYS) return flags;

  const recency = computeSprintRecencySummary(sortedRows);
  if (recency.daysSince90 != null && recency.daysSince90 >= 7) {
    flags.push({
      key: "speed_recency_90",
      label: `No 90% speed exposure in ${recency.daysSince90} days`,
      category: "speed",
      severity: "warning",
      value: recency.daysSince90,
      threshold: 7,
    });
  }

  addEwmaFlag(flags, "hsr_ewma_high", "HSR", "gps_load", dailyLoads.map((load) => load.hsr));
  addEwmaFlag(flags, "accel_decel_ewma_high", "Accel/Decel", "gps_load", dailyLoads.map((load) => load.accelDecel));

  addHighOutlierFlag(
    flags,
    "hsr_2sd_high",
    "HSR",
    "gps_load",
    latestDailyLoad.hsr,
    baselineLoads.map((load) => load.hsr)
  );
  addHighOutlierFlag(
    flags,
    "accel_decel_2sd_high",
    "Accel/Decel",
    "gps_load",
    latestDailyLoad.accelDecel,
    baselineLoads.map((load) => load.accelDecel)
  );

  return flags;
}

function computeCmjFlags(rows: FlagJumpRow[]): PlayerFlag[] {
  const sortedRows = sortJumpRows(rows);
  if (sortedRows.length < 2) return [];

  const flags: PlayerFlag[] = [];
  const latest = sortedRows[sortedRows.length - 1];
  const priorRows = sortedRows.slice(0, -1);

  addDownFromBestFlag(
    flags,
    "cmj_jump_height_down",
    "Jump height",
    "cmj_output",
    finiteOrNull(latest.jump_height_in) ?? finiteOrNull(latest.jump_height_cm),
    bestPriorValue(priorRows, (row) => finiteOrNull(row.jump_height_in) ?? finiteOrNull(row.jump_height_cm))
  );
  addDownFromBestFlag(
    flags,
    "cmj_concentric_impulse_down",
    "Concentric impulse",
    "cmj_output",
    finiteOrNull(latest.concentric_impulse),
    bestPriorValue(priorRows, (row) => finiteOrNull(row.concentric_impulse))
  );
  addDownFromBestFlag(
    flags,
    "cmj_eccentric_decel_impulse_down",
    "Eccentric deceleration impulse",
    "cmj_output",
    finiteOrNull(latest.eccentric_braking_impulse),
    bestPriorValue(priorRows, (row) => finiteOrNull(row.eccentric_braking_impulse))
  );
  addDownFromBestFlag(
    flags,
    "cmj_rsi_mod_down",
    "RSI-modified",
    "cmj_output",
    finiteOrNull(latest.rsi_modified),
    bestPriorValue(priorRows, (row) => finiteOrNull(row.rsi_modified))
  );
  addUpFromBestFlag(
    flags,
    "cmj_contraction_time_up",
    "Contraction time",
    "cmj_strategy",
    finiteOrNull(latest.contraction_time_ms),
    bestPriorValue(priorRows, (row) => finiteOrNull(row.contraction_time_ms))
  );
  addUpFromBestFlag(
    flags,
    "cmj_eccentric_duration_up",
    "Eccentric duration",
    "cmj_strategy",
    finiteOrNull(latest.eccentric_duration_ms),
    bestPriorValue(priorRows, (row) => finiteOrNull(row.eccentric_duration_ms))
  );

  return flags;
}

export function computePlayerFlags({ status, gpsRows, jumpRows = [] }: PlayerFlagInput): PlayerFlag[] {
  if (status !== "cleared") return [];
  return [...computeGpsFlags(gpsRows), ...computeCmjFlags(jumpRows)];
}

export function flagLabels(flags: PlayerFlag[]): string[] {
  return flags.map((flag) => flag.label);
}
