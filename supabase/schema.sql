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

-- ─── 8. Chat Analytics Views ────────────────────────────────────────────────
-- Curated, read-only analytics views for the AI assistant. These flatten the
-- most useful surfaces so chat tools can query stable columns instead of raw
-- table shapes.

CREATE OR REPLACE VIEW chat_gps_daily AS
WITH latest_status AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    status,
    expected_return
  FROM injuries
  ORDER BY player_id, updated_at DESC
)
SELECT
  g.session_date,
  g.player_id,
  p.name AS player_name,
  COALESCE(p.position, '—') AS position,
  CASE
    WHEN upper(COALESCE(p.position, '')) IN ('QB', 'RB', 'WR', 'TE', 'DB', 'CB', 'S', 'FS', 'SS', 'LB', 'ILB', 'OLB', 'EDGE', 'DE', 'NT') THEN 'skills_mids'
    WHEN upper(COALESCE(p.position, '')) IN ('OL', 'DL', 'OT', 'OG', 'C', 'LT', 'RT', 'LG', 'RG', 'DT') THEN 'bigs'
    WHEN upper(COALESCE(p.position, '')) LIKE '%EDGE%' THEN 'skills_mids'
    WHEN upper(COALESCE(p.position, '')) LIKE '%LB%' THEN 'skills_mids'
    WHEN upper(COALESCE(p.position, '')) LIKE '%DB%' THEN 'skills_mids'
    WHEN upper(COALESCE(p.position, '')) LIKE '%OL%' THEN 'bigs'
    WHEN upper(COALESCE(p.position, '')) LIKE '%DL%' THEN 'bigs'
    ELSE 'other'
  END AS position_group,
  COALESCE(latest_status.status, 'cleared') AS status,
  MAX(g.session_title) AS session_title,
  string_agg(DISTINCT NULLIF(g.drill_title, ''), ', ') AS drill_titles,
  SUM(COALESCE(g.total_distance, 0))::real AS total_distance,
  SUM(COALESCE(g.high_speed_running, 0))::real AS high_speed_running,
  SUM(COALESCE(g.distance_zone_6, 0))::real AS distance_zone_6,
  SUM(COALESCE(g.dynamic_stress_load, 0))::real AS dynamic_stress_load,
  SUM(COALESCE(g.accelerations_zone_4_6, 0))::real AS accelerations_zone_4_6,
  SUM(COALESCE(g.decelerations_zone_4_6, 0))::real AS decelerations_zone_4_6,
  SUM(COALESCE(g.accelerations_zone_4_6, 0) + COALESCE(g.decelerations_zone_4_6, 0))::real AS accel_decel,
  SUM(COALESCE(g.hml_efforts, 0))::real AS hml_efforts,
  SUM(COALESCE(g.collision_load, 0))::real AS collision_load,
  SUM(COALESCE(g.hml_distance, 0))::real AS hml_distance,
  AVG(COALESCE(g.hmld_per_minute, 0))::real AS hmld_per_minute,
  AVG(COALESCE(g.fatigue_index, 0))::real AS fatigue_index,
  SUM(COALESCE(g.lower_speed_loading, 0))::real AS lower_speed_loading,
  MAX(COALESCE(g.max_speed, 0))::real AS max_speed,
  MAX(COALESCE(g.pct_max_speed, 0))::real AS pct_max_speed
FROM gps_sessions g
JOIN players p ON p.id = g.player_id
LEFT JOIN latest_status ON latest_status.player_id = g.player_id
GROUP BY
  g.session_date,
  g.player_id,
  p.name,
  p.position,
  COALESCE(latest_status.status, 'cleared');

