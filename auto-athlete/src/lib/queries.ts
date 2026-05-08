/**
 * Supabase query functions for the dashboard.
 *
 * All aggregation (avg, max, sum) is done in TypeScript since we're
 * working with ~30-50 rows per session — no need for Supabase RPCs.
 */

import { supabaseServer as supabase } from "./supabase-server";
import { subtractDays } from "./date-utils";
import { getPositionGroup } from "./position-groups";
import { fetchAllRows } from "./supabase-paginate";
import { getPlayersList } from "@/lib/player-queries";
import { getNormalizedHsr } from "@/lib/flagging";

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
  playerId: string;
  rank: number;
  name: string;
  pos: string;
  dist: string;
  spd: string;
  load: string;
  hsr?: string;
  sprint?: string;
  accelDecel?: string;
  explosive?: string;
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
  lowPlayers: PlayerRow[];
  positionGroups: PositionGroupSummary[];
  sprintExposure: SprintExposureSummary;
  sessionInfo: SessionInfoItem[];
  acwr: AcwrResult;
  alertCount: number;
  sessionTitle: string;
  currentDate: string;
  availableDates: string[];
}

export interface PositionGroupSummary {
  label: "Skills / Mids" | "Bigs" | "Other";
  playerCount: number;
  totalDistance: string;
  hsr: string;
  sprintDistance: string;
  accelDecel: string;
  dsl: string;
}

