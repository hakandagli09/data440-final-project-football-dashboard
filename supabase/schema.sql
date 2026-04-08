-- ============================================================================
-- Auto Athlete — Full Database Schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- ============================================================================

-- ─── 1. Players ─────────────────────────────────────────────────────────────
-- Central player registry. All test/session tables reference this.
CREATE TABLE players (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  position   text,            -- primary position (QB, RB, WR, TE, OL, DL, LB, DB)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_players_name ON players (name);
CREATE INDEX idx_players_position ON players (position);

-- ─── 2. Uploads (file provenance tracking) ─────────────────────────────────
-- Tracks every uploaded CSV file for the Data Management page.
-- Deleting an upload cascades to all rows it produced in the data tables.
CREATE TABLE uploads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     text NOT NULL,
  csv_type     text NOT NULL
                 CHECK (csv_type IN ('gps', 'jump', 'force_frame', 'nordbord')),
  uploaded_at  timestamptz DEFAULT now(),
  row_count    int,
  status       text DEFAULT 'success'
                 CHECK (status IN ('success', 'partial', 'error')),
  error_detail jsonb          -- skipped rows and reasons if partial/error
);

CREATE INDEX idx_uploads_type ON uploads (csv_type);
CREATE INDEX idx_uploads_date ON uploads (uploaded_at);

-- ─── 3. GPS Sessions (StatSports Apex) ─────────────────────────────────────
-- One row per player per drill per session. Source: raw_data_good.csv
CREATE TABLE gps_sessions (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  upload_id                       uuid REFERENCES uploads(id) ON DELETE CASCADE,
  session_date                    date NOT NULL,
  session_title                   text,
  drill_title                     text,
  drill_start_time                time,
  drill_end_time                  time,

  -- Distance metrics
  total_distance                  real,
  distance_zone_1                 real,
  distance_zone_2                 real,
  distance_zone_3                 real,
  distance_zone_4                 real,
  distance_zone_5                 real,
  distance_zone_6                 real,
  distance_zone_4_6               real,

  -- Speed metrics
  max_speed                       real,
  pct_max_speed                   real,
  high_speed_running              real,
  hsr_per_minute                  real,
  distance_per_min                real,
  speed_intensity                 real,

  -- Acceleration metrics
  accelerations                   real,
  accelerations_zone_3_6          real,
  accelerations_zone_4_6          real,
  accelerations_zone_5_6          real,
  player_max_accel                real,
  max_acceleration                real,
  accelerations_per_min           real,

  -- Deceleration metrics
  decelerations                   real,
  decelerations_zone_3_6          real,
  decelerations_zone_4_6          real,
  decelerations_zone_5_6          real,
  player_max_decel                real,
  max_deceleration                real,
  decelerations_per_min           real,

  -- High Metabolic Load
  hml_distance                    real,
  hml_efforts_total_distance      real,
  hml_efforts                     real,
  hmld_per_minute                 real,

  -- Fatigue & Load
  fatigue_index                   real,
  dynamic_stress_load             real,
  dynamic_stress_load_zone_4_6    real,
  dynamic_stress_load_zone_5_6    real,
  total_loading                   real,

  -- Collision & Impact
  collisions                      real,
  collision_load                  real,
  lower_speed_loading             real,
  impacts_zone_3_6_relative       real,
  impacts_zone_4_6_absolute       real,
  impacts_zone_4_6_relative       real,
  impacts_zone_5_6_absolute       real,
  impacts_zone_5_6_relative       real,

  -- Mechanical & Metabolic
  mechanical_load                 real,
  total_metabolic_power           real,

  created_at                      timestamptz DEFAULT now()
);

CREATE INDEX idx_gps_player     ON gps_sessions (player_id);
CREATE INDEX idx_gps_date       ON gps_sessions (session_date);
CREATE INDEX idx_gps_title      ON gps_sessions (session_title);
CREATE INDEX idx_gps_date_player ON gps_sessions (session_date, player_id);

-- ─── 4. Jump Tests (Force Plate / CMJ) ─────────────────────────────────────
-- One row per player per test trial. Source: raw_data2_good.csv
CREATE TABLE jump_tests (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  upload_id                       uuid REFERENCES uploads(id) ON DELETE CASCADE,
  test_type                       text,              -- e.g. "CMJ"
  test_date                       date NOT NULL,
  test_time                       time,
  body_weight_kg                  real,
  reps                            integer,
  tags                            text,
  additional_load_lb              real,
  bodyweight_lbs                  real,

  -- Jump performance
  jump_height_in                  real,              -- inches (Imp-Mom)
  jump_height_cm                  real,              -- cm (Imp-Mom)
  rsi_modified                    real,              -- m/s
  peak_power_per_bm               real,              -- W/kg

  -- Concentric phase
  concentric_impulse              real,              -- N·s
  concentric_peak_force_per_bm    real,              -- N/kg

  -- Eccentric phase
  eccentric_deceleration_rfd      real,              -- N/s
  eccentric_braking_impulse       real,              -- N·s
  braking_phase_duration_ms       real,
  eccentric_peak_force_per_bm     real,              -- N/kg
  eccentric_peak_velocity         real,              -- m/s
  eccentric_duration_ms           real,

  -- Force at zero velocity
  force_at_zero_velocity          real,              -- N
  force_at_zero_velocity_per_bm   real,              -- N/kg

  -- Countermovement
  countermovement_depth_cm        real,

  -- Asymmetry (% with L/R indicator, stored as text)
  concentric_mean_force_asym      text,
  eccentric_braking_impulse_asym  text,
  eccentric_decel_rfd_asym        text,
  eccentric_peak_force_asym       text,

  created_at                      timestamptz DEFAULT now()
);

