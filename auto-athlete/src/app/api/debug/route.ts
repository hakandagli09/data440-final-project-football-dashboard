import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const results: Record<string, unknown> = {
    supabaseUrl: url ? `${url.slice(0, 30)}...` : "MISSING",
    anonKeyPresent: !!anonKey,
    anonKeyPrefix: anonKey?.slice(0, 20) ?? "MISSING",
    serviceKeyPresent: !!serviceKey,
  };

  // Test anon key read (what the dashboard uses)
  if (url && anonKey) {
    try {
      const anonClient = createClient(url, anonKey);
      const { data, error, count } = await anonClient
        .from("gps_sessions")
        .select("id, session_date", { count: "exact" })
        .limit(3);

      results.anonRead = {
        success: !error,
        error: error?.message ?? null,
        errorCode: error?.code ?? null,
        rowCount: count,
        sampleRows: data?.length ?? 0,
        sample: data?.map((r) => ({ id: r.id, date: r.session_date })) ?? [],
      };
    } catch (e) {
      results.anonRead = { success: false, error: String(e) };
    }
  }

  // Test service key read (what the upload route uses)
  if (url && serviceKey) {
    try {
      const adminClient = createClient(url, serviceKey);
      const { data, error, count } = await adminClient
        .from("gps_sessions")
        .select("id, session_date", { count: "exact" })
        .limit(3);

      results.serviceRead = {
        success: !error,
        error: error?.message ?? null,
        errorCode: error?.code ?? null,
        rowCount: count,
        sampleRows: data?.length ?? 0,
        sample: data?.map((r) => ({ id: r.id, date: r.session_date })) ?? [],
      };
    } catch (e) {
      results.serviceRead = { success: false, error: String(e) };
    }
  }

  // Test players table too
  if (url && anonKey) {
    try {
      const anonClient = createClient(url, anonKey);
      const { data, error, count } = await anonClient
        .from("players")
        .select("id, name", { count: "exact" })
        .limit(3);

      results.anonPlayersRead = {
        success: !error,
        error: error?.message ?? null,
        rowCount: count,
        sampleRows: data?.length ?? 0,
      };
    } catch (e) {
      results.anonPlayersRead = { success: false, error: String(e) };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
