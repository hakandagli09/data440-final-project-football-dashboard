"use client";

export default function TopBar() {
  return (
    <header className="h-16 border-b border-aa-border bg-aa-surface/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-30">
      {/* ── Left: Page context ───────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-aa-accent animate-pulse-glow" />
          <span className="text-xs font-mono text-aa-text-dim uppercase tracking-wider">
            System Online
          </span>
        </div>
        <div className="w-px h-5 bg-aa-border" />
        <span className="text-xs font-mono text-aa-text-dim">
          StatSports GPS · 18 Hz
        </span>
      </div>

      {/* ── Right: Quick actions ──────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-aa-border bg-aa-bg/50 text-aa-text-dim hover:text-aa-text hover:border-aa-border-bright transition-all text-xs font-mono">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          Search players...
          <kbd className="ml-2 px-1.5 py-0.5 rounded bg-aa-elevated border border-aa-border text-[10px]">⌘K</kbd>
        </button>

        {/* Notification bell */}
        <button className="relative p-2 rounded-lg border border-aa-border bg-aa-bg/50 text-aa-text-dim hover:text-aa-text hover:border-aa-border-bright transition-all">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-aa-warm" />
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2 pl-3 ml-1 border-l border-aa-border">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aa-elevated to-aa-border flex items-center justify-center">
            <span className="text-xs font-bold text-aa-text">SC</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-aa-text leading-tight">S&C Coach</span>
            <span className="text-[10px] text-aa-text-dim leading-tight">Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}
