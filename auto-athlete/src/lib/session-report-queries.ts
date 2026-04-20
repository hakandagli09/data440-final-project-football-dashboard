import { subtractDays } from "@/lib/date-utils";
import { getWeekStart } from "@/lib/derived-metrics";
import { getSide, type PositionSide } from "@/lib/position-groups";
import type { PlayerStatus } from "@/lib/player-queries";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/supabase-paginate";

/**
 * Session Report data — coach-facing, one card per player.
 *
 * Mirrors Brian's Excel workflow (screenshot reference):
 *   METRIC | Daily | Running Tot. | Weekly Avg | %
 *   where % = Running Total / Weekly Avg * 100.
 *
 * Weekly Avg is each player's own rolling 4-week baseline for that metric
 * so the percentage reflects "am I on pace vs. my own normal week?"
 * (Brian's sheet uses a target number; a rolling-4wk baseline is the
 *  statistical equivalent and auto-updates as the season progresses.)
 */

/** Unique key for each metric row in the report card. */
export type SessionReportMetricKey =
  | "total_distance"
  | "high_speed_running"
  | "accelerations_zone_4_6"
  | "decelerations_zone_4_6"
  | "hml_distance"
  | "hmld_per_minute"
  | "fatigue_index"
  | "speed_intensity"
  | "dynamic_stress_load"
  | "max_speed"
  | "pct_max_speed";

/** How a metric should be aggregated across multiple sessions in a day/week. */
export type AggregationKind = "sum" | "max" | "avg";

/** Display category — controls the formatter used on the client. */
export type ReportUnit = "distance" | "speed" | "distance_per_min" | "pct" | "count" | "au";

export interface SessionReportMetricDefinition {
  key: SessionReportMetricKey;
  label: string;
  column: string;
  aggregation: AggregationKind;
  unit: ReportUnit;
  decimals: number;
  /** Skip the % column (some metrics aren't cumulative). */
  suppressPercent?: boolean;
}

/**
 * Ordered list matching the row order in the screenshot. The `column`
 * field is the snake_case database column name on `gps_sessions`.
 */
export const SESSION_REPORT_METRICS: SessionReportMetricDefinition[] = [
  { key: "total_distance",          label: "Total Yards",     column: "total_distance",          aggregation: "sum", unit: "distance",         decimals: 0 },
  { key: "high_speed_running",      label: "HSR",             column: "high_speed_running",      aggregation: "sum", unit: "distance",         decimals: 0 },
  { key: "accelerations_zone_4_6",  label: "Accels",          column: "accelerations_zone_4_6",  aggregation: "sum", unit: "count",            decimals: 0 },
  { key: "decelerations_zone_4_6",  label: "Decels",          column: "decelerations_zone_4_6",  aggregation: "sum", unit: "count",            decimals: 0 },
  { key: "hml_distance",            label: "HMLD",            column: "hml_distance",            aggregation: "sum", unit: "distance",         decimals: 0 },
  { key: "hmld_per_minute",         label: "HMLD/Min",        column: "hmld_per_minute",         aggregation: "avg", unit: "distance_per_min", decimals: 2 },
  { key: "fatigue_index",           label: "Fatigue Index",   column: "fatigue_index",           aggregation: "avg", unit: "au",               decimals: 2 },
  { key: "speed_intensity",         label: "Speed Intensity", column: "speed_intensity",         aggregation: "sum", unit: "au",               decimals: 2 },
  { key: "dynamic_stress_load",     label: "DSL",             column: "dynamic_stress_load",     aggregation: "sum", unit: "au",               decimals: 0 },
  { key: "max_speed",               label: "Max V",           column: "max_speed",               aggregation: "max", unit: "speed",            decimals: 2, suppressPercent: true },
  { key: "pct_max_speed",           label: "% Max Speed",     column: "pct_max_speed",           aggregation: "max", unit: "pct",              decimals: 2, suppressPercent: true },
];

/** One computed cell row in the per-player card. */
export interface SessionReportCell {
  key: SessionReportMetricKey;
  label: string;
  unit: ReportUnit;
  decimals: number;
  /** Raw metric values — imperial conversion happens at display time. */
  daily: number | null;
  runningTotal: number | null;
  weeklyAverage: number | null;
  /** Running Total / Weekly Average * 100. Null when baseline is 0 or suppressed. */
  pctOfWeeklyAvg: number | null;
  suppressPercent: boolean;
}

/** 7-day sparkline series of daily total distance (already in yards; no conversion). */
export interface SparklinePoint {
  date: string;
  value: number;
}

