-- Cost protection for the AI endpoints: per-user request counters and spend totals.
-- Both are server-only (service role): no policies, and the functions are not callable by
-- signed-in users or anon.

-- ---------- Request counters ----------
-- One row per (user, bucket, time window). The bucket name includes the window length
-- (e.g. 'extract:60'), so different windows never share a row.
create table rate_limits (
  user_id uuid not null references auth.users on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (user_id, bucket, window_start)
);

alter table rate_limits enable row level security;
-- No policies: only the service role can read or write it.

-- Counts one request in the current fixed window and says whether it is within the limit.
-- The upsert is atomic, so parallel requests are all counted.
create function hit_rate_limit(p_user uuid, p_bucket text, p_window_seconds int, p_max int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user, p_bucket, w, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into n;

  -- Old windows are useless; sweep them now and then so this needs no cron job.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return n <= p_max;
end;
$$;

-- ---------- Spend totals ----------
-- Sum of AI cost since a moment, for one user or (p_user null) for everyone. Replaces
-- downloading every ai_usage row and summing in the app.
create function ai_spend(p_since timestamptz, p_user uuid default null)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0)
  from ai_usage
  where ts >= p_since and (p_user is null or user_id = p_user);
$$;

revoke execute on function hit_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function hit_rate_limit(uuid, text, int, int) to service_role;
revoke execute on function ai_spend(timestamptz, uuid) from public, anon, authenticated;
grant execute on function ai_spend(timestamptz, uuid) to service_role;

create index ai_usage_user_ts_idx on ai_usage (user_id, ts);
create index ai_usage_ts_idx on ai_usage (ts);
