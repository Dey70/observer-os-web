-- Observer Memory — persistent fact store for the AI Coach.
--
-- Separates "memory" (distilled facts) from "conversation history"
-- (raw transcript). The coach builds context from structured facts,
-- not by replaying previous messages.
--
-- Two logical layers:
--   source = 'system'  → computed/seeded from structured athlete data
--   source = 'ai'      → extracted by the model from conversation exchanges
--   source = 'user'    → explicitly stated by the athlete

create table if not exists coach_memory (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  category    text        not null check (category in (
                'biometric', 'pattern', 'preference',
                'milestone', 'flag', 'training', 'goal'
              )),
  key         text        not null,   -- snake_case, unique per (user, category)
  value       text        not null,   -- human-readable fact injected into prompts
  confidence  float       not null default 1.0 check (confidence between 0 and 1),
  source      text        not null check (source in ('system', 'ai', 'user')),
  expires_at  timestamptz,            -- null = permanent
  updated_at  timestamptz not null default now(),

  constraint coach_memory_unique unique (user_id, category, key)
);

create index if not exists coach_memory_user_idx
  on coach_memory(user_id, category);

alter table coach_memory enable row level security;

create policy "Athletes manage own memory"
  on coach_memory for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
