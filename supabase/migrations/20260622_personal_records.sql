-- Personal Records table
-- Stores all-time bests per user/type/metric.
-- Used by prDetection.ts (manual sessions) and strava.ts Step 8 (Strava-derived bests).
-- The UNIQUE constraint on (user_id, type, metric) is required for idempotent upserts.

CREATE TABLE IF NOT EXISTS personal_records (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,   -- 'run' | 'lift' | 'study'
  metric     TEXT NOT NULL,   -- 'longest_run' | 'strava_best_pace' | etc.
  value      REAL NOT NULL,
  date       DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT personal_records_unique UNIQUE (user_id, type, metric)
);

CREATE INDEX IF NOT EXISTS personal_records_user_type_idx
  ON personal_records (user_id, type);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_records: user owns row"
  ON personal_records FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
