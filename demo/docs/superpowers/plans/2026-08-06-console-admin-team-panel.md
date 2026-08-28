# Console Admin & Team Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the HAALVING Team Console to the approved 8-item sidebar with store-backed RBAC, a rebuilt three-panel Clients workspace, merged Work Queues, a Catalog with AND/OR templates, Tribe admin, an editable People & Access, and Configuration — demoable across all 9 staff roles today.

**Architecture:** Foundation first (core.js RBAC + data.js seeds), then re-homes (queues/schedule/home), then the Clients workspace rebuild reusing the portable engines (`HV.chatui`, `HV.registerBoard`, `HV.approvals`, `HV.consoleui`, `HV.capacityPanel`), then the new builds (catalog, templates, tribe, people, config), then the ship gate (index/sw version levers + persona sweep).

**Tech Stack:** Plain HTML/CSS/JS, no build step, one global `window.HV`. Views return HTML strings; listeners attach via `[data-*]`. Spec: `docs/superpowers/specs/2026-08-06-console-admin-team-panel-design.md` (read it before starting any task).

## Global Constraints

- **No build step, no dependencies.** Verification = `node --check <file>` + browser. No test framework exists.
- **Keys are frozen; only display titles change.** Role keys `admin/core/opshead/opsmgr/doctor/dietitian/fitness/yoga/mind`; pillar keys `fitness/culture/yoga/wellness`. Display: culture→"Nutrition", wellness→"Mind Wellness", dietitian→"Dietician".
- **Interpolated data goes through `HV.esc()`.** Always.
- **No emoji anywhere; numerals get `class="num"`** (serif-for-data law).
- **Pillar colour only in that pillar's own dial/dot/ribbon/series.** Never decorative.
- **Use design tokens** (`--s1..--s10`, type steps, radius, elevation); cards carry tone+shadow, never 1px borders. Check dark mode (`prefers-color-scheme`) for anything new.
- **Ship levers (Task 14, all mandatory):** every `?v=NN` in `app/index.html`, `CACHE` name in `app/sw.js`, ASSETS list add/remove, `HV.seedVersion`. **Re-grep live values right before shipping** — concurrent sessions bump them (last seen: v148, seedVersion 27).
- **Adding/removing a view file = three places:** the file, `index.html` script tag, `sw.js` ASSETS.
- **AI containment:** nothing auto-sends; a named human taps every send/apply; AI drafts ride `HV.ui.aidraft`.
- **Verification recipe (used by every task):** run `cd app && python3 -m http.server 8090` once (port 8080 is taken by ERPNext). Browser-check with the Playwright MCP tools against `http://localhost:8090/#/...`; log in by clicking a persona on the login screen; `Reset demo data` (login screen or client Profile) reloads the seed after seed changes. Console must be clean.
- Commit after every task on branch `console-ia-phase-a`; message style `feat(console): …`, ending with the Claude Fable co-author line.

## Phases

- **Phase 0 — Foundation:** Tasks 1–4 (core.js, data.js). Everything depends on these; do them first, in order.
- **Phase A — Re-homes:** Tasks 5–6 (queues/schedule, home). Independent of each other.
- **Phase B — Clients rebuild:** Tasks 7–8. Task 8 depends on 7.
- **Phase C — New builds:** Tasks 9–13 (catalog, templates, tribe, people, config). 9→10 ordered; 11, 12, 13 independent.
- **Phase D — Ship:** Task 14. Last, always.

---

### Task 1: core.js — RBAC foundation (titles, nav, aliases, store-backed roles, nav-driven gate)

**Files:**
- Modify: `app/js/core.js` (HV.ROLES ~17–53, HV.NAV_ITEMS ~57–69, HV.roleMeta ~87, router, HV.registerBoard/HV.boardsFor)

**Interfaces:**
- Produces: `HV.roleDef(key) -> {title, shell, home, nav[], perms[]}` (store overlay: `HV.store.roles[key] || HV.ROLES[key]`); `HV.VIEW_NAV` map; router alias table; `HV.boardsFor(order)` honouring per-board `perm`; `HV.ROLES` retitled with new nav/perms lists.
- Consumes: nothing new.

- [ ] **Step 1: Retitle roles + new nav/perms.** Replace the nine staff entries of `HV.ROLES` (keep `client` and `ai` untouched):

```js
  admin:     { title: 'Super Admin',        shell: 'console', home: '#/home',
               nav: ['home','clients','queues','schedule','catalog','tribeadmin','people','config'],
               perms: ['seeAllClients','approve','allocate','editRules','sendDigest','keyInBody',
                       'overrideCapacity','finalizeLevel','editAnyCatalog','editTemplates',
                       'assignPlan','manageTribe','managePeople','manageConfig'] },
  /* Haalving Coach — lead client coach; first signature on every chain (was Ops Manager) */
  opsmgr:    { title: 'Haalving Coach',     shell: 'console', home: '#/home',
               nav: ['home','clients','queues','schedule','catalog','tribeadmin'],
               perms: ['seeAllClients','approve','allocate','sendDigest',
                       'assignPlan','editTemplates','manageTribe'] },
  opshead:   { title: 'Operations Head',    shell: 'console', home: '#/home',
               nav: ['home','clients','queues','schedule','catalog','tribeadmin','people','config'],
               perms: ['seeAllClients','approve','allocate','overrideCapacity','editRules',
                       'finalizeLevel','sendDigest','editAnyCatalog','editTemplates',
                       'assignPlan','manageTribe','manageConfig'] },
  /* Super User — management reviewer; final signature; read-only elsewhere */
  core:      { title: 'Super User',         shell: 'console', home: '#/queues/approvals',
               nav: ['home','clients','queues','schedule','catalog','tribeadmin','people','config'],
               perms: ['seeAllClients','approve'] },
  doctor:    { title: 'Doctor',             shell: 'console', home: '#/home',
               nav: ['home','clients','queues','schedule','catalog'],
               perms: ['rawRecords','signSummary'] },
  dietitian: { title: 'Dietician',          shell: 'console', home: '#/queues/meals',
               nav: ['home','clients','queues','schedule','catalog'],
               perms: ['rateMeals','buildDiet','editCatalog'] },
  fitness:   { title: 'Fitness Coach',      shell: 'console', home: '#/home',
               nav: ['home','clients','queues','schedule','catalog'],
               perms: ['buildCharts','editCatalog'] },
  yoga:      { title: 'Yoga Coach',         shell: 'console', home: '#/home',
               nav: ['home','clients','queues','schedule','catalog'],
               perms: ['buildCharts','editCatalog'] },
  mind:      { title: 'Mind Wellness Coach',shell: 'console', home: '#/home',
               nav: ['home','clients','queues','schedule','catalog'],
               perms: ['buildCharts','editCatalog'] },
```

- [ ] **Step 2: New `HV.NAV_ITEMS` (8 items).** Replace the whole object:

```js
  HV.NAV_ITEMS = {
    home:      { route: '#/home',       label: 'Home',            icon: 'home',    owns: ['reports'] },
    clients:   { route: '#/clients',    label: 'Clients',         icon: 'users',   owns: ['client','review'] },
    queues:    { route: '#/queues',     label: 'Work Queues',     icon: 'clock',   owns: ['approvals','meals','medical','builder'] },
    schedule:  { route: '#/schedule',   label: 'Schedule',        icon: 'cal' },
    catalog:   { route: '#/catalog',    label: 'Catalog',         icon: 'bookmark' },
    tribeadmin:{ route: '#/tribe-admin',label: 'Tribe',           icon: 'circle' },
    people:    { route: '#/people',     label: 'People & Access', icon: 'user' },
    config:    { route: '#/config',     label: 'Configuration',   icon: 'gear' },
  };
```

