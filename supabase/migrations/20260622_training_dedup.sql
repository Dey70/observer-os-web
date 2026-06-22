-- Phase 2B stabilisation: idempotent training_metrics deduplication
--
-- Safe to run even if Phase 2A (sessions.strava_activity_id column) has not
-- been applied yet — steps 2 and 3 are wrapped in a DO block that checks
-- for the column's existence before executing.

-- ── 1. Add strava_activity_id to training_metrics ───────────────────────────
ALTER TABLE training_metrics
  ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS training_metrics_strava_unique
  ON training_metrics (user_id, strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;

-- ── 2 & 3. Backfill + deduplicate sessions (skipped if Phase 2A not applied) ─
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name  = 'sessions'
      AND  column_name = 'strava_activity_id'
  ) THEN

    -- Backfill strava_activity_id on training_metrics from the sessions table.
    -- Only affects rows created before this column existed on training_metrics.
    UPDATE training_metrics tm
    SET    strava_activity_id = s.strava_activity_id
    FROM   sessions s
    WHERE  tm.session_id = s.id
      AND  s.strava_activity_id IS NOT NULL
      AND  tm.strava_activity_id IS NULL;

    -- Remove duplicate sessions (keep earliest id per strava_activity_id).
    -- ON DELETE CASCADE on training_metrics.session_id cleans up orphaned rows.
    DELETE FROM sessions
    WHERE strava_activity_id IS NOT NULL
      AND id NOT IN (
        SELECT MIN(id)
        FROM   sessions
        WHERE  strava_activity_id IS NOT NULL
        GROUP BY user_id, strava_activity_id
      );

  END IF;
END $$;

-- ── 4. Remove any remaining duplicate training_metrics per session ───────────
DELETE FROM training_metrics
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, session_id) id
  FROM   training_metrics
  ORDER BY user_id, session_id, created_at
);
