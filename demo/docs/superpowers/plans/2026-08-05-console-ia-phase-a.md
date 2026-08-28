# Team Console IA Phase A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Team Console sidebar from twelve items to nine, using only content that already exists, without any role losing access.

**Architecture:** A small `HV.registerBoard` contract lets modules that own data register a panel; four host views (Care Circles, Schedule, Queues, Reports) compose those panels into tab bars. New hosts are built first and coexist with the old screens; the final task flips `NAV_ITEMS`, `ROLES`, badge counts and route aliases in one commit, then deletes the retired view registrations.

**Tech Stack:** Plain ES5/ES6 browser JS, no build step, no dependencies. `window.HV` globals loaded in fixed order by `app/index.html`.

**Spec:** `docs/superpowers/specs/2026-08-05-console-ia-phase-a-design.md`

## Global Constraints

- **No test suite exists.** Every task's gate is `node --check <file>` on each edited JS file, then a browser pass. Never claim a task passes without running both.
- **Local server:** `cd app && python3 -m http.server 8090` — port 8080 is taken by another service on this machine.
- **No new dependencies, no build step, no package manager.** Plain `<script>` tags only.
- **UI kit returns HTML strings**, not elements. Build one string, assign `el.innerHTML`, then wire listeners via `[data-*]` queries. All interpolated data goes through `HV.esc()`.
- **No new SVG icon marks.** Every icon used is already in the 45-mark `ICONS` set: `home`, `circle`, `cal`, `clock`, `shield`, `bookmark`, `chart`, `gear`, `users`.
- **Design tokens only** — spacing `--s1`…`--s10`, no raw px. Numerals get `class="num"`. Prefer existing classes (`.card`, `.trow`, `.list`, `.tabs`, `.sec-title`, `.h1-row`, `.stat`, `.grid2`/`.grid3`, `.notice`, `.audit`, `.pill`, `.empty`, `.split`) over new CSS.
- **A pillar's colour appears only in that pillar's own dial, dot, ribbon or series.** Never decoratively.
- **Adding a view file means adding it in three places:** the file, `app/index.html`, and the `ASSETS` list in `app/sw.js`.
- **`HV.seedVersion` is NOT bumped** — no seed shape changes in Phase A.
- **Version bump happens once, in Task 10.** Do **not** assume the number: another session works in this same tree and bumps it too (it took v140 mid-build on 2026-08-05). Re-grep the live values at that moment, adopt the highest, and go one above:
  ```bash
  grep -oE '\?v=[0-9]+' app/index.html | sort -u; grep -n 'haalving-demo-v' app/sw.js
  ```
  Then set every `?v=` in `app/index.html` and `CACHE` in `app/sw.js` to that number + 1, and re-grep afterwards to confirm your value survived. The SW matches with `ignoreSearch: true`, so the cache name is the real lever.
- **Access parity is a hard requirement.** No role may gain or lose reach in Phase A, with one deliberate exception: three dead nav entries that open onto lock screens today are removed (spec §6.1).
- **`HV.tasks` is taken.** `core.js:1382` defines `HV.tasks(client)`, the client app's per-client task builder, used in six places across `client-today.js` and `client-plan.js`. `data.js` loads after `core.js`, so assigning `HV.tasks` there silently breaks every client route. The console's scoped work-list helper is `HV.worklist`. Before adding any `HV.<name>`, grep for it first.
- **Verify the client app too.** The console is not the whole build — one shared global broke every client route while the console looked perfect. Every persona pass ends with a walk of `#/today`, `#/plan`, `#/journey`, `#/trackers`, `#/coach`, `#/profile`, `#/tribe`, `#/meal`.
- **Branch:** `console-ia-phase-a`, already created. Commit after every task.

---

### Task 1: Core plumbing — board registry, tab helper, `owns` matching

Pure addition. Nothing changes on screen; later tasks consume this.

**Files:**
- Modify: `app/js/core.js` (add registry near `HV.registerView` at :226; add `HV.ui.tabs` inside the `HV.ui` object; change active-match at :509)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `HV.registerBoard(key, def)` where `def = { label: string, roles: string[]|undefined, count: function|undefined, mount: function(el) }`
  - `HV.boards` — the raw `{key: def}` map
  - `HV.boardsFor(keys: string[]) → Array<def & {key}>` — filtered to the signed-in role, in the order given
  - `HV.ui.tabs(items: Array<{key,label,count?}>, active: string) → string`
  - `HV.NAV_ITEMS[*].owns?: string[]` — sub-route view names that light this nav item

- [ ] **Step 1: Add the board registry to `core.js`**

Insert immediately after `HV.registerView = function (route, def) { views[route] = def; };` (:226):

```js
  /* ---------------- board registry ----------------
     Four host views (Care Circles, Schedule, Queues, Reports) show panels whose
     data belongs to other modules. The owner registers its panel once; the host
     composes it. A board renders its BODY only — the host owns the page header
     and the tab bar, so a board never draws an h1. Registration order does not
     matter: hosts read the registry at render time. */
  HV.boards = {};
  HV.registerBoard = function (key, def) { HV.boards[key] = def; };

  /* the boards from `keys` this role may see, in the order asked for */
  HV.boardsFor = function (keys) {
    const me = HV.me();
    if (!me) return [];
    return keys
      .map(k => (HV.boards[k] ? Object.assign({ key: k }, HV.boards[k]) : null))
      .filter(b => b && (!b.roles || b.roles.includes(me.role)));
  };
```

- [ ] **Step 2: Add `HV.ui.tabs` to the UI kit**

Find the `HV.ui = {` object in `core.js`. Add this member alongside the other string-returning helpers (`pill`, `gate`, `stars`…), matching their formatting:

```js
    /* the shared tab bar. Hosts render it, then delegate clicks to a route —
       tab state lives in the hash so a refresh keeps your place. */
    tabs(items, active) {
      return '<div class="tabs">' + items.map(t =>
        '<button data-tab="' + HV.esc(t.key) + '" class="' + (t.key === active ? 'on' : '') + '"' +
          (t.key === active ? ' aria-current="page"' : '') + '>' +
          HV.esc(t.label) +
          (t.count ? ' <span class="pill info"><span class="num">' + t.count + '</span></span>' : '') +
        '</button>').join('') + '</div>';
    },
```

- [ ] **Step 3: Teach the shell about `owns`**

In `consoleShell` (:509), replace this line:

```js
          const on = active === routeName || (routeName === 'clients' && active === 'client');
```

with:

```js
          /* every sub-route declares its parent, so the highlight survives a
             deep link (#/client/<id> and #/room/<id> both light Care Circles) */
          const on = active === routeName || (it.owns || []).includes(active);
```

- [ ] **Step 4: Preserve today's behaviour with an `owns` entry**

In `HV.NAV_ITEMS` (:53), add `owns` to the existing `clients` entry so Step 3 is behaviour-neutral:

```js
    clients:  { route: '#/clients',  label: 'Clients',        icon: 'users', owns: ['client'] },
```

- [ ] **Step 5: Syntax check**

Run: `node --check app/js/core.js`
Expected: no output (success).

- [ ] **Step 6: Browser check — nothing changed**

Run `cd app && python3 -m http.server 8090`, open `http://localhost:8090/#/login`, sign in as Admin.
Expected: sidebar identical to before; opening a client from Clients still highlights **Clients**; console clean.

