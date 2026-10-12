-- AI imports: free text and syllabus uploads. Proposed tasks are reviewed client-side and
-- committed atomically through commit_import().

create type import_kind as enum ('text', 'syllabus');

create table imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind import_kind not null,
  name text not null,
  list_id uuid references lists on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger imports_updated_at before update on imports
  for each row execute function set_updated_at();
create index imports_sync_idx on imports (user_id, updated_at);

alter table imports enable row level security;
create policy own_rows on imports for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table tasks
  add column import_id uuid references imports on delete set null,
  add column source_quote text;

-- ---------- Upload bucket (files are deleted right after extraction) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imports', 'imports', false, 20971520,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "imports: own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "imports: own folder select" on storage.objects for select to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "imports: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Atomic commit ----------

-- payload:
-- {
--   "kind": "text" | "syllabus",
--   "name": "CS74 syllabus.pdf",
--   "list": { "id": uuid } | { "new": { "name": text, "color": text } } | null,
--   "creates": [{ "title", "notes"?, "due_at"?, "priority"?, "estimate_min"?, "source_quote"?,
--                 "list": "target" | uuid | null }],
--   "updates": [{ "id": uuid, "title"?, "due_at"?, "priority"? }]
-- }
-- Runs as the caller (security invoker), so RLS scopes every row to them. Any failure rolls
-- back the whole import.
create or replace function commit_import(payload jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  target_list uuid;
  new_import uuid;
  item jsonb;
  row_list uuid;
  created uuid[] := '{}';
  updated uuid[] := '{}';
  touched int;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if payload->'list' ? 'id' then
    select id into target_list from lists
      where id = (payload->'list'->>'id')::uuid and deleted_at is null;
    if target_list is null then
      raise exception 'list not found' using errcode = 'P0002';
    end if;
  elsif payload->'list' ? 'new' then
    insert into lists (name, color, sort_order)
    values (
      payload->'list'->'new'->>'name',
      coalesce(payload->'list'->'new'->>'color', '#64748b'),
      coalesce((select max(sort_order) + 1 from lists where deleted_at is null), 0)
    )
    returning id into target_list;
  end if;

  insert into imports (kind, name, list_id)
  values ((payload->>'kind')::import_kind, left(coalesce(payload->>'name', 'Import'), 200), target_list)
  returning id into new_import;

  for item in select * from jsonb_array_elements(coalesce(payload->'creates', '[]'::jsonb)) loop
    row_list := case
      when item->>'list' = 'target' then target_list
      when item->>'list' is null then null
      else (item->>'list')::uuid
    end;
    insert into tasks (list_id, title, notes, due_at, priority, estimate_min, source_quote, import_id)
    values (
      row_list,
      item->>'title',
      coalesce(item->>'notes', ''),
      (item->>'due_at')::timestamptz,
      coalesce((item->>'priority')::priority, 'none'),
      (item->>'estimate_min')::int,
      item->>'source_quote',
      new_import
    )
    returning id into new_id;
    created := created || new_id;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(payload->'updates', '[]'::jsonb)) loop
    update tasks set
      title = coalesce(item->>'title', title),
      due_at = case when item ? 'due_at' then (item->>'due_at')::timestamptz else due_at end,
      priority = coalesce((item->>'priority')::priority, priority),
      import_id = new_import
    where id = (item->>'id')::uuid and deleted_at is null;
    get diagnostics touched = row_count;
    if touched = 0 then
      raise exception 'task % not found', item->>'id' using errcode = 'P0002';
    end if;
    updated := updated || (item->>'id')::uuid;
  end loop;

  return jsonb_build_object(
    'import_id', new_import, 'list_id', target_list, 'created', created, 'updated', updated
  );
end;
$$;

alter publication supabase_realtime add table imports;
