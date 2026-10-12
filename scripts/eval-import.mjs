// Checks AI task extraction against fixtures, end to end through the running app.
// Needs: local Supabase, the app running with ANTHROPIC_API_KEY set, and an allowed account.
// Each run makes ~4 Claude calls (a few cents). Usage:
//   EVAL_EMAIL=qa@example.com EVAL_PASSWORD=demo-password-123 node scripts/eval-import.mjs
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const APP = process.env.APP_URL || "http://localhost:3000";
const EMAIL = process.env.EVAL_EMAIL || "qa@example.com";
const PASSWORD = process.env.EVAL_PASSWORD || "demo-password-123";
const TZ = "America/New_York";
const fixture = (f) => new URL(`./fixtures/${f}`, import.meta.url);

const st = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const session = await (
  await fetch(`${st.API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: st.ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
).json();
if (!session.access_token) throw new Error(`Couldn't sign in as ${EMAIL}`);
const auth = { Authorization: `Bearer ${session.access_token}`, "content-type": "application/json" };

async function call(path, body) {
  const t = Date.now();
  const res = await fetch(`${APP}/api/v1${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${json.error}`);
  return { ...json, seconds: ((Date.now() - t) / 1000).toFixed(1) };
}

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failures++;
};
const localDay = (iso) => iso && new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const localTime = (iso) =>
  iso && new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const find = (tasks, re) => tasks.find((t) => re.test(t.title));

// 1. The spec's one-liner → exactly 3 tasks.
{
  const r = await call("/imports/extract-text", { text: readFileSync(fixture("one-liner.txt"), "utf8") });
  console.log(`one-liner (${r.seconds}s): ${r.tasks.map((t) => t.title).join(" | ")}`);
  check("exactly 3 tasks", r.tasks.length === 3, `${r.tasks.length}`);
  check("lab, email, poster board", [/lab/i, /email|prof/i, /poster/i].every((re) => find(r.tasks, re)));
  check("lab due Friday 11pm", localTime(find(r.tasks, /lab/i)?.due_at) === "23:00");
}

// 2. A long, mixed brain dump → ~12 actionable items, each traceable to its source.
{
  const r = await call("/imports/extract-text", { text: readFileSync(fixture("brain-dump.txt"), "utf8") });
  console.log(`brain dump (${r.seconds}s): ${r.tasks.length} tasks`);
  for (const t of r.tasks) console.log(`    - ${t.title}${t.due_at ? ` (due ${localDay(t.due_at)})` : ""}`);
  check("10–14 tasks (12 expected)", r.tasks.length >= 10 && r.tasks.length <= 14, `${r.tasks.length}`);
  check("every quote found in the source", r.tasks.every((t) => t.source_found), r.tasks.filter((t) => !t.source_found).map((t) => t.source_quote).join(" / "));
  check("skips other people's work and chit-chat", !find(r.tasks, /coffee|weather|mocks|backend/i));
  check("problem set 5 found", !!find(r.tasks, /problem set 5|ps ?5/i));
}

// 3. The syllabus, as PDF and as text: every problem set and both midterms on the right dates.
const expected = [
  [/problem set 1\b|ps ?1\b/i, "2026-09-25"],
  [/problem set 2\b|ps ?2\b/i, "2026-10-09"],
  [/problem set 3\b|ps ?3\b/i, "2026-10-23"],
  [/problem set 4\b|ps ?4\b/i, "2026-11-06"],
  [/problem set 5\b|ps ?5\b/i, "2026-11-20"],
  [/problem set 6\b|ps ?6\b/i, "2026-12-04"],
  [/midterm 1/i, "2026-10-15", "19:00"],
  [/midterm 2/i, "2026-11-12", "19:00"],
];
async function checkSyllabus(label, r) {
  console.log(`syllabus ${label} (${r.seconds}s): course ${r.course.code}, ${r.tasks.length} items`);
  check("course code CS74", /cs ?74/i.test(r.course.code ?? ""), r.course.code);
  for (const [re, day, time] of expected) {
    const t = find(r.tasks, re);
    check(`${re.source.split("\\b")[0]} on ${day}${time ? ` ${time}` : ""}`, !!t && localDay(t.due_at) === day && (!time || localTime(t.due_at) === time), t ? `${localDay(t.due_at)} ${localTime(t.due_at)}` : "missing");
  }
  const final = find(r.tasks, /final/i);
  check("final exam's unscheduled date is flagged", !final || !final.date_certain || !final.due_at);
  check("readings included", r.tasks.filter((t) => t.kind === "reading").length >= 3);
}
await checkSyllabus("text", await call("/imports/extract-syllabus", { text: readFileSync(fixture("syllabus-cs74.txt"), "utf8") }));
{
  const path = `${session.user.id}/eval-${Date.now()}.pdf`;
  const up = await fetch(`${st.API_URL}/storage/v1/object/imports/${path}`, {
    method: "POST",
    headers: { apikey: st.ANON_KEY, Authorization: `Bearer ${session.access_token}`, "content-type": "application/pdf" },
    body: readFileSync(fixture("syllabus-cs74.pdf")),
  });
  if (!up.ok) throw new Error(`upload failed: ${await up.text()}`);
  await checkSyllabus("PDF", await call("/imports/extract-syllabus", { storage_path: path, file_name: "syllabus-cs74.pdf" }));
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
