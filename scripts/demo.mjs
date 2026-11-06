// Resets the local database and seeds a sample week (relative to today) for a demo account.
// Usage: pnpm demo   (then sign in with "Use demo account")
import { execSync } from "node:child_process";

export const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password-123";

const status = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const SB = status.API_URL;
const ANON = status.ANON_KEY;
const SRK = status.SERVICE_ROLE_KEY;
if (!SB || !SRK) {
  console.error("Local Supabase isn't running. Start it with `pnpm db:start`.");
  process.exit(1);
}

console.log("Resetting local database…");
execSync("npx supabase db reset", {
  stdio: "ignore",
  env: { ...process.env, GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "unset", GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "unset" },
});
await new Promise((r) => setTimeout(r, 2000));

const admin = { apikey: SRK, Authorization: `Bearer ${SRK}`, "content-type": "application/json", Prefer: "return=representation" };
async function req(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url}: ${JSON.stringify(body)}`);
  return body;
}

await req(`${SB}/auth/v1/admin/users`, {
  method: "POST",
  headers: admin,
  body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD, email_confirm: true }),
});
const session = await req(`${SB}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "content-type": "application/json" },
  body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
});
const uid = session.user.id;
const user = { apikey: ANON, Authorization: `Bearer ${session.access_token}`, "content-type": "application/json", Prefer: "return=representation" };
// Bulk inserts need the same keys on every row; `columns` plus missing=default lets rows leave
// some out and get the column default.
const insert = (headers, table, rows) => {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].join(",");
  const prefer = [headers.Prefer, "missing=default"].filter(Boolean).join(",");
  return req(`${SB}/rest/v1/${table}?columns=${columns}`, {
    method: "POST",
    headers: { ...headers, Prefer: prefer },
    body: JSON.stringify(rows),
  });
};

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
await req(`${SB}/rest/v1/settings?user_id=eq.${uid}`, { method: "PATCH", headers: admin, body: JSON.stringify({ timezone: tz }) });

