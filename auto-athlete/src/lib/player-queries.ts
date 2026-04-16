import { supabaseServer as supabase } from "@/lib/supabase-server";
import { getPositionGroup, getPositionGroupLabel } from "@/lib/position-groups";
import { fetchAllRows } from "@/lib/supabase-paginate";

export type PlayerStatus = "injured" | "rehab" | "return_to_play" | "cleared";

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

export interface PlayerProfileData {
  id: string;
  name: string;
  position: string;
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
    jumpHeightCm: number | null;
    rsiModified: number | null;
    accelDecel46: number | null;
    groinSqueeze: number | null;
    hamstringIso: number | null;
  };
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

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((v) => (v - mean) ** 2));
  return Math.sqrt(variance);
}

function ewmaSeries(values: number[], lambda = 0.28): number[] {
  if (values.length === 0) return [];
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(lambda * values[i] + (1 - lambda) * out[i - 1]);
  }
  return out;
}

function latestStatus(
  statuses: Array<{ status: PlayerStatus; expected_return: string | null }>
): { status: PlayerStatus; expectedReturn: string | null } {
  if (statuses.length === 0) return { status: "cleared", expectedReturn: null };
  return {
    status: statuses[0].status,
    expectedReturn: statuses[0].expected_return,
  };
}

function sprintRecencyFlags(rows: GpsRow[]): {
  daysSince90: number | null;
  daysSince85: number | null;
  maxSpeed: number | null;
} {
  // Recency is computed relative to the most recent available session date.
  if (rows.length === 0) return { daysSince90: null, daysSince85: null, maxSpeed: null };
  const maxSpeed = Math.max(...rows.map((r) => r.max_speed ?? 0));
  if (maxSpeed <= 0) return { daysSince90: null, daysSince85: null, maxSpeed: null };

  const latestDate = rows[rows.length - 1].session_date;
  const threshold90 = maxSpeed * 0.9;
  const threshold85 = maxSpeed * 0.85;

  const last90 = [...rows].reverse().find((r) => (r.max_speed ?? 0) >= threshold90)?.session_date ?? null;
  const last85 = [...rows].reverse().find((r) => (r.max_speed ?? 0) >= threshold85)?.session_date ?? null;

  return {
    daysSince90: last90 ? daysBetween(last90, latestDate) : null,
    daysSince85: last85 ? daysBetween(last85, latestDate) : null,
    maxSpeed,
  };
}

