# Inside-Pages Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the onboarding pages' cinematic materials (scene, kicker/display voice, instrument motion, earned celebrates, food imagery) into every inside page and console view, per `docs/superpowers/specs/2026-08-02-inside-pages-life-design.md`.

**Architecture:** Promotion over invention — the lobby's one-off scoped CSS becomes shared classes; existing instruments (rings, index, gates, bar strips) travel into flat views; a small lazy-loaded food-image set fills the `.mealph` seams; rules get codified into Design System v2.

**Tech Stack:** Plain HTML/CSS/JS, no build (`window.HV` global, views as IIFEs). Verification = `node --check` + Node smoke harness + browser pass. **This repo is NOT a git repository — wherever a normal plan would commit, this plan verifies instead.**

## Global Constraints

- No build step, no dependencies. Views build HTML strings; interpolation through `HV.esc()`. No emoji; icons via `HV.ui.icon`. Numerals wear `class="num"`.
- **One moment per page:** exactly one kicker + display sentence per page/view. Two scenes on one page is a defect.
- **Colour law:** a pillar's colour only in that pillar's own dial/dot/ribbon/series. Scenes and food photos stay neutral-warm.
- **Celebrations:** exactly three earned moments exist after this plan — meal star reveal, day complete, level up (existing). Add no others.
- **Motion:** only tokens `--ease`, `--ease-spring`, `--d-fast/base/slow`; every new rule inert under `prefers-reduced-motion` (a global kill switch already exists in app.css — new keyframes/transitions must be inside or covered by it).
- **Voice:** quiet, human sentences; banned words in client-facing copy: fail, failed, streak, crush, grind, smash.
- **Weight:** `img/food/` total ≤ 400KB, each file ≤ 30KB, `loading="lazy"`, NOT added to `sw.js` ASSETS.
- **Ship levers (three-places rule):** any change ships only with a bump of every `?v=` in `app/index.html` AND `CACHE` in `app/sw.js`; seed-shape changes also bump `HV.seedVersion` in `app/js/data.js`. **Other Claude sessions edit this repo concurrently — re-grep the live version values at ship time; adopt the highest.**
- Line numbers in this plan are anchors from 2026-08-02 research; **match by quoted code, not line number** — the files drift.

---

### Task A1: Promote the scene system into shared classes

**Files:**
- Modify: `app/css/app.css` (the three scoped copies: `.login-hero` scrim ~231–236, `.ob` backdrop/night tokens ~1353–1378, `.obslide` scrim ~2017–2020, kicker ~1418–1420, question-as-screen ~1396–1404, glass buttons in the login lockup block ~248–277)

**Interfaces:**
- Produces (for every later task): CSS classes `.kicker`, `.display` (+ `.display + .sub`), `.btn.glass`, `.scene` (card-scale photographic ground: child `.bg` image layer, `.scrim-y` twin-gradient layer, `.fg` content layer), `.scene.night` (the dark-token override currently welded to `.ob`).

- [ ] **Step 1: Read the current literal values.** Open `app/css/app.css` and copy the exact declarations of: the login scrim gradients, the `.ob` dark token block, the `.obslide` scrim, the onboarding kicker (letter-spacing/size/colour), the question heading (`.display`-to-be), and the frosted glass button. These literals are the source of truth — the code below uses them by name; where a value differs, **the file wins** (pixel-identical lobby is the acceptance test).

- [ ] **Step 2: Add the shared family** near the tokens section (after the button family is fine):

