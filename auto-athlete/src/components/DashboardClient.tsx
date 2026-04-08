"use client";

import KPICard from "@/components/KPICard";
import DateSelector from "@/components/DateSelector";
import Link from "next/link";
import { formatSessionDate } from "@/lib/date-utils";
import type {
  KpiData,
  SpeedZoneData,
  PlayerRow,
  SessionInfoItem,
  AcwrResult,
} from "@/lib/queries";

// ─── Icon map ─────────────────────────────────────────────────────────────

const KPI_ICONS: Record<KpiData["icon"], React.ReactNode> = {
  distance: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  ),
  speed: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  ),
  hsr: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
    </svg>
  ),
  load: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  ),
  sprint: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
    </svg>
  ),
  metabolic: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
    </svg>
  ),
};

// ─── ACWR risk levels (static reference) ──────────────────────────────────

const WORKLOAD_LEVELS = [
  { label: "Low Risk", range: "0.8–1.3", color: "bg-aa-success" },
  { label: "Caution", range: "1.3–1.5", color: "bg-aa-warning" },
  { label: "High Risk", range: "> 1.5", color: "bg-aa-danger" },
];

// ─── Props ────────────────────────────────────────────────────────────────

interface DashboardClientProps {
  kpis: KpiData[];
  speedZones: SpeedZoneData[];
  players: PlayerRow[];
  sessionInfo: SessionInfoItem[];
  acwr: AcwrResult;
  alertCount: number;
  sessionTitle: string;
  currentDate: string;
  availableDates: string[];
}

// ─── Component ────────────────────────────────────────────────────────────