- [ ] **Step 7: Commit**

```bash
git add app/js/core.js
git commit -m "feat(console): board registry, tab helper, owns-based nav matching"
```

---

### Task 2: Split `console-ops.js` into boards; tabbed Reports; `HV.worklist`

`console-ops.js` owns five panels and two views. The five renderers become boards; `reports` becomes a three-tab host; `worklist` keeps working unchanged (it is deleted in Task 10).

**Files:**
- Modify: `app/js/views/console-ops.js`
- Modify: `app/js/data.js` (add `HV.worklist` beside `HV.navCounts` at :1649)

**Interfaces:**
- Consumes: `HV.registerBoard`, `HV.boardsFor`, `HV.ui.tabs` (Task 1)
- Produces:
  - Boards `work`, `deviations`, `live`, `calories`, `incentives`, `exports`
  - `HV.worklist.mine() → Array<worklistItem>` — open tasks visible to the signed-in user
  - `HV.worklist.next() → worklistItem|null` — the most urgent of `mine()`

- [ ] **Step 1: Add `HV.worklist` to `data.js`**

Insert directly above `HV.navCounts = function () {` (:1649):

```js
  /* the work list, scoped the way it has always been scoped: Admin and Ops Head
     see every task, everyone else sees the ones they own. Home reads this; so
     does the work board. */
  HV.worklist = {
    mine: function () {
      const me = HV.me();
      if (!me) return [];
      const open = HV.store.worklist.filter(w => w.status === 'open');
      const isOps = me.role === 'admin' || me.role === 'opshead';
      return isOps ? open : open.filter(w => w.owner === me.id);
    },
    /* clock times and SLAs outrank "today", which outranks everything else.
       sort is stable, so ties keep the order the rules generated them in. */
    next: function () {
      const rank = w => (/\d{1,2}:\d{2}|SLA/.test(w.due) ? 0 : /today/i.test(w.due) ? 1 : 2);
      return HV.worklist.mine().slice().sort((a, b) => rank(a) - rank(b))[0] || null;
    },
  };
```

- [ ] **Step 2: Register the five ops boards**

In `console-ops.js`, after the existing render helpers and before `HV.registerView('worklist'…)`, add. Note each `mount` writes body-only HTML and wires its own listeners:

```js
  var ALL_STAFF = ['admin', 'opshead', 'doctor', 'dietitian', 'fitness', 'yoga', 'mind'];
  var OPS_ONLY  = ['admin', 'opshead'];

  function wireDone(el) {
    el.querySelectorAll('[data-done]').forEach(function (b) {
      b.addEventListener('click', function () {
        var item = HV.store.worklist.find(function (w) { return w.id === b.dataset.done; });
        if (!item) return;
        item.status = 'done';
        HV.save();
        HV.refresh();
        HV.toast('Task auto-cleared. The underlying rule is satisfied.');
      });
    });
  }

  HV.registerBoard('work', {
    label: 'Work list',
    roles: ALL_STAFF,
    count: function () { return HV.worklist.mine().length; },
    mount: function (el) {
      var me = HV.me();
      var isOps = me.role === 'admin' || me.role === 'opshead';
      el.innerHTML = renderWorkTab(isOps, me);
      wireDone(el);
    },
  });

  HV.registerBoard('deviations', {
    label: 'Deviations',
    roles: ALL_STAFF,
    mount: function (el) { el.innerHTML = renderDeviationsTab(); },
  });

  HV.registerBoard('live', {
    label: 'Live board',
    roles: ALL_STAFF,
    mount: function (el) { el.innerHTML = renderLiveTab(); },
  });

  HV.registerBoard('calories', {
    label: 'Calorie log',
    roles: ALL_STAFF,
    mount: function (el) { el.innerHTML = renderCaloriesTab(); },
  });

  HV.registerBoard('incentives', {
    label: 'Incentives',
    roles: OPS_ONLY,
    mount: function (el) { el.innerHTML = renderIncentivesTab(true); },
  });
```

`renderIncentivesTab(true)` is safe because the board's `roles` already restricts it to Ops — the in-view lock screen becomes tab absence, which is what the spec asks for (§4.8).

- [ ] **Step 3: Turn the export cards into an `exports` board**

Replace the body of `HV.registerView('reports', …)`'s render with a board plus a host. First register the board, directly after the `incentives` board:

```js
  HV.registerBoard('exports', {
    label: 'Exports',
    roles: OPS_ONLY,
    mount: function (el) {
      el.innerHTML =
        '<div class="grid2">' + REPORT_CARDS.map(function (c, i) {
          return '<div class="card">' +
            '<b>' + HV.esc(c.t) + '</b>' +
            '<p class="sub" style="margin:var(--s1) 0 var(--s3)">' + HV.esc(c.s) + '</p>' +
            '<button class="btn sm quiet" data-export="' + i + '">Export</button>' +
          '</div>';
        }).join('') + '</div>' +
        '<div class="notice">Live sheets replace the spreadsheets; exports exist for the CRM and audits.</div>';
      el.querySelectorAll('[data-export]').forEach(function (b) {
        b.addEventListener('click', function () {
          HV.toast('Exported (demo). Three taps or fewer in production.');
        });
      });
    },
  });
```

- [ ] **Step 4: Rewrite the `reports` view as a three-tab host**

Replace the whole `HV.registerView('reports', …)` block with:

```js
  /* Reports opens to every role that can read a calorie log today — the tabs,
     not the door, carry the restriction. */
  HV.registerView('reports', {
    title: 'Reports & Exports',
    roles: ALL_STAFF,
    render: function (el, params) {
      var boards = HV.boardsFor(['exports', 'calories', 'incentives']);
      if (!boards.length) {
        el.innerHTML = HV.ui.empty('leaf', 'Nothing here for your role.');
        return;
      }
      var active = boards.some(function (b) { return b.key === params[0]; }) ? params[0] : boards[0].key;
      var board = boards.find(function (b) { return b.key === active; });

      el.innerHTML =
        '<div class="h1-row"><div><div class="kicker">THE LEDGER</div><h1 class="h1">Reports &amp; Exports</h1>' +
        '<p class="sub">Everything the team used to copy into spreadsheets by hand, generated live.</p></div></div>' +
        HV.ui.tabs(boards, active) +
        '<div id="board-root" style="display:flex;flex-direction:column;gap:var(--s3);margin-top:var(--s3)"></div>';

      board.mount(el.querySelector('#board-root'));

      el.querySelectorAll('.tabs button').forEach(function (b) {
        b.addEventListener('click', function () { HV.go('#/reports/' + b.dataset.tab); });
      });
    },
  });
```

- [ ] **Step 5: Syntax check**

Run: `node --check app/js/views/console-ops.js && node --check app/js/data.js`
Expected: no output.

- [ ] **Step 6: Browser check**

As **Admin**: `#/reports` shows three tabs; clicking each swaps the body and changes the hash; refresh keeps the tab. `#/worklist` still shows its five tabs and Done still clears a task.
As **Vikram (Fitness Trainer)**: `#/reports` shows exactly one tab, *Calorie log*. No Incentives tab.
Console clean in both.

- [ ] **Step 7: Commit**

