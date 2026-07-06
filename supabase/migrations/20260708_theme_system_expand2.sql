-- Expands the theme CHECK constraint for 7 more themes (four seasons plus
-- Stranger Things, Marvel, and Lord of the Mysteries). Keep this in sync
-- with THEMES in src/lib/themes.ts.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_theme_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_theme_check
  CHECK (theme IN (
    'dark', 'light', 'indian', 'japanese', 'scandinavian', 'nord', 'dracula',
    'spring', 'summer', 'autumn', 'winter',
    'stranger-things', 'marvel', 'lord-of-mysteries'
  ));
