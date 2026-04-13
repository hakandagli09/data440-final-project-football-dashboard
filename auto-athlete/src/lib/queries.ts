/**
 * Supabase query functions for the dashboard.
 *
 * All aggregation (avg, max, sum) is done in TypeScript since we're
 * working with ~30-50 rows per session — no need for Supabase RPCs.
 */

import { supabaseServer as supabase } from "./supabase-server";
import { subtractDays } from "./date-utils";
import { getPositionGroup } from "./position-groups";

// ─── Types ────────────────────────────────────────────────────────────────

export interface KpiData {
  title: string;
  value: string;
  unit: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  accentColor: string;
  icon: "distance" | "speed" | "hsr" | "load" | "sprint" | "metabolic";
  sparklineData: number[];
}

export interface SpeedZoneData {
  zone: string;
  label: string;
  pct: number;
  color: string;
}

export interface PlayerRow {
  rank: number;
  name: string;
  pos: string;
  dist: string;
  spd: string;
  load: string;
}

export interface SessionInfoItem {
  label: string;
  value: string;
}

export interface AcwrResult {
  ratio: number | null;
  label: string;
  riskyPlayers: number;
}

export interface DashboardData {
  kpis: KpiData[];
  speedZones: SpeedZoneData[];
  players: PlayerRow[];
  sessionInfo: SessionInfoItem[];
  acwr: AcwrResult;
  alertCount: number;
  sessionTitle: string;
  currentDate: string;
  availableDates: string[];
}

type GroupFilter = "skills_mids" | "bigs";

export type ChatMetric =
  | "total_distance"
  | "max_speed"
  | "high_speed_running"
  | "dynamic_stress_load"
  | "distance_zone_6"
  | "collision_load"
  | "accelerations_zone_4_6"
  | "decelerations_zone_4_6"
  | "hml_efforts";

export interface LatestSessionSummary {
  date: string;
  sessionTitle: string;
  playerCount: number;
  sessionInfo: SessionInfoItem[];
  headlineMetrics: Array<{
    label: string;
    value: string;
    unit: string;
  }>;
  alertCount: number;
}

export interface TopPlayersMetricResult {
  metric: ChatMetric;
  label: string;
  unit: string;
  date: string;
  positionGroup: GroupFilter | "all";
  totalPlayersConsidered: number;
  leaders: Array<{
    rank: number;
    playerId: string;
    name: string;
    position: string;
    value: number;
  }>;
}

export interface TeamMetricSummaryResult {
  metric: ChatMetric;
  label: string;
  unit: string;
  startDate: string;
  endDate: string;
  positionGroup: GroupFilter | "all";
  sessionCount: number;
  playerDayCount: number;
  total: number;
  averagePerPlayerDay: number;
  maxPlayerDayValue: number;
  minPlayerDayValue: number;
}

