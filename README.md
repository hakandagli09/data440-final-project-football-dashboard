# Auto Athlete — W&M Football Performance Dashboard

DATA 440 final project. Web app built for Brian Kish (Strength & Conditioning coach,
William & Mary Football) that automates a 5-hour manual Excel workflow. Brian
exports CSVs from his athlete-monitoring systems (StatSports GPS, ForceDecks
CMJ, ForceFrame hip AD/AB, NordBord hamstring) and the app generates a coach-
facing performance dashboard automatically.

## Stack

- **Next.js 14** (App Router) on Vercel
- **Supabase** (Postgres + RLS + storage)
- **Tremor** + custom Tailwind tokens (dark sports-analytics theme)
- **Google AI Studio (Gemini)** for the in-app chat assistant

## Repository layout

```
/
├── auto-athlete/          # Next.js app (everything that ships to Vercel)
├── data/                  # Sample CSV exports for development
├── supabase/schema.sql    # Run once in the Supabase SQL Editor
└── CLAUDE.md              # Full project spec and feature requirements
```

## Local setup

The deployed Vercel build runs against Brian's private Supabase project. To run
the app locally against your **own** data, you'll need a free Supabase project
and a Google AI Studio API key.

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd data440-final-project-football-dashboard/auto-athlete
   npm install
   ```

2. **Provision Supabase**
   - Create a new project at [supabase.com](https://supabase.com).
   - Open the SQL Editor and run the contents of `supabase/schema.sql` (creates
     all tables, indexes, RLS policies, and helper views).

3. **Get a Google AI Studio key**
   - Visit [aistudio.google.com](https://aistudio.google.com) and create an API
     key (free tier is sufficient).

4. **Create `.env.local`** in `auto-athlete/`
   ```bash
   cp .env.local.example .env.local
   ```
   Then fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project Settings → API → URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API → anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → service_role key
     *(server-only; required for the upload route)*
   - `GOOGLE_API_KEY` — your Google AI Studio key
   - `GOOGLE_MODEL_ID` — e.g. `gemini-3.1-pro-preview`

5. **Run the dev server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

6. **Upload sample data** (optional)
   The `data/` folder contains anonymized CSV exports. Drop them on the `/upload`
   page to populate the dashboard with realistic data.

## Deploying

`auto-athlete/` is the Vercel project root. Set the same five environment
variables in **Project Settings → Environment Variables** on Vercel — never
commit them. `.env*.local` is already in `.gitignore`.

## Reference

Full feature requirements, data-source documentation, and design system are in
`CLAUDE.md` at the repo root.
