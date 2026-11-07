-- Ask tt.: the app-wide assistant. One running conversation per user, whose replies are cards
-- (a schedule, a to-do draft, steps, an idea plan...) that change nothing until the user clicks.
-- Someday items get a persona per type (goal, learn, idea) that the user can add notes to.
-- All additive, so older clients keep working.

-- What the user tells the assistant: "about" applies everywhere, the rest to one Someday type.
-- Shape: packages/shared/src/schemas.ts (AssistantNotes).
alter table settings
  add column someday_assistant jsonb not null default '{}'::jsonb
    check (jsonb_typeof(someday_assistant) = 'object');

-- Extra instructions for one Someday item, on top of its type's.
alter table tasks
  add column assistant_note text check (assistant_note is null or char_length(assistant_note) <= 1000);

-- The conversation. Only the server writes it (service role), so every reply goes through the
-- AI limits and a user can't forge one. Users read their own rows. "New chat" soft-deletes.
create table assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- The user's text (assistant replies keep theirs in blocks).
  content text not null default '',
  -- Reply cards (AssistantBlock[]), with real ids: checked by the server before saving.
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  follow_ups jsonb not null default '[]'::jsonb check (jsonb_typeof(follow_ups) = 'array'),
  -- The item a message is about, e.g. sent from a Someday card.
  focus_task_id uuid references tasks on delete set null,
  -- Card actions already taken, keyed by part ("0:pick:1" -> the block's id), so cards stay done.
  resolved jsonb not null default '{}'::jsonb check (jsonb_typeof(resolved) = 'object'),
  status text not null default 'done' check (status in ('pending', 'done', 'error')),
  error text,
  -- When the reply was asked for; the background job only writes if it still matches.
  requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index assistant_messages_user_idx on assistant_messages (user_id, created_at);

create trigger assistant_messages_updated_at before update on assistant_messages
  for each row execute function set_updated_at();

alter table assistant_messages enable row level security;
create policy own_rows_read on assistant_messages for select using (user_id = auth.uid());

alter publication supabase_realtime add table assistant_messages;
