/**
 * Sidebar — fixed left navigation panel for the Auto Athlete app.
 *
 * Rendered inside every layout that needs the dashboard chrome (DashboardLayout,
 * UploadLayout). Provides primary navigation across the app's main sections.
 *
 * Three visual sections from top to bottom:
 * 1. Logo and branding
 * 2. Main navigation links (scrollable if they overflow)
 * 3. Settings link + live session badge
 *
 * This is a client component because it uses `usePathname()` from Next.js
 * to detect the active route and highlight the corresponding nav link.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatSessionDateUpper } from "@/lib/date-utils";

/** A single navigation link displayed in the sidebar. */
interface NavItem {
  /** The text label shown next to the icon. */
  label: string;
  /** The route path this link navigates to (used in <Link href>). */
  href: string;
  /** The SVG icon rendered to the left of the label. */
  icon: React.ReactNode;
}

/** Primary navigation links shown in the main section of the sidebar. */
const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
      </svg>
    ),
  },
  {
    label: "Upload Data",
    href: "/upload",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    label: "Data Management",
    href: "/data-management",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    label: "Players",
    href: "/dashboard/players",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    label: "Sessions",
    href: "/dashboard/sessions",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
  },
  {
    label: "Reports",
    href: "/dashboard/reports",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
];

/** Secondary navigation links pinned to the bottom of the sidebar. */
const BOTTOM_ITEMS: NavItem[] = [
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
];

/**
 * Sidebar — fixed left navigation for the Auto Athlete dashboard.
 *
 * Width is a design constant: `w-[220px]`. Both DashboardLayout and
 * UploadLayout offset their main content by `ml-[220px]` to match.
 * If this width changes, update both layout files.
 */
export default function Sidebar(): JSX.Element {
  const pathname = usePathname();
  const [latestSession, setLatestSession] = useState<{ title: string; date: string } | null>(null);

  useEffect(() => {
    supabase
      .from("gps_sessions")
      .select("session_title, session_date")
      .order("session_date", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setLatestSession({ title: data[0].session_title ?? "Session", date: data[0].session_date });
        }
      });
  }, []);

  return (
    <aside className="fixed top-0 left-0 z-40 h-screen w-[220px] bg-aa-surface border-r border-aa-border flex flex-col">
      {/* ── Logo ─────────────────────────────────────────── */}
      <div className="h-16 flex items-center px-5 border-b border-aa-border">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aa-accent to-aa-accent/50 flex items-center justify-center">
            <span className="font-display text-aa-bg text-lg leading-none tracking-tight">A</span>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-[18px] leading-none tracking-[0.08em] text-aa-text group-hover:text-aa-accent transition-colors">
              AUTO ATHLETE
            </span>
            <span className="text-[9px] font-medium tracking-[0.2em] text-aa-text-dim uppercase">
              Performance Lab
            </span>
          </div>
        </Link>
      </div>

      {/* ── Main nav ─────────────────────────────────────── */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-2 mb-3">
          <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-aa-text-dim">
            Analytics
          </span>
        </div>
        {NAV_ITEMS.map((item) => {
          // Exact match — `/dashboard/players` will NOT highlight "Dashboard".
          // This is intentional for a flat nav structure where each link
          // represents a distinct, non-nested section.
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                ${
                  isActive
                    ? "bg-aa-accent/10 text-aa-accent border border-aa-accent/20"
                    : "text-aa-text-secondary hover:text-aa-text hover:bg-aa-elevated border border-transparent"
                }
              `}
            >
              <span className={isActive ? "text-aa-accent" : ""}>{item.icon}</span>
              {item.label}
              {/* Active indicator dot — uses `animate-pulse-glow` keyframe
                  (defined in tailwind.config.ts) which cycles opacity between
                  0.4 and 1.0 over 3 seconds, creating a "breathing" effect
                  to signal that this route is currently active. */}
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-aa-accent animate-pulse-glow" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom nav ───────────────────────────────────── */}
      <div className="px-3 pb-4 space-y-1 border-t border-aa-border pt-4">
        {BOTTOM_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                ${
                  isActive
                    ? "bg-aa-accent/10 text-aa-accent"
                    : "text-aa-text-secondary hover:text-aa-text hover:bg-aa-elevated"
                }
              `}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}

        {/* ── Latest session badge ────────────────────────── */}
        {latestSession && (
          <div className="mt-3 mx-1 p-3 rounded-lg bg-aa-bg border border-aa-border">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-aa-success animate-pulse-glow" />
              <span className="text-[11px] font-semibold text-aa-text-secondary uppercase tracking-wider">
                Latest Session
              </span>
            </div>
            <p className="text-xs text-aa-text-dim">
              {latestSession.title}
            </p>
            <p className="text-[10px] font-mono text-aa-text-dim mt-1">
              {formatSessionDateUpper(latestSession.date)}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