```css
/* ── the scene family — the lobby's materials, promoted ──────────────
   A scene is a photographic ground a card-scale surface can wear.
   .bg carries the image, .scrim-y inks only the top and bottom (the
   middle stays clear glass), .fg holds the content. .night restates
   the dark tokens the onboarding flow already uses. */
.scene { position: relative; overflow: hidden; border-radius: var(--r-lg); color: #fff; }
.scene > .bg { position: absolute; inset: 0; background-position: center; background-size: cover; }
.scene > .scrim-y { position: absolute; inset: 0;
  background: <the login scrim's two gradients, copied verbatim>; }
.scene > .fg { position: relative; padding: var(--s5); }
.scene.night { <the .ob dark token block, copied verbatim>; }
.kicker { <the onboarding chapter-kicker declarations, copied verbatim>; }
.display { <the question-as-screen heading declarations, copied verbatim>; }
.display + .sub { max-width: 36ch; }
.btn.glass { <the frosted login secondary-button declarations, copied verbatim>; }
```

- [ ] **Step 3: Refactor the three copies to consume the shared rules** — `.login-hero`'s scrim block, `.ob`'s token/backdrop block, `.obslide`'s scrim, and the onboarding kicker/question selectors become either `@extend`-style duplicated selectors (`.login-hero .scrim, .scene > .scrim-y { … }` collapsed to one rule) or the markup gains the shared class. Prefer collapsing selectors in CSS only — zero JS/markup change keeps the pixel-identical guarantee trivial.

- [ ] **Step 4: Verify pixel-identical.** `node --check` is N/A for CSS; instead serve the app (`cd app && python3 -m http.server 8081`) and eyeball login + all nine onboarding steps against the live version before the change (open a second copy from `git`-less backup: copy `app.css` to `app.css.bak` before Step 2 and A/B by swapping). Both light and dark scheme. Delete `app.css.bak` after.

### Task A2: Instrument motion pack

**Files:**
- Modify: `app/css/app.css` (`.ishape`/`.ighost` ~1096–1131, `.mbar .dot` ~1686–1688, `.gate.miss` ribbon ~597–599, `.lvlmap` cells ~1069–1084, `.chat .msg` ~806–812)
- Modify: `app/js/core.js` (add `HV.countUp` beside `HV.fmtMins`)

**Interfaces:**
- Produces: `HV.countUp(el, to, opts?)` — animates `el.textContent` from `opts.from||0` to `to` over `opts.dur||700`ms, cubic ease-out, `en-IN` locale grouping; instant under reduced motion.

- [ ] **Step 1: CSS motion rules** (each inside/covered by the existing reduced-motion kill):

```css
/* instruments breathe: the radar settles in rather than snapping */
.index svg { animation: fade var(--d-slow) var(--ease); }
.index .ishape { transform-origin: center; animation: pop var(--d-slow) var(--ease); }
.mbar .dot { transition: left var(--d-base) var(--ease); }
.gate.miss::after { animation: rise var(--d-base) var(--ease); }
.lvlmap td, .lvlmap .cell { transition: background var(--d-base) var(--ease), color var(--d-base) var(--ease); }
.chat .msg:last-child { animation: rise var(--d-fast) var(--ease); }
```
Reuse the existing `rise`/`fade`/`pop` keyframes (they exist — verify names at ~214–221 and the overlay block ~974–999; if `pop` scales from 0.92→1 it is right for the radar). Match `.lvlmap`'s real cell selector in the file.

- [ ] **Step 2: `HV.countUp` in core.js**, placed next to `HV.fmtMins`:

```js
/* count-up for a numeral that is the page's subject; instant under reduced motion */
HV.countUp = function (el, to, opts) {
  opts = opts || {};
  to = Number(to) || 0;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = to.toLocaleString('en-IN'); return;
  }
  const from = Number(opts.from) || 0, dur = Number(opts.dur) || 700, t0 = performance.now();
  (function tick(t) {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString('en-IN');
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
};
```

- [ ] **Step 3: Wire count-up where a numeral is the subject** — the Trackers big readings (`client-trackers.js`, `.tk-read` numerals) and the Vital Panel dial value only. Pattern: render the final value in the HTML as before, then in the view's wiring phase `el.querySelectorAll('[data-countup]').forEach(n => HV.countUp(n, Number(n.dataset.countup)))` with the markup emitting `<span class="num" data-countup="6100">6,100</span>` (pre-filled so no-JS/reduced-motion still reads).