function ewmaDropFlags(rows: GpsRow[]): string[] {
  // EWMA comparisons use per-player daily aggregates and a personal baseline.
  const dailyByDate = new Map<string, {
    hsr: number;
    sprint: number;
    accelDecel: number;
    explosive: number;
  }>();

  for (const row of rows) {
    const curr = dailyByDate.get(row.session_date) ?? {
      hsr: 0,
      sprint: 0,
      accelDecel: 0,
      explosive: 0,
    };
    curr.hsr += row.high_speed_running ?? 0;
    curr.sprint += row.distance_zone_6 ?? 0;
    curr.accelDecel += (row.accelerations_zone_4_6 ?? 0) + (row.decelerations_zone_4_6 ?? 0);
    curr.explosive += row.hml_efforts ?? 0;
    dailyByDate.set(row.session_date, curr);
  }

  const daily = Array.from(dailyByDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((entry) => entry[1]);

  const checks: Array<{ key: keyof typeof daily[number]; label: string }> = [
    { key: "hsr", label: "HSR EWMA below baseline" },
    { key: "sprint", label: "Sprint distance EWMA below baseline" },
    { key: "accelDecel", label: "Accel/Decel EWMA below baseline" },
    { key: "explosive", label: "Explosive efforts EWMA below baseline" },
  ];

  const flags: string[] = [];
  for (const check of checks) {
    const series = daily.map((d) => d[check.key]);
    if (series.length < 5) continue;
    const ewma = ewmaSeries(series);
    const baselineMean = average(ewma);
    const baselineStd = stdDev(ewma);
    const latest = ewma[ewma.length - 1];
    if (baselineStd > 0 && latest < baselineMean - baselineStd) {
      flags.push(check.label);
    }
  }
  return flags;
}

function computeFlags(rows: GpsRow[], status: PlayerStatus): string[] {
  if (status === "injured" || status === "rehab") return [];
  const flags: string[] = [];
  const recency = sprintRecencyFlags(rows);
  if (recency.daysSince90 != null && recency.daysSince90 >= 7) {
    flags.push(`No 90% speed exposure in ${recency.daysSince90} days`);
  }
  if (recency.daysSince85 != null && recency.daysSince85 >= 10) {
    flags.push(`No 85% speed exposure in ${recency.daysSince85} days`);
  }
  flags.push(...ewmaDropFlags(rows));
  return flags;
}

function readinessFromFlags(flags: string[]): "green" | "yellow" | "red" | "neutral" {
  if (flags.length === 0) return "green";
  if (flags.length >= 3) return "red";
  return "yellow";
}

export async function getPlayersList(): Promise<PlayerListItem[]> {
  type RosterGpsRow = {
    player_id: string;
    session_date: string;
    max_speed: number | null;
    high_speed_running: number | null;
    distance_zone_6: number | null;
    accelerations_zone_4_6: number | null;
    decelerations_zone_4_6: number | null;
    hml_efforts: number | null;
  };

  // Full-history GPS fetch (no date filter) across all players will
  // hit PostgREST's 1000-row cap immediately on a populated table, so
  // page through it — otherwise the roster's flag/readiness counts are
  // computed from a truncated slice of the data.
  const [{ data: players }, { data: injuries }, gpsRowsAll] = await Promise.all([
    supabase.from("players").select("id, name, position").order("name", { ascending: true }),
    supabase
      .from("injuries")
      .select("player_id, status, expected_return, updated_at")
      .order("updated_at", { ascending: false }),
    fetchAllRows<RosterGpsRow>(() =>
      supabase
        .from("gps_sessions")
        .select("player_id, session_date, max_speed, high_speed_running, distance_zone_6, accelerations_zone_4_6, decelerations_zone_4_6, hml_efforts")
    ),
  ]);
  const gpsRows = gpsRowsAll;

  const injuryMap = new Map<string, Array<{ status: PlayerStatus; expected_return: string | null }>>();
  for (const row of injuries ?? []) {
    const list = injuryMap.get(row.player_id) ?? [];
    list.push({
      status: row.status as PlayerStatus,
      expected_return: row.expected_return,
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

  const out: PlayerListItem[] = [];
  for (const player of players ?? []) {
    const statusData = latestStatus(injuryMap.get(player.id) ?? []);
    const rows = gpsMap.get(player.id) ?? [];
    const flags = computeFlags(rows, statusData.status);
    const latestSessionDate = rows.length > 0 ? rows[rows.length - 1].session_date : null;

    out.push({
      id: player.id,
      name: player.name,
      position: player.position ?? "—",
      latestSessionDate,
      status: statusData.status,
      expectedReturn: statusData.expectedReturn,
      readiness: rows.length === 0 ? "neutral" : readinessFromFlags(flags),
      flags,
    });
  }

  return out;
}

export async function getRosterCount(): Promise<RosterCountData> {
  const players = await getPlayersList();
  const statusCounts: Record<PlayerStatus, number> = {
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

export async function getPlayerProfile(playerId: string): Promise<PlayerProfileData | null> {
  // At drill-level granularity a single player can accumulate >1000
  // rows over a full season (~13 drills/practice × ~50 practices), so
  // paginate their GPS history here too.
  const [{ data: player }, { data: injuries }, gpsRowsAll, { data: jumpRows }, { data: forceRows }, { data: nordRows }] = await Promise.all([
    supabase.from("players").select("id, name, position").eq("id", playerId).maybeSingle(),
    supabase
      .from("injuries")
      .select("status, expected_return, updated_at")
      .eq("player_id", playerId)
      .order("updated_at", { ascending: false })
      .limit(1),
    fetchAllRows<GpsRow>(() =>
      supabase
        .from("gps_sessions")
        .select("player_id, session_date, max_speed, pct_max_speed, high_speed_running, distance_zone_6, dynamic_stress_load, accelerations_zone_4_6, decelerations_zone_4_6, hml_efforts, total_distance, hml_distance, hmld_per_minute, lower_speed_loading, collision_load")
        .eq("player_id", playerId)
        .order("session_date", { ascending: true })
    ),
    supabase
      .from("jump_tests")
      .select("test_date, jump_height_cm, rsi_modified, body_weight_kg")
      .eq("player_id", playerId)
      .order("test_date", { ascending: false })
      .limit(1),
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

  const status = (injuries?.[0]?.status as PlayerStatus | undefined) ?? "cleared";
  const expectedReturn = injuries?.[0]?.expected_return ?? null;
  const rows = gpsRowsAll;
  const recency = sprintRecencyFlags(rows);
  const flags = computeFlags(rows, status);

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
    curr.hsr += row.high_speed_running ?? 0;
    curr.sprintDistance += row.distance_zone_6 ?? 0;
    curr.dsl += row.dynamic_stress_load ?? 0;
    byDate.set(row.session_date, curr);
  }

  const trends = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, values]) => ({ date, ...values }));

  const latestJump = jumpRows?.[0];
  const latestSqueeze = forceRows?.find((row) => (row.direction ?? "").toLowerCase() === "squeeze");
  const latestNord = nordRows?.[0];
  const latestGps = rows.length > 0 ? rows[rows.length - 1] : null;
  const group = getPositionGroup(player.position);

  const topSpeed = recency.maxSpeed ?? 0;
  const pctMaxVelocity = latestGps && topSpeed > 0 ? ((latestGps.max_speed ?? 0) / topSpeed) * 100 : null;
  const hsbi = latestGps ? (latestGps.decelerations_zone_4_6 ?? 0) * (latestGps.max_speed ?? 0) : null;
  const weeklyRows = rows.filter((r) => {
    const latest = rows.length > 0 ? rows[rows.length - 1].session_date : null;
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

  const ewmaHsr = dailyAgg.length > 0 ? ewmaSeries(dailyAgg.map((d) => d.hsr)).at(-1) ?? null : null;
  const ewmaZone6 = dailyAgg.length > 0 ? ewmaSeries(dailyAgg.map((d) => d.sprintDistance)).at(-1) ?? null : null;
  const ewmaAccelDecel = dailyAgg.length > 0 ? ewmaSeries(dailyAgg.map((d) => d.accelDecel)).at(-1) ?? null : null;
  const ewmaExplosive = dailyAgg.length > 0 ? ewmaSeries(dailyAgg.map((d) => d.explosive)).at(-1) ?? null : null;

  // Required metrics are rendered as profile cards and differ by position group.
  const requiredMetrics = group === "bigs"
    ? [
      { label: "Total Distance", value: latestGps?.total_distance ?? null, unit: "m" },
      { label: "DSL", value: latestGps?.dynamic_stress_load ?? null, unit: "AU" },
      { label: "Lower Speed Loading", value: latestGps?.lower_speed_loading ?? null, unit: "AU" },
      { label: "HML Distance", value: latestGps?.hml_distance ?? null, unit: "m" },
      { label: "HMLD Per Minute", value: latestGps?.hmld_per_minute ?? null },
      { label: "HSR", value: latestGps?.high_speed_running ?? null, unit: "m" },
      { label: "Zone 4-6 Accelerations", value: latestGps?.accelerations_zone_4_6 ?? null },
      { label: "Explosive Efforts", value: latestGps?.hml_efforts ?? null },
      { label: "Max Velocity", value: latestGps?.max_speed ?? null, unit: "m/s" },
      { label: "% Max Velocity", value: pctMaxVelocity, unit: "%" },
      { label: "Collision Load", value: latestGps?.collision_load ?? null, unit: "AU" },
    ]
    : [
      { label: "Total Distance", value: latestGps?.total_distance ?? null, unit: "m" },
      { label: "HSR", value: latestGps?.high_speed_running ?? null, unit: "m" },
      { label: "Zone 6 Sprint Distance", value: latestGps?.distance_zone_6 ?? null, unit: "m" },
      { label: "Zone 4-6 Accelerations", value: latestGps?.accelerations_zone_4_6 ?? null },
      { label: "Zone 4-6 Decelerations", value: latestGps?.decelerations_zone_4_6 ?? null },
      { label: "DSL", value: latestGps?.dynamic_stress_load ?? null, unit: "AU" },
      { label: "HML Distance", value: latestGps?.hml_distance ?? null, unit: "m" },
      { label: "HMLD Per Minute", value: latestGps?.hmld_per_minute ?? null },
      { label: "Max Velocity", value: latestGps?.max_speed ?? null, unit: "m/s" },
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
      rsiModified: latestJump?.rsi_modified ?? null,
      accelDecel46: rows.length > 0
        ? (rows[rows.length - 1].accelerations_zone_4_6 ?? 0) + (rows[rows.length - 1].decelerations_zone_4_6 ?? 0)
        : null,
      groinSqueeze: latestSqueeze
        ? Math.max(latestSqueeze.l_max_force ?? 0, latestSqueeze.r_max_force ?? 0)
        : null,
      hamstringIso: latestNord
        ? Math.max(latestNord.l_max_force ?? 0, latestNord.r_max_force ?? 0)
        : null,
    },
    asymmetry: {
      forceFramePct: latestSqueeze?.max_imbalance ?? null,
      nordBordPct: latestNord?.max_imbalance ?? null,
    },
    dataFreshness: {
      gps: latestGps?.session_date ?? null,
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
