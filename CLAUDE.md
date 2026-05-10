# Auto Athlete — W&M Football Performance Dashboard

## Project Overview

Auto Athlete is a football-only performance dashboard for Brian Sutton, the William & Mary Football strength and conditioning coach. The MVP replaces a manual Excel workflow with a web app that ingests GPS and athlete testing CSVs, separates data by training season, surfaces readiness flags, and gives Coach Brian a fast daily workflow:

1. **Flagging** — who needs attention?
2. **Overview** — how did the team practice today?
3. **Reports** — what did each player do on that specific day?
4. **Players** — what is this player's status, trend, and profile?
5. **Data Management** — what files/data are currently in the system?

**Course:** DATA 440 Final Project

## Tech Stack

- **Framework:** Next.js 14 App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS + custom `aa-*` theme tokens
- **Database:** Supabase Postgres, RLS, file provenance tables
- **Charts/UI:** Custom Tailwind components plus Tremor where still useful
- **Fonts:** Bebas Neue display, Barlow body, JetBrains Mono data
- **AI Assistant:** Gemini via Google AI Studio, streamed through `/api/chat`

## Development

```bash
cd auto-athlete
npm run dev
npm run build
npm run lint
```

Use `npm run build` as the main verification command. It compiles Next.js, runs linting, and checks TypeScript.

## Design System

- Use Tailwind classes backed by `aa-*` CSS variables from `auto-athlete/src/app/globals.css`.
- Do not hardcode hex colors in components.
- Default theme is dark; light theme is toggled by `ThemeProvider` in `auto-athlete/src/lib/theme-context.tsx`.
- Print views force light styling.
- Visual direction: dense, coach-facing, Bloomberg Terminal meets ESPN.
- Status colors carry meaning:
  - `aa-success`: healthy/cleared/green
  - `aa-warning`: caution/yellow/rehab
  - `aa-danger`: red/high concern
  - `aa-warm`: return-to-play or warm warning
  - `aa-accent`: selected/focused/modified load

## Database Schema

Schema lives in `supabase/schema.sql`.

Core tables:

| Table | Purpose |
| --- | --- |
| `players` | Player registry created from uploaded data. Players with no data anywhere are cleaned up. |
| `uploads` | File provenance, CSV type, upload status, row count, parse errors, and selected season. |
| `gps_sessions` | StatSports GPS rows, one row per player/drill/session. |
| `jump_tests` | Force plate / CMJ rows. |
| `force_frame_tests` | ForceFrame hip AD/AB rows. |
| `nordbord_tests` | NordBord hamstring rows. |
| `injuries` | Coach-managed player status history. |

All athlete data tables reference `players(id)` with `ON DELETE CASCADE`. Upload deletion cascades through `upload_id`; after deleting an upload, orphaned players are removed so test resets leave no stale roster.

### Current Required Supabase Patch

The MVP uses `modified_load` as a player status. If the deployed Supabase project was created before this status existed, run:

```sql
ALTER TABLE injuries DROP CONSTRAINT injuries_status_check;

ALTER TABLE injuries
ADD CONSTRAINT injuries_status_check
CHECK (status IN ('modified_load', 'injured', 'rehab', 'return_to_play', 'cleared'));
```

## CSV Ingestion

Upload flow lives at `/upload`.

- Drag-and-drop uploads are the preferred path.
- CSV type is detected by sniffing headers in `auto-athlete/src/lib/csv-parser.ts`; do not rely on filename.
- Supported CSV families:
  - GPS / StatSports
  - Force plate / CMJ
  - ForceFrame
  - NordBord
- Upload requires a season selection:
  - `spring`
  - `summer`
  - `fall`
- Upload queue is filtered by selected season so Spring and Summer work do not visually mix.
- `uploads.season` drives the active flagging season.
- Duplicate upload checks include season.
- Data Management displays season per upload.

## Units

The current W&M StatSports export stores GPS values in the American system:

- Distance: yards
- Speed: mph
- HMLD/min: yd/min
- Jump height: inches where available
- Body weight: kg in source data, converted to lb only for display