- [ ] **Step 3: Store-backed role resolution.** Add `HV.roleDef` and reroute `HV.roleMeta` through it (HV.can stays as-is — it reads roleMeta):

```js
  /* roles live in the store (People & Access edits them); code matrix is the fallback seed */
  HV.roleDef = function (key) {
    const s = HV.store;
    return (s && s.roles && s.roles[key]) || HV.ROLES[key] || null;
  };
  HV.roleMeta = function () { const m = HV.me(); return m ? HV.roleDef(m.role) : null; };
```
Sweep core.js for other direct `HV.ROLES[...]` reads on the *current user's* role (shell drawing, nav building, role titles) and switch them to `HV.roleDef(...)`/`HV.roleMeta()`. Leave `HV.ROLES` itself exported (login screen persona list, seeding).

- [ ] **Step 4: Route aliases.** In the router, before the hash is parsed into `{name, params}`, map old routes to new (a real redirect so the address bar updates and back-button works):

```js
  const ROUTE_ALIASES = [
    [/^#\/circles\/(.+)$/,  (m) => '#/clients/' + m[1] + '/circle'],
    [/^#\/circles$/,        ()  => '#/clients'],
    [/^#\/approvals$/,      ()  => '#/queues/approvals'],
    [/^#\/pipeline$/,       ()  => '#/clients'],
    [/^#\/library(\/.+)?$/, (m) => '#/catalog' + (m[1] || '')],
    [/^#\/meals$/,          ()  => '#/queues/meals'],
  ];
  function unalias(hash) {
    for (const [re, fn] of ROUTE_ALIASES) { const m = hash.match(re); if (m) return fn(m); }
    return hash;
  }
```
In the render/route entry point: `const target = unalias(location.hash); if (target !== location.hash) { location.replace(location.pathname + location.search + target); return; }` (location.replace so the stale URL doesn't pollute history).

- [ ] **Step 5: Nav-driven view gate.** Add the map + gate and use it where the router currently checks `view.roles`:

```js
  /* view name -> owning sidebar item; console access = nav membership, so
     runtime-created roles gain pages by ticking a nav box in People & Access */
  HV.VIEW_NAV = {
    home:'home', reports:'home',
    clients:'clients', client:'clients', review:'clients',
    queues:'queues', approvals:'queues', meals:'queues', medical:'queues', builder:'queues',
    schedule:'schedule', catalog:'catalog', library:'catalog',
    'tribe-admin':'tribeadmin', people:'people', config:'config',
  };
  HV.allowedView = function (name, def) {
    const me = HV.me(); if (!me) return false;
    if (def.roles) return def.roles.includes(me.role);   // client-shell views keep explicit lists
    const meta = HV.roleDef(me.role);
    const nav = HV.VIEW_NAV[name];
    return !!(meta && meta.shell === 'console' && nav && (meta.nav || []).includes(nav));
  };
```
Router: where it decides lock-screen vs render, call `HV.allowedView(route.name, view)` instead of the raw roles check. Views with `standalone: true` bypass as today.

- [ ] **Step 6: `HV.boardsFor` perm support.** Where boards are filtered by `b.roles.includes(me.role)`, change to: `const ok = b.perm ? HV.can(b.perm) : (b.roles || []).includes(me.role);` — boards may now declare `perm: 'approve'` instead of a roles array.

- [ ] **Step 7: Syntax check.** Run: `node --check app/js/core.js` → no output (pass).

- [ ] **Step 8: Browser smoke.** App still boots; login screen lists personas with NEW titles (Super Admin, Haalving Coach, Super User…). Old sidebar will look broken/partial until Tasks 2–14 land — that's expected; only check: no console errors on `#/login`, and logging in as Super Admin shows an 8-item sidebar (some items 404 to lock/blank until later tasks).

- [ ] **Step 9: Commit.** `git add app/js/core.js && git commit -m "feat(console): 8-item nav, role retitles, store-backed RBAC, route aliases"`

---

### Task 2: data.js — roles seed, programShape, navCounts, labels

**Files:**
- Modify: `app/js/data.js` (seedVersion :11, capacity :1485, navCounts :1674, worklist :1420)

**Interfaces:**
- Produces: `HV.store.roles` (persisted user state, seeded when absent from `HV.ROLES`); `HV.store.programShape = {levels:7, cycleDays:11, reviewDay:9, restDays:[5,10], meetingDay:11, sessions:{fitness:5,yoga:3,mind:1}}` (boot-refilled catalogue); `HV.navCounts()` returning `{home, clients, queues}`; worklist items carrying `{pillar?, type?}`.
- Consumes: `HV.ROLES` from Task 1.

- [ ] **Step 1: Bump `HV.seedVersion` to 28.**

- [ ] **Step 2: Seed roles + programShape.** In the boot/refill section (where catalogues are refilled and user-state keys are seeded-when-absent):

```js
  /* roles are USER STATE (People & Access edits them) — seed only when absent */
  if (!s.roles) {
    s.roles = {};
    Object.keys(HV.ROLES).forEach(k => {
      if (k === 'client' || k === 'ai') return;
      const r = HV.ROLES[k];
      s.roles[k] = { title: r.title, shell: r.shell, home: r.home,
                     nav: (r.nav || []).slice(), perms: (r.perms || []).slice() };
    });
  }
  /* programShape is a CATALOGUE — boot-refilled, no seedVersion sensitivity after this one */
  s.programShape = { levels: 7, cycleDays: 11, reviewDay: 9, restDays: [5, 10],
                     meetingDay: 11, sessions: { fitness: 5, yoga: 3, mind: 1 } };
```

- [ ] **Step 3: navCounts remap.** Replace the returned object so badges follow the moves (keep each count's existing computation, just re-bucket):

```js
  return {
    home:    homeCount,
    clients: pipelineCount + circlesUnread,
    queues:  queuesCount + approvalsCount,
  };
```

- [ ] **Step 4: Display strings.** `capacity[].roleLabel` values: update to the new titles (Super Admin, Haalving Coach, Operations Head, Super User, Doctor, Dietician, Fitness Coach, Yoga Coach, Mind Wellness Coach). Grep data.js for any other old-title prose (`Ops Manager`, `Ops Head`, `Management`, `Dietitian`, `Trainer`) in *display* strings and update; never touch ids/keys.

- [ ] **Step 5: Worklist filter fields.** Add `pillar` and `type` to each seeded worklist item where sensible (e.g. the meal-rating task gets `pillar:'culture', type:'rating'`; the level-review task `type:'review'`; others `type:'task'`). Items without them are fine — filters treat missing as "—".

- [ ] **Step 6: Syntax + boot check.** `node --check app/js/data.js`; then in the browser hit `Reset demo data`, confirm clean console and that `HV.store.roles` and `HV.store.programShape` exist (evaluate `Object.keys(HV.store.roles)` via the browser tools → 9 keys).

- [ ] **Step 7: Commit.** `git commit -am "feat(seed): roles + programShape seeds, navCounts remap, role display strings, seedVersion 28"`

---

### Task 3: data.js — catalog seed (4 pillars)

**Files:**
- Modify: `app/js/data.js` (new `catalog` key in the boot-refilled catalogue section)

**Interfaces:**
- Produces: `HV.store.catalog = {fitness:[], yoga:[], culture:[], wellness:[]}`; item shape `{id:'ci-…', track:'sedentary'|'moderate'|'active', name, instructions, media?:{kind:'photo'|'video', ref}, caution?, notes?, tags:[…], levels?, nutrients?, allergies?}` — `nutrients {kcal,protein,carbs,fat,fibre,micros:[{k,v}]}` and `allergies` on culture items only; no `caution` on wellness items. Item ids referenced by Task 4's template: `ci-idli`, `ci-chutney`, `ci-dosa`, `ci-oats`, `ci-upma`, `ci-curdrice`, `ci-cheela`, `ci-ragi`, `ci-walk`, `ci-squat`, `ci-band`, `ci-stepup`, `ci-plank`, `ci-catcow`, `ci-surya`, `ci-trikona`, `ci-uttan`, `ci-nidra`, `ci-box`, `ci-downshift`.
- Consumes: nothing.

- [ ] **Step 1: Check available art.** Run `ls app/img/food app/img/tasks` and use real filenames for `media.ref` (e.g. `img/tasks/fitness-strength.webp`, `img/food/…`). Items with no matching art omit `media`.

- [ ] **Step 2: Seed the catalog.** `s.catalog = {…}` (boot-refilled). Content — write all of these out with 1–2 sentence `instructions`, short `caution`/`notes` where marked:

  - **fitness (12):** ci-walk Brisk walk intervals (sed, tags weight loss/diabetes), ci-squat Chair squats (sed, PCOD/weight loss, caution: knee pain → reduce depth), Wall push-ups (sed), Glute bridge (sed), ci-stepup Step-ups (mod), Goblet squats (mod, muscle building, caution: neutral spine), ci-band Resistance-band rows (mod, muscle building), ci-plank Plank hold (mod), Farmer carry (mod), Kettlebell swings (act, caution: hinge not squat), Tempo run (act, weight loss), Push-up ladder (act, muscle building).
  - **yoga (10):** ci-catcow Cat–Cow (sed, stress), ci-uttan Uttanasana forward fold (sed, caution: soft knees, low BP), Baddha Konasana (sed, PCOD), ci-surya Surya Namaskar A (mod, weight loss), ci-trikona Trikonasana (mod), Warrior II (mod), Bridge pose (mod, PCOD), Crow prep (act, caution: wrists), Headstand prep (act, caution: never unsupervised first time), Yoga-nidra wind-down (sed, sleep).
  - **culture (12, label "Food"; each with nutrients + allergies):** ci-idli Idli, 2 pc (sed; kcal 120, protein 4, carbs 24, fat 0.5, fibre 1.5; micros iron/calcium; allergies: none), ci-chutney Coconut chutney (sed; kcal 105, protein 1.5, carbs 4, fat 9, fibre 2; allergies: coconut), ci-dosa Plain dosa (sed; kcal 165, protein 3.5, carbs 29, fat 4, fibre 1; allergies: none), Sambar (kcal 140, protein 6; allergies: none), ci-oats Oats bowl (kcal 190, protein 6, fibre 4; allergies: gluten), ci-cheela Moong-dal cheela (kcal 180, protein 10), Grilled paneer salad (kcal 240, protein 16; allergies: milk; tags muscle building), ci-curdrice Curd rice (kcal 210, protein 6; allergies: milk), ci-ragi Ragi porridge (kcal 150, protein 4; micros calcium/iron), Sprouts chaat (kcal 130, protein 8), ci-upma Vegetable upma (kcal 200, protein 5; allergies: gluten), Buttermilk (kcal 40, protein 2; allergies: milk). `media` doubles as cooking instructions where food art exists.
  - **wellness (8, no caution field):** ci-box Box breathing 5 min (sed, stress), ci-nidra Yoga nidra 20 min (sed, sleep), ci-downshift Digital downshift hour (sed, sleep), Gratitude journal (sed), Body scan 10 min (mod), 4-7-8 breath (mod, sleep), Walk without phone (mod), Wind-down routine (sed).

  Tags come from {weight loss, PCOD, muscle building, diabetes, stress, sleep}. Every item gets `track` and at least one tag.

- [ ] **Step 3: Syntax + boot.** `node --check app/js/data.js`; Reset demo data; evaluate `HV.store.catalog.culture.length` → 12, clean console.

- [ ] **Step 4: Commit.** `git commit -am "feat(seed): four pillar catalogs (42 items) with tracks, tags, nutrients, allergies"`

---

### Task 4: data.js — templates generator, seed templates, clientPlans

**Files:**
- Modify: `app/js/data.js`

**Interfaces:**
- Produces: `HV.store.templates` (catalogue, boot-refilled): `[{id, name, desc, track, by, base?, status:'draft'|'published', cycles:{'1'..'7':{days:{'1'..'11':{rest?,review?,meeting?,slots:[slot]}}}}}]`; `slot = {pillar, time?, label?, options:[[itemId,…],…], note?}` (outer array = OR alternatives, inner = AND together, one level only); `HV.store.clientPlans` (user state, seeded when absent): `{[clientId]:{templateId, modified, assignedBy, overrides:{'cy.d':{slots:[slot]}}, log:[{act,byId,minsAgo}]}}`.
- Consumes: catalog ids from Task 3, `programShape` from Task 2.

- [ ] **Step 1: Generator.** Add near the other seed generators:

```js
  function genTemplate(id, name, track, by) {
    const shape = { cycleDays: 11, reviewDay: 9, restDays: [5, 10], meetingDay: 11 };
    const FIT = [1, 2, 4, 7, 8], YOG = [3, 6, 11], MIND = [9];   // 5 + 3 + 1 per cycle
    const cycles = {};
    for (let cy = 1; cy <= 7; cy++) {
      const days = {};
      for (let d = 1; d <= shape.cycleDays; d++) {
        const day = { slots: [] };
        if (shape.restDays.includes(d)) day.rest = true;
        if (d === shape.reviewDay)  day.review = true;
        if (d === shape.meetingDay) day.meeting = true;
        day.slots.push(
          { pillar: 'culture', time: '8:00',  label: 'Breakfast',
            options: [['ci-idli', 'ci-chutney'], ['ci-dosa', 'ci-chutney'], ['ci-oats']] },
          { pillar: 'culture', time: '13:00', label: 'Lunch',
            options: [['ci-curdrice'], ['ci-cheela']] },
          { pillar: 'culture', time: '19:30', label: 'Dinner',
            options: [['ci-upma'], ['ci-ragi']] });
        if (!day.rest) {
          if (FIT.includes(d))  day.slots.push({ pillar: 'fitness',  time: '7:00',  label: 'Session',
            options: [['ci-walk'], ['ci-squat', 'ci-plank']] });
          if (YOG.includes(d))  day.slots.push({ pillar: 'yoga',     time: '17:30', label: 'Practice',
            options: [['ci-surya'], ['ci-catcow', 'ci-uttan']] });
          if (MIND.includes(d)) day.slots.push({ pillar: 'wellness', time: '21:00', label: 'Wind-down',
            options: [['ci-nidra'], ['ci-box']] });
        }
        days[d] = day;
      }
      cycles[cy] = { days: days };
    }
    return { id: id, name: name, desc: 'Full 7-cycle programme generated from the catalog.',
             track: track, by: by, status: 'published', cycles: cycles };
  }
```

- [ ] **Step 2: Seed templates (catalogue) + clientPlans (user state).**

```js
  s.templates = [
    genTemplate('tp-foundation', 'Foundation — Sedentary', 'sedentary', 'u-rohan'),
  ];
  /* second, deliberately incomplete draft to demo authoring */
  const draft = genTemplate('tp-muscle', 'Muscle Building — Moderate', 'moderate', 'u-vikram');
  draft.status = 'draft';
  draft.desc = 'Cycles 1–2 drafted; strength emphasis.';
  for (let cy = 3; cy <= 7; cy++) delete draft.cycles[cy];
  s.templates.push(draft);

  if (!s.clientPlans) {
    s.clientPlans = {
      'c-rajesh': { templateId: 'tp-foundation', modified: true, assignedBy: 'u-rohan',
        overrides: { '2.3': { slots: null } },   // filled in next line
        log: [{ act: 'Assigned Foundation — Sedentary', byId: 'u-rohan', minsAgo: 2880 },
              { act: 'Breakfast swapped for cycle 2 day 3', byId: 'u-sneha', minsAgo: 240 }] },
      'c-dev': { templateId: 'tp-foundation', modified: false, assignedBy: 'u-rohan',
        overrides: {}, log: [{ act: 'Assigned Foundation — Sedentary', byId: 'u-rohan', minsAgo: 4320 }] },
    };
    /* Rajesh's swap: dosa option removed, cheela added — shows the "Modified" story */
    const base = s.templates[0].cycles[2].days[3].slots;
    const mod = JSON.parse(JSON.stringify(base));
    mod[0].options = [['ci-idli', 'ci-chutney'], ['ci-cheela']];
    s.clientPlans['c-rajesh'].overrides['2.3'] = { slots: mod };
  }
```
`templates` is boot-refilled; runtime-created templates must survive — so refill = "ensure the two seed ids exist", not "replace the array": `s.templates = (s.templates||[]).filter(t => t.id !== 'tp-foundation' && t.id !== 'tp-muscle'); s.templates.unshift(…seeds)`. (Same pattern for nothing else — clientPlans is plain user state.)

- [ ] **Step 3: Syntax + boot.** `node --check app/js/data.js`; Reset; evaluate `HV.store.templates[0].cycles[7].days[11].meeting` → true; `HV.store.clientPlans['c-rajesh'].modified` → true.

- [ ] **Step 4: Commit.** `git commit -am "feat(seed): template generator, Foundation + draft templates, clientPlans with modified example"`

---

### Task 5: Work Queues merge + Schedule cleanup

**Files:**
- Modify: `app/js/views/console-queues.js` (ORDER :8, roles :12), `app/js/views/console-approvals.js` (:136–), `app/js/views/console-ops.js` (board regs :106–, work board), `app/js/views/console-schedule.js` (tab plumbing :964–984, pillar map :729, roles :958), `app/js/views/console-meals.js` (roles list only), `app/js/views/console-medical.js` (board perm)

**Interfaces:**
- Consumes: `HV.boardsFor` perm support (Task 1), worklist `{pillar?, type?}` (Task 2).
- Produces: boards keyed `work, approvals, meals, medical, deviations, live` on `#/queues/:board`; `#/approvals` alias already lands on `#/queues/approvals` (Task 1).

- [ ] **Step 1: Approvals becomes a board.** In console-approvals.js: extract the current render body into `function drawApprovals(el, me)`; keep the view registration but make it a thin redirect: `render(el){ HV.go('#/queues/approvals'); }` — actually delete the view registration entirely (the Task 1 alias catches `#/approvals`) and add:

```js
  HV.registerBoard('approvals', {
    label: 'Approvals', perm: 'approve',
    count: function () { const me = HV.me(); return me ? HV.approvals.queueFor(me.id).length : 0; },
    mount: function (el) { drawApprovals(el, HV.me()); },
  });
```
Remove the file's `roles:` array — access is the queues route + `approve` perm now. Keep every sheet/handler as-is (they re-query inside `el`).

- [ ] **Step 2: Extend queues ORDER.** console-queues.js: `const ORDER = ['work','approvals','meals','medical','deviations','live'];` and delete the view's `roles:` array (nav gate covers it — opsmgr/core now legitimately enter to sign).

- [ ] **Step 3: Work board filters.** In console-ops.js, the `work` board mount gains a `.tfil` chip row (grammar exists in app.css from v142) with groups: **Status** (Open/Done), **Pillar** (Fitness/Nutrition/Yoga/Mind Wellness — display names, keys under the hood), **Type** (Task/Rating/Review), and for `HV.can('seeAllClients')` an **Owner** select of staff. Module-local filter state `{status:'open', pillar:null, type:null, owner:null}`; rows filter accordingly; chip click re-mounts the board body only. Rows without pillar/type match only the null filter.

- [ ] **Step 4: Board perm conversions.** meals board (`console-meals.js:319`): `perm:'rateMeals'` won't cover ops viewing — use `roles` replaced by `perm` only where clean: meals → keep roles but set to `['dietitian','admin','opshead','opsmgr','core']`; medical board → `perm:'rawRecords'`; deviations/live (console-ops.js) → `perm:'seeAllClients'`; work board → no gate (all staff). Delete the standalone `meals` view registration in console-meals.js (alias `#/meals` covers it); keep `medical` view (doctor deep-links) — drop its roles array (VIEW_NAV medical→queues).

- [ ] **Step 5: Schedule cleanup.** console-schedule.js: remove the second tab that mounts the work board (:964–984) — `#/schedule` is pure calendar; delete the view's roles array (nav gate). Replace the staff-id→pillar literal map (:729) with role-derived: `const ROLE_PILLAR = {fitness:'fitness', yoga:'yoga', mind:'wellness', dietitian:'culture'}; const pillarOf = (staffId) => ROLE_PILLAR[(HV.staff(staffId).role)] || null;`

- [ ] **Step 6: console-builder.js + console-library.js gates.** Delete their per-view roles arrays too (both files' registrations) so the nav gate governs. (Library is renamed in Task 9; this just keeps it reachable meanwhile.)

- [ ] **Step 7: Verify.** `node --check` on all six files. Browser: as **Super User** land on `#/queues/approvals` (their home) — approvals cards render, Approve works; as **Haalving Coach** `#/queues` shows work board with filter chips, Approvals tab present; as **Doctor** — Medical tab present, Approvals absent; as **Dietician** — Meals tab present; `#/schedule` has no work tab; `#/approvals` and `#/meals` redirect. Console clean throughout.

- [ ] **Step 8: Commit.** `git commit -am "feat(queues): approvals board merged into Work Queues, work-board filters, schedule cleanup, perm-gated boards"`

---

### Task 6: Home dashboard

**Files:**
- Modify: `app/js/views/console-digest.js`, `app/js/views/console-ops.js` (reports view stays; nav removal already done)

**Interfaces:**
- Consumes: `HV.approvals.queueFor`, `HV.myClients`, `store.opsStats/meals/documents/capacity`, boards `exports`/`incentives` via `HV.boardsFor`.
- Produces: Home sections in fixed order (see Step 1); links updated to new routes.

- [ ] **Step 1: Vital-stats grid.** After the role-hint notice and NEXT card, insert a `.grid3` (two rows for ops) of stat tiles, each `HV.ui.stat`-style with `class="num"` values — computed live where cheap:
  - Clients on roster (`HV.myClients().length`), High risk (`…filter(c=>c.risk==='high').length`), Waiting on your signature (`HV.approvals.queueFor(me.id).length`),
  - ops-only row (`HV.can('seeAllClients')`): Unrated meals (`store.meals.filter(m=>!m.final).length`), Docs pending (`store.documents.filter(d=>d.summary==='pending').length`), On-time dial (`HV.ui.dial` from `opsStats.onTime`).
- [ ] **Step 2: Link sweep.** replyRow `#/circles/'+id` → `#/clients/'+id+'/circle'`; attention rows `#/client/'+id` stays (route `client` remains an alias-free deep link? No — Task 7 re-registers `client` as redirect to `#/clients/:id`; keep emitting `#/clients/'+c.id` here); signRow `#/approvals` → `#/queues/approvals`.
- [ ] **Step 3: Ledger section (ops roles).** Bottom of Home for `HV.can('seeAllClients')` + role in admin/opshead: a `.sec-title` "The ledger" + two `.trow` links → `#/reports/exports`, `#/reports/incentives` with their `count()`/summary lines. `#/reports` view keeps working (VIEW_NAV reports→home lights Home).
- [ ] **Step 4: Verify.** `node --check` both files. Browser: Home as Super Admin (all tiles + ledger), as Fitness Coach (no ops row, no ledger), tiles' numerals render serif (`.num`). Dark mode glance. Console clean.
- [ ] **Step 5: Commit.** `git commit -am "feat(home): vital-stats dashboard, ledger re-home, link sweep"`

---

### Task 7: Clients workspace rebuild — shell, rail, tabs, pad

**Files:**
- Rewrite: `app/js/views/console-clients.js` (full rebuild; port pieces from console-circles.js and old console-clients.js)
- Modify: `app/js/views/console-circles.js` (slims to `HV.chatui` + nothing else), `app/js/views/console-pipeline.js` (delete `pipeline` view registration; keep `incoming` board + `HV.capacityPanel` + config until Task 13), `app/css/app.css` (~2049–2166 block gains rail styles)

**Interfaces:**
- Consumes: `HV.chatui` (thread/wire/composer/wireComposer), board `incoming` (mountIncoming), `HV.consoleui` (sessionRings/levelBadges/headerIndex), `store.padSug/padAuto/ui.padW`, alias `#/circles/:cid` → `#/clients/:cid/circle` (Task 1).
- Produces: route `clients` at `#/clients/:cid?/:tab?` with tabs `overview|circle|plan|trackers|docs|notes`; route `client` re-registered as redirect (`#/client/:id` → `#/clients/:id`); `HV.consoleui` re-exported unchanged from the new file; pad markup/behaviour identical to the old circle pad (Team/Assistant/Automations, splitter, Later list).

- [ ] **Step 1: Port the workspace engine.** Move from console-circles.js into the new console-clients.js: `threadHtml`-equivalent header builder, `wireSplitter`, pad renderers (`teamHtml`/`assistHtml`/`autosTabHtml`/`sugCard`), `padSuggestions`/`autos` lazy seeding, the delegated click handler (data-pt/data-sact/data-lact/data-auto/data-goto), and the composer send paths — unify every composer on `HV.chatui.composer(idPrefix)/wireComposer` (kill the hard-coded `cc2-input` twin). console-circles.js keeps ONLY the `HV.chatui` engine block (:158–211) and loses its view registration (alias covers `#/circles`).

- [ ] **Step 2: Layout.** `render(el, params)`: `el.classList.add('cc3')`. Structure:

```html
  <div class="ccwrap cw">
    <aside class="cwrail">                      <!-- NEW: left rail -->
      <div class="tabs">Clients | Onboarding</div>
      <input class="cwsearch" placeholder="Search clients">
      <div class="tfil">plan · risk chips</div>
      <div class="cwlist">…client rows (.trow: avatar, name+risk cue, unread pill)…</div>
    </aside>
    <section class="ccchat">                    <!-- middle: header + tabs + body -->
      <div class="cchead">…avatar · tier · cycle/day · sessionRings · headerIndex…</div>
      <div class="tabs cwtabs">Overview·Circle·Plan·Trackers·Docs·Notes</div>
      <div class="ccscroll" id="cw-body">…tab content…</div>
      <!-- composer only when tab === 'circle' -->
    </section>
    <div class="ccdiv" role="separator">…</div>
    <aside class="ccpad">…Assistant | Automation | Team (ported pad)…</aside>
  </div>
```
No `cid` → rail full-width with an `.empty` prompt in the middle ("Select a client"). Rail rows link `#/clients/<id>/<currentTab>`; onboarding rail tab swaps `.cwlist` for a container that calls the `incoming` board's `mount()` (`HV.boardsFor(['incoming'])[0].mount(listEl)`).

- [ ] **Step 3: Tabs are URL state.** `#/clients/:cid/:tab` — tab clicks `HV.go('#/clients/'+cid+'/'+t)`. Port tab bodies from the old file: **overview** = timeline merge (circles msgs + meals by mins, teamonly amber), **circle** = `HV.chatui.thread(cid,{teamonly:false})` + composer `('cw')` + `markRead` before build + sidebar badge re-sync now targeting `[data-r="#/clients"]`, **trackers**, **docs** (rawRecords double-gate intact), **notes**. **plan** renders a placeholder card this task ("Plan tab lands in the next commit") — replaced in Task 8. Copilot rail is DELETED; its briefs die (padSug Assistant tab is the one AI surface).

- [ ] **Step 4: Legacy route stubs.** Register `client` as `{render(){ const id=params[0]; HV.go('#/clients/'+id); }}` — old `#/client/:id` links (digest attention rows from other sessions, sheets) land correctly.

- [ ] **Step 5: CSS.** In the cc3 block of app.css add: `.cwrail{width:300px; flex:none; display:flex; flex-direction:column; min-height:0}` with `.cwlist{flex:1; overflow-y:auto}`; phone breakpoint (match the existing cc3 media query): rail becomes the whole screen when no cid, `display:none` when a cid is open (back button in `.cchead` returns to `#/clients`). Reuse tokens; no new colours; check dark.

- [ ] **Step 6: Verify.** `node --check` all touched files. Browser as Haalving Coach: `#/clients` → rail lists 7 clients sorted unread-first; filter chips narrow; Onboarding rail tab shows the kanban with capacity card; open Rajesh → header + 6 tabs; Circle tab chats and clears unread; pad Assistant accept/reject/refine works; splitter drags and persists; `#/circles/c-rajesh` redirects to `#/clients/c-rajesh/circle`; `#/client/c-rajesh` redirects. Phone width 390px: rail/workspace stacking correct. As Doctor: Docs tab shows raw records; as Fitness Coach: only pod clients in rail. Console clean.

- [ ] **Step 7: Commit.** `git commit -am "feat(clients): three-panel workspace — rail with onboarding, URL tabs, ported pad + chat"`

---

### Task 8: Clients Plan tab — view, assign, edit day, save-as-template

**Files:**
- Modify: `app/js/views/console-clients.js` (plan tab), `app/js/views/console-approvals.js` (TYPE_LABELS + 'template')

**Interfaces:**
- Consumes: `store.templates/clientPlans/catalog/programShape` (Tasks 2–4), `HV.approvals.submit`, perms `assignPlan/editTemplates/editCatalog` + ROLE_PILLAR (dietitian→culture, fitness→fitness, yoga→yoga, mind→wellness).
- Produces: `effectiveDay(plan, tpl, cy, d) -> {slots,…}` helper; writes to `clientPlans[cid].overrides`, `templates[]` (save-as-new), `approvals[]` (type `template`).

- [ ] **Step 1: Renderer.** Plan tab body:
  - No plan → `.empty` + **Assign template** button (perm `assignPlan`).
  - With plan: header card (template name, track, "Modified from <name>" audit line when `modified`, assignedBy line, log), cycle picker chips 1–7 (default = client's `c.cycle`), 11-day mini-grid (mark rest/review/meeting from the day flags), and the selected day's slot list. Each slot renders pillar dot + label/time + the AND/OR line:

```js
  function optionsLine(slot) {
    const name = id => { const p = HV.store.catalog[slot.pillar] || [];
      const it = p.find(x => x.id === id); return it ? it.name : id; };
    return slot.options.map((grp, i) =>
      (slot.options.length > 1 ? '<b>Option ' + String.fromCharCode(65 + i) + ':</b> ' : '') +
      grp.map(id => HV.esc(name(id))).join(' + ')
    ).join(' <span class="cwor">or</span> ');
  }
```
  - `effectiveDay`: `const o = plan.overrides[cy + '.' + d]; return o && o.slots ? {…tplDay, slots: o.slots} : tplDay;` — overridden days get a small "edited" chip.

- [ ] **Step 2: Assign flow.** Sheet listing `templates.filter(t=>t.status==='published')` as `.trow` radio rows + an **Ask AI to fit** button that pre-selects the track-matching template and shows an `HV.ui.aidraft` rationale ("Sedentary track, cycle 3 — Foundation fits; confirm to assign") — human taps **Assign** either way. Writes `clientPlans[cid] = {templateId, modified:false, assignedBy:me.id, overrides:{}, log:[{act,byId,minsAgo:0}]}`, `HV.save()`, `HV.refresh()`, toast.

- [ ] **Step 3: Edit-day flow.** **Edit day** button per day, gated: ops/`assignPlan` edit all slots; a pillar coach (`editCatalog`) only their pillar's slots (others render read-only in the sheet). Sheet per slot: option groups as rows (each shows its items + remove ✕ per item + "＋ item" opening a picker `select` of `catalog[pillar]` filtered to the template's track), "＋ Add alternative" appends an empty group, "Remove option" deletes a group (min 1 group, min 1 item enforced). Save deep-copies the day's slots into `overrides['cy.d']`, sets `modified:true`, appends to `log`, `HV.save()` + `HV.refresh()`.

- [ ] **Step 4: Save-as-template + approval.** Button (perms `assignPlan` or `editTemplates`): sheet with name input; builds `{id:'tp-'+Date-free suffix (use templates.length+1), name, desc:'Adapted from '+base.name+' for '+c.name, track:base.track, by:me.id, base:base.id, status:'draft', cycles: deepCopy(base.cycles) with every override applied}`; push to `templates`; then a second affordance on draft templates **Submit for approval**: `HV.approvals.submit({id:'ap-tpl-'+tplId, type:'template', title:'Template — '+name, ownerId:me.id, aiDraft:desc,…})` following the shape in data.js:1259. In console-approvals.js add `template:'Template'` to TYPE_LABELS. On final signature the existing publish path flips approvals status; add in the approvals publish switch: `if (ap.type==='template'){ const t=HV.store.templates.find(t=>'ap-tpl-'+t.id===ap.id); if(t) t.status='published'; }` (place it where level/calendar types already special-case).

- [ ] **Step 5: Verify.** `node --check` both files. Browser walkthrough (THE demo flow): Haalving Coach → Rajesh → Plan: cycle 2 day 3 shows "edited" chip and Idli+Chutney or Cheela; edit day 4 breakfast, add Dosa+Chutney option → Modified appears; Save as new template "Rajesh Special" → appears in `#/catalog` templates as draft (after Task 10; for now check `HV.store.templates.length` via console) → Submit for approval → as Operations Head approve → as Super User final-approve → `status:'published'`. Console clean.

- [ ] **Step 6: Commit.** `git commit -am "feat(clients): Plan tab — assign, AND/OR day editor, save-as-template riding the approval chain"`

---

### Task 9: Catalog view — items + Books tab

**Files:**
- Create: `app/js/views/console-catalog.js`
- Delete: `app/js/views/console-library.js` (its level-books renderer moves here)
- Modify: `app/index.html` (script tag swap), `app/sw.js` (ASSETS swap) — *just the file swap; version bump waits for Task 14*

**Interfaces:**
- Consumes: `store.catalog` (Task 3), `store.program/cultureCriteria/bodyCriteria` (books), perms `editCatalog`/`editAnyCatalog` + ROLE_PILLAR `{dietitian:'culture', fitness:'fitness', yoga:'yoga', mind:'wellness'}`.
- Produces: view `catalog` at `#/catalog/:tab` where tab ∈ `fitness|yoga|culture|wellness|templates|books` (default = coach's own pillar else `fitness`); Templates tab body delegated to `HV.catalogTemplates.mount(el)` (Task 10 provides it; until then render an `.empty` "Templates editor lands next commit").

- [ ] **Step 1: Scaffold + tabs.** Register `catalog` (no roles array — nav gate). `HV.ui.tabs` items: Fitness · Yoga · Nutrition · Mind Wellness · Templates · Books (display names; hash keeps keys: `#/catalog/culture`). Kicker "THE CATALOG".

- [ ] **Step 2: Item list.** Per pillar tab: `.tfil` row (track chips Sedentary/Moderate/Active + tag chips from the union of that pillar's tags + text search input) over `.list` of `.trow` items (name `<b>`, `<small>` = first sentence of instructions + tag chips; trailing: track pill). Row click → detail sheet: all fields (instructions, media thumb if any, caution `.notice.warn`, notes, tags, and for culture a nutrient mini-table `.tablewrap table.data` kcal/protein/carbs/fat/fibre + micros + allergies chips in `.notice.bad` tone when present).

- [ ] **Step 3: Authoring.** **＋ Add item** button visible when `HV.can('editAnyCatalog') || (HV.can('editCatalog') && ROLE_PILLAR[me.role] === pillarKey)`. Sheet form: name (label **Food** on culture), track select, instructions textarea, tags (comma input, split+trim), caution (hidden for wellness), notes; culture adds kcal/protein/carbs/fat/fibre number inputs + allergies comma input. Save: `{id:'ci-'+Math-free unique (use 'ci-x'+(list.length+1)+'-'+Date-free… use HV.store.padSeq++ style counter `catSeq`)}`, unshift into `catalog[pillar]`, `HV.save()+HV.refresh()`, toast. Edit = same sheet prefilled; Delete (ops only) with confirm sheet. **Note:** runtime items live in the boot-refilled `catalog` — acceptable demo trade-off (they survive the session, vanish on hard reset); note it in the sheet's `.audit` line "Demo: custom items reset with demo data".

- [ ] **Step 4: Books tab.** Port console-library.js's render (pillar/track book cards over `program`, criteria notices) verbatim into a `booksHtml()` section under the Books tab. Update its internal links from `#/library/…` to `#/catalog/…`. Then delete console-library.js, swap the script tag in index.html and the ASSETS entry in sw.js to `console-catalog.js` (keep the current `?v=` number for now).

- [ ] **Step 5: Verify.** `node --check app/js/views/console-catalog.js`. Browser: as Dietician `#/catalog` opens on Nutrition, ＋ Add item present there but NOT on Fitness; add "Millet khichdi" with macros + allergy "none" → appears, survives `HV.refresh`; as Yoga Coach add button only on Yoga; as Super User no add buttons anywhere; Books tab renders the old level books; `#/library/yoga` redirects to `#/catalog/yoga`. Console clean.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(catalog): four pillar catalogs with authoring + Books tab; library retired"`

---

### Task 10: Catalog Templates tab — list + 7×11 editor

**Files:**
- Modify: `app/js/views/console-catalog.js`

**Interfaces:**
- Consumes: `store.templates/catalog/programShape`, perms `editTemplates/editAnyCatalog/editCatalog`, the slot/options shapes (Task 4), approval submit pattern (Task 8 Step 4 — reuse the same code path for Submit-for-approval).
- Produces: `HV.catalogTemplates.mount(el)` (also used as the Templates tab body); template editor URL state `#/catalog/templates/:tplId?`.

- [ ] **Step 1: Template list.** `.list` of `.trow` per template: name `<b>`, `<small>` desc + by-line, trailing status pill (`published` brand / `draft` neutral) + track pill. **＋ New template** (perm `editTemplates`): sheet with name, track select, "start from" select (blank 7×11 skeleton from `programShape` — every day gets rest/review/meeting flags and empty slots — or copy of an existing template). Row click opens the editor.

- [ ] **Step 2: Editor.** Header (name editable inline for draft + `editTemplates`, status pill, Submit for approval button on drafts — reuse Task 8's submit code); cycle chips 1–7 (missing cycles on drafts render as "＋ add cycle" which deep-copies the previous cycle); 11-day grid (reuse the `.grid` + day-cell grammar from the client plan mini-grid: day number, rest/review/meeting marks, per-pillar dot row for days with slots). Day click → the SAME slot-editor sheet as Task 8 Step 3 (extract that sheet into a shared local `slotSheet(daySlots, opts, onSave)` used by both plan-tab overrides and template editing — one grammar, two writers). Published templates open read-only (edit affordances hidden) with a "Duplicate to edit" button (copies to a new draft with `base` set).

- [ ] **Step 3: Verify.** `node --check`. Browser as Haalving Coach: `#/catalog/templates` lists Foundation (published) + Muscle Building (draft) + any Task-8 creations; open the draft → cycles 1–2 present, "＋ add cycle" works; edit day 1 breakfast options; Submit for approval → chain runs (Ops Head → Super User) → published. As Fitness Coach: can open a draft and edit only fitness slots (others read-only in the sheet). Console clean.

- [ ] **Step 4: Commit.** `git commit -am "feat(catalog): template list + 7×11 editor sharing the AND/OR slot sheet"`

---

### Task 11: Tribe admin

**Files:**
- Create: `app/js/views/console-tribe-admin.js`
- Modify: `app/index.html` + `app/sw.js` (add the file; version bump waits)

**Interfaces:**
- Consumes: `store.tribeFeed` (`quizDays/events/challenges/posts` shapes at data.js:914–1129), perm `manageTribe`.
- Produces: view `tribe-admin` at `#/tribe-admin/:section`, sections `quiz|gatherings|challenges|posts` (default `gatherings`).

- [ ] **Step 1: Scaffold.** Register `tribe-admin` (no roles array). Tabs: Gatherings · Challenges · Quiz days · Posts. Kicker "THE COMMONS". Each section: `.list` of `.trow` (title, when/where or days, trailing count pill e.g. `going.length` — display only) + **＋ Add** and per-row **Edit** when `HV.can('manageTribe')`; read-only rows otherwise (Super User).

- [ ] **Step 2: Sheets.** Gatherings (events): title, when, where, host, spots, desc textarea, about/agenda/bring as one-item-per-line textareas (agenda lines `t | v` split on `|`). Challenges: title, days, host, stake, desc, about/how lines, arc lines `k | v`. Quiz days: label, date, and questions as blocks (q, options one-per-line, correct index, why). Posts: by (staff select), caption, kind fixed `'text'`. Save mutates ONLY content fields on the existing object (never `going/joined/likes/answered/answers`), or pushes a new object with state fields initialised empty (`going:0` pattern-match the seed's field types — check each before writing), `HV.save()+HV.refresh()`. Delete: `manageTribe` + ops role (admin/opshead), confirm sheet, splice.

- [ ] **Step 3: Verify.** `node --check`. Browser as Haalving Coach: create gathering "Full-moon beach walk" → appears in list; open client app as Rajesh (`#/tribe`) → the gathering shows on the client Tribe page with its long-read page intact; edit its `when` in console → client page reflects. As Super User: rows visible, no add/edit buttons. Console clean both shells.

- [ ] **Step 4: Commit.** `git add -A && git commit -m "feat(tribe): console Tribe management — gatherings, challenges, quiz days, posts CRUD"`

---

### Task 12: People & Access editor

**Files:**
- Modify: `app/js/views/console-people.js`

**Interfaces:**
- Consumes: `store.roles` (Task 2), `store.users/capacity`, `HV.roleDef`, `HV.NAV_ITEMS`, perms `managePeople`/`overrideCapacity`; `HV.capacityPanel` unchanged.
- Produces: staff CRUD (`users[]` gains optional `{subtitle, inactive}`), role editor writing `store.roles`; **perm catalog** `PERM_LABELS` (exported as `HV.PERM_LABELS` for reuse):

```js
  HV.PERM_LABELS = {
    seeAllClients:'See all clients', approve:'Sign approvals', allocate:'Allocate team',
    overrideCapacity:'Override capacity', editRules:'Edit rules', finalizeLevel:'Finalize levels',
    sendDigest:'Bulk-send digest', keyInBody:'Key in body records', rawRecords:'Raw medical records',
    signSummary:'Sign health summaries', rateMeals:'Rate meals', buildDiet:'Build diets',
    buildCharts:'Build charts', editCatalog:'Edit own catalog', editAnyCatalog:'Edit all catalogs',
    editTemplates:'Edit templates', assignPlan:'Assign client plans', manageTribe:'Manage tribe',
    managePeople:'Manage people & roles', manageConfig:'Manage configuration',
  };
```

- [ ] **Step 1: Staff tab.** Existing list + (perm `managePeople`) **＋ Add employee** sheet: name, role select (from `Object.keys(store.roles)` with titles), subtitle optional → push `{id:'u-'+slug(name), role, name, subtitle}` to `users`, push `{staffId:id, roleLabel:store.roles[role].title, load:0, cap:6}` to `capacity`, save/refresh/toast. Per-row **Deactivate/Reactivate** toggle sets `u.inactive`; filter `inactive` users out of: schedule `staffAll` + person select, capacity panel rows, pod/assignee pickers (grep for `role !== 'client'` filters and add `&& !u.inactive`).

- [ ] **Step 2: Roles & Permissions tab.** Render the matrix FROM `store.roles` (the object `HV.can` consults — the no-drift guarantee): one section per role — title (inline-editable with `managePeople`), a **Sidebar** chip row (all 8 `HV.NAV_ITEMS` labels, chip on/off = membership in `role.nav`) and a **Permissions** chip row (`HV.PERM_LABELS`, on/off = in `role.perms`). Chips are toggles only with `managePeople`; otherwise static. Toggling writes `store.roles[key]`, `HV.save()`; nav chips call `HV.refresh()` (sidebar may change live). **Guard:** the `admin` role's `people` nav and `managePeople` perm cannot be turned off — render those two chips disabled with an `.audit` "the key cabinet always keeps one key".

- [ ] **Step 3: New role.** **＋ New role** (managePeople): sheet with role name + "copy from" select → `key = 'r-'+slug(name)`; `store.roles[key] = deepCopy(store.roles[base])` with `title` = name; toast "Role created — appears in Add-employee and the matrix". (Login personas stay the seeded eleven; new roles are demoed via the matrix + an added employee.)

- [ ] **Step 4: Verify.** `node --check`. Browser as Super Admin: add employee "Divya" as Dietician → appears in staff list, Schedule person-select, capacity; create role "Content Editor" copied from Fitness Coach, untick everything but Catalog in its sidebar chips; add employee with that role; matrix shows the new row; as Operations Head: staff visible, capacity editable, matrix read-only chips, no add-role; as Super User: all read-only. Console clean.

- [ ] **Step 5: Commit.** `git commit -am "feat(people): add-employee, deactivate, live role & permission editor with no-lockout guard"`

---

### Task 13: Configuration view

**Files:**
- Create: `app/js/views/console-config.js`
- Modify: `app/js/views/console-pipeline.js` (delete its `config` registration + cyclesHtml/passHtml; keep `incoming` board + `HV.capacityPanel`), `app/index.html` + `app/sw.js` (add file)

**Interfaces:**
- Consumes: `store.programShape/notifRules/chains`, `HV.PLANS`, perm `manageConfig`; the notifRules inline-edit behaviour ports verbatim from console-pipeline.js:318–356.
- Produces: view `config` at `#/config/:tab`, tabs `program|plans|chains|notifications` (default `program`).

- [ ] **Step 1: Program tab.** Card of `.stat` tiles from `programShape` (7 levels · 11-day cycle · Day-9 review · rest days 5 & 10 · sessions 5+3+1) + criteria counts (ported from passHtml: cultureCriteria gates count, bodyCriteria bars). With `manageConfig`: number inputs (inline-edit pattern from notifRules) writing `programShape`, each save appending an `.audit` line "Changes apply from each client's next cycle — a mid-cycle change never retro-fails anyone". Without perm: read-only tiles.
- [ ] **Step 2: Plans tab.** Three `.card`s from `HV.PLANS` (Black/Grey/White: name, tag, flow, desc) — read-only, with an `.audit` "Plan definitions ship with the product".
- [ ] **Step 3: Chains tab.** Per `store.chains` type: a row with `HV.ui.stepper`-style step list showing each stage's ROLE TITLE via `HV.roleDef(step.role).title` — read-only. (This is where "Haalving Coach → Operations Head → Super User" becomes visible product truth.)
- [ ] **Step 4: Notifications tab.** Port the notifRules table + inline schedule edit + enabled toggle verbatim. Then delete config from console-pipeline.js and register the new view (no roles array). Add script tag + ASSETS entry.
- [ ] **Step 5: Verify.** `node --check` both files. Browser as Super Admin: edit review day 9→8 → audit line appears, value persists (display-only downstream is fine per spec); as Operations Head: editable; as Super User: read-only; as Haalving Coach: `#/config` shows the lock screen (not in nav). Console clean.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(config): Configuration view — program shape, plans, chains, notifications"`

---

### Task 14: Ship gate — versions + full persona sweep

**Files:**
- Modify: `app/index.html`, `app/sw.js`

**Interfaces:** none — this is the release valve.

- [ ] **Step 1: Re-grep live versions** (concurrent sessions!): `grep -o 'v=[0-9]*' app/index.html | sort -u` and `grep CACHE app/js/../sw.js` → take the HIGHEST seen anywhere, +1 (if still v148 → v149). Update EVERY `?v=NN` in index.html and `const CACHE = 'haalving-demo-vNN'` in sw.js. Confirm script tags exactly: console-library.js gone; console-catalog.js, console-tribe-admin.js, console-config.js present in BOTH index.html and sw.js ASSETS.
- [ ] **Step 2: Syntax sweep.** `for f in app/js/core.js app/js/data.js app/js/views/console-*.js; do node --check "$f" || echo "FAIL $f"; done` → zero FAIL lines.
- [ ] **Step 3: Persona sweep** (browser, after Reset demo data; every persona from the login screen):
  - **Super Admin:** 8 sidebar items · Home tiles+ledger · People add-employee + new-role · Configuration edits.
  - **Super User:** home lands `#/queues/approvals` · everything readable, nothing editable except signing.
  - **Operations Head:** Clients onboarding rail (allocate/override) · Catalog full edit · Config edit.
  - **Haalving Coach:** THE demo flow — Rajesh Plan tab swap → save-as-template → submit → (switch personas) two signatures → published. 6 sidebar items (no People, no Config).
  - **Doctor:** 5 items · Docs raw records + access log · Queues Medical tab, no Approvals tab.
  - **Dietician:** home lands meals queue · Nutrition catalog add · rating flow still pushes to circle.
  - **Fitness/Yoga/Mind Wellness Coach:** own-pillar catalog authoring · pod-scoped rail.
  - **Client (Rajesh):** client app unaffected — Today/Plan/Tribe render; the Task-11 gathering visible.
  - Redirect spot-checks: `#/circles`, `#/circles/c-rajesh`, `#/approvals`, `#/pipeline`, `#/library/yoga`, `#/meals`, `#/client/c-rajesh`.
  - Phone width (390×844) on `#/clients/c-rajesh/circle` + dark-mode pass on Catalog and Clients.
  - Console clean on every route above.
- [ ] **Step 4: Fix-forward anything the sweep catches** (each fix: edit → `node --check` → re-verify that persona).
- [ ] **Step 5: Commit.** `git commit -am "chore(release): v149 — Admin & Team Panel console IA ships"`

---

## Self-Review Notes

- Spec §1–§11 all map to tasks (nav/aliases→1, roles/seeds→2–4, queues→5, home→6, clients→7–8, catalog/templates→9–10, tribe→11, people→12, config→13, ship→14). §12 demo script = Task 14 Step 3.
- Type consistency: `roleDef/allowedView/VIEW_NAV` (Task 1) consumed in 5,7,9,13; slot/options shape (Task 4) consumed in 8,10 via the shared `slotSheet`; `PERM_LABELS` produced in 12 only (no earlier consumer — fine).
- Known demo trade-offs (accepted in spec "Out of scope"): runtime catalog items reset with demo data; programShape edits are display-source only; pipeline stage-advance not built.
