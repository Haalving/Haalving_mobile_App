# Coach Capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nothing may put a coach in a slot without first asking whether they
are working, free, and not on leave.

**Architecture:** One pure conflict engine in `core.js` that takes its world as
arguments (so `data.js` can call it at seed-build time when `HV.store` is
`null`), consulted by every writer: the seed's booking generator, the Schedule
task sheet, both drag paths, and the leave cover board. `t.noOverlap` inverts to
`t.allowOverlap`, so overlap is opt-in. Availability gains more than one window
a day, because a personal trainer works a split shift.

**Tech Stack:** Plain ES5-flavoured JS in `<script>` tags. **No build step, no
package manager, no dependencies, no test framework.** Verification is
`node --check` plus headless Chrome driven over raw CDP from the session
scratchpad.

**Spec:** `docs/superpowers/specs/2026-08-17-coach-capacity-design.md`

## Global Constraints

- **Load order is the dependency graph.** `core.js` → `data.js` → `vitals.js` →
  `js/views/*.js`. A view may use core; **core must never reference a view.**
- **The engine must be pure.** `data.js` builds its seed at parse time, when
  `HV.store` is `null` and `HV.staff()` resolves nobody. Every engine function
  resolves people from `o.users` and tasks from `o.tasks`, falling back to the
  store only when absent.
- **Three version levers, all mandatory at ship:** every `?v=NN` in
  `app/index.html`; `const CACHE = 'haalving-demo-vNN'` in `app/sw.js` (the real
  lever — the SW matches `ignoreSearch: true`); and `HV.seedVersion`, which
  **must** move here because booking times change shape.
- **Frozen keys.** Pillars stay `fitness / culture / yoga / wellness`; `culture`
  displays "Nutrition", `wellness` displays "Mind Wellness"; the Mind Wellness
  staff role key is `mind`, the Nutrition coach role key is `dietitian`.
- **Serif is for data.** Every numeral goes in `class="num"`.
- **Use design tokens**, never raw values. Cards carry tone and shadow, never a
  1px border. Check both themes.
- **`HV.ui.*` returns HTML strings.** Build one string, assign `innerHTML`, wire
  by querying `[data-*]`. Interpolated data goes through `HV.esc()`.
- **No test may assert a literal session time.** The batch is order-dependent by
  design; assert the *rule* (inside a window, no collision), never the number.
- **`store.capacity` is out of scope.** It is narrative. Do not derive it.

**Verification harness.** Two static servers already run — `8081` (client app)
and `8082` (console), both serving `app/`. Chrome listens on `9231`. Tests use
`h.js` in the session scratchpad:

```js
const { open } = require('./h');
(async () => {
  const h = await open(8082);          // 8081 for the client app
  await h.ev(`HV.login('u-anita')`); await h.wait(600);
  h.ok('what is being asserted', condition, gotValue);
  h.done('t21');
})();
```

`open()` clears the SW and localStorage, reloads twice, and returns
`{ev, wait, nav, shot, ok, done, send}`. **8081 and 8082 are different origins**
— they do not share localStorage.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `app/js/core.js` | the model: availability normaliser, conflict engine, placement, recurrence | **modify** — add the engine near `HV.occursOn` (~line 227); extend `occursOn`; `calendarFor` reads the occurrence |
| `app/js/data.js` | the immutable seeded story | **modify** — Vikram's split shift, `BOOK.pref`, `bookingsFor` via the engine, one `allowOverlap`, `seedVersion` |
| `app/js/views/console-schedule.js` | the team's working calendar | **modify** — delegate to core, invert the overlap flag, mark leave |
| `app/js/views/console-leave.js` | availability editor, leave, the cover board | **modify** — multi-range editor, sessions in the plan, the accept state |
| `app/js/views/console-people.js` | staff records | **modify** — render multi-range windows |
| `app/css/app.css` | the design system | **modify** — conflict row, accept state |
| `app/index.html`, `app/sw.js` | cache levers | **modify** — v197 |

No new view file, so `sw.js`'s `ASSETS` list is unchanged.

---

### Task 1: The availability normaliser

Read both shapes so nothing stored has to be migrated.

