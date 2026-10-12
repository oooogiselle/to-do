-- Timeline To-Do: initial schema.
-- Every user-owned row has user_id, created_at, updated_at (trigger-maintained) and deleted_at
-- (soft delete) so clients can pull changes since a cursor and merge offline edits.

create extension if not exists pgcrypto;

create type priority as enum ('none', 'low', 'med', 'high');
create type task_status as enum ('open', 'done', 'archived');

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

-- ---------- App-owned data ----------

create table lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  color text not null default '#64748b',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  list_id uuid references lists on delete set null,
  title text not null,
  notes text not null default '',
  due_at timestamptz,
  priority priority not null default 'none',
  estimate_min int check (estimate_min > 0),
  status task_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references tasks on delete cascade,
  title text not null,
  estimate_min int check (estimate_min > 0),
  "order" int not null default 0,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references tasks on delete cascade,
  step_id uuid references steps on delete set null,
  gcal_event_id text not null,
  start timestamptz not null,
  "end" timestamptz not null check ("end" > start),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, gcal_event_id)
);

create table settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  working_hours jsonb not null default '{
    "0": null,
    "1": {"start": "09:00", "end": "18:00"},
    "2": {"start": "09:00", "end": "18:00"},
    "3": {"start": "09:00", "end": "18:00"},
    "4": {"start": "09:00", "end": "18:00"},
    "5": {"start": "09:00", "end": "18:00"},
    "6": null
  }'::jsonb,
  default_block_min int not null default 60 check (default_block_min > 0),
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every user gets a settings row on sign-up, whichever client they first sign in from.
create or replace function create_settings_for_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function create_settings_for_user();

-- ---------- Google Calendar mirror ----------

create table calendars (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  summary text not null,
  color text,
  selected boolean not null default false,
  is_tasks_calendar boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table calendar_events (
  user_id uuid not null references auth.users on delete cascade,
  calendar_id text not null,
  gcal_event_id text not null,
  title text not null default '',
  start timestamptz not null,
  "end" timestamptz not null,
  all_day boolean not null default false,
  busy boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, calendar_id, gcal_event_id),
  foreign key (user_id, calendar_id) references calendars (user_id, id) on delete cascade
);

create table calendar_sync_state (
  user_id uuid not null,
  calendar_id text not null,
  sync_token text,
  channel_id text unique,
  channel_token text,
  resource_id text,
  channel_expires_at timestamptz,
  last_synced_at timestamptz,
  primary key (user_id, calendar_id),
  foreign key (user_id, calendar_id) references calendars (user_id, id) on delete cascade
);

-- Refresh token is encrypted by the server (AES-256-GCM, TOKEN_ENCRYPTION_KEY) before storage.
create table google_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  refresh_token_enc text not null,
  scopes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  ts timestamptz not null default now(),
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_usd numeric(10, 6) not null
);

-- ---------- Triggers & indexes ----------

do $$
declare t text;
begin
  foreach t in array array['lists','tasks','steps','time_blocks','settings','calendars',
                           'calendar_events','google_accounts'] loop
    execute format('create trigger %I_updated_at before update on %I
                    for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

create index lists_sync_idx on lists (user_id, updated_at);
create index tasks_sync_idx on tasks (user_id, updated_at);
create index steps_sync_idx on steps (user_id, updated_at);
create index steps_task_idx on steps (task_id, "order");
create index time_blocks_sync_idx on time_blocks (user_id, updated_at);
create index time_blocks_range_idx on time_blocks (user_id, start);
create index calendar_events_range_idx on calendar_events (user_id, start, "end");

-- ---------- Row level security ----------

alter table lists enable row level security;
alter table tasks enable row level security;
alter table steps enable row level security;
alter table time_blocks enable row level security;
alter table settings enable row level security;
alter table calendars enable row level security;
alter table calendar_events enable row level security;
alter table calendar_sync_state enable row level security;
alter table google_accounts enable row level security;
alter table ai_usage enable row level security;

create policy own_rows on lists for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on steps for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Time blocks and the gcal mirror are written only by the server (service role), which
-- keeps gcal and the database in step. Users can read their own rows.
create policy own_rows_read on time_blocks for select using (user_id = auth.uid());
create policy own_rows_read on calendars for select using (user_id = auth.uid());
create policy own_rows_read on calendar_events for select using (user_id = auth.uid());
create policy own_rows_read on ai_usage for select using (user_id = auth.uid());
-- Calendar selection is a user preference.
create policy own_rows_update on calendars for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on calendars from authenticated, anon;
grant update (selected) on calendars to authenticated;

-- calendar_sync_state and google_accounts: no policies, so only the service role can touch them.

-- ---------- Realtime ----------

alter publication supabase_realtime add table lists, tasks, steps, time_blocks, calendar_events;
