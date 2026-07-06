-- Apple Health step-count sync (fed by an iPhone Shortcuts automation via
-- /api/health/steps, authenticated with a static secret, not a user session)
-- Run this in Supabase SQL Editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS daily_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  steps       INT  NOT NULL,
  source      TEXT NOT NULL DEFAULT 'apple_health',
  synced_at   TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT daily_steps_user_date_unique UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS daily_steps_user_date
  ON daily_steps (user_id, date DESC);

ALTER TABLE daily_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_steps: user owns row"
  ON daily_steps FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
