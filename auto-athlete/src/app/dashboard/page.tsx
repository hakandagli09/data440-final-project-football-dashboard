/**
 * Dashboard Page — main performance overview for Auto Athlete.
 *
 * This is a client component ("use client") because it uses CSS animations
 * with dynamic `style` props for staggered entrance effects. It displays
 * mock/hardcoded data representing a single practice session's GPS analytics.
 *
 * Five visual sections:
 * 1. KPI Cards (6 metrics across the top row)
 * 2. Distance Over Time (large area chart placeholder)
 * 3. Speed Zones (horizontal bar chart by velocity band)
 * 4. Player Leaderboard (table of top performers)
 * 5. Acute:Chronic Workload Ratio (donut chart) + Session Info + Alert
 *
 * All data is hardcoded. In production, these values would come from
 * parsed StatSports CSV data stored in Supabase.
 */
"use client";

import KPICard from "@/components/KPICard";

// ─── Type Definitions ──────────────────────────────────────────────────────

/**
 * Configuration for a single KPI card in the top row.
 * Each metric represents a different physical performance dimension
 * relevant to football S&C (strength and conditioning).
 */
interface KPIConfig {
  /** Short metric label displayed in the card header. */
  title: string;
  /** Formatted numeric string (e.g. "5,847" — pre-formatted for display). */
  value: string;
  /** Unit abbreviation (e.g. "m", "m/s", "AU", "bpm", "sprints"). */
  unit: string;
  /** Session-over-session delta as a display string (e.g. "12%", "2"). */
  change: string;
  /** Direction of the delta — determines arrow icon and color. */
  changeType: "positive" | "negative" | "neutral";
  /** Tailwind color token name for the card's accent (e.g. "aa-accent"). */
  accentColor: string;
  /** SVG icon element rendered next to the title. */
  icon: React.ReactNode;
}

/**
 * A velocity band in the Speed Zones bar chart.
 * These bands follow standard GPS sport-science conventions used by
 * Catapult and StatSports for classifying athlete movement intensity.
 */
interface SpeedZone {
  /** Zone label (e.g. "Zone 5", "Zone 1"). */
  zone: string;
  /** Human-readable velocity range (e.g. "> 7.0 m/s"). */
  label: string;
  /** Percentage of session time spent in this zone (0–100). */
  pct: number;
  /** Tailwind background color class for the bar fill. */
  color: string;
}

/** A single row in the Player Leaderboard table. */
interface PlayerRow {
  /** Rank position (1 = highest performer). */
  rank: number;
  /** Player display name (abbreviated: "J. Williams"). */
  name: string;
  /** Position abbreviation (e.g. "WR", "RB", "SS", "CB", "LB"). */
  pos: string;
  /** Total distance in meters, formatted with commas. */
  dist: string;
  /** Top speed in m/s. */
  spd: string;
  /** Player Load in arbitrary units (AU). */
  load: string;
}

/** A risk level entry in the ACWR (Acute:Chronic Workload Ratio) legend. */
interface WorkloadRiskLevel {
  /** Risk category label (e.g. "Low Risk", "Caution", "High Risk"). */
  label: string;
  /** ACWR range for this category (e.g. "0.8–1.3"). */
  range: string;
  /** Tailwind background color class for the legend dot. */
  color: string;
}

