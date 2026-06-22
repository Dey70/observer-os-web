-- Strava integration: connections and imported activities
-- Run this in Supabase SQL Editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS strava_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id      BIGINT NOT NULL,
  athlete_name    TEXT,
  athlete_avatar  TEXT,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  expires_at      BIGINT NOT NULL,          -- Unix timestamp (seconds)
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT strava_connections_user_unique UNIQUE (user_id)
);

ALTER TABLE strava_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strava_connections: user owns row"
  ON strava_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

---

CREATE TABLE IF NOT EXISTS running_activities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strava_activity_id    BIGINT NOT NULL,
  activity_name         TEXT NOT NULL,
  activity_type         TEXT NOT NULL DEFAULT 'Run',
  distance_meters       FLOAT NOT NULL DEFAULT 0,
  moving_time_seconds   INT   NOT NULL DEFAULT 0,
  elapsed_time_seconds  INT   NOT NULL DEFAULT 0,
  calories              INT,
  average_speed         FLOAT,
  max_speed             FLOAT,
  elevation_gain        FLOAT,
  activity_date         DATE NOT NULL,
  source                TEXT NOT NULL DEFAULT 'strava',
  created_at            TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT running_activities_strava_unique UNIQUE (user_id, strava_activity_id)
);

CREATE INDEX IF NOT EXISTS running_activities_user_date
  ON running_activities (user_id, activity_date DESC);

ALTER TABLE running_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "running_activities: user owns row"
  ON running_activities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
