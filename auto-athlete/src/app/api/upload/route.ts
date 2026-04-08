/**
 * POST /api/upload — CSV upload endpoint.
 *
 * Receives a CSV file via FormData, auto-detects the type, parses columns,
 * upserts players, creates an upload record, and inserts data rows into
 * the appropriate Supabase table.
 *
 * Uses the service role key (server-side only) to bypass RLS for writes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseCsv, CsvType } from "@/lib/csv-parser";

// Service role client — server-side only, never exposed to the browser.
// Falls back to the anon key if service role key is not set (for development).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** Maps CSV type to the Supabase table name. */
const TABLE_MAP: Record<CsvType, string> = {
  gps: "gps_sessions",
  jump: "jump_tests",
  force_frame: "force_frame_tests",
  nordbord: "nordbord_tests",
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    const parseResult = parseCsv(csvText);

    const { csvType, players, rows, mappedColumns, unmappedHeaders, skippedRows } = parseResult;
    const tableName = TABLE_MAP[csvType];

    // 0. Check for duplicate uploads
    let duplicateWarning: string | null = null;
    const { data: existingUploads } = await supabaseAdmin
      .from("uploads")
      .select("id, filename, uploaded_at, row_count")
      .eq("filename", file.name)
      .eq("csv_type", csvType);

    if (existingUploads && existingUploads.length > 0) {
      const prev = existingUploads[0];
      const prevDate = new Date(prev.uploaded_at).toLocaleDateString("en-US", {
        month: "short", day: "2-digit", year: "numeric", timeZone: "UTC",
      });
      duplicateWarning = `This file was already uploaded on ${prevDate} (${prev.row_count} rows). You may want to delete the previous upload from Data Management to avoid duplicate data.`;
    }

    // 1. Upsert players — insert new ones, skip existing (match on name)
    const playerUpserts = players.map((p) => ({
      name: p.name,
      ...(p.position ? { position: p.position } : {}),
    }));

    if (playerUpserts.length > 0) {
      const { error: playerError } = await supabaseAdmin
        .from("players")
        .upsert(playerUpserts, { onConflict: "name", ignoreDuplicates: false });

      if (playerError) {
        return NextResponse.json(
          { error: `Failed to upsert players: ${playerError.message}` },
          { status: 500 }
        );
      }
    }

    // 2. Fetch player IDs for name → id mapping
    const { data: playerRows, error: fetchError } = await supabaseAdmin
      .from("players")
      .select("id, name")
      .in("name", players.map((p) => p.name));

    if (fetchError) {
      return NextResponse.json(
        { error: `Failed to fetch players: ${fetchError.message}` },
        { status: 500 }
      );
    }

    const playerIdMap = new Map<string, string>();
    for (const p of playerRows ?? []) {
      playerIdMap.set(p.name, p.id);
    }

    // 3. Create upload record
    const { data: uploadRecord, error: uploadError } = await supabaseAdmin
      .from("uploads")
      .insert({
        filename: file.name,
        csv_type: csvType,
        row_count: rows.length,
        status: skippedRows.length > 0 ? "partial" : "success",
        error_detail: skippedRows.length > 0 ? { skippedRows } : null,
      })
      .select("id")
      .single();

    if (uploadError) {
      return NextResponse.json(
        { error: `Failed to create upload record: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const uploadId = uploadRecord.id;

    // 4. Prepare data rows with player_id and upload_id
    const dbRows = rows.map((row) => {
      const { __player_name, ...data } = row;
      const playerId = playerIdMap.get(__player_name as string);
      return {
        ...data,
        player_id: playerId,
        upload_id: uploadId,
      };
    });

    // 5. Insert in batches of 500 (Supabase limit)
    const BATCH_SIZE = 500;
    let insertedCount = 0;
    const insertErrors: string[] = [];

    for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
      const batch = dbRows.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabaseAdmin
        .from(tableName)
        .insert(batch);

      if (insertError) {
        insertErrors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertError.message}`);
      } else {
        insertedCount += batch.length;
      }
    }

    // 6. Update upload record if there were insert errors
    if (insertErrors.length > 0) {
      await supabaseAdmin
        .from("uploads")
        .update({
          status: "partial",
          error_detail: { skippedRows, insertErrors },
          row_count: insertedCount,
        })
        .eq("id", uploadId);
    }

    return NextResponse.json({
      success: true,
      csvType,
      filename: file.name,
      uploadId,
      playersFound: players.length,
      rowsParsed: rows.length,
      rowsInserted: insertedCount,
      mappedColumns: mappedColumns.length,
      unmappedHeaders,
      skippedRows,
      insertErrors,
      duplicateWarning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
