-- Which Ask tt. guardrails fired on a reply: the input screen ("screen:off_topic") and the checks
-- on its text and cards ("text:code", "text:url", "text:claim", "changes:delete_no_intent").
-- Written by the server only (like the rest of the row); not shown in the app.
alter table assistant_messages add column if not exists guard text[] not null default '{}';
