# Auto Athlete — W&M Football Performance Dashboard

## Project Overview

Web app for Brian Kish (S&C coach, William & Mary Football) that automates his 5-hour manual Excel data workflow. He downloads CSVs from StatSports (GPS athlete monitoring), and our app generates a performance dashboard automatically.

**Course:** DATA 440 Final Project

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + custom dark theme tokens (`aa-`* prefix)
- **Components:** Tremor (dashboard charting library)
- **Database:** Supabase (PostgreSQL + auth + file storage)
- **Hosting:** Vercel
- **Fonts:** Bebas Neue (display), Barlow (body), JetBrains Mono (data/mono)

## Project Structure

```
/                               # repo root
├── CLAUDE.md
├── raw_data_good.csv           # StatSports GPS data (30 rows)
├── raw_data2_good.csv          # Force plate CMJ data (313 rows)
├── raw_data3_good.csv          # ForceFrame Hip AD/AB data (135 rows)
├── raw_data4_good.csv          # NordBord Nordic hamstring data (177 rows)
├── supabase/
│   └── schema.sql              # Full database schema (run in Supabase SQL Editor)
└── auto-athlete/               # Next.js app
    ├── .env.local              # Supabase URL + anon key + service role key + Groq API key
    ├── package.json
    ├── tailwind.config.ts      # Custom aa-* color tokens, fonts, animations
    └── src/
        ├── app/
        │   ├── layout.tsx              # Root layout (fonts, dark mode)
        │   ├── page.tsx                # / → redirects to /dashboard
        │   ├── globals.css             # Dark theme, noise overlay, card glow, scrollbar
        │   ├── api/
        │   │   ├── upload/route.ts     # POST /api/upload — CSV parse + Supabase insert
        │   │   ├── uploads/route.ts    # GET /api/uploads — upload history + player breakdown
        │   │   └── uploads/[id]/route.ts # DELETE /api/uploads/:id — hard delete (cascade)
        │   ├── dashboard/
        │   │   ├── layout.tsx          # Sidebar + TopBar chrome
        │   │   ├── page.tsx            # Main dashboard (live Supabase aggregates)
        │   │   ├── players/page.tsx    # Players roster + filters + positional report sheets
        │   │   ├── players/[id]/page.tsx # Player profile v1 (status, trends, fatigue, asymmetry, required metrics)
        │   │   ├── sessions/page.tsx   # Stub page (coming soon + session count)
        │   │   └── reports/page.tsx    # Stub page (coming soon)
        │   ├── upload/
        │   │   ├── layout.tsx          # Sidebar + TopBar chrome (same as dashboard)
        │   │   └── page.tsx            # Drag-and-drop CSV upload → calls /api/upload
        │   └── data-management/
        │       ├── layout.tsx          # Sidebar + TopBar chrome
        │       └── page.tsx            # Upload table + filter + expand + delete
        ├── components/
        │   ├── Sidebar.tsx             # Fixed left nav (220px), route-aware active state
        │   ├── TopBar.tsx              # Sticky header (system status, player search + redirect, avatar)
        │   ├── KPICard.tsx             # Animated metric card with sparkline
        │   ├── DashboardClient.tsx     # Dashboard UI renderer
        │   ├── DateSelector.tsx        # Session date dropdown
        │   ├── PlayersClient.tsx       # Players table filters + status controls + positional report tables
        │   ├── PlayerStatusBadge.tsx   # Status badge UI
        │   └── PlayerStatusSelect.tsx  # Status update dropdown
        └── lib/
            ├── supabase.ts             # Client-side Supabase client (anon key only)
            ├── supabase-server.ts      # Server-side Supabase client (service role key)
            ├── queries.ts              # Dashboard data queries/aggregations
            ├── date-utils.ts           # Timezone-safe date formatting and arithmetic
            ├── csv-parser.ts           # Auto-detect CSV type, map columns to DB schema
            ├── player-queries.ts       # Players list/profile queries + readiness/flags
            ├── position-groups.ts      # Position group mapping helper
            ├── derived-metrics.ts      # Shared derived metric helpers
            └── group-queries.ts        # Positional report-sheet selectors (daily/weekly)
```

## Current State

**Live dashboard + CSV upload + data management are built.** Dashboard reads real Supabase data; upload pipeline is functional for all 4 CSV types.

What exists:

