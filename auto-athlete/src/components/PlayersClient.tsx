"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSessionDate } from "@/lib/date-utils";
import type { PositionReportData } from "@/lib/group-queries";
import { getPositionGroupLabel, type PlayerListItem } from "@/lib/player-queries";
import PlayerStatusBadge from "@/components/PlayerStatusBadge";
import PlayerStatusSelect from "@/components/PlayerStatusSelect";

type GroupFilter = "all" | "skills" | "bigs";
type ReportGroup = "skills_mids" | "bigs";
type DataFilter = "all" | "has_data" | "no_data";
type StatusFilter = "all" | PlayerListItem["status"];
type ReadinessFilter = "all" | PlayerListItem["readiness"];
type SessionFilter = "all" | "today" | "last_7" | "last_30" | "older" | "none";
type FlagsFilter = "all" | "none" | "one_two" | "three_plus";

function formatMetric(value: number | null, decimals = 1): string {
  if (value == null) return "—";
  return value.toFixed(decimals);
}

function readinessStyle(readiness: PlayerListItem["readiness"]): string {
  if (readiness === "red") return "bg-aa-danger";
  if (readiness === "yellow") return "bg-aa-warning";
  if (readiness === "green") return "bg-aa-success";
  return "bg-aa-text-dim";
}

function dayDiffFromToday(dateStr: string): number {
  // Date-only UTC math avoids timezone-related off-by-one day errors.
  const today = new Date();
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  return Math.floor((startOfToday - target) / (1000 * 60 * 60 * 24));
}

interface PlayersClientProps {
  players: PlayerListItem[];
  reportData: PositionReportData;
}