```bash
git add app/js/views/console-ops.js app/js/data.js
git commit -m "feat(console): ops panels become boards; Reports gains tabs; HV.tasks"
```

---

### Task 3: Register `meals`, `medical` and `incoming` boards

Three modules each expose their panel. Their existing views keep working by mounting their own board — no duplicated markup.

**Files:**
- Modify: `app/js/views/console-meals.js`
- Modify: `app/js/views/console-medical.js`
- Modify: `app/js/views/console-pipeline.js`

**Interfaces:**
- Consumes: `HV.registerBoard` (Task 1)
- Produces: boards `meals`, `medical`, `incoming`

- [ ] **Step 1: `meals` board**

In `console-meals.js`, `draw(el)` renders the whole page including its `h1-row`. Split it: move the `h1-row` string out of `draw` into the view, leaving `draw` body-only. Then replace the view registration (:316) with:

```js
  HV.registerBoard('meals', {
    label: 'Meals',
    roles: ['dietitian', 'admin', 'opshead'],
    count: function () { return HV.store.meals.filter(function (m) { return !m.final; }).length; },
    mount: function (el) { draw(el); },
  });

  HV.registerView('meals', {
    title: 'Meal Review Queue',
    roles: ['dietitian', 'admin', 'opshead'],
    render(el) {
      el.innerHTML = '<div class="h1-row"><div><div class="kicker">THE QUEUE</div>' +
        '<h1 class="h1">Meal review queue</h1></div></div><div id="board-root"></div>';
      draw(el.querySelector('#board-root'));
    },
  });
```

If `draw` currently emits its own `h1-row`, delete that fragment from `draw` — the header above replaces it verbatim in wording.

- [ ] **Step 2: `medical` board**

In `console-medical.js`, `headerHtml(cap, nPending, nSigned)` returns an `h1-row` followed by a `grid3` of stats. Split it into two functions — `pageHeadHtml()` returning just the `h1-row` fragment, and `statsHtml(cap, nPending, nSigned)` returning just the `grid3` — and have `draw()` call `statsHtml` only. Then add, before the view registration:

```js
  HV.registerBoard('medical', {
    label: 'Medical',
    roles: ['doctor'],
    count: function () {
      return HV.store.documents.filter(function (d) { return d.summary === 'pending'; }).length;
    },
    mount: function (el) { mountInto(el); },
  });
```

`draw()` closes over the view's `el`. Rename the closure so it takes its container explicitly: change `render(el) { draw(); function draw() { … el.innerHTML = … } }` into a module-level `function mountInto(el) { … }` holding the same body, and have the view call it. The `wire(selected, me)` call inside must query from that same `el`.

The view registration becomes:

```js
  HV.registerView('medical', {
    title: 'Medical Review',
    roles: ['doctor'],
    render(el) {
      el.innerHTML = '<div class="h1-row"><div><div class="kicker">THE DOCTOR’S DESK</div>' +
        '<h1 class="h1">Medical review &amp; health summary</h1>' +
        '<p class="sub" style="margin:0">Doctor only — raw documents render for no other role. ' +
        'Every open is audit-logged.</p></div></div><div id="board-root"></div>';
      mountInto(el.querySelector('#board-root'));
    },
  });
```

- [ ] **Step 3: `incoming` board**

In `console-pipeline.js`, the `pipeline` view's render is one long `el.innerHTML = …` followed by three wiring blocks. Extract everything after the `h1-row` fragment into `function mountIncoming(el)`, then register:

```js
  HV.registerBoard('incoming', {
    label: 'Incoming',
    roles: ['admin', 'opsmgr', 'opshead'],
    count: function () { return HV.store.pipeline.length; },
    mount: function (el) { mountIncoming(el); },
  });
```

Keep `HV.registerView('pipeline', …)` rendering the `h1-row` plus `mountIncoming` into a child div, exactly as Steps 1–2 do.

- [ ] **Step 4: Syntax check**

Run: `node --check app/js/views/console-meals.js && node --check app/js/views/console-medical.js && node --check app/js/views/console-pipeline.js`
Expected: no output.

- [ ] **Step 5: Browser check**

As **Sneha (Dietitian)**: `#/meals` renders as before, and rating a meal still works end to end.
As **Dr. Kavya**: `#/medical` renders as before; selecting a document still opens the reviewer and signing still works.
As **Admin**: `#/pipeline` renders as before; the capacity override still demands a reason, and *Review & send welcome* still sends.
Console clean in all three.

- [ ] **Step 6: Commit**

```bash
git add app/js/views/console-meals.js app/js/views/console-medical.js app/js/views/console-pipeline.js
git commit -m "feat(console): meals, medical and incoming register as boards"
```

---

### Task 4: Queues host

**Files:**
- Create: `app/js/views/console-queues.js`
- Modify: `app/index.html` (add script tag)
- Modify: `app/sw.js` (add to `ASSETS`)

**Interfaces:**
- Consumes: `HV.boardsFor`, `HV.ui.tabs`, boards `meals`/`medical`/`deviations`/`live`
- Produces: view `queues` at `#/queues/<board>`

- [ ] **Step 1: Create the host**

```js
/* HAALVING console view — Queues. The four SLA-bound surfaces in one place:
   meal ratings, medical summaries, deviations and the live board. Status by
   exception: a role with no permitted board never sees this item in the nav. */
(function () {
  'use strict';

  var ORDER = ['meals', 'medical', 'deviations', 'live'];

  HV.registerView('queues', {
    title: 'Queues',
    roles: ['admin', 'opshead', 'doctor', 'dietitian', 'fitness', 'yoga', 'mind'],
    render: function (el, params) {
      var boards = HV.boardsFor(ORDER);
      if (!boards.length) {
        el.innerHTML = HV.ui.empty('leaf', 'No queues for your role.');
        return;
      }
      var active = boards.some(function (b) { return b.key === params[0]; }) ? params[0] : boards[0].key;
      var board = boards.find(function (b) { return b.key === active; });
      var open = boards.reduce(function (n, b) { return n + (b.count ? b.count() : 0); }, 0);

      el.innerHTML =
        '<div class="h1-row"><div><div class="kicker">THE CLOCK</div><h1 class="h1">Queues</h1>' +
        '<p class="sub">Work the rules put on a clock — rated, signed or cleared before its SLA runs out.</p></div>' +
        '<span class="pill ' + (open ? 'warn' : 'ok') + '"><span class="num">' + open + '</span> waiting</span></div>' +
        HV.ui.tabs(boards.map(function (b) {
          return { key: b.key, label: b.label, count: b.count ? b.count() : 0 };
        }), active) +
        '<div id="board-root" style="display:flex;flex-direction:column;gap:var(--s3);margin-top:var(--s3)"></div>';

      board.mount(el.querySelector('#board-root'));

      el.querySelectorAll('.tabs button').forEach(function (b) {
        b.addEventListener('click', function () { HV.go('#/queues/' + b.dataset.tab); });
      });
    },
  });
})();
```

- [ ] **Step 2: Register the file in both places**

`app/index.html` — add beside the other console view scripts, keeping the existing `?v=139` for now (Task 10 bumps them all together):

```html
    <script src="js/views/console-queues.js?v=139"></script>
```

`app/sw.js` — add `'./js/views/console-queues.js',` to the `ASSETS` array beside the other console views (:14-17).