Do not convert GPS database values again. Use helpers in `auto-athlete/src/lib/units.ts`.

MVP metric naming:

- HSR = `Distance Zone 4 - Zone 6 (Relative)` for 2026+ rows, with legacy `high_speed_running` fallback for pre-2026 data.
- Sprint Distance = `Distance Zone 6 (Relative)`.
- `HML Efforts` should be displayed as **Explosive Efforts**.
- Default views should avoid `Fatigue Index` and `Speed Intensity`.

## Navigation Model

### `/dashboard` — Flagging

This is the landing page. It is the first thing Coach Brian checks.

Purpose: **Who needs attention?**

Behavior:

- Uses the active season from the latest season-tagged GPS upload.
- Shows player cards sorted by severity.
- Readiness colors:
  - Green: 0 flags
  - Yellow: 1-2 flags
  - Red: 3+ flags
  - Neutral: no usable data
- Managed players are separated into a **Modified Load / Rehab / RTP** section.
- Coach action buttons on cards:
  - `Cleared Check-In`
  - `Modified Today`
  - `Rehab`
  - `RTP`
  - `Mark Healthy`
- `View Day Report` routes to `/dashboard/reports?date=<latestSessionDate>&player=<playerId>`.

### `/dashboard/overview` — Team Daily Report

Purpose: **How did the team practice today?**

This page is date-driven and should summarize the whole team for the selected day.

Current MVP sections:

- KPI row:
  - Total Distance
  - HSR
  - Sprint Distance
  - Max Velocity
  - Accel / Decel
  - Explosive Efforts
- Position Group Breakdown:
  - Skills / Mids
  - Bigs
  - Other
  - Distance, HSR, Sprint, Accel/Decel, DSL
- Sprint Exposure:
  - number and percent of players reaching 85%+
  - number and percent reaching 90%+
  - players furthest from 90%
- Speed Zones
- Top Workload
- Low Output Watch
- ACWR
- Session Info
- Alert count from the flagging system

Date picker must stay on `/dashboard/overview?date=...`.

### `/dashboard/reports` — Session Report

Purpose: **What did each player do on that specific day?**

Reports are the main single-day investigation page.

Behavior:

- Supports `date`, `start`, `end`, `session_title`, and focused `player` query params.
- Date/range picker preserves current `session_title` and focused player.
- Player cards link to `/dashboard/players/:id?date=<reportDate>`.
- If opened with `player=<id>`, that player card is highlighted and moved first within its section.
- Supports Offense, Defense, and Both tabs.
- Managed players are separated so modified/rehab loads do not pollute normal position averages.
- Session-title chips stratify the report by practice type when selected.

### `/dashboard/players`

Purpose: roster browsing, status updates, filters, and position reports.

Behavior:

- Filters by group, data availability, status, readiness, latest session, and flag count.
- Player links preserve the selected report date when available.
- Status can be updated from the table.

### `/dashboard/players/[id]`

Purpose: **What is this player's profile, trend, and status?**

Behavior:

- Accepts optional `?date=YYYY-MM-DD`.
- If date is present, required GPS metrics show that selected day.
- Includes a link back to `/dashboard/reports?date=<date>&player=<id>`.
- Shows status badge and status selector.
- Shows data freshness, 14-day trend bars through selected date, fatigue snapshot, asymmetry, flags, and required metric set.

## Flagging MVP

Flagging logic lives in `auto-athlete/src/lib/flagging.ts`.

### Active Data Scope

- Flagging is season-aware.
- Active season defaults to the latest season-tagged GPS upload.
- GPS and CMJ rows are filtered to uploads from the active season.
- Players without data in the active season do not appear on the flagging board.
- Players with no records in any data table are deleted/hidden.

### Player Status Suppression

`PlayerStatus` values:

| Status | Meaning | Standard Flagging |
| --- | --- | --- |
| `cleared` | Healthy / normal participation | Active |
| `modified_load` | Coach intentionally reduced load, usually today-only | Suspended |
| `injured` | Out / not training | Suspended |
| `rehab` | Restricted training | Suspended |
| `return_to_play` | RTP progression | Suspended for standard flags |

