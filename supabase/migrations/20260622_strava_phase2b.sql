-- Phase 2B: Training Intelligence
-- training_metrics: one row per session, stores TSS/TRIMP for CTL/ATL/TSB computation

CREATE TABLE IF NOT EXISTS training_metrics (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id           INT  NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  activity_date        DATE NOT NULL,
  trimp                REAL NOT NULL DEFAULT 0,
  tss                  REAL NOT NULL DEFAULT 0,
  pace_seconds_per_km  INT,
  load_score           REAL NOT NULL DEFAULT 0,
  source               TEXT NOT NULL DEFAULT 'strava', -- 'strava' | 'manual'
  created_at           TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT training_metrics_session_unique UNIQUE (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS training_metrics_user_date_idx
  ON training_metrics (user_id, activity_date DESC);

ALTER TABLE training_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_metrics: user owns row"
  ON training_metrics FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Weekly training targets and threshold pace on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS weekly_run_km_target    REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_run_count_target INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_gym_target       INT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS threshold_pace_seconds  INT  DEFAULT 330; -- 5:30 /km