- [ ] **Step 3: Syntax check**

Run: `node --check app/js/views/console-queues.js`
Expected: no output.

- [ ] **Step 4: Browser check**

Hard-reload (the SW caches aggressively; use DevTools → Application → *Update on reload* or an incognito window).
As **Sneha (Dietitian)**: `#/queues` lands on *Meals* with a count badge; *Deviations* and *Live board* tabs also present; no *Medical* tab.
As **Dr. Kavya**: `#/queues` lands on *Medical*; no *Meals* tab.
As **Vikram (Fitness)**: `#/queues` lands on *Deviations*; two tabs only.
Console clean.

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-queues.js app/index.html app/sw.js
git commit -m "feat(console): Queues host for the four SLA surfaces"
```

---

### Task 5: Library host (read-only)

**Files:**
- Create: `app/js/views/console-library.js`
- Modify: `app/index.html`, `app/sw.js`

**Interfaces:**
- Consumes: `HV.store.program`, `HV.store.mealPlans`, `HV.store.cultureCriteria`, `HV.store.bodyCriteria`, `HV.PILLARS`, `HV.ui.tabs`
- Produces: view `library` at `#/library/<pillarKey>`

**Data shapes this task reads** (all verified present):
- `program[pillar][track][level]` → `{ phase, tag, goal, intensity, rpe, steps, water, screen, home: { mins, sets: [{k,name,dose}], demos: [] }, gym: { mins, line } }`. Pillar keys: `fitness`, `yoga`, `culture`, `wellness`. Track keys: `sedentary`, `moderate`, `active`. Levels `1`–`7`.
- `cultureCriteria.gates` → `[{ key, label, target }]`
- `bodyCriteria` → `{ bar, sessionBars: { fitness, yoga }, tracks: { <track>: { label, levels: { 1: [string] } } } }`

Fields are not uniformly present across pillars — render each only when truthy.

- [ ] **Step 1: Create the view**

```js
/* HAALVING console view — Library. The level books, read-only. Four tabs, one
   per pillar, over the program catalogue that already ships in the seed.
   Authoring arrives in Phase D; this screen draws no edit affordance at all,
   not even a disabled one. */
(function () {
  'use strict';

  var PILLAR_ORDER = ['culture', 'fitness', 'yoga', 'wellness'];
  var TRACKS = [
    { key: 'sedentary', label: 'Sedentary' },
    { key: 'moderate',  label: 'Moderately Active' },
    { key: 'active',    label: 'Active' },
  ];
  var track = 'moderate';   /* transient: which activity track is on screen */

  function field(k, v) {
    if (!v) return '';
    return '<div class="stat"><div class="k">' + HV.esc(k) + '</div>' +
      '<div class="sub num">' + HV.esc(v) + '</div></div>';
  }

  function levelCard(lvl, d) {
    if (!d) return '';
    var sets = (d.home && d.home.sets || []).map(function (s) {
      return '<div class="trow"><span class="grow"><b>' + HV.esc(s.name) + '</b>' +
        '<small>' + HV.esc(s.k) + '</small></span>' +
        '<span class="pill neutral"><span class="num">' + HV.esc(s.dose) + '</span></span></div>';
    }).join('');
    var demos = (d.home && d.home.demos || []).map(function (n) {
      return '<span class="chip">' + HV.esc(n) + '</span>';
    }).join('');

    return '<div class="card">' +
      '<div class="h1-row"><div><div class="kicker">LEVEL ' + lvl + '</div>' +
        '<b>' + HV.esc(d.phase || ('Level ' + lvl)) + '</b>' +
        (d.tag ? '<div class="sub">' + HV.esc(d.tag) + '</div>' : '') + '</div></div>' +
      (d.goal ? '<p class="sub">' + HV.esc(d.goal) + '</p>' : '') +
      '<div class="grid3">' +
        field('Intensity', d.intensity) + field('RPE', d.rpe) + field('Steps', d.steps) +
        field('Water', d.water) + field('Screen', d.screen) +
        field('Home', d.home && d.home.mins ? d.home.mins + ' min' : '') +
      '</div>' +
      (sets ? '<div class="sec-title">Home set</div><div class="list">' + sets + '</div>' : '') +
      (demos ? '<div class="sec-title">Demos</div><div class="row" style="flex-wrap:wrap;gap:var(--s2)">' + demos + '</div>' : '') +
      (d.gym && d.gym.line
        ? '<div class="sec-title">Gym · <span class="num">' + HV.esc(d.gym.mins) + '</span> min</div>' +
          '<p class="sub">' + HV.esc(d.gym.line) + '</p>'
        : '') +
    '</div>';
  }

  function criteriaHtml(pillar) {
    if (pillar === 'culture') {
      var gates = (HV.store.cultureCriteria.gates || []).map(function (g) {
        return '<div class="trow"><span class="grow"><b>' + HV.esc(g.label) + '</b></span>' +
          '<span class="pill neutral"><span class="num">' + HV.esc(g.target) + '</span></span></div>';
      }).join('');
      return '<div class="sec-title">Level-up gates</div><div class="list">' + gates + '</div>';
    }
    if (pillar === 'fitness' || pillar === 'yoga') {
      var bc = HV.store.bodyCriteria;
      var t = bc.tracks[track];
      var goals = t ? Object.keys(t.levels).map(function (l) {
        return '<div class="trow"><span class="grow"><b>Level ' + HV.esc(l) + '</b>' +
          '<small>' + HV.esc(t.levels[l].join(' · ')) + '</small></span></div>';
      }).join('') : '';
      return '<div class="sec-title">Level-up criteria</div>' +
        '<div class="notice">Bar: <span class="num">' + HV.esc(bc.bar) + '</span> · sessions ' +
        '<span class="num">' + HV.esc(bc.sessionBars[pillar] || '—') + '</span></div>' +
        '<div class="list">' + goals + '</div>';
    }
    return '';
  }

  HV.registerView('library', {
    title: 'Library',
    roles: ['admin', 'opsmgr', 'opshead', 'core', 'doctor', 'dietitian', 'fitness', 'yoga', 'mind'],
    render: function (el, params) {
      var pillar = PILLAR_ORDER.indexOf(params[0]) !== -1 ? params[0] : 'culture';
      var book = (HV.store.program || {})[pillar] || {};
      var levels = book[track] || {};

      el.innerHTML =
        '<div class="h1-row"><div><div class="kicker">THE BOOKS</div><h1 class="h1">Library</h1>' +
        '<p class="sub">The level books every plan is built from — seven levels across three activity tracks.</p></div></div>' +
        HV.ui.tabs(PILLAR_ORDER.map(function (k) {
          return { key: k, label: HV.PILLARS[k].name };
        }), pillar) +
        '<div class="tabs" style="margin-top:var(--s2)">' + TRACKS.map(function (t) {
          return '<button data-track="' + t.key + '" class="' + (t.key === track ? 'on' : '') + '">' +
            HV.esc(t.label) + '</button>';
        }).join('') + '</div>' +
        criteriaHtml(pillar) +
        '<div class="sec-title">Level book</div>' +
        (Object.keys(levels).length
          ? Object.keys(levels).map(function (l) { return levelCard(l, levels[l]); }).join('')
          : HV.ui.empty('leaf', 'No book for this track yet.')) +
        '<p class="audit">Read-only. Authoring, versioning and content approval arrive in Phase D.</p>';

      el.querySelectorAll('.tabs button[data-tab]').forEach(function (b) {
        b.addEventListener('click', function () { HV.go('#/library/' + b.dataset.tab); });
      });
      el.querySelectorAll('[data-track]').forEach(function (b) {
        b.addEventListener('click', function () { track = b.dataset.track; HV.refresh(); });
      });
    },
  });
})();
```

