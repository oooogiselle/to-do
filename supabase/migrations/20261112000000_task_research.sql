-- Someday research: web resources and an effort estimate the AI finds for a someday item.
-- Written by the server (POST /api/v1/tasks/:id/research); the user can remove resources.
-- Shape: packages/shared/src/schemas.ts (TaskResearch). Nullable, so older clients keep working.
alter table tasks
  add column research jsonb
    check (research is null or jsonb_typeof(research) = 'object');
