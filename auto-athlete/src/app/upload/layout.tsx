/**
 * Upload Layout — persistent chrome for the `/upload` route.
 *
 * Identical structure to DashboardLayout (Sidebar + TopBar + main area).
 * These layouts are kept separate rather than unified at a higher route segment
 * so that each section can diverge independently in the future (e.g., the upload
 * page might add a progress bar to the top bar, or hide certain sidebar links).
 */

import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

/** Props for the upload layout wrapper. */
interface UploadLayoutProps {
  /** The upload page component rendered in the main content area. */
  children: React.ReactNode;
}

/**
 * UploadLayout — renders the Sidebar, TopBar, and main content area.
 *
 * See DashboardLayout for a detailed explanation of the visual structure.
 * `ml-[220px]` must stay in sync with Sidebar's `w-[220px]`.
 * `noise-overlay` references a `::before` pseudo-element in globals.css.
 */
export default function UploadLayout({ children }: UploadLayoutProps) {
  return (
    <div className="min-h-screen bg-aa-bg noise-overlay">
      <Sidebar />
      {/* ml-[220px] offsets content past the fixed sidebar width */}
      <div className="ml-[220px] relative z-10">
        <TopBar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