- [ ] **Step 2: Register in `app/index.html` and `app/sw.js`**

```html
    <script src="js/views/console-library.js?v=139"></script>
```

and `'./js/views/console-library.js',` in `ASSETS`.

- [ ] **Step 3: Syntax check**

Run: `node --check app/js/views/console-library.js`
Expected: no output.

- [ ] **Step 4: Browser check**

As **Admin**: `#/library` opens on Nutrition; all four pillar tabs render a book; switching activity track re-renders; Fitness and Yoga show the criteria bar and session bars; no edit buttons anywhere. Console clean.

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-library.js app/index.html app/sw.js
git commit -m "feat(console): read-only Library over the program catalogue"
```

---

### Task 6: People & Access host; Configuration split

**Files:**
- Create: `app/js/views/console-people.js`
- Modify: `app/js/views/console-pipeline.js` (the `admin` view becomes `config`; capacity block moves out)
- Modify: `app/index.html`, `app/sw.js`

**Interfaces:**
- Consumes: `HV.store.users`, `HV.store.capacity`, `HV.ROLES`, `HV.NAV_ITEMS`, `HV.myClients`, `HV.can`, `HV.ui.tabs`
- Produces: view `people` at `#/people/<tab>`; view `config` at `#/config/<tab>`
- The capacity editor (cap `<input>` gated on `overrideCapacity`) moves verbatim from the admin view into the People *Capacity* tab, including its `data-cap` change handler and its below-load guard.

- [ ] **Step 1: Create `console-people.js`**

```js
/* HAALVING console view — People & Access. Read-only in Phase A: who is on the
   team, what each role may do, and how loaded everyone is. The permission matrix
   is rendered FROM HV.ROLES, so it cannot drift from the thing it documents.
   User CRUD and the audit log arrive in Phase B. */
(function () {
  'use strict';

  var TABS = [
    { key: 'staff',  label: 'Staff' },
    { key: 'roles',  label: 'Roles & permissions' },
    { key: 'capacity', label: 'Capacity' },
  ];

  function staffHtml() {
    var rows = HV.store.users.filter(function (u) { return u.role !== 'client'; }).map(function (u) {
      var role = HV.ROLES[u.role];
      var n = HV.store.clients.filter(function (c) {
        return Object.values(c.pod || {}).indexOf(u.id) !== -1;
      }).length;
      return '<div class="trow">' + HV.ui.avatar(u.name, 'sm') +
        '<span class="grow"><b>' + HV.esc(u.name) + '</b>' +
        '<small>' + HV.esc(role ? role.title : '—') + '</small></span>' +
        '<span class="pill neutral"><span class="num">' + n + '</span> allocated</span></div>';
    }).join('');
    return '<div class="list">' + rows + '</div>' +
      '<p class="audit">Read-only. Adding, editing and deactivating users arrives in Phase B.</p>';
  }

  function rolesHtml() {
    var rows = Object.keys(HV.ROLES).map(function (k) {
      var r = HV.ROLES[k];
      var nav = (r.nav || []).map(function (id) {
        return HV.NAV_ITEMS[id] ? HV.NAV_ITEMS[id].label : id;
      }).join(' · ') || '—';
      var perms = (r.perms || []).map(function (p) {
        return '<span class="chip">' + HV.esc(p) + '</span>';
      }).join(' ') || '<span class="sub">none</span>';
      return '<tr><td><b>' + HV.esc(r.title) + '</b></td>' +
        '<td>' + HV.esc(r.shell) + '</td>' +
        '<td>' + HV.esc(nav) + '</td>' +
        '<td>' + perms + '</td></tr>';
    }).join('');
    return '<div class="tablewrap"><table class="data">' +
      '<thead><tr><th>Role</th><th>Shell</th><th>Menu</th><th>Permissions</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="notice">Generated from the RBAC matrix itself — this table cannot drift from what the router enforces.</div>';
  }

  HV.registerView('people', {
    title: 'People & Access',
    roles: ['admin', 'opshead'],
    render: function (el, params) {
      var active = TABS.some(function (t) { return t.key === params[0]; }) ? params[0] : 'staff';

      el.innerHTML =
        '<div class="h1-row"><div><div class="kicker">THE TEAM</div><h1 class="h1">People &amp; Access</h1>' +
        '<p class="sub">Who is on the team, what each seat may do, and how loaded everyone is.</p></div></div>' +
        HV.ui.tabs(TABS, active) +
        '<div id="pa-root" style="margin-top:var(--s3)"></div>';

      var root = el.querySelector('#pa-root');
      if (active === 'staff') root.innerHTML = staffHtml();
      else if (active === 'roles') root.innerHTML = rolesHtml();
      else HV.capacityPanel(root);          /* moved out of the admin screen */

      el.querySelectorAll('.tabs button').forEach(function (b) {
        b.addEventListener('click', function () { HV.go('#/people/' + b.dataset.tab); });
      });
    },
  });
})();
```

- [ ] **Step 2: Expose the capacity panel from `console-pipeline.js`**

That module already owns `capBar` and the cap-editing markup. Extract the admin view's capacity section into a function published on `HV`, so People can mount it without duplicating the editor or its guard:

```js
  /* the capacity administration panel, mounted by People & Access. Editing stays
     gated on overrideCapacity — Ops Head keeps exactly the reach it has today. */
  HV.capacityPanel = function (el) {
    var s = HV.store;
    var canCaps = HV.can('overrideCapacity');
    el.innerHTML = '<div class="card">' + s.capacity.map(function (c) {
      /* … the existing capRows markup from the admin view, verbatim … */
    }).join('') +
      '<p class="sub" style="margin:var(--s3) 0 0">' + (canCaps
        ? 'Edits apply to the allocation picker immediately. One-off exceptions belong in the override flow, where the reason is logged.'
        : 'Caps are Ops Head-editable — you can view. One-off exceptions go through the override flow, reason logged.') + '</p></div>';

    el.querySelectorAll('[data-cap]').forEach(function (inp) {
      /* … the existing change handler, verbatim, including the below-load guard … */
    });
  };
```

- [ ] **Step 3: Rewrite the `admin` view as `config`**

Replace `HV.registerView('admin', …)` with a three-tab host. The Notifications tab is the existing rules table plus its two handlers, unchanged. The other two are honest read-only placeholders:

