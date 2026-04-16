/**
 * GET /api/debug — Diagnostic endpoint for troubleshooting data ingestion.
 *
 * Returns a comprehensive audit:
 *   - Environment / Supabase credentials presence
 *   - Total row counts per data table
 *   - Every upload record (filename, status, row count, distinct dates)
 *   - Every distinct session_date in gps_sessions with row counts
 *   - Every distinct test_date in jump_tests / force_frame_tests / nordbord_tests
 *
 * Use this to confirm which files actually landed in the DB and which
 * calendar dates are represented. If a date is missing from the dashboard
 * dropdown, it'll also be missing here — that tells us the upload never
 * made it in (or was inserted under a different date).
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Return distinct values + counts for a (table, column) pair.
 *  Uses a loose SupabaseClient typing because the generic parameters on
 *  `createClient()`'s return type don't flow nicely through helpers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

async function distinctDateCounts(
  client: LooseClient,
  table: string,
  column: string
): Promise<Array<{ date: string; rows: number }>> {
  // PostgREST ignores a `.limit(N)` that exceeds its server-side
  // `max-rows` cap (Supabase defaults to 1000), which is why earlier
  // versions of this endpoint reported only 9 of ~35 GPS dates. Page
  // through the table with `.range()` instead so we see every row.
  const pageSize = 1000;
  const maxRows = 50_000;
  const counts = new Map<string, number>();
  let offset = 0;

  while (offset < maxRows) {
    const end = Math.min(offset + pageSize - 1, maxRows - 1);
    const { data, error } = await client
      .from(table)
      .select(column)
      .range(offset, end);
    if (error || !data) break;
    for (const row of data as Array<Record<string, string | null>>) {
      const value = row[column];
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return Array.from(counts.entries())
    .map(([date, rows]) => ({ date, rows }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const results: Record<string, unknown> = {
    env: {
      supabaseUrl: url ? `${url.slice(0, 30)}...` : "MISSING",
      anonKeyPresent: !!anonKey,
      serviceKeyPresent: !!serviceKey,
    },
  };

  if (!url || !anonKey) {
    results.error = "Supabase URL or anon key missing — cannot query.";
    return NextResponse.json(results, { status: 200 });
  }

  // Prefer service key (bypasses RLS so we see everything) but fall
  // back to anon key when running in environments without it.
  const client = createClient(url, serviceKey || anonKey);

  // ── 1. Row counts across all data tables ────────────────────────────
  const tableCounts: Record<string, { rowCount: number | null; error: string | null }> = {};
  for (const table of ["players", "uploads", "gps_sessions", "jump_tests", "force_frame_tests", "nordbord_tests"]) {
    const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
    tableCounts[table] = { rowCount: count ?? null, error: error?.message ?? null };
  }
  results.tableCounts = tableCounts;

  // ── 2. Every upload record, newest first ────────────────────────────
  const { data: uploads, error: uploadsError } = await client
    .from("uploads")
    .select("id, filename, csv_type, row_count, status, uploaded_at")
    .order("uploaded_at", { ascending: false })
    .limit(500);

  if (uploadsError) {
    results.uploads = { error: uploadsError.message };
  } else {
    // For each upload, look up the distinct dates that row landed under
    // (so we can cross-check filename vs. the dates in the DB).
    const uploadsWithDates = await Promise.all(
      (uploads ?? []).map(async (u) => {
        let dates: string[] = [];
        if (u.csv_type === "gps") {
          const { data } = await client
            .from("gps_sessions")
            .select("session_date")
            .eq("upload_id", u.id)
            .limit(10000);
          dates = Array.from(new Set((data ?? []).map((r) => r.session_date as string))).sort();
        } else if (u.csv_type === "jump") {
          const { data } = await client
            .from("jump_tests")
            .select("test_date")
            .eq("upload_id", u.id)
            .limit(10000);
          dates = Array.from(new Set((data ?? []).map((r) => r.test_date as string))).sort();
        } else if (u.csv_type === "force_frame") {
          const { data } = await client
            .from("force_frame_tests")
            .select("test_date")
            .eq("upload_id", u.id)
            .limit(10000);
          dates = Array.from(new Set((data ?? []).map((r) => r.test_date as string))).sort();
        } else if (u.csv_type === "nordbord") {
          const { data } = await client
            .from("nordbord_tests")
            .select("test_date")
            .eq("upload_id", u.id)
            .limit(10000);
          dates = Array.from(new Set((data ?? []).map((r) => r.test_date as string))).sort();
        }
        return {
          id: u.id,
          filename: u.filename,
          csvType: u.csv_type,
          rowCount: u.row_count,
          status: u.status,
          uploadedAt: u.uploaded_at,
          dateCount: dates.length,
          dates,
        };
      })
    );
    results.uploads = uploadsWithDates;
  }

  // ── 3. Distinct session_date histogram across gps_sessions ──────────
  results.gpsDateHistogram = await distinctDateCounts(client, "gps_sessions", "session_date");

  // ── 4. Distinct test_date histograms for the other three data types ─
  results.jumpDateHistogram = await distinctDateCounts(client, "jump_tests", "test_date");
  results.forceFrameDateHistogram = await distinctDateCounts(client, "force_frame_tests", "test_date");
  results.nordBordDateHistogram = await distinctDateCounts(client, "nordbord_tests", "test_date");

  return NextResponse.json(results, { status: 200 });
}