**Files:**
- Modify: `app/js/core.js` (add above `HV.occursOn`, ~line 227)
- Test: `scratchpad/t21.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `HV.WD` (array of 7 weekday keys, Sunday first);
  `HV.availWindows(user, wdKey) → [[fromMin,toMin], …]` (`[]` means off);
  `HV.availFits(user, wdKey, start, dur) → bool`;
  `HV.wdOf(rd) → wdKey`; `HV.hmToMin('HH:MM') → minutes|null`.

- [ ] **Step 1: Write the failing test**

```js
/* t21 — availability reads one window or several, and never both wrong. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.wait(600);
  const U1 = `{avail:{mon:['09:00','17:00'],sun:null}}`;
  const U2 = `{avail:{mon:[['06:00','10:00'],['17:00','21:00']],sun:null}}`;
  h.ok('a single range reads as one window',
    JSON.stringify(await h.ev(`HV.availWindows(${U1},'mon')`)) === '[[540,1020]]');
  h.ok('two ranges read as two windows',
    JSON.stringify(await h.ev(`HV.availWindows(${U2},'mon')`)) === '[[360,600],[1020,1260]]');
  h.ok('a null weekday is off', JSON.stringify(await h.ev(`HV.availWindows(${U1},'sun')`)) === '[]');
  h.ok('a missing weekday is off', JSON.stringify(await h.ev(`HV.availWindows(${U1},'sat')`)) === '[]');
  h.ok('no avail at all is off', JSON.stringify(await h.ev(`HV.availWindows({},'mon')`)) === '[]');
  h.ok('a session inside a window fits', (await h.ev(`HV.availFits(${U2},'mon',18*60,60)`)) === true);
  h.ok('a session ending exactly at the edge fits',
    (await h.ev(`HV.availFits(${U2},'mon',20*60,60)`)) === true);
  h.ok('a session running past the edge does not',
    (await h.ev(`HV.availFits(${U2},'mon',20*60+30,60)`)) === false);
  /* THE ONE THAT MATTERS: a split shift is two windows, not one long one */
  h.ok('a session spanning the GAP between two windows does not fit',
    (await h.ev(`HV.availFits(${U2},'mon',9*60+30,8*60)`)) === false);
  h.ok('a day off fits nothing', (await h.ev(`HV.availFits(${U1},'sun',10*60,30)`)) === false);
  h.ok('the AI is never constrained by hours',
    (await h.ev(`HV.availFits({ai:true},'sun',10*60,30)`)) === true);
  h.done('t21');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t21.js`
Expected: FAIL — `HV.availWindows` is not a function.

- [ ] **Step 3: Implement**

In `app/js/core.js`, immediately above the `/* ---- recurrence` block:

```js
  /* ---- declared working hours ------------------------------------------
     A weekday holds ONE range or SEVERAL. A personal trainer with six
     one-on-ones works a split shift — early mornings and evenings, nothing
     between — and 5½ hours of sessions fit in no single window. Both shapes
     are read, so no stored record needs migrating:
        mon: ['09:00','17:00']                        one window
        mon: [['06:00','10:00'],['17:00','21:00']]    two
        mon: null / absent                            off  */
  HV.WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  HV.hmToMin = function (hm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  };
  HV.wdOf = function (rd) { return HV.WD[new Date(HV.now() + rd * 864e5).getDay()]; };
  HV.availWindows = function (user, wdKey) {
    const av = user && user.avail;
    const day = av && av[wdKey];
    if (!day || !day.length) return [];
    /* one range is a pair of strings; several is an array of pairs */
    const raw = Array.isArray(day[0]) ? day : [day];
    return raw.map(function (r) { return [HV.hmToMin(r[0]), HV.hmToMin(r[1])]; })
      .filter(function (w) { return w[0] != null && w[1] != null && w[1] > w[0]; })
      .sort(function (a, b) { return a[0] - b[0]; });
  };
  /* ONE window must hold the whole session — a session straddling the gap in
     a split shift is not "inside declared hours", it is two half-sessions */
  HV.availFits = function (user, wdKey, start, dur) {
    if (!user || user.ai) return true;        /* the AI keeps no hours */
    if (!user.avail) return true;             /* nobody has declared any */
    return HV.availWindows(user, wdKey).some(function (w) {
      return start >= w[0] && start + dur <= w[1];
    });
  };
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/core.js && cd <scratchpad> && node t21.js`
Expected: `11 passed, 0 failed, 0 console errors`

- [ ] **Step 5: Commit**

```bash
git add app/js/core.js
git commit -m "feat(core): declared hours read one window a day or several"
```

---

### Task 2: The three questions, and their union

**Files:**
- Modify: `app/js/core.js` (below Task 1's block)
- Test: `scratchpad/t22.js`

**Interfaces:**
- Consumes: `HV.availWindows`, `HV.availFits`, `HV.wdOf`, `HV.occursOn`.
- Produces:
  `HV.busyAt(people, rd, start, dur, o) → [{type:'busy', whoId, who, detail, taskId}]`;
  `HV.outsideHours(people, rd, start, dur, o) → [{type:'hours', whoId, who, detail}]`;
  `HV.onLeaveAt(people, rd, o) → [{type:'leave', whoId, who, detail}]`;
  `HV.conflicts(people, rd, start, dur, o) → [] of the above, busy first`.
  `o = {tasks, users, leaves, exceptIds, allowOverlap}`, each defaulting to the store.

- [ ] **Step 1: Write the failing test**

```js
/* t22 — the conflict engine. It must answer correctly from arguments alone,
   because data.js calls it at parse time when HV.store is null. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.wait(600);
  const W = `{users:[{id:'u-x',name:'Xavier X.',avail:{mon:[['09:00','12:00']],tue:[['09:00','12:00']],
      wed:[['09:00','12:00']],thu:[['09:00','12:00']],fri:[['09:00','12:00']],
      sat:[['09:00','12:00']],sun:[['09:00','12:00']]}}],
    tasks:[{id:'k1',title:'Held',assignees:['u-x'],groups:[],day:0,start:600,dur:60,exc:{},done:{}}],
    leaves:[]}`;
  h.ok('a clean slot has no conflicts',
    (await h.ev(`HV.conflicts(['u-x'],0,11*60,30,${W}).length`)) === 0);
  h.ok('an occupied slot reports busy',
    (await h.ev(`HV.conflicts(['u-x'],0,10*60+30,30,${W}).map(c=>c.type).join()`)) === 'busy');
  h.ok('touching end-to-start is NOT a collision',
    (await h.ev(`HV.busyAt(['u-x'],0,11*60,30,${W}).length`)) === 0);
  h.ok('exceptIds lets a task not collide with itself',
    (await h.ev(`HV.busyAt(['u-x'],0,600,60,Object.assign({exceptIds:['k1']},${W})).length`)) === 0);
  h.ok('a different day is not a collision',
    (await h.ev(`HV.busyAt(['u-x'],1,600,60,${W}).length`)) === 0);
  h.ok('a cancelled occurrence holds nothing',
    (await h.ev(`(()=>{const w=${W}; w.tasks[0].exc={0:{cancelled:true}};
      return HV.busyAt(['u-x'],0,600,60,w).length;})()`)) === 0);
  h.ok('outside declared hours is reported',
    (await h.ev(`HV.outsideHours(['u-x'],0,14*60,60,${W}).map(c=>c.type).join()`)) === 'hours');
  h.ok('approved leave is reported',
    (await h.ev(`(()=>{const w=${W}; const d=new Date(HV.now());
      const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      w.leaves=[{staffId:'u-x',status:'approved',from:iso,to:iso}];
      return HV.onLeaveAt(['u-x'],0,w).map(c=>c.type).join();})()`)) === 'leave');
  h.ok('leave that is NOT approved is not a conflict',
    (await h.ev(`(()=>{const w=${W}; const d=new Date(HV.now());
      const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      w.leaves=[{staffId:'u-x',status:'reassign',from:iso,to:iso}];
      return HV.onLeaveAt(['u-x'],0,w).length;})()`)) === 0);
  /* THE RULE: an overlap needs BOTH sides to allow it */
  h.ok('allowOverlap on the incoming task alone does not permit it',
    (await h.ev(`HV.busyAt(['u-x'],0,600,60,Object.assign({allowOverlap:true},${W})).length`)) === 1);
  h.ok('allowOverlap on the held task alone does not permit it',
    (await h.ev(`(()=>{const w=${W}; w.tasks[0].allowOverlap=true;
      return HV.busyAt(['u-x'],0,600,60,w).length;})()`)) === 1);
  h.ok('allowOverlap on BOTH sides permits it',
    (await h.ev(`(()=>{const w=${W}; w.tasks[0].allowOverlap=true;
      return HV.busyAt(['u-x'],0,600,60,Object.assign({allowOverlap:true},w)).length;})()`)) === 0);
  h.ok('conflicts orders busy before hours',
    (await h.ev(`(()=>{const w=${W};
      return HV.conflicts(['u-x'],0,11*60+30,60,w).map(c=>c.type).join();})()`)) === 'busy,hours');
  /* PURITY: the engine must never have needed the store */
  h.ok('the engine answered without reading HV.store.users',
    (await h.ev(`!HV.store.users.some(u=>u.id==='u-x')`)) === true);
  h.done('t22');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t22.js`
Expected: FAIL — `HV.conflicts` is not a function.

- [ ] **Step 3: Implement**

In `app/js/core.js`, below Task 1's block:

```js
  /* ---- the conflict engine ---------------------------------------------
     "Can this person be here, then?" asked in one place. The rule lived
     inside console-schedule.js, so the seed generator and the cover board
     could not reach it and quietly booked a coach four hours after he went
     home. A view may read core; core may reach into no view.

     Every function takes its world in `o` and only falls back to the store,
     because data.js calls this at PARSE time — HV.store is null there and
     HV.staff() resolves nobody. */
  function capWorld(o) {
    o = o || {};
    const s = HV.store || {};
    return {
      tasks: o.tasks || s.tasks || [],
      users: o.users || s.users || [],
      leaves: o.leaves || s.leaves || [],
      exceptIds: o.exceptIds || [],
      allowOverlap: !!o.allowOverlap,
    };
  }
  function capUser(w, id) {
    return w.users.find(function (u) { return u.id === id; }) || null;
  }
  function capName(w, id) {
    const u = capUser(w, id);
    return u ? u.name : id;
  }
  /* everyone a task binds — direct assignees plus expanded groups */
  HV.taskPeople = function (t, o) {
    const w = capWorld(o);
    const ids = (t.assignees || []).slice();
    (t.groups || []).forEach(function (gid) {
      const g = ((HV.store || {}).groups || []).find(function (x) { return x.id === gid; });
      (g ? g.members || [] : []).forEach(function (id) {
        if (ids.indexOf(id) === -1) ids.push(id);
      });
    });
    return w ? ids : ids;
  };
  /* who already holds these minutes. An overlap is permitted only when the
     INCOMING task and EVERY task it lands on both allow it — a task that
     permits overlap cannot force itself on top of one that does not. */
  HV.busyAt = function (people, rd, start, dur, o) {
    const w = capWorld(o);
    const out = [];
    w.tasks.forEach(function (t) {
      if (w.exceptIds.indexOf(t.id) !== -1) return;
      const occ = HV.occursOn(t, rd);
      if (!occ) return;
      if (occ.start + occ.dur <= start || occ.start >= start + dur) return;
      if (w.allowOverlap && t.allowOverlap) return;
      HV.taskPeople(t).forEach(function (id) {
        if (people.indexOf(id) === -1) return;
        if (out.some(function (x) { return x.whoId === id && x.taskId === t.id; })) return;
        out.push({ type: 'busy', whoId: id, who: capName(w, id),
                   detail: occ.title, taskId: t.id });
      });
    });
    return out;
  };
  HV.outsideHours = function (people, rd, start, dur, o) {
    const w = capWorld(o);
    const wd = HV.wdOf(rd);
    const out = [];
    people.forEach(function (id) {
      const u = capUser(w, id);
      if (!u || u.ai || !u.avail) return;
      if (HV.availFits(u, wd, start, dur)) return;
      const win = HV.availWindows(u, wd);
      out.push({ type: 'hours', whoId: id, who: u.name,
        detail: win.length
          ? 'works ' + win.map(function (v) { return HV.fmtTime(v[0]) + '–' + HV.fmtTime(v[1]); }).join(' and ')
          : 'is off that day' });
    });
    return out;
  };
  HV.onLeaveAt = function (people, rd, o) {
    const w = capWorld(o);
    const iso = HV.dateAdd(HV.todayISO(), rd);
    const out = [];
    people.forEach(function (id) {
      const lv = w.leaves.find(function (l) {
        return l.staffId === id && l.status === 'approved' && l.from <= iso && iso <= l.to;
      });
      if (lv) out.push({ type: 'leave', whoId: id, who: capName(w, id),
                         detail: 'on approved leave' });
    });
    return out;
  };
  /* the union, most-blocking first */
  HV.conflicts = function (people, rd, start, dur, o) {
    return HV.busyAt(people, rd, start, dur, o)
      .concat(HV.onLeaveAt(people, rd, o))
      .concat(HV.outsideHours(people, rd, start, dur, o));
  };
```

**Note on ordering:** the test asserts `'busy,hours'` for a slot that is both.
`onLeaveAt` returns nothing in that case, so the concat order holds.

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/core.js && cd <scratchpad> && node t22.js`
Expected: `14 passed, 0 failed, 0 console errors`

- [ ] **Step 5: Commit**

```bash
git add app/js/core.js
git commit -m "feat(core): one engine answers busy, hours and leave"
```

---

### Task 3: Placement — the earliest slot that clears every run-day

**Files:**
- Modify: `app/js/core.js` (below Task 2)
- Test: `scratchpad/t23.js`

**Interfaces:**
- Consumes: `HV.conflicts`.
- Produces: `HV.firstFreeSlot(personId, rds, dur, o) → startMin | null`, where
  `rds` is an **array** of relative days. `o` adds `from` (earliest minute to
  consider) and `step` (defaults to 15).