export interface SprintExposureSummary {
  totalPlayers: number;
  playersAt85: number;
  playersAt90: number;
  percentAt85: number;
  percentAt90: number;
  missing90: Array<{
    playerId: string;
    name: string;
    position: string;
    todayMaxSpeed: string;
    pctOfMax: string;
  }>;
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
  distance_zone_4_6?: number | null;
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
  // DB already stores imperial (yd, mph) for this team — unit labels match.
  switch (metric) {
    case "total_distance":
      return { label: "Total Distance", unit: "yd" };
    case "max_speed":
      return { label: "Max Speed", unit: "mph" };
    case "high_speed_running":
      return { label: "HSR", unit: "yd" };
    case "dynamic_stress_load":
      return { label: "Dynamic Stress Load", unit: "AU" };
    case "distance_zone_6":
      return { label: "Zone 6 Sprint Distance", unit: "yd" };
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
      return getNormalizedHsr(row);
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
  // Drill-level GPS data can hit thousands of rows for even a short
  // window (e.g. full-pad practices produce ~400 rows/day), so page
  // past PostgREST's 1000-row cap here too.
  try {
    const rows = await fetchAllRows<MetricRow>(() =>
      supabase
        .from("gps_sessions")
        .select(
          "player_id, session_date, session_title, total_distance, max_speed, high_speed_running, distance_zone_4_6, dynamic_stress_load, distance_zone_6, collision_load, accelerations_zone_4_6, decelerations_zone_4_6, hml_efforts, players(name, position)"
        )
        .gte("session_date", startDate)
        .lte("session_date", endDate)
    );
    return rows;
  } catch (err) {
    console.error("[getMetricRowsForWindow] Supabase error:", err);
    return [];
  }
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

type PlayerDayAggregate = {
  playerId: string;
  name: string;
  position: string;
  totalDistance: number;
  topSpeed: number;
  hsr: number;
  sprintDistance: number;
  dsl: number;
  accelDecel: number;
  explosiveEfforts: number;
};

function buildPlayerDayAggregates(rows: MetricRow[]): PlayerDayAggregate[] {
  const playerMap = new Map<string, PlayerDayAggregate>();

  for (const row of rows) {
    const player = getMetricRowPlayer(row);
    const existing = playerMap.get(row.player_id) ?? {
      playerId: row.player_id,
      name: player?.name ?? "Unknown",
      position: player?.position ?? "—",
      totalDistance: 0,
      topSpeed: 0,
      hsr: 0,
      sprintDistance: 0,
      dsl: 0,
      accelDecel: 0,
      explosiveEfforts: 0,
    };

    existing.totalDistance += row.total_distance ?? 0;
    existing.topSpeed = Math.max(existing.topSpeed, row.max_speed ?? 0);
    existing.hsr += getNormalizedHsr(row);
    existing.sprintDistance += row.distance_zone_6 ?? 0;
    existing.dsl += row.dynamic_stress_load ?? 0;
    existing.accelDecel += (row.accelerations_zone_4_6 ?? 0) + (row.decelerations_zone_4_6 ?? 0);
    existing.explosiveEfforts += row.hml_efforts ?? 0;

    playerMap.set(row.player_id, existing);
  }

  return Array.from(playerMap.values());
}

function aggregateKpisFromPlayers(players: PlayerDayAggregate[]) {
  return {
    totalDistance: sum(players.map((player) => player.totalDistance)),
    topSpeed: Math.max(...(players.length > 0 ? players.map((player) => player.topSpeed) : [0])),
    hsr: sum(players.map((player) => player.hsr)),
    sprintDist: sum(players.map((player) => player.sprintDistance)),
    accelDecel: sum(players.map((player) => player.accelDecel)),
    explosiveEfforts: sum(players.map((player) => player.explosiveEfforts)),
  };
}

function playerToRow(player: PlayerDayAggregate, rank: number): PlayerRow {
  return {
    playerId: player.playerId,
    rank,
    name: player.name,
    pos: player.position,
    dist: formatNum(player.totalDistance),
    spd: player.topSpeed.toFixed(1),
    load: formatNum(player.dsl),
    hsr: formatNum(player.hsr),
    sprint: formatNum(player.sprintDistance),
    accelDecel: formatNum(player.accelDecel),
    explosive: formatNum(player.explosiveEfforts),
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────

/**
 * Get all distinct session dates, most recent first.
 *
 * NOTE: We cannot rely on a single `.select().order()` call here —
 * PostgREST silently caps SELECT responses at 1000 rows, which on the
 * full `gps_sessions` table would drop every date older than the most
 * recent ~6 weeks. `fetchAllRows` pages past that cap.
 */
export async function getAvailableSessionDates(): Promise<string[]> {
  try {
    const rows = await fetchAllRows<{ session_date: string }>(() =>
      supabase
        .from("gps_sessions")
        .select("session_date")
        .order("session_date", { ascending: false })
    );
    const unique = Array.from(new Set(rows.map((r) => r.session_date)));
    return unique;
  } catch (err) {
    console.error("[getAvailableSessionDates] Supabase error:", err);
    return [];
  }
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
    sprintDist: [],
    accelDecel: [],
    explosiveEfforts: [],
  };

  for (const d of sparkDates) {
    const { data } = await supabase
      .from("gps_sessions")
      .select("player_id, session_date, total_distance, max_speed, high_speed_running, distance_zone_4_6, distance_zone_6, accelerations_zone_4_6, decelerations_zone_4_6, hml_efforts, players(name, position)")
      .eq("session_date", d);

    if (!data || data.length === 0) continue;
    const dailyPlayers = buildPlayerDayAggregates((data as unknown) as MetricRow[]);
    const totals = aggregateKpisFromPlayers(dailyPlayers);

    sparklines.totalDistance.push(totals.totalDistance);
    sparklines.topSpeed.push(totals.topSpeed);
    sparklines.hsr.push(totals.hsr);
    sparklines.sprintDist.push(totals.sprintDist);
    sparklines.accelDecel.push(totals.accelDecel);
    sparklines.explosiveEfforts.push(totals.explosiveEfforts);
  }

  return sparklines;
}

/** Compute ACWR (7-day acute / 28-day chronic) using DSL. */
async function computeAcwr(date: string): Promise<AcwrResult> {
  const windowStart = subtractDays(date, 28);
  const acuteStart = subtractDays(date, 7);

  // 28 days of drill-level data can easily exceed PostgREST's 1000-row
  // cap (~400 rows per practice × 12 practices ≈ 4.8k rows), so page
  // through it instead of using a single `.select()` call.
  const data = await fetchAllRows<{
    session_date: string;
    player_id: string;
    dynamic_stress_load: number | null;
  }>(() =>
    supabase
      .from("gps_sessions")
      .select("session_date, player_id, dynamic_stress_load")
      .gte("session_date", windowStart)
      .lte("session_date", date)
  );

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
      lowPlayers: [],
      positionGroups: [],
      sprintExposure: {
        totalPlayers: 0,
        playersAt85: 0,
        playersAt90: 0,
        percentAt85: 0,
        percentAt90: 0,
        missing90: [],
      },
      sessionInfo: [],
      acwr: { ratio: null, label: "No data", riskyPlayers: 0 },
      alertCount: 0,
      sessionTitle: "",
      currentDate: "",
      availableDates: [],
    };
  }

  // Fetch current session data + previous session + sparklines + readiness flags in parallel.
  const historyStart = `${currentDate.slice(0, 4)}-01-01`;
  const [rows, prevRows, sparklines, acwr, rosterPlayers, historyRows] = await Promise.all([
    getSessionGpsRows(currentDate),
    getPreviousSessionRows(currentDate),
    getSparklineHistory(currentDate),
    computeAcwr(currentDate),
    getPlayersList(),
    getMetricRowsForWindow(historyStart, currentDate),
  ]);

  // ── KPIs ──
  const typedRows = (rows as unknown) as MetricRow[];
  const playerAggregates = buildPlayerDayAggregates(typedRows);
  const prevAggregates = prevRows ? buildPlayerDayAggregates((prevRows as unknown) as MetricRow[]) : null;
  const current = aggregateKpisFromPlayers(playerAggregates);
  const previous = prevAggregates ? aggregateKpisFromPlayers(prevAggregates) : null;

  const kpiDefs: {
    title: string;
    key: keyof ReturnType<typeof aggregateKpisFromPlayers>;
    unit: string;
    decimals: number;
    accent: string;
    icon: KpiData["icon"];
  }[] = [
    { title: "Total Distance", key: "totalDistance", unit: "yd", decimals: 0, accent: "aa-accent", icon: "distance" },
    { title: "HSR", key: "hsr", unit: "yd", decimals: 0, accent: "aa-accent", icon: "hsr" },
    { title: "Sprint Distance", key: "sprintDist", unit: "yd", decimals: 0, accent: "aa-warm", icon: "sprint" },
    { title: "Max Velocity", key: "topSpeed", unit: "mph", decimals: 1, accent: "aa-warm", icon: "speed" },
    { title: "Accel / Decel", key: "accelDecel", unit: "", decimals: 0, accent: "aa-danger", icon: "load" },
    { title: "Explosive Efforts", key: "explosiveEfforts", unit: "", decimals: 0, accent: "aa-accent", icon: "metabolic" },
  ];

  const kpis: KpiData[] = kpiDefs.map((def) => {
    const value = current[def.key];
    const { change, changeType } = previous
      ? pctChange(value, previous[def.key])
      : { change: "---", changeType: "neutral" as const };

    const sparklineKey = def.key === "totalDistance" ? "totalDistance"
      : def.key === "topSpeed" ? "topSpeed"
      : def.key === "hsr" ? "hsr"
      : def.key === "sprintDist" ? "sprintDist"
      : def.key === "accelDecel" ? "accelDecel"
      : "explosiveEfforts";

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

  // Labels shown in mph — StatSports default zone thresholds converted from
  // m/s for display (7.0 m/s ≈ 15.7 mph, 5.5 m/s ≈ 12.3 mph, …).
  const zoneConfig = [
    { zone: "Zone 6", label: "> 15.7 mph", color: "bg-aa-danger" },
    { zone: "Zone 5", label: "12.3–15.7", color: "bg-aa-warm" },
    { zone: "Zone 4", label: "9.0–12.3", color: "bg-aa-warning" },
    { zone: "Zone 3", label: "5.6–9.0", color: "bg-aa-accent" },
    { zone: "Zone 2", label: "3.4–5.6", color: "bg-aa-text-secondary" },
    { zone: "Zone 1", label: "< 3.4", color: "bg-aa-text-dim" },
  ];

  const speedZones: SpeedZoneData[] = zoneConfig.map((cfg, i) => ({
    ...cfg,
    pct: zoneTotal > 0 ? Math.round((zoneSums[5 - i] / zoneTotal) * 100) : 0,
  }));

  // ── Team Report Sections ──
  const players: PlayerRow[] = [...playerAggregates]
    .sort((a, b) => b.totalDistance - a.totalDistance)
    .slice(0, 5)
    .map(playerToRow);

  const lowPlayers: PlayerRow[] = [...playerAggregates]
    .filter((player) => player.totalDistance > 0)
    .sort((a, b) => a.totalDistance - b.totalDistance)
    .slice(0, 5)
    .map(playerToRow);

  const groupLabels: Record<"skills_mids" | "bigs" | "other", PositionGroupSummary["label"]> = {
    skills_mids: "Skills / Mids",
    bigs: "Bigs",
    other: "Other",
  };
  const positionGroups: PositionGroupSummary[] = (["skills_mids", "bigs", "other"] as const)
    .map((group) => {
      const groupPlayers = playerAggregates.filter((player) => getPositionGroup(player.position) === group);
      const totals = aggregateKpisFromPlayers(groupPlayers);
      return {
        label: groupLabels[group],
        playerCount: groupPlayers.length,
        totalDistance: formatNum(totals.totalDistance),
        hsr: formatNum(totals.hsr),
        sprintDistance: formatNum(totals.sprintDist),
        accelDecel: formatNum(totals.accelDecel),
        dsl: formatNum(sum(groupPlayers.map((player) => player.dsl))),
      };
    })
    .filter((group) => group.playerCount > 0);

  const topSpeedByPlayer = new Map<string, number>();
  for (const row of historyRows) {
    topSpeedByPlayer.set(
      row.player_id,
      Math.max(topSpeedByPlayer.get(row.player_id) ?? 0, row.max_speed ?? 0)
    );
  }
  const sprintRows = playerAggregates.map((player) => {
    const baselineMax = topSpeedByPlayer.get(player.playerId) ?? player.topSpeed;
    const pctOfMax = baselineMax > 0 ? (player.topSpeed / baselineMax) * 100 : 0;
    return { player, pctOfMax };
  });
  const playersAt85 = sprintRows.filter((row) => row.pctOfMax >= 85).length;
  const playersAt90 = sprintRows.filter((row) => row.pctOfMax >= 90).length;
  const sprintExposure: SprintExposureSummary = {
    totalPlayers: playerAggregates.length,
    playersAt85,
    playersAt90,
    percentAt85: playerAggregates.length > 0 ? Math.round((playersAt85 / playerAggregates.length) * 100) : 0,
    percentAt90: playerAggregates.length > 0 ? Math.round((playersAt90 / playerAggregates.length) * 100) : 0,
    missing90: sprintRows
      .filter((row) => row.pctOfMax < 90)
      .sort((a, b) => a.pctOfMax - b.pctOfMax)
      .slice(0, 5)
      .map(({ player, pctOfMax }) => ({
        playerId: player.playerId,
        name: player.name,
        position: player.position,
        todayMaxSpeed: player.topSpeed.toFixed(1),
        pctOfMax: `${pctOfMax.toFixed(0)}%`,
      })),
  };

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
    lowPlayers,
    positionGroups,
    sprintExposure,
    sessionInfo,
    acwr,
    alertCount: rosterPlayers.filter((player) => player.flags.length > 0).length,
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
