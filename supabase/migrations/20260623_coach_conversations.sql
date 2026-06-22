-- Coach conversation history for persistent chat memory.
-- Stores individual messages so the AI retains context across sessions.

create table if not exists coach_conversations (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  role       text        not null check (role in ('user', 'assistant')),
  content    text        not null,
  created_at timestamptz not null default now()
);

-- Index for efficient per-user history retrieval in chronological order
create index if not exists coach_conversations_user_created
  on coach_conversations(user_id, created_at desc);

alter table coach_conversations enable row level security;

create policy "Users can manage own conversations"
  on coach_conversations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
