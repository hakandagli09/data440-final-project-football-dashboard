/**
 * Supabase query functions for the dashboard.
 *
 * All aggregation (avg, max, sum) is done in TypeScript since we're
 * working with ~30-50 rows per session — no need for Supabase RPCs.
 */

import { supabase } from "./supabase";

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

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

// ─── Queries ──────────────────────────────────────────────────────────────

/** Get all distinct session dates, most recent first. */
export async function getAvailableSessionDates(): Promise<string[]> {
  const { data } = await supabase
    .from("gps_sessions")
    .select("session_date")
    .order("session_date", { ascending: false });

  if (!data) return [];
  const unique = Array.from(new Set(data.map((r) => r.session_date as string)));
  return unique;
}

/** Get raw GPS rows for a specific session date. */
async function getSessionGpsRows(date: string) {
  const { data } = await supabase
    .from("gps_sessions")
    .select("*, players(name, position)")
    .eq("session_date", date);

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
