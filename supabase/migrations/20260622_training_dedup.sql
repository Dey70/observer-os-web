-- Phase 2B stabilisation: idempotent training_metrics deduplication
--
-- Root-cause: if the Phase 2A migration hadn't yet been applied when the first
-- Strava sync ran, the strava_activity_id column didn't exist on sessions.
-- The existingIds check returned 0, so every re-sync created duplicate sessions
-- (no unique constraint existed yet), each with its own training_metrics row.
-- Result: daily TSS was multiplied N× by N syncs → ATL/CTL wildly inflated.
--
-- This migration:
--  1. Adds strava_activity_id to training_metrics (nullable, for future dedup)
--  2. Adds a partial unique index so upsert can target strava_activity_id
--  3. Removes duplicate sessions caused by the bug (keeps earliest id per strava_activity_id)
--  4. The cascade on training_metrics removes orphaned metric rows automatically

-- ── 1. Add strava_activity_id to training_metrics ───────────────────────────
ALTER TABLE training_metrics
  ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS training_metrics_strava_unique
  ON training_metrics (user_id, strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;

-- ── 2. Backfill strava_activity_id from the sessions table ──────────────────
-- (Only affects rows created before this column existed on training_metrics)
UPDATE training_metrics tm
SET    strava_activity_id = s.strava_activity_id
FROM   sessions s
WHERE  tm.session_id = s.id
  AND  s.strava_activity_id IS NOT NULL
  AND  tm.strava_activity_id IS NULL;

-- ── 3. Remove duplicate sessions (keep earliest id per strava_activity_id) ──
-- Sessions created from the same Strava activity are true duplicates.
-- ON DELETE CASCADE on training_metrics.session_id handles cleanup automatically.
DELETE FROM sessions
WHERE strava_activity_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM   sessions
    WHERE  strava_activity_id IS NOT NULL
    GROUP BY user_id, strava_activity_id
  );

-- ── 4. Remove any remaining duplicate training_metrics per session ───────────
-- Belt-and-suspenders: the UNIQUE constraint should prevent this but clean up
-- any rows that slipped in before the constraint existed.
DELETE FROM training_metrics
WHERE id NOT IN (
  SELECT MIN(id)
  FROM   training_metrics
  GROUP BY user_id, session_id
);
