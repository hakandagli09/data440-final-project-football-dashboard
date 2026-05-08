# Auto Athlete — W&M Football Performance Dashboard

DATA 440 final project. Web app built for Brian Sutton (Strength & Conditioning coach,
William & Mary Football) that automates a multi-hour manual Excel workflow. Brian
exports CSVs from his athlete-monitoring systems (StatSports GPS, ForceDecks
CMJ, ForceFrame hip AD/AB, NordBord hamstring) and the app generates a coach-
facing performance dashboard automatically.

## How To Run Locally

These instructions assume you have been added as a private collaborator and have the required environment variables.

### 1. Clone The Repository

```bash
git clone <repo-url>
cd data440-final-project-football-dashboard
```

### 2. Install Dependencies

```bash
cd auto-athlete
npm install
```

### 3. Add Environment Variables

Create `auto-athlete/.env.local` using the values provided privately:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_API_KEY=...
GOOGLE_MODEL_ID=...
```

There is also an example file at `auto-athlete/.env.local.example`.

### 4. Start The Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Optional Verification

```bash
npm run build
```

## Useful Paths

- App source: `auto-athlete/`
- Supabase schema: `supabase/schema.sql`
- Project/MVP notes: `CLAUDE.md`
- Sample CSVs: `data/`
