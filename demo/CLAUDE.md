# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A demo PWA of the HAALVING platform — a Blue Zones "way of living" product. One build
serves two apps: the **client app** (mobile-first, tab bar) and the **Team Console**
(role-scoped, sidebar), seeded with one coherent demo story.

Everything ships in `app/`. **No build step, no package manager, no dependencies** —
plain HTML/CSS/JS loaded by `<script>` tags. The repo root is a git repository
(since 29 Jul 2026); `Rawmaterials/`, `Archives/` and `Agreements/` are
git-ignored — Rawmaterials holds un-anonymized client documents and must never
be committed.

Root-level `.md` files are the source documents the app implements: `HAALVING-PRD.md`,
`HAALVING-Design-Handoff.md`, `HAALVING-Design-System-v2.md` (the current design
direction, "Instrument"). `AGENTS.md` is an auto-generated memory dump, not guidance.

## Commands

```bash
# run it (any static server; the app is entirely client-side)
cd app && python3 -m http.server 8080

# syntax-check a file you edited — there is no linter or test suite
node --check app/js/views/client-plan.js
```

There are no tests. Verification is done in a browser: load a route, log in as the
relevant persona, and check the console is clean. The login screen lists eleven
personas; `Reset demo data` there (or on the client Profile tab) restores the
starting story.

### Shipping a change requires a version bump

Two levers, both mandatory, or a returning user sees stale code:

1. Every `?v=NN` in `app/index.html` (one per asset — bump them together).
2. `const CACHE = 'haalving-demo-vNN'` in `app/sw.js`.

The service worker matches with `ignoreSearch: true`, which **strips the query
string** — so bumping `?v=` alone never invalidates anything. The cache name is the
real lever. If you changed the shape of the seed in `js/data.js`, also bump
`HV.seedVersion`; `HV.boot()` discards a saved store whose `__v` doesn't match.

## Architecture

### Load order is the dependency graph

`index.html` loads scripts in a fixed order and every module hangs itself off one
global: `core.js` (creates `window.HV`) → `data.js` (`HV.seed`) → `vitals.js`
(`HV.vitals`) → each `js/views/*.js` (self-registering). Views may use anything from
core; core must not reference a view. Adding a view means adding it in **three**
places: the file, `index.html`, and the `ASSETS` list in `sw.js`.

### Router and the RBAC gate

Hash-based, in `core.js`. `#/plan/c-rajesh` parses to `{name: 'plan', params: ['c-rajesh']}`.

```js
HV.registerView('journey', {
  title: 'Your journey',
  roles: ['client'],          // omit = any role; router renders a logged lock screen otherwise
  render: function (el, params) { ... },
});
```

`render()` picks the shell from `HV.ROLES[me.role].shell` (`'client'` → tab bar,
`'console'` → sidebar) and hands the view its content element. `standalone: true`
(onboarding) bypasses both the shell and the session check.

**`HV.ROLES` in `core.js` is the RBAC matrix** — per role: `title`, `shell`, `home`,
`nav` (which sidebar items exist) and `perms` (consulted via `HV.can('rawRecords')`).
Access is enforced twice on purpose: the router blocks the route, and sensitive
sub-sections re-check `HV.can()` inside the view. The Doctor is the only role with
`rawRecords`; several screens are written around that being true.

### State

`HV.store` is the whole world, persisted to localStorage under one key. `HV.seed` in
`data.js` is the immutable starting story. Mutating anything means writing to
`HV.store` then calling `HV.save()`, and usually `HV.refresh()` to re-render.

Reference catalogues (`program`, `mealPlans`, `liveRooms`, `cultureCriteria`,
`bodyCriteria`, `calendarsPast`) are refilled from the seed on every boot — they are
content, not user state, so adding one doesn't require a `seedVersion` bump.

Clinical constants live in `js/vitals.js`, deliberately outside the seed: marker
reference bands are facts, not demo data. Categories there are **views, not
partitions** — one marker can belong to several body systems, so markers are defined
once and referenced by key.

### The UI kit

`HV.ui.*` in `core.js` returns **HTML strings**, not elements. Every view follows the
same shape: build one big string, assign `el.innerHTML`, then attach listeners by
querying `[data-*]` attributes. Interpolated data goes through `HV.esc()`.

The kit holds the product's signature instruments — `dial()` (calibrated 270° arc),
`index()` (the four-pillar radar), `gate()` (status-by-exception tile), `ring()`,
`stars()`, `avatar()`, `pill()`, `iconTile()`. `ICONS` is a 68-mark hairline set;
there are no emoji in the product. Overlays are `HV.sheet()` / `HV.closeSheet()`,
`HV.toast()`, `HV.celebrate()`.

