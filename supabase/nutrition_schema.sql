-- ══════════════════════════════════════════════════════
--  Observer OS — Nutrition Feature Schema
--  Run in: Supabase Dashboard → SQL Editor → New Query
--  (Run AFTER the base schema.sql)
-- ══════════════════════════════════════════════════════

-- Extend profiles with fields needed for BMR/TDEE calculation
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IN ('male', 'female')) DEFAULT 'male';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS height_cm REAL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nutrition_goal_type TEXT
  CHECK (nutrition_goal_type IN ('bulk', 'cut', 'maintain', 'recomp', 'endurance'))
  DEFAULT 'maintain';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auto_adjust_macros BOOLEAN DEFAULT true;

-- Cache table for parsed/estimated foods, keyed by normalized query text.
-- Avoids re-calling the AI for repeat items like "chicken biryani".
CREATE TABLE IF NOT EXISTS food_cache (
  id               BIGSERIAL PRIMARY KEY,
  query_normalized TEXT NOT NULL UNIQUE,
  source           TEXT NOT NULL CHECK (source IN ('off', 'usda', 'ai')),
  calories_per_100g REAL NOT NULL,
  protein_per_100g  REAL NOT NULL DEFAULT 0,
  carbs_per_100g    REAL NOT NULL DEFAULT 0,
  fat_per_100g      REAL NOT NULL DEFAULT 0,
  fiber_per_100g    REAL NOT NULL DEFAULT 0,
  last_used_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Individual logged food items. Grouped by meal_group_id so a single
-- "chicken sandwich, apple, coffee" input can be edited/removed per-item.
CREATE TABLE IF NOT EXISTS nutrition_logs (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_group_id  UUID NOT NULL DEFAULT gen_random_uuid(),
  date           DATE NOT NULL,
  logged_at      TIMESTAMPTZ DEFAULT NOW(),
  meal_type      TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')) DEFAULT 'snack',
  item_name      TEXT NOT NULL,
  portion_desc   TEXT,
  raw_input      TEXT,
  source         TEXT NOT NULL CHECK (source IN ('off', 'usda', 'ai', 'manual')) DEFAULT 'ai',
  confidence     TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')) DEFAULT 'medium',
  calories       REAL NOT NULL DEFAULT 0,
  protein        REAL NOT NULL DEFAULT 0,
  carbs          REAL NOT NULL DEFAULT 0,
  fat            REAL NOT NULL DEFAULT 0,
  fiber          REAL NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE nutrition_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_nutrition_logs" ON nutrition_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_nutrition_logs" ON nutrition_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_nutrition_logs" ON nutrition_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_nutrition_logs" ON nutrition_logs FOR DELETE USING (auth.uid() = user_id);

-- food_cache has no user_id — it's a shared lookup table, readable by any
-- authenticated user, writable only via server-side service calls (API routes
-- use the user's session but we still allow insert/update broadly since
-- it contains no personal data).
ALTER TABLE food_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_food_cache" ON food_cache FOR SELECT USING (true);
CREATE POLICY "insert_food_cache" ON food_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "update_food_cache" ON food_cache FOR UPDATE USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date  ON nutrition_logs (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_meal_group ON nutrition_logs (meal_group_id);
CREATE INDEX IF NOT EXISTS idx_food_cache_query          ON food_cache (query_normalized);