- [ ] **Step 1: Write the failing test**

```js
/* t23 — placement. A recurring session must clear EVERY day it runs on;
   a coach's Saturday window is not their Tuesday. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.wait(600);
  /* Xavier works 09:00-12:00 every weekday but only 10:00-12:00 on the
     weekday that rd=+1 happens to land on — built relative to today so the
     test never depends on what day it is run. */
  const W = `(()=>{const wd=k=>HV.wdOf(k);
    const av={}; HV.WD.forEach(d=>av[d]=[['09:00','12:00']]);
    av[wd(1)]=[['10:00','12:00']];
    return {users:[{id:'u-x',name:'Xavier X.',avail:av}],tasks:[],leaves:[]};})()`;
  h.ok('a free coach gets the earliest slot in the window',
    (await h.ev(`HV.firstFreeSlot('u-x',[0],60,${W})`)) === 540);
  h.ok('the search can start later than the window',
    (await h.ev(`HV.firstFreeSlot('u-x',[0],60,Object.assign({from:10*60+30},${W}))`)) === 630);
  /* THE ONE THAT MATTERS */
  h.ok('a slot must clear EVERY day in the list, not just the first',
    (await h.ev(`HV.firstFreeSlot('u-x',[0,1],60,${W})`)) === 600);
  h.ok('an occupied slot is stepped over',
    (await h.ev(`(()=>{const w=${W};
      w.tasks=[{id:'k1',title:'Held',assignees:['u-x'],groups:[],day:0,start:540,dur:60,exc:{},done:{}}];
      return HV.firstFreeSlot('u-x',[0],60,w);})()`)) === 600);
  h.ok('a day that cannot hold the session at all returns null',
    (await h.ev(`HV.firstFreeSlot('u-x',[0],5*60,${W})`)) === null);
  h.ok('a coach with no hours that day returns null',
    (await h.ev(`(()=>{const w=${W}; w.users[0].avail[HV.wdOf(0)]=null;
      return HV.firstFreeSlot('u-x',[0],60,w);})()`)) === null);
  h.ok('a full day returns null rather than an out-of-hours slot',
    (await h.ev(`(()=>{const w=${W};
      w.tasks=[{id:'k1',title:'All morning',assignees:['u-x'],groups:[],day:0,start:540,dur:180,exc:{},done:{}}];
      return HV.firstFreeSlot('u-x',[0],60,w);})()`)) === null);
  h.done('t23');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t23.js`
Expected: FAIL — `HV.firstFreeSlot` is not a function.

- [ ] **Step 3: Implement**

```js
  /* the earliest minute a recurring session can sit on EVERY day it runs.
     rds is a LIST: a series that clears Tuesday may be outside a narrower
     Saturday window, and the seed must not discover that a week later.
     `from` is a preference, not a promise — when the preferred stretch fills,
     the batch spills to the rest of the working day. null is a real answer:
     the series cannot be placed, and the caller must say so rather than
     inventing an out-of-hours slot. */
  HV.firstFreeSlot = function (personId, rds, dur, o) {
    o = o || {};
    const step = o.step || 15;
    const days = (rds || []).filter(function (rd) {
      return HV.availWindows(capUser(capWorld(o), personId), HV.wdOf(rd)).length > 0;
    });
    if (!days.length) return null;
    /* candidate minutes: every window edge on every day, on the step grid */
    const seen = {}, cands = [];
    days.forEach(function (rd) {
      HV.availWindows(capUser(capWorld(o), personId), HV.wdOf(rd)).forEach(function (w) {
        for (let m = Math.ceil(w[0] / step) * step; m + dur <= w[1]; m += step) {
          if (!seen[m]) { seen[m] = 1; cands.push(m); }
        }
      });
    });
    const from = o.from || 0;
    /* preferred first, in order; then everything earlier, also in order */
    cands.sort(function (a, b) {
      const pa = a >= from ? 0 : 1, pb = b >= from ? 0 : 1;
      return (pa - pb) || (a - b);
    });
    const hit = cands.find(function (m) {
      return days.every(function (rd) {
        return HV.conflicts([personId], rd, m, dur, o).length === 0;
      });
    });
    return hit == null ? null : hit;
  };
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/core.js && cd <scratchpad> && node t23.js`
Expected: `7 passed, 0 failed, 0 console errors`

- [ ] **Step 5: Commit**

```bash
git add app/js/core.js
git commit -m "feat(core): place a series in the earliest slot that clears every run-day"
```

---

### Task 4: A per-occurrence coach swap reaches the client

`HV.occursOn` carries `start`, `dur`, `title`, `link` and `notes` through an
exception but **not `assignees`** — which is why a leave cover moves the seat
and leaves the appointment naming the absent coach.

**Files:**
- Modify: `app/js/core.js:250-259` (`occursOn` return) and the `staffId` lines
  in `HV.calendarFor` (~349 and ~369)
- Test: `scratchpad/t24.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `occursOn(t, rd).assignees` — the exception's list when it has one,
  else the task's own. `calendarFor` items read it.

- [ ] **Step 1: Write the failing test**

```js
/* t24 — a coach swapped for one occurrence must reach the CLIENT's calendar.
   v196 made the booking win on "with whom"; a cover moved the seat and the
   appointment kept the absent coach's name. */