Status changes are inserted as history rows in `injuries`; do not overwrite the previous row. Historical managed windows are excluded from future healthy baselines so reduced-load days do not drag down normal comparisons.

`modified_load` defaults to today-only by setting `expected_return` to the same date.

### GPS Flags

GPS flags require at least **5 prior healthy GPS days** before firing. With 1-5 healthy days, the system is building baseline. Earliest GPS flagging is day 6.

Current GPS flag rules:

- Sprint recency: no 90% max-speed exposure in 7+ days.
- HSR EWMA ratio above 1.3 compared to prior EWMA baseline.
- Accel/Decel EWMA ratio above 1.3 compared to prior EWMA baseline.
- HSR more than 2 SD above prior calendar-year baseline.
- Accel/Decel more than 2 SD above prior calendar-year baseline.

HSR normalization:

- Pre-2026: use `high_speed_running`.
- 2026+: use `distance_zone_4_6` with legacy fallback.

### CMJ Flags

CMJ flags require at least two tests and compare latest to recent best:

- Jump height down 10%+
- Concentric impulse down 10%+
- Eccentric braking impulse down 10%+
- RSI-modified down 10%+
- Contraction time up 10%+
- Eccentric duration up 10%+

## Reports And Metric Sets

Position grouping comes from `Player Primary Position`.

### Skills / Mids

QB, RB, WR, TE, DB, LB, EDGE variants.

Daily metrics:

- Total Distance
- HSR
- Zone 6 Sprint Distance
- Zone 4-6 Accelerations
- Zone 4-6 Decelerations
- DSL
- HML Distance
- HMLD Per Minute
- Max Velocity
- % Max Velocity
- HSBI
- Momentum
- Explosive Efforts
- EWMA HSR
- EWMA Zone 6
- EWMA Accel/Decel
- EWMA Explosive
- Days Since 90%
- Days Since 85%

### Bigs

OL, DL, OT, OG, C, LT, RT, LG, RG, DT variants.

Daily metrics:

- Total Distance
- DSL
- Lower Speed Loading
- HML Distance
- HMLD Per Minute
- HSR
- Zone 4-6 Accelerations
- Explosive Efforts
- Max Velocity
- % Max Velocity
- Collision Load

## Data Management MVP

`/data-management` is implemented.

Current behavior:

- Lists all uploads.
- Shows filename, CSV type, season, upload date, row count, status.
- Filters by CSV type.
- Expandable player breakdown per upload.
- Parse/error detail view.
- Hard delete with confirmation.
- Deleting an upload cascades to data rows and then cleans up players with no remaining data.

Pending:

- Re-upload action that opens uploader pre-filtered to the same CSV type.
- Date range filter for upload table.

## AI Chat Assistant

Implemented.

Files:

- `auto-athlete/src/components/ChatPanel.tsx`
- `auto-athlete/src/app/api/chat/route.ts`
- `auto-athlete/src/lib/chat-tools.ts`
- `auto-athlete/src/lib/gemini.ts`
- `auto-athlete/src/lib/system-prompt.ts`

The assistant has access to query tools for roster/status/summary questions and respects page context, including focused player pages.

## Current MVP Priorities

The MVP is centered on Brian's daily workflow:

1. Upload season-tagged GPS data.
2. Start on the flagging page.
3. If a player is flagged, open the focused day report.
4. If Coach intentionally reduces load, mark `modified_load`.
5. When healthy again, mark `cleared`.
6. Use Overview as the team daily report.
7. Use Reports for player-by-player daily investigation.

## Coding Style Requirements

- Follow existing patterns before introducing new abstractions.
- Keep edits modular and tied to the current feature.
- Use `aa-*` design tokens and Tailwind classes.
- Prefer clear TypeScript types and small helper functions.
- Add short comments where logic is not obvious.
- Do not expose Supabase service-role keys in client code.
- Preserve athlete data privacy assumptions and RLS.
