-- Data integrity (20261123000000): soft-delete cascades, set_task_done_date, replace_steps.
--
-- Run with `pnpm db:test` (needs `pnpm db:start`). Everything happens inside one transaction
-- that is rolled back, so it never touches your local data.

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---------- Fixtures ----------

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com');

insert into lists (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A list');

insert into tasks (id, user_id, list_id, title, repeat) values
  -- t1: deleted below, to check the cascade
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 't1', 'none'),
  -- t2: a repeating task, for done dates
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 't2', 'daily'),
  -- t3: in the list that gets deleted
  ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-00000000000a', 't3', 'none'),
  -- t4: for replace_steps
  ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 't4', 'none');

insert into steps (id, user_id, task_id, title, "order", done, estimate_min) values
  ('aaaaaaaa-0000-0000-0001-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000001', 't1 step', 0, false, null),
  ('aaaaaaaa-0000-0000-0001-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000003', 't3 step', 0, false, null),
  ('aaaaaaaa-0000-0000-0001-000000000041', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000004', 't4 done', 0, true, 30),
  ('aaaaaaaa-0000-0000-0001-000000000042', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000004', 't4 open', 1, false, 45);

insert into day_plan_items (id, user_id, task_id, step_id, plan_date) values
  ('aaaaaaaa-0000-0000-0002-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000001', null, '2026-11-23'),
  ('aaaaaaaa-0000-0000-0002-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0001-000000000002', '2026-11-23'),
  ('aaaaaaaa-0000-0000-0002-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000003', null, '2026-11-23');

-- Act as user A, through RLS like the API does.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

-- ---------- Soft-delete cascade ----------

update tasks set deleted_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select ok((select deleted_at is not null from steps where id = 'aaaaaaaa-0000-0000-0001-000000000001'),
  'deleting a task soft-deletes its steps');
select ok((select deleted_at is not null from day_plan_items where id = 'aaaaaaaa-0000-0000-0002-000000000001'),
  'deleting a task soft-deletes its My day items');

update steps set deleted_at = now() where id = 'aaaaaaaa-0000-0000-0001-000000000002';
select ok((select deleted_at is not null from day_plan_items where id = 'aaaaaaaa-0000-0000-0002-000000000002'),
  'deleting a step soft-deletes its My day items');
select ok((select deleted_at is null from day_plan_items where id = 'aaaaaaaa-0000-0000-0002-000000000003'),
  'deleting a step leaves its task''s own My day item');

update lists set deleted_at = now() where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select is((select list_id from tasks where id = 'aaaaaaaa-0000-0000-0000-000000000003'), null,
  'deleting a list moves its tasks to No list');
select ok((select deleted_at is null from tasks where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'deleting a list keeps its tasks');

-- ---------- set_task_done_date ----------

select set_task_done_date('aaaaaaaa-0000-0000-0000-000000000002', '2026-11-24', true);
select set_task_done_date('aaaaaaaa-0000-0000-0000-000000000002', '2026-11-22', true);
select set_task_done_date('aaaaaaaa-0000-0000-0000-000000000002', '2026-11-24', true);
select is((select done_dates from tasks where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  array['2026-11-22', '2026-11-24']::date[], 'done dates are added once each, in order');

select set_task_done_date('aaaaaaaa-0000-0000-0000-000000000002', '2026-11-22', false);
select is((select done_dates from tasks where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  array['2026-11-24']::date[], 'unchecking removes only that date');

select is((select count(*)::int from set_task_done_date('aaaaaaaa-0000-0000-0000-000000000001', '2026-11-24', true)),
  0, 'a deleted task can''t be checked off');

-- ---------- replace_steps ----------

select is(
  (select jsonb_array_length(r->'removed') from replace_steps('aaaaaaaa-0000-0000-0000-000000000004',
    '[{"title":"new one","estimate_min":20},{"title":"new two","estimate_min":10}]') as r),
  1, 'replace_steps reports the unfinished step it removed');
select is(
  (select array_agg(title || ':' || "order" order by "order") from steps
   where task_id = 'aaaaaaaa-0000-0000-0000-000000000004' and deleted_at is null),
  array['t4 done:0', 'new one:1', 'new two:2'], 'finished steps stay; new ones follow them');
select is((select estimate_min from tasks where id = 'aaaaaaaa-0000-0000-0000-000000000004'), 60,
  'the estimate is the sum of all live steps');

select throws_ok(
  $$select replace_steps('aaaaaaaa-0000-0000-0000-000000000004', '[{"title":"ok","estimate_min":5},{"estimate_min":5}]')$$,
  '23502', null, 'a step without a title fails');
select is(
  (select array_agg(title order by "order") from steps
   where task_id = 'aaaaaaaa-0000-0000-0000-000000000004' and deleted_at is null),
  array['t4 done', 'new one', 'new two'], 'a failed replace leaves the steps as they were');

-- ---------- Other users ----------

select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select is((select count(*)::int from set_task_done_date('aaaaaaaa-0000-0000-0000-000000000002', '2026-11-30', true)),
  0, 'user B can''t check off user A''s task');
select throws_ok(
  $$select replace_steps('aaaaaaaa-0000-0000-0000-000000000004', '[{"title":"x","estimate_min":5}]')$$,
  'P0002', null, 'user B can''t replace user A''s steps');

reset role;
select is((select done_dates from tasks where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  array['2026-11-24']::date[], 'user A''s done dates are unchanged');

select * from finish();
rollback;