/** A key-value pair displayed in the Session Info card. */
interface SessionInfoItem {
  /** Descriptive label (e.g. "Duration", "GPS Fix"). */
  label: string;
  /** The corresponding value (e.g. "1h 42m", "18 Hz"). */
  value: string;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────

/**
 * The six Key Performance Indicators displayed across the dashboard's top row.
 * Each metric represents a different physical performance dimension:
 * - Total Distance: cumulative meters covered by all tracked players
 * - Top Speed: fastest instantaneous velocity recorded in the session
 * - HSR Distance: meters covered above the High-Speed Running threshold (~5.5 m/s)
 * - Player Load: accelerometer-derived load in arbitrary units (AU)
 * - Sprint Count: number of efforts exceeding the sprint threshold (~7.0 m/s)
 * - Avg Heart Rate: mean heart rate across all tracked players
 *
 * The `changeType` values use `as const` to narrow to exact string literals.
 * With the `KPIConfig` interface applied, these assertions are technically
 * redundant (the interface already constrains the union), but they're kept
 * for explicitness.
 */
const KPI_DATA: KPIConfig[] = [
  {
    title: "Total Distance",
    value: "5,847",
    unit: "m",
    change: "12%",
    changeType: "positive" as const,
    accentColor: "aa-accent",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
      </svg>
    ),
  },
  {
    title: "Top Speed",
    value: "9.2",
    unit: "m/s",
    change: "3%",
    changeType: "positive" as const,
    accentColor: "aa-warm",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
      </svg>
    ),
  },
  {
    title: "HSR Distance",
    value: "1,284",
    unit: "m",
    change: "8%",
    changeType: "negative" as const,
    accentColor: "aa-accent",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
      </svg>
    ),
  },
  {
    title: "Player Load",
    value: "847",
    unit: "AU",
    change: "5%",
    changeType: "positive" as const,
    accentColor: "aa-accent",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    title: "Sprint Count",
    value: "34",
    unit: "sprints",
    change: "2",
    changeType: "positive" as const,
    accentColor: "aa-warm",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
      </svg>
    ),
  },
  {
    title: "Avg Heart Rate",
    value: "156",
    unit: "bpm",
    change: "1%",
    changeType: "neutral" as const,
    accentColor: "aa-danger",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
      </svg>
    ),
  },
];

/**
 * Speed zone distribution data for the horizontal bar chart.
 * Zones follow standard GPS sport-science velocity bands:
 * - Zone 5 (> 7.0 m/s): Sprinting — colored red (high intensity)
 * - Zone 4 (5.5–7.0 m/s): High-speed running — colored orange
 * - Zone 3 (4.0–5.5 m/s): Running — colored amber
 * - Zone 2 (2.0–4.0 m/s): Jogging — colored cyan (moderate)
 * - Zone 1 (< 2.0 m/s): Walking — colored gray (low intensity)
 * Percentages represent time-in-zone distribution for the session.
 */
const SPEED_ZONES: SpeedZone[] = [
  { zone: "Zone 5", label: "> 7.0 m/s", pct: 8, color: "bg-aa-danger" },
  { zone: "Zone 4", label: "5.5–7.0", pct: 15, color: "bg-aa-warm" },
  { zone: "Zone 3", label: "4.0–5.5", pct: 28, color: "bg-aa-warning" },
  { zone: "Zone 2", label: "2.0–4.0", pct: 32, color: "bg-aa-accent" },
  { zone: "Zone 1", label: "< 2.0", pct: 17, color: "bg-aa-text-dim" },
];

/** Top 5 players ranked by total distance covered in the session. */
const PLAYER_DATA: PlayerRow[] = [
  { rank: 1, name: "J. Williams", pos: "WR", dist: "6,847", spd: "9.2", load: "912" },
  { rank: 2, name: "M. Carter", pos: "RB", dist: "6,421", spd: "8.8", load: "885" },
  { rank: 3, name: "D. Thompson", pos: "SS", dist: "6,105", spd: "8.5", load: "847" },
  { rank: 4, name: "K. Johnson", pos: "CB", dist: "5,982", spd: "9.0", load: "823" },
  { rank: 5, name: "T. Mitchell", pos: "LB", dist: "5,741", spd: "7.9", load: "801" },
];

/**
 * ACWR risk level legend entries.
 * Based on Gabbett's research on training load and injury risk:
 * - 0.8–1.3: "Sweet spot" — low injury risk, optimal training stimulus
 * - 1.3–1.5: Caution zone — elevated injury risk
 * - > 1.5: High risk — significantly increased injury probability
 */
const WORKLOAD_LEVELS: WorkloadRiskLevel[] = [
  { label: "Low Risk", range: "0.8–1.3", color: "bg-aa-success" },
  { label: "Caution", range: "1.3–1.5", color: "bg-aa-warning" },
  { label: "High Risk", range: "> 1.5", color: "bg-aa-danger" },
];

/** Key-value metadata about the current practice session. */
const SESSION_INFO: SessionInfoItem[] = [
  { label: "Duration", value: "1h 42m" },
  { label: "Players", value: "47 tracked" },
  // StatSports Apex GPS units sample at 18 Hz (18 position readings per second),
  // which is the industry standard for professional athlete tracking.
  { label: "GPS Fix", value: "18 Hz" },
  { label: "Weather", value: "72°F / Clear" },
];

