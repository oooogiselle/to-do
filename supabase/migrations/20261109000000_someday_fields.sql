-- Someday items: long-term goals and things to learn later. They live in "someday" lists as
-- ordinary tasks; these optional fields describe them. All nullable, so older clients keep working.
alter table tasks
  -- Where the idea came from (an article, video or course). http(s) only.
  add column link_url text
    check (link_url is null or (link_url ~* '^https?://' and length(link_url) <= 2048)),
  -- A long-term goal, or something to learn.
  add column idea_kind text check (idea_kind in ('goal', 'learn')),
  -- A loose timeframe instead of a due date, so the item never goes overdue.
  add column horizon text check (horizon in ('month', 'year', 'someday'));
