import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/supabase-paginate";

const PLAYER_DATA_TABLES = [
  "gps_sessions",
  "jump_tests",
  "force_frame_tests",
  "nordbord_tests",
] as const;

export async function cleanupPlayersWithoutData(): Promise<number> {
  const [players, ...referencedPlayerRows] = await Promise.all([
    fetchAllRows<{ id: string }>(() => supabaseServer.from("players").select("id")),
    ...PLAYER_DATA_TABLES.map((table) =>
      fetchAllRows<{ player_id: string }>(() => supabaseServer.from(table).select("player_id"))
    ),
  ]);

  const referencedPlayerIds = new Set(
    referencedPlayerRows.flat().map((row) => row.player_id)
  );
  const orphanPlayerIds = players
    .map((player) => player.id)
    .filter((playerId) => !referencedPlayerIds.has(playerId));

  if (orphanPlayerIds.length === 0) return 0;

  const { error } = await supabaseServer
    .from("players")
    .delete()
    .in("id", orphanPlayerIds);

  if (error) {
    throw new Error(`Failed to clean up empty roster players: ${error.message}`);
  }

  return orphanPlayerIds.length;
}
