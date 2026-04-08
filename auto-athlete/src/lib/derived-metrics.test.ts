import { computeEwma, computeHsbi, computeSprintRecency, getWeekStart } from "@/lib/derived-metrics";
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
