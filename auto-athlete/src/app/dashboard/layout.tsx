/**
 * Dashboard Layout — persistent chrome for all `/dashboard/*` routes.
 *
 * This Next.js layout wraps every page under the `/dashboard` route segment
 * with the fixed sidebar navigation and sticky top bar. The layout persists
 * across route transitions within the dashboard, so the sidebar and top bar
 * never re-mount when navigating between sub-pages.
 */

import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

/** Props for the dashboard layout wrapper. */
interface DashboardLayoutProps {
  /** The active dashboard page component rendered in the main content area. */
  children: React.ReactNode;
}

/**
 * DashboardLayout — renders the Sidebar, TopBar, and main content area.
 *
 * Visual structure:
 * - Fixed sidebar (220px) on the left
 * - Main content area offset by `ml-[220px]` so it doesn't overlap the sidebar
 *   (this value must stay in sync with the sidebar's `w-[220px]` in Sidebar.tsx)
 * - `noise-overlay` adds a subtle SVG fractal noise texture via a `::before`
 *   pseudo-element defined in globals.css, giving depth to the dark background
 * - `relative z-10` ensures main content sits above the noise pseudo-element
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
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
