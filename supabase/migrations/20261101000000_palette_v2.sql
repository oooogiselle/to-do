-- New palette for the redesign: map every stored color from the first palette to the hue
-- that replaced it. The updated_at trigger bumps each row, so clients pick it up via /sync.

create function pg_temp.palette_v2(c text) returns text language sql immutable as $$
  select case lower(c)
    when '#2563eb' then '#5C88C7'  -- blue   -> sky
    when '#0d9488' then '#5AA585'  -- teal   -> mint
    when '#7c3aed' then '#8775C9'  -- violet -> grape
    when '#db2777' then '#C97A9F'  -- pink   -> pink
    when '#ea580c' then '#D9775E'  -- orange -> coral
    when '#ca8a04' then '#E3BA55'  -- amber  -> sun
    when '#64748b' then '#8A8FA6'  -- slate  -> slate
    else c
  end
$$;

update lists set color = pg_temp.palette_v2(color)
  where color is distinct from pg_temp.palette_v2(color);

update tasks set color = pg_temp.palette_v2(color)
  where color is not null and color is distinct from pg_temp.palette_v2(color);

alter table lists alter column color set default '#8A8FA6';
