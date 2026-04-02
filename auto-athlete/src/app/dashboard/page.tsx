"use client";

import KPICard from "@/components/KPICard";

const KPI_DATA = [
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

export default function DashboardPage() {
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
          {/* Date selector placeholder */}
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-aa-border bg-aa-surface text-xs font-mono text-aa-text-secondary hover:border-aa-border-bright transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            Apr 02, 2026
          </button>
          {/* Export */}
          <button className="px-4 py-2 rounded-lg bg-aa-accent/10 border border-aa-accent/20 text-xs font-semibold text-aa-accent hover:bg-aa-accent/20 transition-colors">
            Export Report
          </button>
        </div>
      </div>

      {/* ── KPI Cards Row ──────────────────────────────────── */}
      <div className="grid grid-cols-6 gap-4">
        {KPI_DATA.map((kpi, i) => (
          <KPICard key={kpi.title} {...kpi} delay={i * 80} />
        ))}
      </div>

      {/* ── Main content grid ──────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">
        {/* ── Distance Over Time — large chart ──────────── */}
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
          {/* Chart placeholder — mimics an area chart */}
          <div className="h-[260px] relative overflow-hidden rounded-lg bg-aa-bg/50 border border-aa-border/50">
            {/* Grid lines */}
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
            {/* Fake area shape */}
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

        {/* ── Speed Zones — bar chart ──────────────────────── */}
        <div className="col-span-4 bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "600ms" }}>
          <h3 className="font-display text-xl tracking-[0.06em] text-aa-text mb-1">
            SPEED ZONES
          </h3>
          <p className="text-xs text-aa-text-dim mb-5">Distribution by velocity band</p>
          <div className="space-y-3">
            {[
              { zone: "Zone 5", label: "> 7.0 m/s", pct: 8, color: "bg-aa-danger" },
              { zone: "Zone 4", label: "5.5–7.0", pct: 15, color: "bg-aa-warm" },
              { zone: "Zone 3", label: "4.0–5.5", pct: 28, color: "bg-aa-warning" },
              { zone: "Zone 2", label: "2.0–4.0", pct: 32, color: "bg-aa-accent" },
              { zone: "Zone 1", label: "< 2.0", pct: 17, color: "bg-aa-text-dim" },
            ].map((z, i) => (
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
                {[
                  { rank: 1, name: "J. Williams", pos: "WR", dist: "6,847", spd: "9.2", load: "912" },
                  { rank: 2, name: "M. Carter", pos: "RB", dist: "6,421", spd: "8.8", load: "885" },
                  { rank: 3, name: "D. Thompson", pos: "SS", dist: "6,105", spd: "8.5", load: "847" },
                  { rank: 4, name: "K. Johnson", pos: "CB", dist: "5,982", spd: "9.0", load: "823" },
                  { rank: 5, name: "T. Mitchell", pos: "LB", dist: "5,741", spd: "7.9", load: "801" },
                ].map((p, i) => (
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

        {/* ── Workload Comparison ───────────────────────────── */}
        <div className="col-span-4 bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "800ms" }}>
          <h3 className="font-display text-xl tracking-[0.06em] text-aa-text mb-1">
            ACUTE : CHRONIC
          </h3>
          <p className="text-xs text-aa-text-dim mb-5">7-day vs 28-day workload ratio</p>

          <div className="flex items-center justify-center py-6">
            {/* Donut chart placeholder */}
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#1e2231" strokeWidth="10" />
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
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-3xl text-aa-text">0.82</span>
                <span className="text-[10px] font-semibold text-aa-success tracking-wider uppercase">Optimal</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { label: "Low Risk", range: "0.8–1.3", color: "bg-aa-success" },
              { label: "Caution", range: "1.3–1.5", color: "bg-aa-warning" },
              { label: "High Risk", range: "> 1.5", color: "bg-aa-danger" },
            ].map((item) => (
              <div key={item.label} className="text-center p-2 rounded-lg bg-aa-bg/50">
                <div className={`w-2 h-2 rounded-full ${item.color} mx-auto mb-1`} />
                <span className="text-[10px] font-semibold text-aa-text-secondary block">{item.label}</span>
                <span className="text-[10px] font-mono text-aa-text-dim">{item.range}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Session Notes / Quick Info ────────────────────── */}
        <div className="col-span-3 space-y-4">
          <div className="bg-aa-surface border border-aa-border rounded-xl p-5 opacity-0 animate-slide-up" style={{ animationDelay: "900ms" }}>
            <h3 className="font-display text-lg tracking-[0.06em] text-aa-text mb-3">
              SESSION INFO
            </h3>
            <div className="space-y-3">
              {[
                { label: "Duration", value: "1h 42m" },
                { label: "Players", value: "47 tracked" },
                { label: "GPS Fix", value: "18 Hz" },
                { label: "Weather", value: "72°F / Clear" },
              ].map((item) => (
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
              <strong className="text-aa-text">3 players</strong> exceeded their 28-day workload ceiling during this session. Review flagged athletes before next practice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
