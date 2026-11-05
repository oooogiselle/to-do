-- AI cost protection: the request counter (hit_rate_limit), the spend totals (ai_spend), and
-- that both are server-only. Run with `pnpm db:test`; rolled back, so it never touches local data.

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com');

-- ===================================================================================
-- hit_rate_limit
-- ===================================================================================

select is(hit_rate_limit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'extract:60', 60, 3), true, 'hit 1 of 3 is allowed');
select is(hit_rate_limit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'extract:60', 60, 3), true, 'hit 2 of 3 is allowed');
select is(hit_rate_limit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'extract:60', 60, 3), true, 'hit 3 of 3 is allowed');
select is(hit_rate_limit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'extract:60', 60, 3), false, 'hit 4 of 3 is refused');
select is(hit_rate_limit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'extract:60', 60, 3), false, 'and it stays refused');

select is(hit_rate_limit('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'extract:60', 60, 3), true, 'another user has their own count');
select is(hit_rate_limit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'suggest:60', 60, 3), true, 'another bucket has its own count');
select is(hit_rate_limit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'extract:3600', 3600, 3), true, 'another window has its own count');

-- A row from an earlier window must not count against the current one.
insert into rate_limits (user_id, bucket, window_start, hits)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'old:60', now() - interval '10 minutes', 99);
select is(hit_rate_limit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'old:60', 60, 3), true, 'an old window does not count');

select is((select hits from rate_limits where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and bucket = 'extract:60' order by window_start desc limit 1), 5, 'refused hits are still counted');

-- ===================================================================================
-- ai_spend
-- ===================================================================================

-- The local database may already hold real usage, so measure the global total as a change.
create temp table spend_before as select ai_spend(now() - interval '1 day') as total;

insert into ai_usage (user_id, ts, model, input_tokens, output_tokens, cost_usd) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'm', 1, 1, 0.25),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'm', 1, 1, 0.50),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '40 days', 'm', 1, 1, 1.00),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), 'm', 1, 1, 2.00);

select is(ai_spend(now() - interval '1 day', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0.75::numeric, 'one user''s spend since yesterday');
select is(ai_spend(now() - interval '60 days', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1.75::numeric, 'a longer period includes older rows');
select is(ai_spend(now() - interval '1 day') - (select total from spend_before), 2.75::numeric, 'with no user, everyone''s spend is summed');
select is(ai_spend(now() + interval '1 day'), 0::numeric, 'no rows in the period is zero, not null');

-- ===================================================================================
-- Server-only: signed-in users and anon can't touch the table or call the functions
-- ===================================================================================

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select is((select count(*)::int from rate_limits), 0, 'a signed-in user cannot read the counters');
select throws_ok($$ insert into rate_limits (user_id, bucket, window_start) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'x', now()) $$, '42501', null, 'a signed-in user cannot write the counters');
select throws_ok($$ select hit_rate_limit('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'extract:60', 60, 1000000) $$, '42501', null, 'a signed-in user cannot reset their own limit by calling the counter');
select throws_ok($$ select ai_spend(now() - interval '1 day') $$, '42501', null, 'a signed-in user cannot read total spend');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is((select count(*)::int from rate_limits), 0, 'anon cannot read the counters');
select throws_ok($$ select hit_rate_limit('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'extract:60', 60, 3) $$, '42501', null, 'anon cannot call the counter');
select throws_ok($$ select ai_spend(now() - interval '1 day') $$, '42501', null, 'anon cannot read total spend');

select * from finish();
rollback;