- [ ] **Step 4: Verify.** `node --check app/js/core.js app/js/views/client-trackers.js`. Browser: Trackers numbers count up once per entry; radar settles; toggle OS reduced-motion → everything instant. Dark mode unchanged.

### Task A3: Voice kit — `HV.ui.empty` and the copy sweep

**Files:**
- Modify: `app/js/core.js` (add `empty` to `HV.ui`)
- Modify: every view using bare `.empty` markup (grep `class="empty"` across `app/js/views/`)

**Interfaces:**
- Produces: `HV.ui.empty(icon, sentence, sub?)` → HTML string.

- [ ] **Step 1: Add to `HV.ui`:**

```js
/* an empty state that speaks — a sentence a human would say, never just an icon */
empty: (icon, sentence, sub) =>
  '<div class="empty"><span class="big">' + (ICONS[icon] || ICONS.leaf) + '</span>' +
  HV.esc(sentence) + (sub ? '<br><span class="sub">' + HV.esc(sub) + '</span>' : '') + '</div>',
```

- [ ] **Step 2: Sweep call sites.** `grep -rn 'class="empty"' app/js/views/` and replace each with `HV.ui.empty(...)` carrying authored copy. Required rewrites (write these exact sentences; keep any existing ones that already speak):
  - Today empty pillar drawer: `'Nothing on the plan here today.'` / sub `'Rest is part of the programme — your body banks it.'`
  - Coach empty thread: `'Your circle is quiet right now.'` / `'Say anything — someone who knows your story reads this.'`
  - Console clients none allocated: `'No clients allocated to you yet.'` / `'Ops assigns your first pod from Onboarding.'`
  - Approvals empty queue: keep `'Nothing waiting on you. Charts move fast here.'`
  - Circles inbox empty: `'No rooms yet.'` / `'Rooms open as clients join your pods.'`

- [ ] **Step 3: Verify.** `node --check` each touched file; banned-word grep: `grep -rniE "\b(fail|failed|streak|crush|grind|smash)\b" app/js/views/client-*.js` — investigate any hit that is a client-facing string (identifiers/comments are fine).

### Task B4a: Food image set

**Files:**
- Create: `app/img/food/<meal-id>.webp` (one per record in `HV.seed.meals` that has `dishes`)

- [ ] **Step 1: Enumerate subjects.** `node -e` over `app/js/data.js` is brittle; instead open `data.js`, find `meals: [` (~227) and list every `{id, dishes}` pair.
- [ ] **Step 2: Generate.** For each meal, invoke the `higgsfield-generate` skill (GPT Image 2) with: *"Overhead photograph of a home-cooked Indian meal on a steel or ceramic plate, [dishes joined], warm late-morning window light, matte editorial food photography, realistic home kitchen table, no people, no text"*. Square 1:1. **These are real-home-food register — never white-plate Western salads.**
- [ ] **Step 3: Compress.** `cwebp -q 72 -resize 512 512 in.png -o app/img/food/<id>.webp` (install check: `which cwebp || brew install webp`). Each ≤ 30KB (`ls -l`), else drop `-q` to 60.
- [ ] **Step 4: Budget check.** `du -ck app/img/food/*.webp` ≤ 400KB total.
- [ ] **Fallback:** if generation is unavailable in the executing environment, skip this task entirely — Task B4b's seam degrades to the bowl icon and every other task proceeds.

### Task B4b: Meal flow wears the photos + earns its celebrate

**Files:**
- Modify: `app/js/data.js` (each seeded meal gains `photo: 'img/food/<id>.webp'` for ids with images; **bump `HV.seedVersion`**)
- Modify: `app/js/core.js` (add `HV.ui.mealArt`), `app/css/app.css` (`.mealph.has-photo`)
- Modify: `app/js/views/client-meal.js` (`.mealph` sites ~61, 122, 135, 161, 308, 322; star reveal ~291–303; pending walls ~304–327)

