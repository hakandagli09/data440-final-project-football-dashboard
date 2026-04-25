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
  | "hml_efforts"
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
  // HML Efforts is StatSports' canonical "Explosive Efforts" count —
  // a discrete tally of high-intensity efforts in a session, so sum
  // across multiple sessions in a day/week.
  { key: "hml_efforts",             label: "Explosive Efforts", column: "hml_efforts",            aggregation: "sum", unit: "count",            decimals: 0 },
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

/**
 * Date-selection mode for the report. "single" preserves Brian's
 * Excel-style Daily / Running (week-to-date) / Week Avg / % layout.
 * "range" hides the Daily column and treats the chosen window as a
 * single rollup — Total = aggregate across the range; Week Avg stays
 * the player's rolling 4-week baseline so % reads as "this window vs.
 * a normal week".
 */
export type ReportMode = "single" | "range";

export interface SessionReportData {
  /** Mode-aware "as of" date — equals endDate. Drives header labels. */
  currentDate: string;
  /** Selected window start (inclusive). For single-day mode equals endDate. */
  startDate: string;
  /** Selected window end (inclusive). */
  endDate: string;
  /** "single" | "range" — derived from startDate vs endDate at query time. */
  mode: ReportMode;
  /** Every distinct date with aggregated session data — feeds the calendar dot markers. */
  availableDates: string[];
  /** ISO Monday of the week containing endDate. Used by single-day mode for week-to-date. */
  weekStart: string;
  /** Unique session_title values seen on the selected day or in the selected range. */
  practiceDayLabels: string[];
  /** All unique session_title values across the dataset — populates the filter dropdown. */
  availableSessionTitles: string[];
  /** Currently selected session_title filter, or null for "All Sessions". */
  currentSessionTitle: string | null;
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
export async function getSessionReportData(
  selectedDate?: string,
  selectedSessionTitle?: string,
  // Range mode params — when both are provided and differ from each
  // other, the report switches to range mode (Daily column hidden,
  // running total = sum across the range). When only `selectedDate`
  // is given, behavior is identical to the original single-day report.
  rangeStart?: string,
  rangeEnd?: string
): Promise<SessionReportData> {
  // Pull every (session_date, session_title) pair so we can build both
  // the date dropdown and the session-type filter, and scope dates to
  // the chosen session type when one is selected. Must paginate past
  // PostgREST's 1000-row cap, otherwise we lose older sessions on a
  // populated team table.
  //
  // NOTE: Filter to `drill_title = 'Entire Session'` so the Reports page
  // sees only the aggregated row shape (one row per player per session).
  // Drill-level rows (drill_title = "RTP", "ST W", etc.) live in the
  // same table but would N-multiply totals if summed alongside aggregated
  // rows. Other consumers (group-queries, player-queries, etc.) are
  // intentionally not changed here — to be addressed in a later pass.
  const dateRows = await fetchAllRows<{ session_date: string; session_title: string | null }>(() =>
    supabase
      .from("gps_sessions")
      .select("session_date, session_title")
      .eq("drill_title", "Entire Session")
      .order("session_date", { ascending: false })
  );

  // Normalize titles (strip surrounding whitespace; treat empty as null)
  // so a stray export quirk doesn't fragment the dropdown.
  const normalizedTitle = (t: string | null | undefined): string | null => {
    if (!t) return null;
    const trimmed = t.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  // Resolution order (rewritten so the session-title dropdown can be
  // scoped to the active window):
  //   1. Resolve the report window FIRST, treating the URL's
  //      session_title as a *preference* used only for the latest-day
  //      fallback (so "?session_title=Full Pads" with no date still
  //      lands on the latest Full Pads day).
  //   2. Build `availableSessionTitles` from the rows inside that
  //      window — refining the dropdown to the user's current view.
  //   3. Validate `currentSessionTitle` against the window-scoped list
  //      (silently falls back to null when the URL combo is internally
  //      inconsistent — e.g. range + title with no overlap — rather
  //      than rendering empty cards).
  //   4. `availableDates` stays scoped by `currentSessionTitle` so the
  //      calendar dot-markers continue to highlight every date with
  //      data for the current type across the whole season.

  // All distinct session dates (already DESC-ordered by the SQL above).
  const allDates = Array.from(new Set(dateRows.map((r) => r.session_date)));

  // Latest date for the currently-requested session_title — used only
  // as a fallback when the URL omits an explicit date, so the user
  // lands on the most recent day matching their preferred type.
  const datesForRequestedTitle = selectedSessionTitle
    ? Array.from(
        new Set(
          dateRows
            .filter((r) => normalizedTitle(r.session_title) === selectedSessionTitle)
            .map((r) => r.session_date)
        )
      )
    : [];
  const latestForRequestedTitle = datesForRequestedTitle[0] ?? "";
  const latestOverall = allDates[0] ?? "";

  // Window resolution (independent of session_title beyond the fallback).
  let endDate = "";
  let startDate = "";
  if (rangeStart && rangeEnd) {
    // Caller-provided range. Normalize so end is always >= start.
    endDate = rangeEnd >= rangeStart ? rangeEnd : rangeStart;
    startDate = rangeEnd >= rangeStart ? rangeStart : rangeEnd;
  } else if (selectedDate && allDates.includes(selectedDate)) {
    endDate = selectedDate;
    startDate = selectedDate;
  } else {
    // No explicit date — prefer "latest day with the requested title",
    // otherwise the global latest day with any data.
    const fallback = latestForRequestedTitle || latestOverall;
    endDate = fallback;
    startDate = fallback;
  }

  // Session titles that actually appear inside the resolved window.
  // This is what populates the Session Type dropdown — refines the
  // filter to only the types relevant to the user's current view.
  const availableSessionTitles = Array.from(
    new Set(
      dateRows
        .filter((r) => r.session_date >= startDate && r.session_date <= endDate)
        .map((r) => normalizedTitle(r.session_title))
        .filter((t): t is string => t !== null)
    )
  ).sort((a, b) => a.localeCompare(b));

  // Validate the URL-requested title against the window-scoped list.
  // If the user's requested title isn't in the window, silently fall
  // back to "All Sessions" so the report still shows meaningful data.
  const currentSessionTitle =
    selectedSessionTitle && availableSessionTitles.includes(selectedSessionTitle)
      ? selectedSessionTitle
      : null;

  // Available dates feed the calendar's dot-marker layer — show every
  // date with data for the current type across the entire season so
  // the user can see (and navigate to) days outside the active window.
  const availableDates = Array.from(
    new Set(
      dateRows
        .filter((r) =>
          currentSessionTitle ? normalizedTitle(r.session_title) === currentSessionTitle : true
        )
        .map((r) => r.session_date)
    )
  );

  // `currentDate` is the "as of" date used for headers — equals endDate.
  const currentDate = endDate;
  // Range mode kicks in only when the window spans multiple days.
  const mode: ReportMode = startDate && endDate && startDate !== endDate ? "range" : "single";

  if (!currentDate) {
    return {
      currentDate: "",
      startDate: "",
      endDate: "",
      mode: "single",
      availableDates: [],
      weekStart: "",
      practiceDayLabels: [],
      availableSessionTitles,
      currentSessionTitle,
      offense: [],
      defense: [],
      injuredRehab: [],
    };
  }

  const weekStart = getWeekStart(currentDate);
  // For single-day mode the history window must reach back 4 weeks
  // before the start of the current ISO week so we can compute the
  // rolling baseline. For range mode the same baseline is anchored at
  // the start of the range's earliest ISO week — that way the player's
  // "typical week" always reflects the period leading up to the window.
  const rangeWeekStart = getWeekStart(startDate);
  const baselineWindowStart = subtractDays(rangeWeekStart, 28);
  // Sparkline window (last 7 days ending on the report's "as of" date).
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
    // Filter to aggregated rows only (drill_title = "Entire Session") —
    // see the comment on `dateRows` above for the rationale. Pagination
    // is still required because a populated roster produces ~30+
    // aggregated rows per session, easily crossing PostgREST's 1000-row
    // cap over a 4-week window.
    fetchAllRows<Record<string, unknown>>(() =>
      supabase
        .from("gps_sessions")
        .select(`player_id, session_date, session_title, ${columnList}`)
        .eq("drill_title", "Entire Session")
        .gte("session_date", baselineWindowStart)
        .lte("session_date", currentDate)
    ),
  ]);

