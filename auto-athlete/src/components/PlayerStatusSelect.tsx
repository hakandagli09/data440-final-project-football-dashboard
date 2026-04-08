"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PlayerStatus } from "@/lib/player-queries";

interface PlayerStatusSelectProps {
  playerId: string;
  currentStatus: PlayerStatus;
  onStatusSaved?: (status: PlayerStatus) => void;
}

const OPTIONS: Array<{ value: PlayerStatus; label: string }> = [
  { value: "cleared", label: "Cleared" },
  { value: "injured", label: "Injured" },
  { value: "rehab", label: "Rehab" },
  { value: "return_to_play", label: "Return To Play" },
];

export default function PlayerStatusSelect({
  playerId,
  currentStatus,
  onStatusSaved,
}: PlayerStatusSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState<PlayerStatus>(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(currentStatus);
  }, [currentStatus]);

  async function onChange(nextValue: PlayerStatus) {
    setValue(nextValue);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/players/${playerId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextValue }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to update status");
      }
      onStatusSaved?.(nextValue);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
      setValue(currentStatus);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as PlayerStatus)}
        disabled={saving}
        className="w-full rounded-lg border border-aa-border bg-aa-elevated px-3 py-2 text-xs text-aa-text focus:border-aa-accent focus:outline-none disabled:opacity-70"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-[11px] text-aa-danger">{error}</p>}
    </div>
  );
}