// ─── Component ─────────────────────────────────────────────────────────────

/**
 * DashboardPage — renders all five dashboard sections with staggered animations.
 *
 * Animation timeline (approximate):
 * - 0ms:     Page header fades in
 * - 0–480ms: KPI cards stagger in (6 cards × 80ms each)
 * - 500ms:   Distance chart slides up (waits for KPI cascade to finish)
 * - 600ms:   Speed zones panel slides up
 * - 700ms+:  Speed zone bars stagger in (5 bars × 60ms each)
 * - 700ms:   Player leaderboard slides up
 * - 800ms+:  Player rows stagger in (5 rows × 60ms each)
 * - 800ms:   ACWR donut slides up
 * - 900ms:   Session info slides up
 * - 1000ms:  Alert card slides up (last element — deliberate visual climax)
 */
export default function DashboardPage(): JSX.Element {
  return (
    <div className="space-y-6">
      {/* ── Page header ────────────────────────────────────── */}
      <div className="flex items-end justify-between opacity-0 animate-fade-in">
        <div>
          <h1 className="font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
            PERFORMANCE OVERVIEW
          </h1>
          <p className="mt-1 text-sm text-aa-text-secondary">
            Spring Practice #14 — Offense vs. Defense Scrimmage
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date selector placeholder — currently static */}
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-aa-border bg-aa-surface text-xs font-mono text-aa-text-secondary hover:border-aa-border-bright transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            Apr 02, 2026
          </button>
          {/* Export button placeholder */}
          <button className="px-4 py-2 rounded-lg bg-aa-accent/10 border border-aa-accent/20 text-xs font-semibold text-aa-accent hover:bg-aa-accent/20 transition-colors">
            Export Report
          </button>
        </div>
      </div>

      {/* ── KPI Cards Row ──────────────────────────────────── */}
      {/* Each card enters 80ms after the previous one (delay={i * 80}),
          creating a left-to-right cascade. 80ms is fast enough to feel
          cohesive but slow enough to be individually perceptible. */}
      <div className="grid grid-cols-6 gap-4">
        {KPI_DATA.map((kpi, i) => (
          <KPICard key={kpi.title} {...kpi} delay={i * 80} />
        ))}
      </div>

      {/* ── Main content grid ──────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* ── Distance Over Time — large area chart ──────── */}
        {/* animationDelay 500ms waits for the KPI cascade to finish
            (6 cards × 80ms = 480ms, rounded up to 500ms). */}
        <div className="col-span-8 bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "500ms" }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display text-xl tracking-[0.06em] text-aa-text">
                DISTANCE OVER TIME
              </h3>
              <p className="text-xs text-aa-text-dim mt-0.5">Session timeline — all players</p>
            </div>
            {/* Time filter buttons — "Full" is pre-selected (static, no state). */}
            <div className="flex gap-1">
              {["1H", "2H", "Full"].map((label) => (
                <button
                  key={label}
                  className={`px-3 py-1 rounded text-[10px] font-bold tracking-wider transition-colors ${
                    label === "Full"
                      ? "bg-aa-accent/15 text-aa-accent border border-aa-accent/20"
                      : "text-aa-text-dim hover:text-aa-text border border-transparent hover:border-aa-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart placeholder — mimics an area chart with pure SVG */}
          <div className="h-[260px] relative overflow-hidden rounded-lg bg-aa-bg/50 border border-aa-border/50">
            {/* Y-axis grid lines — 5 horizontal reference lines from 5000m
                down to 0m in 1250m increments, giving visual scale to the chart. */}
            <div className="absolute inset-0 flex flex-col justify-between py-4 px-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-aa-text-dim w-8 text-right">
                    {(5000 - i * 1250).toLocaleString()}
                  </span>
                  <div className="flex-1 border-t border-aa-border/30 border-dashed" />
                </div>
              ))}
            </div>

            {/* SVG area chart — hand-drawn cubic Bezier curves.
                Y coordinates descend (200 → 18) because SVG Y=0 is the top of
                the viewport, so lower Y values = higher plotted distance.
                The curve shape represents typical cumulative distance: steep
                early gains that flatten as the session progresses (players
                accumulate distance quickly at first, then fatigue). */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <defs>
                {/* Area-under-curve gradient: fades from 25% opacity cyan at
                    the data line to transparent at the bottom — a standard
                    data-viz technique to emphasize the magnitude of the metric. */}
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Filled area beneath the line */}
              <path
                d="M0,200 C60,190 80,170 120,155 C160,140 200,110 260,95 C320,80 360,85 420,70 C480,55 520,40 580,35 C640,30 680,32 740,28 C800,24 840,20 900,18 L900,260 L0,260 Z"
                fill="url(#areaGrad)"
              />
              {/* The line itself (stroke only, no fill) */}
              <path
                d="M0,200 C60,190 80,170 120,155 C160,140 200,110 260,95 C320,80 360,85 420,70 C480,55 520,40 580,35 C640,30 680,32 740,28 C800,24 840,20 900,18"
                fill="none"
                stroke="#00f0ff"
                strokeWidth="2"
                opacity="0.8"
              />
            </svg>

            {/* X-axis time labels (minutes into the session) */}
            <div className="absolute bottom-3 left-12 right-4 flex justify-between">
              {["0'", "15'", "30'", "45'", "60'", "75'", "90'"].map((t) => (
                <span key={t} className="text-[10px] font-mono text-aa-text-dim">{t}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Speed Zones — horizontal bar chart ──────────── */}
        <div className="col-span-4 bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "600ms" }}>
          <h3 className="font-display text-xl tracking-[0.06em] text-aa-text mb-1">
            SPEED ZONES
          </h3>
          <p className="text-xs text-aa-text-dim mb-5">Distribution by velocity band</p>
          <div className="space-y-3">
            {SPEED_ZONES.map((z, i) => (
              // Each bar staggers in: starts at 700ms (after the panel itself
              // enters at 600ms + 100ms buffer), then 60ms between each bar.
              // 60ms is tighter than the KPI stagger (80ms) because the bars
              // are visually smaller and closer together.
              <div key={z.zone} className="opacity-0 animate-slide-up" style={{ animationDelay: `${700 + i * 60}ms` }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-aa-text">{z.zone}</span>
                    <span className="text-[10px] font-mono text-aa-text-dim">{z.label} m/s</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-aa-text tabular-nums">{z.pct}%</span>
                </div>
                <div className="h-2.5 bg-aa-bg rounded-full overflow-hidden">
                  <div
                    className={`h-full ${z.color} rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${z.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Summary stats below the bars */}
          <div className="mt-5 pt-4 border-t border-aa-border/50">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-aa-text-dim">Avg Speed</span>
                <p className="font-display text-2xl text-aa-text mt-0.5">4.3 <span className="text-sm font-body text-aa-text-dim">m/s</span></p>
              </div>
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-aa-text-dim">Peak Speed</span>
                <p className="font-display text-2xl text-aa-warm mt-0.5">9.2 <span className="text-sm font-body text-aa-text-dim">m/s</span></p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Player Leaderboard ────────────────────────────── */}
        <div className="col-span-5 bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "700ms" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-xl tracking-[0.06em] text-aa-text">
                PLAYER LEADERBOARD
              </h3>
              <p className="text-xs text-aa-text-dim mt-0.5">Top performers — Total Distance</p>
            </div>
            <button className="text-[10px] font-semibold tracking-wider text-aa-accent hover:text-aa-accent/80 transition-colors uppercase">
              View All →
            </button>
          </div>
          <div className="overflow-hidden rounded-lg border border-aa-border/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-aa-border/50 bg-aa-bg/50">
                  <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-2.5">#</th>
                  <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-2.5">Player</th>
                  <th className="text-right text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-2.5">Dist (m)</th>
                  <th className="text-right text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-2.5">Top Spd</th>
                  <th className="text-right text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-2.5">Load</th>
                </tr>
              </thead>
              <tbody>
                {PLAYER_DATA.map((p, i) => (
                  // Rows stagger in starting at 800ms, 60ms apart.
                  <tr
                    key={p.rank}
                    className="border-b border-aa-border/30 hover:bg-aa-elevated/50 transition-colors cursor-pointer opacity-0 animate-slide-up"
                    style={{ animationDelay: `${800 + i * 60}ms` }}
                  >
                    <td className="px-4 py-3">
                      {/* padStart(2, "0") zero-pads single-digit ranks (1 → "01")
                          for monospaced visual alignment in the table column. */}
                      <span className={`text-xs font-mono font-bold ${i === 0 ? "text-aa-accent" : "text-aa-text-dim"}`}>
                        {String(p.rank).padStart(2, "0")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {/* Position badge — rank 1 gets accent color to
                            draw attention to the session leader. */}
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold ${
                          i === 0
                            ? "bg-aa-accent/15 text-aa-accent border border-aa-accent/20"
                            : "bg-aa-elevated text-aa-text-secondary border border-aa-border"
                        }`}>
                          {p.pos}
                        </div>
                        <span className="text-sm font-semibold text-aa-text">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-aa-text tabular-nums">{p.dist}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-aa-text tabular-nums">{p.spd}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-aa-text tabular-nums">{p.load}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Acute:Chronic Workload Ratio — donut chart ──── */}
        <div className="col-span-4 bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "800ms" }}>
          <h3 className="font-display text-xl tracking-[0.06em] text-aa-text mb-1">
            ACUTE : CHRONIC
          </h3>
          <p className="text-xs text-aa-text-dim mb-5">7-day vs 28-day workload ratio</p>

          <div className="flex items-center justify-center py-6">
            {/* Donut chart — SVG circle with strokeDasharray trick.
                Math: circumference = 2 × π × radius = 2 × 3.14159 × 50 ≈ 314.
                The dash length is 82% of that (0.82 × 314 ≈ 257), then a gap
                of 314 fills the rest. This renders a donut arc proportional
                to the ACWR value of 0.82.
                `-rotate-90` rotates the circle so the arc starts at 12 o'clock
                (SVG circles default to starting at 3 o'clock / east). */}
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                {/* Background ring (full circle, dark) */}
                <circle cx="60" cy="60" r="50" fill="none" stroke="#1e2231" strokeWidth="10" />
                {/* Foreground arc — length proportional to ACWR value */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="#00f0ff"
                  strokeWidth="10"
                  strokeDasharray={`${0.82 * 314} ${314}`}
                  strokeLinecap="round"
                  className="opacity-80"
                />
              </svg>
              {/* Center label showing the ACWR value.
                  0.82 falls within the 0.8–1.3 "sweet spot" (Gabbett's research),
                  meaning the team is training at an optimal load with low injury risk. */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-3xl text-aa-text">0.82</span>
                <span className="text-[10px] font-semibold text-aa-success tracking-wider uppercase">Optimal</span>
              </div>
            </div>
          </div>

          {/* Risk level legend */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            {WORKLOAD_LEVELS.map((item) => (
              <div key={item.label} className="text-center p-2 rounded-lg bg-aa-bg/50">
                <div className={`w-2 h-2 rounded-full ${item.color} mx-auto mb-1`} />
                <span className="text-[10px] font-semibold text-aa-text-secondary block">{item.label}</span>
                <span className="text-[10px] font-mono text-aa-text-dim">{item.range}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Session Info + Alert ──────────────────────────── */}
        <div className="col-span-3 space-y-4">
          {/* Session metadata card */}
          <div className="bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "900ms" }}>
            <h3 className="font-display text-lg tracking-[0.06em] text-aa-text mb-3">
              SESSION INFO
            </h3>
            <div className="space-y-3">
              {SESSION_INFO.map((item) => (
                <div key={item.label} className="flex items-center justify-between py-1 border-b border-aa-border/30 last:border-0">
                  <span className="text-xs text-aa-text-dim">{item.label}</span>
                  <span className="text-xs font-mono font-medium text-aa-text">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Alert card — enters last (1000ms) as a deliberate visual climax,
              drawing the coach's attention to actionable information. */}
          <div className="bg-gradient-to-br from-aa-accent/5 to-transparent border border-aa-accent/10 rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "1000ms" }}>
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-aa-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
              </svg>
              <span className="text-xs font-bold text-aa-accent tracking-wider uppercase">Alert</span>
            </div>
            <p className="text-xs text-aa-text-secondary leading-relaxed">
              <strong className="text-aa-text">3 players</strong> exceeded their 28-day workload ceiling during this session. Review flagged athletes before next practice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
