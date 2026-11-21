/* Content and renderer for the Loom reference mock of My day (design/loom/DESIGN.md is the spec).
   my-day.html sets window.DIRECTION before loading this. */

const FONTS = {
  geist: { label: "Geist (today)", body: "'Geist'", head: "'Geist'" },
  schibsted: { label: "Schibsted Grotesk", body: "'Schibsted Grotesk'", head: "'Schibsted Grotesk'" },
  public: { label: "Public Sans + Newsreader", body: "'Public Sans'", head: "'Newsreader'" },
  onest: { label: "Onest", body: "'Onest'", head: "'Onest'" },
  hanken: { label: "Hanken Grotesk", body: "'Hanken Grotesk'", head: "'Hanken Grotesk'" },
  albert: { label: "Albert Sans", body: "'Albert Sans'", head: "'Albert Sans'" },
};
const WEIGHTS = {
  light: { label: "Light", body: 400, name: 400, head: 500 },
  medium: { label: "Medium", body: 400, name: 500, head: 600 },
  strong: { label: "Strong", body: 500, name: 600, head: 700 },
};

(function loadFonts() {
  const fams = ["Schibsted+Grotesk:wght@400;500;600"];
  const pre = document.createElement("link");
  pre.rel = "preconnect";
  pre.href = "https://fonts.gstatic.com";
  pre.crossOrigin = "";
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?${fams.map((f) => "family=" + f).join("&")}&display=swap`;
  document.head.append(pre, l);
})();

function applyType(fontId, weightId) {
  const f = FONTS[fontId] ?? FONTS.geist;
  const w = WEIGHTS[weightId] ?? WEIGHTS.medium;
  const s = document.documentElement.style;
  s.setProperty("--f-body", `${f.body}, ui-sans-serif, system-ui, sans-serif`);
  s.setProperty("--f-head", `${f.head}, ${f.body}, ui-sans-serif, system-ui, sans-serif`);
  s.setProperty("--w-body", w.body);
  s.setProperty("--w-name", w.name);
  s.setProperty("--w-head", w.head);
  document.documentElement.dataset.font = fontId;
  const out = document.getElementById("tw-now");
  if (out) out.textContent = `${f.label} · ${w.label} (body ${w.body} / names ${w.name} / headings ${w.head})`;
}

/* ---------- icons (lucide paths) ---------- */
const P = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  cal: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  checks: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
  sparkles: '<path d="M9.94 14.06 4 20M12 3l1.9 5.8L20 10.5l-5.6 2.2L12 19l-2.4-6.3L4 10.5l6.1-1.7z"/>',
  paste: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M16 4h2a2 2 0 0 1 2 2v4M21 14H11M15 10l-4 4 4 4"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  layout: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M15 3v18"/>',
  calplus: '<path d="M8 2v4M16 2v4M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8M3 10h18M16 19h6M19 16v6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M16 15l-3-3 3-3"/>',
};
const ic = (n, cls = "ic") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

/* ---------- content (from the demo seed, one Saturday) ---------- */
const LISTS = {
  cs: { name: "CS61", count: 4 },
  econ: { name: "Econ 10", count: 3 },
  rec: { name: "Recruiting", count: 3 },
  pers: { name: "Personal", count: 5 },
};
const LIST_TASKS = {
  cs: [
    { t: "CS project proposal", due: "Wed", steps: "1 of 4 steps" },
    { t: "Lab 6: shell", due: "Tue" },
    { t: "Read lecture 18 notes", est: "45m" },
  ],
  econ: [
    { t: "Problem set 7", due: "Mon", risk: true },
    { t: "Study for Econ midterm", due: "Nov 29" },
    { t: "Read ch. 9", due: "Thu" },
  ],
  rec: [
    { t: "Coffee chat prep", due: "Mon", risk: true },
    { t: "Apply to summer internships", est: "2h" },
  ],
};
const PLAN = [
  { t: "Study for Econ midterm", l: "econ", est: "2h", time: "2:00–4:00 PM" },
  { t: "Write problem statement", parent: "CS project proposal", l: "cs", est: "45m", done: true },
  { t: "Update resume for fall recruiting", l: "rec", est: "30m", done: true },
  { t: "Problem set 7", l: "econ", est: "1h 30m", hover: true },
  { t: "Call grandma", l: "pers", est: "20m" },
];
const ROUTINES = [
  { t: "Take vitamins", l: "pers", done: true, streak: 5 },
  { t: "Stretch", l: "pers" },
  { t: "Plan tomorrow", l: "pers" },
];
const COMING = [
  { t: "CS project proposal", hint: "Start today", urgent: true, due: "due Wed",
    steps: [{ t: "Draft milestones", meta: "1h · Start today", urgent: true }] },
  { t: "Coffee chat prep", hint: "Short on time", urgent: true, due: "due Mon" },
  { t: "Read ch. 9", hint: "Start by Tue", due: "due Thu" },
  { t: "Lab 6: shell", hint: "Start by Mon", due: "due Tue" },
];
/* Day pane: hours 8–20, times in minutes from midnight. */
const DAY = {
  from: 8 * 60, to: 20 * 60, now: 13 * 60 + 15,
  items: [
    { kind: "event", t: "Econ study group", sub: "Green Library", s: 600, e: 660 },
    { kind: "event", t: "Lunch with Maya", s: 750, e: 810 },
    { kind: "open", t: "30m open", s: 810, e: 840 },
    { kind: "block", t: "Study for Econ midterm", l: "econ", s: 840, e: 960 },
    { kind: "open", t: "30m open", s: 960, e: 990 },
    { kind: "event", t: "Coffee chat with recruiter", s: 990, e: 1020 },
    { kind: "open", t: "1h open", s: 1020, e: 1080 },
  ],
};
const PLAN_STATS = { done: 3, total: 8, planned: "4h 15m", free: "3h 30m", over: "45m" };

/* ---------- rendering ---------- */
const listVar = (l) => `var(--l-${l})`;

function check(done, l, size = 16) {
  return `<button class="check${done ? " is-done" : ""}" role="checkbox" aria-checked="${done}" style="--c:${listVar(l)};--s:${size}px" aria-label="${done ? "Mark not done" : "Mark done"}">${done ? ic("check", "ic-check") : ""}</button>`;
}

function sidebar() {
  const nav = [
    ["sun", "My day", true], ["cal", "Calendar"], ["checks", "To-dos"], ["sparkles", "Someday"], ["paste", "Import"],
  ];
  return `<aside class="sidebar">
    <div class="brand"><span class="logo" aria-hidden="true"><i></i><i></i><i></i></span><span class="brand-name">Tapestry</span>
      <button class="icon-btn ghost sm" aria-label="Collapse sidebar">${ic("panel")}</button></div>
    <button class="quick-add">${ic("plus")}<span>Quick add</span><kbd>⌘K</kbd></button>
    <nav class="nav">${nav.map(([i, n, a]) => `<a href="#" class="nav-item${a ? " is-active" : ""}" ${a ? 'aria-current="page"' : ""}>${ic(i)}<span>${n}</span></a>`).join("")}</nav>
    <div class="side-section"><h3 class="side-label">Lists</h3>
      ${Object.entries(LISTS).map(([k, l]) => `<a href="#" class="nav-item list-item"><span class="dot" style="--c:${listVar(k)}"></span><span>${l.name}</span><span class="count">${l.count}</span></a>`).join("")}
    </div>
    <div class="side-foot">
      <a href="#" class="nav-item">${ic("chat")}<span>Ask tt.</span><kbd>⌘J</kbd></a>
      <a href="#" class="nav-item">${ic("settings")}<span>Settings</span></a>
      <div class="me"><span class="avatar">G</span><span class="me-name">Giselle</span></div>
    </div>
  </aside>`;
}

function topHeader() {
  return `<header class="top">
    <div class="top-title"><h1>My day</h1><p>Week of Nov 16 – Nov 22 · Today Sat Nov 21, 1:15 PM</p></div>
    <div class="sky-strip" aria-hidden="true"></div>
    <button class="sync"><span class="sync-dot"></span>Synced 2 min ago ${ic("refresh", "ic xs")}</button>
    <button class="btn">${ic("layout", "ic sm")}My day layout</button>
  </header>`;
}

function listPane(k) {
  const l = LISTS[k];
  return `<section class="pane list-pane" aria-label="${l.name}">
    <header class="pane-head">${ic("grip", "ic grip")}<span class="sq" style="--c:${listVar(k)}"></span><h2>${l.name}</h2><span class="count">${l.count}</span>
      <button class="icon-btn ghost sm" aria-label="Close ${l.name} pane">${ic("x")}</button></header>
    <ul class="list-rows">${LIST_TASKS[k].map((t) => `<li class="lrow">${check(false, k, 14)}<div><span class="lt">${t.t}</span><span class="lmeta">${t.due ? `<span class="due${t.risk ? " risk" : ""}">${t.due}</span>` : ""}${t.steps ? `<span>${t.steps}</span>` : ""}${t.est ? `<span>${t.est}</span>` : ""}</span></div></li>`).join("")}</ul>
  </section>`;
}

function progress() {
  const s = PLAN_STATS;
  // One thread per to-do, in plan order: routines first, then the plan.
  const all = [...ROUTINES, ...PLAN];
  const threads = all.map((x, i) => `<i class="${x.done ? "on" : ""}" style="--c:${listVar(x.l)};--i:${i}"></i>`).join("");
  // Woven band: one panel per to-do, width by estimate.
  const mins = { "2h": 120, "45m": 45, "30m": 30, "1h 30m": 90, "20m": 20 };
  const weave = [...ROUTINES.map((r) => ({ ...r, m: r.t === "Take vitamins" ? 5 : r.t === "Stretch" ? 15 : 10 })), ...PLAN.map((p) => ({ ...p, m: mins[p.est] }))]
    .map((x, i) => `<i class="${x.done ? "on" : ""}" style="--c:${listVar(x.l)};flex-grow:${x.m};--i:${i}" title="${x.t}"></i>`).join("");
  return `<div class="stats"><p><span>${s.done} of ${s.total} done</span><span class="sep">·</span><span>${s.planned} planned</span><span class="sep">·</span><span class="risk-text">${s.free} free (over by ${s.over})</span></p>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.done}" aria-label="To-dos done"><div class="bar-fill" style="width:${(s.done / s.total) * 100}%"></div></div>
    <div class="threads" role="img" aria-label="${s.done} of ${s.total} done">${threads}</div>
    <div class="weave" role="img" aria-label="${s.done} of ${s.total} done, by planned time">${weave}</div>
  </div>`;
}

function planPane() {
  const rows = PLAN.map((p) => `<li class="prow${p.done ? " is-done" : ""}${p.hover ? " is-hover" : ""}" style="--c:${listVar(p.l)}">
      <span class="thread" aria-hidden="true"></span>${check(!!p.done, p.l)}
      <button class="ptext"><span class="ptitle">${p.t}</span><span class="pmeta">${p.parent ? `<span>${p.parent}</span><span class="sep">·</span>` : ""}<span class="plist">${LISTS[p.l].name}</span><span class="sep">·</span><span>${p.est}</span>${p.time ? `<span class="time-chip">${p.time}</span>` : ""}</span></button>
      <span class="pactions">${!p.time && !p.done ? `<button class="icon-btn ghost" aria-label="Find time" title="Find time">${ic("calplus")}</button>` : ""}<button class="icon-btn ghost" aria-label="Make daily" title="Make daily">${ic("repeat")}</button><button class="icon-btn ghost" aria-label="Remove from day" title="Remove from day">${ic("x")}</button></span>
    </li>`).join("");
  const routines = ROUTINES.map((r) => `<li class="prow routine${r.done ? " is-done" : ""}" style="--c:${listVar(r.l)}">
      <span class="thread" aria-hidden="true"></span>${check(!!r.done, r.l)}
      <button class="ptext"><span class="ptitle">${r.t}</span></button>
      <span class="rmeta">Every day</span>${r.streak ? `<span class="streak">${r.streak} days</span>` : ""}
    </li>`).join("");
  const coming = COMING.map((c) => `<li><div class="crow"><button class="add-btn" aria-label="Add ${c.t} to this day">${ic("plus")}</button>
      <button class="ctitle">${c.t}</button><span class="chint${c.urgent ? " urgent" : ""}">${c.hint}<span class="cdue"> · ${c.due}</span></span></div>
      ${c.steps ? `<ul class="csteps">${c.steps.map((s) => `<li class="crow step"><button class="add-btn sm" aria-label="Add step ${s.t}">${ic("plus")}</button><span class="ctitle">${s.t}</span><span class="chint${s.urgent ? " urgent" : ""}">${s.meta}</span></li>`).join("")}</ul>` : ""}</li>`).join("");

  return `<div class="center">
    <div class="tabs"><button class="tab is-active">${ic("grip", "ic grip")}<span class="sq" style="--c:var(--accent)"></span>My day</button><button class="icon-btn ghost sm tab-add" aria-label="Open a pane">${ic("plus")}</button></div>
    <section class="pane plan-pane" aria-label="My day plan">
      <div class="plan-sky" aria-hidden="true"><span class="sun"></span><span class="sky-end">8 AM</span><span class="sky-end r">8 PM</span></div>
      <div class="plan-inner">
        <header class="day-head">
          <div class="day-title"><h2><span class="day-dot" aria-hidden="true"></span>Today</h2><p>Saturday, November 21</p></div>
          <button class="icon-btn" aria-label="Previous day">${ic("left")}</button>
          <button class="icon-btn" aria-label="Next day">${ic("right")}</button>
        </header>
        ${progress()}
        <section class="group" aria-label="Every day">
          <h3 class="group-label">${ic("repeat", "ic xs label-ic")}Every day<span class="group-count">1/3</span></h3>
          <ul>${routines}</ul>
          <form class="inline-add">${ic("plus")}<input placeholder="Add a daily to-do" aria-label="Add a daily to-do"></form>
        </section>
        <section class="group" aria-label="Plan for Saturday, November 21">
          <h3 class="group-label">Plan<span class="group-count">2/5</span></h3>
          <ol>${rows}</ol>
          <form class="inline-add">${ic("plus")}<input placeholder="Add a to-do" aria-label="Add a to-do for this day"></form>
        </section>
        <section class="group" aria-label="Coming up">
          <h3 class="group-label">Coming up<span class="group-note">Add to this day</span></h3>
          <ul class="coming">${coming}</ul>
          <button class="more">Show 3 more</button>
        </section>
      </div>
    </section>
  </div>`;
}

function dayPane() {
  const H = 56; // px per hour
  const y = (m) => ((m - DAY.from) / 60) * H;
  const hours = [];
  for (let h = DAY.from / 60; h <= DAY.to / 60; h++) {
    const lab = h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`;
    hours.push(`<div class="hour" style="top:${y(h * 60)}px"><span>${h === DAY.to / 60 ? "" : lab}</span></div>`);
  }
  const fmt = (m) => {
    const h = Math.floor(m / 60), mm = m % 60, h12 = h > 12 ? h - 12 : h;
    return `${h12}:${String(mm).padStart(2, "0")}`;
  };
  const items = DAY.items.map((it) => {
    const style = `top:${y(it.s) + 1}px;height:${y(it.e) - y(it.s) - 2}px;${it.l ? `--c:${listVar(it.l)}` : ""}`;
    const past = it.e <= DAY.now ? " is-past" : "";
    if (it.kind === "open") return `<div class="slot open-slot" style="${style}"><span>${it.t}</span></div>`;
    const short = it.e - it.s <= 30;
    return `<div class="slot ${it.kind}${past}${short ? " short" : ""}" style="${style}"><span class="st">${it.t}</span><span class="sm">${short ? fmt(it.s) : `${fmt(it.s)}–${fmt(it.e)}`}${it.sub && !short ? ` · ${it.sub}` : ""}</span></div>`;
  }).join("");
  const sky = `<div class="day-sky" aria-hidden="true" style="height:${y(DAY.to)}px"></div>`;
  return `<section class="pane day-pane" aria-label="Day">
    <header class="pane-head">${ic("grip", "ic grip")}<span class="sq" style="--c:var(--ink)"></span><h2>Day · Sat, Nov 21</h2>
      <button class="icon-btn ghost sm" aria-label="Close Day pane">${ic("x")}</button></header>
    <div class="ribbon" aria-hidden="true"><span class="ribbon-sun" style="left:${((DAY.now - DAY.from) / (DAY.to - DAY.from)) * 100}%"></span></div>
    <div class="day-grid">${sky}<div class="past" style="height:${y(DAY.now)}px"></div>${hours.join("")}${items}
      <div class="now" style="top:${y(DAY.now)}px"><span class="now-label">1:15</span></div>
    </div>
  </section>`;
}

