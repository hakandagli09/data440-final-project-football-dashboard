import { supabaseServer as supabase } from "@/lib/supabase-server";
import { getPositionGroup, getPositionGroupLabel } from "@/lib/position-groups";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { kgToLbs } from "@/lib/units";
import { computeEwma } from "@/lib/derived-metrics";
import { cleanupPlayersWithoutData } from "@/lib/player-cleanup";
import {
  computePlayerFlags,
  computeSprintRecencySummary,
  flagLabels,
  getNormalizedHsr,
  readinessFromFlagCount,
  type FlagJumpRow,
  type PlayerStatus,
} from "@/lib/flagging";

export type { PlayerStatus };

export type TrainingSeason = "spring" | "summer" | "fall";

export const SEASON_LABELS: Record<TrainingSeason, string> = {
  spring: "Spring Season",
  summer: "Summer Sessions",
  fall: "In Season / Fall",
};

export interface PlayerListItem {
  id: string;
  name: string;
  position: string;
  latestSessionDate: string | null;
  status: PlayerStatus;
  expectedReturn: string | null;
  readiness: "green" | "yellow" | "red" | "neutral";
  flags: string[];
}

export interface SeasonFlaggingData {
  activeSeason: TrainingSeason | null;
  seasonLabel: string;
  players: PlayerListItem[];
  counts: {
    total: number;
    green: number;
    yellow: number;
    red: number;
    neutral: number;
    managed: number;
    flagged: number;
  };
}

export interface PlayerProfileData {
  id: string;
  name: string;
  position: string;
  selectedDate: string | null;
  selectedDateHasGps: boolean;
  status: PlayerStatus;
  expectedReturn: string | null;
  sprintRecency: {
    daysSince90: number | null;
    daysSince85: number | null;
    allTimeMaxSpeed: number | null;
  };
  trends: Array<{
    date: string;
    maxSpeed: number;
    pctMaxSpeed: number;
    hsr: number;
    sprintDistance: number;
    dsl: number;
  }>;
  fatigue: {
    // Jump height expressed in inches (jump_height_in from CSV). `jumpHeightCm`
    // kept temporarily in case other consumers still read it, but UI uses in.
    jumpHeightCm: number | null;
    jumpHeightIn: number | null;
    rsiModified: number | null;
    accelDecel46: number | null;
    groinSqueeze: number | null;
    hamstringIso: number | null;
  };
  // Body weight converted from stored kg to pounds for display.
  bodyWeightLb: number | null;
  asymmetry: {
    forceFramePct: number | null;
    nordBordPct: number | null;
  };
  dataFreshness: {
    gps: string | null;
    jump: string | null;
    forceFrame: string | null;
    nordBord: string | null;
  };
  requiredMetrics: {
    // Mirrors the sport-science spec metric set for profile v1.
    group: "skills_mids" | "bigs" | "other";
    items: Array<{ label: string; value: number | null; unit?: string }>;
  };
  flags: string[];
}

export interface RosterCountData {
  totalPlayers: number;
  playersWithGpsData: number;
  playersWithoutGpsData: number;
  statusCounts: Record<PlayerStatus, number>;
}

export interface PlayerNameSearchResult {
  query: string;
  matchCount: number;
  exactMatch: PlayerListItem | null;
  matches: PlayerListItem[];
}

type GpsRow = {
  player_id: string;
  session_date: string;
  max_speed: number | null;
  pct_max_speed: number | null;
  high_speed_running: number | null;
  distance_zone_4_6: number | null;
  distance_zone_6: number | null;
  dynamic_stress_load: number | null;
  accelerations_zone_4_6: number | null;
  decelerations_zone_4_6: number | null;
  hml_efforts: number | null;
  total_distance: number | null;
  hml_distance: number | null;
  hmld_per_minute: number | null;
  lower_speed_loading: number | null;
  collision_load: number | null;
};

function avgNullable(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function sumNullable(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0);
}

