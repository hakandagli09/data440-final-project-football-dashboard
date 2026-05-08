"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatSessionDate } from "@/lib/date-utils";
import type { PlayerListItem, PlayerStatus, SeasonFlaggingData } from "@/lib/player-queries";

interface FlaggingBoardClientProps {
  data: SeasonFlaggingData;
}

const READINESS_META: Record<PlayerListItem["readiness"], {
  label: string;
  card: string;
  badge: string;
  dot: string;
}> = {
  red: {
    label: "Red",
    card: "border-aa-danger/50 bg-aa-danger/10",
    badge: "bg-aa-danger/15 text-aa-danger border-aa-danger/30",
    dot: "bg-aa-danger",
  },
  yellow: {
    label: "Yellow",
    card: "border-aa-warning/50 bg-aa-warning/10",
    badge: "bg-aa-warning/15 text-aa-warning border-aa-warning/30",
    dot: "bg-aa-warning",
  },
  green: {
    label: "Green",
    card: "border-aa-success/45 bg-aa-success/10",
    badge: "bg-aa-success/15 text-aa-success border-aa-success/30",
    dot: "bg-aa-success",
  },
  neutral: {
    label: "No Data",
    card: "border-aa-border bg-aa-surface",
    badge: "bg-aa-elevated text-aa-text-dim border-aa-border",
    dot: "bg-aa-text-dim",
  },
};

function sortPlayers(a: PlayerListItem, b: PlayerListItem): number {
  const order: Record<PlayerListItem["readiness"], number> = {
    red: 0,
    yellow: 1,
    green: 2,
    neutral: 3,
  };
  const readinessOrder = order[a.readiness] - order[b.readiness];
  if (readinessOrder !== 0) return readinessOrder;
  const flagOrder = b.flags.length - a.flags.length;
  if (flagOrder !== 0) return flagOrder;
  return a.name.localeCompare(b.name);
}