type MetricRow = Record<string, unknown> & {
  player_id: string;
  session_date: string;
  session_title?: string | null;
  total_distance?: number | null;
  max_speed?: number | null;
  high_speed_running?: number | null;
  dynamic_stress_load?: number | null;
  distance_zone_6?: number | null;
  collision_load?: number | null;
  accelerations_zone_4_6?: number | null;
  decelerations_zone_4_6?: number | null;
  hml_efforts?: number | null;
  players?:
    | { name: string; position: string | null }
    | Array<{ name: string; position: string | null }>
    | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function formatNum(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getMetricMeta(metric: ChatMetric): { label: string; unit: string } {
  switch (metric) {
    case "total_distance":
      return { label: "Total Distance", unit: "m" };
    case "max_speed":
      return { label: "Max Speed", unit: "m/s" };
    case "high_speed_running":
      return { label: "HSR", unit: "m" };
    case "dynamic_stress_load":
      return { label: "Dynamic Stress Load", unit: "AU" };
    case "distance_zone_6":
      return { label: "Zone 6 Sprint Distance", unit: "m" };
    case "collision_load":
      return { label: "Collision Load", unit: "AU" };
    case "accelerations_zone_4_6":
      return { label: "Zone 4-6 Accelerations", unit: "count" };
    case "decelerations_zone_4_6":
      return { label: "Zone 4-6 Decelerations", unit: "count" };
    case "hml_efforts":
      return { label: "Explosive Efforts", unit: "count" };
  }
}

function getMetricValue(row: MetricRow, metric: ChatMetric): number {
  switch (metric) {
    case "total_distance":
      return row.total_distance ?? 0;
    case "max_speed":
      return row.max_speed ?? 0;
    case "high_speed_running":
      return row.high_speed_running ?? 0;
    case "dynamic_stress_load":
      return row.dynamic_stress_load ?? 0;
    case "distance_zone_6":
      return row.distance_zone_6 ?? 0;
    case "collision_load":
      return row.collision_load ?? 0;
    case "accelerations_zone_4_6":
      return row.accelerations_zone_4_6 ?? 0;
    case "decelerations_zone_4_6":
      return row.decelerations_zone_4_6 ?? 0;
    case "hml_efforts":
      return row.hml_efforts ?? 0;
  }
}

function reduceMetricValue(currentValue: number, nextValue: number, metric: ChatMetric): number {
  return metric === "max_speed" ? Math.max(currentValue, nextValue) : currentValue + nextValue;
}

function matchesPositionGroup(
  position: string | null | undefined,
  group?: GroupFilter
): boolean {
  if (!group) return true;
  return getPositionGroup(position) === group;
}

function getMetricRowPlayer(
  row: MetricRow
): { name: string; position: string | null } | null {
  if (!row.players) return null;
  return Array.isArray(row.players) ? row.players[0] ?? null : row.players;
}

async function resolveDateRange(
  startDate?: string,
  endDate?: string
): Promise<{ startDate: string; endDate: string }> {
  const availableDates = await getAvailableSessionDates();
  const fallbackDate = availableDates[0] ?? "";
  const resolvedStart = startDate ?? endDate ?? fallbackDate;
  const resolvedEnd = endDate ?? startDate ?? fallbackDate;

  if (!resolvedStart || !resolvedEnd) {
    return { startDate: "", endDate: "" };
  }

  return resolvedStart <= resolvedEnd
    ? { startDate: resolvedStart, endDate: resolvedEnd }
    : { startDate: resolvedEnd, endDate: resolvedStart };
}

async function getMetricRowsForWindow(startDate: string, endDate: string): Promise<MetricRow[]> {
  const { data, error } = await supabase
    .from("gps_sessions")
    .select(
      "player_id, session_date, session_title, total_distance, max_speed, high_speed_running, dynamic_stress_load, distance_zone_6, collision_load, accelerations_zone_4_6, decelerations_zone_4_6, hml_efforts, players(name, position)"
    )
    .gte("session_date", startDate)
    .lte("session_date", endDate);

  if (error) {
    console.error("[getMetricRowsForWindow] Supabase error:", error.message, error);
    return [];
  }

  return (data ?? []) as MetricRow[];
}

function pctChange(current: number, previous: number): { change: string; changeType: "positive" | "negative" | "neutral" } {
  if (previous === 0) return { change: "---", changeType: "neutral" };
  const pct = ((current - previous) / previous) * 100;
  const abs = Math.abs(pct);
  if (abs < 0.5) return { change: "0%", changeType: "neutral" };
  return {
    change: `${abs.toFixed(0)}%`,
    changeType: pct > 0 ? "positive" : "negative",
  };
}

// subtractDays imported from date-utils.ts

// ─── Queries ──────────────────────────────────────────────────────────────

/** Get all distinct session dates, most recent first. */
export async function getAvailableSessionDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from("gps_sessions")
    .select("session_date")
    .order("session_date", { ascending: false });

  if (error) {
    console.error("[getAvailableSessionDates] Supabase error:", error.message, error);
    return [];
  }

  if (!data) return [];
  const unique = Array.from(new Set(data.map((r) => r.session_date as string)));
  return unique;
}

/** Get raw GPS rows for a specific session date. */
async function getSessionGpsRows(date: string) {
  const { data, error } = await supabase
    .from("gps_sessions")
    .select("*, players(name, position)")
    .eq("session_date", date);

  if (error) {
    console.error("[getSessionGpsRows] Supabase error:", error.message, error);
    return [];
  }

  return data ?? [];
}

/** Get raw GPS rows for a previous session date (for change %). */
async function getPreviousSessionRows(currentDate: string) {
  const dates = await getAvailableSessionDates();
  const currentIdx = dates.indexOf(currentDate);
  if (currentIdx < 0 || currentIdx >= dates.length - 1) return null;
  const prevDate = dates[currentIdx + 1];
  const rows = await getSessionGpsRows(prevDate);
  return rows.length > 0 ? rows : null;
}

/** Aggregate session rows into KPI values. */
function aggregateKpis(rows: Record<string, unknown>[]) {
  const vals = (col: string) =>
    rows.map((r) => r[col] as number | null).filter((v): v is number => v != null);

  return {
    totalDistance: avg(vals("total_distance")),
    topSpeed: Math.max(...(vals("max_speed").length > 0 ? vals("max_speed") : [0])),
    hsr: avg(vals("high_speed_running")),
    dsl: avg(vals("dynamic_stress_load")),
    sprintDist: avg(vals("distance_zone_5").map((v, i) => v + (vals("distance_zone_6")[i] ?? 0))),
    metabolicPower: avg(vals("total_metabolic_power")),
  };
}

/** Get sparkline data: team averages for the last N sessions. */
async function getSparklineHistory(
  currentDate: string,
  count = 10
): Promise<Record<string, number[]>> {
  const dates = await getAvailableSessionDates();
  const currentIdx = dates.indexOf(currentDate);
  const sparkDates = dates.slice(
    Math.max(0, currentIdx),
    Math.min(dates.length, currentIdx + count)
  ).reverse(); // oldest → newest

  const sparklines: Record<string, number[]> = {
    totalDistance: [],
    topSpeed: [],
    hsr: [],
    dsl: [],
    sprintDist: [],
    metabolicPower: [],
  };

  for (const d of sparkDates) {
    const { data } = await supabase
      .from("gps_sessions")
      .select("total_distance, max_speed, high_speed_running, dynamic_stress_load, distance_zone_5, distance_zone_6, total_metabolic_power")
      .eq("session_date", d);

    if (!data || data.length === 0) continue;

    const vals = (col: string) =>
      data.map((r) => (r as Record<string, unknown>)[col] as number | null).filter((v): v is number => v != null);

    sparklines.totalDistance.push(avg(vals("total_distance")));
    sparklines.topSpeed.push(Math.max(...(vals("max_speed").length > 0 ? vals("max_speed") : [0])));
    sparklines.hsr.push(avg(vals("high_speed_running")));
    sparklines.dsl.push(avg(vals("dynamic_stress_load")));
    const z5 = vals("distance_zone_5");
    const z6 = vals("distance_zone_6");
    sparklines.sprintDist.push(avg(z5.map((v, i) => v + (z6[i] ?? 0))));
    sparklines.metabolicPower.push(avg(vals("total_metabolic_power")));
  }

  return sparklines;
}

/** Compute ACWR (7-day acute / 28-day chronic) using DSL. */
async function computeAcwr(date: string): Promise<AcwrResult> {
  const windowStart = subtractDays(date, 28);
  const acuteStart = subtractDays(date, 7);

  const { data } = await supabase
    .from("gps_sessions")
    .select("session_date, player_id, dynamic_stress_load")
    .gte("session_date", windowStart)
    .lte("session_date", date);

  if (!data || data.length === 0) {
    return { ratio: null, label: "No data", riskyPlayers: 0 };
  }

  // Check if we have at least 2 weeks of data
  const uniqueDates = new Set(data.map((r) => r.session_date));
  if (uniqueDates.size < 4) {
    return { ratio: null, label: "Insufficient data", riskyPlayers: 0 };
  }

  // Team-level ACWR
  const acuteRows = data.filter((r) => r.session_date >= acuteStart);
  const chronicRows = data;

  const acuteAvg = avg(
    acuteRows.map((r) => r.dynamic_stress_load as number).filter((v) => v != null)
  );
  const chronicAvg = avg(
    chronicRows.map((r) => r.dynamic_stress_load as number).filter((v) => v != null)
  );

  const ratio = chronicAvg > 0 ? acuteAvg / chronicAvg : null;

  // Per-player ACWR for alert count
  const playerIds = Array.from(new Set(data.map((r) => r.player_id)));
  let riskyPlayers = 0;

  for (const pid of playerIds) {
    const playerAcute = acuteRows
      .filter((r) => r.player_id === pid)
      .map((r) => r.dynamic_stress_load as number)
      .filter((v) => v != null);
    const playerChronic = chronicRows
      .filter((r) => r.player_id === pid)
      .map((r) => r.dynamic_stress_load as number)
      .filter((v) => v != null);

    if (playerChronic.length > 0 && playerAcute.length > 0) {
      const playerRatio = avg(playerAcute) / avg(playerChronic);
      if (playerRatio > 1.5) riskyPlayers++;
    }
  }

  let label = "Optimal";
  if (ratio !== null) {
    if (ratio > 1.5) label = "High Risk";
    else if (ratio > 1.3) label = "Caution";
  }

  return { ratio, label, riskyPlayers };
}

// ─── Main Dashboard Query ─────────────────────────────────────────────────

/** Fetch all data needed for the dashboard in one call. */
export async function getDashboardData(date?: string): Promise<DashboardData> {
  // Get available dates
  const availableDates = await getAvailableSessionDates();

  // Determine current date
  const currentDate = date && availableDates.includes(date)
    ? date
    : availableDates[0] ?? "";

  // Empty state
  if (!currentDate) {
    return {
      kpis: [],
      speedZones: [],
      players: [],
      sessionInfo: [],
      acwr: { ratio: null, label: "No data", riskyPlayers: 0 },
      alertCount: 0,
      sessionTitle: "",
      currentDate: "",
      availableDates: [],
    };
  }

  // Fetch current session data + previous session + sparklines + ACWR in parallel
  const [rows, prevRows, sparklines, acwr] = await Promise.all([
    getSessionGpsRows(currentDate),
    getPreviousSessionRows(currentDate),
    getSparklineHistory(currentDate),
    computeAcwr(currentDate),
  ]);

  // ── KPIs ──
  const current = aggregateKpis(rows);
  const previous = prevRows ? aggregateKpis(prevRows) : null;

  const kpiDefs: {
    title: string;
    key: keyof ReturnType<typeof aggregateKpis>;
    unit: string;
    decimals: number;
    accent: string;
    icon: KpiData["icon"];
  }[] = [
    { title: "Total Distance", key: "totalDistance", unit: "m", decimals: 0, accent: "aa-accent", icon: "distance" },
    { title: "Top Speed", key: "topSpeed", unit: "m/s", decimals: 1, accent: "aa-warm", icon: "speed" },
    { title: "HSR Distance", key: "hsr", unit: "m", decimals: 0, accent: "aa-accent", icon: "hsr" },
    { title: "Player Load", key: "dsl", unit: "AU", decimals: 0, accent: "aa-accent", icon: "load" },
    { title: "Sprint Distance", key: "sprintDist", unit: "m", decimals: 0, accent: "aa-warm", icon: "sprint" },
    { title: "Metabolic Power", key: "metabolicPower", unit: "W", decimals: 0, accent: "aa-accent", icon: "metabolic" },
  ];

  const kpis: KpiData[] = kpiDefs.map((def) => {
    const value = current[def.key];
    const { change, changeType } = previous
      ? pctChange(value, previous[def.key])
      : { change: "---", changeType: "neutral" as const };

    const sparklineKey = def.key === "totalDistance" ? "totalDistance"
      : def.key === "topSpeed" ? "topSpeed"
      : def.key === "hsr" ? "hsr"
      : def.key === "dsl" ? "dsl"
      : def.key === "sprintDist" ? "sprintDist"
      : "metabolicPower";

    return {
      title: def.title,
      value: formatNum(value, def.decimals),
      unit: def.unit,
      change,
      changeType,
      accentColor: def.accent,
      icon: def.icon,
      sparklineData: sparklines[sparklineKey] ?? [],
    };
  });

  // ── Speed Zones ──
  const zoneColumns = ["distance_zone_1", "distance_zone_2", "distance_zone_3", "distance_zone_4", "distance_zone_5", "distance_zone_6"] as const;
  const zoneSums = zoneColumns.map((col) =>
    sum(rows.map((r) => (r[col] as number) ?? 0))
  );
  const zoneTotal = sum(zoneSums);

  const zoneConfig = [
    { zone: "Zone 6", label: "> 7.0 m/s", color: "bg-aa-danger" },
    { zone: "Zone 5", label: "5.5–7.0", color: "bg-aa-warm" },
    { zone: "Zone 4", label: "4.0–5.5", color: "bg-aa-warning" },
    { zone: "Zone 3", label: "2.5–4.0", color: "bg-aa-accent" },
    { zone: "Zone 2", label: "1.5–2.5", color: "bg-aa-text-secondary" },
    { zone: "Zone 1", label: "< 1.5", color: "bg-aa-text-dim" },
  ];

  const speedZones: SpeedZoneData[] = zoneConfig.map((cfg, i) => ({
    ...cfg,
    pct: zoneTotal > 0 ? Math.round((zoneSums[5 - i] / zoneTotal) * 100) : 0,
  }));

  // ── Player Leaderboard ──
  type GpsRow = Record<string, unknown> & {
    players: { name: string; position: string } | null;
  };
  const typedRows = rows as GpsRow[];

  const playerMap = new Map<string, { name: string; pos: string; dist: number; spd: number; load: number }>();

  for (const row of typedRows) {
    const pid = row.player_id as string;
    const existing = playerMap.get(pid);
    const dist = (row.total_distance as number) ?? 0;
    const spd = (row.max_speed as number) ?? 0;
    const load = (row.dynamic_stress_load as number) ?? 0;

    if (existing) {
      existing.dist += dist;
      existing.spd = Math.max(existing.spd, spd);
      existing.load += load;
    } else {
      playerMap.set(pid, {
        name: row.players?.name ?? "Unknown",
        pos: row.players?.position ?? "—",
        dist,
        spd,
        load,
      });
    }
  }

  const players: PlayerRow[] = Array.from(playerMap.values())
    .sort((a, b) => b.dist - a.dist)
    .slice(0, 5)
    .map((p, i) => ({
      rank: i + 1,
      name: p.name,
      pos: p.pos,
      dist: formatNum(p.dist),
      spd: p.spd.toFixed(1),
      load: formatNum(p.load),
    }));

  // ── Session Info ──
  const sessionTitle = (rows[0]?.session_title as string) ?? "Session";
  const playerCount = new Set(rows.map((r) => r.player_id)).size;

  const startTimes = rows
    .map((r) => r.drill_start_time as string)
    .filter(Boolean)
    .sort();
  const endTimes = rows
    .map((r) => r.drill_end_time as string)
    .filter(Boolean)
    .sort();

  let duration = "—";
  if (startTimes.length > 0 && endTimes.length > 0) {
    const start = startTimes[0];
    const end = endTimes[endTimes.length - 1];
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins > 0) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      duration = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
  }

  const sessionInfo: SessionInfoItem[] = [
    { label: "Duration", value: duration },
    { label: "Players", value: `${playerCount} tracked` },
    { label: "GPS Fix", value: "18 Hz" },
  ];

  return {
    kpis,
    speedZones,
    players,
    sessionInfo,
    acwr,
    alertCount: acwr.riskyPlayers,
    sessionTitle,
    currentDate,
    availableDates,
  };
}