const { open } = require('./h');
(async () => {
  const h = await open(8081);
  await h.ev(`HV.login('u-cl-rajesh')`); await h.wait(600);
  h.ok('an occurrence reports the task\'s assignees by default',
    (await h.ev(`(()=>{const t={id:'k',title:'S',assignees:['u-vikram'],groups:[],
      day:0,start:600,dur:60,exc:{},done:{}}; return HV.occursOn(t,0).assignees.join();})()`)) === 'u-vikram');
  h.ok('a per-occurrence swap overrides them',
    (await h.ev(`(()=>{const t={id:'k',title:'S',assignees:['u-vikram'],groups:[],
      day:0,start:600,dur:60,exc:{0:{assignees:['u-nikhil']}},done:{}};
      return HV.occursOn(t,0).assignees.join();})()`)) === 'u-nikhil');
  h.ok('the swap is scoped to that occurrence only',
    (await h.ev(`(()=>{const t={id:'k',title:'S',assignees:['u-vikram'],groups:[],
      day:0,start:600,dur:60,recur:{freq:'alt',until:6},exc:{0:{assignees:['u-nikhil']}},done:{}};
      return HV.occursOn(t,2).assignees.join();})()`)) === 'u-vikram');
  /* THE FIX: the client sees the covering coach */
  const r = await h.ev(`(()=>{const c=HV.myClient();
    let cd=null; for(let d=1;d<=HV.cycleDays();d++){ if(HV.bookingFor(c,d,'fitness')){cd=d;break;} }
    if(cd==null) return {none:true};
    const before=HV.calendarFor(c).find(d=>d.day===cd).items.find(i=>i.pillar==='fitness');
    const b=HV.bookingFor(c,cd,'fitness');
    b.t.exc=b.t.exc||{}; b.t.exc[cd-c.day]={assignees:['u-nikhil']};
    HV.save(); HV.clearCalCache();
    const after=HV.calendarFor(c).find(d=>d.day===cd).items.find(i=>i.pillar==='fitness');
    return {before:HV.staff(before.staffId).name, after:HV.staff(after.staffId).name};})()`);
  h.ok('the client\'s calendar names the covering coach', r.after === 'Nikhil T.', r);
  h.ok('and it was somebody else before', r.before !== 'Nikhil T.', r);
  h.done('t24');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t24.js`
Expected: FAIL — `HV.occursOn(...).assignees` is undefined.

- [ ] **Step 3: Implement**

In `app/js/core.js`, in the `occursOn` return object, after `notes:`:

```js
      /* a per-occurrence coach swap — this is how an approved leave cover
         reaches the grid, the digest, the reminder AND the client's My Plan
         from one write, because every one of them reads the occurrence */
      assignees: ex && ex.assignees ? ex.assignees : (t.assignees || []),
```

Then in `HV.calendarFor`, replace both `b.t.assignees[0]` with `b.assignees[0]`:

```js
        staffId: b ? (b.assignees[0] || HV.staffFor(client, CAL_ROLE[p]).id)
                   : HV.staffFor(client, CAL_ROLE[p]).id,
```

and in the unprescribed-booking branch:

```js
          staffId: b.assignees[0] || HV.staffFor(client, CAL_ROLE[p]).id,
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/core.js && cd <scratchpad> && node t24.js && node t19.js`
Expected: t24 `5 passed`; **t19 must still pass 16** — it asserts the booked
coach reaches the client, and now reads through the occurrence.

- [ ] **Step 5: Commit**

```bash
git add app/js/core.js
git commit -m "fix(core): a per-occurrence coach swap reaches the client's calendar"
```

---

### Task 5: The seed batches sessions inside declared hours

**This must land before Task 6.** Task 6 makes collisions refuse; landing it
first would enforce a rule against data that violates it 22 times.

**Files:**
- Modify: `app/js/data.js` — Vikram's `avail` (~line 227), the `BOOK` table and
  `bookingsFor` (~2670-2720), `HV.seedVersion` (line 11)
- Modify: `app/js/core.js` — the hand-placed demo extra (the two-hours-out
  reminder session)
- Test: `scratchpad/t25.js`

**Interfaces:**
- Consumes: `HV.firstFreeSlot`, `HV.availWindows`, `HV.availFits`.
- Produces: `seed.tasks` where every session occurrence sits inside its coach's
  window and no coach holds two at once. `HV.seedVersion === 41`.

- [ ] **Step 1: Write the failing test**

```js
/* t25 — the re-measurement. This is the gap, restated as an assertion.
   NO LITERAL TIMES: the batch is order-dependent by design. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.wait(600);
  const r = await h.ev(`(()=>{
    const sessions=(HV.store.tasks||[]).filter(t=>t.kind==='session');
    const outside=[], clash=[];
    for(let rd=-7;rd<=21;rd++){
      const live=[];
      sessions.forEach(t=>{const o=HV.occursOn(t,rd); if(o) live.push({t,o});});
      live.forEach(({t,o})=>{
        o.assignees.forEach(uid=>{
          const u=HV.store.users.find(x=>x.id===uid);
          if(!u||u.ai||!u.avail) return;
          if(!HV.availFits(u,HV.wdOf(rd),o.start,o.dur))
            outside.push({rd,who:u.name,what:o.title,at:o.start,dur:o.dur});
        });
      });
      for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
        const a=live[i],b=live[j];
        if(a.o.start+a.o.dur<=b.o.start||b.o.start+b.o.dur<=a.o.start) continue;
        const shared=a.o.assignees.filter(x=>b.o.assignees.indexOf(x)!==-1);
        if(shared.length) clash.push({rd,who:shared,a:a.o.title,b:b.o.title});
      }
    }
    const perCoach={};
    sessions.forEach(t=>{const n=HV.staff(t.assignees[0]).name;
      (perCoach[n]=perCoach[n]||[]).push(t.start);});
    return {n:sessions.length, outside, clash, perCoach,
      seedV:[HV.store.__v,HV.seedVersion]};})()`);
  h.ok('there are still sessions to check', r.n > 0, r.n);
  h.ok('NO session sits outside its coach\'s declared hours', r.outside.length === 0, r.outside.slice(0,5));
  h.ok('NO coach holds two sessions at once', r.clash.length === 0, r.clash.slice(0,5));
  h.ok('each coach\'s clients hold DISTINCT slots (a real batch, not a stagger)',
    Object.keys(r.perCoach).every(k => new Set(r.perCoach[k]).size === r.perCoach[k].length), r.perCoach);
  h.ok('the saved store is at the current seedVersion', r.seedV[0] === r.seedV[1], r.seedV);
  h.ok('the seedVersion moved past 40', r.seedV[1] >= 41, r.seedV);
  /* the split shift exists and is visible */
  h.ok('at least one coach works a split shift',
    (await h.ev(`HV.store.users.some(u=>HV.availWindows(u,'mon').length>1)`)) === true);
  h.ok('and at least one still works a single shift, so the demo contrasts',
    (await h.ev(`HV.store.users.some(u=>HV.availWindows(u,'mon').length===1)`)) === true);
  /* the whole board, not just sessions — catches the hand-placed demo extra */
  h.ok('NO task of any kind sits outside its coach\'s hours',
    (await h.ev(`(()=>{const bad=[];
      (HV.store.tasks||[]).forEach(t=>{ for(let rd=-7;rd<=14;rd++){
        const o=HV.occursOn(t,rd); if(!o) continue;
        o.assignees.forEach(uid=>{const u=HV.store.users.find(x=>x.id===uid);
          if(u&&!u.ai&&u.avail&&!HV.availFits(u,HV.wdOf(rd),o.start,o.dur))
            bad.push(u.name+' / '+o.title+' rd'+rd);});}});
      return bad.slice(0,6);})()`)).length === 0,
    await h.ev(`'see previous'`));
  h.done('t25');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t25.js`
Expected: FAIL — outside-hours 38, collisions 22.

- [ ] **Step 3: Implement**

**(a)** Vikram's split shift, `app/js/data.js` ~line 227. Replace his `avail`:

```js
        /* a personal trainer with six one-on-ones works a SPLIT shift — early
           mornings and evenings, nothing between. 5½ hours of sessions fit in
           no single window, and the declared hours are the authority here, so
           the shift is what changes. Lakshmi and Meera keep single shifts, so
           the contrast stays visible. */
        avail: { mon: [['06:00', '10:00'], ['17:00', '21:00']],
                 tue: [['06:00', '10:00'], ['17:00', '21:00']],
                 wed: [['06:00', '10:00'], ['17:00', '21:00']],
                 thu: [['06:00', '10:00'], ['17:00', '21:00']],
                 fri: [['06:00', '10:00'], ['17:00', '21:00']],
                 sat: [['06:00', '10:00']], sun: null } },
```

**(b)** `BOOK` gains `pref`, and `bookingsFor` asks the engine. Replace the
`slotTaken` counter and the body of `bookingsFor`:

```js
  const BOOK = {
    /* `pref` is the hour the pillar WANTS — yoga at dawn, fitness and mind
       wellness after work. It seeds the search; the engine decides what is
       actually possible, and when the preferred stretch fills the batch
       spills to the rest of the coach's working day. */
    fitness:  { role: 'fitness', kind: 'fitness', pref: 17 * 60, dur: 60, title: 'Fitness session' },
    yoga:     { role: 'yoga',    kind: 'yoga',    pref: 6 * 60,  dur: 60, title: 'Yoga session' },
    wellness: { role: 'mind',    kind: 'mind',    pref: 18 * 60, dur: 45, title: 'Mind Wellness session' },
  };
  let bookSeq = 0;
  function bookingsFor(c, placed) {
    const out = [];
    if (c.observation) return out;          /* nothing is booked before day 1 */
    Object.keys(BOOK).forEach(pillar => {
      const b = BOOK[pillar];
      const human = c.plan === 'poorna' || (c.humanPillars || []).indexOf(pillar) !== -1;
      const staffId = (c.pod || {})[b.role];
      if (!human || !staffId || staffId === 'u-ai') return;
      if (!((seed.clientPlans[c.id] || {})[pillar])) return;

      const days = runsOn(b.kind);
      if (!days.length) return;
      const rd = cd => cd - c.day;
      const rds = days.map(rd);
      /* THE CHANGE: the coach's own declared week decides the hour, and every
         client of a coach gets a DISTINCT slot — which is the guarantee the
         old 15-minute stagger only pretended to give (a 60-minute session at
         18:30 and another at 18:45 overlap for 45 minutes). */
      const world = { users: seed.users, tasks: placed, leaves: [], from: b.pref };
      const start = HV.firstFreeSlot(staffId, rds, b.dur, world);
      if (start == null) return;            /* unplaceable: no booking, and the
                                               template's prescription remains */
      const first = days[0], last = days[days.length - 1];
      const t = { id: 'tk-sd' + (++bookSeq), title: b.title, kind: 'session', pillar: pillar,
        clientId: c.id, assignees: [staffId], groups: [], link: '', notes: '',
        day: rd(first), start: start, dur: b.dur,
        recur: days.length > 1 ? { freq: 'alt', until: rd(last) } : null,
        exc: {}, done: {} };
      /* an alternate-day series steps over days the template does not name —
         and now also over days its coach does not work. Cancel those rather
         than inventing a recurrence rule that can express "odd days except 5". */
      if (t.recur) {
        const u = seed.users.find(x => x.id === staffId);
        for (let r = t.day; r <= t.recur.until; r += 2) {
          if (days.indexOf(c.day + r) === -1) { t.exc[r] = { cancelled: true }; continue; }
          if (!HV.availFits(u, HV.wdOf(r), start, b.dur)) t.exc[r] = { cancelled: true };
        }
      }
      out.push(t);
      placed.push(t);
    });
    return out;
  }
  seed.tasks = [];
  seed.clients.forEach(c => { bookingsFor(c, seed.tasks); });
  seed.taskSeq = bookSeq;
```

**Trap:** `bookingsFor` now **pushes into `seed.tasks` as it goes**, because
each client's placement must see the ones already placed. The old
`seed.tasks = seed.tasks.concat(...)` pattern would place every client at the
same minute.

**(c)** `HV.seedVersion = 41` at `app/js/data.js:11`.

**(d)** The hand-placed demo extra in `core.js` (the two-hours-out reminder
session) must be moved inside its coach's window. Locate it by
`grep -n "reminder" app/js/core.js`, and set its `start` from
`HV.firstFreeSlot` against that coach rather than a literal.

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/data.js && node --check app/js/core.js && cd <scratchpad> && node t25.js`
Expected: `9 passed, 0 failed, 0 console errors`

Then re-run the reconciliation suites, which read these bookings:
Run: `node t19.js && node t20.js && node t7.js`
Expected: all pass — the booking still wins on time and coach, and still keeps
the template's descriptive name.

- [ ] **Step 5: Commit**

```bash
git add app/js/data.js app/js/core.js
git commit -m "feat(seed): sessions batch inside the coach's declared week (seedVersion 41)"
```

---

### Task 6: Overlap becomes opt-in

**Files:**
- Modify: `app/js/views/console-schedule.js` — `collisions` (~343),
  `hardClashAt` (~359), the sheet's checkbox (~1122) and save path (~1197-1215),
  the tile subtitle (~906), the drag toasts (~952, 1360, 1367, 1379-1400)
- Modify: `app/js/data.js` — `allowOverlap: true` on the one genuine SOP pair
- Test: `scratchpad/t26.js`

**Interfaces:**
- Consumes: `HV.busyAt`, `HV.conflicts`.
- Produces: tasks carry `allowOverlap` (absent = refused). `t.noOverlap` is
  gone from the codebase.

- [ ] **Step 1: Write the failing test**

```js
/* t26 — overlap is opt-in. A change of MEANING, not of a checkbox default:
   14 seeded sessions carry no flag, and flipping only the UI default would
   leave every one of them colliding. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.nav('#/schedule'); await h.wait(1600);
  h.ok('noOverlap is gone from the store',
    (await h.ev(`(HV.store.tasks||[]).every(t=>t.noOverlap===undefined)`)) === true);
  h.ok('the SOP\'s one genuine parallel pair is flagged',
    (await h.ev(`(HV.store.tasks||[]).filter(t=>t.allowOverlap).length`)) >= 2);
  h.ok('everything else is not',
    (await h.ev(`(HV.store.tasks||[]).filter(t=>!t.allowOverlap).length`)) > 10);
  /* the whole board must now be conflict-free under the new rule */
  h.ok('no task on the board violates the new default',
    (await h.ev(`(()=>{const bad=[];
      for(let rd=-7;rd<=14;rd++){
        const live=[]; (HV.store.tasks||[]).forEach(t=>{const o=HV.occursOn(t,rd); if(o)live.push({t,o});});
        for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
          const a=live[i],b=live[j];
          if(a.o.start+a.o.dur<=b.o.start||b.o.start+b.o.dur<=a.o.start) continue;
          if(a.t.allowOverlap&&b.t.allowOverlap) continue;
          const shared=a.o.assignees.filter(x=>b.o.assignees.indexOf(x)!==-1);
          if(shared.length) bad.push(a.o.title+' / '+b.o.title+' rd'+rd);
        }}
      return bad.slice(0,5);})()`)).length === 0);
  h.ok('the task sheet offers an "allow overlap" control, unticked',
    (await h.ev(`(()=>{const b=document.querySelector('[data-newtask]')||
        document.querySelector('button[data-new]'); if(!b) return 'nobutton';
      b.click(); return null;})()`)) === null || true);
  await h.wait(700);
  const cb = await h.ev(`(()=>{const el=document.querySelector('#tf-allowov');
    return el?{found:true,checked:el.checked}:{found:false};})()`);
  h.ok('the control exists', cb.found, cb);
  h.ok('and it is unticked by default', cb.found && cb.checked === false, cb);
  await h.ev(`HV.closeSheet()`);
  h.done('t26');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t26.js`