export default function FlaggingBoardClient({ data }: FlaggingBoardClientProps): JSX.Element {
  const activePlayers = data.players.filter((player) => player.status === "cleared").sort(sortPlayers);
  const managedPlayers = data.players
    .filter((player) => player.status !== "cleared")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 opacity-0 animate-fade-in">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-aa-accent">
            Coach Check-In
          </p>
          <h1 className="mt-1 font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
            {data.seasonLabel.toUpperCase()} FLAGGING
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-aa-text-secondary">
            Player cards are scoped to the latest GPS upload season. Red and yellow cards should be reviewed first.
          </p>
        </div>
        <Link
          href="/upload"
          className="px-4 py-2 rounded-lg bg-aa-accent/10 border border-aa-accent/20 text-xs font-semibold text-aa-accent hover:bg-aa-accent/20 transition-colors"
        >
          Upload Season Data
        </Link>
      </div>

      {!data.activeSeason ? (
        <div className="rounded-2xl border border-aa-warning/30 bg-aa-warning/10 p-8 text-center opacity-0 animate-slide-up">
          <h2 className="font-display text-2xl tracking-[0.06em] text-aa-text">NO SEASON-TAGGED GPS DATA</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-aa-text-secondary">
            Upload a GPS file and choose Spring, Summer, or Fall so the flagging board can build the right training-period baseline.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 opacity-0 animate-slide-up">
            <StatCard label="Roster" value={data.counts.total} tone="text-aa-text" />
            <StatCard label="Red" value={data.counts.red} tone="text-aa-danger" />
            <StatCard label="Yellow" value={data.counts.yellow} tone="text-aa-warning" />
            <StatCard label="Green" value={data.counts.green} tone="text-aa-success" />
            <StatCard label="Managed" value={data.counts.managed} tone="text-aa-accent" />
            <StatCard label="No Data" value={data.counts.neutral} tone="text-aa-text-dim" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {activePlayers.map((player, index) => (
              <PlayerFlagCard key={player.id} player={player} delay={index} />
            ))}
          </div>

          {managedPlayers.length > 0 && (
            <section className="space-y-3">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-aa-accent">
                  Coach Managed
                </p>
                <h2 className="font-display text-2xl tracking-[0.05em] text-aa-text">
                  MODIFIED LOAD / REHAB / RTP
                </h2>
                <p className="text-sm text-aa-text-secondary">
                  Standard flags are paused here so intentionally reduced work does not pollute healthy baselines.
                </p>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {managedPlayers.map((player, index) => (
                  <PlayerFlagCard key={player.id} player={player} delay={index} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-aa-border bg-aa-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">{label}</p>
      <p className={`mt-1 font-display text-3xl ${tone}`}>{value}</p>
    </div>
  );
}

function PlayerFlagCard({
  player,
  delay,
}: {
  player: PlayerListItem;
  delay: number;
}): JSX.Element {
  const meta = READINESS_META[player.readiness];
  const isManaged = player.status !== "cleared";
  const profileHref = player.latestSessionDate
    ? `/dashboard/players/${player.id}?date=${player.latestSessionDate}`
    : `/dashboard/players/${player.id}`;
  return (
    <article
      className={`rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:border-aa-border-bright opacity-0 animate-slide-up ${isManaged ? "border-aa-accent/40 bg-aa-accent/10" : meta.card}`}
      style={{ animationDelay: `${Math.min(delay, 16) * 35}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
            <Link
              href={profileHref}
              className="text-sm font-bold text-aa-text hover:text-aa-accent"
            >
              {player.name}
            </Link>
          </div>
          <p className="mt-1 text-xs text-aa-text-secondary">{player.position}</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wider ${meta.badge}`}>
          {isManaged ? statusLabel(player.status) : meta.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-aa-bg/50 border border-aa-border/40 p-2">
          <p className="text-[10px] uppercase tracking-wider text-aa-text-dim">Flags</p>
          <p className="font-display text-2xl text-aa-text">{player.flags.length}</p>
        </div>
        <div className="rounded-lg bg-aa-bg/50 border border-aa-border/40 p-2">
          <p className="text-[10px] uppercase tracking-wider text-aa-text-dim">Latest</p>
          <p className="mt-1 text-[11px] font-mono text-aa-text">
            {player.latestSessionDate ? formatSessionDate(player.latestSessionDate) : "No data"}
          </p>
        </div>
      </div>

      {player.flags.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {player.flags.slice(0, 3).map((flag) => (
            <li key={flag} className="line-clamp-2 text-xs text-aa-text-secondary">
              {flag}
            </li>
          ))}
          {player.flags.length > 3 && (
            <li className="text-[11px] font-mono text-aa-text-dim">+{player.flags.length - 3} more</li>
          )}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-aa-text-secondary">
          {isManaged ? "Normal flags paused until coach marks healthy." : "No active flags in this season."}
        </p>
      )}

      <CoachStatusActions player={player} />
    </article>
  );
}

function statusLabel(status: PlayerStatus): string {
  if (status === "modified_load") return "Modified";
  if (status === "return_to_play") return "RTP";
  if (status === "injured") return "Injured";
  if (status === "rehab") return "Rehab";
  return "Cleared";
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function CoachStatusActions({ player }: { player: PlayerListItem }): JSX.Element {
  const router = useRouter();
  const [saving, setSaving] = useState<PlayerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasFlags = player.flags.length > 0;
  const isManaged = player.status !== "cleared";
  const reportHref = player.latestSessionDate
    ? `/dashboard/reports?date=${player.latestSessionDate}&player=${player.id}`
    : `/dashboard/players/${player.id}`;

  async function setStatus(status: PlayerStatus, notes: string) {
    setSaving(status);
    setError(null);
    const today = todayIsoDate();

    try {
      const response = await fetch(`/api/players/${player.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          injuryDate: today,
          expectedReturn: status === "modified_load" ? today : undefined,
          notes,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to update player status");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update player status");
    } finally {
      setSaving(null);
    }
  }

  if (!hasFlags && !isManaged) {
    return (
      <Link
        href={reportHref}
        className="mt-4 inline-flex text-[11px] font-semibold text-aa-accent hover:text-aa-accent/80"
      >
        {player.latestSessionDate ? "View Day Report" : "View Profile"}
      </Link>
    );
  }

  return (
    <div className="mt-4 border-t border-aa-border/50 pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-aa-text-dim">
        Coach Action
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link
          href={reportHref}
          className="col-span-2 rounded-lg border border-aa-accent/30 bg-aa-accent/10 px-2 py-1.5 text-center text-[11px] font-semibold text-aa-accent transition-colors hover:bg-aa-accent/15"
        >
          View Day Report
        </Link>
        <ActionButton
          label={isManaged ? "Mark Healthy" : "Cleared Check-In"}
          disabled={saving != null}
          onClick={() => setStatus("cleared", isManaged ? "Coach marked player healthy." : "Coach reviewed flags and kept player active.")}
          busy={saving === "cleared"}
        />
        <ActionButton
          label="Modified Today"
          disabled={saving != null}
          onClick={() => setStatus("modified_load", "Coach intentionally reduced load today.")}
          busy={saving === "modified_load"}
        />
        <ActionButton
          label="Rehab"
          disabled={saving != null}
          onClick={() => setStatus("rehab", "Coach moved player to rehab.")}
          busy={saving === "rehab"}
        />
        <ActionButton
          label="RTP"
          disabled={saving != null}
          onClick={() => setStatus("return_to_play", "Coach moved player to return-to-play.")}
          busy={saving === "return_to_play"}
        />
      </div>
      {error && <p className="mt-2 text-[11px] text-aa-danger">{error}</p>}
    </div>
  );
}

function ActionButton({
  label,
  disabled,
  busy,
  onClick,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-aa-border bg-aa-bg/50 px-2 py-1.5 text-[11px] font-semibold text-aa-text-secondary transition-colors hover:border-aa-accent/50 hover:text-aa-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? "Saving..." : label}
    </button>
  );
}