export async function getLatestSessionPlayerCount(date?: string): Promise<{
  date: string;
  playerCount: number;
  sessionTitle: string;
}> {
  const availableDates = await getAvailableSessionDates();
  const selectedDate = date && availableDates.includes(date) ? date : availableDates[0] ?? "";
  if (!selectedDate) {
    return {
      date: "",
      playerCount: 0,
      sessionTitle: "",
    };
  }

  const rows = (await getSessionGpsRows(selectedDate)) as MetricRow[];
  return {
    date: selectedDate,
    playerCount: new Set(rows.map((row) => row.player_id)).size,
    sessionTitle: (rows[0]?.session_title as string) ?? "Session",
  };
}

export async function getLatestSessionSummary(date?: string): Promise<LatestSessionSummary> {
  const dashboard = await getDashboardData(date);
  const playerCountInfo = await getLatestSessionPlayerCount(dashboard.currentDate);

  return {
    date: dashboard.currentDate,
    sessionTitle: dashboard.sessionTitle,
    playerCount: playerCountInfo.playerCount,
    sessionInfo: dashboard.sessionInfo,
    headlineMetrics: dashboard.kpis.slice(0, 4).map((kpi) => ({
      label: kpi.title,
      value: kpi.value,
      unit: kpi.unit,
    })),
    alertCount: dashboard.alertCount,
  };
}

