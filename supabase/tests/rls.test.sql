-- Multi-user isolation: user B (and anon) must not be able to read or write user A's data.
--
-- Run with `pnpm db:test` (needs `pnpm db:start`). Everything happens inside one transaction
-- that is rolled back, so it never touches your local data.
--
-- Two sets of checks:
--   1. Direct access: every table, the `imports` storage bucket, and commit_import().
--   2. Cross-user references: a row you own must not point at someone else's row.

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---------- Helpers (callable by the roles we switch to) ----------

create schema rls_test;
grant usage on schema rls_test to anon, authenticated;

-- Runs a query that returns one integer. An "insufficient privilege" error counts as 0 rows
-- (no access either way), so one helper covers tables a role is fully locked out of.
create function rls_test.n(q text) returns int language plpgsql as $$
declare c int;
begin
  execute q into c;
  return c;
exception when insufficient_privilege then
  return 0;
end $$;
grant execute on function rls_test.n(text) to anon, authenticated;

-- ---------- Fixtures: two users, each with data in every table ----------

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com');
-- (the on_auth_user_created trigger creates each user's settings row)

insert into lists (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A list'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B list');

insert into tasks (id, user_id, list_id, title) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000001', 'A task'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'bbbbbbbb-0000-0000-0000-000000000001', 'B task');

insert into steps (id, user_id, task_id, title) values
  ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000002', 'A step'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'bbbbbbbb-0000-0000-0000-000000000002', 'B step');

insert into time_blocks (id, user_id, task_id, gcal_event_id, start, "end") values
  ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000002', 'gcal-a', now(), now() + interval '1 hour'),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'bbbbbbbb-0000-0000-0000-000000000002', 'gcal-b', now(), now() + interval '1 hour');

insert into imports (id, user_id, kind, name) values
  ('aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'text', 'A import'),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'text', 'B import');

insert into day_plan_items (id, user_id, task_id, plan_date) values
  ('aaaaaaaa-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-0000-0000-0000-000000000002', '2026-11-04'),
  ('bbbbbbbb-0000-0000-0000-000000000006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'bbbbbbbb-0000-0000-0000-000000000002', '2026-11-04');

insert into calendars (user_id, id, summary) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cal-a', 'A calendar'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cal-b', 'B calendar');

insert into calendar_events (user_id, calendar_id, gcal_event_id, title, start, "end") values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cal-a', 'ev-a', 'A event', now(), now() + interval '1 hour'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cal-b', 'ev-b', 'B event', now(), now() + interval '1 hour');

insert into calendar_sync_state (user_id, calendar_id, sync_token, channel_id, channel_token) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cal-a', 'sync-a', 'chan-a', 'chan-token-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cal-b', 'sync-b', 'chan-b', 'chan-token-b');

insert into google_accounts (user_id, email, refresh_token_enc, scopes) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com', 'secret-a', 'calendar'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com', 'secret-b', 'calendar');

insert into ai_usage (user_id, model, input_tokens, output_tokens, cost_usd) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'm', 1, 1, 0.01),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'm', 1, 1, 0.01);

insert into storage.objects (bucket_id, name) values
  ('imports', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a.pdf');

-- ===================================================================================
-- 1. Direct access, as user B
-- ===================================================================================

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);

-- Positive controls: B can see and edit their own data, so "sees nothing" below is meaningful.
select is(rls_test.n($$ select count(*) from lists where name = 'B list' $$), 1, 'B sees own list');
select is(rls_test.n($$ select count(*) from tasks where title = 'B task' $$), 1, 'B sees own task');
select is(rls_test.n($$ select count(*) from time_blocks where gcal_event_id = 'gcal-b' $$), 1, 'B sees own time block');
select is(rls_test.n($$ with u as (update tasks set title = 'B task' where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1) select count(*) from u $$), 1, 'B can update own task');

