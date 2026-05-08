"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PlayerSessionCard from "@/components/PlayerSessionCard";
import DualMonthDatePicker from "@/components/DualMonthDatePicker";
import type { SessionReportData } from "@/lib/session-report-queries";
import { formatSessionDate, formatSessionDateUpper } from "@/lib/date-utils";

type SideTab = "offense" | "defense" | "both";

/** Small pill toggle used for Offense/Defense/Both. */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 rounded-md text-xs font-display tracking-[0.08em] uppercase transition-colors ${
        active
          ? "bg-aa-accent text-aa-bg"
          : "bg-aa-elevated text-aa-text-secondary hover:text-aa-text hover:bg-aa-surface border border-aa-border"
      }`}
    >
      {children}
    </button>
  );
}

interface SessionReportClientProps {
  data: SessionReportData;
  focusedPlayerId?: string | null;
}

/**
 * Client wrapper for the Session Report page. Handles date selection,
 * Offense/Defense toggling, practice-day override, and print/export UI.
 */
export default function SessionReportClient({ data, focusedPlayerId = null }: SessionReportClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<SideTab>("both");
  // Practice-day override — defaults to the inferred session title so
  // Brian doesn't have to type anything in the common case.
  const [practiceDay, setPracticeDay] = useState<string>(
    data.practiceDayLabels[0] ?? ""
  );
  // Opponent / week label (free-form). Pre-fill with "Week of …" so the
  // report always has meaningful context even when no opponent is set.
  const [opponent, setOpponent] = useState<string>("");

  const totalsLabel = useMemo(() => {
    const off = data.offense.length;
    const def = data.defense.length;
    const rehab = data.injuredRehab.length;
    return `${off} offense · ${def} defense · ${rehab} in rehab`;
  }, [data.offense.length, data.defense.length, data.injuredRehab.length]);

  if (!data.currentDate) {
    return (
      <div className="py-24 text-center text-aa-text-secondary">
        No GPS sessions uploaded yet. Upload a CSV from the Upload page to generate a report.
      </div>
    );
  }

  const showOffense = tab === "both" || tab === "offense";
  const showDefense = tab === "both" || tab === "defense";
  const focusedPlayerName = [
    ...data.offense,
    ...data.defense,
    ...data.injuredRehab,
  ].find((card) => card.playerId === focusedPlayerId)?.playerName;

  return (
    <div className="space-y-6">
      <div className="opacity-0 animate-fade-in print:hidden">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-[42px] leading-none tracking-[0.04em] text-aa-text">
              SESSION REPORT
            </h1>
            <p className="mt-1 text-sm text-aa-text-secondary">
              Coach-facing summary for{" "}
              {data.mode === "range"
                ? `${formatSessionDate(data.startDate)} → ${formatSessionDate(data.endDate)}`
                : formatSessionDate(data.currentDate)}
              {data.currentSessionTitle && (
                <>
                  {" · "}
                  <span className="text-aa-accent">{data.currentSessionTitle}</span>
                </>
              )}
              {" · "}
              {totalsLabel}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-md border border-aa-border bg-aa-surface text-xs font-mono text-aa-text-secondary hover:border-aa-accent hover:text-aa-accent transition-colors"
            >
              Print / PDF
            </button>
            <DualMonthDatePicker
              startDate={data.startDate}
              endDate={data.endDate}
              availableDates={data.availableDates}
              allowRange
              showQuickSelects
              onSelectSingle={(d) => {
                // Preserve the active session-title filter on every
                // date change so the user doesn't have to re-pick the
                // practice type after every navigation.
                const params = new URLSearchParams();
                params.set("date", d);
                if (focusedPlayerId) {
                  params.set("player", focusedPlayerId);
                }
                if (data.currentSessionTitle) {
                  params.set("session_title", data.currentSessionTitle);
                }
                router.replace(`/dashboard/reports?${params.toString()}`);
              }}
              onSelectRange={(start, end) => {
                const params = new URLSearchParams();
                params.set("start", start);
                params.set("end", end);
                if (focusedPlayerId) {
                  params.set("player", focusedPlayerId);
                }
                if (data.currentSessionTitle) {
                  params.set("session_title", data.currentSessionTitle);
                }
                router.replace(`/dashboard/reports?${params.toString()}`);
              }}
            />
          </div>
        </div>

        {/* Session-type filter chips. Drives the `?session_title=` URL
            param, which scopes every downstream aggregation: dates
            list, daily/running totals, and the 4-week baseline. The
            active chip's title becomes the *only* row type considered
            for the % column — i.e. "Game" gives a Games-only baseline,
            "Helmets" gives a Helmets-only baseline, etc. The "All"
            chip clears the filter, which falls back to the per-player
            auto-stratification on each row's same-day session_title. */}
        <div className="mt-5 flex items-center flex-wrap gap-2">
          {(() => {
            // Canonical practice types come first, in coach-priority
            // order; any extras present in the visible window (e.g.
            // Linear Tempo, Max V, Accel) trail alphabetically so the
            // chip row stays scannable.
            const presets: readonly string[] = [
              "Game",
              "Practice",
              "Full Pads",
              "Shells",
              "Helmets",
            ];
            const present: ReadonlySet<string> = new Set(data.availableSessionTitles);
            const orderedTitles: string[] = [
              ...presets.filter((t) => present.has(t)),
              ...data.availableSessionTitles.filter((t) => !presets.includes(t)),
            ];
            /** Build the URL for a chip click while preserving the
             *  active date window. Pass `null` for the "All" chip. */
            const buildHref = (title: string | null): string => {
              const params = new URLSearchParams();
              if (data.mode === "range") {
                params.set("start", data.startDate);
                params.set("end", data.endDate);
              } else if (data.currentDate) {
                params.set("date", data.currentDate);
              }
              if (focusedPlayerId) params.set("player", focusedPlayerId);
              if (title) params.set("session_title", title);
              const qs = params.toString();
              return qs ? `/dashboard/reports?${qs}` : `/dashboard/reports`;
            };
            const isActive = (title: string | null): boolean =>
              (data.currentSessionTitle ?? null) === title;

            const chipBase =
              "px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded border transition-colors";
            const chipActive =
              "bg-aa-accent text-aa-bg border-aa-accent";
            const chipInactive =
              "text-aa-text-secondary border-aa-border hover:border-aa-accent hover:text-aa-accent";

            return (
              <>
                <button
                  key="__all"
                  type="button"
                  onClick={() => router.replace(buildHref(null))}
                  className={`${chipBase} ${isActive(null) ? chipActive : chipInactive}`}
                >
                  All
                </button>
                {orderedTitles.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => router.replace(buildHref(title))}
                    className={`${chipBase} ${
                      isActive(title) ? chipActive : chipInactive
                    }`}
                  >
                    {title}
                  </button>
                ))}
              </>
            );
          })()}
        </div>

        <div className="mt-3 flex items-center flex-wrap gap-3">
          <TabButton active={tab === "both"} onClick={() => setTab("both")}>Both</TabButton>
          <TabButton active={tab === "offense"} onClick={() => setTab("offense")}>Offense</TabButton>
          <TabButton active={tab === "defense"} onClick={() => setTab("defense")}>Defense</TabButton>

          <div className="h-6 w-px bg-aa-border mx-1" />

          <div className="flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-aa-text-dim">Practice Day</label>
            <input
              type="text"
              value={practiceDay}
              onChange={(e) => setPracticeDay(e.target.value)}
              placeholder="Helmets"
              className="px-2.5 py-1.5 rounded-md border border-aa-border bg-aa-surface text-xs font-mono text-aa-text w-32 focus:border-aa-accent outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-aa-text-dim">Opponent</label>
            <input
              type="text"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Richmond"
              className="px-2.5 py-1.5 rounded-md border border-aa-border bg-aa-surface text-xs font-mono text-aa-text w-32 focus:border-aa-accent outline-none"
            />
          </div>
        </div>

        {focusedPlayerName && (
          <div className="mt-4 rounded-lg border border-aa-accent/30 bg-aa-accent/10 px-4 py-3 text-sm text-aa-text-secondary">
            Focused on <span className="font-semibold text-aa-text">{focusedPlayerName}</span> for{" "}
            {data.mode === "range"
              ? `${formatSessionDate(data.startDate)} → ${formatSessionDate(data.endDate)}`
              : formatSessionDate(data.currentDate)}
            . Their card is highlighted below.
          </div>
        )}
      </div>

      <ReportHeaderBanner
        dateLabel={
          data.mode === "range"
            ? `${formatSessionDateUpper(data.startDate)} → ${formatSessionDateUpper(data.endDate)}`
            : formatSessionDateUpper(data.currentDate)
        }
        practiceDay={practiceDay}
        opponent={opponent}
        sides={tab}
      />

      {showOffense && (
        <ReportSection
          title="Offense"
          cards={data.offense}
          mode={data.mode}
          reportDate={data.currentDate}
          focusedPlayerId={focusedPlayerId}
          emptyMessage={
            data.mode === "range"
              ? "No offensive players with data in this range."
              : "No offensive players with data on this date."
          }
        />
      )}

      {showDefense && (
        <ReportSection
          title="Defense"
          cards={data.defense}
          mode={data.mode}
          reportDate={data.currentDate}
          focusedPlayerId={focusedPlayerId}
          emptyMessage={
            data.mode === "range"
              ? "No defensive players with data in this range."
              : "No defensive players with data on this date."
          }
        />
      )}

      {data.injuredRehab.length > 0 && (
        <ReportSection
          title="Injured / Rehab"
          subtitle="Excluded from position averages"
          cards={data.injuredRehab}
          mode={data.mode}
          reportDate={data.currentDate}
          focusedPlayerId={focusedPlayerId}
          emptyMessage=""
          tone="warn"
        />
      )}
    </div>
  );
}

/**
 * Top banner that echoes Brian's Excel header ribbon — date, practice
 * day, opponent. Always visible (both on-screen and when printing) so
 * the PDF output has context when it's handed to the head coach.
 */
function ReportHeaderBanner({
  dateLabel,
  practiceDay,
  opponent,
  sides,
}: {
  dateLabel: string;
  practiceDay: string;
  opponent: string;
  sides: SideTab;
}) {
  const titlePrefix =
    sides === "offense" ? "OFFENSE" : sides === "defense" ? "DEFENSE" : "TEAM";
  return (
    <div className="rounded-lg border-2 border-aa-accent/30 bg-gradient-to-br from-aa-accent/10 to-aa-surface px-5 py-4 print:border-gray-400 print:bg-white print:text-black">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-2xl md:text-3xl tracking-[0.08em] text-aa-text print:text-black">
          W&amp;M FOOTBALL {titlePrefix} SESSION REPORT
        </h2>
        <div className="flex items-center gap-4 text-xs font-mono">
          <HeaderTag label="DATE" value={dateLabel} />
          <HeaderTag label="OPPONENT" value={opponent || "—"} />
          <HeaderTag label="PRACTICE" value={practiceDay || "—"} />
        </div>
      </div>
    </div>
  );
}

function HeaderTag({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wider text-aa-text-dim print:text-gray-600">
        {label}
      </span>
      <span className="text-aa-text print:text-black">{value}</span>
    </div>
  );
}

/** Renders a named grid section (Offense / Defense / Injury) of cards. */
function ReportSection({
  title,
  subtitle,
  cards,
  mode,
  reportDate,
  focusedPlayerId,
  emptyMessage,
  tone,
}: {
  title: string;
  subtitle?: string;
  cards: SessionReportData["offense"];
  /** Current report mode — controls whether cards show the Daily column. */
  mode: SessionReportData["mode"];
  reportDate: string;
  focusedPlayerId?: string | null;
  emptyMessage: string;
  tone?: "warn";
}) {
  const sortedCards = focusedPlayerId
    ? [...cards].sort((a, b) => {
        if (a.playerId === focusedPlayerId) return -1;
        if (b.playerId === focusedPlayerId) return 1;
        return a.playerName.localeCompare(b.playerName);
      })
    : cards;

  return (
    <section className="print:break-before-auto">
      <div className="flex items-baseline gap-3 mb-3">
        <h3
          className={`font-display text-xl tracking-[0.08em] ${
            tone === "warn" ? "text-aa-warning" : "text-aa-text"
          } print:text-black`}
        >
          {title.toUpperCase()}
        </h3>
        {subtitle && (
          <span className="text-[11px] font-mono uppercase tracking-wider text-aa-text-dim">
            {subtitle}
          </span>
        )}
        <span className="text-[11px] font-mono text-aa-text-dim ml-auto">
          {cards.length} {cards.length === 1 ? "player" : "players"}
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-aa-text-dim italic">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 print:grid-cols-2">
          {sortedCards.map((card) => (
            <PlayerSessionCard
              key={card.playerId}
              card={card}
              mode={mode}
              reportDate={reportDate}
              isFocused={card.playerId === focusedPlayerId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
