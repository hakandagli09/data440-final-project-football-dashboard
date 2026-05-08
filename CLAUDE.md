# Auto Athlete — W&M Football Performance Dashboard

## Project Overview

Web app for Brian Sutton (S&C coach, William & Mary Football) that automates his 5-hour manual Excel data workflow. He downloads CSVs from StatSports (GPS athlete monitoring), and our app generates a performance dashboard automatically.

**Course:** DATA 440 Final Project

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + custom dark theme tokens (`aa-`* prefix)
- **Components:** Tremor (dashboard charting library)
- **Database:** Supabase (PostgreSQL + auth + file storage)
- **Hosting:** Vercel
- **Fonts:** Bebas Neue (display), Barlow (body), JetBrains Mono (data/mono)

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

Four CSV families: StatSports GPS, Force Plate CMJ, ForceFrame Hip AD/AB, NordBord Nordic hamstring. Type detection + column mapping live in `auto-athlete/src/lib/csv-parser.ts` (don't infer from filename — sniff headers).

## Design System

- **Tokens:** `aa-*` color tokens are CSS variables (see `auto-athlete/src/app/globals.css`). Three-layer system: primitive RGB triples → semantic `--aa-bg`/`--aa-surface`/`--aa-accent`/etc. → Tailwind classes (`bg-aa-bg`, `text-aa-success`, etc.). Use the Tailwind classes; never hardcode hex values.
- **Themes:** `:root` = dark (default), `[data-theme="light"]` = neutral grayscale + status colors, `@media print` = forced light. `ThemeProvider` (`src/lib/theme-context.tsx`) toggles `<html data-theme>`.
- **Typography:** Bebas Neue (display, all-caps), Barlow (body), JetBrains Mono (data).
- **Aesthetic:** Bloomberg Terminal meets ESPN — dense data, color-coded rows, status colors carry meaning.

## Constraints

- Never expose the Supabase secret/service-role key in frontend code — anon key only on client
- All athlete data is private — Row Level Security (RLS) must be enabled on all tables
- Build one feature at a time, keep changes modular

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

### AI Chat Assistant (Gemini)

Implemented. 420px slide-out panel from the TopBar. Calls Supabase query functions as tools and streams replies. Lives in `src/components/ChatPanel.tsx`, `src/app/api/chat/route.ts`, `src/lib/chat-tools.ts`, `src/lib/gemini.ts`, `src/lib/system-prompt.ts`. Model configurable via `GOOGLE_MODEL_ID` (currently a Gemini Google AI Studio model).

CODING STYLE REQUIREMENTS:

- Always add comments or the equivalent of type-hints from Python.


# To-Do


## Units (American system)
- Change distance from m to yards
- Meters per second to miles per hour
- Audit every metric/label end-to-end for unit consistency

## Data ingest
- Verify the new `Copy of 2025 W&M Football GPS Dashboard - RAW DATA.csv` (5,329 rows, 174 session dates, 78 players, 2023-08-31 → 2025-11-22, 35 game days tagged `Session Title = Game`) imports cleanly via `/upload` and populates `gps_sessions.session_title`
- Wire in NordBord upload UI (L/R hamstring force + imbalance %)
- Force plate (CMJ) upload — already supported in parser, confirm UI surfaces issues clearly

## Session-title-aware flagging (this is the big one)
- Brian's core complaint: today's flagging compares all sessions equally, so a Game gets flagged against a Helmets day. Fix by stratifying baselines by `session_title`.
- Practice types to stratify on: `Game`, `Practice`, `Helmets`, `Shells`, `Full Pads`. Anything else = individual session with Coach Sutton — exclude from team flagging.
- For each metric, baseline = same player's mean for that *same session_title*, not all sessions.
- Drill down: when a player is "above average" on a Full Pads day, show which drill(s) drove it — split metrics by `drill_title`.
- Replace 4-week running-total `%` column on Session Report with **% of game performance** (player's mean over `session_title = 'Game'` rows). This is what Brian actually wants.
- Add a 4-practice progression visual (red/green/yellow/orange) so coach can verify low→high→low rest pattern across recent days. Flag when there are repetitive high days with no rest.
- Treat `SB` (spring ball) as a season tag, not a session title.
- Skip rainy days in flagging — they don't live-track in rain, so those gaps are expected, not deficits.

## Position-group + drill filtering
- Make the main dashboard splittable by position group (already partial via Skills/Mids vs Bigs)
- On player profile, when a date is selected, auto-populate full-session metrics with a **drill dropdown** so coach can isolate per-drill performance
- For Spring Ball reports specifically: HSR = Zone 4-6, Accels/Decels = Zone 4-6, Sprint Distance = Zone 6 (≥90% max velocity)
- Reports should support a Mon-Sat running-total view

## Metric set changes
- Remove: `Fatigue Index`, `Speed Intensity` from default views
- Rename `HML Efforts` → `Explosive Efforts` everywhere
- Add: `Momentum` = highest top speed of the week × body weight
- NordBord thresholds: imbalance > 2 = green, > 15 = red

## Comparison & profile views
- Period-of-time selector: "show best performance in [date range] for [position group]"
- "Find player's fastest sprint in last 4 weeks" — single-player query against `max_speed`
- Position group average + the day they hit their max
- "When did player X hit ≥90% / ≥85% of their max speed" — already exists in flagging, surface as a profile chart
- "What % of top speed are they hitting?" — running indicator over time
- Same as above for distance
- Sprint profile, lift profile, jump profile — selectable views inside Player Profile
- Cross-season comparison: spring → summer growth, season-over-season

## Visualizations
- X/Y scatter plots for jump metrics (e.g. RSI vs concentric peak force) — see who lands where on the plot
- Line graph: any metric over time, position-vs-individual overlay
- Leaderboard report based on Brian's preferred metrics (define which metrics)

## Account / setup
- Document for the user how to create their own Supabase project + Google AI Studio key so they can deploy their own instance, not share the dev project

