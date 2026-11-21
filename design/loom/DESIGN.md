# Loom: the Tapestry design system

This file is the source of truth for how Tapestry looks: colour, type, weights, corners and the thread motif. When this file and the code disagree, the code is wrong and gets changed to match. This file only changes when Giselle approves the change.

- **Reference mock:** `design/loom/my-day.html` (screenshot: `my-day.png`, 1440×900). It shows these rules on My day. If the mock and this file disagree, this file wins.
- **Status (2026-11-21):** applied on the web: tokens, font, list colours and weights (#32); threads, labels and grid blocks (#33); and every component colour on tokens (`loom-cleanup`). Not yet applied: mobile `theme.ts` (it has its own palette and a dark mode).
- **History:** the directions that weren't chosen (Indigo, Daylight) and the type specimen are in `design/archive/my-day-directions/`.

## Principles
1. **Quiet and light.** Light only. White surfaces on a cool paper, ink text, and colour only where it means something: list colours, open time, risk, now.
2. **Ink, not grey.** Text is blue-black ink (`#1B2233`) and blue-grey, never neutral zinc.
3. **One signature: threads.** Every to-do is a thread in its list colour. Threads are the only decorative element, and each one carries data (which list, and done or not). Don't add other decoration.
4. **Same scale everywhere.** Sizes come from the type scale and radius tokens below. Don't introduce one-off sizes.
5. **No template chrome.** Labels are in sentence case: no uppercase, tracked-out labels. No gradients or glows. Shadows only as the card and pop tokens.

## Colour
Values for the CSS variables in `apps/web/app/globals.css` (the names exist today, so applying Loom changes values, not names).

| Variable | Loom | Was | Use |
|---|---|---|---|
| `--paper` | `#EEF0F3` | `#ECECEE` | App background behind panes; token-sheet background |
| `--rail` | `#F6F7F9` | `#F7F7F8` | Sidebar |
| `--surface` | `#FFFFFF` | same | Panes, header, inputs |
| `--ink` | `#1B2233` | `#18181B` | Primary text (15.9:1 on white) |
| `--muted` | `#5F6B80` | `#71717A` | Secondary text, dates, stats (5.4:1 on white) |
| `--faint` | `#98A1B2` | `#A1A1AA` | Tertiary meta, placeholders, hour labels, counts (2.6:1; see note) |
| `--line` | `#E3E6EC` | `#E5E7EB` | Borders on controls, plan pane |
| `--line-soft` | `#EEF0F4` | `#F0F0F2` | Row dividers, pane borders, empty threads |
| `--line-strong` | `#CDD2DC` | `#D4D4D8` | Grips, hover borders |
| `--row` | `#F7F8FA` | `#FAFAFA` | List rows, row hover |
| `--row-hover` | `#F0F2F5` | `#F4F4F5` | Ghost button hover |
| `--active` | `#E9ECF2` | `#EDEDEF` | Active nav item |
| `--chip` / `--chip-ink` | `#EEF0F4` / `#4A5468` | `#F0F0F2` / `#52525B` | Due chips, avatar, secondary text in rows |
| `--event` / `--event-ink` | `#EEF0F4` / `#4A5468` | `#F0F0F2` / `#52525B` | Google Calendar events |
| `--open` / `--open-line` / `--open-ink` | `#E8F4F2` / `#A9D4CD` / `#2F7A70` | sage | Open time (dashed), booked-time chips, synced dot |
| `--now` | `#3452D6` | coral `#D9775E` | Now-line and its time label |
| `--accent` (new) | `#3452D6` | none | Primary button, focus ring, active-nav thread, day dot |
| `--focus` | `#3452D6` | `#5C88C7` | Focus ring (same as accent) |
| `--risk` / `--risk-bg` | `#B42318` / `#FDF0EE` | `#A04B35` / `#F9ECE7` | Overdue, short on time, over-booked |
| `--warn` / `--warn-bg` | `#8A6110` / `#FBF3DF` | `#7A5E1E` / `#FAF3DF` | Streaks, reconnect banner |
| `--shadow-ink` | `27 34 51` | `24 24 27` | Shadow colour for `--shadow-card/pop/sheet` |

Derived (not shown in the mock; check when applying): `--open-active` `#DDF0EC`, `--open-active-line` `#86C3B9`, `--grape-bg` `#F3F0FC`, `--grape-ink` `#5A43A8`.

**Accent is for actions and "now" only:** the now-line, focus ring, primary button, active nav and day dot. It is never a list colour and never decoration.

### Colour in controls
- **On solid fills** (ink, accent, risk): text and icons are `--surface`. Overlays are `--surface` or `--ink` at an opacity (`bg-surface/60`, `bg-ink/10`), never white or black.
- **Buttons:** accent for the main action of a screen or dialog (Quick add, Find time, Find tasks with AI, Import, Sync now). Ink for confirming inside a form or sheet (Done, Add, Save). Risk for destructive confirms.
- **Selected option** (segmented controls; priority, estimate and day choices): ink fill, `--surface` text.
- **Switches:** accent when on, `--line-strong` when off, including the calendar switches in Settings.
- **List-colour headers** (task sheet, To-dos list cards): the list's tint with its tuned ink, never the solid colour.
- **Priority** is not a list colour: high is `--warn`, medium `--chip-ink`, low `--muted` (bars and chips).
- **Drag and drop:** grape (`--grape-bg`, `--grape-ink`, the grape hue at 15% for the drop ghost, and the drop line). It's the one place a list hue is used for UI state.
- **AI features** (Break down, AI icons, the import spinner): `--grape-bg` / `--grape-ink`.
- **Synced and success marks:** `--open-ink`.
- **Brand:** the coral check in the logo and the coral dot in "tt." are the brand mark and stay coral.
- **External colours:** Google's four-colour mark in Settings and Google's calendar colour map (`lib/gcal/sync.ts`) keep Google's hex values. They're the only hex values in components.

**Faint grey is a deliberate choice.** At 2.6:1 it is below WCAG AA. Giselle reviewed it and kept it (2026-11-21) because it reads fine. Use it only for tertiary information that's also available elsewhere (counts, estimates, hour labels, placeholders, "Every day"). Anything the user must read to act (risk, buttons, titles, the free-time warning) uses muted or stronger.

### List colours
Equal lightness, so no list shouts. These replace `HUES` in `packages/shared/src/format/color.ts` and the `--tt-*` variables.

| Hue | Loom | Was |
|---|---|---|
| sky | `#3F7DDB` | `#5C88C7` |
| grape | `#7C5CD6` | `#8775C9` |
| sun | `#D4972A` | `#E3BA55` |
| pink | `#D0577E` | `#C97A9F` |
| coral | `#D2694A` (derived) | `#D9775E` |
| mint | `#3B9B6E` (derived) | `#5AA585` |
| slate | `#8790A3` (derived) | `#8A8FA6` |

On list colours: list names in meta lines use the hue mixed 78% with ink. Booked blocks use a 14% tint of the hue on white, with text at 70% hue / 30% ink.

## Type
- **Family:** Schibsted Grotesk, loaded with `next/font/google` (weights 400, 500, 600), replacing Geist. One family for everything.
- **Weights by role** (the "Medium" set):
  - **400 body:** meta, dates, stats, hints, inputs, placeholders.
  - **500 names:** to-do titles, nav items, list-row titles, event and block titles, buttons, chips.
  - **600 headings:** day heading, page and pane titles, tab labels, section labels, brand name.
  
  Nothing is heavier than 600.
- **Numerals:** tabular figures only on counts that line up (`2/5`, list counts). Don't turn on `tnum` globally: Schibsted's tabular colon and comma make "1 : 15" and "Lab 6 : shell" look spaced out.

| Size | Weight | Use |
|---|---|---|
| 18 | 600 | Day heading ("Today"), letter-spacing −0.015em |
| 15 | 600 | Page title in the header, brand name |
| 13 | 400 / 500 | Body text and inputs (400); to-do titles and nav (500). Base size of the app |
| 12 | 600 / 400 / 500 | Section labels, pane and tab titles (600); stats line (400); buttons and list-row titles (500) |
| 11 | 400 | Meta lines, hints, subtitles, counts |
| 10 | 400 / 500 | Hour labels, chip text, slot times |

- **Section labels** ("Every day", "Plan", "Coming up") are sentence case, 12/600, in ink. A count sits right-aligned at 11/400 faint; a note follows after "·" at 11/400 faint. The "Every day" label carries a 12px repeat icon in `--open-ink`.

## Corners and spacing
Uses the existing radius tokens in `globals.css`:

| Size | Token | Where |
|---|---|---|
| 12 | `rounded-2xl` | Panes |
| 10 | `rounded-xl` | Tab tops |
| 8 | `rounded-lg` | Controls (buttons, quick add, icon buttons) |
| 6 | `rounded-md` | Rows, calendar slots, add buttons |
| 4 | `rounded-sm` | Chips |
| full | — | Threads and checks |

Booked blocks have a squared thread edge: corners 2 / 6 / 6 / 2.

Control heights are 28 (`h-7`) and 24 (`h-6`); checks are 16 in rows and 14 in list panes. The plan column is at most 640 wide with 24 padding; panes are 10 apart.

## Threads (the signature)
- **What a thread is:** a 3px-wide, fully rounded bar in the list colour.
- **Plan and "Every day" rows:** a thread on the left edge, inset 8px top and bottom. At 35% opacity when the to-do is done.
- **Booked blocks in the Day pane:** a 3px left edge in the list colour, so a planned to-do and its time on the calendar read as the same thread.
- **Google Calendar events are not threads.** They are a plain `--event` card (`--event-ink` text, corners 6) with a 6px dot in the calendar's colour before the title. Free (not busy) events are a dashed `--line-strong` outline. All-day events use the same chip.
- **Active nav item:** an accent thread on the sidebar's left edge.
- **Progress:** a strip of threads, one per to-do that day (routines first, then the plan, in order). Each is 4px tall, 4px apart and equal width. Empty threads are `--line-soft`; done ones fill in their list colour. This replaces the single mint progress bar, and it sits under the stats line ("3 of 8 done · 4h 15m planned · 3h 30m free").
- **Motion:** the only automatic animation. On first load, done threads fill left to right (0.5s, staggered 70ms). It's turned off under `prefers-reduced-motion`. Everything else animates only in response to the user.
- **Don't** use threads anywhere else as decoration, or turn other bars into threads.

## Rules for new UI
- Use the tokens above: no hex values, `white`/`black` utilities or Tailwind palette colours in components, and no sizes outside the scale.
- **Figma:** colours and structure come from Figma; sizes snap to this scale (as in the global Figma rule).
- If something isn't covered here, propose an addition to this file and wait for approval before inventing.

## Applying Loom
Done on the web (2026-11-21). The next step is mobile: move `apps/mobile` `theme.ts` onto these tokens (it already gets the list colours through the shared `swatch()`), and decide what happens to its dark mode. Check each screen against `my-day.png`, then update the Status line above.
