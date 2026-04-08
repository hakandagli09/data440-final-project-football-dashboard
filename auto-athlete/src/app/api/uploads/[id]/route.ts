import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

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

  return NextResponse.json({
    success: true,
    deleted: {
      filename: upload.filename,
      csvType: upload.csv_type,
      rowCount: upload.row_count,
    },
  });
}