export async function getTopPlayersByMetric(
  metric: ChatMetric,
  date?: string,
  limit: number = 5,
  positionGroup?: GroupFilter
): Promise<TopPlayersMetricResult> {
  const availableDates = await getAvailableSessionDates();
  const selectedDate = date && availableDates.includes(date) ? date : availableDates[0] ?? "";
  const { label, unit } = getMetricMeta(metric);
  if (!selectedDate) {
    return {
      metric,
      label,
      unit,
      date: "",
      positionGroup: positionGroup ?? "all",
      totalPlayersConsidered: 0,
      leaders: [],
    };
  }

  const rows = (await getSessionGpsRows(selectedDate)) as MetricRow[];
  const byPlayer = new Map<
    string,
    { playerId: string; name: string; position: string; value: number }
  >();

  for (const row of rows) {
    const player = getMetricRowPlayer(row);
    const position = player?.position ?? "—";
    if (!matchesPositionGroup(position, positionGroup)) continue;

    const currentValue = getMetricValue(row, metric);
    const existing = byPlayer.get(row.player_id);
    if (existing) {
      existing.value = reduceMetricValue(existing.value, currentValue, metric);
      continue;
    }

    byPlayer.set(row.player_id, {
      playerId: row.player_id,
      name: player?.name ?? "Unknown",
      position,
      value: currentValue,
    });
  }

  const safeLimit = Math.min(Math.max(limit, 1), 10);
  const leaders = Array.from(byPlayer.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, safeLimit)
    .map((player, index) => ({
      rank: index + 1,
      playerId: player.playerId,
      name: player.name,
      position: player.position,
      value: player.value,
    }));

  return {
    metric,
    label,
    unit,
    date: selectedDate,
    positionGroup: positionGroup ?? "all",
    totalPlayersConsidered: byPlayer.size,
    leaders,
  };
}

