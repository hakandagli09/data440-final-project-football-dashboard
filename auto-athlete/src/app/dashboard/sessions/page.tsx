import { supabaseServer } from "@/lib/supabase-server";

export default async function SessionsPage() {
  const { data } = await supabaseServer
    .from("gps_sessions")
    .select("session_date");

  const sessionCount = data
    ? new Set(data.map((r) => r.session_date)).size
    : 0;

  return (
    <div className="space-y-6">
      <div className="opacity-0 animate-fade-in">
        <h1 className="font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
          SESSIONS
        </h1>
        <p className="mt-1 text-sm text-aa-text-secondary">
          Session-by-session data browser
        </p>
      </div>

      {sessionCount > 0 && (
        <div className="bg-aa-surface border border-aa-border rounded-xl p-4 w-fit opacity-0 animate-slide-up" style={{ animationDelay: "100ms" }}>
          <span className="text-[10px] font-semibold tracking-wider uppercase text-aa-text-dim">
            Sessions Recorded
          </span>
          <p className="font-display text-2xl text-aa-accent mt-1">{sessionCount}</p>
        </div>
      )}

      <div className="flex flex-col items-center justify-center py-24 opacity-0 animate-slide-up" style={{ animationDelay: "200ms" }}>
        <div className="w-20 h-20 rounded-2xl bg-aa-elevated border border-aa-border flex items-center justify-center mb-6">
          <svg className="w-9 h-9 text-aa-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
        </div>
        <h2 className="font-display text-2xl tracking-[0.06em] text-aa-text mb-2">COMING SOON</h2>
        <p className="text-sm text-aa-text-secondary text-center max-w-md">
          Browse all sessions, drill breakdowns, and session-to-session comparisons with position group filtering.
        </p>
      </div>
    </div>
  );
}
