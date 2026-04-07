# Auto Athlete — W&M Football Performance Dashboard

## Project Overview

Web app for Brian Kish (S&C coach, William & Mary Football) that automates his 5-hour manual Excel data workflow. He downloads CSVs from StatSports (GPS athlete monitoring), and our app generates a performance dashboard automatically.

**Course:** DATA 440 Final Project

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + custom dark theme tokens (`aa-*` prefix)
- **Components:** Tremor (dashboard charting library)
- **Database:** Supabase (PostgreSQL + auth + file storage)
- **Hosting:** Vercel
- **Fonts:** Bebas Neue (display), Barlow (body), JetBrains Mono (data/mono)

## Project Structure

```
/                               # repo root
├── CLAUDE.md
├── raw_data_good.csv           # StatSports CSV exports (4 files)
├── raw_data2_good.csv
├── raw_data3_good.csv
├── raw_data4_good.csv
└── auto-athlete/               # Next.js app
    ├── .env.local              # Supabase URL + anon key
    ├── package.json
    ├── tailwind.config.ts      # Custom aa-* color tokens, fonts, animations
    └── src/
        ├── app/
        │   ├── layout.tsx          # Root layout (fonts, dark mode)
        │   ├── page.tsx            # / → redirects to /dashboard
        │   ├── globals.css         # Dark theme, noise overlay, card glow, scrollbar
        │   ├── dashboard/
        │   │   ├── layout.tsx      # Sidebar + TopBar chrome
        │   │   └── page.tsx        # Main dashboard (hardcoded mock data)
        │   └── upload/
        │       ├── layout.tsx      # Sidebar + TopBar chrome (same as dashboard)
        │       └── page.tsx        # Drag-and-drop CSV upload (react-dropzone)
        ├── components/
        │   ├── Sidebar.tsx         # Fixed left nav (220px), route-aware active state
        │   ├── TopBar.tsx          # Sticky header (system status, search, avatar)
        │   └── KPICard.tsx         # Animated metric card with sparkline
        └── lib/
            └── supabase.ts         # Singleton Supabase client (anon key only)
```

## Current State

**Visual shell is built and running.** All data on the dashboard is hardcoded/mock. No backend integration yet.

What exists:
- `/dashboard` — KPI cards, area chart placeholder, speed zones bar chart, player leaderboard, ACWR donut, session info, alert card. All mock data.
- `/upload` — Drag-and-drop zone (react-dropzone), file queue UI, 3-step guide. Files are held in local state only — no upload to Supabase yet.
- Sidebar nav with links to Dashboard, Upload, Players, Sessions, Reports, Settings (only Dashboard and Upload have pages)
- Dark sports analytics aesthetic: Bebas Neue headers, electric cyan accent (#00f0ff), noise texture, staggered entrance animations

What needs to be built:
1. **CSV parsing pipeline** — parse StatSports CSV, validate columns, store in Supabase
2. **Supabase schema** — tables for sessions, players, metrics (with RLS)
3. **Team Dashboard** — aggregate metrics by date and practice type (replace mock data)
4. **Positional Dashboard** — averages by position group (QB, RB, WR, DB, etc.)
5. **Player Profile** — individual metrics with 7-day rolling averages
6. **Weekly Progression** — planned vs. actual training load over the season

## CSV Columns (StatSports Apex Export)

Key columns: `Session Date`, `Session Title`, `Player Name`, `Player Primary Position`, `Total Distance`, `Max Speed`, `High Speed Running (Relative)`, `HSR Per Minute (Relative)`, `Accelerations (Relative)`, `Decelerations (Relative)`, `HML Distance`, `HMLD Per Minute`, `Fatigue Index`, `Speed Intensity`, `Dynamic Stress Load`, `Collision Load`, `Drill Title`, `Drill Start Time`, `Drill End Time`

Full CSV has 50+ columns including distance zones 1-6, acceleration/deceleration zone breakdowns, impact zones, mechanical load, and metabolic power.

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
