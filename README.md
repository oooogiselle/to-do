# Timeline To-Do

Personal app that puts Google Calendar events and to-dos on one timeline.
Plan: phases 1–5 (backend → web timeline → AI + scheduling → iOS → offline/push).

## Layout
- `apps/web`: Next.js app (web UI + API under `app/api`)
- `apps/mobile`: Expo iOS app (talks to the same `/api/v1` with a Supabase Bearer token)
- `packages/client`: React Query data layer shared by web and mobile (sync model, optimistic
  mutations, Due rail, slot suggestions, timeline layout)
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

## AI features
Set `ANTHROPIC_API_KEY` (and optionally `AI_MONTHLY_CAP_USD`, default $5) in `apps/web/.env.local`.
- **Break down** on a task proposes steps with estimates.
- **Import** (nav, Inbox, or ⌘Enter in quick add) turns pasted text or a syllabus PDF/photo into
  tasks. Everything lands on a review screen first; re-importing a revised syllabus offers
  updates instead of duplicates. Uploaded files are deleted right after they're read.

To check extraction quality against the fixtures in `scripts/fixtures/` (a few cents per run),
start the app with a key and run `node scripts/eval-import.mjs`.

## iOS app
Covers daily use: the day timeline, the Due list, to-dos, quick add, and the task sheet
(steps, due dates, scheduling from suggested slots). Settings, connecting Google Calendar,
AI import and list editing stay on the web.

Needs Xcode (with its license accepted) and CocoaPods. Expo Go won't work, because Google
sign-in redirects to the app's own `timelinetodo://` scheme.
1. `cp apps/mobile/.env.example apps/mobile/.env.local` and fill it in. For local development,
   keep the localhost URLs and use the anon key from `npx supabase status`. Set
   `EXPO_PUBLIC_DEMO=1` to show the demo sign-in.
2. Run the web app (`pnpm dev` or `pnpm demo`), then `pnpm --filter @tt/mobile ios`. This builds
   a development build and opens it in the simulator. The script unsets `CC`/`CXX`, since
   Xcode's pods only build with its own clang.

Against production, set `EXPO_PUBLIC_API_URL=https://www.tapestry-todo.com` and the
hosted project's Supabase URL and anon key. Add `timelinetodo://auth/callback` to the hosted
project's auth redirect URLs (Dashboard → Authentication → URL Configuration, or
`supabase config push`). To install on your phone, plug it in and run
`pnpm --filter @tt/mobile exec expo run:ios --device` (free provisioning lasts 7 days), or use
EAS Build and TestFlight for a longer-lived install.