function maxNullable(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (finite.length === 0) return null;
  return Math.max(...finite);
}

function aggregateGpsRowsForDate(rows: GpsRow[], date: string): GpsRow | null {
  const dayRows = rows.filter((row) => row.session_date === date);
  if (dayRows.length === 0) return null;

  return {
    player_id: dayRows[0].player_id,
    session_date: date,
    max_speed: maxNullable(dayRows.map((row) => row.max_speed)),
    pct_max_speed: maxNullable(dayRows.map((row) => row.pct_max_speed)),
    high_speed_running: sumNullable(dayRows.map((row) => row.high_speed_running)),
    distance_zone_4_6: sumNullable(dayRows.map((row) => row.distance_zone_4_6)),
    distance_zone_6: sumNullable(dayRows.map((row) => row.distance_zone_6)),
    dynamic_stress_load: sumNullable(dayRows.map((row) => row.dynamic_stress_load)),
    accelerations_zone_4_6: sumNullable(dayRows.map((row) => row.accelerations_zone_4_6)),
    decelerations_zone_4_6: sumNullable(dayRows.map((row) => row.decelerations_zone_4_6)),
    hml_efforts: sumNullable(dayRows.map((row) => row.hml_efforts)),
    total_distance: sumNullable(dayRows.map((row) => row.total_distance)),
    hml_distance: sumNullable(dayRows.map((row) => row.hml_distance)),
    hmld_per_minute: avgNullable(dayRows.map((row) => row.hmld_per_minute)),
    lower_speed_loading: sumNullable(dayRows.map((row) => row.lower_speed_loading)),
    collision_load: sumNullable(dayRows.map((row) => row.collision_load)),
  };
}

type InjuryStatusRow = {
  player_id?: string;
  status: PlayerStatus;
  injury_date: string | null;
  expected_return: string | null;
  updated_at: string | null;
};

