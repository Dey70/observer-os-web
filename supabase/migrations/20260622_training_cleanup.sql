-- Training metrics cleanup: remove inflated rows from pre-Phase-2A NULL sessions
--
-- Root cause of ATL=168 / TSB=-133:
--   Sessions synced BEFORE the Phase 2A migration (which added strava_activity_id
--   to the sessions table) were stored with strava_activity_id = NULL.
--   After Phase 2A was applied, later syncs re-created those same sessions WITH
--   strava_activity_id set (because the existingIds dedup query uses
--   `IN (strava_activity_id, ...)` and NULL rows are invisible to IN filters).
--   Each Strava activity ended up with:
--     - 1 old session  (strava_activity_id IS NULL)  + its training_metrics row
--     - 1 new session  (strava_activity_id = X)      + its training_metrics row
--   buildDailyTSS() sums ALL training_metrics for a date → daily TSS is ≥ 2×,
--   which cascades into an inflated ATL EMA.
--
--   The previous dedup migration only removed sessions WHERE strava_activity_id
--   IS NOT NULL (step 3) and deduplicated training_metrics per session_id (step 4).
--   NULL sessions — and their training_metrics — survived both steps.
--
-- Fix: delete the stale Strava training_metrics rows that are linked to NULL sessions.
--   The next sync recreates clean rows using the idempotent strava_activity_id upsert.
--   Manual training_metrics (source = 'manual') are unaffected.

DELETE FROM training_metrics
WHERE  source = 'strava'
  AND  session_id IN (
         SELECT id
         FROM   sessions
         WHERE  strava_activity_id IS NULL
       );
