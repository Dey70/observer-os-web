-- ══════════════════════════════════════════════════════
--  Observer OS — User Foods V2 Migration
--  Run in Supabase SQL editor AFTER user_foods_schema.sql
-- ══════════════════════════════════════════════════════

-- Extend user_foods.confidence to support CSV-imported foods.
ALTER TABLE user_foods DROP CONSTRAINT IF EXISTS user_foods_confidence_check;
ALTER TABLE user_foods ADD CONSTRAINT user_foods_confidence_check
  CHECK (confidence IN ('verified', 'learned', 'imported'));

-- Extend nutrition_logs.confidence to match.
ALTER TABLE nutrition_logs DROP CONSTRAINT IF EXISTS nutrition_logs_confidence_check;
ALTER TABLE nutrition_logs ADD CONSTRAINT nutrition_logs_confidence_check
  CHECK (confidence IN ('high', 'medium', 'low', 'verified', 'learned', 'imported'));