function isTrainingSeason(value: unknown): value is TrainingSeason {
  return value === "spring" || value === "summer" || value === "fall";
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusDate(row: InjuryStatusRow): string {
  return row.injury_date ?? row.updated_at?.slice(0, 10) ?? todayIsoDate();
}

function isManagedStatus(status: PlayerStatus): boolean {
  return status !== "cleared";
}

function latestStatus(
  statuses: InjuryStatusRow[],
  today = todayIsoDate()
): { status: PlayerStatus; expectedReturn: string | null } {
  if (statuses.length === 0) return { status: "cleared", expectedReturn: null };
  const latest = statuses[0];
  if (latest.status === "modified_load" && latest.expected_return && latest.expected_return < today) {
    return { status: "cleared", expectedReturn: null };
  }
  return {
    status: latest.status,
    expectedReturn: latest.expected_return,
  };
}

function isDateInsideManagedWindow(date: string, statuses: InjuryStatusRow[]): boolean {
  const ascending = [...statuses].sort((a, b) => statusDate(a).localeCompare(statusDate(b)));

  for (let index = 0; index < ascending.length; index++) {
    const status = ascending[index];
    if (!isManagedStatus(status.status)) continue;

    const start = statusDate(status);
    const nextStatusDate = ascending[index + 1] ? statusDate(ascending[index + 1]) : null;
    const end = status.expected_return ?? nextStatusDate;

    if (date >= start && (end == null || date <= end)) return true;
  }

  return false;
}

function filterHealthyGpsRows<T extends { session_date: string }>(
  rows: T[],
  statuses: InjuryStatusRow[]
): T[] {
  return rows.filter((row) => !isDateInsideManagedWindow(row.session_date, statuses));
}

function filterHealthyJumpRows<T extends { test_date: string }>(
  rows: T[],
  statuses: InjuryStatusRow[]
): T[] {
  return rows.filter((row) => !isDateInsideManagedWindow(row.test_date, statuses));
}

export async function getActiveTrainingSeason(): Promise<TrainingSeason | null> {
  const { data } = await supabase
    .from("uploads")
    .select("season")
    .eq("csv_type", "gps")
    .not("season", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return isTrainingSeason(data?.season) ? data.season : null;
}

async function getUploadIdsForSeason(season: TrainingSeason, csvType?: "gps" | "jump"): Promise<string[]> {
  let query = supabase
    .from("uploads")
    .select("id")
    .eq("season", season);

  if (csvType) query = query.eq("csv_type", csvType);
  const { data } = await query;
  return (data ?? []).map((row) => row.id as string);
}

export async function getPlayersList(seasonOverride?: TrainingSeason | null): Promise<PlayerListItem[]> {
  type RosterGpsRow = {
    player_id: string;
    session_date: string;
    max_speed: number | null;
    high_speed_running: number | null;
    distance_zone_4_6: number | null;
    distance_zone_6: number | null;
    accelerations_zone_4_6: number | null;
    decelerations_zone_4_6: number | null;
    hml_efforts: number | null;
  };
  type RosterJumpRow = FlagJumpRow & { player_id: string };

  // Keep testing/reset flows honest: roster rows should not survive after
  // all uploaded performance data for a player has been removed.
  await cleanupPlayersWithoutData();

  const activeSeason = seasonOverride === undefined ? await getActiveTrainingSeason() : seasonOverride;
  const [gpsUploadIds, jumpUploadIds] = activeSeason
    ? await Promise.all([
        getUploadIdsForSeason(activeSeason, "gps"),
        getUploadIdsForSeason(activeSeason, "jump"),
      ])
    : [[], []];

  const [{ data: players }, { data: injuries }, gpsRowsAll, jumpRowsAll] = await Promise.all([
    supabase.from("players").select("id, name, position").order("name", { ascending: true }),
    supabase
      .from("injuries")
      .select("player_id, status, injury_date, expected_return, updated_at")
      .order("updated_at", { ascending: false }),
    gpsUploadIds.length > 0
      ? fetchAllRows<RosterGpsRow>(() =>
          supabase
            .from("gps_sessions")
            .select("player_id, session_date, max_speed, high_speed_running, distance_zone_4_6, distance_zone_6, accelerations_zone_4_6, decelerations_zone_4_6, hml_efforts")
            .in("upload_id", gpsUploadIds)
        )
      : Promise.resolve([] as RosterGpsRow[]),
    jumpUploadIds.length > 0
      ? fetchAllRows<RosterJumpRow>(() =>
          supabase
            .from("jump_tests")
            .select("player_id, test_date, test_time, jump_height_cm, jump_height_in, rsi_modified, concentric_impulse, eccentric_braking_impulse, eccentric_duration_ms, contraction_time_ms")
            .in("upload_id", jumpUploadIds)
        )
      : Promise.resolve([] as RosterJumpRow[]),
  ]);
  const gpsRows = gpsRowsAll;
  const jumpRows = jumpRowsAll;

  const injuryMap = new Map<string, InjuryStatusRow[]>();
  for (const row of injuries ?? []) {
    const list = injuryMap.get(row.player_id) ?? [];
    list.push({
      player_id: row.player_id,
      status: row.status as PlayerStatus,
      injury_date: row.injury_date,
      expected_return: row.expected_return,
      updated_at: row.updated_at,
    });
    injuryMap.set(row.player_id, list);
  }

  // `RosterGpsRow` is a strict subset of `GpsRow`; the extra fields on
  // the wider type are simply absent at runtime and the downstream
  // code below only reads columns we explicitly SELECTed.
  const gpsMap = new Map<string, GpsRow[]>();
  for (const row of (gpsRows as unknown) as GpsRow[]) {
    const list = gpsMap.get(row.player_id) ?? [];
    list.push(row);
    gpsMap.set(row.player_id, list);
  }
  for (const list of Array.from(gpsMap.values())) {
    list.sort((a, b) => a.session_date.localeCompare(b.session_date));
  }

  const jumpMap = new Map<string, RosterJumpRow[]>();
  for (const row of jumpRows) {
    const list = jumpMap.get(row.player_id) ?? [];
    list.push(row);
    jumpMap.set(row.player_id, list);
  }

  const out: PlayerListItem[] = [];
  for (const player of players ?? []) {
    const statusRows = injuryMap.get(player.id) ?? [];
    const statusData = latestStatus(statusRows);
    const rows = gpsMap.get(player.id) ?? [];
    const jumpRowsForPlayer = jumpMap.get(player.id) ?? [];
    if (rows.length === 0 && jumpRowsForPlayer.length === 0) continue;
    const flagGpsRows = filterHealthyGpsRows(rows, statusRows);
    const flagJumpRows = filterHealthyJumpRows(jumpRowsForPlayer, statusRows);

    const flags = flagLabels(
      computePlayerFlags({
        status: statusData.status,
        gpsRows: flagGpsRows,
        jumpRows: flagJumpRows,
      })
    );
    const latestSessionDate = rows.length > 0 ? rows[rows.length - 1].session_date : null;

    out.push({
      id: player.id,
      name: player.name,
      position: player.position ?? "—",
      latestSessionDate,
      status: statusData.status,
      expectedReturn: statusData.expectedReturn,
      readiness: readinessFromFlagCount(flags.length, flagGpsRows.length > 0),
      flags,
    });
  }

  return out;
}

export async function getSeasonFlaggingData(): Promise<SeasonFlaggingData> {
  const activeSeason = await getActiveTrainingSeason();
  const players = await getPlayersList(activeSeason);
  const counts = {
    total: players.length,
    green: players.filter((player) => player.readiness === "green").length,
    yellow: players.filter((player) => player.readiness === "yellow").length,
    red: players.filter((player) => player.readiness === "red").length,
    neutral: players.filter((player) => player.readiness === "neutral").length,
    managed: players.filter((player) => player.status !== "cleared").length,
    flagged: players.filter((player) => player.flags.length > 0).length,
  };

  return {
    activeSeason,
    seasonLabel: activeSeason ? SEASON_LABELS[activeSeason] : "No Season Selected",
    players,
    counts,
  };
}

export async function getRosterCount(): Promise<RosterCountData> {
  const players = await getPlayersList();
  const statusCounts: Record<PlayerStatus, number> = {
    modified_load: 0,
    injured: 0,
    rehab: 0,
    return_to_play: 0,
    cleared: 0,
  };

  for (const player of players) {
    statusCounts[player.status] += 1;
  }

  const playersWithGpsData = players.filter((player) => player.latestSessionDate != null).length;

  return {
    totalPlayers: players.length,
    playersWithGpsData,
    playersWithoutGpsData: players.length - playersWithGpsData,
    statusCounts,
  };
}

export async function findPlayersByName(query: string): Promise<PlayerNameSearchResult> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return {
      query: "",
      matchCount: 0,
      exactMatch: null,
      matches: [],
    };
  }

  const normalizedQuery = trimmedQuery.toLowerCase();
  const players = await getPlayersList();
  const exactMatch =
    players.find((player) => player.name.trim().toLowerCase() === normalizedQuery) ?? null;
  const partialMatches = players.filter((player) =>
    player.name.trim().toLowerCase().includes(normalizedQuery)
  );

  const rankedMatches = [
    ...(exactMatch ? [exactMatch] : []),
    ...partialMatches.filter((player) => player.id !== exactMatch?.id),
  ].slice(0, 5);

  return {
    query: trimmedQuery,
    matchCount: partialMatches.length,
    exactMatch,
    matches: rankedMatches,
  };
}