**Interfaces:**
- Produces: `HV.ui.mealArt(meal, cls?)` → HTML string; consumed by Tasks B8/C10c too.

- [ ] **Step 1: Core helper + CSS:**

```js
/* the meal's photograph when it exists; the bowl mark otherwise */
mealArt: (m, cls) => m && m.photo
  ? '<span class="mealph ' + (cls || '') + ' has-photo"><img src="' + HV.esc(m.photo) + '" alt="" loading="lazy" decoding="async"></span>'
  : '<span class="mealph ' + (cls || '') + '">' + (ICONS.bowl || '') + '</span>',
```
```css
.mealph.has-photo { padding: 0; }
.mealph.has-photo img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block; }
```

- [ ] **Step 2: Replace every `.mealph` construction in `client-meal.js`** with `HV.ui.mealArt(meal, sizeCls)` (pass the meal record; keep the size class each site used).
- [ ] **Step 3: The star reveal celebrates.** In the rated branch (~291–303), after render, fire once per meal: guard `if (!HV.store.mealCelebrated) HV.store.mealCelebrated = {};` keyed by meal id; `HV.celebrate('star', 'Rated ' + stars + ' stars', <the dietitian's note first sentence or 'Your dietitian looked at this plate personally.'>)`; set flag + `HV.save()`. Diya register — no extra effects.
- [ ] **Step 4: Voice the pending states** (~304–327): replace the notice walls with one card: photo (mealArt) + kicker `'WITH YOUR DIETITIAN'` + sentence `'Sneha sees this exactly as you sent it. A rating usually lands within the hour.'` (resolve the dietitian's real first name from `c.pod.dietitian` via `HV.staff`).
- [ ] **Step 5: Verify.** `node --check` data.js/core.js/client-meal.js. Seed bump: `HV.seedVersion` +1. Browser as Rajesh: capture flow shows photos, rating shows celebrate exactly once, reload does not re-celebrate. `sw.js` ASSETS untouched.

### Task B5: Today — scene heads, voiced empties, day-complete celebrate

**Files:**
- Modify: `app/js/views/client-today.js` (drawer heads ~139–262, daily read ~300–311/349–359, empties ~237–240)

- [ ] **Step 1: Drawer heads.** Each pillar `<details>` summary gains the pillar's plate (`HV.ui.plate(k, 'sm')` — exists) at the left of the existing title. No pillar colour outside the plate itself.
- [ ] **Step 2: Empties** via `HV.ui.empty` copy from A3.
- [ ] **Step 3: Day-complete celebrate.** Where a session is marked done (search `status = 'done'` / `sessions[` increment in this file and `client-plan.js` task sheet — the mark-done lives in plan's `openTaskSheet`), after `HV.save()`: if every today-item for the client is now `done`, and `HV.store.dayCelebrated[c.id] !== (c.cycle + '-' + c.day)`, fire `HV.celebrate('sun', 'Day ' + c.day + ' complete', 'Every part of today, done. Tomorrow is already laid out.')`, set the flag, save. Implement the check as a small local `dayDone(c)` reading today's calendar items.
- [ ] **Step 4: Daily read illustration.** The read card (~300–311) gains an existing clay task image if one fits its topic (check `app/img/` inventory); if none fits, keep the icon tile — do not generate a new asset for this.
- [ ] **Step 5: Verify.** `node --check`; browser: complete the last session of Rajesh's day → one celebrate; reload → none.

### Task B6: Plan sub-routes adopt instruments

**Files:**
- Modify: `app/js/views/client-plan.js` (plan-detail ~736–995: bookHtml ~795–840, progressHtml ~905+; plan-full day rows ~693–709; ledger ~390–405)
- Read for reuse: `app/js/views/client-trackers.js` (`barsHtml` ~17–34), `client-plan.js` own `pmark` (~228–233)

- [ ] **Step 1: Progress tab** gains the Trackers bar-strip: extract `barsHtml` from client-trackers.js into `HV.ui.weekBars(weekArray, todayValue, target)` in core (move, don't copy — update client-trackers.js to consume it), then render the client's `trackers.week.steps` and `.water` strips in plan-detail's Progress tab above the stat tiles.
- [ ] **Step 2: bookHtml rows** get the `pmark` plate-in-ring glyph as their leading mark (the helper is in this same file — reuse, don't duplicate).
- [ ] **Step 3: Ledger delta chips.** Each `goalLedger` row with a `result` renders the existing delta-chip pattern (Design System §"delta chip" — the markup pattern already exists in the plan hub's report card; reuse its classes) showing target vs result.
- [ ] **Step 4: plan-full day rows** replace their text label prefix with the same `pmark` status glyphs used by the calendar.
- [ ] **Step 5: Verify.** `node --check` core/client-plan/client-trackers; browser: Trackers unchanged visually; plan-detail Progress shows strips; no console errors on `#/plan-detail/fitness/progress`.

### Task B7: Profile lower half

**Files:**
- Modify: `app/js/views/client-profile.js` (~316–410)

- [ ] **Step 1:** Each lower section (Medical notes, Records Vault, Notifications, Consents, Account) gains a `.kicker` heading line above its existing title (e.g. `YOUR RECORDS`, `HOW WE REACH YOU`, `YOUR DATA, YOUR CALL`). This is the page's one moment spread as section rhythm — no scene, no display sentence here (the Vital Panel above is already the page's hero).
- [ ] **Step 2:** Records Vault rows lead with `HV.ui.iconTile('doc')` (exists) — keep text otherwise.
- [ ] **Step 3: Verify.** `node --check`; browser dark+light.

### Task B8: Journey + Coach edges

**Files:**
- Modify: `app/js/views/client-journey.js` (~100–109, 162–169, 194–199), `app/js/views/client-coach.js` (meal messages ~129–137, empty state)

- [ ] **Step 1:** Journey care-team section gains kicker `THE PEOPLE AROUND YOU` + one display-voice sentence: `'Seven seats, one promise — a human reads before anything reaches you.'`; rows unchanged.
- [ ] **Step 2:** Coach meal messages render `HV.ui.mealArt(meal, 'sm')` instead of the bowl span.
- [ ] **Step 3:** Coach empty state via `HV.ui.empty` (copy from A3). Observation Journey variant's notice copy voiced: `'Five quiet days — we learn your normal before we shape it.'`
- [ ] **Step 4: Verify.** `node --check` both; browser as Rajesh + Priya.

### Task C9: Console quiet scene — kickers everywhere

**Files:**
- Modify: `app/js/views/console-digest.js`, `console-clients.js`, `console-circles.js`, `console-approvals.js`, `console-builder.js`, `console-meals.js`, `console-medical.js`, `console-pipeline.js`, `console-ops.js` (each view's `.h1-row`)

- [ ] **Step 1:** Each console view's header gains one `.kicker` above its `.h1`: Digest `THIS MORNING`, Clients `YOUR PEOPLE`, Circles `THE ROOMS`, Approvals `THE CHAIN OF SIGNATURES`, Builder `CHARTS & PLANS`, Meals `PLATES WAITING`, Medical `THE DOCTOR'S DESK`, Pipeline `ARRIVALS`, Ops/Worklist `THE BOARD`, Schedule `TODAY'S HOURS`, Reports `THE LEDGER`. One per view, nothing else added.
- [ ] **Step 2: Verify.** `node --check` all; browser: no double-kicker anywhere (Client 360 header keeps none — the roster view carries it).

### Task C10a: Digest instruments

**Files:**
- Modify: `app/js/views/console-digest.js` (~218–249)
- Read for reuse: `console-clients.js` `sessionRings`/`levelBadges` (~41–55)

- [ ] **Step 1:** Move `sessionRings` and `levelBadges` (with their `SESSION_COLOR`/`SESSION_NAME` maps) from console-clients.js into a small shared namespace `HV.consoleui = { sessionRings, levelBadges }` defined in console-clients.js and consumed at render time (same load-order pattern as `HV.chatui` — document with a one-line comment).
- [ ] **Step 2:** Digest stat trio: each `.stat` becomes the number inside `HV.ui.ring` (clients today → ring pct of roster seen; high flags → ring in danger tone only when > 0 — red is safety, this is safety).
- [ ] **Step 3:** Attention rows gain `HV.consoleui.levelBadges(c)` under the text and `HV.consoleui.sessionRings(c, 'sm')` trailing.
- [ ] **Step 4: Verify.** `node --check` both files; browser as Sneha (scoped) and Suresh K (all): rows carry rings, badge colours correct per pillar.

### Task C10b: One stepper instrument for Approvals + Builder

**Files:**
- Modify: `app/js/core.js` (add `HV.ui.stepper`), `app/js/views/console-approvals.js` (~26–40), `app/js/views/console-builder.js` (~40–56)

**Interfaces:**
- Produces: `HV.ui.stepper(ap)` → HTML chip-row string derived from `HV.store.chains[ap.type]` + `ap.status/ap.stage` (+ calendar Confirmed chip via `HV.store.proposedCalendars[ap.clientId]`).

- [ ] **Step 1: Core instrument** (logic verbatim from the two existing implementations, unified):

```js
/* the signature chain as one instrument: Draft → each signing role → Published (→ Confirmed) */
stepper: (ap) => {
  const ch = (HV.store.chains && HV.store.chains[ap.type]) || [];
  const steps = ['Draft'].concat(ch.map(s => HV.ROLES[s.role].title), ['Published']);
  if (ap.type === 'calendar') steps.push('Confirmed');
  const conf = ap.type === 'calendar' && ap.clientId &&
    HV.store.proposedCalendars[ap.clientId] && HV.store.proposedCalendars[ap.clientId].confirmed;
  const cur = ap.status === 'draft' ? 0
    : ap.status === 'published' ? (conf ? steps.length - 1 : ch.length + 1)
    : 1 + (ap.stage || 0);
  return '<div class="hswrap" style="overflow-x:auto"><div class="row" style="flex-wrap:nowrap">' +
    steps.map((s, i) =>
      '<span class="chip ' + (i < cur ? 'sel' : i === cur && ap.status === 'submitted' ? 'warn' : i <= cur ? 'sel' : '') + '">' +
      HV.esc(s) + '</span>').join('') + '</div></div>';
},
```
Before adopting, diff this logic against BOTH current implementations — if either handles a state this misses (returned drafts, prospect calendars), fold that in; the two views must render identically to their current output for every seeded approval.

- [ ] **Step 2:** Replace both views' local stepper builders with `HV.ui.stepper(ap)`; delete the dead local code. Chart/diet approval cards additionally show `HV.ui.pillarChip(ap.pillar)` when `ap.pillar` is set (its own pillar only — colour law).
- [ ] **Step 3:** Approvals headline: replace the count pill with `HV.ui.ring(queue.length ? 100 : 0, 'brand', String(queue.length), 'sm')` + label `waiting on you`.
- [ ] **Step 4: Verify.** `node --check` all three; browser: walk every seeded approval as Suresh K, Rohan, Bineesh — steppers identical states to before, plus pillar dots on chart/diet items.

### Task C10c: Circles + Meals instruments and photos

**Files:**
- Modify: `app/js/views/console-circles.js` (header ~492–503, list rows ~279–301, meal sheet ~140–152), `app/js/views/console-meals.js` (~100, ~192, rubric ~59–64 render)

- [ ] **Step 1:** Open-circle header gains `HV.consoleui.sessionRings(c, 'sm')` and the small Index — reuse `headerIndex` by moving it into `HV.consoleui.headerIndex` (from console-clients.js ~176–205, same move pattern as C10a).
- [ ] **Step 2:** Meal renders in circles (sheet + message rows) and meals (queue rows + composer) use `HV.ui.mealArt(meal, cls)` — photos land automatically from B4.
- [ ] **Step 3:** Rubric as gate-grid: on rated meals, render `meal.final.rubric` entries with `HV.ui.gate(HV.ui.icon('check'), key, value, value.indexOf('0 /') === 0 ? value : null)` inside a `.gate-grid` (pattern proven in console-builder ~294–319).
- [ ] **Step 4:** Circles inbox rows gain a quiet risk cue: rows for `c.risk === 'high'` prepend the existing warn-tone left border pattern (reuse `.notice.warn`'s border token as an inline `border-left`, or the file's existing risk pill if a border reads too loud) — high-risk rooms must be findable at a glance without adding colour noise to steady rooms.
- [ ] **Step 5 (builder goalsheet):** In `console-builder.js`, re-render the goalsheet department sign-off (`goalGrid`, ~62–76) as the same gate-grid pattern: one `HV.ui.gate` tile per pillar — met = `departments[p] === 'approved'` (silent), pending = miss flag `'Awaiting sign-off'`. Keep the sign-off tap targets working (the gate tile becomes the button, `data-*` preserved).
- [ ] **Step 6: Verify.** `node --check` circles/meals/builder; browser as Sneha: queue shows plates, rating flow unchanged, rated view shows the rubric grid; circles header shows rings+index for allocated clients only and Meena's room carries the risk cue; goalsheet sign-off still records per-department approvals.

### Task D11: Governance — one design authority

**Files:**
- Modify: `Archives/HAALVING-Design-System-v2.md` (append sections), `Archives/HAALVING-Design-Handoff.md` (mark superseded sections)

- [ ] **Step 1:** Append to Design System v2 three sections — **Imagery** (real Indian home food, never white-plate Western salads; warm textured-flat illustration of ordinary life; matte-clay specimen plates; photographs neutral-warm, never pillar-tinted), **Voice** (quiet by default; sentence-per-empty-state; banned words list; the kicker/display grammar), **Celebration** (earned and singular; the three moments enumerated; diya register, never confetti) — porting the Handoff's rules (167–187) with the new class names from A1/A3.
- [ ] **Step 2:** In the Handoff, above its imagery section add: *"Superseded 2026-08-02 — these rules now live in HAALVING-Design-System-v2.md §Imagery/§Voice/§Celebration."*
- [ ] **Step 3:** Verify both files render as sane Markdown (visual read).

### Task D12: Ship + full verification

**Files:**
- Modify: `app/index.html`, `app/sw.js`, `app/js/data.js` (levers only)

- [ ] **Step 1:** Re-grep live levers (concurrent sessions!): `grep 'const CACHE' app/sw.js; grep -o 'v=[0-9]*' app/index.html | sort -u; grep 'seedVersion' app/js/data.js`. Bump all `?v=` and `CACHE` to (highest + 1); seedVersion already bumped in B4b (verify it is).
- [ ] **Step 2:** `for f in app/js/core.js app/js/data.js app/js/vitals.js app/js/views/*.js app/sw.js; do node --check "$f"; done` — all clean.
- [ ] **Step 3:** Run the Node smoke harness pattern (`scratchpad smoke-e2e.js` from the 2026-07-28 session; stub `document.querySelector`) — all pass.
- [ ] **Step 4:** Weight: `du -ck app/img/food/*.webp` ≤ 400KB; confirm `sw.js` ASSETS has no `img/food/` entry.
- [ ] **Step 5:** Browser matrix: every persona's home renders console-clean; login+onboarding pixel-unchanged; reduced-motion pass; dark-mode pass on every touched surface; the three celebrates fire once each and never twice.
- [ ] **Step 6:** Banned-word grep (A3 Step 3) clean; one-moment audit: eyeball each page for exactly one kicker.
