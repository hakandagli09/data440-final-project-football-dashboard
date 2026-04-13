import {
  getAvailableSessionDates,
  getDashboardData,
  getLatestSessionPlayerCount,
  getLatestSessionSummary,
  getTeamMetricSummary,
  getTopPlayersByMetric,
  type ChatMetric,
} from "@/lib/queries";
import {
  findPlayersByName,
  getPlayerProfile,
  getPlayersByStatus,
  getPlayersList,
  getRosterCount,
  type PlayerStatus,
} from "@/lib/player-queries";
import {
  getGroupedDailyMetrics,
  getGroupedWeeklySums,
  getPositionReportData,
} from "@/lib/group-queries";
import {
  queryAnalyticsView,
  type AnalyticsQueryFilters,
  type AnalyticsViewName,
} from "@/lib/chat-analytics";
import type { ToolDefinition, ToolResult } from "@/lib/chat-types";

type GroupFilter = "skills_mids" | "bigs";
type SortDirection = "asc" | "desc";

/** Keep tool payloads small to stay within Groq free-tier TPM limits.
 *  Profile payloads need a higher budget so required-metrics + fatigue
 *  data don't get silently truncated. */
const MAX_TOOL_RESULT_CHARS = 4000;
const MAX_TOOL_RESULT_CHARS_PROFILE = 6000;
const MAX_RESULT_LIST_ITEMS = 12;
const MAX_STRING_PREVIEW_CHARS = 220;
const EXACT_TOOL_CACHE_TTL_MS = 60 * 1000;

type CachedToolEntry = {
  expiresAt: number;
  result: string;
};

const exactToolCache = new Map<string, CachedToolEntry>();
const CACHEABLE_TOOL_NAMES = new Set([
  "get_available_session_dates",
  "get_roster_count",
  "find_player_by_name",
  "get_players_by_status",
  "get_latest_session_player_count",
  "get_latest_session_summary",
  "get_top_players_by_metric",
  "get_team_metric_summary",
]);

function createObjectSchema(
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
  };
}

function asOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Tool argument "${fieldName}" must be a string if provided.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asRequiredString(value: unknown, fieldName: string): string {
  const parsed = asOptionalString(value, fieldName);
  if (!parsed) {
    throw new Error(`Tool argument "${fieldName}" is required.`);
  }
  return parsed;
}

function asOptionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Tool argument "${fieldName}" must be a number if provided.`);
  }
  return value;
}

function asOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Tool argument "${fieldName}" must be an array of strings if provided.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function asOptionalRecord(
  value: unknown,
  fieldName: string
): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Tool argument "${fieldName}" must be an object if provided.`);
  }
  return value as Record<string, unknown>;
}

function asGroup(value: unknown): GroupFilter {
  if (value === "skills_mids" || value === "bigs") {
    return value;
  }
  throw new Error('Tool argument "group" must be "skills_mids" or "bigs".');
}

function asOptionalGroup(value: unknown): GroupFilter | undefined {
  if (value == null) return undefined;
  return asGroup(value);
}

function asPlayerStatus(value: unknown): PlayerStatus {
  if (
    value === "injured" ||
    value === "rehab" ||
    value === "return_to_play" ||
    value === "cleared"
  ) {
    return value;
  }
  throw new Error(
    'Tool argument "status" must be "injured", "rehab", "return_to_play", or "cleared".'
  );
}

function asChatMetric(value: unknown): ChatMetric {
  if (
    value === "total_distance" ||
    value === "max_speed" ||
    value === "high_speed_running" ||
    value === "dynamic_stress_load" ||
    value === "distance_zone_6" ||
    value === "collision_load" ||
    value === "accelerations_zone_4_6" ||
    value === "decelerations_zone_4_6" ||
    value === "hml_efforts"
  ) {
    return value;
  }
  throw new Error(`Tool argument "metric" is not an approved metric.`);
}

function asAnalyticsView(value: unknown): AnalyticsViewName {
  if (
    value === "chat_players" ||
    value === "chat_gps_daily" ||
    value === "chat_jump_latest" ||
    value === "chat_risk_signals"
  ) {
    return value;
  }
  throw new Error(`Tool argument "view" is not an approved analytics view.`);
}

