import SessionReportClient from "@/components/SessionReportClient";
import { getSessionReportData } from "@/lib/session-report-queries";

interface ReportsPageProps {
  // Next.js typed search params:
  //   `date`          → single-day view (back-compat with old links).
  //   `start` + `end` → range view (e.g. drag-selected on the calendar).
  //   `session_title` → filter the report to a single practice type
  //                     (Full Pads / Accel / Helmets / etc.).
  searchParams?: Promise<{
    date?: string;
    start?: string;
    end?: string;
    session_title?: string;
  }>;
}

/**
 * Reports page — coach-facing Session Report that mirrors Brian's Excel
 * layout, augmented with trend sparklines and interactive filtering.
 * Lives under /dashboard/reports so it inherits the dashboard layout
 * (sidebar + topbar + ChatProvider).
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  // Resolve the single-day fallback: prefer explicit `date`, otherwise
  // fall back to `start` so a one-click chip that only sets `start`
  // still lands on a valid single-day view.
  const singleDay = params?.date ?? params?.start;
  const data = await getSessionReportData(
    singleDay,
    params?.session_title,
    params?.start,
    params?.end
  );
  return <SessionReportClient data={data} />;
}
