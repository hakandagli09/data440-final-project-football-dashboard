import SessionReportClient from "@/components/SessionReportClient";
import { getSessionReportData } from "@/lib/session-report-queries";

interface ReportsPageProps {
  searchParams?: Promise<{ date?: string }>;
}

/**
 * Reports page — coach-facing Session Report that mirrors Brian's Excel
 * layout, augmented with trend sparklines and interactive filtering.
 * Lives under /dashboard/reports so it inherits the dashboard layout
 * (sidebar + topbar + ChatProvider).
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const data = await getSessionReportData(params?.date);
  return <SessionReportClient data={data} />;
}