- `/dashboard` — KPI cards, speed zones, leaderboard, ACWR, session info, and alert card backed by live Supabase queries (`src/lib/queries.ts`).
- `/upload` — Drag-and-drop zone (react-dropzone) wired to `/api/upload`. Auto-detects CSV type, maps known columns, upserts players, inserts rows, and returns parse/insert diagnostics.
- `POST /api/upload` — server route using service role key. Parses CSV -> upserts players -> creates upload record -> batch inserts data rows. Also returns a `duplicateWarning` when the same filename+type was previously uploaded.
- `/data-management` — table of uploaded files with CSV type filters, expandable player breakdown per upload, parse/error details, and hard-delete action.
- `GET /api/uploads` + `DELETE /api/uploads/:id` — list uploads and delete uploads (delete cascades to `gps_sessions`, `jump_tests`, `force_frame_tests`, `nordbord_tests` through `upload_id` FK).
- `/dashboard/players` — roster page with search, advanced filters, status updates, and positional daily/weekly report sheets (Skills/Mids vs Bigs).
- `/dashboard/players/[id]` — Player Profile v1 with status controls, sprint recency cards, 14-day trends, fatigue snapshot, asymmetry, flags, and required metrics.
- `TopBar` player search — typeahead search by player name with direct redirect to `/dashboard/players/[id]`.
- `/dashboard/sessions`, `/dashboard/reports` — working stub pages (no longer 404) with "coming soon" states.
- `csv-parser.ts` — type detection (GPS: "Session Date", Jump: "Test Type"+"BW [KG]", ForceFrame: "Direction"+"Mode", NordBord: "Date UTC"+"L Max Torque"), full mappings, date/time conversion, BOM/whitespace handling.
- `date-utils.ts` — timezone-safe formatting/arithmetic for date-only strings (`YYYY-MM-DD`) to prevent off-by-one display issues.
- Dark sports analytics aesthetic remains: Bebas Neue headers, electric cyan accent (#00f0ff), noise texture, staggered entrance animations.
- `.env.local` uses Supabase URL + anon key + service role key + Groq API key/model ID.

What needs to be built:

1. ~~**Deploy schema** — run `supabase/schema.sql` in the Supabase SQL Editor~~ ✓ Done
2. ~~**Team Dashboard foundation** — replace mock dashboard with live Supabase data~~ ✓ Done (core cards/leaderboard/session info wired)
3. ~~**Positional Dashboard** — averages by position group (QB, RB, WR, DB, etc.)~~ ✓ Done (v1 daily/weekly report sheets + group toggle)
4. ~~**Player Profile** — individual metrics with 7-day rolling averages, fatigue module, asymmetry~~ ✓ Done (v1 implemented; advanced rehab/RTP/compare modules still pending)
5. **Weekly Progression** — planned vs. actual training load over the season
6. **Comparison Views** — day-to-day, week-to-week, custom range, full season
7. **Flagging System** — z-score based alerts surfaced in the existing alert card
8. ~~**Data Management page** — view/delete uploaded files + inspect upload errors~~ ✓ Done (re-upload shortcut still pending)
9. **Injury Investigation** — prospective risk scoring, retrospective 14-day timeline

## Database Schema (Supabase)

Schema SQL lives in `supabase/schema.sql`. Run it in the Supabase SQL Editor to create all tables.


| Table               | Source CSV           | Key Columns                                                                   |
| ------------------- | -------------------- | ----------------------------------------------------------------------------- |
| `players`           | All files            | name (unique), position                                                       |
| `gps_sessions`      | `raw_data_good.csv`  | 50 metrics: distance, speed, accel/decel zones, HML, fatigue, DSL, collisions |
| `jump_tests`        | `raw_data2_good.csv` | CMJ: jump height, RSI, power, eccentric/concentric phases, asymmetry          |
| `force_frame_tests` | `raw_data3_good.csv` | Hip AD/AB: L/R force, imbalance, RFD & impulse at 50–250ms windows            |
| `nordbord_tests`    | `raw_data4_good.csv` | Nordic hamstring: L/R force, torque, RFD & impulse at 50–250ms windows        |


All tables have RLS enabled: public read, authenticated/service_role write. All FK to `players(id)` with `ON DELETE CASCADE`.

## CSV Data Sources

### 1. StatSports GPS (`raw_data_good.csv`) — 54 columns

Key: `Session Date`, `Session Title`, `Player Name`, `Player Primary Position`, `Total Distance`, `Max Speed`, `High Speed Running (Relative)`, `Accelerations (Relative)`, `Decelerations (Relative)`, `HML Distance`, `HMLD Per Minute`, `Fatigue Index`, `Speed Intensity`, `Dynamic Stress Load`, `Collision Load`, `Drill Title`

### 2. Force Plate CMJ (`raw_data2_good.csv`) — 29 columns

Key: `Name`, `Test Type`, `Date`, `BW [KG]`, `Jump Height (Imp-Mom) in Inches [in]`, `RSI-modified`, `Peak Power / BM`, `Eccentric Deceleration RFD`, asymmetry percentages

### 3. ForceFrame Hip AD/AB (`raw_data3_good.csv`) — 77 columns

Key: `Name`, `Date`, `Device`, `Direction` (Pull/Squeeze), `Position`, L/R max/avg force, imbalance %, RFD & impulse at 50ms–250ms windows

### 4. NordBord Nordic (`raw_data4_good.csv`) — 72 columns

Key: `Name`, `Date UTC`, `Device`, `Test`, L/R max/avg force, torque, imbalance %, RFD & impulse at 50ms–250ms windows

## Design System

- **Background:** `aa-bg` (#07080a) near-black
- **Surfaces:** `aa-surface` (#0f1117), `aa-elevated` (#181b25)
- **Accent:** `aa-accent` (#00f0ff) electric cyan
- **Warm accent:** `aa-warm` (#ff6b35) for highlights/alerts
- **Semantic:** `aa-success` (#00e676), `aa-warning` (#ffab00), `aa-danger` (#ff1744)
- **Typography:** Bebas Neue for headings (all-caps), Barlow for body, JetBrains Mono for data
- **Animations:** slide-up, fade-in, slide-in-left, count-up, pulse-glow (all in tailwind.config.ts)
- **Aesthetic:** Bloomberg Terminal meets ESPN — dense data, dark theme, position filters, color-coded rows

## Constraints

- Never expose the Supabase secret/service-role key in frontend code — anon key only on client
- All athlete data is private — Row Level Security (RLS) must be enabled on all tables
- Build one feature at a time, keep changes modular
- Supabase project: `eupueeealtffymlmmcgh.supabase.co`

## Development

```bash
cd auto-athlete
npm run dev     # starts Next.js dev server
npm run build   # production build
npm run lint    # ESLint
```

---

## Feature Requirements

### Data ingestion

- **Preferred method: drag-and-drop upload** via the existing `/upload` page (react-dropzone). User exports CSVs from StatSports, drops them into the app, and the pipeline parses and stores them in Supabase.
- Auto-detect CSV type by inspecting column headers on upload — do not rely on filename.
- Validate required columns before inserting; surface errors clearly in the upload UI.
- Sport scope: **football only**.

### Derived metrics

These are computed at query time in Supabase SQL views or Next.js API routes. Do not store them as raw columns.


| Metric                          | Formula                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HSBI (High Speed Braking Index) | Zone 4–6 Decelerations × Max Speed                                                                                                                                                    |
| Momentum                        | Body Weight (kg) × Weekly Top Speed (m/s)                                                                                                                                             |
| EWMA                            | Exponential weighted moving average using λ = 0.28: `EWMA_today = λ × value_today + (1 − λ) × EWMA_yesterday`. Apply to: HSR, Zone 6 Sprint Distance, Accel/Decel, Explosive Efforts. |
| Z-score                         | Per-player z-score against their own full historical baseline: `z = (value − player_mean) / player_stddev`. Used for all flagging and conditional formatting.                         |


### Player groups & report sheets

Two position groups with separate metric sets. Group assignment comes from `Player Primary Position` in the GPS CSV.

**Skills / Mids** (QB, RB, WR, TE, DB, LB, edge rushers)

Daily metrics:

- Total Distance
- HSR — High Speed Running (Zone 4–6 Relative)
- Zone 6 Sprint Distance
- Zone 4–6 Accelerations
- Zone 4–6 Decelerations
- DSL — Dynamic Stress Load
- HMLD — High Metabolic Load Distance
- HMLD Per Minute
- Max Velocity
- % Max Velocity
- HSBI *(derived)*
- Momentum *(derived)*
- Explosive Efforts
- EWMA for HSR, Zone 6, Accel/Decel, Explosive Efforts *(derived)*
- Days since 90% max velocity sprint
- Days since 85% max velocity sprint

Weekly sums:

- Total Distance, HSR, Sprint Distance, DSL, Accel/Decel, Explosive Efforts

**Bigs** (OL, DL)

Daily metrics:

- Total Distance
- DSL — Dynamic Stress Load
- Lower Speed Loading
- HMLD — High Metabolic Load Distance
- HMLD Per Minute
- HSR — High Speed Running
- RPE — Rate of Perceived Exertion
- Zone 4–6 Accelerations
- Explosive Efforts
- Max Velocity
- % Max Velocity
- Collision Load

Weekly sums:

- Total Distance, DSL, Lower Speed Loading, HSR, Zone 4–6 Accelerations, Explosive Efforts, Collision Load

**Combined report sheet:** Also build an Offense + Defense combined sheet that shows all players regardless of group, with position labels visible.

### Comparison views

All comparison views must support: position-level toggle, individual-level toggle, and a drill filter (dropdown populated from the `Drill Title` column in `gps_sessions`).


| View         | Behavior                                                         |
| ------------ | ---------------------------------------------------------------- |
| Day-to-day   | Select any two individual days and compare side by side          |
| Week-to-week | Select any two individual weeks and compare side by side         |
| Custom range | Select a start and end date; show aggregated totals and averages |
| Full season  | All data across the season shown as a trend                      |


- Individual-vs-individual and individual-vs-position-average **radar charts** on all comparison views. Radar chart axes use z-scores so metrics with different magnitudes are comparable.
- Trend lines must be viewable across multiple weeks, not just adjacent days.

### Fatigue module

Displayed on the Player Profile page. Two distinct categories shown separately.

**CNS fatigue indicators** (data from `jump_tests` + rolling window on `gps_sessions`):

- Jump Height — from `jump_tests`
- RSI-modified — from `jump_tests`
- Highest top speed in last 3 days — rolling window on `gps_sessions.Max Speed`
- Total sprint distance in last 3 days — rolling window on `gps_sessions` Zone 6

**Musculature fatigue indicators** (data from `gps_sessions`, `force_frame_tests`, `nordbord_tests`):

- Zone 4–6 Accel/Decel — from `gps_sessions`
- Groin Squeeze test result — from `force_frame_tests` where `Direction = 'Squeeze'`
- Hamstring Iso 30 test result — from `nordbord_tests`

**Asymmetry:** Surface L/R imbalance % from `force_frame_tests` and `nordbord_tests` on the Player Profile page. Flag when imbalance exceeds 10%.

### Flagging system

Z-score based. All flags surface in the existing alert card on `/dashboard` and on the individual Player Profile page. Flag a player when any condition below is true:

**Sprint recency flags** (from `gps_sessions`):

- 7 or more days since a session where Max Speed ≥ 90% of the player's recorded max velocity
- 10 or more days since a session where Max Speed ≥ 85% of the player's recorded max velocity

**EWMA deviation flags** (trigger when EWMA drops > 1 SD below the player's baseline):

- HSR EWMA
- Zone 6 Sprint Distance EWMA
- Accel/Decel EWMA
- Explosive Efforts EWMA

**Output flags** (trigger when z-score < −1.5):

- Jump Height — from `jump_tests`
- Concentric Peak Force / Body Mass — from `jump_tests`
- Eccentric Braking Impulse — from `jump_tests`

**Strategy / movement quality flags** (trigger when z-score < −1.5):

- Contraction Time — from `jump_tests`
- Eccentric Duration — from `jump_tests`
- Counter Movement Depth — from `jump_tests`
- Groin Squeeze — from `force_frame_tests`
- Iso 30 / Nordic — from `nordbord_tests`

### Conditional formatting

- All metric tables use z-scores to color-code cells — not absolute thresholds.
- Color scale: `aa-danger` (#ff1744) for z < −1.5, `aa-warning` (#ffab00) for −1.5 ≤ z < −1.0, neutral for −1.0 ≤ z ≤ 1.0, `aa-success` (#00e676) for z > 1.5.
- Radar chart axes use the same z-score scale so cross-metric comparisons are meaningful.

### Injury investigation

Two modes: prospective (identify at-risk players before injury) and retrospective (analyze what went wrong in the days leading up to a known injury).

**Prospective — at-risk flagging**
Combine signals from all 4 data sources into a composite risk score per player per day. A player is considered elevated risk when multiple signals trend negative simultaneously. Key signals ranked by injury relevance:


| Signal                             | Source                                 | Why it matters                                  |
| ---------------------------------- | -------------------------------------- | ----------------------------------------------- |
| L/R hamstring force imbalance %    | `nordbord_tests`                       | Strongest single predictor of hamstring strain  |
| L/R hip AD/AB imbalance %          | `force_frame_tests`                    | Groin strain predictor                          |
| Days since 90% / 85% max velocity  | `gps_sessions`                         | Tissue deconditioning — high speed exposure gap |
| Eccentric Braking Impulse z-score  | `jump_tests`                           | Declining ability to absorb force               |
| Eccentric Deceleration RFD z-score | `jump_tests`                           | Early neuromuscular deficit                     |
| RSI-modified z-score               | `jump_tests`                           | CNS / tendon fatigue                            |
| Contraction Time trend             | `jump_tests`                           | Slower = fatigued CNS                           |
| EWMA deviation on Accel/Decel      | `gps_sessions`                         | Sudden load spike above chronic baseline        |
| DSL spike vs. 28-day rolling avg   | `gps_sessions`                         | Acute:chronic workload ratio stress             |
| Fatigue Index drop                 | `gps_sessions`                         | Output decline within a single session          |
| Collision Load spike               | `gps_sessions`                         | Direct contact forces exceeding norm            |
| Asymmetry % > 10% (either test)    | `force_frame_tests` / `nordbord_tests` | Compensation patterns that lead to overload     |


Flag a player as elevated injury risk when 3 or more of the above signals are simultaneously outside their personal norm (z < −1.5 for force/output metrics, z > 1.5 for load/stress metrics).

**Retrospective — injury cause analysis**
Accessible from the Player Profile page. User inputs an injury date; the feature pulls and displays all signals listed above for the 14 days prior to that date.

UI requirements:

- Timeline view showing each signal as a trend line over the 14-day window, with the injury date marked as a vertical line
- Highlight which signals crossed into warning/danger territory and on what day
- Show the `Drill Title` for each GPS session in that window — so Brian can identify which drill the athlete was in when signals degraded
- Summary card at the top listing the signals that were most abnormal in the 7 days immediately before injury, ranked by z-score deviation
- Export this view as a PDF report for medical staff

Data points to pull for the retrospective window (14 days prior to injury date):

From `gps_sessions`: Total Distance, DSL, HSR, Zone 4–6 Accel/Decel, Max Speed, % Max Velocity, Fatigue Index, Collision Load, Explosive Efforts, Drill Title, Session Title

From `jump_tests`: Jump Height, RSI-modified, Eccentric Braking Impulse, Eccentric Deceleration RFD, Concentric Peak Force/BM, Contraction Time, Eccentric Duration, Counter Movement Depth, asymmetry %

From `force_frame_tests`: L/R max force, imbalance %, RFD at 50ms and 100ms windows (Direction = Squeeze for groin)

From `nordbord_tests`: L/R max force, torque, imbalance %, RFD at 50ms and 100ms windows

**Schema status:** `injuries` table already exists in `supabase/schema.sql` with the required status workflow (`injured`, `rehab`, `return_to_play`, `cleared`).

### Player status and rehab mode

Players can be declared **Injured** or **In Rehab** from the Player Profile page. This status affects how their data is displayed and whether flagging runs against them.

**Status definitions:**


| Status           | Meaning                                                          | Flagging                | Appears in team/position views                            |
| ---------------- | ---------------------------------------------------------------- | ----------------------- | --------------------------------------------------------- |
| `injured`        | Out — not training                                               | Suspended entirely      | Hidden from aggregate views                               |
| `rehab`          | Training with restrictions — metrics will be lower than baseline | Suspended entirely      | Shown with a rehab badge; excluded from position averages |
| `return_to_play` | Progressing through RTP protocol — metrics tracked for clearance | RTP mode (see below)    | Shown with RTP badge; excluded from position averages     |
| `cleared`        | Fully returned                                                   | Normal flagging resumes | Included in all views normally                            |


**UI requirements:**

- On the Player Profile page, show a status badge next to the player's name: `INJURED` (aa-danger), `REHAB` (aa-warning), `RETURN TO PLAY` (aa-warm #ff6b35), `CLEARED` (aa-success).
- Brian can update status via a dropdown on the Player Profile page. Status change is logged with a timestamp in the `injuries` table (`updated_at`).
- On the team dashboard and positional views, players in `injured` or `rehab` status are visually separated into a dedicated **Injury / Rehab** section at the bottom of the roster — they do not pollute position averages or team aggregates.
- Show expected return date on the Player Profile page and in the Injury / Rehab roster section if set.

**Rehab metric tracking:**

- When a player is in `rehab` or `return_to_play` status, their metrics are still recorded and displayed — but z-scores are computed against their **pre-injury baseline** (all data before `injury_date`), not their recent rehab numbers. This makes it clear how far they are from their healthy norm.
- Display a **% of baseline** indicator for every tracked metric on the Player Profile page during rehab and RTP — not just key metrics. Pre-injury baseline is the player's mean for that metric across all sessions before `injury_date`. Formula: `% of baseline = (current_value / pre_injury_mean) × 100`.
- Group the full % of baseline view into the same four categories used elsewhere on the profile:
  **GPS load metrics** (from `gps_sessions` — use most recent session value vs. pre-injury mean):
  Total Distance, HSR, Zone 6 Sprint Distance, Zone 4–6 Accels, Zone 4–6 Decels, DSL, Max Velocity, % Max Velocity, Explosive Efforts, EWMA metrics
  **CNS output metrics** (from `jump_tests` — use most recent test vs. pre-injury mean):
  Jump Height, RSI-modified, Peak Power/BM, Eccentric Braking Impulse, Eccentric Deceleration RFD, Contraction Time, Eccentric Duration, Counter Movement Depth
  **Hip strength metrics** (from `force_frame_tests` — use most recent test vs. pre-injury mean):
  L/R max force (Squeeze), L/R max force (Pull), imbalance %, RFD at 50ms and 100ms
  **Hamstring metrics** (from `nordbord_tests` — use most recent test vs. pre-injury mean):
  L/R max force, L/R torque, imbalance %, RFD at 50ms and 100ms
- Each metric row shows: metric name, pre-injury baseline value, current value, % of baseline as a number, and a color-coded progress bar. Color scale: below 70% = `aa-danger`, 70–85% = `aa-warning`, 85–95% = `aa-warm`, 95%+ = `aa-success`.
- Also show a **trend arrow** next to each metric (up/down/flat) based on whether the last 3 data points are improving, declining, or stable — so Brian can see not just where they are but which direction they're moving.
- For `return_to_play` status, add a dedicated **RTP Progress** section on the Player Profile page showing:
  - Current values vs. pre-injury baseline for CNS fatigue indicators (Jump Height, RSI, top speed)
  - Current values vs. pre-injury baseline for musculature indicators (Groin Squeeze, Hamstring Iso 30, Accel/Decel)
  - Asymmetry % trend — is L/R balance improving toward pre-injury levels?
  - A simple progress bar per metric showing % of baseline recovered

**Flagging suppression:**

- Players with status `injured` or `rehab` are completely excluded from all flagging. No alerts fire for them.
- Players with status `return_to_play` trigger a separate set of RTP-specific alerts if any metric drops below 80% of pre-injury baseline, rather than the standard z-score thresholds.
- When a player is marked `cleared`, flagging automatically resumes using their full historical baseline (including pre-injury data).

### Data management page

**Current status:** Implemented at `/data-management` with sidebar navigation, CSV type filters, upload table, expandable player breakdown, parse/error detail view, and hard delete with confirmation.

**UI requirements:**

- Table listing every uploaded file with: filename, detected CSV type, upload date, number of rows parsed, and status (success / error / partial).
- Per-file actions:
  - **Delete** — implemented. Removes all rows in Supabase from that upload with confirmation (hard delete).
  - **Re-upload** — pending. Should open uploader pre-filtered to the same CSV type.
- Filter the table by CSV type (GPS, Force Plate, ForceFrame, NordBord) and by date range.
- Show a per-player breakdown: clicking a file row expands it to show which players' records are included, so Brian can verify the right athletes are in the data before or after deletion.
- If a file had parse errors (missing columns, bad rows), show a warning badge and a detail panel listing which rows were skipped and why.

**Schema status:** `uploads` table and `upload_id` foreign keys are already implemented in `supabase/schema.sql` with `ON DELETE CASCADE` behavior on all four data tables.

### Rehab vs. active player comparison

When a player is in `rehab` or `return_to_play` status, their Player Profile page includes a **Compare to Team** section that shows how their current metrics stack up against healthy teammates at the same position — in real time.

**Purpose:** Brian can see not just "player is at 80% of their own baseline" but also "player is at 80% of what their position group is doing right now" — giving a more meaningful picture of readiness.

**UI requirements:**

- A side-by-side comparison panel on the Player Profile page, visible only when status is `rehab` or `return_to_play`.
- Left column: rehab player's most recent values.
- Right column: current position group average (healthy players only — `injured` and `rehab` players excluded from the average).
- Show % gap between rehab player and position average for each metric, color-coded the same way as % of baseline (below 70% = `aa-danger`, 70–85% = `aa-warning`, 85–95% = `aa-warm`, 95%+ = `aa-success`).
- Include a radar chart overlay: rehab player (dashed line) vs. position average (solid line) using z-scores on all axes, so the shape of their performance gap is visible at a glance.
- Metrics to compare (same four groups as the % of baseline view): GPS load metrics, CNS output metrics, hip strength metrics, hamstring metrics.
- Add a **trend line** view toggled from the same panel: shows the rehab player's metric trajectory over the past 4 weeks plotted against the position group's rolling average for the same period — so Brian can see if the gap is closing.

### AI Chat Assistant (Groq)

An LLM-powered chat panel where Brian can ask natural language questions about athlete data. The model (currently `qwen/qwen3-32b` via Groq Cloud, configurable through env vars) calls existing query functions as tools, fetches live Supabase data, and streams answers back.

**Model:** Groq-hosted model via `GROQ_MODEL_ID` (currently `qwen/qwen3-32b`)
**Host:** Groq Cloud (OpenAI-compatible `chat/completions` REST API)
**UI:** 420px slide-out panel on the right, accessible from TopBar

**Current status:** Phase 1 through Phase 6 are implemented. The chat panel supports tool calling, streaming, retry/copy UX, suggested questions, session persistence, inline player/metric cards, and page-context awareness.

#### Phase 1 — Backend Foundation

Goal: A working `/api/chat` route that round-trips a message through Groq and returns a response. No tools, no streaming — just proving the LLM connection works.

- [x] **1.1** Add `GROQ_API_KEY` and `GROQ_MODEL_ID` to `.env.local` (server-only, no `NEXT_PUBLIC_` prefix)
- [x] **1.2** Create `src/lib/chat-types.ts` — shared TypeScript types: `ChatRole`, `ChatMessage`, `ToolCall`, `ToolResult`, `ChatRequest`, `ChatResponse`, `ToolDefinition`
- [x] **1.3** Create `src/lib/qwen.ts` — LLM client wrapper using raw `fetch` against Groq OpenAI-compatible `chat/completions` endpoint. Export `chatCompletion(messages, tools?)`. Handle 429/5xx with a single retry after 1s
- [x] **1.4** Create `src/app/api/chat/route.ts` — POST endpoint accepting `{ messages }`, calls `chatCompletion()`, returns `NextResponse.json({ reply })`
- [x] **1.5** Test manually with curl: `curl -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"Hello"}]}'`

#### Phase 2 — Tool Definitions

Goal: Wrap existing query functions as callable tools so the LLM can fetch live data from Supabase. Test via curl — no UI yet.

- [x] **2.1** Create `src/lib/chat-tools.ts` with tool schema definitions (JSON Schema format for OpenAI-compatible function calling):
  - `get_dashboard_data` → `getDashboardData(date?)` from `src/lib/queries.ts`
  - `get_available_session_dates` → `getAvailableSessionDates()` from `src/lib/queries.ts`
  - `get_players_list` → `getPlayersList()` from `src/lib/player-queries.ts`
  - `get_player_profile` → `getPlayerProfile(playerId)` from `src/lib/player-queries.ts`
  - `get_position_report` → `getPositionReportData(date?)` from `src/lib/group-queries.ts`
  - `get_grouped_daily_metrics` → `getGroupedDailyMetrics(date, group)` from `src/lib/group-queries.ts`
  - `get_grouped_weekly_sums` → `getGroupedWeeklySums(weekStart, group)` from `src/lib/group-queries.ts`
- [x] **2.2** Implement `executeTool(name, args)` dispatcher in `chat-tools.ts` — switch on tool name, call the corresponding query function, JSON.stringify the result (truncate at 15K chars if needed)
- [x] **2.3** Update `qwen.ts` to pass tool definitions in the Groq `tools` field
- [x] **2.4** Update `api/chat/route.ts` with the tool-call loop: send → if tool_calls, execute each → append results → re-send (max 5 iterations) → return final text reply
- [x] **2.5** Test: ask "What was the team average total distance on the most recent session?" via curl — should call `get_dashboard_data` and return a natural-language answer
- [x] **2.6** Test multi-tool: ask "Show me the profile for the player with the most flags" — should call `get_players_list` then `get_player_profile`

#### Phase 3 — Chat UI

Goal: A slide-out chat panel in the dashboard. Brian can type a question and see an answer (no streaming yet — full response appears at once).

- [x] **3.1** Add `slide-in-right` keyframe + animation to `tailwind.config.ts` (mirrors existing `slide-in-left`)
- [x] **3.2** Create `src/components/ChatMessage.tsx` — user messages (right-aligned, cyan-tinted) and assistant messages (left-aligned, elevated surface). Loading state with pulse animation. Basic text formatting (bold, line breaks, lists)
- [x] **3.3** Create `src/components/ChatInput.tsx` — auto-growing textarea, send on Enter (Shift+Enter for newline), disabled state while loading, send button with arrow icon
- [x] **3.4** Create `src/components/ChatPanel.tsx` — fixed right panel (420px, z-50), header with title + close button, scrollable message area (auto-scroll to bottom), ChatInput pinned to bottom, semi-transparent backdrop overlay
- [x] **3.5** Create `src/lib/chat-context.ts` + `src/components/ChatProvider.tsx` — React context providing `{ isChatOpen, toggleChat }` so TopBar and ChatPanel can share state
- [x] **3.6** Modify `src/components/TopBar.tsx` — add chat toggle button (chat bubble icon) between notification bell and avatar
- [x] **3.7** Modify `src/app/dashboard/layout.tsx` — wrap content in `<ChatProvider>`, render `<ChatPanel />` alongside existing layout
- [x] **3.8** Test end-to-end: open dashboard → click chat button → type "How many players are on the roster?" → verify answer appears

#### Phase 4 — System Prompt & Domain Context

Goal: Make the LLM's answers genuinely useful for an S&C coach by giving it deep domain knowledge.

- [x] **4.1** Create `src/lib/system-prompt.ts` — system prompt covering:
  - Identity: AI assistant for Auto Athlete, user is S&C coach Brian Kish
  - Data sources: GPS (StatSports), force plate (CMJ), force frame (hip AD/AB), NordBord (hamstring)
  - Key metrics + formulas: EWMA (λ=0.28), HSBI, Momentum, ACWR, z-scores
  - Position groups: Skills/Mids vs Bigs and their metric focus areas
  - Flag thresholds: sprint recency (7d/10d), EWMA deviation (>1 SD), output z < −1.5, asymmetry > 10%
  - Player status effects: injured/rehab excluded from flags, RTP uses pre-injury baseline
  - Response formatting: use player names not IDs, include units, round appropriately
- [x] **4.2** Export `buildSystemPrompt()` that dynamically injects today's date and the most recent session date
- [x] **4.3** Update `api/chat/route.ts` to prepend system prompt as first message in every request
- [x] **4.4** Test domain questions: "Which players have sprint recency flags?", "What's the team ACWR?", "Is anyone at risk for hamstring injury?"

#### Phase 5 — Streaming & Polish

Goal: Stream responses token-by-token for responsive feel. Add error handling, markdown rendering, and visual refinements.

- [x] **5.1** Add `chatCompletionStream()` to `qwen.ts` using Groq streaming `chat/completions` endpoint. Tool calls run non-streamed; only the final text response streams
- [x] **5.2** Update `api/chat/route.ts` to return SSE stream (`text/event-stream`) with `data: {"token":"..."}\n\n` events and `data: [DONE]\n\n` terminator
- [x] **5.3** Update `ChatPanel.tsx` to consume stream via `response.body.getReader()`, updating assistant message content incrementally. Show "Thinking..." during tool-call execution
- [x] **5.4** Improve `ChatMessage.tsx` — basic markdown rendering (`**bold**`, line breaks, bullet/numbered lists), copy button on assistant messages, blinking cursor while streaming
- [x] **5.5** Error handling UI — error message bubble (`border-aa-danger`), retry button that re-sends last user message
- [x] **5.6** Visual polish — gradient header on panel, noise-overlay texture, `transition-transform duration-300` open/close, keyboard shortcut `Cmd+J` to toggle panel

#### Phase 6 — Advanced Features

Goal: Quality-of-life features. Each sub-phase is independent — implement in any order.

**6A — Suggested Questions**
- [x] **6A.1** Create `src/lib/chat-suggestions.ts` — categorized question arrays (general, player-specific, fatigue, position groups). Export `getSuggestions(hasMessages)` returning different suggestions for empty vs mid-conversation states
- [x] **6A.2** Create `src/components/SuggestedQuestions.tsx` — horizontal scrollable row of pill-shaped chips, clickable to send
- [x] **6A.3** Integrate into `ChatPanel.tsx` — starter suggestions in empty state, contextual follow-ups after first exchange

**6B — Conversation Persistence**
- [x] **6B.1** Persist messages to `sessionStorage` in `ChatPanel.tsx` — survives page navigation, clears on tab close. Add "Clear conversation" button in chat header

**6C — Inline Data Cards**
- [x] **6C.1** Define `:::player-card` and `:::metric-card` markers in system prompt for structured data blocks
- [x] **6C.2** Parse markers in `ChatMessage.tsx` — render mini player cards (reuse `PlayerStatusBadge.tsx`) and KPI-style metric cards inline in chat, clickable to navigate

**6D — Page-Context Awareness**
- [x] **6D.1** In `ChatPanel.tsx`, detect current route via `usePathname()` and pass as context to the API (`{ messages, context: { page, playerId? } }`)
- [x] **6D.2** Update `api/chat/route.ts` to incorporate page context into the system prompt dynamically

CODING STYLE REQUIREMENTS:

- Always add comments or the equivalent of type-hints from Python.

