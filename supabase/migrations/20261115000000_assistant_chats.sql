-- Ask tt. keeps several chats instead of one running conversation. "New chat" starts a fresh
-- one and keeps the old; past chats can be reopened, renamed or deleted. Additive: messages
-- get a nullable chat_id.

-- Only the server writes chats (service role), like assistant_messages. Users read their own.
create table assistant_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  -- Written by the model on the first reply (or the first message as a fallback); '' until then.
  title text not null default '' check (char_length(title) <= 80),
  -- The item the chat was started from, e.g. "Ask tt." on a Someday card.
  focus_task_id uuid references tasks on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index assistant_chats_user_idx on assistant_chats (user_id, last_message_at desc);

create trigger assistant_chats_updated_at before update on assistant_chats
  for each row execute function set_updated_at();

alter table assistant_chats enable row level security;
create policy own_rows_read on assistant_chats for select using (user_id = auth.uid());

alter publication supabase_realtime add table assistant_chats;

alter table assistant_messages
  add column chat_id uuid references assistant_chats on delete cascade;

create index assistant_messages_chat_idx on assistant_messages (chat_id, created_at);

-- Each user's current conversation becomes their first chat. Cleared messages stay out.
with live as (
  select user_id,
         min(created_at) as first_at,
         max(created_at) as last_at,
         (array_agg(content order by created_at) filter (where role = 'user' and content <> ''))[1] as first_text
  from assistant_messages
  where deleted_at is null
  group by user_id
),
chats as (
  insert into assistant_chats (user_id, title, last_message_at, created_at)
  select user_id, left(btrim(coalesce(first_text, '')), 60), last_at, first_at
  from live
  returning id, user_id
)
update assistant_messages m
set chat_id = c.id
from chats c
where m.user_id = c.user_id and m.deleted_at is null;