export async function getTeamMetricSummary(
  metric: ChatMetric,
  startDate?: string,
  endDate?: string,
  positionGroup?: GroupFilter
): Promise<TeamMetricSummaryResult> {
  const { startDate: resolvedStart, endDate: resolvedEnd } = await resolveDateRange(
    startDate,
    endDate
  );
  const { label, unit } = getMetricMeta(metric);
  if (!resolvedStart || !resolvedEnd) {
    return {
      metric,
      label,
      unit,
      startDate: "",
      endDate: "",
      positionGroup: positionGroup ?? "all",
      sessionCount: 0,
      playerDayCount: 0,
      total: 0,
      averagePerPlayerDay: 0,
      maxPlayerDayValue: 0,
      minPlayerDayValue: 0,
    };
  }

  const rows = await getMetricRowsForWindow(resolvedStart, resolvedEnd);
  const byPlayerDay = new Map<string, number>();
  const sessionDates = new Set<string>();

  for (const row of rows) {
    const player = getMetricRowPlayer(row);
    const position = player?.position ?? "—";
    if (!matchesPositionGroup(position, positionGroup)) continue;

    sessionDates.add(row.session_date);
    const key = `${row.player_id}:${row.session_date}`;
    const currentValue = getMetricValue(row, metric);
    const existingValue = byPlayerDay.get(key) ?? 0;
    byPlayerDay.set(key, reduceMetricValue(existingValue, currentValue, metric));
  }

  const values = Array.from(byPlayerDay.values());
  const total = sum(values);
  const playerDayCount = values.length;

  return {
    metric,
    label,
    unit,
    startDate: resolvedStart,
    endDate: resolvedEnd,
    positionGroup: positionGroup ?? "all",
    sessionCount: sessionDates.size,
    playerDayCount,
    total,
    averagePerPlayerDay: playerDayCount > 0 ? total / playerDayCount : 0,
    maxPlayerDayValue: values.length > 0 ? Math.max(...values) : 0,
    minPlayerDayValue: values.length > 0 ? Math.min(...values) : 0,
  };
}