function asSortDirection(value: unknown): SortDirection {
  if (value === "asc" || value === "desc") {
    return value;
  }
  throw new Error('Tool argument "direction" must be "asc" or "desc".');
}

function asAnalyticsFilters(value: unknown): AnalyticsQueryFilters | undefined {
  const record = asOptionalRecord(value, "filters");
  if (!record) return undefined;

  return {
    playerId: asOptionalString(record.playerId, "filters.playerId"),
    playerName: asOptionalString(record.playerName, "filters.playerName"),
    position: asOptionalString(record.position, "filters.position"),
    group: asOptionalGroup(record.group),
    status: asOptionalString(record.status, "filters.status"),
    startDate: asOptionalString(record.startDate, "filters.startDate"),
    endDate: asOptionalString(record.endDate, "filters.endDate"),
  };
}

function asAnalyticsOrderBy(
  value: unknown
): { column: string; direction: SortDirection } | undefined {
  const record = asOptionalRecord(value, "orderBy");
  if (!record) return undefined;

  return {
    column: asRequiredString(record.column, "orderBy.column"),
    direction: asSortDirection(record.direction),
  };
}

function summarizeToolValue(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return {
      type: "array",
      totalCount: value.length,
    };
  }

  if (value && typeof value === "object") {
    return {
      type: "object",
      keys: Object.keys(value as Record<string, unknown>).slice(0, 12),
    };
  }

  return {
    type: typeof value,
  };
}

function compactToolValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_RESULT_LIST_ITEMS).map(compactToolValue);
    return value.length > MAX_RESULT_LIST_ITEMS
      ? {
          totalCount: value.length,
          returnedCount: items.length,
          hasMore: true,
          items,
        }
      : items;
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_PREVIEW_CHARS
      ? `${value.slice(0, MAX_STRING_PREVIEW_CHARS)}...`
      : value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => [key, compactToolValue(entryValue)])
  );
}

function stringifyToolResult(value: unknown, maxChars: number = MAX_TOOL_RESULT_CHARS): string {
  const compactPayload = { data: compactToolValue(value) };
  const compactRaw = JSON.stringify(compactPayload, null, 2);
  if (compactRaw.length <= maxChars) {
    return compactRaw;
  }

  const summarizedPayload = {
    truncated: true,
    summary: summarizeToolValue(value),
    data: compactToolValue(value),
  };
  const summarizedRaw = JSON.stringify(summarizedPayload, null, 2);
  if (summarizedRaw.length <= maxChars) {
    return summarizedRaw;
  }

  return JSON.stringify(
    {
      truncated: true,
      summary: summarizeToolValue(value),
    },
    null,
    2
  );
}

function buildCacheKey(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

function getCachedToolResult(name: string, args: Record<string, unknown>): string | null {
  if (!CACHEABLE_TOOL_NAMES.has(name)) return null;

  const cacheKey = buildCacheKey(name, args);
  const cached = exactToolCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    exactToolCache.delete(cacheKey);
    return null;
  }
  return cached.result;
}

function setCachedToolResult(
  name: string,
  args: Record<string, unknown>,
  result: string
): void {
  if (!CACHEABLE_TOOL_NAMES.has(name)) return;

  exactToolCache.set(buildCacheKey(name, args), {
    expiresAt: Date.now() + EXACT_TOOL_CACHE_TTL_MS,
    result,
  });
}

