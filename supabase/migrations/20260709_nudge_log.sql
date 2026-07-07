-- Tracks which contextual nudge notifications have already been sent to a
-- user today, so the cron trigger (src/app/api/cron/nudge/route.ts) never
-- double-sends within the same day/category. Written only via the
-- service-role client (no user session involved), so RLS stays enabled
-- with no policies — normal user sessions get zero access.
CREATE TABLE IF NOT EXISTS nudge_log (
  id       BIGSERIAL PRIMARY KEY,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'checkin', 'water_1', 'nutrition_lunch', 'water_2', 'nutrition_dinner', 'session'
  )),
  date     DATE NOT NULL,
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, category, date)
);

ALTER TABLE nudge_log ENABLE ROW LEVEL SECURITY;
