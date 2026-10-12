# Timeline To-Do

Personal app that puts Google Calendar events and to-dos on one timeline.
Plan: phases 1–5 (backend → web timeline → AI + scheduling → iOS → offline/push).

## Layout
- `apps/web`: Next.js app (web UI + API under `app/api`)
- `packages/shared`: zod schemas, generated DB types, timezone helpers
- `supabase/`: migrations and local config

## Try it without Google (demo mode)
With Docker running: `pnpm install && pnpm db:start`, then `pnpm demo`. This resets the local
database, seeds a sample week, and starts the app at http://localhost:3000. Choose
"Use demo account" on the sign-in page. Refresh and calendar toggles need a real Google
connection, so they won't work in the demo.

## Local setup
1. `pnpm install`
2. Create a Google OAuth client (Web application) with the Calendar API enabled. Add redirect URIs
   `http://127.0.0.1:54321/auth/v1/callback` and `http://localhost:3000/api/google/callback`.
3. `export GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...` (Supabase's Google sign-in reads these),
   then `pnpm db:start`.
4. `cp apps/web/.env.example apps/web/.env.local` and fill it in (keys from `npx supabase status`).
5. `pnpm dev`, sign in, then Settings → Connect Google Calendar.

Push notifications from Google need a public HTTPS URL: run a tunnel (e.g. `cloudflared tunnel
--url http://localhost:3000`) and set `GOOGLE_WEBHOOK_BASE_URL`. Without one, calendars sync on
the 15-minute cron (`GET /api/cron/gcal` with `Authorization: Bearer $CRON_SECRET`) or via
`POST /api/v1/calendars/refresh`.

After changing the schema: `pnpm db:reset && pnpm db:types`.