export default function PlayersClient({ players, reportData }: PlayersClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<GroupFilter>("all");
  const [dataFilter, setDataFilter] = useState<DataFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>("all");
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [flagsFilter, setFlagsFilter] = useState<FlagsFilter>("all");
  const [reportGroup, setReportGroup] = useState<ReportGroup>("skills_mids");
  const [playersState, setPlayersState] = useState<PlayerListItem[]>(players);

  useEffect(() => {
    setPlayersState(players);
  }, [players]);

  const filtered = useMemo((): PlayerListItem[] => {
    const normalized = query.trim().toLowerCase();
    return playersState.filter((player) => {
      if (normalized && !player.name.toLowerCase().includes(normalized)) {
        return false;
      }
      if (group === "all") return true;
      const groupLabel = getPositionGroupLabel(player.position);
      if (group === "skills" && groupLabel !== "Skills / Mids") return false;
      if (group === "bigs" && groupLabel !== "Bigs") return false;

      // Data-availability is explicitly separated from readiness state.
      const hasData = player.latestSessionDate != null;
      if (dataFilter === "has_data" && !hasData) return false;
      if (dataFilter === "no_data" && hasData) return false;

      if (statusFilter !== "all" && player.status !== statusFilter) return false;
      if (readinessFilter !== "all" && player.readiness !== readinessFilter) return false;

      if (sessionFilter !== "all") {
        if (!player.latestSessionDate) {
          if (sessionFilter !== "none") return false;
        } else {
          if (sessionFilter === "none") return false;
          const days = dayDiffFromToday(player.latestSessionDate);
          if (sessionFilter === "today" && days !== 0) return false;
          if (sessionFilter === "last_7" && (days < 0 || days > 7)) return false;
          if (sessionFilter === "last_30" && (days < 8 || days > 30)) return false;
          if (sessionFilter === "older" && days <= 30) return false;
        }
      }

      const flagCount = player.flags.length;
      if (flagsFilter === "none" && flagCount !== 0) return false;
      if (flagsFilter === "one_two" && (flagCount < 1 || flagCount > 2)) return false;
      if (flagsFilter === "three_plus" && flagCount < 3) return false;

      return true;
    });
  }, [dataFilter, flagsFilter, group, playersState, query, readinessFilter, sessionFilter, statusFilter]);

  const activeFilterCount = [
    group !== "all",
    dataFilter !== "all",
    statusFilter !== "all",
    readinessFilter !== "all",
    sessionFilter !== "all",
    flagsFilter !== "all",
  ].filter(Boolean).length;

  function clearAllFilters(): void {
    setGroup("all");
    setDataFilter("all");
    setStatusFilter("all");
    setReadinessFilter("all");
    setSessionFilter("all");
    setFlagsFilter("all");
    setQuery("");
  }

  const dailyRows = reportGroup === "skills_mids"
    ? reportData.sheets.skillsMidsDaily
    : reportData.sheets.bigsDaily;
  const weeklyRows = reportGroup === "skills_mids"
    ? reportData.sheets.skillsMidsWeekly
    : reportData.sheets.bigsWeekly;

  return (
    <div className="space-y-6">
      <div className="opacity-0 animate-fade-in">
        <h1 className="font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
          PLAYERS
        </h1>
        <p className="mt-1 text-sm text-aa-text-secondary">
          Player roster, status workflow, and readiness monitoring
        </p>
      </div>

      <div className="bg-aa-surface border border-aa-border rounded-xl p-4 opacity-0 animate-slide-up">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 xl:col-span-4">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">
              Search Player
            </label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a name..."
              className="mt-1.5 w-full rounded-lg border border-aa-border bg-aa-elevated px-3 py-2 text-sm text-aa-text placeholder:text-aa-text-dim focus:border-aa-accent focus:outline-none"
            />
          </div>
          <div className="col-span-6 sm:col-span-4 xl:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">
              Position Group
            </label>
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value as GroupFilter)}
              className="mt-1.5 w-full rounded-lg border border-aa-border bg-aa-elevated px-3 py-2 text-sm text-aa-text focus:border-aa-accent focus:outline-none"
            >
              <option value="all">All</option>
              <option value="skills">Skills / Mids</option>
              <option value="bigs">Bigs</option>
            </select>
          </div>
          <div className="col-span-6 sm:col-span-4 xl:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">
              Data
            </label>
            <select
              value={dataFilter}
              onChange={(event) => setDataFilter(event.target.value as DataFilter)}
              className="mt-1.5 w-full rounded-lg border border-aa-border bg-aa-elevated px-3 py-2 text-sm text-aa-text focus:border-aa-accent focus:outline-none"
            >
              <option value="all">All</option>
              <option value="has_data">Has Data</option>
              <option value="no_data">No Data</option>
            </select>
          </div>
          <div className="col-span-6 sm:col-span-4 xl:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="mt-1.5 w-full rounded-lg border border-aa-border bg-aa-elevated px-3 py-2 text-sm text-aa-text focus:border-aa-accent focus:outline-none"
            >
              <option value="all">All</option>
              <option value="cleared">Cleared</option>
              <option value="rehab">Rehab</option>
              <option value="injured">Injured</option>
              <option value="return_to_play">Return To Play</option>
            </select>
          </div>
          <div className="col-span-6 sm:col-span-4 xl:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">
              Readiness
            </label>
            <select
              value={readinessFilter}
              onChange={(event) => setReadinessFilter(event.target.value as ReadinessFilter)}
              className="mt-1.5 w-full rounded-lg border border-aa-border bg-aa-elevated px-3 py-2 text-sm text-aa-text focus:border-aa-accent focus:outline-none"
            >
              <option value="all">All</option>
              <option value="green">Green</option>
              <option value="yellow">Yellow</option>
              <option value="red">Red</option>
              <option value="neutral">Neutral (No Data)</option>
            </select>
          </div>
          <div className="col-span-6 sm:col-span-4 xl:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">
              Latest Session
            </label>
            <select
              value={sessionFilter}
              onChange={(event) => setSessionFilter(event.target.value as SessionFilter)}
              className="mt-1.5 w-full rounded-lg border border-aa-border bg-aa-elevated px-3 py-2 text-sm text-aa-text focus:border-aa-accent focus:outline-none"
            >
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="last_7">Last 7 Days</option>
              <option value="last_30">8-30 Days</option>
              <option value="older">Older Than 30 Days</option>
              <option value="none">No Session Data</option>
            </select>
          </div>
          <div className="col-span-6 sm:col-span-4 xl:col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">
              Flags
            </label>
            <select
              value={flagsFilter}
              onChange={(event) => setFlagsFilter(event.target.value as FlagsFilter)}
              className="mt-1.5 w-full rounded-lg border border-aa-border bg-aa-elevated px-3 py-2 text-sm text-aa-text focus:border-aa-accent focus:outline-none"
            >
              <option value="all">All</option>
              <option value="none">No Flags</option>
              <option value="one_two">1-2 Flags</option>
              <option value="three_plus">3+ Flags</option>
            </select>
          </div>
          <div className="col-span-12 flex items-center justify-between pt-1">
            <p className="text-xs text-aa-text-secondary">
              {filtered.length} player{filtered.length === 1 ? "" : "s"} shown
              {activeFilterCount > 0 ? ` · ${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}` : ""}
            </p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="rounded-lg border border-aa-border bg-aa-elevated px-3 py-1.5 text-xs text-aa-text-secondary hover:text-aa-text hover:border-aa-border-bright transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      <div className="bg-aa-surface border border-aa-border rounded-xl overflow-hidden opacity-0 animate-slide-up">
        <table className="w-full">
          <thead>
            <tr className="bg-aa-bg/50 border-b border-aa-border/60">
              <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Readiness</th>
              <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Player</th>
              <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Position</th>
              <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Status</th>
              <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Latest Session</th>
              <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Flags</th>
              <th className="text-left text-[10px] font-bold tracking-wider uppercase text-aa-text-dim px-4 py-3">Update Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((player) => (
              <tr key={player.id} className="border-b border-aa-border/30 hover:bg-aa-elevated/40 transition-colors">
                <td className="px-4 py-3">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${readinessStyle(player.readiness)}`} />
                  {player.readiness === "neutral" && (
                    <span className="ml-2 text-[11px] text-aa-text-dim">No Data</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/players/${player.id}`} className="text-sm font-semibold text-aa-text hover:text-aa-accent transition-colors">
                    {player.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-aa-text-secondary">
                  {player.position}
                  <span className="ml-2 text-aa-text-dim">({getPositionGroupLabel(player.position)})</span>
                </td>
                <td className="px-4 py-3">
                  <PlayerStatusBadge status={player.status} />
                </td>
                <td className="px-4 py-3 text-xs font-mono text-aa-text-secondary">
                  {player.latestSessionDate ? formatSessionDate(player.latestSessionDate) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-aa-text-secondary">
                  {player.flags.length > 0 ? `${player.flags.length} active` : "None"}
                </td>
                <td className="px-4 py-3">
                  <PlayerStatusSelect
                    playerId={player.id}
                    currentStatus={player.status}
                    onStatusSaved={(nextStatus) => {
                      setPlayersState((current) =>
                        current.map((p) =>
                          p.id === player.id
                            ? {
                                ...p,
                                status: nextStatus,
                              }
                            : p
                        )
                      );
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-sm text-aa-text-secondary">
            No players match your current filters. Try adjusting filters or click Clear All.
          </div>
        )}
      </div>

      <div className="bg-aa-surface border border-aa-border rounded-xl p-4 space-y-4 opacity-0 animate-slide-up">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl leading-none tracking-[0.05em] text-aa-text">
              POSITION REPORT SHEETS
            </h2>
            <p className="mt-1 text-xs text-aa-text-secondary">
              Daily metrics and weekly sums by group
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={reportData.currentDate}
              onChange={(event) => router.push(`/dashboard/players?date=${event.target.value}`)}
              className="rounded-lg border border-aa-border bg-aa-elevated px-3 py-2 text-xs text-aa-text focus:border-aa-accent focus:outline-none"
            >
              {reportData.availableDates.map((date) => (
                <option key={date} value={date}>
                  {formatSessionDate(date)}
                </option>
              ))}
            </select>
            <select
              value={reportGroup}
              onChange={(event) => setReportGroup(event.target.value as ReportGroup)}
              className="rounded-lg border border-aa-border bg-aa-elevated px-3 py-2 text-xs text-aa-text focus:border-aa-accent focus:outline-none"
            >
              <option value="skills_mids">Skills / Mids</option>
              <option value="bigs">Bigs</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-aa-border/60 overflow-hidden">
          <div className="px-3 py-2 bg-aa-bg/60 border-b border-aa-border/60">
            <p className="text-[10px] font-bold tracking-wider uppercase text-aa-text-dim">
              Daily ({reportData.currentDate ? formatSessionDate(reportData.currentDate) : "No data"})
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px]">
              <thead>
                <tr className="bg-aa-bg/40 border-b border-aa-border/40">
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Player</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Pos</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Distance</th>
                  {reportGroup === "skills_mids" ? (
                    <>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">HSR</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Z6 Sprint</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Accel 4-6</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Decel 4-6</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">DSL</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">HMLD</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">HMLD/min</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Max Vel</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">% Max</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">HSBI</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Momentum</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Explosive</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">EWMA HSR</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">EWMA Z6</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">EWMA A/D</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">EWMA Expl.</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Days 90%</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Days 85%</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">DSL</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Lower Speed</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">HMLD</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">HMLD/min</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">HSR</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">RPE</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Accel 4-6</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Explosive</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Max Vel</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">% Max</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Collision</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => (
                  <tr key={row.playerId} className="border-b border-aa-border/20">
                    <td className="px-3 py-2 text-xs text-aa-text">{row.playerName}</td>
                    <td className="px-3 py-2 text-xs text-aa-text-secondary">{row.position}</td>
                    <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.totalDistance, 0)}</td>
                    {reportGroup === "skills_mids" ? (
                      <>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.hsr, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.zone6SprintDistance, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.accel46, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.decel46, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.dsl, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.hmlDistance, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.hmldPerMinute, 2)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.maxVelocity, 2)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.pctMaxVelocity, 1)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.hsbi, 1)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.momentum, 1)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.explosiveEfforts, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.ewmaHsr, 1)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.ewmaZone6, 1)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.ewmaAccelDecel, 1)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.ewmaExplosive, 1)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{row.daysSince90 ?? "—"}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{row.daysSince85 ?? "—"}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.dsl, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.lowerSpeedLoading, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.hmlDistance, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.hmldPerMinute, 2)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.hsr, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.rpe, 1)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.accel46, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.explosiveEfforts, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.maxVelocity, 2)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.pctMaxVelocity, 1)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.collisionLoad, 0)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {dailyRows.length === 0 && (
              <div className="px-3 py-6 text-sm text-aa-text-secondary">No daily rows for this group/date.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-aa-border/60 overflow-hidden">
          <div className="px-3 py-2 bg-aa-bg/60 border-b border-aa-border/60">
            <p className="text-[10px] font-bold tracking-wider uppercase text-aa-text-dim">
              Weekly Sums ({reportData.weekStart} to {reportData.weekEnd})
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="bg-aa-bg/40 border-b border-aa-border/40">
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Player</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Pos</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Distance</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">HSR</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Sprint</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">DSL</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Accel+Decel</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Explosive</th>
                  {reportGroup === "bigs" && (
                    <>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Lower Speed</th>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-aa-text-dim">Collision</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {weeklyRows.map((row) => (
                  <tr key={row.playerId} className="border-b border-aa-border/20">
                    <td className="px-3 py-2 text-xs text-aa-text">{row.playerName}</td>
                    <td className="px-3 py-2 text-xs text-aa-text-secondary">{row.position}</td>
                    <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.totalDistance, 0)}</td>
                    <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.hsr, 0)}</td>
                    <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.sprintDistance, 0)}</td>
                    <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.dsl, 0)}</td>
                    <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.accelDecel, 0)}</td>
                    <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.explosiveEfforts, 0)}</td>
                    {reportGroup === "bigs" && (
                      <>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.lowerSpeedLoading, 0)}</td>
                        <td className="px-3 py-2 text-xs font-mono text-aa-text">{formatMetric(row.collisionLoad, 0)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {weeklyRows.length === 0 && (
              <div className="px-3 py-6 text-sm text-aa-text-secondary">No weekly rows for this group/date.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
