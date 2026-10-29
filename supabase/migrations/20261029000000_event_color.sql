-- An event's own gcal color. null = use its calendar's color.
alter table calendar_events add column color text;

-- Incremental sync only returns changed events; force a full sync so cached events get colors.
update calendar_sync_state set sync_token = null;
