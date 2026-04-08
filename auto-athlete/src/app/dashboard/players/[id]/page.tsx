import Link from "next/link";
import { notFound } from "next/navigation";
import PlayerStatusBadge from "@/components/PlayerStatusBadge";
import PlayerStatusSelect from "@/components/PlayerStatusSelect";
import { formatSessionDate } from "@/lib/date-utils";
import { getPlayerProfile } from "@/lib/player-queries";

interface PageProps {
  params: Promise<{ id: string }>;
}

function num(value: number | null, decimals = 1): string {
  if (value == null) return "—";
  return value.toFixed(decimals);
}

function asymmetryStyle(value: number | null): string {
  if (value == null) return "text-aa-text-secondary";
  if (Math.abs(value) > 10) return "text-aa-danger";
  return "text-aa-success";
}

function TrendBars({
  values,
  colorClass,
}: {
  values: number[];
  colorClass: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {values.map((value, idx) => (
        <div
          key={`${idx}-${value}`}
          className={`w-2 rounded-sm ${colorClass}`}
          style={{ height: `${Math.max(10, (value / max) * 100)}%` }}
          title={value.toFixed(1)}
        />
      ))}
    </div>
  );
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const profile = await getPlayerProfile(id);
  if (!profile) notFound();

  const speedValues = profile.trends.map((t) => t.pctMaxSpeed);
  const hsrValues = profile.trends.map((t) => t.hsr);
  const sprintValues = profile.trends.map((t) => t.sprintDistance);
  const dslValues = profile.trends.map((t) => t.dsl);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between opacity-0 animate-fade-in">
        <div>
          <Link href="/dashboard/players" className="text-xs text-aa-accent hover:text-aa-accent/80 transition-colors">
            ← Back to Players
          </Link>
          <h1 className="mt-2 font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
            {profile.name.toUpperCase()}
          </h1>
          <p className="mt-1 text-sm text-aa-text-secondary">
            {profile.position} player profile
          </p>
        </div>
        <div className="w-[240px] space-y-2">
          <PlayerStatusBadge status={profile.status} />
          <PlayerStatusSelect playerId={profile.id} currentStatus={profile.status} />
          {profile.expectedReturn && (
            <p className="text-xs text-aa-text-secondary">
              Expected return: {formatSessionDate(profile.expectedReturn)}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-aa-surface border border-aa-border rounded-xl p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">Days Since 90%</span>
          <p className="font-display text-3xl text-aa-text mt-1">
            {profile.sprintRecency.daysSince90 ?? "—"}
          </p>
        </div>
        <div className="bg-aa-surface border border-aa-border rounded-xl p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">Days Since 85%</span>
          <p className="font-display text-3xl text-aa-text mt-1">
            {profile.sprintRecency.daysSince85 ?? "—"}
          </p>
        </div>
        <div className="bg-aa-surface border border-aa-border rounded-xl p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">All-Time Max Speed</span>
          <p className="font-display text-3xl text-aa-warm mt-1">
            {num(profile.sprintRecency.allTimeMaxSpeed)}<span className="font-body text-sm text-aa-text-secondary ml-1">m/s</span>
          </p>
        </div>
        <div className="bg-aa-surface border border-aa-border rounded-xl p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">Active Flags</span>
          <p className="font-display text-3xl text-aa-accent mt-1">
            {profile.flags.length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-aa-surface border border-aa-border rounded-xl p-5 space-y-4">
          <h2 className="font-display text-xl tracking-[0.06em] text-aa-text">14-DAY TRENDS</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-aa-bg/50 border border-aa-border/50 p-3">
              <p className="text-xs text-aa-text-secondary mb-2">% Max Velocity</p>
              <TrendBars values={speedValues} colorClass="bg-aa-accent/90" />
            </div>
            <div className="rounded-lg bg-aa-bg/50 border border-aa-border/50 p-3">
              <p className="text-xs text-aa-text-secondary mb-2">HSR</p>
              <TrendBars values={hsrValues} colorClass="bg-aa-warning/90" />
            </div>
            <div className="rounded-lg bg-aa-bg/50 border border-aa-border/50 p-3">
              <p className="text-xs text-aa-text-secondary mb-2">Zone 6 Sprint</p>
              <TrendBars values={sprintValues} colorClass="bg-aa-warm/90" />
            </div>
            <div className="rounded-lg bg-aa-bg/50 border border-aa-border/50 p-3">
              <p className="text-xs text-aa-text-secondary mb-2">DSL</p>
              <TrendBars values={dslValues} colorClass="bg-aa-success/90" />
            </div>
          </div>
          {profile.trends.length > 0 && (
            <p className="text-[11px] text-aa-text-dim">
              Latest: {formatSessionDate(profile.trends[profile.trends.length - 1].date)}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-aa-surface border border-aa-border rounded-xl p-5">
            <h2 className="font-display text-xl tracking-[0.06em] text-aa-text mb-3">FATIGUE SNAPSHOT</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-aa-bg/50 p-3 border border-aa-border/40">
                <p className="text-aa-text-dim text-xs">Jump Height (cm)</p>
                <p className="font-mono text-aa-text mt-1">{num(profile.fatigue.jumpHeightCm, 1)}</p>
              </div>
              <div className="rounded-lg bg-aa-bg/50 p-3 border border-aa-border/40">
                <p className="text-aa-text-dim text-xs">RSI-Modified</p>
                <p className="font-mono text-aa-text mt-1">{num(profile.fatigue.rsiModified, 2)}</p>
              </div>
              <div className="rounded-lg bg-aa-bg/50 p-3 border border-aa-border/40">
                <p className="text-aa-text-dim text-xs">Accel + Decel (Z4-6)</p>
                <p className="font-mono text-aa-text mt-1">{num(profile.fatigue.accelDecel46, 1)}</p>
              </div>
              <div className="rounded-lg bg-aa-bg/50 p-3 border border-aa-border/40">
                <p className="text-aa-text-dim text-xs">Groin Squeeze</p>
                <p className="font-mono text-aa-text mt-1">{num(profile.fatigue.groinSqueeze, 1)}</p>
              </div>
              <div className="rounded-lg bg-aa-bg/50 p-3 border border-aa-border/40 col-span-2">
                <p className="text-aa-text-dim text-xs">Hamstring Iso 30</p>
                <p className="font-mono text-aa-text mt-1">{num(profile.fatigue.hamstringIso, 1)}</p>
              </div>
            </div>
          </div>

          <div className="bg-aa-surface border border-aa-border rounded-xl p-5">
            <h2 className="font-display text-xl tracking-[0.06em] text-aa-text mb-3">ASYMMETRY</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between border-b border-aa-border/40 pb-2">
                <span className="text-aa-text-secondary">ForceFrame (Squeeze)</span>
                <span className={`font-mono ${asymmetryStyle(profile.asymmetry.forceFramePct)}`}>
                  {num(profile.asymmetry.forceFramePct, 1)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-aa-text-secondary">NordBord</span>
                <span className={`font-mono ${asymmetryStyle(profile.asymmetry.nordBordPct)}`}>
                  {num(profile.asymmetry.nordBordPct, 1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="bg-aa-surface border border-aa-border rounded-xl p-5">
            <h2 className="font-display text-xl tracking-[0.06em] text-aa-text mb-3">FLAGS</h2>
            {profile.flags.length === 0 ? (
              <p className="text-sm text-aa-success">No active flags for this player.</p>
            ) : (
              <ul className="space-y-2">
                {profile.flags.map((flag) => (
                  <li key={flag} className="text-sm text-aa-warning">
                    • {flag}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="bg-aa-surface border border-aa-border rounded-xl p-5">
        <h2 className="font-display text-xl tracking-[0.06em] text-aa-text mb-1">REQUIRED METRICS</h2>
        <p className="text-xs text-aa-text-secondary mb-4">
          {profile.requiredMetrics.group === "bigs" ? "Bigs" : "Skills / Mids"} daily metric set
        </p>
        <div className="grid grid-cols-2 gap-3">
          {profile.requiredMetrics.items.map((metric) => (
            <div key={metric.label} className="rounded-lg bg-aa-bg/50 p-3 border border-aa-border/40">
              <p className="text-aa-text-dim text-xs">{metric.label}</p>
              <p className="font-mono text-aa-text mt-1">
                {num(metric.value, 1)}
                {metric.unit ? <span className="text-aa-text-secondary text-xs ml-1">{metric.unit}</span> : null}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
