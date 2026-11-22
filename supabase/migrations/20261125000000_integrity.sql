-- Data integrity: writes that took several requests now happen in one statement or one
-- transaction, and soft deletes cascade the way hard deletes would.
-- All additive (new functions and triggers), so older clients keep working.

-- ---------- Soft-delete cascade ----------
-- Foreign keys only cascade on hard deletes. Soft-deleting a task left its steps and My day
-- items live, a step left its My day items, and a list left its tasks pointing at it (the UI
-- promises they move to No list). The trigger does it in the same transaction as the delete,
-- for every writer. It runs as the caller, so RLS still scopes it; the children's updated_at
-- trigger bumps them, so /sync carries the cascade to clients.
create or replace function cascade_soft_delete() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_table_name = 'tasks' then
    update steps set deleted_at = new.deleted_at
      where task_id = new.id and deleted_at is null;
    update day_plan_items set deleted_at = new.deleted_at
      where task_id = new.id and deleted_at is null;
  elsif tg_table_name = 'steps' then
    update day_plan_items set deleted_at = new.deleted_at
      where step_id = new.id and deleted_at is null;
  elsif tg_table_name = 'lists' then
    update tasks set list_id = null where list_id = new.id and deleted_at is null;
    update imports set list_id = null where list_id = new.id and deleted_at is null;
  end if;
  return null;
end;
$$;

create trigger tasks_cascade_soft_delete after update of deleted_at on tasks
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function cascade_soft_delete();
create trigger steps_cascade_soft_delete after update of deleted_at on steps
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function cascade_soft_delete();
create trigger lists_cascade_soft_delete after update of deleted_at on lists
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function cascade_soft_delete();

-- Rows left behind before the trigger existed.
update steps s set deleted_at = t.deleted_at
  from tasks t
  where s.task_id = t.id and t.deleted_at is not null and s.deleted_at is null;
update day_plan_items i set deleted_at = t.deleted_at
  from tasks t
  where i.task_id = t.id and t.deleted_at is not null and i.deleted_at is null;
update day_plan_items i set deleted_at = s.deleted_at
  from steps s
  where i.step_id = s.id and s.deleted_at is not null and i.deleted_at is null;
update tasks t set list_id = null
  from lists l
  where t.list_id = l.id and l.deleted_at is not null and t.deleted_at is null;
update imports i set list_id = null
  from lists l
  where i.list_id = l.id and l.deleted_at is not null and i.deleted_at is null;

-- ---------- Repeating to-dos: check off one date atomically ----------
-- Clients used to send the whole done_dates array from their cached copy, so two devices
-- checking off different days overwrote each other. This adds or removes one date in a single
-- UPDATE; a concurrent call waits on the row lock and then applies to the newer array.
create or replace function set_task_done_date(p_task uuid, p_date date, p_done boolean)
returns setof tasks
language sql security invoker set search_path = public as $$
  update tasks set done_dates = case
      when p_done then array(select distinct d from unnest(done_dates || p_date) as d order by d)
      else array_remove(done_dates, p_date)
    end
  where id = p_task and deleted_at is null
  returning *;
$$;

-- ---------- Accept a step breakdown atomically ----------
-- Replaces a task's unfinished steps with new ones after its finished steps, and sets the
-- task's estimate to the sum of its steps. One transaction, so a failed insert can't leave the
-- task with its old steps deleted and no new ones. Returns the task, the new steps and the ids
-- of the steps it removed (their upcoming blocks are the caller's to clear from gcal).
-- p_steps: [{ "title": text, "estimate_min": int }]
create or replace function replace_steps(p_task uuid, p_steps jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  first_order int;
  removed uuid[];
  inserted jsonb;
  task_row tasks;
begin
  perform 1 from tasks where id = p_task and deleted_at is null for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  with gone as (
    update steps set deleted_at = now()
    where task_id = p_task and deleted_at is null and not done
    returning id
  )
  select coalesce(array_agg(id), '{}') into removed from gone;

  select coalesce(max("order") + 1, 0) into first_order
    from steps where task_id = p_task and deleted_at is null;

  with ins as (
    insert into steps (task_id, title, estimate_min, "order")
    select p_task, e.s->>'title', (e.s->>'estimate_min')::int, first_order + e.n::int - 1
    from jsonb_array_elements(p_steps) with ordinality as e(s, n)
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(ins) order by ins."order"), '[]'::jsonb) into inserted from ins;

  update tasks set estimate_min = (
      select nullif(sum(coalesce(estimate_min, 0)), 0)::int
      from steps where task_id = p_task and deleted_at is null
    )
  where id = p_task
  returning * into task_row;

  return jsonb_build_object('task', to_jsonb(task_row), 'steps', inserted, 'removed', to_jsonb(removed));
end;
$$;

revoke execute on function set_task_done_date(uuid, date, boolean) from public, anon;
grant execute on function set_task_done_date(uuid, date, boolean) to authenticated, service_role;
revoke execute on function replace_steps(uuid, jsonb) from public, anon;
grant execute on function replace_steps(uuid, jsonb) to authenticated, service_role;
