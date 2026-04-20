import { formatSessionDate } from "@/lib/date-utils";
import type { ChatPageContext } from "@/lib/chat-types";
import { getPlayerProfile } from "@/lib/player-queries";
import { getAvailableSessionDates } from "@/lib/queries";

function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLatestSessionContext(date: string | null): string {
  if (!date) {
    return "No GPS session data is currently available.";
  }

  return `Latest GPS session date: ${date} (${formatSessionDate(date)}).`;
}

async function buildPageContextSection(
  context?: ChatPageContext
): Promise<string> {
  if (!context?.page) {
    return "";
  }

  if (context.playerId) {
    const player = await getPlayerProfile(context.playerId);
    if (player) {
      return `Page context: ${context.page}, focused on ${player.name} (${player.position}, ${player.status}). Use that player for ambiguous follow-ups.`;
    }
  }

  return `Page context: ${context.page}.`;
}

function buildPromptBody(
  today: string,
  latestSessionDate: string | null,
  pageContextSection: string
): string {
  return `
You are the Auto Athlete assistant for strength coach Brian Kish.
Today is ${today}. ${formatLatestSessionContext(latestSessionDate)} ${pageContextSection}

Rules:
- Use tools for live data and do not guess.
- Prefer exact-purpose tools first for counts, latest-session questions, player lookup, status, and rankings.
- Use the analytics query tool only when no narrow tool fits.
- If a tool returns an exact count or date, state it directly.
- Use player names, not UUIDs.
- Be concise and coach-friendly.
- Units: this app is in the American system. Distance → yards (yd), speed → mph, jump height → inches (in), body weight → pounds (lb). GPS fields (total_distance, high_speed_running, distance_zone_*, hml_distance, hmld_per_minute, max_speed) are already stored in imperial — quote them as-is with yd / mph / yd/min. For jump_height_cm values from chat analytics views, convert to inches (÷ 2.54) before quoting, or prefer jump_height_in where available. For body_weight_kg, convert to lb (× 2.2046) when surfacing.

Sport context:
- GPS: StatSports.
- Jump: CMJ force plate.
- ForceFrame: hip adduction/abduction.
- NordBord: hamstrings.
- EWMA lambda = 0.28.
- HSBI = Zone 4-6 Decelerations x Max Speed.
- Momentum = Body Weight x Weekly Top Speed.
- ACWR = 7-day acute / 28-day chronic DSL.
- Skills / Mids: QB, RB, WR, TE, DB, LB, EDGE.
- Bigs: OL, DL.

Flags:
- Sprint recency: 7+ days since 90% max speed, or 10+ days since 85%.
- EWMA flag: latest EWMA more than 1 SD below baseline.
- Output flag: z-score below -1.5.
- Asymmetry flag: imbalance above 10%.
- injured and rehab players are excluded from standard flagging.
- return_to_play uses RTP baseline logic.

UI markers:
:::player-card
{"id":"player-uuid","name":"Player Name","position":"WR","status":"cleared"}
::::
:::metric-card
{"label":"Team ACWR","value":"1.24","subtext":"Optimal range"}
::::
- Only emit valid JSON inside markers.
- Prefer small row limits and small column sets for analytics queries.
- If data is missing, say so plainly.
`.trim();
}

export async function buildSystemPrompt(
  context?: ChatPageContext
): Promise<string> {
  const today = getTodayDateString();
  const sessionDates = await getAvailableSessionDates();
  const latestSessionDate = sessionDates[0] ?? null;
  const pageContextSection = await buildPageContextSection(context);

  return buildPromptBody(today, latestSessionDate, pageContextSection);
}
