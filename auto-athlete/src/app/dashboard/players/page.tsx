import PlayersClient from "@/components/PlayersClient";
import { getPositionReportData } from "@/lib/group-queries";
import { getPlayersList } from "@/lib/player-queries";

interface PlayersPageProps {
  searchParams?: Promise<{ date?: string }>;
}

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const params = await searchParams;
  const [players, reportData] = await Promise.all([
    getPlayersList(),
    getPositionReportData(params?.date),
  ]);
  return <PlayersClient players={players} reportData={reportData} />;
}
