-- "Keep" on the To-dos overdue review: the due date the user chose to keep while it was overdue.
-- A to-do is asked about only while due_at differs from this, so a new date that also lapses
-- gets asked about again without anything being reset. Additive.
alter table tasks add column overdue_kept_due timestamptz;