  // Supabase's typed client can't validate dynamically interpolated
  // column lists, so cast through `unknown` to keep the runtime shape
  // while shedding the compile-time ParserError type.
  const historyAll = (historyRows as unknown) as GpsRow[];
  // Apply the session-title filter once up front — every downstream
  // aggregation (daily, running total, 4-week baseline, sparkline) then
  // automatically scopes to the selected session type.
  const history = currentSessionTitle
    ? historyAll.filter((r) => normalizedTitle(r.session_title) === currentSessionTitle)
    : historyAll;
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

  // Collect session titles for the "practice day" label. In single-day
  // mode this is just the one date; in range mode it's the union across
  // every day in the range — useful to surface "this stretch covered
  // Helmets + Full Pads + Shells" at a glance.
  const practiceDayLabels = Array.from(
    new Set(
      history
        .filter((r) => r.session_date >= startDate && r.session_date <= endDate && r.session_title)
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

    // Single-day mode keeps the original semantics (Daily = that day,
    // Running = week-to-date through that day). Range mode treats the
    // selected window as the rollup unit — Daily is null (the column
    // hides on the client) and Running becomes the aggregate across
    // the entire range. Weekly Avg stays a player's typical week in
    // both modes so % reads as "this period vs. a normal week".
    const todayRows = playerHistory.filter((r) => r.session_date === currentDate);
    const weekRows = playerHistory.filter(
      (r) => r.session_date >= weekStart && r.session_date <= currentDate
    );
    const rangeRows = playerHistory.filter(
      (r) => r.session_date >= startDate && r.session_date <= endDate
    );

    const cells: SessionReportCell[] = SESSION_REPORT_METRICS.map((metric) => {
      const daily =
        mode === "single"
          ? aggregate(todayRows.map((r) => num(r[metric.column])), metric.aggregation)
          : null;
      const runningTotal =
        mode === "single"
          ? aggregate(weekRows.map((r) => num(r[metric.column])), metric.aggregation)
          : aggregate(rangeRows.map((r) => num(r[metric.column])), metric.aggregation);
      // Baseline is always anchored to the start of the report window
      // so the comparison week is always strictly *prior* to the data
      // shown in the Daily / Running columns.
      const weeklyAverage = computeWeeklyBaseline(
        playerHistory,
        player.id,
        metric.column,
        metric.aggregation,
        rangeWeekStart
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
    startDate,
    endDate,
    mode,
    availableDates,
    weekStart,
    practiceDayLabels,
    availableSessionTitles,
    currentSessionTitle,
    offense: activeCards.filter((c) => c.side === "offense"),
    defense: activeCards.filter((c) => c.side === "defense"),
    injuredRehab,
  };
}
