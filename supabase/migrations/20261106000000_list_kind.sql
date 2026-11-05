-- A "someday" list holds ideas and things to do when there's time (no deadline).
-- The slot-suggestion AI treats its tasks as optional candidates for free time.
alter table lists
  add column kind text not null default 'normal' check (kind in ('normal', 'someday'));
