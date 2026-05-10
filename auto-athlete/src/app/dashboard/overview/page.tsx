/**
 * Performance Overview — team daily report. Date-driven KPI summary
 * showing total distance, HSR, sprint distance, max velocity,
 * accel/decel, and explosive efforts for the whole team on the
 * selected day, plus position-group breakdown and sprint exposure.
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
