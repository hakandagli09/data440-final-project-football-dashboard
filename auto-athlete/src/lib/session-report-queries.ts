import { subtractDays } from "@/lib/date-utils";
import { getWeekStart } from "@/lib/derived-metrics";
import { getSide, type PositionSide } from "@/lib/position-groups";
import type { PlayerStatus } from "@/lib/player-queries";
import { supabaseServer as supabase } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { getNormalizedHsr } from "@/lib/flagging";

/**
 * Session Report data — coach-facing, one card per player.
 *
 * Layout mirrors Brian's Excel workflow (screenshot reference):
 *   METRIC | Daily | 7D Avg / Total | <Title> Avg | %
 *
 * The `%` column compares each metric to a **year-to-date practice-
 * type baseline**: the player's mean across same-`session_title` days
 * within the calendar year of the selected date. Today's practice
 * type drives which average is shown — Helmets day → Helmets avg,
 * Full Pads day → Full Pads avg, Game day → Game avg, etc.
 *
 * Year scoping rules:
 *  - The baseline window is the full calendar year (Jan 1 → Dec 31)
 *    of the selected date. Each year resets on Jan 1, so a January
 *    practice day starts the new year with an empty baseline that
 *    fills in as data accumulates.
 *  - Game-type baselines have one extra rule: they are suppressed
 *    when the selected date is in Jan–July (out of the competitive
 *    Aug–Dec season). Game avg "shouldn't display before the season
 *    starts in August"; other practice-type avgs (Helmets, Full Pads,
 *    Practice, etc.) display year-round so spring training has a
 *    benchmark to compare against.
 *  - The selected day (or selected range, in range mode) is excluded
 *    from its own baseline so the % reads as "today vs the rest of
 *    the year's same-title days" rather than vs a self-inflated mean.
 *
 * Why per-day-then-mean instead of a flat row mean: a single day can
 * have multiple drill rows (Pre-Game + Q1..Q4 on a Game, individual
 * drills on a Practice). Aggregating each date into one daily value
 * first using the metric's kind (sum / max / avg), then averaging
 * across days, keeps the baseline at "one game/practice's worth" —
 * flat-averaging the raw rows would let a multi-drill day pull the
 * mean off whenever the export shape varies.
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
  /**
   * Secondary value rendered in the "7D Avg" / "Total" column:
   *  - Single-day mode: rolling 7-day mean (per-day rollup, then mean
   *    across days) inclusive of currentDate. Matches Brian's
   *    AVERAGEIFS(date<=Q4 AND date>=Q4-7) Excel formula.
   *  - Range mode:      aggregate across the picked window, using the
   *    metric's aggregation kind (sum/max/mean).
   */
  runningTotal: number | null;
  /**
   * Comparison baseline for the % column — the player's mean across
   * same-practice-type days within the selected date's calendar year
   * (excluding the selected day/range so today doesn't average against
   * itself). The matching practice type comes from the card-level
   * `baselineTitle`. Null when:
   *   - No practice type could be resolved for the day (e.g. the player
   *     has no rows on the selected date and no chip filter),
   *   - The resolved title is "Game" but the selected date is in
   *     Jan–July (game avg is suppressed before the season starts),
   *   - Or the player has no rows of the matching title in this year.
   */
  baselineMean: number | null;
  /**
   * Percent of the player's same-practice-type season baseline:
   *   - Single-day mode: daily ÷ baselineMean × 100
   *   - Range mode: per-day mean across the picked window ÷ baselineMean
   *     × 100 (range numerator is normalized to a per-day basis so it
   *     stays comparable to the per-day baseline regardless of how
   *     many days the window spans).
   * Null when the baseline is 0/missing or the metric is suppressed.
   */
  pctOfBaseline: number | null;
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
  /**
   * Practice type that drives the baseline column header for this
   * player — "Helmets", "Full Pads", "Game", etc. Renders as
   * "{baselineTitle} Avg". Null when no practice type could be
   * resolved (no rows on the selected day with no chip filter set), or
   * when the resolved title would have been "Game" but the selected
   * date is in Jan–July (game avg is suppressed off-season). The
   * column then renders a generic "Avg" header with empty cells.
   */
  baselineTitle: string | null;
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
  high_speed_running?: number | null;
  distance_zone_4_6?: number | null;
  [key: string]: number | string | null | undefined;
};

