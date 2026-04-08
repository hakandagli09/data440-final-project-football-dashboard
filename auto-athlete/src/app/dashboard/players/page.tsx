import { supabaseServer } from "@/lib/supabase-server";

export default async function PlayersPage() {
  const { count } = await supabaseServer
    .from("players")
    .select("id", { count: "exact", head: true });

  return (
    <div className="space-y-6">
      <div className="opacity-0 animate-fade-in">
        <h1 className="font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
          PLAYERS
        </h1>
        <p className="mt-1 text-sm text-aa-text-secondary">
          Player roster, profiles, and position groups
        </p>
      </div>

      {count != null && count > 0 && (
        <div className="bg-aa-surface border border-aa-border rounded-xl p-4 w-fit opacity-0 animate-slide-up" style={{ animationDelay: "100ms" }}>
          <span className="text-[10px] font-semibold tracking-wider uppercase text-aa-text-dim">
            Players in Database
          </span>
          <p className="font-display text-2xl text-aa-accent mt-1">{count}</p>
        </div>
      )}

      <div className="flex flex-col items-center justify-center py-24 opacity-0 animate-slide-up" style={{ animationDelay: "200ms" }}>
        <div className="w-20 h-20 rounded-2xl bg-aa-elevated border border-aa-border flex items-center justify-center mb-6">
          <svg className="w-9 h-9 text-aa-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
        </div>
        <h2 className="font-display text-2xl tracking-[0.06em] text-aa-text mb-2">COMING SOON</h2>
        <p className="text-sm text-aa-text-secondary text-center max-w-md">
          Individual player profiles with 7-day rolling averages, fatigue module, asymmetry tracking, and position group breakdowns.
        </p>
      </div>
    </div>
  );
}