Shared layout classes carry the visual system, so prefer them over new CSS: `.card`,
`.trow` (avatar/tile + `.grow` holding `<b>` and `<small>` + trailing pill), `.list`,
`.sec-title`, `.h1-row`, `.stat`, `.grid2`/`.grid3`, `.notice` (+`.warn`/`.bad`),
`.audit` (italic provenance line), `.chip`, `.pill`, `.empty`, `.split`, and the
filter-chip row `.tfil`. Tabular data is `.tablewrap > table.data` — the wrapper
owns the horizontal scroll so the page body never scrolls sideways.

**`.grow` is scoped to `.row`** (`app.css:497`), *not* to `.trow`. Every component
that wants the middle of a `.trow` to expand ships its own rule — `.strow`,
`.pslot`, `.bcrow` and now `.dg-sres` each carry one, two with this exact comment.
Omit it and the trailing pill silently sits mid-row instead of at the edge.

**A view's `<style>` block is written by its `render()`.** Anything reachable from
*another* view — a sheet opened by a cross-view export — must carry that CSS itself,
or it renders unstyled: the staff week strip printed `Mon6:00 am12:00 pm` when Home's
search opened it, because People & Access had never rendered.

Views publish cross-view entry points on `HV` — `HV.clientRecord`, `HV.chatui`,
`HV.planui`, `HV.consoleui`, `HV.capacityPanel`, `HV.peopleui`. Call them **inside a
handler, never at load time**: load order decides which file exists yet, and core
must never reference a view. `HV.peopleui.open(id)` gates itself — the full employee
record for roles holding the `people` nav, a colleague card for everyone else — so
no call site has to know the rule.

## Product model that spans files

Three of these will bite you if you assume otherwise.

**Display names, pillar keys and role keys all differ for the same pillar.** Per
TJ's 30 Jul 2026 naming decision (amended 3 Aug 2026: Mindspace → Mind Wellness),
**Culture is the umbrella brand, not a pillar**:
HAALVING Culture = Nutrition + Fitness + Yoga + Mind Wellness ("all about balance").
`HV.PILLARS` keys stay `fitness / culture / yoga / wellness` (as do CSS `p-culture`
etc. and image paths), but key `culture` **displays as "Nutrition"** (coach role
`dietitian`) and key `wellness` **displays as "Mind Wellness"** (staff role and pod
key `mind`, title "Mind Wellness Coach"). A client record carries the key vocabularies:
`c.levels.wellness` but `c.pod.mind` and `c.sessions.mind`. Never rename the keys —
only `HV.PILLARS[].name` and user-facing copy carry the display names.

**Two plans decide who coaches** (TJ, 16 Aug 2026 — this replaced the three-plan
Black / Grey / White model; those keys no longer exist anywhere). `c.plan` is
`poorna` (all four pillars carried by dedicated human coaches, coordinated by the
Haalving Coach, doctor above them) or `svayam` (the AI guides the client directly,
with human coaches optional per pillar and listed in `c.humanPillars`).
`c.pod` maps role key → staff id, and is deliberately sparse on Svayam.
`HV.staff(id)` returns an AI-coach pseudo-user for a missing or `'u-ai'` id, so an
unfilled pillar seat renders as the AI without special-casing. Two helpers in
`data.js` are the only tests a view should use: `HV.aiLeads(c)` (does the AI speak
to this client at all?) and `HV.humanPillar(c, pillarKey)` (is this pillar carried
by a human?). The invariant the product is built on: *the coach's judgement sits
above the AI's assistance* — a Poorna client never sees an AI rating directly, and
the coach conversations Poorna produces are the training material for Svayam.
`HV.PLANS[k].launch` gates what can actually be sold: **Svayam is `false` for the
first launch**, so onboarding renders it as "Opening soon" and refuses the tap.

**Levels move only at the level review, and each pillar moves on its own.** Clients
run 14-day cycles across 7 levels (review Day 12, meeting Day 14, rest Days 5 and 10 —
all of it read from `HV.shape()`, never typed). There is **no headline level** (TJ, 16 Aug 2026 —
the lowest-pillar rule is retired): the four pillar levels are the whole reading, and
nothing may reduce them to one number. Consequently no caller passes `done:` to
`HV.ui.index()` — a "closed" ring could only mean *every* pillar cleared that level,
which is the retired rule in disguise.

