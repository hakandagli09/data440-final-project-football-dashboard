/**
 * Performance Overview — legacy KPI dashboard kept as a secondary page.
 */

import DashboardClient from "@/components/DashboardClient";
import { getDashboardData } from "@/lib/queries";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const data = await getDashboardData(params.date);
  return <DashboardClient {...data} />;
}
