-- My day: an ordered daily plan per date, and recurring ("routine") tasks.
-- Both are additive, so older clients keep working.

-- ---------- Recurring tasks ----------
-- A repeating task is checked off per day (done_dates, local dates in the user's time zone)
-- instead of once, so its status stays 'open'.
alter table tasks
  add column repeat text not null default 'none'
    check (repeat in ('none', 'daily', 'weekdays', 'custom')),
  -- Days of the week for a custom repeat: 0 = Sunday ... 6 = Saturday.
  add column repeat_days smallint[] not null default '{}'
    check (repeat_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  add column done_dates date[] not null default '{}';

-- ---------- Daily plan ----------
-- One row per task planned for a date. `position` orders the list; clients insert between
-- neighbors (fractional), so a move is a single-row update.
create table day_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references tasks on delete cascade,
  plan_date date not null,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- A task appears once per day (soft-deleted rows don't count).
create unique index day_plan_items_unique_idx
  on day_plan_items (user_id, plan_date, task_id) where deleted_at is null;
create index day_plan_items_sync_idx on day_plan_items (user_id, updated_at);
create index day_plan_items_day_idx on day_plan_items (user_id, plan_date, position);

create trigger day_plan_items_updated_at before update on day_plan_items
  for each row execute function set_updated_at();

alter table day_plan_items enable row level security;
create policy own_rows on day_plan_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table day_plan_items;
