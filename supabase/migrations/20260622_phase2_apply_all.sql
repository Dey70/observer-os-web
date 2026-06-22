-- Phase 2 — single idempotent apply script
-- Run this once in the Supabase SQL editor.
-- Every statement uses IF NOT EXISTS / IF EXISTS guards so it is safe to
-- run on a database that already has some of these changes partially applied.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. SESSIONS — add Strava columns (Phase 2A)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS strava_activity_id  BIGINT,
  ADD COLUMN IF NOT EXISTS distance_meters      FLOAT,
  ADD COLUMN IF NOT EXISTS pace_per_km_seconds  INT,
  ADD COLUMN IF NOT EXISTS calories_burned      INT;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_strava_activity_unique
  ON sessions (user_id, strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. TRAINING_METRICS — create table + strava dedup column (Phase 2B + dedup)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS training_metrics (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id           INT  NOT NULL REFERENCES sessions(id)   ON DELETE CASCADE,
  activity_date        DATE NOT NULL,
  trimp                REAL NOT NULL DEFAULT 0,
  tss                  REAL NOT NULL DEFAULT 0,
  pace_seconds_per_km  INT,
  load_score           REAL NOT NULL DEFAULT 0,
  source               TEXT NOT NULL DEFAULT 'strava',
  created_at           TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT training_metrics_session_unique UNIQUE (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS training_metrics_user_date_idx
  ON training_metrics (user_id, activity_date DESC);

ALTER TABLE training_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_metrics: user owns row" ON training_metrics;
CREATE POLICY "training_metrics: user owns row"
  ON training_metrics FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add strava_activity_id to training_metrics for idempotent upserts
ALTER TABLE training_metrics
  ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS training_metrics_strava_unique
  ON training_metrics (user_id, strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. DEDUP — remove duplicate sessions + orphaned metrics
-- ════════════════════════════════════════════════════════════════════════════

-- Backfill strava_activity_id on sessions that were created before Phase 2A
-- was applied (those rows have strava_activity_id = NULL). Match by date against
-- running_activities so the dedup and training_metrics backfill can key off them.
-- Guards:
--   NOT EXISTS  — skip if a newer session already owns this strava_activity_id
--   MIN(id)     — only update the earliest duplicate session per date (avoids
--                 violating the partial unique index when multiple NULL sessions
--                 exist for the same date)
UPDATE sessions s
SET    strava_activity_id = ra.strava_activity_id
FROM   running_activities ra
WHERE  s.user_id  = ra.user_id
  AND  s.date     = ra.activity_date
  AND  s.type     = 'run'
  AND  s.strava_activity_id IS NULL
  AND  ra.activity_type IN ('Run', 'TrailRun', 'VirtualRun')
  AND  NOT EXISTS (
         SELECT 1 FROM sessions s2
         WHERE  s2.user_id            = ra.user_id
           AND  s2.strava_activity_id = ra.strava_activity_id
       )
  AND  s.id = (
         SELECT MIN(s2.id)
         FROM   sessions s2
         WHERE  s2.user_id = ra.user_id
           AND  s2.date    = ra.activity_date
           AND  s2.type    = 'run'
           AND  s2.strava_activity_id IS NULL
       );

-- Backfill strava_activity_id on any existing training_metrics rows
UPDATE training_metrics tm
SET    strava_activity_id = s.strava_activity_id
FROM   sessions s
WHERE  tm.session_id       = s.id
  AND  s.strava_activity_id IS NOT NULL
  AND  tm.strava_activity_id IS NULL;

-- Remove duplicate sessions, keeping the earliest per Strava activity
DELETE FROM sessions
WHERE strava_activity_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM   sessions
    WHERE  strava_activity_id IS NOT NULL
    GROUP BY user_id, strava_activity_id
  );

-- Remove any remaining duplicate training_metrics per session
DELETE FROM training_metrics
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, session_id) id
  FROM   training_metrics
  ORDER BY user_id, session_id, created_at
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. PROFILES — add weekly targets + threshold pace (Phase 2B)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS weekly_run_km_target    REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_run_count_target INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_gym_target       INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS threshold_pace_seconds  INT  DEFAULT 330;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. PERSONAL_RECORDS — create table with unique constraint
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS personal_records (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  metric     TEXT NOT NULL,
  value      REAL NOT NULL,
  date       DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT personal_records_unique UNIQUE (user_id, type, metric)
);

CREATE INDEX IF NOT EXISTS personal_records_user_type_idx
  ON personal_records (user_id, type);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_records: user owns row" ON personal_records;
CREATE POLICY "personal_records: user owns row"
  ON personal_records FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
