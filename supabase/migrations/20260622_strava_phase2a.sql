-- Phase 2A: Extend sessions table for Strava auto-created sessions

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT,
  ADD COLUMN IF NOT EXISTS distance_meters     FLOAT,
  ADD COLUMN IF NOT EXISTS pace_per_km_seconds INT,
  ADD COLUMN IF NOT EXISTS calories_burned     INT;

-- One session per Strava activity per user.
-- NULL strava_activity_id (manual sessions) are excluded so they can coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_strava_activity_unique
  ON sessions (user_id, strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;