CREATE OR REPLACE VIEW chat_jump_latest AS
WITH latest_status AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    status
  FROM injuries
  ORDER BY player_id, updated_at DESC
),
latest_jump AS (
  SELECT DISTINCT ON (j.player_id)
    j.player_id,
    p.name AS player_name,
    COALESCE(p.position, '—') AS position,
    j.test_date,
    j.jump_height_cm,
    j.rsi_modified,
    j.peak_power_per_bm,
    j.concentric_peak_force_per_bm,
    j.eccentric_braking_impulse,
    j.eccentric_deceleration_rfd,
    j.eccentric_duration_ms,
    j.countermovement_depth_cm,
    j.concentric_mean_force_asym,
    j.eccentric_braking_impulse_asym,
    j.eccentric_decel_rfd_asym,
    j.eccentric_peak_force_asym,
    j.braking_phase_duration_ms
  FROM jump_tests j
  JOIN players p ON p.id = j.player_id
  ORDER BY j.player_id, j.test_date DESC, j.created_at DESC
)
SELECT
  latest_jump.player_id,
  latest_jump.player_name,
  latest_jump.position,
  CASE
    WHEN upper(COALESCE(latest_jump.position, '')) IN ('QB', 'RB', 'WR', 'TE', 'DB', 'CB', 'S', 'FS', 'SS', 'LB', 'ILB', 'OLB', 'EDGE', 'DE', 'NT') THEN 'skills_mids'
    WHEN upper(COALESCE(latest_jump.position, '')) IN ('OL', 'DL', 'OT', 'OG', 'C', 'LT', 'RT', 'LG', 'RG', 'DT') THEN 'bigs'
    WHEN upper(COALESCE(latest_jump.position, '')) LIKE '%EDGE%' THEN 'skills_mids'
    WHEN upper(COALESCE(latest_jump.position, '')) LIKE '%LB%' THEN 'skills_mids'
    WHEN upper(COALESCE(latest_jump.position, '')) LIKE '%DB%' THEN 'skills_mids'
    WHEN upper(COALESCE(latest_jump.position, '')) LIKE '%OL%' THEN 'bigs'
    WHEN upper(COALESCE(latest_jump.position, '')) LIKE '%DL%' THEN 'bigs'
    ELSE 'other'
  END AS position_group,
  COALESCE(latest_status.status, 'cleared') AS status,
  latest_jump.test_date,
  latest_jump.jump_height_cm,
  latest_jump.rsi_modified,
  latest_jump.peak_power_per_bm,
  latest_jump.concentric_peak_force_per_bm,
  latest_jump.eccentric_braking_impulse,
  latest_jump.eccentric_deceleration_rfd,
  latest_jump.eccentric_duration_ms,
  latest_jump.countermovement_depth_cm,
  latest_jump.concentric_mean_force_asym,
  latest_jump.eccentric_braking_impulse_asym,
  latest_jump.eccentric_decel_rfd_asym,
  latest_jump.eccentric_peak_force_asym,
  latest_jump.braking_phase_duration_ms
FROM latest_jump
LEFT JOIN latest_status ON latest_status.player_id = latest_jump.player_id;

CREATE OR REPLACE VIEW chat_risk_signals AS
WITH latest_gps AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    player_name,
    position,
    position_group,
    status,
    session_date,
    max_speed
  FROM chat_gps_daily
  ORDER BY player_id, session_date DESC
),
all_time_max AS (
  SELECT
    player_id,
    MAX(COALESCE(max_speed, 0))::real AS all_time_max_speed
  FROM gps_sessions
  GROUP BY player_id
),
exposure_dates AS (
  SELECT
    g.player_id,
    MAX(
      CASE
        WHEN max_by_player.all_time_max_speed > 0
          AND COALESCE(g.max_speed, 0) >= max_by_player.all_time_max_speed * 0.9
        THEN g.session_date
        ELSE NULL
      END
    ) AS last_90_date,
    MAX(
      CASE
        WHEN max_by_player.all_time_max_speed > 0
          AND COALESCE(g.max_speed, 0) >= max_by_player.all_time_max_speed * 0.85
        THEN g.session_date
        ELSE NULL
      END
    ) AS last_85_date
  FROM gps_sessions g
  JOIN all_time_max max_by_player ON max_by_player.player_id = g.player_id
  GROUP BY g.player_id
),
latest_force_frame AS (
  SELECT DISTINCT ON (f.player_id)
    f.player_id,
    GREATEST(COALESCE(f.l_max_force, 0), COALESCE(f.r_max_force, 0))::real AS groin_squeeze_force,
    f.max_imbalance::real AS force_frame_asymmetry_pct
  FROM force_frame_tests f
  WHERE lower(COALESCE(f.direction, '')) = 'squeeze'
  ORDER BY f.player_id, f.test_date DESC, f.created_at DESC
),
latest_nordbord AS (
  SELECT DISTINCT ON (n.player_id)
    n.player_id,
    GREATEST(COALESCE(n.l_max_force, 0), COALESCE(n.r_max_force, 0))::real AS hamstring_iso_force,
    n.max_imbalance::real AS nordbord_asymmetry_pct
  FROM nordbord_tests n
  ORDER BY n.player_id, n.test_date DESC, n.created_at DESC
)
SELECT
  latest_gps.player_id,
  latest_gps.player_name,
  latest_gps.position,
  latest_gps.position_group,
  latest_gps.status,
  latest_gps.session_date AS latest_session_date,
  all_time_max.all_time_max_speed,
  CASE
    WHEN exposure_dates.last_90_date IS NULL THEN NULL
    ELSE (latest_gps.session_date - exposure_dates.last_90_date)::integer
  END AS days_since_90,
  CASE
    WHEN exposure_dates.last_85_date IS NULL THEN NULL
    ELSE (latest_gps.session_date - exposure_dates.last_85_date)::integer
  END AS days_since_85,
  chat_jump_latest.jump_height_cm,
  chat_jump_latest.rsi_modified,
  chat_jump_latest.concentric_peak_force_per_bm,
  chat_jump_latest.eccentric_braking_impulse,
  chat_jump_latest.eccentric_deceleration_rfd,
  chat_jump_latest.eccentric_duration_ms,
  chat_jump_latest.countermovement_depth_cm,
  chat_jump_latest.braking_phase_duration_ms,
  latest_force_frame.groin_squeeze_force,
  latest_nordbord.hamstring_iso_force,
  latest_force_frame.force_frame_asymmetry_pct,
  latest_nordbord.nordbord_asymmetry_pct,
  (
    CASE
      WHEN exposure_dates.last_90_date IS NOT NULL
        AND (latest_gps.session_date - exposure_dates.last_90_date) >= 7
      THEN 1 ELSE 0
    END
    +
    CASE
      WHEN exposure_dates.last_85_date IS NOT NULL
        AND (latest_gps.session_date - exposure_dates.last_85_date) >= 10
      THEN 1 ELSE 0
    END
    +
    CASE WHEN COALESCE(latest_force_frame.force_frame_asymmetry_pct, 0) > 10 THEN 1 ELSE 0 END
    +
    CASE WHEN COALESCE(latest_nordbord.nordbord_asymmetry_pct, 0) > 10 THEN 1 ELSE 0 END
  )::integer AS flag_count
