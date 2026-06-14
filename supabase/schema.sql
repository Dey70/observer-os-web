-- ══════════════════════════════════════════════════════
--  Observer OS — Supabase Schema
--  Run in: Supabase Dashboard → SQL Editor → New Query
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  sleep_hours   REAL NOT NULL DEFAULT 7,
  sleep_quality INTEGER NOT NULL CHECK (sleep_quality BETWEEN 1 AND 10),
  soreness      INTEGER NOT NULL CHECK (soreness BETWEEN 1 AND 10),
  fatigue       INTEGER NOT NULL CHECK (fatigue BETWEEN 1 AND 10),
  mood          INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 10),
  energy        INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 10),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('run', 'lift', 'study')),
  duration   INTEGER NOT NULL DEFAULT 0,
  rpe        INTEGER NOT NULL DEFAULT 5 CHECK (rpe BETWEEN 1 AND 10),
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weight_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  weight     REAL NOT NULL CHECK (weight > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS goals (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  target_value  REAL NOT NULL,
  current_value REAL NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT '',
  deadline      DATE,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_plans (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,
  plan         JSONB NOT NULL DEFAULT '[]',
  notes        TEXT NOT NULL DEFAULT '',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

-- Row Level Security
ALTER TABLE daily_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "select_daily_logs"     ON daily_logs     FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_daily_logs"     ON daily_logs     FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_daily_logs"     ON daily_logs     FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_daily_logs"     ON daily_logs     FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "select_sessions"       ON sessions       FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_sessions"       ON sessions       FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_sessions"       ON sessions       FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_sessions"       ON sessions       FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "select_weight_logs"    ON weight_logs    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_weight_logs"    ON weight_logs    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_weight_logs"    ON weight_logs    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_weight_logs"    ON weight_logs    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "select_goals"          ON goals          FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_goals"          ON goals          FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_goals"          ON goals          FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_goals"          ON goals          FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "select_training_plans" ON training_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_training_plans" ON training_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_training_plans" ON training_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_training_plans" ON training_plans FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs     (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_date   ON sessions       (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_weight_user_date     ON weight_logs    (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_goals_user_active    ON goals          (user_id, active);
CREATE INDEX IF NOT EXISTS idx_plans_user_week      ON training_plans (user_id, week_start DESC);