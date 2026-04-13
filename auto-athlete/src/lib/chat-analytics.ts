import { supabaseServer as supabase } from "@/lib/supabase-server";

export type AnalyticsViewName =
  | "chat_players"
  | "chat_gps_daily"
  | "chat_jump_latest"
  | "chat_risk_signals";

type GroupFilter = "skills_mids" | "bigs";
type SortDirection = "asc" | "desc";

export interface AnalyticsQueryFilters {
  playerId?: string;
  playerName?: string;
  position?: string;
  group?: GroupFilter;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface AnalyticsQueryInput {
  view: AnalyticsViewName;
  filters?: AnalyticsQueryFilters;
  select?: string[];
  orderBy?: {
    column: string;
    direction: SortDirection;
  };
  limit?: number;
}

type FilterKey = keyof AnalyticsQueryFilters;

type AnalyticsViewConfig = {
  defaultColumns: string[];
  allowedColumns: readonly string[];
  allowedFilterColumns: Partial<Record<FilterKey, string>>;
  defaultOrderBy: { column: string; direction: SortDirection };
  allowedOrderColumns: readonly string[];
  dateColumn?: string;
};

type FilterableQueryBuilder = {
  gte(column: string, value: string): FilterableQueryBuilder;
  lte(column: string, value: string): FilterableQueryBuilder;
  ilike(column: string, value: string): FilterableQueryBuilder;
  eq(column: string, value: string): FilterableQueryBuilder;
};

type SelectableQueryBuilder = FilterableQueryBuilder & {
  order(column: string, options: { ascending: boolean }): SelectableQueryBuilder;
  limit(count: number): SelectableQueryBuilder;
};

type ReadonlyViewClient = {
  from(view: string): {
    select(
      columns: string,
      options?: { count?: "exact"; head?: boolean }
    ): SelectableQueryBuilder;
  };
};

type QueryError = {
  message: string;
} | null;

type CountQueryResponse = {
  count: number | null;
  error: QueryError;
};

type RowsQueryResponse = {
  data: Record<string, unknown>[] | null;
  error: QueryError;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

const APPROVED_VIEWS: Record<AnalyticsViewName, AnalyticsViewConfig> = {
  chat_players: {
    defaultColumns: [
      "id",
      "name",
      "position",
      "position_group",
      "status",
      "expected_return",
      "latest_session_date",
      "flag_count",
    ],
    allowedColumns: [
      "id",
      "name",
      "position",
      "position_group",
      "status",
      "expected_return",
      "latest_session_date",
      "days_since_90",
      "days_since_85",
      "flag_count",
    ],
    allowedFilterColumns: {
      playerId: "id",
      playerName: "name",
      position: "position",
      group: "position_group",
      status: "status",
    },
    defaultOrderBy: { column: "name", direction: "asc" },
    allowedOrderColumns: [
      "name",
      "position",
      "status",
      "latest_session_date",
      "flag_count",
      "days_since_90",
      "days_since_85",
    ],
  },
  chat_gps_daily: {
    defaultColumns: [
      "session_date",
      "player_id",
      "player_name",
      "position",
      "position_group",
      "status",
      "total_distance",
      "high_speed_running",
      "distance_zone_6",
      "dynamic_stress_load",
      "max_speed",
    ],
    allowedColumns: [
      "session_date",
      "player_id",
      "player_name",
      "position",
      "position_group",
      "status",
      "session_title",
      "drill_titles",
      "total_distance",
      "high_speed_running",
      "distance_zone_6",
      "dynamic_stress_load",
      "accelerations_zone_4_6",
      "decelerations_zone_4_6",
      "accel_decel",
      "hml_efforts",
      "collision_load",
      "max_speed",
      "pct_max_speed",
    ],
    allowedFilterColumns: {
      playerId: "player_id",
      playerName: "player_name",
      position: "position",
      group: "position_group",
      status: "status",
    },
    defaultOrderBy: { column: "session_date", direction: "desc" },
    allowedOrderColumns: [
      "session_date",
      "player_name",
      "total_distance",
      "high_speed_running",
      "distance_zone_6",
      "dynamic_stress_load",
      "max_speed",
    ],
    dateColumn: "session_date",
  },
  chat_jump_latest: {
    defaultColumns: [
      "player_id",
      "player_name",
      "position",
      "position_group",
      "status",
      "test_date",
      "jump_height_cm",
      "rsi_modified",
      "peak_power_per_bm",
    ],
    allowedColumns: [
      "player_id",
      "player_name",
      "position",
      "position_group",
      "status",
      "test_date",
      "jump_height_cm",
      "rsi_modified",
      "peak_power_per_bm",
      "concentric_peak_force_per_bm",
      "eccentric_braking_impulse",
      "eccentric_deceleration_rfd",
      "eccentric_duration_ms",
      "countermovement_depth_cm",
    ],
    allowedFilterColumns: {
      playerId: "player_id",
      playerName: "player_name",
      position: "position",
      group: "position_group",
      status: "status",
    },
    defaultOrderBy: { column: "test_date", direction: "desc" },
    allowedOrderColumns: [
      "test_date",
      "player_name",
      "jump_height_cm",
      "rsi_modified",
      "peak_power_per_bm",
    ],
    dateColumn: "test_date",
  },
  chat_risk_signals: {
    defaultColumns: [
      "player_id",
      "player_name",
      "position",
      "position_group",
      "status",
      "latest_session_date",
      "days_since_90",
      "days_since_85",
      "flag_count",
    ],
    allowedColumns: [
      "player_id",
      "player_name",
      "position",
      "position_group",
      "status",
      "latest_session_date",
      "all_time_max_speed",
      "days_since_90",
      "days_since_85",
      "jump_height_cm",
      "rsi_modified",
      "groin_squeeze_force",
      "hamstring_iso_force",
      "force_frame_asymmetry_pct",
      "nordbord_asymmetry_pct",
      "flag_count",
    ],
    allowedFilterColumns: {
      playerId: "player_id",
      playerName: "player_name",
      position: "position",
      group: "position_group",
      status: "status",
    },
    defaultOrderBy: { column: "flag_count", direction: "desc" },
    allowedOrderColumns: [
      "player_name",
      "latest_session_date",
      "days_since_90",
      "days_since_85",
      "flag_count",
      "jump_height_cm",
      "rsi_modified",
    ],
    dateColumn: "latest_session_date",
  },
};

function assertApprovedView(view: string): asserts view is AnalyticsViewName {
  if (!(view in APPROVED_VIEWS)) {
    console.warn("[queryAnalyticsView] Rejected unknown view:", view);
    throw new Error(`View "${view}" is not approved for chat analytics.`);
  }
}

function sanitizeSelectColumns(
  config: AnalyticsViewConfig,
  select?: string[]
): string[] {
  if (!select || select.length === 0) {
    return config.defaultColumns;
  }

  const uniqueColumns = Array.from(new Set(select.map((column) => column.trim()).filter(Boolean)));
  const invalidColumn = uniqueColumns.find(
    (column) => !config.allowedColumns.includes(column)
  );

  if (invalidColumn) {
    console.warn("[queryAnalyticsView] Rejected select column:", invalidColumn);
    throw new Error(`Column "${invalidColumn}" is not approved for this analytics view.`);
  }

  return uniqueColumns;
}

function sanitizeOrderBy(
  config: AnalyticsViewConfig,
  orderBy?: AnalyticsQueryInput["orderBy"]
): { column: string; direction: SortDirection } {
  if (!orderBy) {
    return config.defaultOrderBy;
  }

  if (!config.allowedOrderColumns.includes(orderBy.column)) {
    console.warn("[queryAnalyticsView] Rejected order column:", orderBy.column);
    throw new Error(`Cannot sort by "${orderBy.column}" in this analytics view.`);
  }

  if (orderBy.direction !== "asc" && orderBy.direction !== "desc") {
    console.warn("[queryAnalyticsView] Rejected sort direction:", orderBy.direction);
    throw new Error(`Sort direction "${orderBy.direction}" is not valid.`);
  }

  return orderBy;
}

function sanitizeLimit(limit?: number): number {
  if (limit == null) return DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("Analytics query limit must be a positive number.");
  }
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function applyFilters(
  builder: FilterableQueryBuilder,
  config: AnalyticsViewConfig,
  filters?: AnalyticsQueryFilters
): FilterableQueryBuilder {
  if (!filters) return builder;

  let nextBuilder = builder;
  for (const [rawKey, rawValue] of Object.entries(filters)) {
    if (rawValue == null || rawValue === "") continue;

    const key = rawKey as FilterKey;
    if (key === "startDate" || key === "endDate") {
      if (!config.dateColumn) {
        console.warn("[queryAnalyticsView] Rejected date filter for view without date column.");
        throw new Error("This analytics view does not support date filters.");
      }

      nextBuilder =
        key === "startDate"
          ? nextBuilder.gte(config.dateColumn, rawValue)
          : nextBuilder.lte(config.dateColumn, rawValue);
      continue;
    }

    const column = config.allowedFilterColumns[key];
    if (!column) {
      console.warn("[queryAnalyticsView] Rejected filter key:", key);
      throw new Error(`Filter "${key}" is not approved for this analytics view.`);
    }

    nextBuilder =
      key === "playerName"
        ? nextBuilder.ilike(column, `%${rawValue}%`)
        : nextBuilder.eq(column, rawValue);
  }

  return nextBuilder;
}

export async function queryAnalyticsView(input: AnalyticsQueryInput): Promise<{
  view: AnalyticsViewName;
  selectedColumns: string[];
  totalCount: number;
  returnedCount: number;
  hasMore: boolean;
  rows: Record<string, unknown>[];
}> {
  assertApprovedView(input.view);
  const config = APPROVED_VIEWS[input.view];
  const selectedColumns = sanitizeSelectColumns(config, input.select);
  const orderBy = sanitizeOrderBy(config, input.orderBy);
  const limit = sanitizeLimit(input.limit);
  const readonlyViewClient = supabase as unknown as ReadonlyViewClient;

  console.info("[queryAnalyticsView] Executing analytics query", {
    view: input.view,
    select: selectedColumns,
    orderBy,
    limit,
    filters: input.filters ?? {},
  });

  const countQuery = applyFilters(
    readonlyViewClient.from(input.view).select("*", { count: "exact", head: true }),
    config,
    input.filters
  );
  const dataQuery = applyFilters(
    readonlyViewClient
      .from(input.view)
      .select(selectedColumns.join(", "))
      .order(orderBy.column, { ascending: orderBy.direction === "asc" })
      .limit(limit),
    config,
    input.filters
  );

  const [countResponse, dataResponse] = await Promise.all([
    countQuery as unknown as Promise<CountQueryResponse>,
    dataQuery as unknown as Promise<RowsQueryResponse>,
  ]);
  const { count, error: countError } = countResponse;
  const { data, error: dataError } = dataResponse;

  if (countError) {
    console.error("[queryAnalyticsView] Count query failed:", countError.message, countError);
    throw new Error(`Analytics count query failed for ${input.view}.`);
  }

  if (dataError) {
    console.error("[queryAnalyticsView] Data query failed:", dataError.message, dataError);
    throw new Error(`Analytics data query failed for ${input.view}.`);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const totalCount = count ?? rows.length;

  return {
    view: input.view,
    selectedColumns,
    totalCount,
    returnedCount: rows.length,
    hasMore: totalCount > rows.length,
    rows,
  };
}