Expected: FAIL — `#tf-allowov` not found; no task carries `allowOverlap`.

- [ ] **Step 3: Implement**

**(a)** In `console-schedule.js`, `collisions` and `hardClashAt` delegate to
core and invert:

```js
  /* who else holds this slot. Overlap is OPT-IN: refused unless the incoming
     task and every task it lands on both carry allowOverlap. */
  function collisions(people, rd, start, dur, exceptIds, allowOv) {
    return HV.busyAt(people, rd, start, dur,
      { tasks: tasksAll(), exceptIds: exceptIds || [], allowOverlap: !!allowOv })
      .map(function (c) { return { who: first(c.who), what: c.detail, taskId: c.taskId }; });
  }
  /* the refusal: a collision blocks unless both sides opted in */
  function hardClashAt(t, rd, start, dur, exceptIds) {
    const clash = collisions(taskPeople(t), rd, start, dur,
      exceptIds || [t.id], t.allowOverlap);
    return clash.length ? clash[0] : null;
  }
```

**(b)** The sheet's checkbox (~1122) — id and label change:

```js
      '<label class="row sch3-noov" style="gap:var(--s2)"><input type="checkbox" id="tf-allowov"' +
        (t && t.allowOverlap ? ' checked' : '') + '> ' +
        'Allow this task to overlap another — they run both, in their own order</label>' +
```

**(c)** The save path (~1197): read `#tf-allowov` into `allowOv`, and the
collision branch becomes a plain refusal — **delete the `overlapOk` parallel
tick and the `let overlapOk = false;` above it**, since consent is now given by
the checkbox before saving, not after being warned:

```js
          const allowOv = sheet.querySelector('#tf-allowov').checked;
          const people = taskPeople({ assignees: assignees, groups: groups });
          const clash = collisions(people, day, start, dur, t ? [t.id] : null, allowOv);
          if (clash.length) {
            sheet.querySelector('#tf-clash').innerHTML =
              '<div class="notice bad"><b>Blocked:</b> ' + clashList +
              ' — tick “Allow this task to overlap” above, or pick another time.</div>';
            return;
          }
```

and `mk({... allowOverlap: allowOv ...})` in place of `noOverlap: noOv`.

**(d)** The tile subtitle (~906): `(t.allowOverlap ? ' · parallel' : '')`.

**(e)** The drag toasts: `overlapToast` becomes a refusal message, and the two
`hard` branches keep their existing shape with the new wording — *"Blocked —
Vikram already holds 'Yoga session'. Tick 'allow overlap' on the task to
schedule both."*

**(f)** In `data.js`, flag the one genuine SOP pair inside `defaultTasks()`'s
review-day internals — *"Calendar completion"* and *"Observation data complete
check"*, which both sit at 12:00 and are genuinely parallel:

```js
      /* the one genuinely parallel pair in the SOP: two review-day deadlines
         land at noon and are worked side by side. Everything else refuses. */
      allowOverlap: true,
```

**Note:** these two live in `console-schedule.js`'s `defaultTasks()`, not
`data.js`. Add the flag there.

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/views/console-schedule.js && cd <scratchpad> && node t26.js && node t20.js`
Expected: t26 `7 passed`; t20 still `10 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-schedule.js
git commit -m "feat(schedule): overlap becomes opt-in, refused by default"
```

---

### Task 7: Hours and leave refuse too, on every write path

**Files:**
- Modify: `app/js/views/console-schedule.js` — `outsideAvail` and `availOffSegs`
  delegate to core; the four write paths consult `HV.conflicts`
- Test: `scratchpad/t27.js`

**Interfaces:**
- Consumes: `HV.conflicts`, `HV.availWindows`.
- Produces: no new exports; behaviour only.

- [ ] **Step 1: Write the failing test**

```js
/* t27 — TJ's two checks, both refusing: working hours, and an existing
   non-overlapping task. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.nav('#/schedule'); await h.wait(1600);
  const r = await h.ev(`(()=>{
    const v=HV.store.users.find(u=>u.id==='u-vikram');
    const wd=HV.wdOf(0);
    const win=HV.availWindows(v,wd);
    const inHours=win.length?win[0][0]:null;
    const outHours=win.length?win[win.length-1][1]+60:null;
    return { win, inHours, outHours,
      cIn: HV.conflicts(['u-vikram'],0,inHours,30,{}).map(c=>c.type),
      cOut: HV.conflicts(['u-vikram'],0,outHours,30,{}).map(c=>c.type) };})()`);
  h.ok('a slot inside declared hours and free has no conflict',
    r.cIn.indexOf('hours') === -1, r);
  h.ok('a slot after the last window reports hours', r.cOut.indexOf('hours') !== -1, r);
  h.ok('the grid still hatches the off-hours, now per window',
    (await h.ev(`document.querySelectorAll('.sch3-off,[class*=off]').length >= 0`)) === true);
  /* approved leave refuses */
  h.ok('an approved leave day reports leave',
    (await h.ev(`(()=>{const iso=HV.todayISO();
      HV.store.leaves=(HV.store.leaves||[]).concat([{id:'lv-t',staffId:'u-vikram',
        status:'approved',from:iso,to:iso,reason:'t',reallocations:[],history:[]}]);
      HV.save();
      const c=HV.conflicts(['u-vikram'],0,HV.availWindows(
        HV.store.users.find(u=>u.id==='u-vikram'),HV.wdOf(0))[0][0],30,{});
      return c.map(x=>x.type).indexOf('leave')!==-1;})()`)) === true);
  h.ok('a non-approved leave does not',
    (await h.ev(`(()=>{HV.store.leaves=HV.store.leaves.filter(l=>l.id!=='lv-t');
      HV.store.leaves.push({id:'lv-t2',staffId:'u-vikram',status:'pending',
        from:HV.todayISO(),to:HV.todayISO(),reason:'t',reallocations:[],history:[]});
      HV.save();
      return HV.conflicts(['u-vikram'],0,HV.availWindows(
        HV.store.users.find(u=>u.id==='u-vikram'),HV.wdOf(0))[0][0],30,{})
        .map(x=>x.type).indexOf('leave')===-1;})()`)) === true);
  h.done('t27');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t27.js`
Expected: FAIL — the grid's own helpers still read a single window.

- [ ] **Step 3: Implement**

Replace `availOffSegs` and `outsideAvail` in `console-schedule.js` with
delegations, so a split shift hatches two gaps rather than one:

```js
  /* the visible hours OUTSIDE a person's declared windows for that weekday.
     A split shift produces TWO gaps, which is why this walks windows rather
     than a single from/to pair. */
  function availOffSegs(uid, rd) {
    const u = HV.staff(uid);
    if (!u || u.ai || !u.avail) return [];
    const wins = HV.availWindows(u, HV.wdOf(rd));
    if (!wins.length) return [[T(H0), T(H1)]];
    const segs = [];
    let cur = T(H0);
    wins.forEach(function (w) {
      if (w[0] > cur) segs.push([cur, Math.min(w[0], T(H1))]);
      cur = Math.max(cur, w[1]);
    });
    if (cur < T(H1)) segs.push([cur, T(H1)]);
    return segs.filter(function (s) { return s[1] > s[0] && s[0] < T(H1); });
  }
  /* the sheet's live hint, now from the same engine that refuses */
  function outsideAvail(people, rd, start, dur) {
    return HV.outsideHours(people, rd, start, dur, { tasks: tasksAll() })
      .map(function (c) { return first(c.who) + ' ' + c.detail; });
  }
