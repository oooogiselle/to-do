-- When to start working on a task: a local date (like day_plan_items.plan_date). From this date
-- the task shows on My day as started; before it, My day leaves the task alone unless it's at
-- risk. Nullable, so older clients keep working.
alter table tasks add column start_date date;
