/**
 * Pagination helper for Supabase / PostgREST queries.
 *
 * PostgREST enforces a server-side row cap on every SELECT (Supabase
 * defaults this to 1000 rows). A single `.select().order()` call against
 * a large table therefore silently truncates — which is exactly how the
 * date dropdown ended up missing everything older than ~March on a
 * 6k-row `gps_sessions` table.
 *
 * This helper loops through consecutive `.range()` windows until it
 * either drains the table or hits a caller-provided safety limit. The
 * caller passes a *factory* that builds a fresh query on every call
 * because Supabase query builders can't be re-awaited.
 */

/**
 * Minimum shape required from a Supabase query builder: something we
 * can call `.range()` on and then `await` to get `{ data, error }`.
 *
 * We type the builder loosely (`any`) because PostgrestFilterBuilder's
 * generic parameters (schema, row, relationships, …) don't flow cleanly
 * through a generic pagination helper — especially when the caller uses
 * dynamic `select("col_a, col_b, …")` strings, which Supabase's types
 * can't statically validate and surface as `ParserError<…>` noise.
 *
 * Any real Supabase query builder satisfies this shape at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryFactory = () => any;

/** Size of each paginated fetch. 1000 is the PostgREST default and
 *  matches Supabase's cap, so we never waste round-trips. */
const PAGE_SIZE = 1000;

/** Hard upper bound to prevent runaway loops on misconfigured queries.
 *  50k rows × 100 bytes/row ≈ 5 MB which is still fine for a server
 *  response; anything larger should probably be a proper aggregate. */
const MAX_ROWS = 50_000;

/**
 * Fetch every row a Supabase query would return, transparently paging
 * past the 1000-row cap.
 *
 * Usage:
 * ```ts
 * const rows = await fetchAllRows<{ session_date: string }>(() =>
 *   supabase.from("gps_sessions").select("session_date")
 * );
 * ```
 *
 * The factory MUST return a fresh builder — the helper adds its own
 * `.range(start, end)` clause and cannot share a builder across calls.
 *
 * @param makeQuery Factory returning a new PostgrestFilterBuilder.
 * @param options   Optional overrides for page size / safety cap.
 * @returns All rows concatenated in the order PostgREST returned them.
 * @throws If any page request returns an error.
 */
export async function fetchAllRows<T>(
  makeQuery: QueryFactory,
  options: { pageSize?: number; maxRows?: number } = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxRows = options.maxRows ?? MAX_ROWS;

  const all: T[] = [];
  let offset = 0;

  while (offset < maxRows) {
    const end = Math.min(offset + pageSize - 1, maxRows - 1);
    // Each iteration must build a fresh query — Supabase builders are
    // single-use and can't be awaited twice.
    const response: { data: unknown; error: { message: string } | null } =
      await makeQuery().range(offset, end);
    const { data, error } = response;

    if (error) {
      throw new Error(`fetchAllRows failed at offset ${offset}: ${error.message}`);
    }
    if (!Array.isArray(data) || data.length === 0) break;

    all.push(...(data as T[]));

    // Short page = we reached the end of the dataset.
    if (data.length < pageSize) break;

    offset += pageSize;
  }

  return all;
}
