import {
  getAvailableSessionDates,
  getDashboardData,
} from "@/lib/queries";
import {
  getPlayerProfile,
  getPlayersList,
} from "@/lib/player-queries";
import {
  getGroupedDailyMetrics,
  getGroupedWeeklySums,
  getPositionReportData,
} from "@/lib/group-queries";
import type { ToolDefinition, ToolResult } from "@/lib/chat-types";

type GroupFilter = "skills_mids" | "bigs";

const MAX_TOOL_RESULT_CHARS = 15000;

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

function asGroup(value: unknown): GroupFilter {
  if (value === "skills_mids" || value === "bigs") {
    return value;
  }
  throw new Error('Tool argument "group" must be "skills_mids" or "bigs".');
}

function stringifyToolResult(value: unknown): string {
  const payload = { data: value };
  const raw = JSON.stringify(payload, null, 2);
  if (raw.length <= MAX_TOOL_RESULT_CHARS) {
    return raw;
  }

  // Keep tool payloads bounded so the follow-up model call stays reliable.
  return JSON.stringify(
    {
      truncated: true,
      dataPreview: raw.slice(0, MAX_TOOL_RESULT_CHARS),
    },
    null,
    2
  );
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
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
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
    case "get_player_profile":
      result = await getPlayerProfile(asRequiredString(args.playerId, "playerId"));
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
    default:
      throw new Error(`Unknown chat tool: ${name}`);
  }

  return {
    toolCallId: "",
    name,
    result: stringifyToolResult(result),
  };
}
