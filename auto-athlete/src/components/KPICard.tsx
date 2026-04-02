"use client";

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

export default function KPICard({
  title,
  value,
  unit,
  change,
  changeType = "neutral",
  icon,
  accentColor = "aa-accent",
  delay = 0,
}: KPICardProps) {
  const changeColors = {
    positive: "text-aa-success",
    negative: "text-aa-danger",
    neutral: "text-aa-text-dim",
  };

  const changeIcons = {
    positive: "↑",
    negative: "↓",
    neutral: "→",
  };

  return (
    <div
      className="card-glow group relative bg-aa-surface border border-aa-border rounded-xl p-5 hover:border-aa-border-bright transition-all duration-300 opacity-0 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top accent line */}
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
        <span className="font-display text-[40px] leading-none tracking-tight text-aa-text tabular-nums opacity-0 animate-count-up"
          style={{ animationDelay: `${delay + 200}ms` }}
        >
          {value}
        </span>
        <span className="text-sm font-medium text-aa-text-dim">{unit}</span>
      </div>

      {/* Subtle sparkline placeholder */}
      <div className="mt-4 h-8 flex items-end gap-[2px]">
        {Array.from({ length: 24 }, (_, i) => {
          const h = 15 + Math.sin(i * 0.7 + delay) * 12 + Math.random() * 8;
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm bg-${accentColor} opacity-10 group-hover:opacity-25 transition-opacity duration-500`}
              style={{ height: `${h}%`, transitionDelay: `${i * 20}ms` }}
            />
          );
        })}
      </div>
    </div>
  );
}
