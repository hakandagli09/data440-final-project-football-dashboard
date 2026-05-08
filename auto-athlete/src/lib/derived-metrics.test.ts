import { computeEwma, computeHsbi, computeSprintRecency, getWeekStart } from "@/lib/derived-metrics";
import { computePlayerFlags, getNormalizedHsr, readinessFromFlagCount } from "@/lib/flagging";
import { getPositionGroup } from "@/lib/position-groups";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Position mapping edge cases
assert(getPositionGroup("QB") === "skills_mids", "QB should map to skills_mids");
assert(getPositionGroup("LG") === "bigs", "LG should map to bigs");
assert(getPositionGroup("edge rusher") === "skills_mids", "EDGE variant should map to skills_mids");

// EWMA correctness checks
const ewma = computeEwma([10, 20, 30], 0.5);
assert(ewma.length === 3, "EWMA output length should equal input length");
assert(Math.abs(ewma[2] - 22.5) < 0.0001, "EWMA with lambda=0.5 should produce expected value");

// Days-since recency thresholds
const recency = computeSprintRecency([
  { date: "2026-04-01", maxSpeed: 6.0 },
  { date: "2026-04-03", maxSpeed: 8.0 },
  { date: "2026-04-08", maxSpeed: 5.0 },
]);
assert(recency.daysSince90 === 5, "daysSince90 should be based on latest >=90% exposure");
assert(recency.daysSince85 === 5, "daysSince85 should be based on latest >=85% exposure");

// Weekly aggregation window boundary helper
assert(getWeekStart("2026-04-08") === "2026-04-06", "Week start should resolve to Monday");

// Simple derived formula check
assert(computeHsbi(12, 8) === 96, "HSBI should equal zone4_6_decels * maxSpeed");

// HSR normalization changed with the 2026 GPS export.
assert(
  getNormalizedHsr({
    session_date: "2025-11-01",
    high_speed_running: 42,
    distance_zone_4_6: 7,
  }) === 42,
  "Pre-2026 HSR should use the legacy high_speed_running column"
);
assert(
  getNormalizedHsr({
    session_date: "2026-02-01",
    high_speed_running: 7,
    distance_zone_4_6: 42,
  }) === 42,
  "2026+ HSR should use Distance Zone 4-6"
);

// Readiness color thresholds: no flags green, one/two yellow, three-plus red.
assert(readinessFromFlagCount(0) === "green", "Zero flags should be green");
assert(readinessFromFlagCount(1) === "yellow", "One flag should be yellow");
assert(readinessFromFlagCount(3) === "red", "Three flags should be red");
assert(readinessFromFlagCount(0, false) === "neutral", "No data should be neutral");

const oneDayFlags = computePlayerFlags({
  status: "cleared",
  gpsRows: [
    {
      player_id: "p1",
      session_date: "2026-02-28",
      max_speed: 18,
      high_speed_running: 0,
      distance_zone_4_6: 100,
      accelerations_zone_4_6: 10,
      decelerations_zone_4_6: 10,
    },
  ],
});
assert(oneDayFlags.length === 0, "One day of GPS data should not produce trend flags");

const threeDayGpsFlags = computePlayerFlags({
  status: "cleared",
  gpsRows: [
    {
      player_id: "p1",
      session_date: "2026-01-01",
      max_speed: 20,
      high_speed_running: 0,
      distance_zone_4_6: 1,
      accelerations_zone_4_6: 1,
      decelerations_zone_4_6: 1,
    },
    {
      player_id: "p1",
      session_date: "2026-01-02",
      max_speed: 15,
      high_speed_running: 0,
      distance_zone_4_6: 1,
      accelerations_zone_4_6: 1,
      decelerations_zone_4_6: 1,
    },
    {
      player_id: "p1",
      session_date: "2026-01-09",
      max_speed: 15,
      high_speed_running: 0,
      distance_zone_4_6: 10,
      accelerations_zone_4_6: 4,
      decelerations_zone_4_6: 4,
    },
  ],
});
assert(threeDayGpsFlags.length === 0, "Three GPS days should build baseline, not create flags");

const flags = computePlayerFlags({
  status: "cleared",
  gpsRows: [
    {
      player_id: "p1",
      session_date: "2026-01-01",
      max_speed: 20,
      high_speed_running: 0,
      distance_zone_4_6: 1,
      accelerations_zone_4_6: 1,
      decelerations_zone_4_6: 1,
    },
    {
      player_id: "p1",
      session_date: "2026-01-02",
      max_speed: 15,
      high_speed_running: 0,
      distance_zone_4_6: 1,
      accelerations_zone_4_6: 1,
      decelerations_zone_4_6: 1,
    },
    {
      player_id: "p1",
      session_date: "2026-01-03",
      max_speed: 15,
      high_speed_running: 0,
      distance_zone_4_6: 1,
      accelerations_zone_4_6: 1,
      decelerations_zone_4_6: 1,
    },
    {
      player_id: "p1",
      session_date: "2026-01-04",
      max_speed: 15,
      high_speed_running: 0,
      distance_zone_4_6: 1,
      accelerations_zone_4_6: 1,
      decelerations_zone_4_6: 1,
    },
    {
      player_id: "p1",
      session_date: "2026-01-05",
      max_speed: 15,
      high_speed_running: 0,
      distance_zone_4_6: 1,
      accelerations_zone_4_6: 1,
      decelerations_zone_4_6: 1,
    },
    {
      player_id: "p1",
      session_date: "2026-01-10",
      max_speed: 15,
      high_speed_running: 0,
      distance_zone_4_6: 20,
      accelerations_zone_4_6: 8,
      decelerations_zone_4_6: 8,
    },
  ],
  jumpRows: [
    {
      player_id: "p1",
      test_date: "2026-01-01",
      jump_height_in: 20,
      rsi_modified: 2,
      concentric_impulse: 200,
      eccentric_braking_impulse: 120,
      eccentric_duration_ms: 300,
      contraction_time_ms: 500,
    },
    {
      player_id: "p1",
      test_date: "2026-01-10",
      jump_height_in: 17,
      rsi_modified: 1.7,
      concentric_impulse: 170,
      eccentric_braking_impulse: 100,
      eccentric_duration_ms: 340,
      contraction_time_ms: 560,
    },
  ],
});
assert(flags.some((flag) => flag.key === "speed_recency_90"), "Sprint recency flag should fire at 7+ days");
assert(flags.some((flag) => flag.key === "hsr_ewma_high"), "HSR EWMA flag should use normalized 2026 HSR");
assert(flags.some((flag) => flag.key === "cmj_jump_height_down"), "CMJ output drops should compare latest to recent best");
