export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="opacity-0 animate-fade-in">
        <h1 className="font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
          REPORTS
        </h1>
        <p className="mt-1 text-sm text-aa-text-secondary">
          Comparison views and exportable reports
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-24 opacity-0 animate-slide-up" style={{ animationDelay: "200ms" }}>
        <div className="w-20 h-20 rounded-2xl bg-aa-elevated border border-aa-border flex items-center justify-center mb-6">
          <svg className="w-9 h-9 text-aa-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        </div>
        <h2 className="font-display text-2xl tracking-[0.06em] text-aa-text mb-2">COMING SOON</h2>
        <p className="text-sm text-aa-text-secondary text-center max-w-md">
          Day-to-day, week-to-week, custom range, and full season comparisons with radar charts, z-score overlays, and PDF export for staff.
        </p>
      </div>
    </div>
  );
}
