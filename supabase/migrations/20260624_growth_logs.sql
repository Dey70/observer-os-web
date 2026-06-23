-- Growth Logs — Observer's third performance pillar.
--
-- Tracks intellectual and skill-development work alongside physical training.
-- Provides the data layer for the Growth component of the Hybrid Athlete Score
-- and the Growth section of the Weekly Performance Review.
--
-- Categories:
--   study      — academic work, coursework, revision
--   project    — building, coding, creating output
--   learning   — books, courses, videos, structured learning
--   deep_work  — distraction-free focused blocks (any domain)
--
-- Backward compatibility: the existing sessions(type='study') rows remain valid.
-- The Growth score uses growth_logs when present; falls back to sessions otherwise.

create table if not exists growth_logs (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  date         date        not null,
  category     text        not null check (category in ('study', 'project', 'learning', 'deep_work')),
  title        text        not null,
  duration_min integer     not null check (duration_min > 0),
  focus_score  smallint    check (focus_score between 1 and 10),
  output_notes text,
  tags         text[],
  created_at   timestamptz not null default now()
);

create index if not exists growth_logs_user_date_idx
  on growth_logs(user_id, date desc);

alter table growth_logs enable row level security;

create policy "Athletes manage own growth logs"
  on growth_logs for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