```js
  var CONFIG_TABS = [
    { key: 'notifications', label: 'Notifications' },
    { key: 'cycles',        label: 'Cycles' },
    { key: 'pass',          label: 'Pass conditions' },
  ];

  HV.registerView('config', {
    title: 'Configuration',
    roles: ['admin', 'opshead'],
    render(el, params) {
      const active = CONFIG_TABS.some(t => t.key === params[0]) ? params[0] : 'notifications';
      el.innerHTML =
        '<div class="h1-row"><div><div class="kicker">THE RULES</div><h1 class="h1">Configuration</h1>' +
        '<p class="sub">Text, schedule, audience and channel — editable by Ops. No engineering involved.</p></div></div>' +
        HV.ui.tabs(CONFIG_TABS, active) +
        '<div id="cfg-root" style="margin-top:var(--s3)"></div>';

      const root = el.querySelector('#cfg-root');
      if (active === 'notifications') { root.innerHTML = rulesHtml(); wireRules(root); }
      else if (active === 'cycles') {
        root.innerHTML =
          '<div class="card"><span class="k">Cycle</span>' +
          '<div class="list" style="margin-top:var(--s3)">' +
            '<div class="trow"><span class="grow"><b>Cycle length</b><small>Day 1 to Day 11</small></span>' +
              '<span class="pill neutral"><span class="num">11</span> days</span></div>' +
            '<div class="trow"><span class="grow"><b>Level review</b><small>The only day levels move</small></span>' +
              '<span class="pill neutral">Day <span class="num">9</span></span></div>' +
            '<div class="trow"><span class="grow"><b>Levels</b><small>Headline level is the lowest pillar</small></span>' +
              '<span class="pill neutral"><span class="num">7</span></span></div>' +
          '</div></div>' +
          '<p class="audit">Read-only. Editing cycle length, review day and the level ladder arrives in Phase C.</p>';
      } else {
        root.innerHTML =
          '<div class="card"><span class="k">Pass conditions</span>' +
          '<p class="sub" style="margin:var(--s2) 0 0">Two rule sets decide a level-up. Both are read-only here and browsable in full under Library.</p>' +
          '<div class="list" style="margin-top:var(--s3)">' +
            '<div class="trow"><span class="grow"><b>Nutrition gates</b>' +
              '<small><span class="num">' + HV.store.cultureCriteria.gates.length + '</span> gates × 7 levels × 3 activity tracks</small></span></div>' +
            '<div class="trow"><span class="grow"><b>Body criteria</b>' +
              '<small>Bar ' + HV.esc(HV.store.bodyCriteria.bar) + ' · fitness ' +
              HV.esc(HV.store.bodyCriteria.sessionBars.fitness) + ' · yoga ' +
              HV.esc(HV.store.bodyCriteria.sessionBars.yoga) + '</small></span></div>' +
          '</div></div>' +
          '<p class="audit">Read-only. Editing pass conditions — with versioning, so a mid-cycle change cannot retroactively fail a client — arrives in Phase C.</p>';
      }

      el.querySelectorAll('.tabs button').forEach(b => {
        b.addEventListener('click', () => HV.go('#/config/' + b.dataset.tab));
      });
    },
  });
```

Extract the existing rules table markup into `rulesHtml()` and its two handlers (inline schedule edit, enabled toggle) into `wireRules(root)`, both verbatim — only the container changes.

- [ ] **Step 4: Register `console-people.js` in `app/index.html` and `app/sw.js`**

- [ ] **Step 5: Syntax check**

Run: `node --check app/js/views/console-people.js && node --check app/js/views/console-pipeline.js`
Expected: no output.

- [ ] **Step 6: Browser check**

As **Admin**: `#/people` shows three tabs; Staff lists every non-client user with an allocation count; Roles renders eleven rows; Capacity shows load bars **and** editable cap inputs. `#/config` shows three tabs; editing a notification schedule still toasts and persists; toggling a rule still works.
As **Ops Head**: cap editing still available.
As **Sneha (Dietitian)**: `#/people` and `#/config` both render the role lock screen.
Console clean.

- [ ] **Step 7: Commit**

```bash
git add app/js/views/console-people.js app/js/views/console-pipeline.js app/index.html app/sw.js
git commit -m "feat(console): People & Access; Admin becomes Configuration with tabs"
```

---

### Task 7: Home — tasks above flags

**Files:**
- Modify: `app/js/views/console-digest.js`

**Interfaces:**
- Consumes: `HV.worklist.mine()`, `HV.worklist.next()` (Task 2)
- Produces: view `home` (the `digest` registration is renamed; `#/digest` becomes an alias in Task 10)

- [ ] **Step 1: Add the two task sections**

Inside the render, before the existing stats grid, build:

```js
      const next = HV.worklist.next();
      const rest = HV.worklist.mine().filter(t => !next || t.id !== next.id);

      const nextCard = next
        ? '<div class="card"><div class="kicker">NEXT</div>' +
          '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:var(--s3)">' +
            '<b class="grow">' + HV.esc(next.text) + '</b>' +
            '<span class="pill ' + HV.esc(next.pill) + '"><span class="num">' + HV.esc(next.due) + '</span></span>' +
          '</div></div>'
        : '';

      const taskList = rest.length
        ? '<div class="sec-title">Your open tasks</div>' +
          '<div class="list">' + rest.map(t =>
            '<div class="trow"><span class="grow">' + HV.esc(t.text) + '</span>' +
            '<span class="pill ' + HV.esc(t.pill) + '"><span class="num">' + HV.esc(t.due) + '</span></span></div>'
          ).join('') + '</div>'
        : '';
```

Insert `nextCard + taskList` into the `el.innerHTML` concatenation immediately after the `h1-row` and `hint`, before the `grid3` stats.

- [ ] **Step 2: Rename the view and retitle the page**

Change `HV.registerView('digest', {` to `HV.registerView('home', {`, `title: 'Morning Digest'` to `title: 'Home'`, the kicker from `THIS MORNING` to `TODAY`, and the `h1` from `Morning digest` to `Home`. Keep the generated-at sub-line — it is the digest's provenance and still true of the flag list.

- [ ] **Step 3: Point the role hints at their new homes**

In the two `hint` blocks, change `data-goto="#/meals"` to `data-goto="#/queues/meals"` and `data-goto="#/medical"` to `data-goto="#/queues/medical"`.

- [ ] **Step 4: Syntax check**

Run: `node --check app/js/views/console-digest.js`
Expected: no output.

- [ ] **Step 5: Browser check**

`#/home` as **Admin**: a NEXT card with the most urgent task, then the remaining open tasks, then flags, then drafts. As **Sneha**: only her own tasks appear, and the meal-queue hint button lands on `#/queues/meals`. `#/digest` still 404s at this stage — Task 10 adds the alias. Console clean.

- [ ] **Step 6: Commit**

```bash
git add app/js/views/console-digest.js
git commit -m "feat(console): Home leads with your next task, then flags"
```

---

### Task 8: Care Circles merge; workspace moves to `#/room/<id>`

**Files:**
- Modify: `app/js/views/console-clients.js` (roster gains unread signals + Incoming tab + hash tab state)
- Modify: `app/js/views/console-circles.js` (drop list mode; register as view `room`)

**Interfaces:**
- Consumes: `HV.unread`, `HV.boardsFor(['incoming'])`, `HV.ui.tabs`
- Produces: view `circles` at `#/circles`, `#/circles/risk`, `#/circles/incoming`; view `room` at `#/room/<id>`

- [ ] **Step 1: Move the roster's message signals in**

