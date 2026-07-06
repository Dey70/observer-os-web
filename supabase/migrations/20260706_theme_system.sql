-- Full-aesthetic theme system: persist the user's selected theme so it
-- follows them across devices instead of living only in localStorage.
-- Keep this CHECK constraint in sync with THEMES in src/lib/themes.ts —
-- see the checklist comment at the top of that file when adding a theme.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'dark'
  CHECK (theme IN ('dark', 'light', 'indian'));
