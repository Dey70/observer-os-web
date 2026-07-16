-- ══════════════════════════════════════════════════════
--  Observer OS — Global Foods Schema
--  Run AFTER user_foods_v2.sql
--
--  A shared, admin-curated food database available to every user —
--  the fix for the app's weak generic nutrition data on Indian dishes.
--  Personal food memory (user_foods) still exists per-user on top of this;
--  this table is the common layer everyone benefits from.
-- ══════════════════════════════════════════════════════

-- ── Admin allowlist ──────────────────────────────────────────────────────────
-- Deliberately minimal: no client-facing insert/update/delete policy, so the
-- only way to grant admin is running SQL directly in the Supabase SQL editor
-- (or via the service role), which bypasses RLS anyway.
CREATE TABLE IF NOT EXISTS app_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;

-- Each user can only check their own admin status (used to gate the
-- Global Foods admin UI client-side).
CREATE POLICY "app_admins_select_self" ON app_admins
  FOR SELECT USING (auth.uid() = user_id);

-- Seed the initial admin by email so this script is runnable as-is.
INSERT INTO app_admins (user_id)
SELECT id FROM auth.users WHERE email = 'rajdeep.x70@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- ── Global food database ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS global_foods (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT     NOT NULL UNIQUE,   -- normalized query string
  aliases           TEXT[]   NOT NULL DEFAULT '{}',
  serving_desc      TEXT     NOT NULL DEFAULT '1 serving',
  serving_grams     REAL     NOT NULL DEFAULT 100,
  calories_per_100g REAL     NOT NULL,
  protein_per_100g  REAL     NOT NULL DEFAULT 0,
  carbs_per_100g    REAL     NOT NULL DEFAULT 0,
  fat_per_100g      REAL     NOT NULL DEFAULT 0,
  fiber_per_100g    REAL     NOT NULL DEFAULT 0,
  times_used        INTEGER  NOT NULL DEFAULT 0,
  confidence        TEXT     NOT NULL DEFAULT 'verified'
    CHECK (confidence IN ('verified', 'imported')),
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE global_foods ENABLE ROW LEVEL SECURITY;

-- Every signed-in user can read the shared database — this is the whole point.
CREATE POLICY "global_foods_select_all" ON global_foods
  FOR SELECT TO authenticated USING (true);

-- Only admins can write to it.
CREATE POLICY "global_foods_admin_insert" ON global_foods
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid()));

CREATE POLICY "global_foods_admin_update" ON global_foods
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid()));

CREATE POLICY "global_foods_admin_delete" ON global_foods
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_global_foods_name ON global_foods (name);

-- ── Migrate the admin's existing personal foods into the shared table ───────
-- Promotes what's already been taught/imported (e.g. corrected Indian dishes)
-- so every user benefits immediately. 'learned' entries are promoted to
-- 'verified' since migrating them is a deliberate curation decision.
INSERT INTO global_foods (
  name, aliases, serving_desc, serving_grams,
  calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g,
  times_used, confidence, created_by
)
SELECT
  uf.name, uf.aliases, uf.serving_desc, uf.serving_grams,
  uf.calories_per_100g, uf.protein_per_100g, uf.carbs_per_100g, uf.fat_per_100g, uf.fiber_per_100g,
  uf.times_used,
  CASE WHEN uf.confidence = 'imported' THEN 'imported' ELSE 'verified' END,
  uf.user_id
FROM user_foods uf
WHERE uf.user_id = (SELECT id FROM auth.users WHERE email = 'rajdeep.x70@gmail.com')
ON CONFLICT (name) DO NOTHING;

-- ── Extend nutrition_logs to accept global-sourced entries ──────────────────
ALTER TABLE nutrition_logs DROP CONSTRAINT IF EXISTS nutrition_logs_source_check;
ALTER TABLE nutrition_logs ADD CONSTRAINT nutrition_logs_source_check
  CHECK (source IN ('off', 'usda', 'ai', 'manual', 'user', 'global'));