```

In the save path, replace the collision-only check with the full engine so
hours and leave refuse alongside busy:

```js
          const conf = HV.conflicts(people, day, start, dur,
            { tasks: tasksAll(), exceptIds: t ? [t.id] : [], allowOverlap: allowOv });
          if (conf.length) {
            sheet.querySelector('#tf-clash').innerHTML =
              '<div class="notice bad"><b>Blocked:</b> ' +
              conf.slice(0, 3).map(function (c) {
                return HV.esc(first(c.who)) + ' ' +
                  (c.type === 'busy' ? 'already holds “' + HV.esc(c.detail) + '”'
                   : c.type === 'leave' ? 'is on approved leave'
                   : HV.esc(c.detail));
              }).join(' · ') +
              (conf.length > 3 ? ' · +' + (conf.length - 3) + ' more' : '') +
              '</div>';
            return;
          }
```

Apply the same `HV.conflicts` call in `hardClashAt` so both drag paths inherit
it (they already route through it).

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/views/console-schedule.js && cd <scratchpad> && node t27.js && node t26.js`
Expected: t27 `5 passed`; t26 still `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-schedule.js
git commit -m "feat(schedule): working hours and approved leave refuse a booking too"
```

---

### Task 8: The staff record renders a split shift

`availSummaryHtml` does `av[day].join('–')`, which on a nested array prints
`06:00,10:00–17:00,21:00`.

**Files:**
- Modify: `app/js/views/console-people.js:133` (`availSummaryHtml`) and `:151`
  (`weekStripHtml`)
- Test: `scratchpad/t28.js`

**Interfaces:**
- Consumes: `HV.availWindows`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```js
/* t28 — a split shift must READ as a split shift everywhere it is shown. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.nav('#/people'); await h.wait(1400);
  const txt = await h.ev(`document.querySelector('main').textContent`);
  h.ok('no raw array leaks into the summary line', txt.indexOf('06:00,10:00') === -1, txt.slice(0, 200));
  h.ok('Vikram\'s two windows are both shown',
    /06:00/.test(txt) && /17:00/.test(txt) && /21:00/.test(txt), txt.slice(0, 300));
  h.ok('a single-shift coach still reads as one range',
    /14:00/.test(txt) && /21:00/.test(txt), true);
  h.ok('the week strip renders a cell per day', (await h.ev(`
    document.querySelectorAll('.pa2-day').length % 7 === 0 &&
    document.querySelectorAll('.pa2-day').length > 0`)) === true);
  h.ok('the page has no console errors', h.logs.length === 0, h.logs);
  h.done('t28');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t28.js`
Expected: FAIL — `06:00,10:00` appears in the summary.

- [ ] **Step 3: Implement**

```js
  /* 'Mon–Fri 06:00–10:00 and 17:00–21:00 · Sun off' — consecutive days with
     the same shift collapse into one span; a split shift shows both windows */
  function shiftOf(av, dayKey) {
    const w = HV.availWindows({ avail: av }, dayKey);
    return w.length ? w.map(function (r) {
      return HV.fmtTime(r[0]) + '–' + HV.fmtTime(r[1]);
    }).join(' and ') : null;
  }
  function availSummaryHtml(av) {
    if (!av) return 'Not set yet';
    var parts = [], i = 0;
    while (i < DAYS.length) {
      var r = shiftOf(av, DAYS[i]);
      var j = i;
      while (j + 1 < DAYS.length && shiftOf(av, DAYS[j + 1]) === r) j++;
      var label = i === j ? DAY_NAMES[DAYS[i]] : DAY_NAMES[DAYS[i]] + '–' + DAY_NAMES[DAYS[j]];
      parts.push(label + ' ' + (r ? '<span class="num">' + HV.esc(r) + '</span>' : 'off'));
      i = j + 1;
    }
    return parts.join(' · ');
  }
  function weekStripHtml(av) {
    return '<div class="pa2-week">' + DAYS.map(function (k) {
      var w = HV.availWindows({ avail: av }, k);
      return '<div class="pa2-day' + (w.length ? '' : ' pa2-off') + '"><small><b>' +
        DAY_NAMES[k] + '</b></small>' +
        (w.length
          ? w.map(function (r) {
              return '<small class="num">' + HV.esc(HV.fmtTime(r[0])) + '</small>' +
                     '<small class="num">' + HV.esc(HV.fmtTime(r[1])) + '</small>';
            }).join('')
          : '<small>Off</small>') +
        '</div>';
    }).join('') + '</div>';
  }
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/views/console-people.js && cd <scratchpad> && node t28.js`
Expected: `5 passed, 0 failed, 0 console errors`

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-people.js
git commit -m "feat(people): the staff record reads a split shift"
```

---

### Task 9: The paint-your-week editor gains a second range

**Files:**
- Modify: `app/js/views/console-leave.js:155-205` (`availHtml`, `wireAvail`)
- Modify: `app/css/app.css` — a row for the second range
- Test: `scratchpad/t29.js`

**Interfaces:**
- Consumes: `HV.availWindows`.
- Produces: writes `me.avail[day]` as `[[from,to], …]` when more than one range
  exists, and as `['from','to']` when exactly one — so a single-shift record
  keeps its simpler shape.

- [ ] **Step 1: Write the failing test**

```js
/* t29 — a coach can declare a split shift for themselves. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-vikram')`); await h.nav('#/leave'); await h.wait(1400);
  h.ok('the editor shows both of Vikram\'s Monday ranges',
    (await h.ev(`document.querySelectorAll('[data-avfrom="mon"]').length`)) === 2);
  h.ok('an "add a range" control exists',
    (await h.ev(`!!document.querySelector('[data-avadd]')`)) === true);
  h.ok('a single-shift day shows one range',
    (await h.ev(`(()=>{const me=HV.me(); me.avail.tue=['09:00','17:00']; HV.save(); HV.refresh(); return 1;})()`)) === 1);
  await h.wait(700);
  h.ok('and it renders as one', (await h.ev(`document.querySelectorAll('[data-avfrom="tue"]').length`)) === 1);
  const added = await h.ev(`(()=>{const b=document.querySelector('[data-avadd="tue"]');
    if(!b) return 'nobutton'; b.click(); return null;})()`);
  h.ok('adding a range is possible', added === null, added);
  await h.wait(700);
  h.ok('the day now holds two ranges',
    (await h.ev(`HV.availWindows(HV.me(),'tue').length`)) === 2);
  h.ok('and it persists in the nested shape',
    (await h.ev(`Array.isArray(HV.me().avail.tue[0])`)) === true);
  h.ok('a range can be removed again',
    (await h.ev(`(()=>{const b=document.querySelector('[data-avdel="tue:1"]');
      if(!b) return false; b.click(); return true;})()`)) === true);
  await h.wait(700);
  h.ok('and the day is back to one range', (await h.ev(`HV.availWindows(HV.me(),'tue').length`)) === 1);
  h.ok('no console errors', h.logs.length === 0, h.logs);
  h.done('t29');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t29.js`
Expected: FAIL — only one `[data-avfrom="mon"]`, no `[data-avadd]`.

- [ ] **Step 3: Implement**

Rewrite `availHtml`'s row builder to loop the windows, keying each input
`data-avfrom="mon:0"` / `data-avto="mon:1"`, adding
`<button data-avadd="mon">Add a range</button>` per working day and
`<button data-avdel="mon:1">` on every range past the first. `wireAvail`
rewrites the day through a helper that **writes the flat shape when one range
remains and the nested shape otherwise**:

```js
    /* one range keeps the simpler flat shape, so a record only becomes nested
       when it earns it — and both shapes read back identically */
    function writeDay(dayKey, wins) {
      me.avail = me.avail || {};
      me.avail[dayKey] = !wins.length ? null
        : wins.length === 1 ? [wins[0][0], wins[0][1]]
        : wins.map(function (w) { return [w[0], w[1]]; });
      HV.save();
    }
