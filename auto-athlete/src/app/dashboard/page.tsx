import FlaggingBoardClient from "@/components/FlaggingBoardClient";
import { getSeasonFlaggingData } from "@/lib/player-queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getSeasonFlaggingData();
  return <FlaggingBoardClient data={data} />;
}
