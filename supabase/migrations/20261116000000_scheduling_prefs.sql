-- How the user likes their time planned: focus time, longest session, breaks between blocks,
-- and a cap on planned work per day. Ask tt. follows these when it places blocks.
-- Shape: packages/shared/src/schemas.ts (SchedulingPrefs); every key is optional. Additive.
alter table settings
  add column scheduling jsonb not null default '{}'::jsonb
    check (jsonb_typeof(scheduling) = 'object');