CREATE INDEX idx_jump_player    ON jump_tests (player_id);
CREATE INDEX idx_jump_date      ON jump_tests (test_date);
CREATE INDEX idx_jump_type      ON jump_tests (test_type);

-- ─── 5. ForceFrame Tests (Hip AD/AB) ───────────────────────────────────────
-- One row per player per direction per test. Source: raw_data3_good.csv
CREATE TABLE force_frame_tests (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  upload_id                       uuid REFERENCES uploads(id) ON DELETE CASCADE,
  test_date                       date NOT NULL,
  test_time                       time,
  device                          text,
  mode                            text,              -- e.g. "Bar + Frame"
  test_type                       text,              -- e.g. "Hip AD/AB"
  direction                       text,              -- "Pull" or "Squeeze"
  position                        text,              -- e.g. "Hip AD/AB - 45"
  l_reps                          integer,
  r_reps                          integer,

  -- Force
  l_max_force                     real,
  r_max_force                     real,
  max_imbalance                   real,
  l_max_ratio                     real,
  r_max_ratio                     real,
  l_avg_force                     real,
  r_avg_force                     real,
  avg_imbalance                   real,
  l_avg_ratio                     real,
  r_avg_ratio                     real,

  -- Impulse
  l_max_impulse                   real,
  r_max_impulse                   real,
  impulse_imbalance               real,

  -- Force per kg
  l_max_force_per_kg              real,
  r_max_force_per_kg              real,
  l_avg_force_per_kg              real,
  r_avg_force_per_kg              real,

  -- RFD (max)
  l_max_rfd                       real,
  r_max_rfd                       real,
  l_avg_rfd                       real,
  r_avg_rfd                       real,

  -- Time to peak force
  l_min_time_to_peak              real,
  r_min_time_to_peak              real,
  l_avg_time_to_peak              real,
  r_avg_time_to_peak              real,

  -- RFD at time windows (50ms–250ms)
  l_max_rfd_50ms                  real,
  r_max_rfd_50ms                  real,
  l_avg_rfd_50ms                  real,
  r_avg_rfd_50ms                  real,
  l_max_rfd_100ms                 real,
  r_max_rfd_100ms                 real,
  l_avg_rfd_100ms                 real,
  r_avg_rfd_100ms                 real,
  l_max_rfd_150ms                 real,
  r_max_rfd_150ms                 real,
  l_avg_rfd_150ms                 real,
  r_avg_rfd_150ms                 real,
  l_max_rfd_200ms                 real,
  r_max_rfd_200ms                 real,
  l_avg_rfd_200ms                 real,
  r_avg_rfd_200ms                 real,
  l_max_rfd_250ms                 real,
  r_max_rfd_250ms                 real,
  l_avg_rfd_250ms                 real,
  r_avg_rfd_250ms                 real,

  -- Impulse at time windows (50ms–250ms)
  l_max_impulse_50ms              real,
  r_max_impulse_50ms              real,
  l_avg_impulse_50ms              real,
  r_avg_impulse_50ms              real,
  l_max_impulse_100ms             real,
  r_max_impulse_100ms             real,
  l_avg_impulse_100ms             real,
  r_avg_impulse_100ms             real,
  l_max_impulse_150ms             real,
  r_max_impulse_150ms             real,
  l_avg_impulse_150ms             real,
  r_avg_impulse_150ms             real,
  l_max_impulse_200ms             real,
  r_max_impulse_200ms             real,
  l_avg_impulse_200ms             real,
  r_avg_impulse_200ms             real,
  l_max_impulse_250ms             real,
  r_max_impulse_250ms             real,
  l_avg_impulse_250ms             real,
  r_avg_impulse_250ms             real,

  notes                           text,
  created_at                      timestamptz DEFAULT now()
);

CREATE INDEX idx_ff_player      ON force_frame_tests (player_id);
CREATE INDEX idx_ff_date        ON force_frame_tests (test_date);
CREATE INDEX idx_ff_direction   ON force_frame_tests (direction);

