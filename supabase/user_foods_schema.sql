-- ══════════════════════════════════════════════════════
--  Observer OS — User Foods ("Teach Observer") Schema
--  Run AFTER nutrition_schema.sql
-- ══════════════════════════════════════════════════════

-- Personal food dictionary, keyed per user.
-- Highest priority in the lookup chain: always checked before
-- food_cache, OFF, USDA, or AI.
CREATE TABLE IF NOT EXISTS user_foods (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT     NOT NULL,          -- normalized query string
  aliases           TEXT[]   NOT NULL DEFAULT '{}',
  serving_desc      TEXT     NOT NULL DEFAULT '1 serving',
  serving_grams     REAL     NOT NULL DEFAULT 100,
  calories_per_100g REAL     NOT NULL,
  protein_per_100g  REAL     NOT NULL DEFAULT 0,
  carbs_per_100g    REAL     NOT NULL DEFAULT 0,
  fat_per_100g      REAL     NOT NULL DEFAULT 0,
  fiber_per_100g    REAL     NOT NULL DEFAULT 0,
  times_used        INTEGER  NOT NULL DEFAULT 1,
  confidence        TEXT     NOT NULL DEFAULT 'verified'
    CHECK (confidence IN ('verified', 'learned')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  last_used_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)
);

ALTER TABLE user_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_foods_select" ON user_foods FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_foods_insert" ON user_foods FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_foods_update" ON user_foods FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_foods_delete" ON user_foods FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_foods_lookup ON user_foods (user_id, name);

-- ── Extend nutrition_logs to accept user-verified entries ───────────────────
-- Widen the source CHECK to include 'user' (from user_foods).
ALTER TABLE nutrition_logs DROP CONSTRAINT IF EXISTS nutrition_logs_source_check;
ALTER TABLE nutrition_logs ADD CONSTRAINT nutrition_logs_source_check
  CHECK (source IN ('off', 'usda', 'ai', 'manual', 'user'));

-- Widen the confidence CHECK to include 'verified' and 'learned'.
ALTER TABLE nutrition_logs DROP CONSTRAINT IF EXISTS nutrition_logs_confidence_check;
ALTER TABLE nutrition_logs ADD CONSTRAINT nutrition_logs_confidence_check
  CHECK (confidence IN ('high', 'medium', 'low', 'verified', 'learned'));