`console-circles.js:267` `listHtml()` builds rows with a message preview, an unread pill and a red left-border risk cue. `console-clients.js` `rosterCard` builds risk-first rows. Merge into `console-clients.js`: keep `rosterCard`'s structure, and add from `listHtml` (a) the last-message preview as the `<small>` line, (b) the `n new` pill, (c) unread-first ordering. Copy `circleMsgs` and `senderName` across, or export them from `console-circles.js` on `HV` — either is fine, but do not leave two copies drifting.

- [ ] **Step 2: Re-register `clients` as `circles` with three tabs**

```js
  var TABS = [
    { key: 'list', label: 'Circles' },
    { key: 'risk', label: 'Risk queue' },
  ];

  HV.registerView('circles', {
    title: 'Care Circles',
    roles: STAFF_ROLES,
    render: function (el, params) {
      var incoming = HV.boardsFor(['incoming']);
      var tabs = TABS.concat(incoming.map(function (b) {
        return { key: 'incoming', label: b.label, count: b.count ? b.count() : 0 };
      }));
      var active = tabs.some(function (t) { return t.key === params[0]; }) ? params[0] : 'list';
      /* … existing stats grid … */
      /* body: list | risk | <div id="board-root"> for incoming … */
      el.querySelectorAll('.tabs button').forEach(function (b) {
        b.addEventListener('click', function () {
          HV.go(b.dataset.tab === 'list' ? '#/circles' : '#/circles/' + b.dataset.tab);
        });
      });
    },
  });
```

Delete the `rosterTab` module variable — tab state now lives in the hash.

- [ ] **Step 3: Client 360 back button and workspace link**

In `console-clients.js`, change `HV.go('#/clients')` to `HV.go('#/circles')`, and the back button label from `All clients` to `All circles`.

In the Circle tab body, add above the thread:

```js
        '<button class="btn sm quiet" data-room="' + HV.esc(c.id) + '">' +
          'Open circle workspace ' + HV.ui.icon('chevR') + '</button>'
```

wired to `HV.go('#/room/' + c.id)`.

- [ ] **Step 4: `console-circles.js` becomes the room only**

Change `HV.registerView('circles', …)` to `HV.registerView('room', …)`. Delete `listHtml()` and the `!cid` branch — the room always has a client id. When `params[0]` is missing or not allocated, render the existing `guardHtml`. Keep `cc3`, the splitter, the pad, `HV.chatui.wire` and `wireWorkspace` untouched.

Update the row-click handler that does `HV.go('#/circles/' + row.dataset.cid)` — it belongs to the deleted list, so remove it.

- [ ] **Step 5: Verify the badge-sync selector still resolves**

`console-circles.js` reaches for `.side nav button[data-r="#/circles"]` after `markRead`. Care Circles keeps route `#/circles`, so this still resolves — but confirm in the browser (Step 7), because the count it writes now comes from a different `navCounts` key.

- [ ] **Step 6: Syntax check**

Run: `node --check app/js/views/console-clients.js && node --check app/js/views/console-circles.js`
Expected: no output.

- [ ] **Step 7: Browser check**

As **Admin**: `#/circles` lists clients with unread pills, previews and the red high-risk cue, unread first. Risk queue tab sorts by severity and dismissing a flag still demands a reason. Incoming tab shows the kanban and the override flow still works. `#/circles/c-rajesh` — **should 404 at this stage**; Task 10 adds the alias to `#/room/c-rajesh`. `#/room/c-rajesh` opens the three-panel workspace, clears the call light, and the sidebar badge decrements without a reload.
As **Sneha**: no Incoming tab.
Console clean.

- [ ] **Step 8: Commit**

```bash
git add app/js/views/console-clients.js app/js/views/console-circles.js
git commit -m "feat(console): merge Clients and Care Circles; workspace moves to #/room"
```

---

### Task 9: Schedule tab bar

**Files:**
- Modify: `app/js/views/console-schedule.js`

**Interfaces:**
- Consumes: `HV.boardsFor(['work'])`, `HV.ui.tabs`
- Produces: `#/schedule` (calendar) and `#/schedule/work` (work board)

`repaint()` calls `HV.refresh()`, which re-runs the router and re-renders the whole view root — so the tab bar, being part of this view's own output, survives a repaint. No change to `repaint` is needed.

- [ ] **Step 1: Wrap the existing render in a tab host**

```js
    render: function (el, params) {
      const work = HV.boardsFor(['work']);
      const tabs = [{ key: 'cal', label: 'Calendar' }].concat(work.map(b => ({
        key: 'work', label: b.label, count: b.count ? b.count() : 0,
      })));
      const active = params[0] === 'work' && work.length ? 'work' : 'cal';

      const head = HV.ui.tabs(tabs, active);

      if (active === 'work') {
        el.innerHTML = head + '<div id="board-root" style="margin-top:var(--s3)"></div>';
        work[0].mount(el.querySelector('#board-root'));
        el.querySelectorAll('.tabs button').forEach(b => {
          b.addEventListener('click', () => HV.go(b.dataset.tab === 'cal' ? '#/schedule' : '#/schedule/work'));
        });
        return;
      }

      ensureDefaults();
      /* … the existing calendar render, with `head +` prepended to el.innerHTML … */
      el.querySelectorAll('.tabs button').forEach(b => {
        b.addEventListener('click', () => HV.go(b.dataset.tab === 'cal' ? '#/schedule' : '#/schedule/work'));
      });
    },
```

Note the calendar's own toolbar contains buttons; scope the tab wiring to `.tabs button` only, which the toolbar does not use.

- [ ] **Step 2: Syntax check**

Run: `node --check app/js/views/console-schedule.js`
Expected: no output.

- [ ] **Step 3: Browser check**