export const chatToolDefinitions: ToolDefinition[] = [
  {
    name: "get_dashboard_data",
    description:
      "Fetch the main team dashboard snapshot for a session date or the most recent session.",
    parameters: createObjectSchema({
      date: {
        type: "string",
        description: "Optional session date in YYYY-MM-DD format.",
      },
    }),
  },
  {
    name: "get_available_session_dates",
    description: "Fetch the available GPS session dates, ordered most recent first.",
    parameters: createObjectSchema({}),
  },
  {
    name: "get_players_list",
    description: "Fetch the current roster list with readiness, status, and flags.",
    parameters: createObjectSchema({}),
  },
  {
    name: "get_roster_count",
    description: "Fetch the exact roster count and status breakdown.",
    parameters: createObjectSchema({}),
  },
  {
    name: "find_player_by_name",
    description: "Find a player by full or partial name and return the best matches.",
    parameters: createObjectSchema(
      {
        name: {
          type: "string",
          description: "The player name to look up.",
        },
      },
      ["name"]
    ),
  },
  {
    name: "get_players_by_status",
    description: "Fetch players with a specific injury or clearance status.",
    parameters: createObjectSchema(
      {
        status: {
          type: "string",
          enum: ["injured", "rehab", "return_to_play", "cleared"],
          description: "The player status to filter by.",
        },
      },
      ["status"]
    ),
  },
  {
    name: "get_player_profile",
    description:
      "Fetch the profile, recency, trends, fatigue, and flags for one player by player ID.",
    parameters: createObjectSchema(
      {
        playerId: {
          type: "string",
          description: "The player's UUID.",
        },
      },
      ["playerId"]
    ),
  },
  {
    name: "get_latest_session_player_count",
    description:
      "Fetch the exact number of tracked players for a session date or the latest session.",
    parameters: createObjectSchema({
      date: {
        type: "string",
        description: "Optional session date in YYYY-MM-DD format.",
      },
    }),
  },
  {
    name: "get_latest_session_summary",
    description: "Fetch a compact summary of the latest or selected GPS session.",
    parameters: createObjectSchema({
      date: {
        type: "string",
        description: "Optional session date in YYYY-MM-DD format.",
      },
    }),
  },
  {
    name: "get_top_players_by_metric",
    description: "Fetch the top players on a session date for one approved GPS metric.",
    parameters: createObjectSchema(
      {
        metric: {
          type: "string",
          enum: [
            "total_distance",
            "max_speed",
            "high_speed_running",
            "dynamic_stress_load",
            "distance_zone_6",
            "collision_load",
            "accelerations_zone_4_6",
            "decelerations_zone_4_6",
            "hml_efforts",
          ],
          description: "The approved metric key to rank players by.",
        },
        date: {
          type: "string",
          description: "Optional session date in YYYY-MM-DD format.",
        },
        limit: {
          type: "number",
          description: "Optional number of players to return, max 10.",
        },
        positionGroup: {
          type: "string",
          enum: ["skills_mids", "bigs"],
          description: "Optional position group filter.",
        },
      },
      ["metric"]
    ),
  },
  {
    name: "get_team_metric_summary",
    description:
      "Fetch an aggregate team summary for one approved GPS metric over a date range.",
    parameters: createObjectSchema(
      {
        metric: {
          type: "string",
          enum: [
            "total_distance",
            "max_speed",
            "high_speed_running",
            "dynamic_stress_load",
            "distance_zone_6",
            "collision_load",
            "accelerations_zone_4_6",
            "decelerations_zone_4_6",
            "hml_efforts",
          ],
          description: "The approved metric key to summarize.",
        },
        startDate: {
          type: "string",
          description: "Optional start date in YYYY-MM-DD format.",
        },
        endDate: {
          type: "string",
          description: "Optional end date in YYYY-MM-DD format.",
        },
        positionGroup: {
          type: "string",
          enum: ["skills_mids", "bigs"],
          description: "Optional position group filter.",
        },
      },
      ["metric"]
    ),
  },
  {
    name: "get_position_report",
    description:
      "Fetch the full position report bundle for a date, including daily and weekly sheets.",
    parameters: createObjectSchema({
      date: {
        type: "string",
        description: "Optional session date in YYYY-MM-DD format.",
      },
    }),
  },
  {
    name: "get_grouped_daily_metrics",
    description:
      "Fetch daily positional report rows for one group and one session date.",
    parameters: createObjectSchema(
      {
        date: {
          type: "string",
          description: "Session date in YYYY-MM-DD format.",
        },
        group: {
          type: "string",
          enum: ["skills_mids", "bigs"],
          description: "Position group to fetch.",
        },
      },
      ["date", "group"]
    ),
  },
  {
    name: "get_grouped_weekly_sums",
    description:
      "Fetch weekly positional report rows for one group using a week-ending date or week start date.",
    parameters: createObjectSchema(
      {
        weekStart: {
          type: "string",
          description: "Week reference date in YYYY-MM-DD format.",
        },
        group: {
          type: "string",
          enum: ["skills_mids", "bigs"],
          description: "Position group to fetch.",
        },
      },
      ["weekStart", "group"]
    ),
  },
  {
    name: "query_analytics_view",
    description:
      "Query one approved read-only analytics view with strict filters, column selection, ordering, and row limits. Views: chat_players (roster+flags), chat_gps_daily (GPS metrics incl. hml_distance, hmld_per_minute, fatigue_index, lower_speed_loading), chat_jump_latest (CMJ metrics + asymmetry %), chat_risk_signals (sprint recency, jump output, groin/hamstring force, asymmetry, flag_count).",
    parameters: createObjectSchema(
      {
        view: {
          type: "string",
          enum: [
            "chat_players",
            "chat_gps_daily",
            "chat_jump_latest",
            "chat_risk_signals",
          ],
          description: "The approved analytics view to query.",
        },
        filters: createObjectSchema({
          playerId: { type: "string" },
          playerName: { type: "string" },
          position: { type: "string" },
          group: { type: "string", enum: ["skills_mids", "bigs"] },
          status: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
        }),
        select: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of approved columns to select.",
        },
        orderBy: createObjectSchema(
          {
            column: { type: "string" },
            direction: { type: "string", enum: ["asc", "desc"] },
          },
          ["column", "direction"]
        ),
        limit: {
          type: "number",
          description: "Optional row limit, max 25.",
        },
      },
      ["view"]
    ),
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const cachedResult = getCachedToolResult(name, args);
  if (cachedResult) {
    return {
      toolCallId: "",
      name,
      result: cachedResult,
    };
  }

  let result: unknown;

  switch (name) {
    case "get_dashboard_data":
      result = await getDashboardData(asOptionalString(args.date, "date"));
      break;
    case "get_available_session_dates":
      result = await getAvailableSessionDates();
      break;
    case "get_players_list":
      result = await getPlayersList();
      break;
    case "get_roster_count":
      result = await getRosterCount();
      break;
    case "find_player_by_name":
      result = await findPlayersByName(asRequiredString(args.name, "name"));
      break;
    case "get_players_by_status":
      result = await getPlayersByStatus(asPlayerStatus(args.status));
      break;
    case "get_player_profile":
      result = await getPlayerProfile(asRequiredString(args.playerId, "playerId"));
      break;
    case "get_latest_session_player_count":
      result = await getLatestSessionPlayerCount(asOptionalString(args.date, "date"));
      break;
    case "get_latest_session_summary":
      result = await getLatestSessionSummary(asOptionalString(args.date, "date"));
      break;
    case "get_top_players_by_metric":
      result = await getTopPlayersByMetric(
        asChatMetric(args.metric),
        asOptionalString(args.date, "date"),
        asOptionalNumber(args.limit, "limit"),
        asOptionalGroup(args.positionGroup)
      );
      break;
    case "get_team_metric_summary":
      result = await getTeamMetricSummary(
        asChatMetric(args.metric),
        asOptionalString(args.startDate, "startDate"),
        asOptionalString(args.endDate, "endDate"),
        asOptionalGroup(args.positionGroup)
      );
      break;
    case "get_position_report":
      result = await getPositionReportData(asOptionalString(args.date, "date"));
      break;
    case "get_grouped_daily_metrics":
      result = await getGroupedDailyMetrics(
        asRequiredString(args.date, "date"),
        asGroup(args.group)
      );
      break;
    case "get_grouped_weekly_sums":
      result = await getGroupedWeeklySums(
        asRequiredString(args.weekStart, "weekStart"),
        asGroup(args.group)
      );
      break;
    case "query_analytics_view":
      result = await queryAnalyticsView({
        view: asAnalyticsView(args.view),
        filters: asAnalyticsFilters(args.filters),
        select: asOptionalStringArray(args.select, "select"),
        orderBy: asAnalyticsOrderBy(args.orderBy),
        limit: asOptionalNumber(args.limit, "limit"),
      });
      break;
    default:
      throw new Error(`Unknown chat tool: ${name}`);
  }

  const charBudget = name === "get_player_profile"
    ? MAX_TOOL_RESULT_CHARS_PROFILE
    : MAX_TOOL_RESULT_CHARS;
  const serializedResult = stringifyToolResult(result, charBudget);
  setCachedToolResult(name, args, serializedResult);

  return {
    toolCallId: "",
    name,
    result: serializedResult,
  };
}
