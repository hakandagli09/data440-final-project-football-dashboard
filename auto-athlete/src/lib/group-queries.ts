import { subtractDays } from "@/lib/date-utils";
import {
  computeEwma,
  computeHsbi,
  computeMomentum,
  computePctMaxVelocity,
  computeSprintRecency,
  getWeekStart,
} from "@/lib/derived-metrics";
import { getPositionGroup, type PositionGroup } from "@/lib/position-groups";
import { supabaseServer as supabase } from "@/lib/supabase-server";

type GroupFilter = Extract<PositionGroup, "skills_mids" | "bigs">;

type PlayerInfo = {
  id: string;
  name: string;
  position: string;
  group: GroupFilter;
};

type DailyPlayerAggregate = {
  playerId: string;
  playerName: string;
  position: string;
  totalDistance: number;
  hsr: number;
  zone6SprintDistance: number;
  accel46: number;
  decel46: number;
  dsl: number;
  hmlDistance: number;
  hmldPerMinute: number;
  maxVelocity: number;
  pctMaxVelocity: number | null;
  hsbi: number;
  momentum: number | null;
  explosiveEfforts: number;
  ewmaHsr: number | null;
  ewmaZone6: number | null;
  ewmaAccelDecel: number | null;
  ewmaExplosive: number | null;
  daysSince90: number | null;
  daysSince85: number | null;
  lowerSpeedLoading: number;
  rpe: number | null;
  collisionLoad: number;
};

type WeeklyPlayerAggregate = {
  playerId: string;
  playerName: string;
  position: string;
  totalDistance: number;
  hsr: number;
  sprintDistance: number;
  dsl: number;
  accelDecel: number;
  explosiveEfforts: number;
  lowerSpeedLoading: number;
  collisionLoad: number;
};

export interface PositionReportData {
  currentDate: string;
  availableDates: string[];
  weekStart: string;
  weekEnd: string;
  sheets: {
    skillsMidsDaily: DailyPlayerAggregate[];
    skillsMidsWeekly: WeeklyPlayerAggregate[];
    bigsDaily: DailyPlayerAggregate[];
    bigsWeekly: WeeklyPlayerAggregate[];
  };
}

type GpsSessionRow = {
  player_id: string;
  session_date: string;
  total_distance: number | null;
  high_speed_running: number | null;
  distance_zone_6: number | null;
  accelerations_zone_4_6: number | null;
  decelerations_zone_4_6: number | null;
  dynamic_stress_load: number | null;
  hml_distance: number | null;
  hmld_per_minute: number | null;
  max_speed: number | null;
  pct_max_speed: number | null;
  hml_efforts: number | null;
  lower_speed_loading: number | null;
  collision_load: number | null;
};

function valueOrZero(value: number | null | undefined): number {
  return value ?? 0;
}

function groupPlayers(players: Array<{ id: string; name: string; position: string | null }>): Map<string, PlayerInfo> {
  // Centralize player->group assignment to keep UI and query logic consistent.
  const map = new Map<string, PlayerInfo>();
  for (const player of players) {
    const group = getPositionGroup(player.position);
    if (group === "other") continue;
    map.set(player.id, {
      id: player.id,
      name: player.name,
      position: player.position ?? "—",
      group,
    });
  }
  return map;
}

function getLatestEwmaValue(
  rows: GpsSessionRow[],
  playerId: string,
  selector: (row: GpsSessionRow) => number
): number | null {
  // EWMA is computed from chronologically sorted per-player series.
  const series = rows
    .filter((row) => row.player_id === playerId)
    .sort((a, b) => a.session_date.localeCompare(b.session_date))
    .map(selector);
  if (series.length === 0) return null;
  const ewma = computeEwma(series);
  return ewma[ewma.length - 1] ?? null;
}

function latestBodyWeightByPlayer(jumpRows: Array<{ player_id: string; body_weight_kg: number | null }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of jumpRows) {
    if (row.body_weight_kg != null && row.body_weight_kg > 0 && !out.has(row.player_id)) {
      out.set(row.player_id, row.body_weight_kg);
    }
  }
  return out;
}

function filterToGroup<T extends { playerId: string }>(
  rows: T[],
  players: Map<string, PlayerInfo>,
  group: GroupFilter
): T[] {
  return rows.filter((row) => players.get(row.playerId)?.group === group);
}