-- ─── 6. NordBord Tests (Nordic Hamstring) ──────────────────────────────────
-- One row per player per test. Source: raw_data4_good.csv
CREATE TABLE nordbord_tests (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  upload_id                       uuid REFERENCES uploads(id) ON DELETE CASCADE,
  test_date                       date NOT NULL,
  test_time                       time,
  device                          text,
  test_type                       text,              -- e.g. "Nordic"
  l_reps                          integer,
  r_reps                          integer,

  -- Force
  l_max_force                     real,
  r_max_force                     real,
  max_imbalance                   real,

  -- Torque
  l_max_torque                    real,
  r_max_torque                    real,

  -- Average force
  l_avg_force                     real,
  r_avg_force                     real,
  avg_imbalance                   real,

  -- Impulse
  l_max_impulse                   real,
  r_max_impulse                   real,
  impulse_imbalance               real,

  -- Time to peak
  l_min_time_to_peak              real,
  r_min_time_to_peak              real,
  l_avg_time_to_peak              real,
  r_avg_time_to_peak              real,

  -- Force per kg
  l_max_force_per_kg              real,
  r_max_force_per_kg              real,
  l_avg_force_per_kg              real,
  r_avg_force_per_kg              real,

  -- RFD at time windows (50ms–250ms)
  l_max_rfd_50ms                  real,
  l_avg_rfd_50ms                  real,
  r_max_rfd_50ms                  real,
  r_avg_rfd_50ms                  real,
  l_max_rfd_100ms                 real,
  l_avg_rfd_100ms                 real,
  r_max_rfd_100ms                 real,
  r_avg_rfd_100ms                 real,
  l_max_rfd_150ms                 real,
  l_avg_rfd_150ms                 real,
  r_max_rfd_150ms                 real,
  r_avg_rfd_150ms                 real,
  l_max_rfd_200ms                 real,
  l_avg_rfd_200ms                 real,
  r_max_rfd_200ms                 real,
  r_avg_rfd_200ms                 real,
  l_max_rfd_250ms                 real,
  l_avg_rfd_250ms                 real,
  r_max_rfd_250ms                 real,
  r_avg_rfd_250ms                 real,

  -- Impulse at time windows (50ms–250ms)
  l_max_impulse_50ms              real,
  l_avg_impulse_50ms              real,
  r_max_impulse_50ms              real,
  r_avg_impulse_50ms              real,
  l_max_impulse_100ms             real,
  l_avg_impulse_100ms             real,
  r_max_impulse_100ms             real,
  r_avg_impulse_100ms             real,
  l_max_impulse_150ms             real,
  l_avg_impulse_150ms             real,
  r_max_impulse_150ms             real,
  r_avg_impulse_150ms             real,
  l_max_impulse_200ms             real,
  l_avg_impulse_200ms             real,
  r_max_impulse_200ms             real,
  r_avg_impulse_200ms             real,
  l_max_impulse_250ms             real,
  l_avg_impulse_250ms             real,
  r_max_impulse_250ms             real,
  r_avg_impulse_250ms             real,

  -- Torque per kg
  l_max_torque_per_kg             real,
  r_max_torque_per_kg             real,
  l_avg_torque_per_kg             real,
  r_avg_torque_per_kg             real,

  notes                           text,
  created_at                      timestamptz DEFAULT now()
);

CREATE INDEX idx_nb_player      ON nordbord_tests (player_id);
CREATE INDEX idx_nb_date        ON nordbord_tests (test_date);

-- ─── 7. Injuries ───────────────────────────────────────────────────────────
-- Tracks injuries, rehab status, and return-to-play progression.
-- Status workflow: injured → rehab → return_to_play → cleared
CREATE TABLE injuries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  injury_date     date NOT NULL,
  injury_type     text,            -- e.g. 'hamstring strain', 'groin pull'
  body_part       text,            -- e.g. 'left hamstring', 'right groin'
  status          text NOT NULL DEFAULT 'injured'
                    CHECK (status IN ('injured', 'rehab', 'return_to_play', 'cleared')),
  expected_return date,            -- optional estimated return date
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_inj_player ON injuries (player_id);
CREATE INDEX idx_inj_date   ON injuries (injury_date);
CREATE INDEX idx_inj_status ON injuries (status);

-- ─── 8. Row Level Security ─────────────────────────────────────────────────
-- Enable RLS on all tables. Allow read access via the anon key (public read).
-- Write access restricted to authenticated/service role only.

ALTER TABLE players            ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE jump_tests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE force_frame_tests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nordbord_tests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE injuries           ENABLE ROW LEVEL SECURITY;

-- Public read policies (anon key can SELECT)
CREATE POLICY "Allow public read" ON players           FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON uploads           FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON gps_sessions      FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON jump_tests        FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON force_frame_tests FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON nordbord_tests    FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON injuries          FOR SELECT USING (true);

-- Authenticated insert/update/delete (for the upload pipeline)
CREATE POLICY "Allow authenticated write" ON players           FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write" ON uploads           FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write" ON gps_sessions      FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write" ON jump_tests        FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write" ON force_frame_tests FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write" ON nordbord_tests    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write" ON injuries          FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Service role bypass (for server-side CSV ingestion via service key)
CREATE POLICY "Service role full access" ON players           FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON uploads           FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON gps_sessions      FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON jump_tests        FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON force_frame_tests FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON nordbord_tests    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON injuries          FOR ALL USING (auth.role() = 'service_role');
