-- Someday items can be "people": friends and family to keep in touch with. Their done_dates log
-- when the user last connected, which the free-time suggestions use.
alter table tasks drop constraint if exists tasks_idea_kind_check;
alter table tasks
  add constraint tasks_idea_kind_check check (idea_kind in ('goal', 'learn', 'people'));
