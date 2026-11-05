-- Row-level security only checked `user_id = auth.uid()`, and foreign keys are checked
-- without RLS. So a user who knew another user's row id could create their own row that
-- points at it (a task in someone else's list, a step on someone else's task, ...).
--
-- Each policy below also requires that every row it references belongs to the caller. The
-- subselects run under the caller's own RLS, so they only see the caller's rows.
-- Soft-deleted rows still count: sync keeps referencing them until they are purged.

drop policy own_rows on tasks;
create policy own_rows on tasks for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (list_id is null or exists (select 1 from lists l where l.id = list_id and l.user_id = auth.uid()))
    and (import_id is null or exists (select 1 from imports i where i.id = import_id and i.user_id = auth.uid()))
  );

drop policy own_rows on steps;
create policy own_rows on steps for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from tasks t where t.id = task_id and t.user_id = auth.uid())
  );

drop policy own_rows on day_plan_items;
create policy own_rows on day_plan_items for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from tasks t where t.id = task_id and t.user_id = auth.uid())
  );

drop policy own_rows on imports;
create policy own_rows on imports for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (list_id is null or exists (select 1 from lists l where l.id = list_id and l.user_id = auth.uid()))
  );
