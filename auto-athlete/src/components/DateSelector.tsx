"use client";

/**
 * DateSelector — single-day picker used on /dashboard.
 *
 * Thin wrapper around the shared DualMonthDatePicker, configured for
 * single-day mode (no second panel, no quick-select chips). Keeps the
 * original prop shape (`dates` + `currentDate`) so DashboardClient does
 * not need to change. On selection, stays on /dashboard/overview?date=...
 */

import { useRouter } from "next/navigation";
import DualMonthDatePicker from "@/components/DualMonthDatePicker";

interface DateSelectorProps {
  /** All session dates with data, newest first. YYYY-MM-DD strings. */
  readonly dates: string[];
  /** The currently-active date driving the dashboard view. */
  readonly currentDate: string;
}

export default function DateSelector({ dates, currentDate }: DateSelectorProps) {
  const router = useRouter();

  return (
    <DualMonthDatePicker
      startDate={currentDate}
      endDate={currentDate}
      availableDates={dates}
      allowRange={false}
      showQuickSelects={false}
      onSelectSingle={(date) => router.replace(`/dashboard/overview?date=${date}`)}
    />
  );
}