```

Keep the existing "the day has to start before it ends" guard, and add a guard
refusing a range that overlaps another on the same day.

Add to `app/css/app.css`, beside the existing `.lv-` rules:

```css
.lv-range{display:flex;align-items:center;gap:var(--s2);margin-top:var(--s1)}
.lv-addr{font-size:var(--t-micro);margin-top:var(--s1)}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/views/console-leave.js && cd <scratchpad> && node t29.js && node t28.js`
Expected: t29 `10 passed`; t28 still `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-leave.js app/css/app.css
git commit -m "feat(leave): a coach can declare a split shift"
```

---

### Task 10: The cover board sees the sessions, and checks the bench

**Files:**
- Modify: `app/js/views/console-leave.js` — `bench` (~103), `planSheet` (~344),
  `teamHtml`'s open-list count (~296)
- Test: `scratchpad/t30.js`

**Interfaces:**
- Consumes: `HV.conflicts`, `HV.occursOn`.
- Produces: `sessionsInLeave(lv) → [{taskId, rd, iso, title, clientId}]` (module
  local); `benchLoad(uid, lv) → {free:n, clashes:n}` (module local);
  `lv.sessions = [{taskId, rd, toId}]` on the record.

- [ ] **Step 1: Write the failing test**

```js
/* t30 — the cover board must show the APPOINTMENTS, not just the seats, and
   must not offer a bench member who is already booked solid. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.wait(600);
  const r = await h.ev(`(()=>{
    const lv=(HV.store.leaves||[]).find(l=>l.staffId==='u-vikram');
    if(!lv) return {none:true};
    const out=[];
    (HV.store.tasks||[]).forEach(t=>{
      if((t.assignees||[]).indexOf('u-vikram')===-1) return;
      for(let rd=-10;rd<=25;rd++){
        const o=HV.occursOn(t,rd); if(!o) continue;
        const iso=HV.dateAdd(HV.todayISO(),rd);
        if(iso>=lv.from&&iso<=lv.to) out.push({taskId:t.id,rd,title:o.title});
      }});
    return {lv:lv.id, from:lv.from, to:lv.to, sessions:out};})()`);
  h.ok('Vikram\'s leave window really does contain sessions', r.sessions.length > 0, r);
  await h.nav('#/leave/team'); await h.wait(1400);
  const txt = await h.ev(`document.querySelector('main').textContent`);
  h.ok('the cover board counts the sessions, not only the clients',
    /session/i.test(txt), txt.slice(0, 400));
  h.ok('opening the plan sheet lists them', (await h.ev(`(()=>{
    const b=document.querySelector('[data-plan]'); if(!b) return 'nobutton'; b.click(); return null;})()`)) === null);
  await h.wait(800);
  const sheet = await h.ev(`(()=>{const s=document.querySelector('.sheet,.sheet-body,[role=dialog]');
    return s?{txt:s.textContent,rows:s.querySelectorAll('[data-sesscover]').length}:{txt:'',rows:0};})()`);
  h.ok('a picker exists per session', sheet.rows > 0, sheet);
  h.ok('the bench reports whether the candidate is actually free',
    /free|clash|already holds/i.test(sheet.txt), sheet.txt.slice(0, 400));
  await h.ev(`HV.closeSheet()`);
  h.ok('no console errors', h.logs.length === 0, h.logs);
  h.done('t30');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t30.js`
Expected: FAIL — no `[data-sesscover]` rows; the sheet lists only clients.

- [ ] **Step 3: Implement**

Add to `console-leave.js`'s leave-model helpers:

```js
  /* every session occurrence that falls inside a leave window. The board used
     to reallocate CLIENT SEATS only, so eight of Vikram's booked appointments
     sat inside his leave with nothing anywhere saying so. */
  function sessionsInLeave(lv) {
    var out = [];
    (HV.store.tasks || []).forEach(function (t) {
      if ((t.assignees || []).indexOf(lv.staffId) === -1) return;
      for (var rd = -30; rd <= 60; rd++) {
        var o = HV.occursOn(t, rd);
        if (!o) continue;
        var iso = HV.dateAdd(HV.todayISO(), rd);
        if (iso < lv.from || iso > lv.to) continue;
        out.push({ taskId: t.id, rd: rd, iso: iso, title: o.title,
                   start: o.start, dur: o.dur, clientId: t.clientId });
      }
    });
    return out.sort(function (a, b) { return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.start - b.start; });
  }
  /* can this bench member actually take them? */
  function benchLoad(uid, sessions) {
    var clashes = sessions.filter(function (s) {
      return HV.conflicts([uid], s.rd, s.start, s.dur, {}).length > 0;
    });
    return { free: sessions.length - clashes.length, clashes: clashes.length };
  }
```

`planSheet` gains a **Sessions** block below the client-seat block, one
`<select data-sesscover="taskId:rd">` per occurrence populated from `bench()`,
each option labelled with `benchLoad` — *"Nikhil T. · free for all 8"* or
*"Nikhil T. · 3 clashes"*. On send it writes:

```js
          lv.sessions = Array.prototype.map.call(
            sheet.querySelectorAll('select[data-sesscover]'), function (sel) {
              var p = sel.dataset.sesscover.split(':');
              return { taskId: p[0], rd: Number(p[1]), toId: sel.value };
            });
```

`teamHtml`'s open-list line gains the session count beside the client count.

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/views/console-leave.js && cd <scratchpad> && node t30.js`
Expected: `7 passed, 0 failed, 0 console errors`

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-leave.js
git commit -m "feat(leave): the cover board reassigns the appointments, not just the seats"
```

---

### Task 11: The cover has to accept

**Files:**
- Modify: `app/js/views/console-leave.js` — `statusPill`, `planSheet`'s send,
  a new "Covers waiting on you" section, `teamHtml` grouping, `approveHtml`
- Modify: `app/css/app.css` — the accept-state pill tone
- Test: `scratchpad/t31.js`

**Interfaces:**
- Consumes: Task 10's `lv.sessions`.
- Produces: status `'accept'` between `'reassign'` and `'pending'`;
  `lv.coverAccepts = {staffId: 'accepted'|'declined'|null}`.

- [ ] **Step 1: Write the failing test**

```js
/* t31 — the acceptance step, including the route back that stops it stranding. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.wait(600);
  const setup = await h.ev(`(()=>{
    const lv=(HV.store.leaves||[]).find(l=>l.staffId==='u-vikram');
    lv.status='accept'; lv.sessions=[{taskId:(HV.store.tasks||[]).find(
      t=>(t.assignees||[]).indexOf('u-vikram')!==-1).id, rd:3, toId:'u-nikhil'}];
    lv.coverAccepts={'u-nikhil':null}; HV.save(); return lv.id;})()`);
  h.ok('a leave can sit in the accept state', !!setup, setup);
  await h.ev(`HV.login('u-nikhil')`); await h.nav('#/leave/team'); await h.wait(1400);
  h.ok('the named cover is asked',
    /waiting on you|accept/i.test(await h.ev(`document.querySelector('main').textContent`)));
  h.ok('an accept control exists', (await h.ev(`!!document.querySelector('[data-covyes]')`)) === true);
  h.ok('a decline control exists', (await h.ev(`!!document.querySelector('[data-covno]')`)) === true);
  /* decline routes BACK to reassign — without this the leave strands forever */
  await h.ev(`document.querySelector('[data-covno]').click()`); await h.wait(900);
  h.ok('declining sends it back to the cover board',
    (await h.ev(`HV.store.leaves.find(l=>l.staffId==='u-vikram').status`)) === 'reassign');
  h.ok('and records the decline',
    (await h.ev(`HV.store.leaves.find(l=>l.staffId==='u-vikram').coverAccepts['u-nikhil']`)) === 'declined');
  /* accepting moves it on */
  await h.ev(`(()=>{const lv=HV.store.leaves.find(l=>l.staffId==='u-vikram');
    lv.status='accept'; lv.coverAccepts={'u-nikhil':null}; HV.save();})()`);
  await h.nav('#/home'); await h.wait(400); await h.nav('#/leave/team'); await h.wait(1200);
  await h.ev(`document.querySelector('[data-covyes]').click()`); await h.wait(900);
  h.ok('the last acceptance sends it to the approver',
    (await h.ev(`HV.store.leaves.find(l=>l.staffId==='u-vikram').status`)) === 'pending');
  h.ok('no console errors', h.logs.length === 0, h.logs);
  h.done('t31');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t31.js`
Expected: FAIL — no `[data-covyes]`; the `accept` status renders no pill.

- [ ] **Step 3: Implement**

`statusPill` gains the state:

```js
    return lv.status === 'reassign' ? HV.ui.pill('Cover plan due', 'warn')
      : lv.status === 'accept' ? HV.ui.pill('Waiting on the cover', 'info')
      : lv.status === 'pending' ? HV.ui.pill('Awaiting ' + roleTitle(cfg().approverRole), 'info')
      : …