export default function DashboardClient({
  kpis,
  speedZones,
  players,
  sessionInfo,
  acwr,
  alertCount,
  sessionTitle,
  currentDate,
  availableDates,
}: DashboardClientProps) {
  // ── Empty state ──
  if (kpis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 opacity-0 animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-aa-elevated border border-aa-border flex items-center justify-center mb-6">
          <svg className="w-9 h-9 text-aa-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <h2 className="font-display text-2xl tracking-[0.06em] text-aa-text mb-2">NO SESSION DATA YET</h2>
        <p className="text-sm text-aa-text-secondary mb-6">Upload a CSV from StatSports to see your dashboard</p>
        <Link
          href="/upload"
          className="px-6 py-2.5 rounded-lg bg-aa-accent/10 border border-aa-accent/20 text-sm font-semibold text-aa-accent hover:bg-aa-accent/20 transition-colors"
        >
          Upload Session Data
        </Link>
      </div>
    );
  }

  const formatDate = formatSessionDate;

  // Speed zone summary stats
  const avgSpeed = speedZones.length > 0
    ? (speedZones.reduce((acc, z, i) => acc + z.pct * (i + 1), 0) / 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-6">
      {/* ── Page header ────────────────────────────────────── */}
      <div className="flex items-end justify-between opacity-0 animate-fade-in">
        <div>
          <h1 className="font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
            PERFORMANCE OVERVIEW
          </h1>
          <p className="mt-1 text-sm text-aa-text-secondary">
            {sessionTitle} — {formatDate(currentDate)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateSelector dates={availableDates} currentDate={currentDate} />
          <button className="px-4 py-2 rounded-lg bg-aa-accent/10 border border-aa-accent/20 text-xs font-semibold text-aa-accent hover:bg-aa-accent/20 transition-colors">
            Export Report
          </button>
        </div>
      </div>

      {/* ── KPI Cards Row ──────────────────────────────────── */}
      <div className="grid grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <KPICard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            unit={kpi.unit}
            change={kpi.change}
            changeType={kpi.changeType}
            accentColor={kpi.accentColor}
            icon={KPI_ICONS[kpi.icon]}
            delay={i * 80}
            sparklineData={kpi.sparklineData}
          />
        ))}
      </div>

      {/* ── Main content grid ──────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* ── Distance Over Time — placeholder chart ────── */}
        <div className="col-span-8 bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "500ms" }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display text-xl tracking-[0.06em] text-aa-text">
                DISTANCE OVER TIME
              </h3>
              <p className="text-xs text-aa-text-dim mt-0.5">Session timeline — all players</p>
            </div>
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

          <div className="h-[260px] relative overflow-hidden rounded-lg bg-aa-bg/50 border border-aa-border/50">
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
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,200 C60,190 80,170 120,155 C160,140 200,110 260,95 C320,80 360,85 420,70 C480,55 520,40 580,35 C640,30 680,32 740,28 C800,24 840,20 900,18 L900,260 L0,260 Z"
                fill="url(#areaGrad)"
              />
              <path
                d="M0,200 C60,190 80,170 120,155 C160,140 200,110 260,95 C320,80 360,85 420,70 C480,55 520,40 580,35 C640,30 680,32 740,28 C800,24 840,20 900,18"
                fill="none"
                stroke="#00f0ff"
                strokeWidth="2"
                opacity="0.8"
              />
            </svg>
            <div className="absolute bottom-3 left-12 right-4 flex justify-between">
              {["0'", "15'", "30'", "45'", "60'", "75'", "90'"].map((t) => (
                <span key={t} className="text-[10px] font-mono text-aa-text-dim">{t}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Speed Zones ──────────────────────────────────── */}
        <div className="col-span-4 bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "600ms" }}>
          <h3 className="font-display text-xl tracking-[0.06em] text-aa-text mb-1">
            SPEED ZONES
          </h3>
          <p className="text-xs text-aa-text-dim mb-5">Distribution by velocity band</p>
          <div className="space-y-3">
            {speedZones.map((z, i) => (
              <div key={z.zone} className="opacity-0 animate-slide-up" style={{ animationDelay: `${700 + i * 60}ms` }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-aa-text">{z.zone}</span>
                    <span className="text-[10px] font-mono text-aa-text-dim">{z.label}</span>
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
          <div className="mt-5 pt-4 border-t border-aa-border/50">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-aa-text-dim">Avg Speed</span>
                <p className="font-display text-2xl text-aa-text mt-0.5">{avgSpeed} <span className="text-sm font-body text-aa-text-dim">m/s</span></p>
              </div>
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-aa-text-dim">Peak Speed</span>
                <p className="font-display text-2xl text-aa-warm mt-0.5">
                  {kpis.find((k) => k.icon === "speed")?.value ?? "—"} <span className="text-sm font-body text-aa-text-dim">m/s</span>
                </p>
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
            <Link
              href="/dashboard/players"
              className="text-[10px] font-semibold tracking-wider text-aa-accent hover:text-aa-accent/80 transition-colors uppercase"
            >
              View All →
            </Link>
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
                {players.map((p, i) => (
                  <tr
                    key={p.rank}
                    className="border-b border-aa-border/30 hover:bg-aa-elevated/50 transition-colors cursor-pointer opacity-0 animate-slide-up"
                    style={{ animationDelay: `${800 + i * 60}ms` }}
                  >
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono font-bold ${i === 0 ? "text-aa-accent" : "text-aa-text-dim"}`}>
                        {String(p.rank).padStart(2, "0")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
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

        {/* ── Acute:Chronic Workload Ratio ──────────────────── */}
        <div className="col-span-4 bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "800ms" }}>
          <h3 className="font-display text-xl tracking-[0.06em] text-aa-text mb-1">
            ACUTE : CHRONIC
          </h3>
          <p className="text-xs text-aa-text-dim mb-5">7-day vs 28-day workload ratio</p>

          <div className="flex items-center justify-center py-6">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#1e2231" strokeWidth="10" />
                {acwr.ratio !== null && (
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke={acwr.ratio > 1.5 ? "#ff1744" : acwr.ratio > 1.3 ? "#ffab00" : "#00f0ff"}
                    strokeWidth="10"
                    strokeDasharray={`${Math.min(acwr.ratio, 2) / 2 * 314} ${314}`}
                    strokeLinecap="round"
                    className="opacity-80"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-3xl text-aa-text">
                  {acwr.ratio !== null ? acwr.ratio.toFixed(2) : "—"}
                </span>
                <span className={`text-[10px] font-semibold tracking-wider uppercase ${
                  acwr.label === "High Risk" ? "text-aa-danger"
                    : acwr.label === "Caution" ? "text-aa-warning"
                    : acwr.label === "Optimal" ? "text-aa-success"
                    : "text-aa-text-dim"
                }`}>
                  {acwr.label}
                </span>
              </div>
            </div>
          </div>

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
          <div className="bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "900ms" }}>
            <h3 className="font-display text-lg tracking-[0.06em] text-aa-text mb-3">
              SESSION INFO
            </h3>
            <div className="space-y-3">
              {sessionInfo.map((item) => (
                <div key={item.label} className="flex items-center justify-between py-1 border-b border-aa-border/30 last:border-0">
                  <span className="text-xs text-aa-text-dim">{item.label}</span>
                  <span className="text-xs font-mono font-medium text-aa-text">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-aa-accent/5 to-transparent border border-aa-accent/10 rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "1000ms" }}>
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-aa-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
              </svg>
              <span className="text-xs font-bold text-aa-accent tracking-wider uppercase">Alert</span>
            </div>
            <p className="text-xs text-aa-text-secondary leading-relaxed">
              {alertCount > 0 ? (
                <>
                  <strong className="text-aa-text">{alertCount} player{alertCount !== 1 ? "s" : ""}</strong>{" "}
                  exceeded their 28-day workload ceiling during this session. Review flagged athletes before next practice.
                </>
              ) : (
                <>All players within normal workload ranges for this session.</>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