**Automation has two shapes, and they are not interchangeable.** A **workflow
template** (`store.flowTemplates`, authored in Configuration → Automations) is a
named, ordered run of messages fired on a *clock*; a **standing rule**
(`store.padAuto[cid]`, the client's Automations pad) watches for a *condition*.
Both are switched on per client, and neither ever runs for a client it is off
for — `HV.flowOn(cid, tplId)` and `HV.autoOn(cid, key)` are the only two tests,
and both treat an absent record as the default so a template or switch added
later needs no migration (the same contract `HV.announceOn` keeps).

Four rules hold the engine together, and each exists because breaking it caused
a real defect:

- **`store.autoLog` is the once-guard**, key → timestamp, with `-1` meaning
  *skipped, never delivered*. Both sweeps run at boot and every 45 s, so the
  guard is the only thing between a client and four welcomes an hour. Stamp it
  **last**, after everything that could refuse — a burned key loses that step.
- **Switching a flow on skips steps already `'past'`, never ones `'due'`.**
  Skipping past steps stops a twelve-step drip emptying into the thread of
  somebody on cycle day 9; skipping *due* ones silently swallowed the very
  message the coach switched it on to send.
- **A `cycleDay` guard key carries the cycle; an `enrol` key must not.** The
  first recurs every cycle by design, the second happens once in a lifetime.
- **`HV.houseSender(c)` is never a literal `'haalving'` id.** `HV.staff()` signs
  any id it does not know as the AI pseudo-user, so a house account would put
  "AI Coach" on house content — a lie, and a breach of the rule that a Poorna
  client never hears the AI. The store keeps honest attribution; both client
  renderers print HAALVING, and anything carrying `auto: true` says so on its
  face rather than crediting the person whose seat sent it.

Both sweeps take their clock in `o` (`{nowMin, todayISO}`) for the same reason
`HV.conflicts` takes its world there: a rule whose whole job is reading the time
cannot be verified by a caller that cannot move it. Quiet hours (22:00–07:00,
`notifRules` n5) are enforced in `HV.flowSweep`, so a suite run at 23:44 will
watch every delivery assertion fail unless it passes a daytime `nowMin`.

**Nothing may put a person in a slot without asking `HV.conflicts()` first.** The
engine in `core.js` answers three questions — `busyAt` (someone already holds these
minutes), `outsideHours` (they are not working then), `onLeaveAt` (approved leave) —
and every writer consults it: the seed's booking generator, the Schedule sheet, both
drag paths, and the leave cover board. **It is pure**: it takes `{tasks, users,
leaves}` in `o` and only falls back to `HV.store`, because `data.js` calls it at parse
time when the store is `null`. Three distinctions are load-bearing, and each exists
because collapsing it broke something real:

- **`t.allowOverlap` needs BOTH sides** (TJ, 17 Aug 2026 — this reversed the earlier
  "the calendar never rejects" rule). Overlap is refused unless the incoming task and
  every task it lands on both permit it.
- **`t.rhythm` is not an appointment.** A standing to-do pinned to a nominal hour (the
  daily reminder sweep) holds no capacity and blocks none, in either direction. These
  never draw on the grid — the Daily-rhythm strip owns them.
- **`o.hoursFor` narrows the declared-hours check to the people NAMED on a task.** You
  can refuse to put a named person somewhere; you cannot refuse to invite a team. No
  hour satisfies twelve windows at once (Lakshmi finishes at 12:00, Meera starts at
  14:00), so enforcing hours on group invitees makes the SOP unschedulable. Busy and
  on-leave still bind everyone.

**`u.avail[weekday]` holds one range or several** — `['09:00','17:00']` or
`[['06:00','10:00'],['17:00','21:00']]`. Read it only through `HV.availWindows`;
every helper that indexed `win[0]`/`win[1]` directly returned *nothing* for a split
shift, silently. `HV.availFits` requires ONE window to hold the whole session, so a
session straddling the gap does not fit. **`HV.store.capacity` is a different
question** — how many clients a coach carries, deliberately narrative (Vikram reads
50/50 FULL while carrying six) — and must not be derived.

## Design system

Fully tokenised in `app/css/app.css`; the rationale is in `HAALVING-Design-System-v2.md`.
Use tokens, not raw values — spacing is a strict 4-base scale (`--s1`…`--s10`), type is
8 fixed steps with **nothing below 12px**, radius is five tokens, elevation three.

Two rules are load-bearing and easy to break:

- **Serif is for data.** Every numeral in the app is set in `--f-data` (Newsreader,
  self-hosted, preloaded). Prose is the system sans. Apply it with `class="num"`.
- **A pillar's colour appears only in that pillar's own dial, dot, ribbon and series.**
  The moment it is used decoratively it stops being a signal.

Cards carry tone and shadow, never a 1px border. Dark mode is a designed counterpart
via `prefers-color-scheme`, not an inversion — check both, and check contrast when
introducing a colour: `--brand`/`--danger` are *ink on neutral grounds*, while
`--brand-fill`/`--danger-fill` are *grounds that carry white text*.
