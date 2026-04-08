/**
 * Dashboard Page — server component that fetches real data from Supabase
 * and passes it to the client component for rendering.
 *
 * Reads `?date=YYYY-MM-DD` from URL params. Defaults to the most recent session.
 */

import { getDashboardData } from "@/lib/queries";
import DashboardClient from "@/components/DashboardClient";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const data = await getDashboardData(params.date);

  return <DashboardClient {...data} />;
}
