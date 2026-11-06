-- Steps on My day, and due dates on steps. Both columns are nullable, so older clients keep working.

-- A step's own deadline, inside its task's. Null means it just follows the task.
alter table steps add column due_at timestamptz;

-- A plan item can be one step of a task instead of the whole task. task_id stays set to the
-- step's task, so everything keyed on task_id (sync, cascades, RLS) still applies.
alter table day_plan_items
  add column step_id uuid references steps on delete cascade;

-- A task appears once per day as a whole, and each step at most once per day.
drop index day_plan_items_unique_idx;
create unique index day_plan_items_task_unique_idx
  on day_plan_items (user_id, plan_date, task_id) where deleted_at is null and step_id is null;
create unique index day_plan_items_step_unique_idx
  on day_plan_items (user_id, plan_date, step_id) where deleted_at is null and step_id is not null;

-- The step must be the caller's and belong to the row's task (see 20261107000000).
drop policy own_rows on day_plan_items;
create policy own_rows on day_plan_items for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from tasks t where t.id = task_id and t.user_id = auth.uid())
    and (
      step_id is null
      or exists (
        select 1 from steps s
        where s.id = step_id and s.task_id = day_plan_items.task_id and s.user_id = auth.uid()
      )
    )
  );
