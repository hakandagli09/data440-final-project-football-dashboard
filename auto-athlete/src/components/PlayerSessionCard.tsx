"use client";

import Link from "next/link";
import PlayerStatusBadge from "@/components/PlayerStatusBadge";
import type {
  SessionReportCell,
  SessionReportPlayerCard,
  ReportMode,
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
  /**
   * Layout differs by mode:
   *  - single-day → Daily / 7D Avg / <Title> Avg / %
   *      Daily         = today's value (sum/max/mean of today's drill rows)
   *      7D Avg        = mean of daily aggregates over [today − 7, today]
   *      <Title> Avg   = year-to-date mean of the player's same-title
   *                      days within the selected date's calendar year
   *                      (Helmets / Full Pads / Game / etc.)
   *      %             = Daily ÷ <Title> Avg × 100
   *  - range     → Total / <Title> Avg / %
   *      Total         = aggregate across the picked window
   *      <Title> Avg   = year-to-date same-title mean (excluding the
   *                      selected window). Defaults to "Game" when no
   *                      session-title chip is active, since a range
   *                      can mix titles.
   *      %             = (per-day mean across the range) ÷ <Title> Avg × 100
   *
   *  Game-type avg/% are suppressed (rendered as "—") when the
   *  selected date is in Jan–July — coach Sutton's rule that game
   *  averages should not display before the season starts in August.
   *  Non-game practice avgs (Helmets, Full Pads, etc.) display
   *  year-round so spring training has a benchmark to compare against.
   */
  mode: ReportMode;
  /** Date carried into the player profile when a report card is opened. */
  reportDate: string;
  /** Highlight when the user arrived from a flagged player card. */
  isFocused?: boolean;
}

/**
 * Single player's Session Report card. The % column is the "% of
 * practice-type" view: each row compares today's value to the player's
 * own year-to-date mean for the *same* practice type. Helmets day →
 * Helmets avg, Full Pads day → Full Pads avg, Game day → Game avg.
 * Game-day baselines are suppressed in Jan–July (off-season).
 */
export default function PlayerSessionCard({
  card,
  mode,
  reportDate,
  isFocused = false,
}: PlayerSessionCardProps) {
  const showStatus = card.status !== "cleared";
  const isRange = mode === "range";
  const profileHref = `/dashboard/players/${card.playerId}?date=${reportDate}`;

  // Latest-day yardage drives the sparkline summary label.
  // Sparkline values are already in yards (DB stores imperial directly).
  const latestDistanceYards = card.distanceSparkline.at(-1)?.value ?? 0;

  // Today's max speed is the most useful speed number to surface in the
  // header — it's what the coach asks about first. DB value is already
  // mph. In range mode `daily` is null on every cell, so fall back to
  // the runningTotal (which carries the range max for max-aggregation
  // metrics) so the header still shows a useful number.
  const maxSpeedCell = card.cells.find((c: SessionReportCell) => c.key === "max_speed");
  const maxSpeedMph: number | null =
    (isRange ? maxSpeedCell?.runningTotal : maxSpeedCell?.daily) ?? null;

  return (
    <div
      className={`rounded-xl border bg-aa-surface overflow-hidden print:break-inside-avoid print:border-gray-400 ${
        isFocused ? "border-aa-accent shadow-[0_0_0_1px_rgb(var(--aa-accent)/0.35)]" : "border-aa-border"
      }`}
    >
      <div className="flex items-start justify-between px-4 py-3 border-b border-aa-border bg-aa-elevated">
        <div className="min-w-0">
          <Link
            href={profileHref}
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
            {/* Daily column only appears in single-day mode — in range
                mode it would always show "—" and waste horizontal space. */}
            {!isRange && (
              <th className="text-right py-1.5 px-2 font-medium">Daily</th>
            )}
            {/* Single-day mode shows a rolling 7-day mean ("7D Avg"),
                matching the formula Brian uses in his spreadsheet:
                AVERAGEIFS(metric, date<=today AND date>=today-7).
                Range mode collapses to the rollup across the picked
                window, displayed as "Total". */}
            <th className="text-right py-1.5 px-2 font-medium">
              {isRange ? "Total" : "7D Avg"}
            </th>
            {/* Baseline column header tracks the practice type that
                drives this card's % — Helmets day shows "Helmets Avg",
                Game day shows "Game Avg", etc. Off-season cards have
                no baselineTitle, so we fall back to a generic "Avg"
                label and the cells render as "—" downstream. */}
            <th className="text-right py-1.5 px-2 font-medium">
              {card.baselineTitle ? `${card.baselineTitle} Avg` : "Avg"}
            </th>
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
              {!isRange && (
                <td className="text-right py-1.5 px-2 text-aa-text tabular-nums">
                  {formatMetricValue(cell.daily, cell.unit, cell.decimals)}
                </td>
              )}
              <td className="text-right py-1.5 px-2 text-aa-text-secondary tabular-nums">
                {formatMetricValue(cell.runningTotal, cell.unit, cell.decimals)}
              </td>
              <td className="text-right py-1.5 px-2 text-aa-text-dim tabular-nums">
                {formatMetricValue(cell.baselineMean, cell.unit, cell.decimals)}
              </td>
              <td
                className={`text-right py-1.5 px-3 tabular-nums ${percentColor(
                  cell.pctOfBaseline
                )} ${percentBg(cell.pctOfBaseline)}`}
              >
                {cell.suppressPercent
                  ? "—"
                  : cell.pctOfBaseline == null
                    ? "—"
                    : `${cell.pctOfBaseline.toFixed(0)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