-- Tables users own and can write: lists, tasks, steps, imports, day_plan_items, settings
select is(rls_test.n($$ select count(*) from lists where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s lists');
select is(rls_test.n($$ select count(*) from tasks where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s tasks');
select is(rls_test.n($$ select count(*) from steps where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s steps');
select is(rls_test.n($$ select count(*) from imports where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s imports');
select is(rls_test.n($$ select count(*) from day_plan_items where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s day plan');
select is(rls_test.n($$ select count(*) from settings where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s settings');

select is(rls_test.n($$ with u as (update lists set name = 'pwned' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1) select count(*) from u $$), 0, 'B cannot update A''s list');
select is(rls_test.n($$ with u as (update tasks set title = 'pwned' where id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1) select count(*) from u $$), 0, 'B cannot update A''s task');
select is(rls_test.n($$ with u as (update steps set title = 'pwned' where id = 'aaaaaaaa-0000-0000-0000-000000000003' returning 1) select count(*) from u $$), 0, 'B cannot update A''s step');
select is(rls_test.n($$ with u as (update imports set name = 'pwned' where id = 'aaaaaaaa-0000-0000-0000-000000000005' returning 1) select count(*) from u $$), 0, 'B cannot update A''s import');
select is(rls_test.n($$ with u as (update day_plan_items set position = 99 where id = 'aaaaaaaa-0000-0000-0000-000000000006' returning 1) select count(*) from u $$), 0, 'B cannot update A''s day plan');
select is(rls_test.n($$ with u as (update settings set timezone = 'UTC' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1) select count(*) from u $$), 0, 'B cannot update A''s settings');

select is(rls_test.n($$ with d as (delete from lists where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1) select count(*) from d $$), 0, 'B cannot delete A''s list');
select is(rls_test.n($$ with d as (delete from tasks where id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1) select count(*) from d $$), 0, 'B cannot delete A''s task');
select is(rls_test.n($$ with d as (delete from steps where id = 'aaaaaaaa-0000-0000-0000-000000000003' returning 1) select count(*) from d $$), 0, 'B cannot delete A''s step');
select is(rls_test.n($$ with d as (delete from imports where id = 'aaaaaaaa-0000-0000-0000-000000000005' returning 1) select count(*) from d $$), 0, 'B cannot delete A''s import');
select is(rls_test.n($$ with d as (delete from day_plan_items where id = 'aaaaaaaa-0000-0000-0000-000000000006' returning 1) select count(*) from d $$), 0, 'B cannot delete A''s day plan');

select throws_ok($$ insert into lists (user_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x') $$, '42501', null, 'B cannot insert a list as A');
select throws_ok($$ insert into tasks (user_id, title) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x') $$, '42501', null, 'B cannot insert a task as A');
select throws_ok($$ insert into imports (user_id, kind, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'text', 'x') $$, '42501', null, 'B cannot insert an import as A');
select throws_ok($$ insert into settings (user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, '42501', null, 'B cannot insert settings as A');

-- Handing a row to another user is also blocked.
select throws_ok($$ update lists set user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' where id = 'bbbbbbbb-0000-0000-0000-000000000001' $$, '42501', null, 'B cannot give a list to A');
select throws_ok($$ update tasks set user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' where id = 'bbbbbbbb-0000-0000-0000-000000000002' $$, '42501', null, 'B cannot give a task to A');

-- Server-written tables: users can read their own rows but never write. Others' rows are invisible.
select is(rls_test.n($$ select count(*) from time_blocks where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s time blocks');
select is(rls_test.n($$ select count(*) from calendars where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s calendars');
select is(rls_test.n($$ select count(*) from calendar_events where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s events');
select is(rls_test.n($$ select count(*) from ai_usage where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s AI usage');
select is(rls_test.n($$ select count(*) from calendar_sync_state where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s sync state');
select is(rls_test.n($$ select count(*) from google_accounts where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$), 0, 'B cannot read A''s Google tokens');

select throws_ok($$ insert into time_blocks (user_id, task_id, gcal_event_id, start, "end") values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-0000-0000-000000000002', 'forged', now(), now() + interval '1 hour') $$, '42501', null, 'B cannot write own time blocks (server only)');
select throws_ok($$ insert into calendars (user_id, id, summary) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'forged', 'x') $$, '42501', null, 'B cannot insert calendars');
select throws_ok($$ insert into calendar_events (user_id, calendar_id, gcal_event_id, start, "end") values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cal-b', 'forged', now(), now() + interval '1 hour') $$, '42501', null, 'B cannot insert events');
select throws_ok($$ insert into ai_usage (user_id, model, input_tokens, output_tokens, cost_usd) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'm', 1, 1, 0) $$, '42501', null, 'B cannot write AI usage (it is the spend meter)');
select throws_ok($$ insert into google_accounts (user_id, email, refresh_token_enc, scopes) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'x', 'x', 'x') $$, '42501', null, 'B cannot insert Google tokens');
select throws_ok($$ insert into calendar_sync_state (user_id, calendar_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cal-b') $$, '42501', null, 'B cannot insert sync state');

-- Calendars: only the `selected` flag is user-editable, and only on your own rows.
select is(rls_test.n($$ with u as (update calendars set selected = true where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1) select count(*) from u $$), 0, 'B cannot toggle A''s calendar');
select is(rls_test.n($$ with u as (update calendars set selected = true where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1) select count(*) from u $$), 1, 'B can toggle own calendar');
select throws_ok($$ update calendars set summary = 'renamed' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$, '42501', null, 'B cannot edit other calendar columns');
select throws_ok($$ update calendars set user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$, '42501', null, 'B cannot hand a calendar to A');

-- Own tokens are unreadable too: only the server (service role) may see refresh tokens.
select is(rls_test.n($$ select count(*) from google_accounts $$), 0, 'B cannot read even own Google tokens');
select is(rls_test.n($$ select count(*) from calendar_sync_state $$), 0, 'B cannot read even own sync state');

-- Storage: uploads live in a folder named after the user.
select is(rls_test.n($$ select count(*) from storage.objects where bucket_id = 'imports' and name like 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/%' $$), 0, 'B cannot list A''s uploads');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('imports', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/forged.pdf') $$, '42501', null, 'B cannot upload into A''s folder');
select is(rls_test.n($$ with d as (delete from storage.objects where bucket_id = 'imports' and name like 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/%' returning 1) select count(*) from d $$), 0, 'B cannot delete A''s uploads');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('imports', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/b.pdf') $$, 'B can upload into own folder');

-- commit_import runs as the caller, so it cannot reach A's rows either.
select throws_ok($$ select commit_import('{"kind":"text","name":"x","list":{"id":"aaaaaaaa-0000-0000-0000-000000000001"}}'::jsonb) $$, 'P0002', 'list not found', 'commit_import: B cannot target A''s list');
select throws_ok($$ select commit_import('{"kind":"text","name":"x","updates":[{"id":"aaaaaaaa-0000-0000-0000-000000000002","title":"pwned"}]}'::jsonb) $$, 'P0002', null, 'commit_import: B cannot update A''s task');

-- ===================================================================================
-- 2. Direct access, as an anonymous (signed-out) caller
-- ===================================================================================

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(rls_test.n($$ select count(*) from lists $$), 0, 'anon cannot read lists');
select is(rls_test.n($$ select count(*) from tasks $$), 0, 'anon cannot read tasks');
select is(rls_test.n($$ select count(*) from steps $$), 0, 'anon cannot read steps');
select is(rls_test.n($$ select count(*) from time_blocks $$), 0, 'anon cannot read time blocks');
select is(rls_test.n($$ select count(*) from settings $$), 0, 'anon cannot read settings');
select is(rls_test.n($$ select count(*) from imports $$), 0, 'anon cannot read imports');
select is(rls_test.n($$ select count(*) from day_plan_items $$), 0, 'anon cannot read day plan');
select is(rls_test.n($$ select count(*) from calendars $$), 0, 'anon cannot read calendars');
select is(rls_test.n($$ select count(*) from calendar_events $$), 0, 'anon cannot read events');
select is(rls_test.n($$ select count(*) from calendar_sync_state $$), 0, 'anon cannot read sync state');
select is(rls_test.n($$ select count(*) from google_accounts $$), 0, 'anon cannot read Google tokens');
select is(rls_test.n($$ select count(*) from ai_usage $$), 0, 'anon cannot read AI usage');
select is(rls_test.n($$ select count(*) from storage.objects where bucket_id = 'imports' $$), 0, 'anon cannot list uploads');
select throws_ok($$ insert into lists (user_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x') $$, '42501', null, 'anon cannot insert');
select throws_ok($$ select commit_import('{"kind":"text","name":"x"}'::jsonb) $$, '28000', 'not authenticated', 'anon cannot run commit_import');

-- ===================================================================================
-- 3. Cross-user references: B's own rows must not point at A's rows
-- (Foreign keys are checked without RLS, so a bare `user_id = auth.uid()` policy allows these.)
-- ===================================================================================

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select throws_ok($$ insert into tasks (user_id, list_id, title) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-0000-0000-0000-000000000001', 'x') $$, '42501', null, 'B cannot create a task in A''s list');
select throws_ok($$ update tasks set list_id = 'aaaaaaaa-0000-0000-0000-000000000001' where id = 'bbbbbbbb-0000-0000-0000-000000000002' $$, '42501', null, 'B cannot move a task into A''s list');
select throws_ok($$ insert into steps (user_id, task_id, title) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-0000-0000-0000-000000000002', 'x') $$, '42501', null, 'B cannot add a step to A''s task');
select throws_ok($$ insert into day_plan_items (user_id, task_id, plan_date) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-0000-0000-0000-000000000002', '2026-11-05') $$, '42501', null, 'B cannot plan A''s task');
select throws_ok($$ insert into imports (user_id, kind, name, list_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'text', 'x', 'aaaaaaaa-0000-0000-0000-000000000001') $$, '42501', null, 'B cannot attach an import to A''s list');

-- ===================================================================================
-- 4. A's data is untouched after all of that (checked as the table owner)
-- ===================================================================================

reset role;
select is((select count(*)::int from tasks where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and title = 'A task' and deleted_at is null), 1, 'A''s task is unchanged');
select is((select count(*)::int from lists where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and name = 'A list' and deleted_at is null), 1, 'A''s list is unchanged');
select is((select count(*)::int from steps where task_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 1, 'A''s task has only A''s step');
select is((select selected from calendars where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), false, 'A''s calendar selection is unchanged');

select * from finish();
rollback;
