import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { PlayerStatus } from "@/lib/player-queries";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALLOWED_STATUSES: PlayerStatus[] = [
  "injured",
  "rehab",
  "return_to_play",
  "cleared",
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: playerId } = await params;
    const body = (await request.json()) as { status?: PlayerStatus };
    const status = body.status;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const { data: latest } = await supabaseAdmin
      .from("injuries")
      .select("id")
      .eq("player_id", playerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest?.id) {
      const { error } = await supabaseAdmin
        .from("injuries")
        .update({
          status,
          updated_at: now,
        })
        .eq("id", latest.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await supabaseAdmin
        .from("injuries")
        .insert({
          player_id: playerId,
          injury_date: today,
          status,
          updated_at: now,
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    revalidatePath("/dashboard/players");
    revalidatePath(`/dashboard/players/${playerId}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
