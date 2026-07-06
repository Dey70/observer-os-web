-- Expands the theme CHECK constraint added in 20260706_theme_system.sql
-- for four new themes. CHECK constraints can't be widened in place, so
-- drop and re-add. Keep this in sync with THEMES in src/lib/themes.ts.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_theme_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_theme_check
  CHECK (theme IN ('dark', 'light', 'indian', 'japanese', 'scandinavian', 'nord', 'dracula'));
