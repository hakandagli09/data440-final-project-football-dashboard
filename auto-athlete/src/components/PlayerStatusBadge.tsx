import type { PlayerStatus } from "@/lib/player-queries";

const STATUS_STYLES: Record<PlayerStatus, { label: string; className: string }> = {
  cleared: {
    label: "CLEARED",
    className: "bg-aa-success/15 text-aa-success border-aa-success/25",
  },
  injured: {
    label: "INJURED",
    className: "bg-aa-danger/15 text-aa-danger border-aa-danger/25",
  },
  rehab: {
    label: "REHAB",
    className: "bg-aa-warning/15 text-aa-warning border-aa-warning/25",
  },
  return_to_play: {
    label: "RETURN TO PLAY",
    className: "bg-aa-warm/15 text-aa-warm border-aa-warm/25",
  },
};

interface PlayerStatusBadgeProps {
  status: PlayerStatus;
}

export default function PlayerStatusBadge({ status }: PlayerStatusBadgeProps) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase ${style.className}`}
    >
      {style.label}
    </span>
  );
}
