/**
 * TopBar — sticky header bar that sits above the main content area.
 *
 * Provides at-a-glance system status, a search trigger, notification bell,
 * and user identity. Split into two halves:
 * - Left: system connectivity status (GPS online indicator, sampling rate)
 * - Right: search button, notification bell, and user avatar
 *
 * Marked as a client component ("use client") for future interactivity
 * (search handler, notification dropdown). Currently purely presentational.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface PlayerSearchItem {
  id: string;
  name: string;
  position: string | null;
}

export default function TopBar(): JSX.Element {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Keyboard shortcut parity with command palette UX.
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPlayers([]);
      return;
    }

    // Small debounce keeps query responsive and reduces Supabase calls.
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("players")
        .select("id, name, position")
        .ilike("name", `%${q}%`)
        .order("name", { ascending: true })
        .limit(8);
      setPlayers((data ?? []) as PlayerSearchItem[]);
      setLoading(false);
      setIsOpen(true);
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  const topMatch = useMemo(() => players[0] ?? null, [players]);

  function goToPlayer(playerId: string): void {
    setQuery("");
    setPlayers([]);
    setIsOpen(false);
    router.push(`/dashboard/players/${playerId}`);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (topMatch) {
      goToPlayer(topMatch.id);
    }
  }

  return (
    /**
     * `sticky top-0` pins the header while main content scrolls beneath it.
     * `z-30` keeps it below the sidebar's `z-40` so the sidebar overlaps the
     * header at the left edge, avoiding z-fighting.
     * `backdrop-blur-md` applies a frosted-glass blur to content scrolling
     * underneath — a common modern UI pattern that maintains spatial context
     * while clearly separating the toolbar from page content.
     */
    <header className="h-16 border-b border-aa-border bg-aa-surface/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-30">
      {/* ── Left: System status ──────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {/* Pulsing dot = system is connected and receiving GPS data */}
          <div className="w-2 h-2 rounded-full bg-aa-accent animate-pulse-glow" />
          <span className="text-xs font-mono text-aa-text-dim uppercase tracking-wider">
            System Online
          </span>
        </div>
        {/* Vertical divider between status and GPS info */}
        <div className="w-px h-5 bg-aa-border" />
        {/* StatSports Apex GPS units sample at 18 Hz (18 position readings/sec),
            which is the industry standard for professional athlete tracking. */}
        <span className="text-xs font-mono text-aa-text-dim">
          StatSports GPS · 18 Hz
        </span>
      </div>

      {/* ── Right: Quick actions ──────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <form
            onSubmit={onSubmit}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-aa-border bg-aa-bg/50 text-aa-text-dim hover:border-aa-border-bright transition-all text-xs font-mono w-[250px]"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onFocus={() => setIsOpen(true)}
              onBlur={() => setTimeout(() => setIsOpen(false), 120)}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search player..."
              className="w-full bg-transparent text-aa-text placeholder:text-aa-text-dim focus:outline-none"
            />
            <kbd className="ml-1 px-1.5 py-0.5 rounded bg-aa-elevated border border-aa-border text-[10px]">⌘K</kbd>
          </form>

          {isOpen && (query.trim().length >= 2 || players.length > 0) && (
            <div className="absolute right-0 mt-2 w-[340px] rounded-lg border border-aa-border bg-aa-surface shadow-xl overflow-hidden z-50">
              {loading && (
                <p className="px-3 py-2 text-xs text-aa-text-secondary">Searching...</p>
              )}
              {!loading && players.length === 0 && (
                <p className="px-3 py-2 text-xs text-aa-text-secondary">No players found.</p>
              )}
              {!loading &&
                players.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onMouseDown={() => goToPlayer(player.id)}
                    className="w-full px-3 py-2 text-left hover:bg-aa-elevated/70 transition-colors border-b border-aa-border/30 last:border-b-0"
                  >
                    <p className="text-xs font-semibold text-aa-text">{player.name}</p>
                    <p className="text-[11px] text-aa-text-dim">{player.position ?? "—"}</p>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Notification bell with unread indicator */}
        <button className="relative p-2 rounded-lg border border-aa-border bg-aa-bg/50 text-aa-text-dim hover:text-aa-text hover:border-aa-border-bright transition-all">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          {/* 6px orange dot indicating unread notifications.
              Hardcoded as visible; in production this would be conditionally
              rendered based on notification state from the backend. */}
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-aa-warm" />
        </button>

        {/* User avatar — "SC" stands for "S&C Coach" (Strength & Conditioning Coach),
            the primary persona / end-user for this dashboard. */}
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