// Dates relative to this week's Monday, in local time.
const monday = new Date();
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const at = (dayOffset, hm) => {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(monday);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

// Pretend Google is connected so calendars show; a reconnect replaces this with a real token.
await insert(admin, "google_accounts", [{ user_id: uid, email: DEMO_EMAIL, refresh_token_enc: "demo", scopes: "demo" }]);
const cal = (id, summary, color, isTasks = false) => ({ user_id: uid, id, summary, color, selected: true, is_tasks_calendar: isTasks });
await insert(admin, "calendars", [
  cal("demo-personal", "Personal", "#4285f4"),
  cal("demo-classes", "Classes", "#0b8043"),
  cal("demo-tasks", "Tasks", "#616161", true),
]);
const ev = (calId, id, title, day, s, e, busy = true) => ({
  user_id: uid, calendar_id: calId, gcal_event_id: id, title, start: at(day, s), end: at(day, e), all_day: false, busy,
});
await insert(admin, "calendar_events", [
  ev("demo-personal", "gym1", "Gym", 0, "07:30", "08:30"),
  ev("demo-classes", "cs1", "CS61 Lecture", 0, "10:00", "11:15"),
  ev("demo-classes", "la1", "Linear Algebra", 0, "14:30", "15:45"),
  ev("demo-classes", "ec1", "Econ 10 Section", 1, "13:00", "14:00"),
  ev("demo-personal", "rc1", "Coffee chat with recruiter", 1, "16:00", "16:30"),
  ev("demo-personal", "gym2", "Gym", 2, "07:30", "08:30"),
  ev("demo-classes", "cs2", "CS61 Lecture", 2, "10:00", "11:15"),
  ev("demo-classes", "la2", "Linear Algebra", 2, "14:30", "15:45"),
  ev("demo-classes", "ec2", "Econ 10 Section", 3, "13:00", "14:00"),
  ev("demo-personal", "oh1", "Office hours", 3, "15:00", "16:30"),
  ev("demo-personal", "ts1", "Club meeting", 3, "15:30", "16:00"),
  ev("demo-classes", "cs3", "CS61 Lecture", 4, "10:00", "11:15"),
  ev("demo-personal", "dn1", "Dinner with friends", 4, "18:30", "20:00"),
  ev("demo-personal", "sg1", "Study group", 5, "11:00", "13:00"),
  { ...ev("demo-personal", "trip", "Weekend trip", 5, "00:00", "00:00", false), end: at(7, "00:00"), all_day: true },
]);

const [cs, econ, rec, pers] = await insert(user, "lists", [
  { name: "CS61", color: "#5C88C7", sort_order: 0 },
  { name: "Econ 10", color: "#5AA585", sort_order: 1 },
  { name: "Recruiting", color: "#8775C9", sort_order: 2 },
  { name: "Personal", color: "#D9775E", sort_order: 3 },
]);
const task = (list, title, due, priority, estimate) => ({ list_id: list?.id ?? null, title, due_at: due, priority, estimate_min: estimate });
const tasks = await insert(user, "tasks", [
  task(cs, "Lab 3 report", at(4, "23:00"), "high", 240),
  task(econ, "Problem set 4", at(2, "17:00"), "med", 180),
  task(rec, "Online assessment", at(6, "23:59"), "high", 90),
  task(pers, "Renew passport", null, "low", 30),
  task(rec, "Update resume", at(-1, "23:59"), "med", 60),
  task(econ, "Read chapter 7", at(3, "09:00"), "none", 45),
]);
// Routines (checked off per day) and today's plan for My day.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const routines = await insert(user, "tasks", [
  { list_id: pers.id, title: "Take vitamins", estimate_min: 5, repeat: "daily", done_dates: [dayAgo(1), dayAgo(2), dayAgo(3)] },
  { list_id: pers.id, title: "Stretch", estimate_min: 15, repeat: "weekdays", done_dates: [dayAgo(1)] },
  { list_id: pers.id, title: "Plan tomorrow", estimate_min: 10, repeat: "custom", repeat_days: [0, 1, 2, 3, 4] },
]);
// Further out, so My day's Coming up has something to surface: a midterm next week to study
// for this week, and a proposal set to start tomorrow (hidden from My day until then).
const fromNow = (n, hm) => {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
await insert(user, "tasks", [
  { list_id: econ.id, title: "Study for Econ midterm", due_at: fromNow(8, "10:00"), priority: "high", estimate_min: 360 },
  { list_id: cs.id, title: "CS project proposal", due_at: fromNow(12, "23:59"), priority: "med", estimate_min: 120, start_date: dayAgo(-1) },
]);
const today = ymd(new Date());
await insert(user, "day_plan_items", [
  { task_id: tasks[5].id, plan_date: today, position: 1 },
  { task_id: tasks[0].id, plan_date: today, position: 2 },
  { task_id: tasks[3].id, plan_date: today, position: 3 },
]);
void routines;

const step = (title, estimate_min, order, done = false) => ({ task_id: tasks[0].id, title, estimate_min, order, done });
await insert(user, "steps", [
  step("Run experiments", 90, 0, true),
  step("Write analysis", 90, 1),
  step("Make plots", 45, 2),
  step("Proofread", 15, 3),
]);
// Someday: long-term goals and things to learn later.
const [someday] = await insert(user, "lists", [
  { name: "Someday", color: "#B27BC9", sort_order: 4, kind: "someday" },
]);
const idea = (title, idea_kind, horizon, extra = {}) => ({ list_id: someday.id, title, idea_kind, horizon, ...extra });
const ideas = await insert(user, "tasks", [
  idea("Run a half marathon", "goal", "year", { estimate_min: 45 }),
  idea("Learn Rust ownership", "learn", "month", { link_url: "https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html", estimate_min: 60 }),
  idea("3Blue1Brown: neural networks series", "learn", "someday", { link_url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi" }),
  idea("Get conversational in Spanish", "goal", "someday"),
  idea("Try pottery class", null, null, { notes: "The studio on Main St has Thursday evening drop-ins." }),
]);
await insert(user, "steps", [
  { task_id: ideas[0].id, title: "Run 5K without stopping", estimate_min: 30, order: 0, done: true },
  { task_id: ideas[0].id, title: "Run 10K", estimate_min: 60, order: 1, done: true },
  { task_id: ideas[0].id, title: "Sign up for a spring race", estimate_min: 15, order: 2 },
  { task_id: ideas[0].id, title: "Long run of 18K", estimate_min: 120, order: 3 },
]);

await insert(admin, "time_blocks", [
  { user_id: uid, task_id: tasks[0].id, step_id: null, gcal_event_id: "demo-block-1", start: at(2, "16:00"), end: at(2, "17:30") },
]);

console.log(`Demo data ready (${tz}). Open http://localhost:3000 and choose "Use demo account".`);
