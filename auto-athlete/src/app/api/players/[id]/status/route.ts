import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { PlayerStatus } from "@/lib/player-queries";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALLOWED_STATUSES: PlayerStatus[] = [
  "modified_load",
  "injured",
  "rehab",
  "return_to_play",
  "cleared",
];

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: playerId } = await params;
    const body = (await request.json()) as {
      status?: PlayerStatus;
      injuryDate?: unknown;
      expectedReturn?: unknown;
      notes?: unknown;
    };
    const status = body.status;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const injuryDate = isIsoDate(body.injuryDate) ? body.injuryDate : today;
    const expectedReturn = isIsoDate(body.expectedReturn)
      ? body.expectedReturn
      : status === "modified_load"
        ? injuryDate
        : null;
    const notes = typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim().slice(0, 500)
      : null;

    const { error } = await supabaseAdmin
      .from("injuries")
      .insert({
        player_id: playerId,
        injury_date: injuryDate,
        status,
        expected_return: expectedReturn,
        notes,
        updated_at: now,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/players");
    revalidatePath(`/dashboard/players/${playerId}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