As **Admin**: `#/schedule` shows Calendar + Work list tabs; drag-drop, stretch, create and the week/day switch all still work, and the tab bar survives every repaint. `#/schedule/work` lists tasks and Done clears one.
As **Ops Manager**: only the Calendar tab (opsmgr is not in the `work` board's roles).
Console clean.

- [ ] **Step 4: Commit**

```bash
git add app/js/views/console-schedule.js
git commit -m "feat(console): Schedule hosts Calendar and Work list"
```

---

### Task 10: The flip — nav, roles, badges, aliases, version bump

Everything below lands in **one commit** so the console is never half-restructured.

**Files:**
- Modify: `app/js/core.js` (`NAV_ITEMS`, `ROLES`, alias resolution in `render()`)
- Modify: `app/js/data.js` (`navCounts`)
- Modify: `app/js/views/console-ops.js` (delete the `worklist` view)
- Modify: `app/index.html` (24 × `?v=139` → `?v=140`)
- Modify: `app/sw.js` (`CACHE` → `haalving-demo-v140`)

- [ ] **Step 1: Replace `HV.NAV_ITEMS`**

```js
  HV.NAV_ITEMS = {
    home:     { route: '#/home',     label: 'Home',            icon: 'home' },
    circles:  { route: '#/circles',  label: 'Care Circles',    icon: 'circle', owns: ['client', 'room'] },
    schedule: { route: '#/schedule', label: 'Schedule',        icon: 'cal' },
    queues:   { route: '#/queues',   label: 'Queues',          icon: 'clock' },
    approvals:{ route: '#/approvals',label: 'Approvals',       icon: 'shield' },
    library:  { route: '#/library',  label: 'Library',         icon: 'bookmark' },
    reports:  { route: '#/reports',  label: 'Reports',         icon: 'chart' },
    config:   { route: '#/config',   label: 'Configuration',   icon: 'gear', owns: ['builder', 'review'] },
    people:   { route: '#/people',   label: 'People & Access', icon: 'users' },
  };
```

`builder` and `review` keep working as deep links; parking them under Configuration's `owns` keeps the sidebar from showing *nothing* highlighted when one is open.

- [ ] **Step 2: Replace every `nav` and `home` in `HV.ROLES`** exactly as spec §6:

```js
    admin:     { …, home: '#/home',
                 nav: ['home','circles','schedule','queues','approvals','library','reports','config','people'], … },
    opsmgr:    { …, home: '#/home',
                 nav: ['home','circles','schedule','approvals','library'], … },
    opshead:   { …, home: '#/home',
                 nav: ['home','circles','schedule','queues','approvals','library','reports','config','people'], … },
    core:      { …, home: '#/approvals',
                 nav: ['home','circles','schedule','approvals','library'], … },
    doctor:    { …, home: '#/home',
                 nav: ['home','circles','schedule','queues','library','reports'], … },
    dietitian: { …, home: '#/home',
                 nav: ['home','circles','schedule','queues','approvals','library','reports'], … },
    fitness:   { …, home: '#/home',
                 nav: ['home','circles','schedule','queues','approvals','library','reports'], … },
    yoga:      { …, home: '#/home', nav: [ …same as fitness… ], … },
    mind:      { …, home: '#/home', nav: [ …same as fitness… ], … },
    ai:        { …, home: '#/home', nav: [], … },
```

`perms` are untouched.

- [ ] **Step 3: Add alias resolution to the router**

Add above `function render()`:

```js
  /* Retired routes keep working — old links live in docs, in memory and in the
     browser's history. location.replace, so Back doesn't bounce off the alias. */
  const ALIASES = {
    digest: '#/home',
    clients: '#/circles',
    pipeline: '#/circles/incoming',
    worklist: '#/schedule/work',
    meals: '#/queues/meals',
    medical: '#/queues/medical',
    admin: '#/config',
  };
  const SUB_ALIASES = {
    'worklist/deviations': '#/queues/deviations',
    'worklist/live': '#/queues/live',
    'worklist/calories': '#/reports/calories',
    'worklist/incentives': '#/reports/incentives',
  };
  function resolveAlias(name, params) {
    const full = name + (params.length ? '/' + params.join('/') : '');
    if (SUB_ALIASES[full]) return SUB_ALIASES[full];
    /* #/circles/<id> was the workspace; it is #/room/<id> now. A tab key never
       resolves to a client, so this lookup decides without ambiguity. */
    if (name === 'circles' && params[0] && HV.client(params[0])) return '#/room/' + params[0];
    if (!params.length && ALIASES[name]) return ALIASES[name];
    return null;
  }
```

In `render()`, immediately after the `if (!me || name === 'login')` guard and before `const def = views[name];`:

```js
    const alias = resolveAlias(name, params);
    if (alias) { location.replace(alias); return; }
```

It must sit after the session guard, because `resolveAlias` reads `HV.client`.

- [ ] **Step 4: Rewrite `navCounts` in `data.js`**

```js
  HV.navCounts = function () {
    const s = HV.store;
    const me = HV.me();
    if (!me) return {};
    const unread = HV.myClients().filter(c => HV.unread(c.id) > 0).length;
    const incoming = HV.can('allocate') ? s.pipeline.length : 0;
    return {
      home: HV.worklist.mine().length,
      circles: unread + incoming,
      queues: HV.boardsFor(['meals', 'medical']).reduce((n, b) => n + (b.count ? b.count() : 0), 0),
      approvals: HV.approvals.queueFor(me.id).length,
    };
  };
```

- [ ] **Step 5: Delete the `worklist` view** from `console-ops.js` — its boards now live in Schedule, Queues and Reports, and `#/worklist` is an alias. Delete the module's `TABS` array and the old tab-switch wiring with it. Keep `renderWorkTab`, `renderDeviationsTab`, `renderLiveTab`, `renderCaloriesTab`, `renderIncentivesTab` — the boards call them.

- [ ] **Step 6: Version bump**

`app/index.html`: replace every `?v=139` with `?v=140` — 24 occurrences, including the three new view scripts.
`app/sw.js`: `const CACHE = 'haalving-demo-v140';`
Confirm `console-queues.js`, `console-library.js` and `console-people.js` are all in `ASSETS`.

- [ ] **Step 7: Syntax check every touched file**

```bash
node --check app/js/core.js && node --check app/js/data.js && node --check app/js/views/console-ops.js
```
Expected: no output.

- [ ] **Step 8: Verify the version bump actually landed**

```bash
grep -c '?v=140' app/index.html            # expect 24
grep -c '?v=139' app/index.html            # expect 0
grep -n "haalving-demo-v" app/sw.js        # expect v140
grep -c "console-queues\|console-library\|console-people" app/sw.js   # expect 3
```

- [ ] **Step 9: Full persona pass**

For each of the nine console personas, confirm:
1. The sidebar matches spec §6 exactly — no more, no fewer.
2. Every item opens without a console error.
3. `#/client/<id>` and `#/room/<id>` both highlight **Care Circles**.
4. Badges: Home = own open tasks; Care Circles = unread + incoming; Queues = pending meals + summaries; Approvals unchanged. Each clears when its work is done.
5. Every alias lands correctly and Back does not loop:
   `#/digest`, `#/clients`, `#/circles/c-rajesh`, `#/pipeline`, `#/worklist`, `#/worklist/deviations`, `#/worklist/live`, `#/worklist/calories`, `#/worklist/incentives`, `#/meals`, `#/medical`, `#/admin`.
6. Refreshing on any tab keeps that tab.

Parity checks:
- Dietitian rates a meal end to end.
- Doctor opens a raw record; no other role can reach `#/queues/medical`.
- A coach reaches Deviations, Live board and Calorie log.
- A coach cannot see Incentives.
- Ops Head edits a cap; a coach cannot.
- Capacity override still demands a reason.

- [ ] **Step 10: Commit**

```bash
git add app/js/core.js app/js/data.js app/js/views/console-ops.js app/index.html app/sw.js
git commit -m "feat(console): nine-item nav, badge rewrite, route aliases, v140"
```

---

## Self-review notes

**Spec coverage.** Every section of the spec maps to a task: §3 board contract → Task 1; §4.1 Home → Task 7; §4.2 Care Circles → Task 8; §4.3 room route → Tasks 8 and 10; §4.4 Schedule → Task 9; §4.5 Queues → Tasks 3 and 4; §4.7 Library → Task 5; §4.8 Reports → Task 2; §4.9 Configuration → Task 6; §4.10 People → Task 6; §5 routes and aliases → Task 10; §6 RBAC → Task 10; §6.1 dead entries → Task 10 Step 2; §7 badges → Task 10 Step 4; §8 shell → Task 1; §9 files → all; §10 verification → Task 10 Step 9.

**Deliberate temporary duplication.** Between Tasks 2 and 10, Calorie log and Incentives are reachable from both `#/worklist` and `#/reports`. Task 10 Step 5 removes the `worklist` view, ending it.
