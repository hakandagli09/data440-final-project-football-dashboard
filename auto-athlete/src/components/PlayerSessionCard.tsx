"use client";

import Link from "next/link";
import PlayerStatusBadge from "@/components/PlayerStatusBadge";
import type {
  SessionReportCell,
  SessionReportPlayerCard,
  ReportUnit,
  SparklinePoint,
} from "@/lib/session-report-queries";
import {
  formatCount,
  formatMph,
  formatYards,
  UNIT_LABELS,
} from "@/lib/units";

/**
 * Format a single metric value (daily / running total / weekly avg) using
 * the unit declared on the cell. Values in the DB are already imperial
 * (yards, mph, yd/min) for W&M's StatSports config — no conversion.
 */
function formatMetricValue(value: number | null, unit: ReportUnit, decimals: number): string {
  if (value == null) return "—";
  if (unit === "distance") return formatYards(value, decimals);
  if (unit === "speed") return formatMph(value, decimals);
  if (unit === "distance_per_min") return formatYards(value, decimals);
  if (unit === "pct") return `${value.toFixed(decimals)}%`;
  return formatCount(value, decimals);
}

/**
 * Color-code the "%" column. Thresholds mirror the red/yellow/green
 * gradient on Brian's spreadsheet: near-100% is healthy, spikes or
 * troughs trigger visual warnings.
 */
function percentColor(pct: number | null): string {
  if (pct == null) return "text-aa-text-dim";
  if (pct >= 130 || pct <= 70) return "text-aa-danger font-semibold";
  if (pct >= 115 || pct <= 85) return "text-aa-warm font-semibold";
  return "text-aa-success";
}

function percentBg(pct: number | null): string {
  if (pct == null) return "bg-transparent";
  if (pct >= 130 || pct <= 70) return "bg-aa-danger/15";
  if (pct >= 115 || pct <= 85) return "bg-aa-warm/10";
  return "bg-aa-success/8";
}

/**
 * Lightweight inline sparkline — avoids pulling in a full chart library
 * for a widget that just needs to show trend direction.
 */
function Sparkline({ points }: { points: SparklinePoint[] }) {
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 120;
  const height = 28;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p.value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className="text-aa-accent" aria-hidden="true">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(" ")}
      />
    </svg>
  );
}

interface PlayerSessionCardProps {
  card: SessionReportPlayerCard;
}

/**
 * Single player's Session Report card — mirrors the layout in Brian's
 * Excel spreadsheet (Daily / Running Total / Weekly Avg / %) so coaches
 * can read it with zero retraining.
 */
export default function PlayerSessionCard({ card }: PlayerSessionCardProps) {
  const showStatus = card.status !== "cleared";

  // Latest-day yardage drives the sparkline summary label.
  // Sparkline values are already in yards (DB stores imperial directly).
  const latestDistanceYards = card.distanceSparkline.at(-1)?.value ?? 0;

  // Today's max speed is the most useful speed number to surface in the
  // header — it's what the coach asks about first. DB value is already mph.
  const maxSpeedCell = card.cells.find((c: SessionReportCell) => c.key === "max_speed");
  const maxSpeedMph: number | null = maxSpeedCell?.daily ?? null;

  return (
    <div className="rounded-xl border border-aa-border bg-aa-surface overflow-hidden print:break-inside-avoid print:border-gray-400">
      <div className="flex items-start justify-between px-4 py-3 border-b border-aa-border bg-aa-elevated">
        <div className="min-w-0">
          <Link
            href={`/dashboard/players/${card.playerId}`}
            className="font-display text-lg tracking-[0.04em] text-aa-text hover:text-aa-accent transition-colors truncate block"
          >
            {card.playerName}
          </Link>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] font-mono text-aa-text-dim uppercase tracking-wider">
            <span>{card.position}</span>
            {showStatus && (
              <>
                <span>·</span>
                <PlayerStatusBadge status={card.status} />
              </>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 ml-3">
          <Sparkline points={card.distanceSparkline} />
          <div className="mt-0.5 flex items-center justify-end gap-2 text-[10px] font-mono text-aa-text-dim">
            <span>{formatYards(latestDistanceYards, 0)} {UNIT_LABELS.distance}</span>
            {maxSpeedMph != null && maxSpeedMph > 0 && (
              <>
                <span>·</span>
                <span>{maxSpeedMph.toFixed(1)} {UNIT_LABELS.speed}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="text-aa-text-dim uppercase tracking-wider">
            <th className="text-left py-1.5 px-3 font-medium">Metric</th>
            <th className="text-right py-1.5 px-2 font-medium">Daily</th>
            <th className="text-right py-1.5 px-2 font-medium">Running</th>
            <th className="text-right py-1.5 px-2 font-medium">Week Avg</th>
            <th className="text-right py-1.5 px-3 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {card.cells.map((cell, idx) => (
            <tr
              key={cell.key}
              className={`border-t border-aa-border/40 ${idx % 2 === 1 ? "bg-aa-elevated/30" : ""}`}
            >
              <td className="text-left py-1.5 px-3 text-aa-text-secondary">{cell.label}</td>
              <td className="text-right py-1.5 px-2 text-aa-text tabular-nums">
                {formatMetricValue(cell.daily, cell.unit, cell.decimals)}
              </td>
              <td className="text-right py-1.5 px-2 text-aa-text-secondary tabular-nums">
                {formatMetricValue(cell.runningTotal, cell.unit, cell.decimals)}
              </td>
              <td className="text-right py-1.5 px-2 text-aa-text-dim tabular-nums">
                {formatMetricValue(cell.weeklyAverage, cell.unit, cell.decimals)}
              </td>
              <td
                className={`text-right py-1.5 px-3 tabular-nums ${percentColor(
                  cell.pctOfWeeklyAvg
                )} ${percentBg(cell.pctOfWeeklyAvg)}`}
              >
                {cell.suppressPercent
                  ? "—"
                  : cell.pctOfWeeklyAvg == null
                    ? "—"
                    : `${cell.pctOfWeeklyAvg.toFixed(0)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
