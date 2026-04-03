/**
 * KPICard — a single Key Performance Indicator card for the dashboard.
 *
 * Used in the dashboard's top row to display one performance metric.
 * Each card is self-contained with a numeric value, unit label, trend
 * indicator (up/down/neutral), icon, and a mini sparkline visualization.
 *
 * Animation: two-stage entrance on mount —
 * 1. The entire card slides up (via `animate-slide-up` with configurable delay)
 * 2. The numeric value has a separate delayed animation (`animate-count-up`)
 *    that starts 200ms after the card appears, creating a stagger effect.
 */
"use client";

/**
 * Props for the KPICard component.
 *
 * @property title       — Short metric label (e.g. "Total Distance", "Top Speed")
 * @property value       — The formatted numeric string to display (e.g. "5,847")
 * @property unit        — Unit abbreviation (e.g. "m", "m/s", "bpm", "AU")
 * @property change      — Session-over-session delta as a string (e.g. "12%", "2")
 * @property changeType  — Direction of the change: "positive" (green ↑),
 *                          "negative" (red ↓), or "neutral" (gray →)
 * @property icon        — JSX SVG element rendered next to the title
 * @property accentColor — Tailwind color token name (e.g. "aa-accent", "aa-warm"),
 *                          used in template literals like `bg-${accentColor}`.
 *                          Works because the possible values also appear as static
 *                          classes elsewhere, so Tailwind includes them in the bundle.
 * @property delay       — Animation stagger in ms. Controls when the card enters
 *                          relative to its siblings (e.g. 0, 80, 160, ...).
 */
interface KPICardProps {
  title: string;
  value: string;
  unit: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: React.ReactNode;
  accentColor?: string;
  delay?: number;
}

/** Maps changeType to the corresponding Tailwind text color class. */
const changeColors: Record<NonNullable<KPICardProps["changeType"]>, string> = {
  positive: "text-aa-success",
  negative: "text-aa-danger",
  neutral: "text-aa-text-dim",
};

/** Maps changeType to the corresponding arrow character. */
const changeIcons: Record<NonNullable<KPICardProps["changeType"]>, string> = {
  positive: "↑",
  negative: "↓",
  neutral: "→",
};

/**
 * KPICard — renders an animated metric card with trend indicator and sparkline.
 *
 * The card slides up on mount, then the numeric value fades in 200ms later.
 * On hover, the top accent line brightens and the sparkline bars reveal
 * with a left-to-right cascade (each bar 20ms after the previous).
 */
export default function KPICard({
  title,
  value,
  unit,
  change,
  changeType = "neutral",
  icon,
  accentColor = "aa-accent",
  delay = 0,
}: KPICardProps): JSX.Element {
  return (
    <div
      className="card-glow group relative bg-aa-surface border border-aa-border rounded-xl p-5 hover:border-aa-border-bright transition-all duration-300 opacity-0 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top accent line — uses `card-glow` class from globals.css which adds
          a horizontal gradient line across the top of the card on hover
          via a ::after pseudo-element. The dynamic `bg-${accentColor}` class
          is safe because all possible values (aa-accent, aa-warm, aa-danger)
          appear as static classes elsewhere in the project, ensuring Tailwind
          includes them in the compiled CSS bundle. */}
      <div
        className={`absolute top-0 left-4 right-4 h-[2px] rounded-b-full bg-${accentColor} opacity-20 group-hover:opacity-60 transition-opacity`}
      />

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`text-${accentColor} opacity-60`}>{icon}</span>
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-aa-text-dim">
            {title}
          </span>
        </div>
        {change && (
          <span
            className={`text-[11px] font-mono font-medium ${changeColors[changeType]} flex items-center gap-0.5`}
          >
            {changeIcons[changeType]} {change}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        {/* The value animates in 200ms after the card itself, creating a
            two-stage entrance: card appears first, then the number "counts up". */}
        <span className="font-display text-[40px] leading-none tracking-tight text-aa-text tabular-nums opacity-0 animate-count-up"
          style={{ animationDelay: `${delay + 200}ms` }}
        >
          {value}
        </span>
        <span className="text-sm font-medium text-aa-text-dim">{unit}</span>
      </div>

      {/* Sparkline placeholder — 24 bars representing notional hourly data.
          Height formula: `15 + Math.sin(i * 0.7 + delay) * 12 + Math.random() * 8`
          - sin() provides a smooth wave pattern
          - `+ delay` seeds each card differently so sparklines look unique
          - Math.random() adds jitter for realism
          Note: Math.random() is called during render, so the sparkline changes
          on re-render. Acceptable for a placeholder; real data would replace this. */}
      <div className="mt-4 h-8 flex items-end gap-[2px]">
        {Array.from({ length: 24 }, (_, i) => {
          const h = 15 + Math.sin(i * 0.7 + delay) * 12 + Math.random() * 8;
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm bg-${accentColor} opacity-10 group-hover:opacity-25 transition-opacity duration-500`}
              // On hover, bars transition opacity with a left-to-right cascade —
              // each bar 20ms after the previous — creating a "wave" reveal.
              style={{ height: `${h}%`, transitionDelay: `${i * 20}ms` }}
            />
          );
        })}
      </div>
    </div>
  );
}