function screen() {
  return `<div class="screen" data-dir="${window.DIRECTION.id}">
    ${sidebar()}
    <main class="main">${topHeader()}
      <div class="work">
        <div class="col left">${listPane("cs")}${listPane("econ")}${listPane("rec")}</div>
        ${planPane()}
        <div class="col right">${dayPane()}</div>
      </div>
    </main>
  </div>`;
}

/* ---------- token sheet ---------- */
function tokenSheet() {
  const d = window.DIRECTION;
  const swBg = (v) => {
    const hex = v.match(/#[0-9a-fA-F]{6}/g) ?? [v];
    if (hex.length === 1) return hex[0];
    const step = 100 / hex.length;
    return `linear-gradient(90deg, ${hex.map((h, i) => `${h} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
  };
  const sw = d.palette.map(([name, v, maps]) => `<li><span class="chip-sw" style="background:${swBg(v)}"></span><b>${name}</b><code>${v}</code><small>${maps}</small></li>`).join("");
  const scale = [
    ["Day heading", "18", "head", "Today"],
    ["Pane & page title", "15", "head", "My day"],
    ["To-do title", "13", "name", "Study for Econ midterm"],
    ["Section label", "12", "head", "Coming up"],
    ["Meta", "11", "body", "Econ 10 · 2h · 2:00–4:00 PM"],
  ].map(([n, sz, w, ex]) => `<li><span class="sc-ex" style="font-size:${sz}px;font-weight:var(--w-${w});font-family:var(--f-${w === "head" ? "head" : "body"})">${ex}</span><small>${n} · ${sz}px · <span class="wlab" data-w="${w}"></span></small></li>`).join("");
  return `<section class="sheet" aria-label="Tokens">
    <div class="sheet-intro"><h2>${d.name}</h2><p>${d.blurb}</p></div>
    <div class="sheet-grid">
      <div><h3>Colour</h3><ul class="palette">${sw}</ul></div>
      <div><h3>Type scale (the app's sizes)</h3><ul class="scale">${scale}</ul>
        <h3>Corners</h3><p class="note">${d.corners}</p></div>
      <div><h3>Pieces</h3>
        <div class="pieces">
          <div class="piece-row">${check(false, "econ")}${check(true, "econ")}<span class="due">Mon</span><span class="due risk">Overdue</span><span class="time-chip">2:00–4:00 PM</span></div>
          <div class="piece-row"><button class="btn">${ic("layout", "ic sm")}Button</button><button class="btn primary">Add to My day</button><button class="icon-btn" aria-label="Next">${ic("right")}</button></div>
          <ul class="piece-plan">
            <li class="prow" style="--c:var(--l-cs)"><span class="thread"></span>${check(false, "cs")}<button class="ptext"><span class="ptitle">Normal row</span><span class="pmeta"><span class="plist">CS61</span><span class="sep">·</span><span>45m</span></span></button></li>
            <li class="prow is-hover" style="--c:var(--l-rec)"><span class="thread"></span>${check(false, "rec")}<button class="ptext"><span class="ptitle">Hovered row</span><span class="pmeta"><span class="plist">Recruiting</span><span class="sep">·</span><span>30m</span></span></button><span class="pactions"><button class="icon-btn ghost" aria-label="Remove">${ic("x")}</button></span></li>
            <li class="prow is-done" style="--c:var(--l-pers)"><span class="thread"></span>${check(true, "pers")}<button class="ptext"><span class="ptitle">Done row</span><span class="pmeta"><span class="plist">Personal</span><span class="sep">·</span><span>20m</span></span></button></li>
          </ul>
          <div class="piece-day"><div class="slot event" style="position:relative;height:40px"><span class="st">Event</span><span class="sm">10:00–11:00</span></div><div class="slot block" style="position:relative;height:40px;--c:var(--l-econ)"><span class="st">Booked block</span><span class="sm">2:00–4:00</span></div><div class="slot open-slot" style="position:relative;height:28px"><span>30m open</span></div></div>
        </div>
      </div>
    </div>
  </section>`;
}

/* ---------- switcher (not part of the design) ---------- */
function switcher(fontId, weightId) {
  const opt = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${v.label}</option>`).join("");
  return `<div class="type-switch" role="group" aria-label="Type switcher">
    <label>Font <select id="tw-font">${opt(FONTS, fontId)}</select></label>
    <label>Weights <select id="tw-weight">${opt(WEIGHTS, weightId)}</select></label>
    <output id="tw-now"></output>
  </div>`;
}

function updateWeightLabels() {
  const w = WEIGHTS[document.getElementById("tw-weight").value];
  document.querySelectorAll(".wlab").forEach((el) => (el.textContent = `weight ${w[el.dataset.w]}`));
}

function mount() {
  const d = window.DIRECTION;
  const q = new URLSearchParams(location.search);
  const fontId = FONTS[q.get("font")] ? q.get("font") : d.font;
  const weightId = WEIGHTS[q.get("w")] ? q.get("w") : d.weights;
  document.body.insertAdjacentHTML("afterbegin", screen() + tokenSheet() + (q.has("clean") || d.switcher === false ? "" : switcher(fontId, weightId)));
  if (q.has("clean") || d.switcher === false) document.body.insertAdjacentHTML("beforeend", `<div hidden>${switcher(fontId, weightId)}</div>`);
  applyType(fontId, weightId);
  updateWeightLabels();
  const sync = () => {
    const f = document.getElementById("tw-font").value, w = document.getElementById("tw-weight").value;
    applyType(f, w);
    updateWeightLabels();
    const nq = new URLSearchParams(location.search);
    nq.set("font", f);
    nq.set("w", w);
    history.replaceState(null, "", "?" + nq.toString());
  };
  document.getElementById("tw-font").addEventListener("change", sync);
  document.getElementById("tw-weight").addEventListener("change", sync);
  requestAnimationFrame(() => document.documentElement.classList.add("loaded"));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
