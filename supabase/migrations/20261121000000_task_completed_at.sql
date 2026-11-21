-- When a to-do was checked off, for "done this week" in the sidebar and on To-dos.
-- The database keeps it: set when status becomes 'done', cleared when it stops being 'done'.
-- Clients never write it, so web, iOS, Ask tt. and import all get it. Repeating to-dos are
-- checked off per date (done_dates) and keep status 'open', so they never get one. Additive.
alter table tasks add column completed_at timestamptz;

-- Done before this column existed: the last edit is the best guess.
update tasks set completed_at = updated_at where status = 'done';

create or replace function set_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at = clock_timestamp();
    else
      new.completed_at = old.completed_at;
    end if;
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create trigger tasks_completed_at before insert or update on tasks
  for each row execute function set_completed_at();
