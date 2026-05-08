import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { cleanupPlayersWithoutData } from "@/lib/player-cleanup";

/**
 * PATCH /api/uploads/:id — rename an uploaded data file.
 *
 * Body: `{ filename: string }`. We only accept a `filename` field —
 * everything else (csv_type, row_count, error_detail) is determined at
 * ingest and is not user-editable.
 *
 * The data rows in `gps_sessions` / `jump_tests` / etc. don't carry
 * the filename themselves — only the `uploads` row does — so this is a
 * single-row update. No cascade.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: { filename?: unknown } = await request.json().catch(() => ({}));
  const filenameRaw: unknown = body.filename;

  // Validate: must be a non-empty string under a sensible cap so the
  // table layout can't be blown out by a 10kb name.
  if (typeof filenameRaw !== "string") {
    return NextResponse.json(
      { error: "Body must include a string `filename` field." },
      { status: 400 }
    );
  }
  const filename: string = filenameRaw.trim();
  if (filename.length === 0) {
    return NextResponse.json(
      { error: "Filename cannot be empty." },
      { status: 400 }
    );
  }
  if (filename.length > 255) {
    return NextResponse.json(
      { error: "Filename must be 255 characters or fewer." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("uploads")
    .update({ filename })
    .eq("id", id)
    .select("id, filename")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to rename: ${updateError.message}` },
      { status: 500 }
    );
  }
  if (!updated) {
    return NextResponse.json(
      { error: "Upload not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, upload: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: upload, error: fetchError } = await supabaseServer
    .from("uploads")
    .select("id, filename, csv_type, row_count")
    .eq("id", id)
    .single();

  if (fetchError || !upload) {
    return NextResponse.json(
      { error: "Upload not found" },
      { status: 404 }
    );
  }

  const { error: deleteError } = await supabaseServer
    .from("uploads")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: `Failed to delete: ${deleteError.message}` },
      { status: 500 }
    );
  }

  let deletedPlayers = 0;
  try {
    deletedPlayers = await cleanupPlayersWithoutData();
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Failed to clean up empty roster players";
    const message = `Deleted upload, but ${detail}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deleted: {
      filename: upload.filename,
      csvType: upload.csv_type,
      rowCount: upload.row_count,
    },
    deletedPlayers,
  });
}