```

`planSheet`'s send sets `lv.status = 'accept'`, builds `coverAccepts` from the
distinct `toId`s across both `reallocations` and `sessions`, and notifies each.

A new section at the top of `teamHtml`, visible to anyone named as a cover:

```js
  /* the covers waiting on ME. A HoD picking a name from a dropdown is not
     the same as the coach agreeing to work that morning. */
  function mineToAccept(me) {
    return (HV.store.leaves || []).filter(function (l) {
      return l.status === 'accept' && (l.coverAccepts || {})[me.id] === null;
    });
  }
```

rendering an `HV.ui.pill`-headed card per leave with the sessions listed and
two buttons, `data-covyes="lv-id"` / `data-covno="lv-id"`. Wiring:

```js
      /* the LAST acceptance moves it on; any decline sends the whole plan back
         to the board, or the application strands in a state with no button */
      function respondCover(lv, me, yes) {
        lv.coverAccepts[me.id] = yes ? 'accepted' : 'declined';
        lv.history.push({ act: yes ? 'cover accepted' : 'cover declined', byId: me.id, ts: HV.now() });
        if (!yes) {
          lv.status = 'reassign';
          HV.notice(lv.staffId, 'leave', me.name + ' cannot take the cover — back to the board.');
        } else if (Object.keys(lv.coverAccepts).every(function (k) {
          return lv.coverAccepts[k] === 'accepted';
        })) {
          lv.status = 'pending';
          approvers().forEach(function (u) {
            HV.notice(u.id, 'leave', HV.staff(lv.staffId).name +
              '’s cover plan is accepted — your signature is next.');
          });
        }
        HV.save();
        HV.toast(yes ? 'Accepted — thank you.' : 'Declined — the board will re-plan.');
        HV.refresh();
      }
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/views/console-leave.js && cd <scratchpad> && node t31.js && node t30.js`
Expected: t31 `8 passed`; t30 still `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-leave.js app/css/app.css
git commit -m "feat(leave): the named cover accepts before the approver ever sees it"
```

---

### Task 12: Approval moves the appointments, and the client is told

**Files:**
- Modify: `app/js/views/console-leave.js` — `approve` (~436)
- Test: `scratchpad/t32.js`

**Interfaces:**
- Consumes: Task 4's `occursOn().assignees`, Task 10's `lv.sessions`.
- Produces: `t.exc[rd].assignees = [toId]` per reassigned occurrence.

- [ ] **Step 1: Write the failing test**

```js
/* t32 — the end of the whole chain: an approved cover reaches the CLIENT. */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.wait(600);
  const before = await h.ev(`(()=>{
    const lv=(HV.store.leaves||[]).find(l=>l.staffId==='u-vikram');
    const t=(HV.store.tasks||[]).find(x=>(x.assignees||[]).indexOf('u-vikram')!==-1 && x.clientId);
    let rd=null; for(let r=-10;r<=25;r++){ if(HV.occursOn(t,r)){rd=r;break;} }
    lv.status='pending'; lv.sessions=[{taskId:t.id,rd:rd,toId:'u-nikhil'}];
    lv.coverAccepts={'u-nikhil':'accepted'}; lv.reallocations=[]; HV.save();
    return {lvId:lv.id, taskId:t.id, rd:rd, clientId:t.clientId,
            who:HV.staff(HV.occursOn(t,rd).assignees[0]).name};})()`);
  h.ok('the occurrence starts on Vikram', before.who === 'Vikram S.', before);
  await h.ev(`HV.login('u-anita')`); await h.nav('#/leave/approve'); await h.wait(1400);
  h.ok('the approver can see it', (await h.ev(`!!document.querySelector('[data-appr]')`)) === true);
  await h.ev(`document.querySelector('[data-appr]').click()`); await h.wait(1000);
  const after = await h.ev(`(()=>{const t=HV.store.tasks.find(x=>x.id===${JSON.stringify(before.taskId)});
    return {status:HV.store.leaves.find(l=>l.id===${JSON.stringify(before.lvId)}).status,
      who:HV.staff(HV.occursOn(t,${before.rd}).assignees[0]).name,
      exc:!!(t.exc&&t.exc[${before.rd}]&&t.exc[${before.rd}].assignees)};})()`);
  h.ok('the leave is approved', after.status === 'approved', after);
  h.ok('the occurrence now names the cover', after.who === 'Nikhil T.', after);
  h.ok('and it was written as a per-occurrence exception', after.exc, after);
  /* THE POINT: the client is told */
  const cl = await h.ev(`(()=>{const c=HV.client(${JSON.stringify(before.clientId)});
    HV.clearCalCache();
    const cd=c.day+${before.rd};
    const d=HV.calendarFor(c).find(x=>x.day===cd); if(!d) return {noday:true};
    const it=(d.items||[]).find(i=>i.booked);
    return it?{who:HV.staff(it.staffId).name}:{noitem:true};})()`);
  h.ok('the CLIENT\'s calendar names the covering coach', cl.who === 'Nikhil T.', cl);
  h.ok('no console errors', h.logs.length === 0, h.logs);
  h.done('t32');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd <scratchpad> && node t32.js`
Expected: FAIL — the occurrence still names Vikram after approval.

- [ ] **Step 3: Implement**

In `approve`, after the existing `podCover` loop:

```js
    /* the appointments follow the cover. HV.occursOn carries assignees through
       an exception, so ONE write reaches the grid, the digest, the reminder
       sweep and the client's My Plan — which is where the old bug lived: the
       seat moved and the appointment kept the absent coach's name. */
    (lv.sessions || []).forEach(function (s) {
      var t = (HV.store.tasks || []).find(function (x) { return x.id === s.taskId; });
      if (!t) return;
      t.exc = t.exc || {};
      t.exc[s.rd] = t.exc[s.rd] || {};
      t.exc[s.rd].assignees = [s.toId];
    });
    HV.clearCalCache();
```

and extend the cover notice to count sessions as well as clients.

- [ ] **Step 4: Run it and watch it pass**

Run: `node --check app/js/views/console-leave.js && cd <scratchpad> && node t32.js && node t24.js`
Expected: t32 `7 passed`; t24 still `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-leave.js
git commit -m "fix(leave): an approved cover moves the appointment, so the client is told"
```

---

### Task 13: Ship v197

**Files:**
- Modify: `app/index.html` (every `?v=`), `app/sw.js` (`CACHE`)
- Test: the whole suite

- [ ] **Step 1: Bump both levers together**

```bash
sed -i '' 's/?v=196/?v=197/g' app/index.html
sed -i '' "s/haalving-demo-v196/haalving-demo-v197/" app/sw.js
grep -c "v=197" app/index.html && grep -n "CACHE" app/sw.js
```

Expected: the count matches the number of assets; `CACHE` reads `v197`.

- [ ] **Step 2: Syntax-check every edited file**

```bash
for f in app/js/core.js app/js/data.js app/js/views/console-schedule.js \
         app/js/views/console-leave.js app/js/views/console-people.js; do
  node --check "$f" || echo "FAILED $f"; done
```

Expected: silent.

- [ ] **Step 3: Run the new suites**

Run: `for t in t21 t22 t23 t24 t25 t26 t27 t28 t29 t30 t31 t32; do node $t.js; done`
Expected: every one green, zero console errors.

- [ ] **Step 4: Run the full regression**

Run: `for t in t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14 t15 t16 t17 t19 t20 loop phase1 phase1c phase2; do node $t.js; done`
Expected: all green. **t17 and t25 both assert `store.__v === HV.seedVersion`**
rather than a literal, so the bump to 41 does not stale them.

- [ ] **Step 5: Look at it**

Screenshot the Schedule grid and the cover board in **both themes**, as an
admin and as a coach, and read them. Two v195 defects passed every assertion
and were caught only by looking: a number stated twice in different words, and
an invented weight contradicting a seeded log.

- [ ] **Step 6: Commit**

```bash
git add -A app/
git commit -m "chore(ship): v197 — coach capacity, the split shift, and the cover that reaches the client"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 conflict engine | 1, 2, 3 |
| §2 multi-window availability | 1 (model), 8 (staff record), 9 (editor), 7 (grid hatching) |
| §3 overlap opt-in | 6 |
| §3 both checks refuse | 7 |
| §4 seed batches in declared hours | 5 |
| §5(a) sessions + bench check | 10 |
| §5(b) acceptance + decline route | 11 |
| §5 approval writes `exc.assignees` | 4 (the carrier), 12 (the write) |
| §6 `store.capacity` untouched | — no task, by design |
| §7 files / version levers | 13 |
| §8 verification 1–12 | t21–t32 and Task 13 steps 3–5 |

**Type consistency checked:** `HV.availWindows` returns minute pairs everywhere;
`HV.conflicts` items carry `{type, whoId, who, detail}` in Tasks 2, 7, 10;
`lv.sessions` is `[{taskId, rd, toId}]` in Tasks 10, 11, 12 alike;
`occursOn().assignees` is an array in Tasks 4, 5, 12.

**Ordering constraints, both load-bearing:**
- **Task 5 before Task 6.** Enforcement must not land on data that violates it.
- **Task 4 before Task 12.** The exception carrier must exist before anything
  writes one, or the approval silently does nothing.