export async function getPositionReportData(selectedDate?: string): Promise<PositionReportData> {
  const { data: dateRows } = await supabase
    .from("gps_sessions")
    .select("session_date")
    .order("session_date", { ascending: false });

  const availableDates = Array.from(new Set((dateRows ?? []).map((row) => row.session_date as string)));
  const currentDate = selectedDate && availableDates.includes(selectedDate)
    ? selectedDate
    : (availableDates[0] ?? "");

  if (!currentDate) {
    return {
      currentDate: "",
      availableDates: [],
      weekStart: "",
      weekEnd: "",
      sheets: {
        skillsMidsDaily: [],
        skillsMidsWeekly: [],
        bigsDaily: [],
        bigsWeekly: [],
      },
    };
  }

  const weekStart = getWeekStart(currentDate);
  const weekEnd = currentDate;

  const [
    { data: playersRows },
    { data: dailyGpsRows },
    { data: historicalGpsRows },
    { data: weeklyRows },
    { data: jumpRows },
  ] = await Promise.all([
    supabase.from("players").select("id, name, position"),
    supabase
      .from("gps_sessions")
      .select("player_id, session_date, total_distance, high_speed_running, distance_zone_6, accelerations_zone_4_6, decelerations_zone_4_6, dynamic_stress_load, hml_distance, hmld_per_minute, max_speed, pct_max_speed, hml_efforts, lower_speed_loading, collision_load")
      .eq("session_date", currentDate),
    supabase
      .from("gps_sessions")
      .select("player_id, session_date, high_speed_running, distance_zone_6, accelerations_zone_4_6, decelerations_zone_4_6, hml_efforts, max_speed")
      .lte("session_date", currentDate),
    supabase
      .from("gps_sessions")
      .select("player_id, session_date, total_distance, high_speed_running, distance_zone_6, accelerations_zone_4_6, decelerations_zone_4_6, dynamic_stress_load, hml_efforts, lower_speed_loading, collision_load")
      .gte("session_date", weekStart)
      .lte("session_date", weekEnd),
    supabase
      .from("jump_tests")
      .select("player_id, body_weight_kg, test_date")
      .order("test_date", { ascending: false }),
  ]);

  const players = groupPlayers((playersRows ?? []) as Array<{ id: string; name: string; position: string | null }>);
  const weights = latestBodyWeightByPlayer((jumpRows ?? []) as Array<{ player_id: string; body_weight_kg: number | null }>);
  const history = (historicalGpsRows ?? []) as GpsSessionRow[];
  const dailyRows = (dailyGpsRows ?? []) as GpsSessionRow[];

  const playerTopSpeed = new Map<string, number>();
  const playerRecencyMap = new Map<string, ReturnType<typeof computeSprintRecency>>();
  for (const playerId of Array.from(players.keys())) {
    const speedHistory = history
      .filter((row) => row.player_id === playerId)
      .map((row) => ({ date: row.session_date, maxSpeed: valueOrZero(row.max_speed) }));
    const recency = computeSprintRecency(speedHistory);
    playerRecencyMap.set(playerId, recency);
    playerTopSpeed.set(playerId, recency.allTimeMax ?? 0);
  }

  const dailyByPlayer = new Map<string, DailyPlayerAggregate>();
  for (const row of dailyRows) {
    const player = players.get(row.player_id);
    if (!player) continue;
    const existing = dailyByPlayer.get(row.player_id) ?? {
      playerId: row.player_id,
      playerName: player.name,
      position: player.position,
      totalDistance: 0,
      hsr: 0,
      zone6SprintDistance: 0,
      accel46: 0,
      decel46: 0,
      dsl: 0,
      hmlDistance: 0,
      hmldPerMinute: 0,
      maxVelocity: 0,
      pctMaxVelocity: null,
      hsbi: 0,
      momentum: null,
      explosiveEfforts: 0,
      ewmaHsr: null,
      ewmaZone6: null,
      ewmaAccelDecel: null,
      ewmaExplosive: null,
      daysSince90: null,
      daysSince85: null,
      lowerSpeedLoading: 0,
      rpe: null,
      collisionLoad: 0,
    };

    existing.totalDistance += valueOrZero(row.total_distance);
    existing.hsr += valueOrZero(row.high_speed_running);
    existing.zone6SprintDistance += valueOrZero(row.distance_zone_6);
    existing.accel46 += valueOrZero(row.accelerations_zone_4_6);
    existing.decel46 += valueOrZero(row.decelerations_zone_4_6);
    existing.dsl += valueOrZero(row.dynamic_stress_load);
    existing.hmlDistance += valueOrZero(row.hml_distance);
    existing.hmldPerMinute += valueOrZero(row.hmld_per_minute);
    existing.maxVelocity = Math.max(existing.maxVelocity, valueOrZero(row.max_speed));
    existing.explosiveEfforts += valueOrZero(row.hml_efforts);
    existing.lowerSpeedLoading += valueOrZero(row.lower_speed_loading);
    existing.collisionLoad += valueOrZero(row.collision_load);
    dailyByPlayer.set(row.player_id, existing);
  }

  const dailyAggregates = Array.from(dailyByPlayer.values()).map((row) => {
    // Derived metrics are calculated here (query layer), never in UI components.
    const topSpeed = playerTopSpeed.get(row.playerId) ?? 0;
    const recency = playerRecencyMap.get(row.playerId) ?? { daysSince90: null, daysSince85: null, allTimeMax: null };
    const weeklyTopSpeed = Math.max(
      ...history
        .filter((h) => h.player_id === row.playerId && h.session_date >= weekStart && h.session_date <= weekEnd)
        .map((h) => valueOrZero(h.max_speed)),
      0
    );

    const accelDecelSelector = (item: GpsSessionRow) =>
      valueOrZero(item.accelerations_zone_4_6) + valueOrZero(item.decelerations_zone_4_6);

    row.pctMaxVelocity = computePctMaxVelocity(row.maxVelocity, topSpeed);
    row.hsbi = computeHsbi(row.decel46, row.maxVelocity);
    row.momentum = computeMomentum(weights.get(row.playerId) ?? null, weeklyTopSpeed);
    row.ewmaHsr = getLatestEwmaValue(history, row.playerId, (item) => valueOrZero(item.high_speed_running));
    row.ewmaZone6 = getLatestEwmaValue(history, row.playerId, (item) => valueOrZero(item.distance_zone_6));
    row.ewmaAccelDecel = getLatestEwmaValue(history, row.playerId, accelDecelSelector);
    row.ewmaExplosive = getLatestEwmaValue(history, row.playerId, (item) => valueOrZero(item.hml_efforts));
    row.daysSince90 = recency.daysSince90;
    row.daysSince85 = recency.daysSince85;
    return row;
  });

  const weekRows = (weeklyRows ?? []) as GpsSessionRow[];
  const weeklyByPlayer = new Map<string, WeeklyPlayerAggregate>();
  for (const row of weekRows) {
    const player = players.get(row.player_id);
    if (!player) continue;
    const existing = weeklyByPlayer.get(row.player_id) ?? {
      playerId: row.player_id,
      playerName: player.name,
      position: player.position,
      totalDistance: 0,
      hsr: 0,
      sprintDistance: 0,
      dsl: 0,
      accelDecel: 0,
      explosiveEfforts: 0,
      lowerSpeedLoading: 0,
      collisionLoad: 0,
    };
    existing.totalDistance += valueOrZero(row.total_distance);
    existing.hsr += valueOrZero(row.high_speed_running);
    existing.sprintDistance += valueOrZero(row.distance_zone_6);
    existing.dsl += valueOrZero(row.dynamic_stress_load);
    existing.accelDecel += valueOrZero(row.accelerations_zone_4_6) + valueOrZero(row.decelerations_zone_4_6);
    existing.explosiveEfforts += valueOrZero(row.hml_efforts);
    existing.lowerSpeedLoading += valueOrZero(row.lower_speed_loading);
    existing.collisionLoad += valueOrZero(row.collision_load);
    weeklyByPlayer.set(row.player_id, existing);
  }

  const weeklyAggregates = Array.from(weeklyByPlayer.values());

  return {
    currentDate,
    availableDates,
    weekStart,
    weekEnd,
    sheets: {
      skillsMidsDaily: filterToGroup(dailyAggregates, players, "skills_mids"),
      skillsMidsWeekly: filterToGroup(weeklyAggregates, players, "skills_mids"),
      bigsDaily: filterToGroup(dailyAggregates, players, "bigs"),
      bigsWeekly: filterToGroup(weeklyAggregates, players, "bigs"),
    },
  };
}

export async function getGroupedDailyMetrics(date?: string, group: GroupFilter = "skills_mids") {
  const report = await getPositionReportData(date);
  return group === "skills_mids" ? report.sheets.skillsMidsDaily : report.sheets.bigsDaily;
}

export async function getGroupedWeeklySums(weekStartOrDate?: string, group: GroupFilter = "skills_mids") {
  const report = await getPositionReportData(weekStartOrDate);
  return group === "skills_mids" ? report.sheets.skillsMidsWeekly : report.sheets.bigsWeekly;
}

export function getWeeklyWindowEndingOn(date: string): { weekStart: string; weekEnd: string } {
  const weekStart = getWeekStart(date);
  return { weekStart, weekEnd: subtractDays(weekStart, -6) };
}