FROM latest_gps
LEFT JOIN all_time_max ON all_time_max.player_id = latest_gps.player_id
LEFT JOIN exposure_dates ON exposure_dates.player_id = latest_gps.player_id
LEFT JOIN chat_jump_latest ON chat_jump_latest.player_id = latest_gps.player_id
LEFT JOIN latest_force_frame ON latest_force_frame.player_id = latest_gps.player_id
LEFT JOIN latest_nordbord ON latest_nordbord.player_id = latest_gps.player_id;

CREATE OR REPLACE VIEW chat_players AS
WITH latest_status AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    status,
    expected_return
  FROM injuries
  ORDER BY player_id, updated_at DESC
),
latest_sessions AS (
  SELECT
    player_id,
    MAX(session_date) AS latest_session_date
  FROM gps_sessions
  GROUP BY player_id
)
SELECT
  p.id,
  p.name,
  COALESCE(p.position, '—') AS position,
  CASE
    WHEN upper(COALESCE(p.position, '')) IN ('QB', 'RB', 'WR', 'TE', 'DB', 'CB', 'S', 'FS', 'SS', 'LB', 'ILB', 'OLB', 'EDGE', 'DE', 'NT') THEN 'skills_mids'
    WHEN upper(COALESCE(p.position, '')) IN ('OL', 'DL', 'OT', 'OG', 'C', 'LT', 'RT', 'LG', 'RG', 'DT') THEN 'bigs'
    WHEN upper(COALESCE(p.position, '')) LIKE '%EDGE%' THEN 'skills_mids'
    WHEN upper(COALESCE(p.position, '')) LIKE '%LB%' THEN 'skills_mids'
    WHEN upper(COALESCE(p.position, '')) LIKE '%DB%' THEN 'skills_mids'
    WHEN upper(COALESCE(p.position, '')) LIKE '%OL%' THEN 'bigs'
    WHEN upper(COALESCE(p.position, '')) LIKE '%DL%' THEN 'bigs'
    ELSE 'other'
  END AS position_group,
  COALESCE(latest_status.status, 'cleared') AS status,
  latest_status.expected_return,
  latest_sessions.latest_session_date,
  chat_risk_signals.days_since_90,
  chat_risk_signals.days_since_85,
  COALESCE(chat_risk_signals.flag_count, 0) AS flag_count
FROM players p
LEFT JOIN latest_status ON latest_status.player_id = p.id
LEFT JOIN latest_sessions ON latest_sessions.player_id = p.id
LEFT JOIN chat_risk_signals ON chat_risk_signals.player_id = p.id;

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