export interface SessionReportPlayerCard {
  playerId: string;
  playerName: string;
  position: string;
  side: PositionSide;
  status: PlayerStatus;
  expectedReturn: string | null;
  cells: SessionReportCell[];
  /** Last 7 days of total distance for the mini chart. */
  distanceSparkline: SparklinePoint[];
}

export interface SessionReportData {
  currentDate: string;
  availableDates: string[];
  weekStart: string;
  /** Unique session_title values seen on the selected date (practice day label). */
  practiceDayLabels: string[];
  /** Team-wide roster (filtered to only players with any data). */
  offense: SessionReportPlayerCard[];
  defense: SessionReportPlayerCard[];
  /** Players flagged injured or rehab — shown in a separate section. */
  injuredRehab: SessionReportPlayerCard[];
}

type GpsRow = {
  player_id: string;
  session_date: string;
  session_title: string | null;
  [key: string]: number | string | null;
};

/** Utility: coerce DB value to number or null (StatSports sometimes returns NaN). */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aggregate a set of per-session values for a single day (or week) using
 * the metric's declared aggregation kind. Returns null when there are no
 * valid inputs — callers render null as "—" in the UI.
 */
function aggregate(values: Array<number | null>, kind: AggregationKind): number | null {
  const clean = values.filter((v): v is number => v != null);
  if (clean.length === 0) return null;
  if (kind === "sum") return clean.reduce((a, b) => a + b, 0);
  if (kind === "max") return Math.max(...clean);
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

/**
 * Compute a player's rolling 4-week baseline for a given metric. Uses the
 * four ISO weeks prior to the selected week and applies the same
 * aggregation kind that the daily/running-total views use so the numbers
 * are comparable. Returns null when the player has no prior history.
 */
function computeWeeklyBaseline(
  rows: GpsRow[],
  playerId: string,
  column: string,
  kind: AggregationKind,
  currentWeekStart: string
): number | null {
  const buckets = new Map<string, Array<number | null>>();
  for (const row of rows) {
    if (row.player_id !== playerId) continue;
    if (row.session_date >= currentWeekStart) continue;
    const weekStart = getWeekStart(row.session_date);
    // Only include sessions from the last 4 complete weeks to keep the
    // baseline responsive to recent training trends.
    const weeksBack = Math.floor(
      (new Date(`${currentWeekStart}T00:00:00Z`).getTime() - new Date(`${weekStart}T00:00:00Z`).getTime()) /
        (1000 * 60 * 60 * 24 * 7)
    );
    if (weeksBack < 1 || weeksBack > 4) continue;
    if (!buckets.has(weekStart)) buckets.set(weekStart, []);
    buckets.get(weekStart)!.push(num(row[column]));
  }

  const weekTotals: number[] = [];
  for (const values of Array.from(buckets.values())) {
    const agg = aggregate(values, kind);
    if (agg != null) weekTotals.push(agg);
  }
  if (weekTotals.length === 0) return null;
  return weekTotals.reduce((a, b) => a + b, 0) / weekTotals.length;
}

/**
 * Main entry point for the Reports page. Returns everything the client
 * needs to render the offense + defense session report grids.
 */
export async function getSessionReportData(selectedDate?: string): Promise<SessionReportData> {
  // Must paginate past PostgREST's 1000-row cap, otherwise we lose
  // every session date older than ~6 weeks on a populated team table.
  const dateRows = await fetchAllRows<{ session_date: string }>(() =>
    supabase
      .from("gps_sessions")
      .select("session_date")
      .order("session_date", { ascending: false })
  );

  const availableDates = Array.from(new Set(dateRows.map((r) => r.session_date)));
  const currentDate = selectedDate && availableDates.includes(selectedDate)
    ? selectedDate
    : (availableDates[0] ?? "");

  if (!currentDate) {
    return {
      currentDate: "",
      availableDates: [],
      weekStart: "",
      practiceDayLabels: [],
      offense: [],
      defense: [],
      injuredRehab: [],
    };
  }

  const weekStart = getWeekStart(currentDate);
  // Pull four weeks of history PLUS the current week so we can compute
  // both the rolling baseline and the running-total simultaneously.
  const baselineWindowStart = subtractDays(weekStart, 28);
  // Sparkline window (last 7 days ending on the selected date).
  const sparkStart = subtractDays(currentDate, 6);

  const columnList = SESSION_REPORT_METRICS.map((m) => m.column).join(", ");

  const [
    { data: playersRows },
    { data: injuriesRows },
    historyRows,
  ] = await Promise.all([
    supabase.from("players").select("id, name, position"),
    supabase
      .from("injuries")
      .select("player_id, status, expected_return, updated_at")
      .order("updated_at", { ascending: false }),
    // Drill-level GPS rows routinely exceed 1000 over a 4-week window
    // (a single full-pads practice is ~400 rows), so page the history
    // fetch rather than relying on a plain .select().
    fetchAllRows<Record<string, unknown>>(() =>
      supabase
        .from("gps_sessions")
        .select(`player_id, session_date, session_title, ${columnList}`)
        .gte("session_date", baselineWindowStart)
        .lte("session_date", currentDate)
    ),
  ]);

  // Supabase's typed client can't validate dynamically interpolated
  // column lists, so cast through `unknown` to keep the runtime shape
  // while shedding the compile-time ParserError type.
  const history = (historyRows as unknown) as GpsRow[];
  const players = (playersRows ?? []) as Array<{ id: string; name: string; position: string | null }>;

  // Latest injury status per player (first occurrence wins because we
  // ordered by updated_at DESC above).
  const statusByPlayer = new Map<string, { status: PlayerStatus; expectedReturn: string | null }>();
  for (const row of injuriesRows ?? []) {
    if (!statusByPlayer.has(row.player_id)) {
      statusByPlayer.set(row.player_id, {
        status: row.status as PlayerStatus,
        expectedReturn: row.expected_return as string | null,
      });
    }
  }

  // Collect today's session titles for the "practice day" label.
  const practiceDayLabels = Array.from(
    new Set(
      history
        .filter((r) => r.session_date === currentDate && r.session_title)
        .map((r) => (r.session_title as string).trim())
        .filter(Boolean)
    )
  );

  const cards: SessionReportPlayerCard[] = [];

  for (const player of players) {
    const playerHistory = history.filter((r) => r.player_id === player.id);
    // Skip players with zero data in the four-week window — they'd just
    // render empty cards and clutter the grid.
    if (playerHistory.length === 0) continue;

    const todayRows = playerHistory.filter((r) => r.session_date === currentDate);
    const weekRows = playerHistory.filter(
      (r) => r.session_date >= weekStart && r.session_date <= currentDate
    );

    const cells: SessionReportCell[] = SESSION_REPORT_METRICS.map((metric) => {
      const daily = aggregate(todayRows.map((r) => num(r[metric.column])), metric.aggregation);
      const runningTotal = aggregate(weekRows.map((r) => num(r[metric.column])), metric.aggregation);
      const weeklyAverage = computeWeeklyBaseline(
        playerHistory,
        player.id,
        metric.column,
        metric.aggregation,
        weekStart
      );

      const pctOfWeeklyAvg =
        !metric.suppressPercent && runningTotal != null && weeklyAverage != null && weeklyAverage !== 0
          ? (runningTotal / weeklyAverage) * 100
          : null;

      return {
        key: metric.key,
        label: metric.label,
        unit: metric.unit,
        decimals: metric.decimals,
        daily,
        runningTotal,
        weeklyAverage,
        pctOfWeeklyAvg,
        suppressPercent: metric.suppressPercent ?? false,
      };
    });

    // Build the 7-day Total Distance sparkline (one point per calendar
    // day in the window; days with no session render as 0).
    const sparkMap = new Map<string, number>();
    for (const row of playerHistory) {
      if (row.session_date < sparkStart || row.session_date > currentDate) continue;
      const existing = sparkMap.get(row.session_date) ?? 0;
      sparkMap.set(row.session_date, existing + (num(row["total_distance"]) ?? 0));
    }
    const distanceSparkline: SparklinePoint[] = [];
    let cursor = sparkStart;
    while (cursor <= currentDate) {
      distanceSparkline.push({ date: cursor, value: sparkMap.get(cursor) ?? 0 });
      cursor = subtractDays(cursor, -1);
    }

    const statusEntry = statusByPlayer.get(player.id);
    cards.push({
      playerId: player.id,
      playerName: player.name,
      position: player.position ?? "—",
      side: getSide(player.position),
      status: statusEntry?.status ?? "cleared",
      expectedReturn: statusEntry?.expectedReturn ?? null,
      cells,
      distanceSparkline,
    });
  }

  // Split into the three report sections. Injured / rehab players are
  // pulled out regardless of side so they don't skew the coach's read of
  // who trained hard today.
  const injuredRehab = cards.filter((c) => c.status === "injured" || c.status === "rehab");
  const activeCards = cards.filter((c) => c.status !== "injured" && c.status !== "rehab");

  // Sort alphabetically so the grid is stable between loads.
  activeCards.sort((a, b) => a.playerName.localeCompare(b.playerName));
  injuredRehab.sort((a, b) => a.playerName.localeCompare(b.playerName));

  return {
    currentDate,
    availableDates,
    weekStart,
    practiceDayLabels,
    offense: activeCards.filter((c) => c.side === "offense"),
    defense: activeCards.filter((c) => c.side === "defense"),
    injuredRehab,
  };
}
