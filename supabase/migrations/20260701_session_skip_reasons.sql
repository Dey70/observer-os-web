create table if not exists session_skip_reasons (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  date       date        not null,
  reason     text        not null check (reason in ('fatigue','injury','busy','travel','motivation','weather','unknown')),
  created_at timestamptz not null default now(),
  unique(user_id, date)
);

create index if not exists session_skip_reasons_user_date_idx
  on session_skip_reasons(user_id, date desc);

alter table session_skip_reasons enable row level security;

create policy "Athletes manage own skip reasons"
  on session_skip_reasons for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