/** Utility: coerce DB value to number or null (StatSports sometimes returns NaN). */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function metricNum(row: GpsRow, column: string): number | null {
  if (column === "high_speed_running") return getNormalizedHsr(row);
  return num(row[column]);
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
 * Calendar-year window for an ISO date — the baseline scope used by
 * the % column. Each calendar year is one "season" for baselining
 * purposes: a January practice day starts a new year with an empty
 * baseline that fills in over the next 11 months, then resets again
 * on Jan 1.
 *
 * Game-day baselines have one extra rule applied at the call site
 * (not here) — they are suppressed when the selected date is in
 * Jan–July, since coach Sutton wants the game avg to disappear during
 * the off-season. This helper always returns the full calendar year so
 * that non-game practice averages (Helmets, Full Pads, etc.) remain
 * visible year-round; the suppression is just a render-time gate.
 *
 * Returns null only on malformed input (defensive — `currentDate` is
 * already validated to be a real session date upstream).
 */
function getSeasonWindow(date: string): { start: string; end: string } | null {
  if (!date || date.length < 4) return null;
  // Slice instead of new Date(...) to avoid TZ surprises on YYYY-MM-DD strings.
  const year = parseInt(date.slice(0, 4), 10);
  if (!Number.isFinite(year)) return null;
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/**
 * Returns true when the selected date falls inside the competitive
 * football season (Aug–Dec). Used to suppress the Game-day baseline
 * during the off-season per coach Sutton: the game avg should not
 * display before the season starts in August.
 */
function isInGameSeasonMonth(date: string): boolean {
  if (!date || date.length < 7) return false;
  const month = parseInt(date.slice(5, 7), 10);
  return Number.isFinite(month) && month >= 8 && month <= 12;
}

/**
 * Compute a season-scoped baseline for a single (player, practice type,
 * metric): filter to rows where the player's `session_title` matches
 * `title`, drop any date that falls inside the [excludeStart, excludeEnd]
 * inclusive window, bucket by date, aggregate each day with the metric's
 * kind (sum / max / avg), then take the mean across those per-day values.
 *
 * Excluding the selected window keeps today's value (or the picked range)
 * out of its own denominator, so the % reads as "today vs the rest of
 * the season's same-title days" instead of self-inflating toward 100%.
 *
 * Bucketing by date matters for sum metrics: a single Game day with
 * Pre-Game + Q1..Q4 drill rows must count as ONE game's worth of
 * volume, not five. Flat-averaging the raw rows would understate the
 * baseline by a factor of (#drill rows per game).
 *
 * Caller is responsible for filtering `rows` to the season window —
 * this helper does not re-check date bounds beyond the exclusion span.
 */
function computePracticeTypeBaseline(
  rows: GpsRow[],
  playerId: string,
  title: string,
  column: string,
  kind: AggregationKind,
  excludeStart: string,
  excludeEnd: string
): number | null {
  const buckets = new Map<string, Array<number | null>>();
  for (const row of rows) {
    if (row.player_id !== playerId) continue;
    if ((row.session_title ?? "").trim() !== title) continue;
    if (row.session_date >= excludeStart && row.session_date <= excludeEnd) continue;
    if (!buckets.has(row.session_date)) buckets.set(row.session_date, []);
    buckets.get(row.session_date)!.push(metricNum(row, column));
  }

  const dailyValues: number[] = [];
  for (const values of Array.from(buckets.values())) {
    const agg = aggregate(values, kind);
    if (agg != null) dailyValues.push(agg);
  }
  if (dailyValues.length === 0) return null;
  return dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
}

/**
 * Compute a per-day mean across the supplied rows: bucket by date,
 * aggregate each bucket using the metric's kind, then mean those
 * per-day values. Used as the % numerator in range mode so a 7-day
 * window (or any range) is normalized to a "per-day basis" before
 * being compared against the per-game-day baseline. Without this
 * normalization a multi-day sum metric (e.g. weekly distance) would
 * blow up to 500 %+ even on routine weeks because we'd be comparing
 * a week's total to a single game.
 */
function computePerDayMean(
  rows: GpsRow[],
  column: string,
  kind: AggregationKind
): number | null {
  const buckets = new Map<string, Array<number | null>>();
  for (const row of rows) {
    if (!buckets.has(row.session_date)) buckets.set(row.session_date, []);
    buckets.get(row.session_date)!.push(metricNum(row, column));
  }
  const dailyValues: number[] = [];
  for (const values of Array.from(buckets.values())) {
    const agg = aggregate(values, kind);
    if (agg != null) dailyValues.push(agg);
  }
  if (dailyValues.length === 0) return null;
  return dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
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
  // We used to scope this to `drill_title = 'Entire Session'` because the
  // StatSports raw export includes both per-drill rows AND a session
  // rollup row. The W&M dashboard CSV breaks that assumption: many Game
  // days are exported only as drill segments (Pre-Game, 1st Quarter,
  // etc.) with NO Entire Session row, so filtering by that title made
  // those Saturdays invisible in the calendar. We now accept any row,
  // since this query just feeds the unique-dates and unique-titles
  // sets — no aggregation, so duplicates per date are harmless.
  const dateRows = await fetchAllRows<{ session_date: string; session_title: string | null }>(() =>
    supabase
      .from("gps_sessions")
      .select("session_date, session_title")
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

  // Resolve the calendar-year window for the selected day. Drives the
  // % baseline scope: the player's mean across same-title days within
  // this window, excluding the selected day/range. Always returns a
  // window — game-avg suppression for Jan–July is handled per-card
  // when resolving baselineTitle, not here.
  const seasonWindow = getSeasonWindow(currentDate);
  // Cap the season fetch at endDate so the baseline never sees future
  // sessions; the per-player computation also explicitly excludes
  // [startDate, endDate] so the day(s) being scored stay out of their
  // own denominator.
  const seasonFetchEnd =
    seasonWindow != null && seasonWindow.end < endDate ? seasonWindow.end : endDate;
  // Whether the selected month is in the competitive Aug–Dec window —
  // gates Game-type baselines so off-season cards don't show stale
  // game numbers. Non-game practice baselines are unaffected.
  const inGameSeason = isInGameSeasonMonth(currentDate);

  const metricColumns = new Set(SESSION_REPORT_METRICS.map((m) => m.column));
  metricColumns.add("distance_zone_4_6");
  const columnList = Array.from(metricColumns).join(", ");

  const [
    { data: playersRows },
    { data: injuriesRows },
    historyRows,
    seasonRows,
  ] = await Promise.all([
    supabase.from("players").select("id, name, position"),
    supabase
      .from("injuries")
      .select("player_id, status, expected_return, updated_at")
      .order("updated_at", { ascending: false }),
    // We pull `drill_title` too because the W&M dashboard CSV's Game
    // days frequently lack an "Entire Session" rollup row — only drill
    // segments. Per-(player, date) dedupe below picks the summary row
    // when present, otherwise falls back to the drill rows. This keeps
    // StatSports raw exports (which always include Entire Session)
    // unaffected while making W&M Game days visible.
    fetchAllRows<Record<string, unknown>>(() =>
      supabase
        .from("gps_sessions")
        .select(`player_id, session_date, session_title, drill_title, ${columnList}`)
        .gte("session_date", baselineWindowStart)
        .lte("session_date", currentDate)
    ),
    // Year-scoped fetch for the % baseline. Pulls every session in
    // the calendar year of the selected date (capped at the end of
    // the active window so we never see future data) across all
    // session_titles, so the per-player loop below can derive
    // whichever practice-type baseline matches today's session
    // (Helmets / Full Pads / Game / etc.). When `seasonWindow` is null
    // (malformed date — defensive) we skip the round trip entirely.
    seasonWindow
      ? fetchAllRows<Record<string, unknown>>(() =>
          supabase
            .from("gps_sessions")
            .select(`player_id, session_date, session_title, drill_title, ${columnList}`)
            .gte("session_date", seasonWindow.start)
            .lte("session_date", seasonFetchEnd)
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  // Supabase's typed client can't validate dynamically interpolated
  // column lists, so cast through `unknown` to keep the runtime shape
  // while shedding the compile-time ParserError type.
  const historyRaw = (historyRows as unknown) as Array<
    GpsRow & { drill_title: string | null }
  >;

  // Per-(player, date) dedupe: when an "Entire Session" summary row
  // exists for a day, use only that row (it's the StatSports rollup
  // and would double-count if summed alongside the drill rows that
  // make it up). When no summary exists — typical of W&M Game days —
  // keep all drill rows so the metric `aggregate` calls (sum / max /
  // mean per metric) compute the day total from the parts.
  const historyByKey = new Map<string, typeof historyRaw>();
  for (const row of historyRaw) {
    const key = `${row.player_id}|${row.session_date}`;
    const arr = historyByKey.get(key);
    if (arr) arr.push(row);
    else historyByKey.set(key, [row]);
  }
  const historyAll: GpsRow[] = [];
  for (const rows of Array.from(historyByKey.values())) {
    const summaryRows = rows.filter(
      (r) => (r.drill_title ?? "").trim() === "Entire Session"
    );
    historyAll.push(...(summaryRows.length > 0 ? summaryRows : rows));
  }
  // Apply the session-title filter once up front — every downstream
  // aggregation (daily, running total, sparkline) then automatically
  // scopes to the selected session type. The season baseline below is
  // intentionally NOT scoped by this filter; the % column matches each
  // player's *day-of* practice type (or, if a chip filter is active,
  // that filter's title), regardless of what's being shown above.
  const history = currentSessionTitle
    ? historyAll.filter((r) => normalizedTitle(r.session_title) === currentSessionTitle)
    : historyAll;
  const players = (playersRows ?? []) as Array<{ id: string; name: string; position: string | null }>;

  // Same per-(player, date) dedupe applied to the season-row pool used
  // by the baseline. Without this, a Game day exported as 5 drill
  // segments (Pre-Game + Q1..Q4) would be treated as 5 separate
  // "days" by `computePracticeTypeBaseline`, sum metrics would
  // aggregate per segment, and the per-day mean would be off by the
  // drill-row count. Preferring the "Entire Session" rollup when
  // present keeps StatSports raw exports tight; falling back to drill
  // rows keeps the W&M dashboard CSV days countable.
  const seasonRaw = (seasonRows as unknown) as Array<GpsRow & { drill_title: string | null }>;
  const seasonByKey = new Map<string, typeof seasonRaw>();
  for (const row of seasonRaw) {
    const key = `${row.player_id}|${row.session_date}`;
    const arr = seasonByKey.get(key);
    if (arr) arr.push(row);
    else seasonByKey.set(key, [row]);
  }
  const seasonHistory: GpsRow[] = [];
  for (const rows of Array.from(seasonByKey.values())) {
    const summaryRows = rows.filter(
      (r) => (r.drill_title ?? "").trim() === "Entire Session"
    );
    seasonHistory.push(...(summaryRows.length > 0 ? summaryRows : rows));
  }

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

    // Single-day mode rows: today's value (Daily) plus the rolling
    // 7-day window (computed below in the cells map). Range mode
    // collapses to one rollup across the picked window.
    const todayRows = playerHistory.filter((r) => r.session_date === currentDate);
    const rangeRows = playerHistory.filter(
      (r) => r.session_date >= startDate && r.session_date <= endDate
    );

    // 7-day rolling window for single-day mode, matching Brian's
    // Excel formula:
    //   =AVERAGEIFS(metric, date<=Q4, date>=Q4-7, player=$E$4)
    // i.e. an inclusive [currentDate − 7, currentDate] = 8-day window
    // with no session-title or drill-title filter beyond whatever
    // chip filter the user has active (which propagates here via
    // `playerHistory`). Computed per metric below as the *mean of
    // daily aggregates* — we roll up multiple drill rows per day
    // first, then mean across days, so a Game-day with 3 drill rows
    // doesn't outweigh a Helmets day with 1.
    const sevenDayWindowStart: string = subtractDays(currentDate, 7);
    const sevenDayRows: GpsRow[] = playerHistory.filter(
      (r) => r.session_date >= sevenDayWindowStart && r.session_date <= currentDate
    );

    // Resolve the practice type that drives this player's % baseline:
    //   1. URL chip filter wins when set ("show me Helmets days only" →
    //      compare to year's Helmets avg, even if today happens to be
    //      a Full Pads day).
    //   2. Else, single-day mode uses the player's own session_title
    //      for the selected date — Helmets day → Helmets avg, Game day
    //      → Game avg, etc.
    //   3. Else (range mode without a filter), default to "Game" as a
    //      stable cross-week benchmark since the range can mix titles.
    // Game-type baselines are then suppressed off-season (Jan–July)
    // per coach Sutton: the game avg shouldn't display before the
    // season starts in August. Non-game practice baselines (Helmets,
    // Full Pads, etc.) display year-round so spring training has a
    // benchmark to compare against.
    const playerTitleToday: string | null =
      mode === "single" && todayRows.length > 0
        ? normalizedTitle(
            todayRows.find((r) => r.session_title)?.session_title ?? null
          )
        : null;
    const resolvedTitle: string | null = seasonWindow
      ? currentSessionTitle ??
        playerTitleToday ??
        (mode === "range" ? "Game" : null)
      : null;
    const baselineTitle: string | null =
      resolvedTitle === "Game" && !inGameSeason ? null : resolvedTitle;

    const cells: SessionReportCell[] = SESSION_REPORT_METRICS.map((metric) => {
      const daily =
        mode === "single"
          ? aggregate(todayRows.map((r) => metricNum(r, metric.column)), metric.aggregation)
          : null;

      // Single-day "Running" column → 7-day rolling MEAN per Brian's
      // formula. Range mode keeps the rollup-across-window semantics
      // (header relabels to "Total" in the renderer).
      let runningTotal: number | null;
      if (mode === "single") {
        const dayBuckets = new Map<string, Array<number | null>>();
        for (const row of sevenDayRows) {
          if (!dayBuckets.has(row.session_date)) {
            dayBuckets.set(row.session_date, []);
          }
          dayBuckets.get(row.session_date)!.push(metricNum(row, metric.column));
        }
        const dailyValues: number[] = [];
        for (const vals of Array.from(dayBuckets.values())) {
          const agg = aggregate(vals, metric.aggregation);
          if (agg != null) dailyValues.push(agg);
        }
        runningTotal = dailyValues.length === 0
          ? null
          : dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
      } else {
        runningTotal = aggregate(
          rangeRows.map((r) => metricNum(r, metric.column)),
          metric.aggregation
        );
      }
      // Baseline = the player's mean across same-title days within the
      // current season window, excluding the selected day/range so
      // today doesn't average against itself. Returns null when no
      // baselineTitle could be resolved (off-season or no day rows) or
      // the player has no rows of that title in this season — the %
      // column then renders as "—".
      const baselineMean = baselineTitle
        ? computePracticeTypeBaseline(
            seasonHistory,
            player.id,
            baselineTitle,
            metric.column,
            metric.aggregation,
            startDate,
            endDate
          )
        : null;

      // % numerator:
      //   - single-day → today's value (one day's aggregate, directly
      //     comparable to the per-day baseline).
      //   - range      → per-day mean across the picked window. We
      //     can't reuse `runningTotal` for sum metrics in range mode
      //     because it sums multiple days, which would balloon the
      //     ratio against a per-day denominator. Computing a per-day
      //     mean keeps the comparison apples-to-apples for every
      //     aggregation kind.
      const pctNumerator =
        mode === "single"
          ? daily
          : computePerDayMean(rangeRows, metric.column, metric.aggregation);
      const pctOfBaseline =
        !metric.suppressPercent &&
        pctNumerator != null &&
        baselineMean != null &&
        baselineMean !== 0
          ? (pctNumerator / baselineMean) * 100
          : null;

      return {
        key: metric.key,
        label: metric.label,
        unit: metric.unit,
        decimals: metric.decimals,
        daily,
        runningTotal,
        baselineMean,
        pctOfBaseline,
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
      baselineTitle,
    });
  }

  // Managed players are pulled out regardless of side so intentionally
  // reduced loads don't skew the coach's read of who trained hard today.
  const injuredRehab = cards.filter((c) => c.status !== "cleared");
  const activeCards = cards.filter((c) => c.status === "cleared");

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