export async function getPlayersByStatus(
  status: PlayerStatus
): Promise<{ status: PlayerStatus; count: number; players: PlayerListItem[] }> {
  const players = await getPlayersList();
  const filteredPlayers = players.filter((player) => player.status === status);

  return {
    status,
    count: filteredPlayers.length,
    players: filteredPlayers,
  };
}

export async function getPlayerProfile(
  playerId: string,
  selectedDate?: string | null
): Promise<PlayerProfileData | null> {
  const activeSeason = await getActiveTrainingSeason();
  const [gpsUploadIds, jumpUploadIds] = activeSeason
    ? await Promise.all([
        getUploadIdsForSeason(activeSeason, "gps"),
        getUploadIdsForSeason(activeSeason, "jump"),
      ])
    : [[], []];

  // At drill-level granularity a single player can accumulate >1000
  // rows over a full season (~13 drills/practice × ~50 practices), so
  // paginate their GPS history here too.
  const [{ data: player }, { data: injuries }, gpsRowsAll, { data: jumpRows }, { data: forceRows }, { data: nordRows }] = await Promise.all([
    supabase.from("players").select("id, name, position").eq("id", playerId).maybeSingle(),
    supabase
      .from("injuries")
      .select("status, injury_date, expected_return, updated_at")
      .eq("player_id", playerId)
      .order("updated_at", { ascending: false }),
    gpsUploadIds.length > 0
      ? fetchAllRows<GpsRow>(() =>
          supabase
            .from("gps_sessions")
            .select("player_id, session_date, max_speed, pct_max_speed, high_speed_running, distance_zone_4_6, distance_zone_6, dynamic_stress_load, accelerations_zone_4_6, decelerations_zone_4_6, hml_efforts, total_distance, hml_distance, hmld_per_minute, lower_speed_loading, collision_load")
            .eq("player_id", playerId)
            .in("upload_id", gpsUploadIds)
            .order("session_date", { ascending: true })
        )
      : Promise.resolve([] as GpsRow[]),
    jumpUploadIds.length > 0
      ? supabase
          .from("jump_tests")
          .select("player_id, test_date, test_time, jump_height_cm, jump_height_in, rsi_modified, body_weight_kg, concentric_impulse, eccentric_braking_impulse, eccentric_duration_ms, contraction_time_ms")
          .eq("player_id", playerId)
          .in("upload_id", jumpUploadIds)
          .order("test_date", { ascending: false })
          .order("test_time", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("force_frame_tests")
      .select("test_date, direction, l_max_force, r_max_force, max_imbalance")
      .eq("player_id", playerId)
      .order("test_date", { ascending: false }),
    supabase
      .from("nordbord_tests")
      .select("test_date, l_max_force, r_max_force, max_imbalance")
      .eq("player_id", playerId)
      .order("test_date", { ascending: false })
      .limit(1),
  ]);

  if (!player) return null;

  const statusRows = (injuries ?? []).map((row) => ({
    status: row.status as PlayerStatus,
    injury_date: row.injury_date,
    expected_return: row.expected_return,
    updated_at: row.updated_at,
  }));
  const statusData = latestStatus(statusRows);
  const status = statusData.status;
  const expectedReturn = statusData.expectedReturn;
  const rows = gpsRowsAll;
  const latestGpsDate = rows.length > 0 ? rows[rows.length - 1].session_date : null;
  const displayDate = selectedDate ?? latestGpsDate;
  const displayGps = displayDate ? aggregateGpsRowsForDate(rows, displayDate) : null;
  const flagGpsRows = filterHealthyGpsRows(rows, statusRows);
  const flagJumpRows = filterHealthyJumpRows(jumpRows ?? [], statusRows);
  const recency = computeSprintRecencySummary(flagGpsRows);
  const flags = flagLabels(computePlayerFlags({ status, gpsRows: flagGpsRows, jumpRows: flagJumpRows }));

  const byDate = new Map<string, {
    maxSpeed: number;
    pctMaxSpeed: number;
    hsr: number;
    sprintDistance: number;
    dsl: number;
  }>();

  for (const row of rows) {
    const curr = byDate.get(row.session_date) ?? {
      maxSpeed: 0,
      pctMaxSpeed: 0,
      hsr: 0,
      sprintDistance: 0,
      dsl: 0,
    };
    curr.maxSpeed = Math.max(curr.maxSpeed, row.max_speed ?? 0);
    curr.pctMaxSpeed = Math.max(curr.pctMaxSpeed, row.pct_max_speed ?? 0);
    curr.hsr += getNormalizedHsr(row);
    curr.sprintDistance += row.distance_zone_6 ?? 0;
    curr.dsl += row.dynamic_stress_load ?? 0;
    byDate.set(row.session_date, curr);
  }

  const trendsSource = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([date]) => !displayDate || date <= displayDate);
  const trends = trendsSource
    .slice(-14)
    .map(([date, values]) => ({ date, ...values }));

  const latestJump = jumpRows?.[0];
  const latestSqueeze = forceRows?.find((row) => (row.direction ?? "").toLowerCase() === "squeeze");
  const latestNord = nordRows?.[0];
  const latestGps = displayGps;
  const group = getPositionGroup(player.position);

  const topSpeed = recency.maxSpeed ?? 0;
  const pctMaxVelocity = latestGps && topSpeed > 0 ? ((latestGps.max_speed ?? 0) / topSpeed) * 100 : null;
  const hsbi = latestGps ? (latestGps.decelerations_zone_4_6 ?? 0) * (latestGps.max_speed ?? 0) : null;
  const weeklyRows = rows.filter((r) => {
    const latest = displayDate;
    if (!latest) return false;
    const latestMs = new Date(`${latest}T00:00:00Z`).getTime();
    const rowMs = new Date(`${r.session_date}T00:00:00Z`).getTime();
    return latestMs - rowMs <= 6 * 24 * 60 * 60 * 1000;
  });
  const weeklyTopSpeed = weeklyRows.length > 0
    ? Math.max(...weeklyRows.map((r) => r.max_speed ?? 0))
    : 0;
  const momentum = latestJump?.body_weight_kg != null
    ? latestJump.body_weight_kg * weeklyTopSpeed
    : null;

  const dailyAgg = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([date]) => !displayDate || date <= displayDate)
    .map(([date, values]) => ({
      hsr: values.hsr,
      sprintDistance: values.sprintDistance,
      accelDecel: rows
        .filter((r) => r.session_date === date)
        .reduce((sum, r) => sum + (r.accelerations_zone_4_6 ?? 0) + (r.decelerations_zone_4_6 ?? 0), 0),
      explosive: rows
        .filter((r) => r.session_date === date)
        .reduce((sum, r) => sum + (r.hml_efforts ?? 0), 0),
    }));

  const ewmaHsr = dailyAgg.length > 0 ? computeEwma(dailyAgg.map((d) => d.hsr)).at(-1) ?? null : null;
  const ewmaZone6 = dailyAgg.length > 0 ? computeEwma(dailyAgg.map((d) => d.sprintDistance)).at(-1) ?? null : null;
  const ewmaAccelDecel = dailyAgg.length > 0 ? computeEwma(dailyAgg.map((d) => d.accelDecel)).at(-1) ?? null : null;
  const ewmaExplosive = dailyAgg.length > 0 ? computeEwma(dailyAgg.map((d) => d.explosive)).at(-1) ?? null : null;

  // Required metrics are rendered as profile cards and differ by position group.
  // Distance values are stored in yards, speed in mph (StatSports Apex config).
  const requiredMetrics = group === "bigs"
    ? [
      { label: "Total Distance", value: latestGps?.total_distance ?? null, unit: "yd" },
      { label: "DSL", value: latestGps?.dynamic_stress_load ?? null, unit: "AU" },
      { label: "Lower Speed Loading", value: latestGps?.lower_speed_loading ?? null, unit: "AU" },
      { label: "HML Distance", value: latestGps?.hml_distance ?? null, unit: "yd" },
      { label: "HMLD Per Minute", value: latestGps?.hmld_per_minute ?? null, unit: "yd/min" },
      { label: "HSR", value: latestGps ? getNormalizedHsr(latestGps) : null, unit: "yd" },
      { label: "Zone 4-6 Accelerations", value: latestGps?.accelerations_zone_4_6 ?? null },
      { label: "Explosive Efforts", value: latestGps?.hml_efforts ?? null },
      { label: "Max Velocity", value: latestGps?.max_speed ?? null, unit: "mph" },
      { label: "% Max Velocity", value: pctMaxVelocity, unit: "%" },
      { label: "Collision Load", value: latestGps?.collision_load ?? null, unit: "AU" },
    ]
    : [
      { label: "Total Distance", value: latestGps?.total_distance ?? null, unit: "yd" },
      { label: "HSR", value: latestGps ? getNormalizedHsr(latestGps) : null, unit: "yd" },
      { label: "Zone 6 Sprint Distance", value: latestGps?.distance_zone_6 ?? null, unit: "yd" },
      { label: "Zone 4-6 Accelerations", value: latestGps?.accelerations_zone_4_6 ?? null },
      { label: "Zone 4-6 Decelerations", value: latestGps?.decelerations_zone_4_6 ?? null },
      { label: "DSL", value: latestGps?.dynamic_stress_load ?? null, unit: "AU" },
      { label: "HML Distance", value: latestGps?.hml_distance ?? null, unit: "yd" },
      { label: "HMLD Per Minute", value: latestGps?.hmld_per_minute ?? null, unit: "yd/min" },
      { label: "Max Velocity", value: latestGps?.max_speed ?? null, unit: "mph" },
      { label: "% Max Velocity", value: pctMaxVelocity, unit: "%" },
      { label: "HSBI", value: hsbi },
      { label: "Momentum", value: momentum },
      { label: "Explosive Efforts", value: latestGps?.hml_efforts ?? null },
      { label: "EWMA HSR", value: ewmaHsr },
      { label: "EWMA Zone 6", value: ewmaZone6 },
      { label: "EWMA Accel/Decel", value: ewmaAccelDecel },
      { label: "EWMA Explosive", value: ewmaExplosive },
      { label: "Days Since 90%", value: recency.daysSince90 },
      { label: "Days Since 85%", value: recency.daysSince85 },
    ];

  return {
    id: player.id,
    name: player.name,
    position: player.position ?? "—",
    selectedDate: selectedDate ?? null,
    selectedDateHasGps: selectedDate ? displayGps != null : true,
    status,
    expectedReturn,
    sprintRecency: {
      daysSince90: recency.daysSince90,
      daysSince85: recency.daysSince85,
      allTimeMaxSpeed: recency.maxSpeed,
    },
    trends,
    fatigue: {
      jumpHeightCm: latestJump?.jump_height_cm ?? null,
      jumpHeightIn: latestJump?.jump_height_in ?? null,
      rsiModified: latestJump?.rsi_modified ?? null,
      accelDecel46: latestGps
        ? (latestGps.accelerations_zone_4_6 ?? 0) + (latestGps.decelerations_zone_4_6 ?? 0)
        : null,
      groinSqueeze: latestSqueeze
        ? Math.max(latestSqueeze.l_max_force ?? 0, latestSqueeze.r_max_force ?? 0)
        : null,
      hamstringIso: latestNord
        ? Math.max(latestNord.l_max_force ?? 0, latestNord.r_max_force ?? 0)
        : null,
    },
    bodyWeightLb: kgToLbs(latestJump?.body_weight_kg ?? null),
    asymmetry: {
      forceFramePct: latestSqueeze?.max_imbalance ?? null,
      nordBordPct: latestNord?.max_imbalance ?? null,
    },
    dataFreshness: {
      gps: displayGps?.session_date ?? null,
      jump: latestJump?.test_date ?? null,
      forceFrame: forceRows?.[0]?.test_date ?? null,
      nordBord: latestNord?.test_date ?? null,
    },
    requiredMetrics: {
      group,
      items: requiredMetrics,
    },
    flags,
  };
}

export { getPositionGroupLabel };
