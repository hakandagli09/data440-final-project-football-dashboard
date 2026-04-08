import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const TABLE_MAP: Record<string, string> = {
  gps: "gps_sessions",
  jump: "jump_tests",
  force_frame: "force_frame_tests",
  nordbord: "nordbord_tests",
};

export async function GET(request: NextRequest) {
  const typeFilter = request.nextUrl.searchParams.get("type");

  let query = supabaseServer
    .from("uploads")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (typeFilter && TABLE_MAP[typeFilter]) {
    query = query.eq("csv_type", typeFilter);
  }

  const { data: uploads, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch uploads: ${error.message}` },
      { status: 500 }
    );
  }

  const enriched = await Promise.all(
    (uploads ?? []).map(async (upload) => {
      const tableName = TABLE_MAP[upload.csv_type];
      if (!tableName) return { ...upload, players: [] };

      const { data: rows } = await supabaseServer
        .from(tableName)
        .select("players(name)")
        .eq("upload_id", upload.id);

      const playerNames = Array.from(
        new Set(
          (rows ?? [])
            .map((r: Record<string, unknown>) => {
              const p = r.players as { name: string } | null;
              return p?.name;
            })
            .filter(Boolean)
        )
      ).sort();

      return { ...upload, players: playerNames };
    })
  );

  return NextResponse.json(enriched);
}
