# The Client Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the console's Clients workspace into a full client record (nine tabs, ~14 new fields, a 90-day term clock, dashboard counts by status), make the assigned per-pillar templates finally reach the client's My Plan (closing finding F2), and flip the programme from 11-day to 14-day cycles.

**Architecture:** Three layers, built bottom-up so each is verifiable before the next rests on it. **(a)** Pure helpers on `core.js` — term maths, age, one log writer, one session writer, the derived calendar. **(b)** Seed data — new fields on seven clients, `programShape.termDays`. **(c)** UI — a new `console-client-record.js` holding Profile, Medical, Logs and Meetings, with `console-clients.js` keeping the rail, header, shell and existing tabs. The calendar switch lands **writer-first**: `HV.markSession` and the three mutation sites change *before* any reader, or edits silently revert on repaint.

**Tech Stack:** Plain ES5-flavoured JavaScript, no build step, no package manager, no framework. Modules hang off one global `HV` and are loaded in a fixed order by `<script>` tags. Verification is `node --check` plus a headless-Chrome CDP harness driven over a raw WebSocket.

**Spec:** [`docs/superpowers/specs/2026-08-17-client-record-design.md`](../specs/2026-08-17-client-record-design.md)

## Global Constraints

Every task's requirements implicitly include this section.

- **No build step, no dependencies.** Plain HTML/CSS/JS loaded by `<script>` tags. Never add a package, bundler, or framework.
- **Shipping requires all three version levers**, or a returning user runs stale code: every `?v=194` in `app/index.html` → `?v=195`; `const CACHE = 'haalving-demo-v194'` in `app/sw.js` → `'haalving-demo-v195'`; `HV.seedVersion = 37` in `app/js/data.js` → `38`. The service worker matches with `ignoreSearch: true`, so **the cache name is the only real lever** — bumping `?v=` alone invalidates nothing.
- **Adding a view file means adding it in three places:** the file, `app/index.html`, and the `ASSETS` list in `app/sw.js`.
- **`HV.ui.*` returns HTML strings, not elements.** Every view builds one big string, assigns `el.innerHTML`, then attaches listeners by querying `[data-*]` attributes. All interpolated data goes through `HV.esc()`.
- **Serif is for data.** Every numeral in the app is set in `--f-data`. Apply with `class="num"`.
- **A pillar's colour appears only in that pillar's own dial, dot, ribbon and series.** Never decoratively.
- **Use design tokens, never raw values.** Spacing is a strict 4-base scale (`--s1`…`--s10`), type is 8 fixed steps with nothing below 12px, radius five tokens, elevation three. Cards carry tone and shadow, never a 1px border.
- **Frozen key vocabularies.** Pillar keys stay `fitness / culture / yoga / wellness`; `culture` **displays** as "Nutrition" and `wellness` as "Mind Wellness". The Mind Wellness staff-role and pod key is `mind`, the Nutrition coach role is `dietitian`. Never rename a key — only `HV.PILLARS[].name` and user-facing copy carry display names.
- **`c.sex` is CLINICAL and must never be merged with the new `c.gender`.** `sex` feeds `HV.vitals` reference bands (`console-medical.js:116`, `client-profile.js:72`, `console-clients.js:607`) and the BMR formula (`client-onboard.js:1260`, `console-pipeline.js:1059`). `gender` is identity only.
- **Change the meaning, never the digit.** `11` is also a YouTube-id length, a CSS padding, a sleep time and a haemoglobin reading. The `7`s left in `console-clients.js` (`:168`, `:174`, `:268`) are all **a week** — templating them is a regression.
- **Never touch:** `OBS_DAYS` and the `obs*` SOP steps (the 5-day observation window runs before Day 1 and is not in `programShape`); `console-pipeline.js:113` *"77 days to reach the goal"* (quotation from the signed Assessment Call Script); `console-pipeline.js:170` *"the 7-11 progress sheet"* (proper name of a real spreadsheet outside the app).
- **No emoji anywhere in the product.** `HV.ui.ICONS` is a 45-mark hairline set.
- **Dark mode is a designed counterpart**, not an inversion. Check both.

## Environment

```bash
# two static servers, both serving app/ (already running in this session; restart if needed)
cd /Users/USER/claude_tj/HAALIVING/app && python3 -m http.server 8081 &   # client app
cd /Users/USER/claude_tj/HAALIVING/app && python3 -m http.server 8082 &   # console

# headless Chrome with CDP on 9231, FRESH profile dir every run
SCRATCH=/private/tmp/claude-501/-Users-USER-claude-tj-HAALIVING/2ffdf263-8ab9-4866-859a-ae7cc8fb2223/scratchpad
rm -rf $SCRATCH/prof && \
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new --remote-debugging-port=9231 --remote-allow-origins='*' \
  --no-sandbox --user-data-dir=$SCRATCH/prof about:blank &
```

**A persisted `--user-data-dir` has faked "clean state" results before — delete it every run.**

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `app/js/core.js` | The `HV` global: router, RBAC, store, UI kit, shared maths | Add 7 helpers; switch 2 call sites |
| `app/js/data.js` | `HV.seed` — the immutable starting story | 14 fields × 7 clients, `termDays`, `cycleDays` 14, `seedVersion` 38 |
| **`app/js/views/console-client-record.js`** | **NEW.** Profile, Medical Details, Logs, Meetings — the four record surfaces and their sheets | Create |
| `app/js/views/console-clients.js` | Rail, header, three-panel shell, the other five tabs | Tabs to nine, term bar, status filters, delegate to `HV.clientRecord` |
| `app/js/views/console-digest.js` | Console Home and its Dashboard tab | Add the roster-by-status card |
| `app/js/views/console-config.js` | Configuration ▸ Program — the shape levers | Add `termDays` with validation |
| `app/js/views/client-plan.js` | The client's My Plan | 5 readers, `dayOf` rewrite, 2 mutation sites |
| `app/js/views/client-today.js` | The client's Today | 2 readers |
| `app/js/views/client-trackers.js` | The client's Trackers | 2 readers |
| `app/js/views/console-pipeline.js` · `client-onboard.js` | Promotion to client | Delete calendar writers, seed record fields |
| `app/css/app.css` | The tokenised design system | Profile grid, term bar, log spine, meeting minutes |
| `app/index.html` · `app/sw.js` | Load order and offline cache | Register the new file; all three version levers |

**Why the new file:** `console-clients.js` is 2,436 lines. Profile + Medical + Logs + Meetings would push it past 3,400. The split follows the codebase's existing export idiom — `HV.consoleui` (`console-clients.js:96`) and `HV.chatui` (`console-circles.js`) — where consumers call in only inside `render()`, so script-tag order never matters.

---

## Task 0: The shared test harness

Every existing CDP script re-pastes 25 lines of boilerplate. Extract it once so each task's test is a few lines of assertions.

**Files:**
- Create: `$SCRATCH/h.js`

**Interfaces:**
- Produces: `module.exports = { open }` where `open(port)` returns `{ ev, wait, nav, shot, logs, ok, out, done }`.

- [ ] **Step 1: Write the harness**

```js
/* $SCRATCH/h.js — shared CDP boilerplate for every task's verification. */
const WebSocket = require('ws');
const fs = require('fs');
const CDP = 'http://127.0.0.1:9231';

async function open(port) {
  const t = await (await fetch(CDP + '/json/new?http://127.0.0.1:' + port + '/', { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {}; const logs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; }
    /* our own teardown races Chrome's SW update check — that exception is
       harness noise, not an app fault, and filtering it here stops every
       task re-discovering it */
    if (m.method === 'Runtime.exceptionThrown' && !/Failed to update a ServiceWorker/.test(JSON.stringify(m.params)))
      logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      logs.push('ERR: ' + m.params.args.map(a => a.value || '').join(' '));
  });
  await new Promise(r => ws.on('open', r));
  await send('Runtime.enable'); await send('Page.enable');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    return r.exceptionDetails ? { err: r.exceptionDetails.exception?.description || r.exceptionDetails.text } : r.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 2, mobile: false });
  await wait(1200);
  /* clear → reload → clear → reload: a hash-only navigate does NOT reload,
     and one pass leaves the old SW serving stale files */
  await ev(`(async()=>{const rs=await navigator.serviceWorker.getRegistrations();for(const r of rs)await r.unregister();const ks=await caches.keys();for(const k of ks)await caches.delete(k);localStorage.clear();})()`);
  await send('Page.reload', { ignoreCache: true }); await wait(2200);
  await ev(`localStorage.clear()`);
  await send('Page.reload', { ignoreCache: true }); await wait(2600);

  const out = { pass: [], fail: [] };
  const ok = (n, c, g) => (c ? out.pass : out.fail).push(n + (c ? '' : '  got=' + JSON.stringify(g)));
  /* a hash change alone never reloads — set it, then let the router paint */
  const nav = async (hash) => { await ev(`location.hash=${JSON.stringify(hash)}`); await wait(700); };
  const shot = async (path) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path, Buffer.from(r.data, 'base64'));
  };
  const done = (name) => {
    out.errors = logs;
    fs.writeFileSync(`${__dirname}/out-${name}.json`, JSON.stringify(out, null, 1));
    console.log(`${out.pass.length} passed, ${out.fail.length} failed, ${logs.length} console errors`);
    out.fail.forEach(f => console.log('  FAIL ' + f));
    logs.slice(0, 5).forEach(l => console.log('  ' + l));
    process.exit(out.fail.length || logs.length ? 1 : 0);
  };
  return { ev, wait, nav, shot, logs, ok, out, done, send };
}
module.exports = { open };
```

- [ ] **Step 2: Smoke-test it against the current build**

```js
/* $SCRATCH/t0.js */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.nav('#/clients'); await h.wait(600);
  h.ok('console renders', (await h.ev(`document.querySelector('.h1')?document.querySelector('.h1').textContent:''`)).length > 0);
  h.ok('version is v194 before we start', (await h.ev(`HV.store.__v`)) === 37, await h.ev(`HV.store.__v`));
  h.done('t0');
})();
```

Run: `cd $SCRATCH && node t0.js`
Expected: `2 passed, 0 failed, 0 console errors`

- [ ] **Step 3: Commit**

The harness lives in the scratchpad, not the repo — nothing to commit. Confirm `git status` shows no change.

---

## Task 1: Term, age and level helpers on core.js

Pure functions with no UI and no store writes. Everything later rests on these.

**Files:**
- Modify: `app/js/core.js:102-130` (immediately after the existing `HV.shape` block)
- Modify: `app/js/data.js:24` (add `termDays` to `SHAPE`)

**Interfaces:**
- Consumes: `HV.shape()`, `HV.store`, `HV.seed` (all exist).
- Produces:
  - `HV.termDays() → number` — the default term length from config
  - `HV.ageOf(client) → number|null`
  - `HV.termOf(client) → { days, startISO, endISO, elapsed, left, pct, ended }`
  - `HV.termLeft(client) → number` (negative once ended)

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t1.js */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  const r = await h.ev(`(()=>{
    const c = { joinedISO:'2026-06-12', dob:'1980-03-04', term:{days:90,startISO:'2026-06-12',renewals:[]} };
    const t = HV.termOf(c);
    return { termDays: HV.termDays(), age: HV.ageOf(c), t: t, left: HV.termLeft(c),
             noTerm: HV.termOf({ joinedISO:'2026-06-12' }).days,
             ageNoDob: HV.ageOf({ age: 41 }) };
  })()`);
  h.ok('HV.termDays reads config', r.termDays === 90, r.termDays);
  h.ok('endISO is start + days', r.t.endISO === '2026-09-10', r.t.endISO);
  h.ok('elapsed + left === days', r.t.elapsed + r.t.left === 90, r.t);
  h.ok('pct is 0..100', r.t.pct >= 0 && r.t.pct <= 100, r.t.pct);
  h.ok('age derives from dob', r.age === 46, r.age);
  h.ok('age falls back to stored c.age', r.ageNoDob === 41, r.ageNoDob);
  h.ok('a client with no term object still gets the config default', r.noTerm === 90, r.noTerm);
  h.ok('termLeft matches termOf.left', r.left === r.t.left, [r.left, r.t.left]);
  h.done('t1');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd $SCRATCH && node t1.js`
Expected: FAIL — `HV.termOf is not a function`

- [ ] **Step 3: Add `termDays` to the seed's SHAPE**

In `app/js/data.js`, the single `SHAPE` literal at line 24:

```js
  const SHAPE = { levels: 7, cycleDays: 11, reviewDay: 9, restDays: [5, 10],
                  meetingDay: 11, termDays: 90,
                  sessions: { fitness: 5, yoga: 3, mind: 1 } };
```

`programShape` is already boot-refilled into the store (`core.js`), so no other wiring is needed.

- [ ] **Step 4: Add the helpers to core.js**

Immediately after the existing `HV.levelList` / `HV.copy` block:

```js
  /* ---- the engagement term: the SECOND clock ----------------------------
     The programme runs 7 levels x 14 days = 98 days. The term a client has
     paid for is 90. They are different clocks and the screen must never let
     them be confused — a client mid-level with two weeks of term left is an
     ordinary state, not an error.
     Config gives the default length; a client may carry their own. */
  HV.termDays = function () { return HV.shape().termDays || 90; };

  function isoPlus(iso, days) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(fromISO, toISO) {
    return Math.round((new Date(toISO + 'T00:00:00') - new Date(fromISO + 'T00:00:00')) / 86400000);
  }
  HV.todayISO = function () { return new Date().toISOString().slice(0, 10); };

  HV.termOf = function (c) {
    const t = (c && c.term) || {};
    const days = t.days || HV.termDays();
    const startISO = t.startISO || (c && c.joinedISO) || HV.todayISO();
    const endISO = isoPlus(startISO, days);
    /* clamp elapsed into the term so a stale start date can't report a
       negative bar or one past 100% */
    const raw = daysBetween(startISO, HV.todayISO());
    const elapsed = Math.max(0, Math.min(days, raw));
    return { days: days, startISO: startISO, endISO: endISO,
             elapsed: elapsed, left: days - raw, pct: Math.round(elapsed / days * 100),
             ended: raw >= days, renewals: t.renewals || [] };
  };
  HV.termLeft = function (c) { return HV.termOf(c).left; };

  /* Age is DERIVED, never typed — two numbers that must agree eventually
     disagree. c.age survives only as the fallback for a record with no dob. */
  HV.ageOf = function (c) {
    if (!c) return null;
    if (!c.dob) return c.age == null ? null : c.age;
    return Math.max(0, Math.floor((Date.now() - new Date(c.dob).getTime()) / 31557600000));
  };
```

- [ ] **Step 5: Syntax-check, then run the test**

```bash
node --check app/js/core.js && node --check app/js/data.js
cd $SCRATCH && node t1.js
```
Expected: `8 passed, 0 failed, 0 console errors`

- [ ] **Step 6: Commit**

```bash
git add app/js/core.js app/js/data.js
git commit -m "feat(core): the engagement term becomes a second clock — HV.termOf/termLeft/ageOf, termDays in programShape"
```

---

## Task 2: The client record grows — 14 fields across seven clients

**Files:**
- Modify: `app/js/data.js:235-530` (the seven client literals), `app/js/data.js:11` (`seedVersion`)

**Interfaces:**
- Produces: every `HV.store.clients[i]` carries `code, designation, gender, address, joinedISO, heightCm, weightKg, status, statusWhy, statusBy, statusAt, email, emailOk, mobile, mobileOk, location, term, log, meetings`.

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t2.js */
const { open } = require('./h');
const F = ['code','designation','gender','address','joinedISO','heightCm','weightKg',
           'status','email','mobile','location','term','log','meetings'];
(async () => {
  const h = await open(8082);
  const r = await h.ev(`(()=>{
    const F=${JSON.stringify(F)};
    return HV.store.clients.map(c=>({
      id:c.id, missing:F.filter(k=>c[k]===undefined),
      sexKept: c.sex !== undefined, genderIsNew: c.gender !== c.sex || c.gender===undefined,
      ageMatches: HV.ageOf(c) === c.age,
      status:c.status, term:c.term, code:c.code }));})()`);
  h.ok('every client has every new field', r.every(c => !c.missing.length),
    r.filter(c => c.missing.length).map(c => c.id + ':' + c.missing));
  h.ok('c.sex survives untouched on every client', r.every(c => c.sexKept), r.map(c => c.id));
  h.ok('derived age agrees with the stored age', r.every(c => c.ageMatches),
    r.filter(c => !c.ageMatches).map(c => c.id));
  h.ok('status is one of active/paused/inactive',
    r.every(c => ['active','paused','inactive'].indexOf(c.status) !== -1), r.map(c => c.status));
  h.ok('the demo shows all three statuses',
    new Set(r.map(c => c.status)).size === 3, r.map(c => c.status));
  h.ok('client codes are unique', new Set(r.map(c => c.code)).size === r.length, r.map(c => c.code));
  h.ok('every term has days and a start', r.every(c => c.term.days && c.term.startISO), r.map(c => c.term));
  h.ok('seedVersion bumped to 38', (await h.ev(`HV.store.__v`)) === 38, await h.ev(`HV.store.__v`));
  h.done('t2');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd $SCRATCH && node t2.js`
Expected: FAIL — every client missing all 14 fields; `seedVersion` still 37.

- [ ] **Step 3: Bump seedVersion**

`app/js/data.js:11` → `HV.seedVersion = 38;`

- [ ] **Step 4: Add the fields to each client, with the load-bearing comment**

Add this comment block immediately above the `clients:` array, then the fields to each of the seven literals. Rajesh shown in full; repeat the shape for the other six with their own values.

```js
    /* ---- the client record --------------------------------------------
       IMPORTANT: `sex` and `gender` are two different fields and must stay
       that way. `sex` is CLINICAL — HV.vitals reads it to choose lab
       reference bands (haemoglobin, ferritin and creatinine have different
       normal ranges for male and female bodies) and the BMR formula uses
       it. `gender` is IDENTITY, and `address` is how this person asked to
       be addressed. Merging them silently moves a client's lab reference
       bands, which nobody notices until it matters.

       `age` is NOT authoritative — HV.ageOf(c) derives it from `dob`. The
       stored number is kept only so a record without a dob still reads. ---- */
```

```js
        id: 'c-rajesh', userId: 'u-cl-rajesh', name: 'Rajesh D.', age: 46, sex: 'M',
        code: 'HV-0142', designation: 'Regional Sales Head',
        gender: 'M', address: 'he/him',
        joinedISO: isoAgo(34), heightCm: 172, weightKg: 84.0,
        status: 'active', statusWhy: '', statusBy: null, statusAt: null,
        email: 'rajesh.d@example.in', emailOk: true, emailBy: 'u-anita', emailAt: msAgo(34 * 1440),
        mobile: '+91 98470 22110', mobileOk: true, mobileBy: 'u-anita', mobileAt: msAgo(34 * 1440),
        location: 'Kochi, Kerala',
        term: { days: 90, startISO: isoAgo(34), renewals: [] },
        log: [], meetings: [],
```

Add the `isoAgo` helper beside the existing `msAgo` / `isoIn` helpers at the top of `data.js`:

```js
  const isoAgo = d => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
```

Values for the other six, chosen so the demo has a story to show:

| Client | code | status | term start | Note |
|---|---|---|---|---|
| `c-sureshp` | HV-0138 | `active` | `isoAgo(61)` | 29 days left — the term bar reads **amber** |
| `c-dev` | HV-0151 | `active` | `isoAgo(20)` | Svayam |
| `c-ananya` | HV-0155 | `paused` | `isoAgo(41)` | `statusWhy: 'Travelling for work — back 1 Sep'`, `statusBy: 'u-anita'` |
| `c-meera` | HV-0149 | `active` | `isoAgo(27)` | `gender: 'F'`, `address: 'she/her'` |
| `c-mathew` | HV-0121 | `inactive` | `isoAgo(96)` | Term **ended** — exercises the *Renew* path |
| `c-nisha` | HV-0160 | `active` | `isoAgo(4)` | Observation client |

Give one client `gender: 'X'` with `address: 'they/them'` so the third gender path is exercised on load — use `c-dev`.

**Each client's `age` must equal `HV.ageOf(c)`.** The seed builds `dob` with the existing `dob(age, offsetDays)` helper, so this already holds; the test asserts it rather than trusting it.

- [ ] **Step 5: Syntax-check and run**

```bash
node --check app/js/data.js && cd $SCRATCH && node t2.js
```
Expected: `8 passed, 0 failed, 0 console errors`

- [ ] **Step 6: Commit**

```bash
git add app/js/data.js
git commit -m "feat(data): the client record grows — code, designation, gender + form of address, term, contact and status (seedVersion 38)

sex stays CLINICAL and separate from the new gender field: HV.vitals
reads it for lab reference bands and the BMR formula uses it. Merging
them would silently move a client's normal ranges."
```

---

## Task 3: `HV.logAct` — the one writer for staff acts

**Files:**
- Modify: `app/js/core.js` (after `HV.termOf`)

**Interfaces:**
- Consumes: `HV.me()`, `HV.save()`.
- Produces: `HV.logAct(client, act, text) → void`. `act` is one of `'status' | 'profile' | 'verify' | 'level' | 'coach' | 'term' | 'note'`.

- [ ] **Step 1: Write the failing test — including persistence, which is the whole point**

```js
/* $SCRATCH/t3.js */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.wait(400);
  await h.ev(`HV.logAct(HV.client('c-rajesh'), 'status', 'Paused — trial')`);
  const before = await h.ev(`(()=>{const e=HV.client('c-rajesh').log[0];
    return {n:HV.client('c-rajesh').log.length, act:e.act, by:e.byId, hasTs:!!e.ts};})()`);
  h.ok('logAct appends one entry', before.n === 1, before);
  h.ok('it stamps the acting user', before.by === 'u-anita', before.by);
  h.ok('it stamps a timestamp', before.hasTs, before);
  /* the real assertion: it survives a reload. An in-memory push that never
     reaches localStorage looks identical until you refresh. */
  await h.send('Page.reload', { ignoreCache: true }); await h.wait(2400);
  const after = await h.ev(`HV.client('c-rajesh').log.length`);
  h.ok('the entry survives a reload', after === 1, after);
  h.done('t3');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd $SCRATCH && node t3.js`
Expected: FAIL — `HV.logAct is not a function`

- [ ] **Step 3: Implement**

```js
  /* ---- the record's running notes --------------------------------------
     Logs is DERIVED from the eight stores that already record things, plus
     this one append-only list for staff acts that have no other home —
     status changes, profile edits, verifications, level moves, coach
     changes, term renewals. Deriving the rest is what lets the demo's
     seeded history appear on first load with no back-fill.
     One writer, so an act can never be recorded two different ways. */
  HV.logAct = function (client, act, text) {
    if (!client) return;
    const me = HV.me();
    client.log = client.log || [];
    client.log.push({ ts: Date.now(), byId: me ? me.id : null, act: act, text: text });
    HV.save();
  };
```

- [ ] **Step 4: Run the test**

```bash
node --check app/js/core.js && cd $SCRATCH && node t3.js
```
Expected: `4 passed, 0 failed, 0 console errors`

- [ ] **Step 5: Commit**

```bash
git add app/js/core.js
git commit -m "feat(core): HV.logAct — one writer for the staff acts that have no other home"
```

---

## Task 4: `HV.markSession` — the writer that must land before any reader

**This is the task the whole calendar switch hinges on.** Against a derived calendar, the three existing mutation sites write to a throwaway object: the toast fires, the counter moves, and the change reverts on the next paint. So the writer and its call sites change **now**, while `HV.store.calendars` still exists, and are verified before anything starts reading derived data.

`markSession` **dual-writes** during the transition: it appends to `c.sessionLog` (the permanent source of truth) *and* mutates the live store calendar item if one is still there. Task 8 removes the store half when `HV.store.calendars` is retired. Without the dual write there is a visible regression between this task and Task 8 — sessions would flip in the log but not on screen.

**Files:**
- Modify: `app/js/core.js` (add `HV.markSession`), `app/js/core.js:972-991` (the reminder-band cancel)
- Modify: `app/js/views/client-plan.js:236-246` (*Can't make it*), `app/js/views/client-plan.js:379-385` (*Mark session done*)

**Interfaces:**
- Consumes: `HV.save()`.
- Produces: `HV.markSession(client, day, pillar, status) → void` where `status` is `'done' | 'cancelled'`; and `HV.sessionStatus(client, day, pillar) → string|null`.

- [ ] **Step 1: Write the failing test — the done/cancel path across a reload**

```js
/* $SCRATCH/t4.js */
const { open } = require('./h');
(async () => {
  const h = await open(8081);
  await h.ev(`HV.login('u-cl-rajesh')`); await h.wait(500);
  await h.ev(`HV.markSession(HV.myClient(), 6, 'fitness', 'done')`);
  const a = await h.ev(`(()=>{const c=HV.myClient();
    const it=(HV.store.calendars[c.id]||[]).find(d=>d.day===6).items.find(i=>i.pillar==='fitness');
    return { log:(c.sessionLog||[]).length, status:HV.sessionStatus(c,6,'fitness'), live:it.status };})()`);
  h.ok('markSession appends to sessionLog', a.log === 1, a);
  h.ok('sessionStatus reads it back', a.status === 'done', a);
  h.ok('it also mutates the live store item (transition dual-write)', a.live === 'done', a);
  await h.send('Page.reload', { ignoreCache: true }); await h.wait(2400);
  const b = await h.ev(`HV.sessionStatus(HV.myClient(),6,'fitness')`);
  h.ok('THE HAZARD: it survives a reload', b === 'done', b);
  const c2 = await h.ev(`(()=>{const c=HV.myClient();HV.markSession(c,7,'yoga','cancelled');
    return HV.sessionStatus(c,7,'yoga');})()`);
  h.ok('cancel writes the same way', c2 === 'cancelled', c2);
  h.ok('the latest entry for a day+pillar wins',
    (await h.ev(`(()=>{const c=HV.myClient();HV.markSession(c,7,'yoga','done');
      return HV.sessionStatus(c,7,'yoga');})()`)) === 'done');
  h.done('t4');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd $SCRATCH && node t4.js`
Expected: FAIL — `HV.markSession is not a function`

- [ ] **Step 3: Implement the writer**

```js
  /* ---- session status: the client's own record of what they did --------
     Lives on the CLIENT record, mirroring sessionFeedback / moodLog /
     weightLog, because it is the client's history and must outlive any
     calendar that draws it.

     THE HAZARD this exists to solve: once the calendar is derived, a screen
     that writes `it.status = 'done'` is writing to a throwaway object. The
     toast fires, the counter moves, and the next paint reverts it. This is
     the only writer, and the three sites that used to mutate an item now
     call it.

     During the switch it ALSO mutates the live store item, so nothing
     regresses between this landing and the readers moving over. That half
     goes away with HV.store.calendars. */
  HV.markSession = function (client, day, pillar, status) {
    if (!client) return;
    client.sessionLog = client.sessionLog || [];
    client.sessionLog.push({ cy: client.cycle, d: day, pillar: pillar, status: status, ts: Date.now() });
    const live = ((HV.store.calendars || {})[client.id] || []).find(x => x.day === day);
    if (live) {
      const it = (live.items || []).find(x => x.pillar === pillar);
      if (it) it.status = status;
    }
    HV.save();
  };

  /* the latest word on one session — last entry wins, so a client who
     cancels and then does it anyway ends up 'done' */
  HV.sessionStatus = function (client, day, pillar) {
    const log = (client && client.sessionLog) || [];
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.cy === client.cycle && e.d === day && e.pillar === pillar) return e.status;
    }
    return null;
  };
```

- [ ] **Step 4: Switch *Mark session done* (`client-plan.js:381`)**

```js
        if (doneBtn) doneBtn.addEventListener('click', function () {
          HV.markSession(client, dayN, it.pillar, 'done');
          if (s[sk]) s[sk].done += 1;
          HV.save();
```

(Only the first line changes; `it.status = 'done'` is removed.)

- [ ] **Step 5: Switch *Can't make it* (`client-plan.js:237`)**

```js
        sheet.querySelector('[data-cancel]').addEventListener('click', function () {
          HV.markSession(client, dayN, it.pillar, 'cancelled');
          var s = client.sessions || {};
```

- [ ] **Step 6: Switch the reminder-band exit (`core.js:978`)**

```js
          const today = (HV.store.calendars[c.id] || []).find(d => d.today) || null;
          const items = today ? (today.items || []) : [];
          const it = items.find(x => (!pillar || x.pillar === pillar) &&
            x.status !== 'done' && x.status !== 'cancelled') || null;
          if (it) HV.markSession(c, today.day, it.pillar, 'cancelled');
```

- [ ] **Step 7: Run the test, and walk the path by hand**

```bash
node --check app/js/core.js && node --check app/js/views/client-plan.js
cd $SCRATCH && node t4.js
```
Expected: `6 passed, 0 failed, 0 console errors`

- [ ] **Step 8: Commit**

```bash
git add app/js/core.js app/js/views/client-plan.js
git commit -m "feat(core): HV.markSession lands BEFORE any derived reader — the revert-on-repaint hazard, closed

Three sites used to mutate a calendar item's status directly. Against a
derived calendar those write to a throwaway object: the toast fires, the
counter moves, and the next paint reverts it. markSession appends to
c.sessionLog and is now the only writer; it dual-writes the live store
item so nothing regresses before the readers move over."
```

---

## Task 5: `HV.calendarFor` — the derived calendar

**Files:**
- Modify: `app/js/core.js` (after `HV.markSession`)

**Interfaces:**
- Consumes: `HV.assignment(client, pillar)`, `HV.slotsFor(client, pillar, day)`, `HV.specFor(p)`, `HV.staffFor(c, roleKey)`, `HV.shape()`, `HV.sessionStatus`, `HV.fmtMonthDay` (all exist).
- Produces: `HV.calendarFor(client, opts) → [{ day, date, items:[{pillar,label,time,staffId,status}], meals:[…], rest, review, meeting, today }]`, always `cycleDays` entries.

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t5.js */
const { open } = require('./h');
(async () => {
  const h = await open(8081);
  await h.ev(`HV.login('u-cl-rajesh')`); await h.wait(500);
  const r = await h.ev(`(()=>{const c=HV.myClient(); const cal=HV.calendarFor(c);
    const seeded=HV.store.calendars[c.id]||[];
    return { n:cal.length, days:HV.cycleDays(),
      today:cal.filter(d=>d.today).length,
      pillars:[...new Set(cal.flatMap(d=>d.items.map(i=>i.pillar)))],
      mealsOutOfItems: cal.every(d=>d.items.every(i=>i.pillar!=='culture')),
      hasMeals: cal.some(d=>(d.meals||[]).length>0),
      staffMatch: seeded.every(sd=>{ const dd=cal.find(x=>x.day===sd.day); if(!dd) return false;
        return (sd.items||[]).every(si=>{ const di=(dd.items||[]).find(x=>x.pillar===si.pillar);
          return !di || di.staffId===si.staffId; }); }),
      rest: cal.filter(d=>d.rest).map(d=>d.day),
      review: cal.filter(d=>d.review).map(d=>d.day),
      meeting: cal.filter(d=>d.meeting).map(d=>d.day),
      allDated: cal.every(d=>!!d.date),
      empty: HV.calendarFor(HV.client('c-nisha')).length };})()`);
  h.ok('always returns the full N-day skeleton', r.n === r.days, r);
  h.ok('an unassigned client still gets a skeleton, never []', r.empty === r.days, r.empty);
  h.ok('exactly one day is today', r.today === 1, r.today);
  h.ok('RULE 1: culture never leaks into items', r.mealsOutOfItems, r.pillars);
  h.ok('RULE 1: the plate lives in its own meals[]', r.hasMeals, r);
  h.ok('RULE 2: only known pillar keys reach items',
    r.pillars.every(p => ['fitness','yoga','wellness'].indexOf(p) !== -1), r.pillars);
  h.ok('staffId reproduces every seeded value', r.staffMatch, r);
  h.ok('rest days come from programShape', JSON.stringify(r.rest) === JSON.stringify(HV_REST), r.rest);
  h.ok('every day carries a date', r.allDated, r);
  h.done('t5');
})();
```

Add near the top of the file, after `open`:
```js
const HV_REST = [5, 10];   /* programShape.restDays at the time this task runs */
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd $SCRATCH && node t5.js`
Expected: FAIL — `HV.calendarFor is not a function`

- [ ] **Step 3: Implement**

```js
  /* ---- the derived calendar — the pass between kitchen and dining room --
     A client's cycle is the UNION of their assigned per-pillar templates.
     Nothing is hand-seeded any more: the coach assigns a template, and this
     is what turns it into the days the client sees. (This is finding F2.)

     THREE RULES, all load-bearing:

     1. items[] is SESSIONS ONLY; the plate gets its own meals[]. Three meals
        a day inside items breaks five readers at once — dayDone would demand
        three meals be ticked before the day-complete celebration fires,
        dayKept would kill every streak, and HV.coachBrief would announce
        "Next session: Breakfast".
     2. Filter to KNOWN pillar keys. client-plan.js does
        HV.PILLARS[it.pillar].name unguarded, so one 'motivation' slot
        leaking into items is a TypeError that blanks My Plan.
     3. ALWAYS return the full N-day skeleton, never []. An empty array is
        what quietly breaks things: cal.findIndex(d => d.today) returns -1,
        which silently removes Join buttons and the meal counter, and opens
        the Nutrient Panel on day 1 instead of today. */
  const CAL_ROLE = { culture: 'dietitian', fitness: 'fitness', yoga: 'yoga', wellness: 'mind' };
  const CAL_SESSION = ['fitness', 'yoga', 'wellness'];   /* rule 2, in one place */
  let calCache = { key: null, val: null };

  HV.calendarFor = function (client, opts) {
    if (!client) return [];
    const cycle = (opts && opts.cycle) || client.cycle;
    const key = client.id + '|' + cycle + '|' + client.day;
    if (calCache.key === key) return calCache.val;

    const shape = HV.shape();
    const n = shape.cycleDays;
    const rest = shape.restDays || [];
    const out = [];
    for (let d = 1; d <= n; d++) {
      const items = [], meals = [];
      CAL_SESSION.forEach(function (p) {
        HV.slotsFor(client, p, d).forEach(function (slot) {
          items.push({
            pillar: p,
            label: slot.label || HV.specFor(p).slotWord,
            time: slot.time || '',
            staffId: HV.staffFor(client, CAL_ROLE[p]).id,
            status: HV.sessionStatus(client, d, p) ||
              (d < client.day ? 'done' : d === client.day ? 'today' : 'planned'),
            slot: slot,
          });
        });
      });
      HV.slotsFor(client, 'culture', d).forEach(function (slot) { meals.push(slot); });

      const day = {
        day: d, items: items, meals: meals,
        date: HV.fmtMonthDay(new Date(Date.now() + (d - client.day) * 86400000)),
        today: d === client.day,
        rest: rest.indexOf(d) !== -1 && !items.length,
        review: d === shape.reviewDay,
        meeting: d === shape.meetingDay,
      };
      out.push(day);
    }
    calCache = { key: key, val: out };
    return out;
  };
  HV.clearCalCache = function () { calCache = { key: null, val: null }; };
```

- [ ] **Step 4: Clear the cache where the world changes**

In `HV.save()`, add `calCache = { key: null, val: null };` as the first line. In the router's `render()`, add `HV.clearCalCache();` before the view renders. A stale cache after a template edit is the classic "my change didn't do anything".

- [ ] **Step 5: Check `HV.fmtMonthDay` exists and takes a Date**

```bash
grep -n "HV.fmtMonthDay" app/js/core.js
```
If it takes something else, adapt the call — do not add a second date formatter.

- [ ] **Step 6: Run the test**

```bash
node --check app/js/core.js && cd $SCRATCH && node t5.js
```
Expected: `9 passed, 0 failed, 0 console errors`

- [ ] **Step 7: Commit**

```bash
git add app/js/core.js
git commit -m "feat(core): HV.calendarFor — the client's cycle is the union of their assigned templates"
```

---

## Task 6: `HV.plateFor` — and the single call-site change that closes F2 for Nutrition

**Files:**
- Modify: `app/js/core.js` (add `HV.plateFor`), `app/js/core.js:2417` (the `HV.tasks` culture branch)

**Interfaces:**
- Consumes: `HV.calendarFor`, `HV.store.mealPlans`, `HV.slotSum`, `HV.doseOf`.
- Produces: `HV.plateFor(client, day) → { slots: [{ slot, time, dish, kcal, protein, photo, parts, note, swap }] } | null` — the exact shape `HV.tasks` already consumes.

`mealPlans` **stays**: it carries the Nutrient Panel's daily kcal/protein targets, the fibre→protein→carbs `parts` teaching order, and the human-voiced `swap` line — none of which a template slot has. `plateFor` prefers the assigned template and falls back to `mealPlans`.

- [ ] **Step 1: Write the failing test — this is the F2 walk**

```js
/* $SCRATCH/t6.js */
const { open } = require('./h');
(async () => {
  const h = await open(8081);
  await h.ev(`HV.login('u-cl-rajesh')`); await h.wait(500);
  const r = await h.ev(`(()=>{const c=HV.myClient();
    const p=HV.plateFor(c,c.day); const t=HV.tasks(c);
    const fb=HV.plateFor(HV.client('c-nisha'),1);
    return { slots:(p&&p.slots||[]).length, keys:Object.keys((p&&p.slots||[{}])[0]||{}),
             tasksCulture:t.culture.length,
             titles:t.culture.map(x=>x.title),
             fallback: !!(fb && fb.slots && fb.slots.length) };})()`);
  h.ok('plateFor returns the mealPlans slot shape',
    ['slot','time','dish','kcal','protein'].every(k => r.keys.indexOf(k) !== -1), r.keys);
  h.ok('HV.tasks culture now reads through plateFor', r.tasksCulture === r.slots, r);
  h.ok('every plate slot names a dish', r.titles.every(t => t && t.length), r.titles);
  h.ok('a client with no Nutrition template falls back to mealPlans', r.fallback, r);
  h.done('t6');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `HV.plateFor is not a function`

- [ ] **Step 3: Implement**

```js
  /* ---- the plate ---------------------------------------------------------
     mealPlans STAYS. It carries three things a template slot does not: the
     per-slot kcal/protein the Nutrient Panel uses as daily targets, the
     fibre → protein → carbs `parts` teaching order, and the human-voiced
     `swap` line. So the assigned template supplies WHAT and WHEN, and
     mealPlans supplies the teaching around it.

     Pointing HV.tasks' culture branch at this is the single call-site change
     that closes F2 for Nutrition — Today, My Plan and the task sheets all
     already read HV.tasks(client).culture. */
  HV.plateFor = function (client, day) {
    const fallback = (HV.store.mealPlans && HV.store.mealPlans[client.id]) || null;
    const slots = HV.slotsFor(client, 'culture', day);
    if (!slots.length) return fallback;

    const byName = {};
    ((fallback && fallback.slots) || []).forEach(function (s) { byName[s.slot] = s; });

    return { slots: slots.map(function (s) {
      const ref = byName[s.label] || {};
      const sum = HV.slotSum(s);
      const dish = (s.options || []).map(function (grp) {
        return grp.map(function (id) {
          const lib = (HV.store.catalog && HV.store.catalog.culture) || [];
          const it = lib.find(function (x) { return x.id === id; });
          return it ? it.name : id;
        }).join(' + ');
      }).join(' or ');
      return {
        slot: s.label || 'Meal',
        time: s.time || ref.time || '',
        dish: dish || ref.dish || '',
        /* summed from the catalogue, never typed — a coach who edits a total
           by hand has made a claim rather than a reading */
        kcal: sum.kcal || ref.kcal || 0,
        protein: sum.protein || ref.protein || 0,
        photo: ref.photo || false,
        parts: ref.parts || null,
        note: HV.doseOf(s, 'culture', 'note') || ref.note || '',
        swap: ref.swap || '',
      };
    }) };
  };
```

- [ ] **Step 4: Point `HV.tasks` at it — one line**

`core.js:2417`:

```js
    const plan = HV.plateFor(client, client.day);
```

(replacing `const plan = HV.store.mealPlans && HV.store.mealPlans[client.id];`). Everything below it is unchanged.

- [ ] **Step 5: Run the test**

```bash
node --check app/js/core.js && cd $SCRATCH && node t6.js
```
Expected: `4 passed, 0 failed, 0 console errors`

- [ ] **Step 6: Commit**

```bash
git add app/js/core.js
git commit -m "feat(core): HV.plateFor — the assigned Nutrition template reaches the client's plate (F2, for Nutrition)"
```

---

## Task 7: Seed a Nutrition template onto every client, and give fitness slots real labels

The derived calendar reads slot labels straight through. Seeded fitness templates whose slots are all called "Session" would turn the hand-written *"Strength (bands) II"* into a wall of identical rows — a visible regression dressed as a data change.

**Files:**
- Modify: `app/js/data.js` (the seven template literals and `seed.clientPlans`)

**Interfaces:**
- Produces: every non-observation client has all five pillars in `HV.store.clientPlans[cid]`.

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t7.js */
const { open } = require('./h');
(async () => {
  const h = await open(8081);
  const r = await h.ev(`(()=>{
    return HV.store.clients.filter(c=>!c.observation).map(c=>{
      const cal=HV.calendarFor(c);
      return { id:c.id,
        pillars:HV.TPL_PILLARS.filter(p=>!!HV.assignment(c,p)),
        labels:[...new Set(cal.flatMap(d=>d.items.map(i=>i.label)))],
        mealDays:cal.filter(d=>(d.meals||[]).length>0).length,
        sessionDays:cal.filter(d=>d.items.length>0).length };});})()`);
  h.ok('every active client has a Nutrition template',
    r.every(c => c.pillars.indexOf('culture') !== -1), r.map(c => [c.id, c.pillars]));
  h.ok('the plate is set on most days', r.every(c => c.mealDays >= 9), r.map(c => [c.id, c.mealDays]));
  h.ok('sessions do not run every day (blank days are legitimate)',
    r.every(c => c.sessionDays < c.mealDays), r.map(c => [c.id, c.sessionDays, c.mealDays]));
  h.ok('session labels are varied, not all "Session"',
    r.every(c => c.labels.length >= 3), r.map(c => [c.id, c.labels]));
  h.done('t7');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — most clients have no `culture` assignment; labels collapse to one or two values.

- [ ] **Step 3: Give the seeded fitness/yoga/wellness template slots real labels**

In `genTemplate`'s `day(d)` callbacks, name each slot the way the retired hand-seeded calendar did — *Strength (bands)*, *Mobility + cardio*, *Cardio intervals*, *Assessment-lite*, *Hatha basics*, *Breath & spine*, *Flow & balance*, *Recovery flow*, *Mind session*. The label is what the client reads on My Plan.

- [ ] **Step 4: Extend `seed.clientPlans` to every non-observation client**

Each gets all five pillars pointed at the template matching their `levels[pillar]` and `track`. Where no exact template exists, point at the nearest seeded one — a demo with a Level-4 client on a Level-2 template is honest about the library being small; a demo with no template at all is a blank screen.

Leave `c-nisha` (observation) with **no** assignments — Task 12's empty-state test needs a client who genuinely has none.

Keep `c-dev` (Svayam) at three pillars, not five, so the partial-assignment path is exercised on load.

- [ ] **Step 5: Run the test**

```bash
node --check app/js/data.js && cd $SCRATCH && node t7.js && node t5.js && node t6.js
```
Expected: t7 `4 passed`, and t5/t6 still green.

- [ ] **Step 6: Commit**

```bash
git add app/js/data.js
git commit -m "feat(data): every client carries per-pillar assignments, and template slots wear the labels the client reads"
```

---

## Task 8: Switch the twelve readers, rewrite `dayOf`, delete the two writers

Only now, with the writer landed and verified, does anything start reading derived data.

**Files:**
- Modify: `app/js/views/client-plan.js:44, 62-67, 671, 1148, 1236`
- Modify: `app/js/views/client-today.js:419, 436`
- Modify: `app/js/views/client-trackers.js:646, 1008`
- Modify: `app/js/core.js:974, 2811`
- Modify: `app/js/views/console-clients.js:508`
- Modify: `app/js/views/console-pipeline.js:1067` (delete), `app/js/views/client-onboard.js:1274` (delete)

**Interfaces:**
- Consumes: `HV.calendarFor(client)`.

- [ ] **Step 1: Write the failing test — the full client walk**

```js
/* $SCRATCH/t8.js */
const { open } = require('./h');
const R = ['#/today','#/plan','#/trackers','#/journey','#/profile'];
(async () => {
  const h = await open(8081);
  for (const who of ['u-cl-rajesh','u-cl-dev','u-cl-nisha']) {
    await h.ev(`HV.login(${JSON.stringify(who)})`); await h.wait(500);
    for (const r of R) {
      await h.nav(r);
      const len = await h.ev(`document.querySelector('main')?document.querySelector('main').textContent.trim().length:0`);
      h.ok(who + ' ' + r + ' renders', len > 300, len);
    }
  }
  await h.ev(`HV.login('u-cl-rajesh')`); await h.nav('#/plan'); await h.wait(600);
  const src = await h.ev(`(()=>{
    const c=HV.myClient();
    return { storeGone: !HV.store.calendars || !HV.store.calendars[c.id],
             derived: HV.calendarFor(c).length,
             dayOfWorks: (()=>{const cal=HV.calendarFor(c);const it=cal.flatMap(d=>d.items)[0];
               const d=HV.calendarFor(c).find(x=>(x.items||[]).indexOf(it)>=0); return !!d;})() };})()`);
  h.ok('nothing reads HV.store.calendars any more',
    (await h.ev(`Object.keys(HV.store.calendars||{}).length`)) === 0, await h.ev(`Object.keys(HV.store.calendars||{}).length`));
  h.ok('dayOf finds a day against the derived graph', src.dayOfWorks, src);
  h.done('t8');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: some routes render, but `HV.store.calendars` is still populated and `dayOf` fails.

- [ ] **Step 3: Rewrite `dayOf` — it cannot work by identity**

`client-plan.js:61-67`. The old version finds a day by `items.indexOf(it)`. Against a freshly derived graph that returns `-1` and the function returns `null` — and **every caller is null-tolerant, so it fails silently**.

```js
  /* the calendar day that holds this item. Identity worked while items were
     the live store objects; a derived calendar builds fresh objects on every
     call, so the day is carried on the item instead. */
  function dayOf(client, it) {
    if (!it) return null;
    var cal = HV.calendarFor(client);
    for (var i = 0; i < cal.length; i++) {
      if ((cal[i].items || []).indexOf(it) >= 0) return cal[i];
    }
    return it.day != null ? cal.find(function (d) { return d.day === it.day; }) || null : null;
  }
```

And stamp `day: d` onto each item inside `HV.calendarFor` (add it to the pushed object in Task 5's loop) so the fallback has something to match on.

- [ ] **Step 4: Switch the ten remaining readers**

Each is the same mechanical change:

```js
var cal = HV.store.calendars[client.id] || [];      // before
var cal = HV.calendarFor(client);                    // after
```

Sites: `client-plan.js:44, 671, 1148, 1236`; `client-today.js:419, 436`; `client-trackers.js:646, 1008`; `core.js:974`; `core.js:2811`; `console-clients.js:508`.

**Leave `calendarsPast` and `proposedCalendars` alone.** Past cycles record what happened at a different level, often under a different template — deriving them from today's assignment would be a lie.

- [ ] **Step 5: Delete the two writers**

`console-pipeline.js:1067` (`s.calendars[clone.id] = [];`) and `client-onboard.js:1274` (`HV.store.calendars[clone.id] = [];`) — both delete outright. A promoted client's calendar now derives from whatever their coaches assign, and an unassigned client correctly gets an empty skeleton rather than an empty array.

- [ ] **Step 6: Drop `calendars` from the seed and the boot refill**

Remove `seed.calendars` (`data.js:614`) and any mention of `calendars` in the boot-refill list in `core.js`. This is the change the test's `storeGone` assertion is watching for.

- [ ] **Step 7: Remove the transition dual-write**

In `HV.markSession`, delete the `const live = …` block — `HV.store.calendars` no longer exists, and leaving dead code that mutates a missing store invites a future reader to believe it matters.

- [ ] **Step 8: Run everything**

```bash
for f in core data views/client-plan views/client-today views/client-trackers \
         views/console-clients views/console-pipeline views/client-onboard; do
  node --check app/js/$f.js || echo "SYNTAX FAIL $f"; done
cd $SCRATCH && node t4.js && node t5.js && node t6.js && node t7.js && node t8.js
```
Expected: all green, `0 console errors`. **t4 passing here is the real prize** — the mutation path still survives a reload now that the calendar is derived.

- [ ] **Step 9: Commit**

```bash
git add app/js
git commit -m "feat(client): the calendar is derived — finding F2 closed

Twelve readers switch to HV.calendarFor, two hand-seed writers are
deleted, and dayOf is rewritten: it found a day by items.indexOf(it),
which cannot work against a freshly derived graph, and every caller is
null-tolerant so it would have failed silently."
```

---

## Task 9: The dashboard counts

**Files:**
- Modify: `app/js/views/console-digest.js:272-290`

**Interfaces:**
- Consumes: `HV.myClients()` — already role-scoped (`core.js:225`): Ops and Admin get everyone via `seeAllClients`, a HoD their department, a coach their pod. No new permission.

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t9.js */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  for (const who of ['u-anita','u-sureshk','u-vikram','u-kavya']) {
    await h.ev(`HV.login(${JSON.stringify(who)})`); await h.nav('#/home'); await h.wait(700);
    const r = await h.ev(`(()=>{const cs=HV.myClients();
      const n=s=>cs.filter(c=>c.status===s).length;
      const card=document.querySelector('[data-roster]');
      return { total:cs.length, a:n('active'), p:n('paused'), i:n('inactive'),
               shown: card?card.textContent.replace(/\\s+/g,' '):null };})()`);
    h.ok(who + ': total = active + paused + inactive', r.total === r.a + r.p + r.i, r);
    h.ok(who + ': the card is on the dashboard', !!r.shown, r);
    h.ok(who + ': the card shows the true total', (r.shown || '').indexOf(String(r.total)) !== -1, r);
  }
  h.done('t9');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — no `[data-roster]` element.

- [ ] **Step 3: Implement**

In `dashHtml`, above the existing `head` row:

```js
    /* Your people, by status. HV.myClients() is already role-scoped, so
       every role sees a true count of THEIR people with no new permission
       and no new access logic.
       Paused counts separately from Inactive on purpose (TJ, 17 Aug): a
       paused client is coming back and an inactive one is not, and rolling
       them together hides the only number a win-back call acts on. */
    var byStatus = function (s) { return clients.filter(function (c) { return c.status === s; }).length; };
    var roster = '<div class="card" data-roster>' +
      '<span class="k">YOUR PEOPLE</span>' +
      '<div class="grid4" style="margin-top:var(--s3)">' +
        rosterStat('Total', clients.length, '#/clients', '') +
        rosterStat('Active', byStatus('active'), '#/clients/status/active', 'ok') +
        rosterStat('Paused', byStatus('paused'), '#/clients/status/paused', 'warn') +
        rosterStat('Inactive', byStatus('inactive'), '#/clients/status/inactive', 'bad') +
      '</div></div>';
```

```js
  /* one number, its word, and where tapping it goes */
  function rosterStat(label, n, goto, tone) {
    return '<button class="stat click" data-goto="' + goto + '">' +
      '<b class="num' + (tone ? ' ' + tone : '') + '">' + n + '</b>' +
      '<small>' + HV.esc(label) + '</small></button>';
  }
```

Return `roster + head + ops + …`. Add `.grid4` to `app.css` beside the existing `.grid2`/`.grid3` if it is not already there.

- [ ] **Step 4: Run the test**

```bash
node --check app/js/views/console-digest.js && cd $SCRATCH && node t9.js
```
Expected: `12 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-digest.js app/css/app.css
git commit -m "feat(console): the dashboard counts the roster by status — Total, Active, Paused, Inactive"
```

---

## Task 10: The record file — Profile and Medical Details

**Files:**
- Create: `app/js/views/console-client-record.js`
- Modify: `app/index.html` (script tag), `app/sw.js` (`ASSETS`)
- Modify: `app/js/views/console-clients.js:637-641` (`overviewHtml`)
- Modify: `app/css/app.css`

**Interfaces:**
- Produces: `HV.clientRecord = { profileHtml(c), medicalHtml(c), logsHtml(c), meetingsHtml(c), wire(el, c) }`. Consumers call in only inside `render()` — the same load-order contract as `HV.consoleui` (`console-clients.js:96`) and `HV.chatui`.
- Consumes: `HV.ageOf`, `HV.termOf`, `HV.logAct`, `HV.can('rawRecords')`, `HV.store.healthSummaries`, `HV.ui.avatar/pill/icon`.

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t10.js */
const { open } = require('./h');
const FIELDS = ['Client id','Designation','Gender','Joining date','Age','Height','Weight',
                'Status','Email','Mobile','Date of birth','Location','Plan'];
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.wait(400);
  for (const cid of ['c-rajesh','c-ananya','c-dev','c-mathew']) {
    await h.nav('#/clients/' + cid + '/overview'); await h.wait(700);
    const r = await h.ev(`(()=>{const p=document.querySelector('[data-profile]');
      const t=p?p.textContent.replace(/\\s+/g,' '):'';
      return { has:!!p, txt:t, undef:/undefined|null|NaN/.test(t),
               med:!!document.querySelector('[data-medical]') };})()`);
    h.ok(cid + ': profile card renders', r.has, r.has);
    h.ok(cid + ': no undefined/null/NaN leaks into the card', !r.undef, r.txt.slice(0, 200));
    h.ok(cid + ': every field label is present',
      FIELDS.every(f => r.txt.toLowerCase().indexOf(f.toLowerCase()) !== -1),
      FIELDS.filter(f => r.txt.toLowerCase().indexOf(f.toLowerCase()) === -1));
    h.ok(cid + ': medical section renders', r.med, r.med);
  }
  /* the RBAC half: only the Doctor reaches raw records */
  await h.ev(`HV.login('u-vikram')`); await h.nav('#/clients/c-rajesh/overview'); await h.wait(700);
  h.ok('a trainer sees no raw-record button',
    (await h.ev(`!document.querySelector('[data-raw]')`)) === true);
  await h.ev(`HV.login('u-kavya')`); await h.nav('#/clients/c-rajesh/overview'); await h.wait(700);
  h.ok('the Doctor does', (await h.ev(`!!document.querySelector('[data-raw]')`)) === true);
  h.done('t10');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — no `[data-profile]` element on any client.

- [ ] **Step 3: Create the file with its header and export**

```js
/* HAALVING console — the client record: the four surfaces that make a client's
   file a file rather than a dashboard. Profile is the cover sheet, Medical
   Details the signed summary (raw records stay Doctor-only), Logs the running
   notes, Meetings the ward-round minutes.

   Split out of console-clients.js, which keeps the rail, the header, the
   three-panel shell and the other five tabs. Exports HV.clientRecord on the
   same contract as HV.consoleui and HV.chatui: consumers call these inside
   render() only, so script-tag order never matters. */
(function () {
  'use strict';

  var GENDER = { M: 'Male', F: 'Female', X: 'Other' };

  function row(label, value, extra) {
    return '<div class="crrow"><small>' + HV.esc(label) + '</small>' +
      '<b>' + (value == null || value === '' ? '<span class="pdim">—</span>' : value) + '</b>' +
      (extra || '') + '</div>';
  }
  …
  HV.clientRecord = { profileHtml: profileHtml, medicalHtml: medicalHtml,
                      logsHtml: logsHtml, meetingsHtml: meetingsHtml, wire: wire };
}());
```

- [ ] **Step 4: Write `profileHtml`**

A `.card` containing `HV.ui.avatar(c.name, 'lg')`, the name and designation, then a two-column `.crgrid` of `row()` calls in the order the client asked for: Client id (`c.code`, with `c.id` in an `.audit` line), Name, Designation, Gender (`GENDER[c.gender]` + `c.address` when set), Joining date, Age (`HV.ageOf(c)`, `class="num"`), Height, Weight, Status, Email, Mobile, Date of birth, Location, Plan.

Status renders as `HV.ui.pill` — `ok` for active, `warn` for paused, `bad` for inactive — followed by `c.statusWhy` in an `.audit` line when set. Email and Mobile each carry a verified tick or an **Unverified** pill plus a `[data-verify="email"]` button, gated on `HV.can('editClient') || HV.can('seeAllClients')`.

**The typed-weight guard**: under Weight, when `c.weightLog` has an entry, an `.audit` caption reading `latest weigh-in 81.4 kg · Day 8, cycle 2`. The field stays typed and editable; the caption only ensures the card can never silently contradict Trackers.

- [ ] **Step 5: Write `medicalHtml`**

Lift the existing body of `documentsHtml` (`console-clients.js:916-946`) — it already enforces the rule exactly: raw records behind `HV.can('rawRecords')` with `data-raw` and an audit note, signed `healthSummaries` chips otherwise. Wrap it in `<div data-medical>`. **Do not write a second policy.** The Documents tab keeps calling the original.

- [ ] **Step 6: Register the file in all three places**

`app/index.html`, beside the other console views:
```html
<script src="js/views/console-client-record.js?v=195"></script>
```
`app/sw.js` `ASSETS` array:
```js
  'js/views/console-client-record.js',
```

- [ ] **Step 7: Call it from `overviewHtml`**

```js
  function overviewHtml(c) {
    var me = HV.me();
    return HV.clientRecord.profileHtml(c) + goalCard(c) + careTeamCard(c) +
      HV.clientRecord.medicalHtml(c) + sessionsCard(c, me) + onboardingCard(c) +
      '<div class="sec-title">Recent activity</div>' + timelineHtml(c);
  }
```

- [ ] **Step 8: Add the CSS**

```css
/* ---------------------------------------------------- the client record */
.crgrid{display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:var(--s3) var(--s5);
  margin-top:var(--s4)}
.crrow{display:flex; flex-direction:column; gap:2px; min-width:0}
.crrow > small{font-size:var(--t-micro); letter-spacing:.08em; text-transform:uppercase; color:var(--ink-3)}
.crrow > b{font-size:var(--t-sm); font-weight:600; color:var(--ink); overflow-wrap:anywhere}
```

- [ ] **Step 9: Run the test**

```bash
node --check app/js/views/console-client-record.js && node --check app/js/views/console-clients.js
cd $SCRATCH && node t10.js
```
Expected: `18 passed, 0 failed, 0 console errors`

- [ ] **Step 10: Look at it**

```js
/* append to t10.js before h.done */
await h.ev(`HV.login('u-anita')`); await h.nav('#/clients/c-rajesh/overview'); await h.wait(900);
await h.shot(`${__dirname}/v195-profile.png`);
```
Read the PNG. Assertions pass on markup that reads badly — the last two rounds each caught a copy defect this way that every test missed.

- [ ] **Step 11: Commit**

```bash
git add app/js/views/console-client-record.js app/js/views/console-clients.js \
        app/index.html app/sw.js app/css/app.css
git commit -m "feat(console): the client record gets a cover sheet — Profile and Medical Details in their own file"
```

---

## Task 11: Editing the record — status, profile, verification

**Files:**
- Modify: `app/js/views/console-client-record.js`

**Interfaces:**
- Consumes: `HV.sheet`, `HV.closeSheet`, `HV.toast`, `HV.refresh`, `HV.logAct`, `HV.save`.
- Produces: `wire(el, c)` — one delegated listener handling `[data-editprofile]`, `[data-status]`, `[data-verify]`.

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t11.js */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.nav('#/clients/c-rajesh/overview'); await h.wait(700);
  await h.ev(`document.querySelector('[data-status]').click()`); await h.wait(400);
  h.ok('the status sheet opens', (await h.ev(`!!document.querySelector('.sheet [data-st-save]')`)));
  h.ok('Save is disabled while the reason is blank',
    (await h.ev(`document.querySelector('.sheet [data-st-save]').disabled`)) === true);
  await h.ev(`(()=>{const s=document.querySelector('.sheet');
    s.querySelector('[data-st-val="paused"]').click();
    const t=s.querySelector('[data-st-why]'); t.value='Travel'; t.dispatchEvent(new Event('input'));})()`);
  await h.wait(200);
  h.ok('Save enables once a reason is given',
    (await h.ev(`document.querySelector('.sheet [data-st-save]').disabled`)) === false);
  await h.ev(`document.querySelector('.sheet [data-st-save]').click()`); await h.wait(500);
  const r = await h.ev(`(()=>{const c=HV.client('c-rajesh');
    return { s:c.status, why:c.statusWhy, by:c.statusBy, log:(c.log||[]).length,
             lastAct:(c.log||[]).slice(-1)[0] };})()`);
  h.ok('status is written', r.s === 'paused', r);
  h.ok('the reason is written', r.why === 'Travel', r);
  h.ok('the acting user is stamped', r.by === 'u-anita', r);
  h.ok('it writes exactly one log line', r.log === 1 && r.lastAct.act === 'status', r);
  /* verification */
  await h.nav('#/clients/c-dev/overview'); await h.wait(600);
  await h.ev(`(()=>{const c=HV.client('c-dev'); c.emailOk=false; HV.save();})()`);
  await h.ev(`HV.refresh()`); await h.wait(500);
  await h.ev(`document.querySelector('[data-verify="email"]').click()`); await h.wait(400);
  const v = await h.ev(`(()=>{const c=HV.client('c-dev');
    return { ok:c.emailOk, by:c.emailBy, log:(c.log||[]).filter(e=>e.act==='verify').length };})()`);
  h.ok('verify marks the field', v.ok === true, v);
  h.ok('verify names who marked it', v.by === 'u-anita', v);
  h.ok('verify writes a log line', v.log === 1, v);
  h.done('t11');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — no `[data-status]` button.

- [ ] **Step 3: Implement the status sheet**

```js
  var STATUS = [
    { k: 'active',   t: 'Active',   tone: 'ok'   },
    { k: 'paused',   t: 'Paused',   tone: 'warn' },
    { k: 'inactive', t: 'Inactive', tone: 'bad'  },
  ];
  var stPick = null;

  /* A status nobody can explain is worse than no status at all — so the
     reason is mandatory and Save stays disabled without one. */
  function statusSheet(c) {
    stPick = c.status;
    HV.sheet(
      '<div class="h2">Set status</div>' +
      '<p class="sub" style="margin:0">A paused client is coming back; an inactive one is not. Both need a reason on the record.</p>' +
      '<div class="tfil" role="group" aria-label="Status" style="margin-top:var(--s4)">' +
        STATUS.map(function (s) {
          return '<button data-st-val="' + s.k + '" class="' + (c.status === s.k ? 'on' : '') + '">' +
            HV.esc(s.t) + '</button>';
        }).join('') +
      '</div>' +
      '<textarea class="input" data-st-why placeholder="Why? e.g. Travelling for work — back 1 Sep" aria-label="Reason"></textarea>' +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" data-st-cancel>Cancel</button>' +
        '<button class="btn" data-st-save disabled>Save status</button>' +
      '</div>',
      function (sh) {
        var why = sh.querySelector('[data-st-why]');
        var save = sh.querySelector('[data-st-save]');
        var sync = function () { save.disabled = !why.value.trim(); };
        why.addEventListener('input', sync);
        sh.querySelectorAll('[data-st-val]').forEach(function (b) {
          b.addEventListener('click', function () {
            stPick = b.dataset.stVal;
            sh.querySelectorAll('[data-st-val]').forEach(function (x) { x.classList.toggle('on', x === b); });
          });
        });
        sh.querySelector('[data-st-cancel]').addEventListener('click', HV.closeSheet);
        save.addEventListener('click', function () {
          var word = (STATUS.find(function (s) { return s.k === stPick; }) || {}).t || stPick;
          c.status = stPick;
          c.statusWhy = why.value.trim();
          c.statusBy = (HV.me() || {}).id;
          c.statusAt = Date.now();
          HV.logAct(c, 'status', word + ' — ' + c.statusWhy);
          HV.closeSheet(); HV.refresh();
          HV.toast('Status set to ' + word + '.');
        });
      }
    );
  }
```

- [ ] **Step 4: Implement verification**

Per TJ's decision, an admin marks it — so the audit line must name **who**, or the record asserts something on a staff member's word with no trace.

```js
  /* An admin's mark, not the client's act — so the line says who marked it. */
  function verify(c, which) {
    var okKey = which + 'Ok', byKey = which + 'By', atKey = which + 'At';
    c[okKey] = !c[okKey];
    c[byKey] = c[okKey] ? (HV.me() || {}).id : null;
    c[atKey] = c[okKey] ? Date.now() : null;
    HV.logAct(c, 'verify', (which === 'email' ? 'Email' : 'Mobile') +
      (c[okKey] ? ' marked verified' : ' verification withdrawn'));
    HV.refresh();
    HV.toast(c[okKey] ? 'Marked verified.' : 'Verification withdrawn.');
  }
```

- [ ] **Step 5: Implement the profile edit sheet and `wire`**

One sheet with an input per editable field; on save, diff against the old values and write **one** `profile` log line naming the fields that changed — not one line per keystroke, and not a line when nothing changed.

```js
  function wire(el, c) {
    el.addEventListener('click', function (e) {
      var st = e.target.closest('[data-status]');
      if (st) { statusSheet(c); return; }
      var vf = e.target.closest('[data-verify]');
      if (vf) { verify(c, vf.dataset.verify); return; }
      var ep = e.target.closest('[data-editprofile]');
      if (ep) { editProfileSheet(c); return; }
    });
  }
```

Call `HV.clientRecord.wire(el, c)` from `console-clients.js`'s existing tab-wiring, beside `wireC360(el, c)`.

- [ ] **Step 6: Run the test**

```bash
node --check app/js/views/console-client-record.js && cd $SCRATCH && node t11.js
```
Expected: `10 passed, 0 failed, 0 console errors`

- [ ] **Step 7: Commit**

```bash
git add app/js/views/console-client-record.js app/js/views/console-clients.js
git commit -m "feat(console): the record becomes editable — status with a mandatory reason, profile edits, verification that names who marked it"
```

---

## Task 12: The term bar

**Files:**
- Modify: `app/js/views/console-clients.js:2034-2053` (`headHtml`)
- Modify: `app/js/views/console-client-record.js` (the Profile term section + Renew)
- Modify: `app/css/app.css`

**Interfaces:**
- Consumes: `HV.termOf`, `HV.logAct`.

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t12.js */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.wait(400);
  for (const [cid, tone] of [['c-rajesh','ok'],['c-sureshp','warn'],['c-mathew','bad']]) {
    await h.nav('#/clients/' + cid + '/overview'); await h.wait(700);
    const r = await h.ev(`(()=>{const b=document.querySelector('[data-term]');
      const c=HV.client(${JSON.stringify(cid)}); const t=HV.termOf(c);
      return { has:!!b, txt:b?b.textContent.replace(/\\s+/g,' '):'', tone:b?b.className:'',
               left:t.left, cycleTxt:document.querySelector('.cchead small').textContent };})()`);
    h.ok(cid + ': the term bar is in the header', r.has, r);
    h.ok(cid + ': it is labelled, never a bare number',
      /of\s*90|Term ended/.test(r.txt), r.txt);
    h.ok(cid + ': tone is ' + tone, r.tone.indexOf(tone) !== -1, r.tone);
    h.ok(cid + ': the cycle clock is still separately labelled',
      /Cycle|Observation/.test(r.cycleTxt), r.cycleTxt);
  }
  /* Renew moves the date and records the decision */
  await h.nav('#/clients/c-mathew/overview'); await h.wait(700);
  const before = await h.ev(`HV.termOf(HV.client('c-mathew')).startISO`);
  await h.ev(`document.querySelector('[data-renew]').click()`); await h.wait(400);
  await h.ev(`document.querySelector('.sheet [data-rn-save]').click()`); await h.wait(500);
  const after = await h.ev(`(()=>{const c=HV.client('c-mathew');
    return { start:c.term.startISO, n:c.term.renewals.length,
             log:(c.log||[]).filter(e=>e.act==='term').length, left:HV.termLeft(c) };})()`);
  h.ok('renew moves the start date', after.start !== before, [before, after.start]);
  h.ok('renew records the decision', after.n === 1, after);
  h.ok('renew writes a log line', after.log === 1, after);
  h.ok('the term is live again', after.left > 0, after.left);
  h.done('t12');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — no `[data-term]` element.

- [ ] **Step 3: Implement the bar**

```js
  /* The SECOND clock. The programme runs 7 x 14 = 98 days; the term is 90.
     A client mid-level with two weeks of term left is ordinary, not an
     error — so both clocks are always LABELLED and neither ever shows a
     bare number. */
  function termBar(c) {
    var t = HV.termOf(c);
    var tone = t.ended ? 'bad' : t.left <= 14 ? 'warn' : 'ok';
    var text = t.ended
      ? 'Term ended <span class="num">' + Math.abs(t.left) + '</span> days ago'
      : '<span class="num">' + t.left + '</span> days left of <span class="num">' + t.days + '</span>';
    return '<div class="ctermb ' + tone + '" data-term title="Engagement term">' +
      '<span class="ctbar"><i style="width:' + t.pct + '%"></i></span>' +
      '<small>' + text + '</small></div>';
  }
```

Insert into `headHtml` after the `<small>` carrying cycle and day.

```css
.ctermb{display:flex; align-items:center; gap:var(--s2); min-width:132px}
.ctermb > small{white-space:nowrap; color:var(--ink-3); font-size:var(--t-micro)}
.ctbar{flex:1; height:4px; border-radius:var(--r-full); background:var(--surface-2); overflow:hidden}
.ctbar > i{display:block; height:100%; background:var(--ink-3)}
.ctermb.ok  .ctbar > i{background:var(--brand)}
.ctermb.warn .ctbar > i{background:var(--amber)}
.ctermb.bad  .ctbar > i{background:var(--danger)}
.ctermb.bad  > small{color:var(--danger)}
```

- [ ] **Step 4: Implement the Profile term section and Renew**

In `profileHtml`, a block showing start date, end date, days left, and the renewal history. When `t.ended || t.left <= 14`, a `[data-renew]` button opening a sheet that offers the configured term length (editable), then:

```js
  /* The term clock never silently rolls over — a renewal is a person's
     decision, recorded with their name on it. */
  function renew(c, days) {
    var t = HV.termOf(c);
    c.term = c.term || {};
    c.term.renewals = (c.term.renewals || []).concat([
      { fromISO: t.startISO, toISO: t.endISO, days: t.days, byId: (HV.me() || {}).id, at: Date.now() }]);
    c.term.startISO = HV.todayISO();
    c.term.days = days;
    HV.logAct(c, 'term', 'Renewed for ' + days + ' days');
    HV.closeSheet(); HV.refresh();
    HV.toast('Renewed — ' + days + ' days from today.');
  }
```

- [ ] **Step 5: Run the test**

```bash
node --check app/js/views/console-clients.js && node --check app/js/views/console-client-record.js
cd $SCRATCH && node t12.js
```
Expected: `16 passed, 0 failed, 0 console errors`

- [ ] **Step 6: Check both themes and look at it**

```js
await h.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await h.ev(`HV.refresh()`); await h.wait(500);
await h.shot(`${__dirname}/v195-term-dark.png`);
```
The amber and danger bars must stay legible on the dark ground. `--brand`/`--danger` are *ink on neutral grounds*; `--brand-fill`/`--danger-fill` are *grounds carrying white text* — using the wrong one is the usual contrast failure here.

- [ ] **Step 7: Commit**

```bash
git add app/js/views/console-clients.js app/js/views/console-client-record.js app/css/app.css
git commit -m "feat(console): the engagement term joins the header as a second, labelled clock — with a Renew that records the decision"
```

---

## Task 13: The Logs tab

**Files:**
- Modify: `app/js/views/console-client-record.js` (`logsHtml`)
- Modify: `app/css/app.css`

**Interfaces:**
- Consumes: `HV.store.circles`, `HV.store.meals`, `c.moodLog`, `c.weightLog`, `c.sessionLog`, `c.sessionFeedback`, `HV.store.clientPlans[cid][p].log`, `HV.store.approvals`, `c.log`.
- Produces: `logsHtml(c)`; module-level `logFilter` (in-memory, deliberately not persisted, like the rail's filters).

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t13.js */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.nav('#/clients/c-rajesh/logs'); await h.wait(800);
  const r = await h.ev(`(()=>{const rows=[...document.querySelectorAll('[data-logrow]')];
    return { n:rows.length,
             kinds:[...new Set(rows.map(x=>x.dataset.logkind))],
             ts:rows.map(x=>Number(x.dataset.logts)),
             chips:[...document.querySelectorAll('[data-logfil]')].map(x=>x.dataset.logfil) };})()`);
  h.ok('the seeded history appears with no back-fill', r.n >= 12, r.n);
  h.ok('it draws from many sources, not one', r.kinds.length >= 5, r.kinds);
  h.ok('newest first', r.ts.every((t, i) => i === 0 || r.ts[i - 1] >= t), r.ts.slice(0, 6));
  h.ok('the five filter chips are there',
    ['all','client','team','plan','medical'].every(k => r.chips.indexOf(k) !== -1), r.chips);
  /* every chip narrows, and none empties the list wrongly */
  for (const k of ['client','team','plan','medical']) {
    await h.ev(`document.querySelector('[data-logfil="${k}"]').click()`); await h.wait(400);
    const n = await h.ev(`document.querySelectorAll('[data-logrow]').length`);
    h.ok('filter ' + k + ' narrows without emptying', n > 0 && n <= r.n, n);
  }
  /* a staff act written this session shows up */
  await h.ev(`document.querySelector('[data-logfil="all"]').click()`); await h.wait(300);
  await h.ev(`HV.logAct(HV.client('c-rajesh'),'note','Test line');HV.refresh()`); await h.wait(500);
  h.ok('a fresh staff act appears at the top',
    (await h.ev(`document.querySelector('[data-logrow]').textContent.indexOf('Test line')>=0`)) === true);
  h.done('t13');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — the `logs` tab does not exist yet, so the route falls back to Overview.

- [ ] **Step 3: Implement the collector**

```js
  /* Logs DERIVES from the eight stores that already record things, plus
     c.log for staff acts with no other home. Deriving is what lets the
     demo's seeded history appear on first load with zero back-fill — no
     amount of new writing could achieve that retroactively.
     `mins` is minutes-ago, the unit HV.ago already speaks; entries that
     carry a real ts convert into it so one sort works on everything. */
  var LOG_KIND = {
    msg: 'team', meal: 'client', mood: 'client', weight: 'client',
    session: 'client', stars: 'client', plan: 'plan', approval: 'team',
    doc: 'medical', status: 'team', profile: 'team', verify: 'team',
    level: 'plan', coach: 'team', term: 'team', note: 'team',
  };

  function collect(c) {
    var evs = [];
    var push = function (mins, kind, icon, title, sub) {
      evs.push({ mins: mins, kind: kind, icon: icon, title: title, sub: sub || '' });
    };
    var agoOf = function (ts) { return Math.round((Date.now() - ts) / 60000); };
    …
    return evs.sort(function (a, b) { return a.mins - b.mins; });
  }
```

Populate from each of the nine sources, mapping each to its `LOG_KIND` bucket. Group the sorted result by day (`Today`, `Yesterday`, then the date) and render each as:

```js
'<div class="trow" data-logrow data-logkind="' + kind + '" data-logts="' + ts + '">' + …
```

- [ ] **Step 4: Implement the filter chips**

Reuse the `.tfil` grammar the rail and Trackers already use, with `data-logfil` values `all | client | team | plan | medical`. `logFilter` is module-level and in-memory.

- [ ] **Step 5: Run the test**

```bash
node --check app/js/views/console-client-record.js && cd $SCRATCH && node t13.js
```
Expected: `9 passed, 0 failed, 0 console errors`

- [ ] **Step 6: Commit**

```bash
git add app/js/views/console-client-record.js app/css/app.css
git commit -m "feat(console): Logs — the running notes, derived from eight stores plus c.log, newest first"
```

---

## Task 14: The Meetings tab

**Files:**
- Modify: `app/js/views/console-client-record.js` (`meetingsHtml`)

**Interfaces:**
- Consumes: `HV.shape()`, `HV.staffFor`, `HV.roleDef`, `c.meetings`, `c.cycleHistory`.
- Produces: `meetingsHtml(c)`; `c.meetings[]` entries `{ id, kind, cycle, day, dateISO, title, minutes: { staffId: { text, at } } }`.

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t14.js */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.nav('#/clients/c-rajesh/meetings'); await h.wait(800);
  const r = await h.ev(`(()=>{const m=[...document.querySelectorAll('[data-meet]')];
    return { n:m.length, kinds:[...new Set(m.map(x=>x.dataset.meetkind))],
             notFiled:document.querySelectorAll('[data-notfiled]').length,
             seats:[...document.querySelectorAll('[data-meet]:first-of-type [data-seat]')].length };})()`);
  h.ok('the programme meetings are derived, not hand-entered', r.n >= 2, r.n);
  h.ok('both the review and the cycle meeting appear',
    r.kinds.indexOf('review') !== -1 && r.kinds.indexOf('cycle') !== -1, r.kinds);
  h.ok('a meeting lists every pod seat', r.seats >= 4, r.seats);
  h.ok('unfiled minutes are visibly marked', r.notFiled > 0, r.notFiled);
  /* a coach files their own and only their own */
  await h.ev(`HV.login('u-vikram')`); await h.nav('#/clients/c-rajesh/meetings'); await h.wait(700);
  const f = await h.ev(`[...document.querySelectorAll('[data-file]')].map(x=>x.dataset.file)`);
  h.ok('a coach is offered only their own seat', f.every(x => x.indexOf('u-vikram') !== -1), f);
  await h.ev(`document.querySelector('[data-file]').click()`); await h.wait(400);
  await h.ev(`(()=>{const t=document.querySelector('.sheet [data-mn-text]');
    t.value='Knee twinge — hold at L3.'; t.dispatchEvent(new Event('input'));
    document.querySelector('.sheet [data-mn-save]').click();})()`); await h.wait(500);
  const saved = await h.ev(`(()=>{const c=HV.client('c-rajesh');
    const m=(c.meetings||[]).find(x=>x.minutes && x.minutes['u-vikram']);
    return m ? m.minutes['u-vikram'].text : null;})()`);
  h.ok('the minutes persist against that coach', saved === 'Knee twinge — hold at L3.', saved);
  h.done('t14');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — no `meetings` tab.

- [ ] **Step 3: Implement the deriver**

```js
  /* A meeting is derived from the programme's own shape, and the minutes are
     stored against it. A derived meeting with NO filed minutes still appears,
     showing every pod seat with a "not filed" mark against anyone who owes
     one — that is the whole point of the tab. A meeting nobody minuted must
     leave a visible trace that it was due, or the record quietly forgets it. */
  function derivedMeetings(c) {
    var shape = HV.shape(), out = [];
    var cycles = (c.cycleHistory || []).map(function (h) { return h.cycle; }).concat([c.cycle]);
    cycles.forEach(function (cy) {
      out.push({ id: 'mt-' + c.id + '-' + cy + '-review', kind: 'review', cycle: cy,
                 day: shape.reviewDay, title: 'Level review' });
      out.push({ id: 'mt-' + c.id + '-' + cy + '-cycle', kind: 'cycle', cycle: cy,
                 day: shape.meetingDay, title: 'Cycle meeting' });
    });
    /* a future meeting in the CURRENT cycle has not happened yet */
    return out.filter(function (m) { return m.cycle < c.cycle || m.day <= c.day; });
  }

  /* stored minutes graft onto the derived record by id */
  function meetingsFor(c) {
    var stored = c.meetings || [];
    var byId = {};
    stored.forEach(function (m) { byId[m.id] = m; });
    var all = derivedMeetings(c).map(function (m) {
      return Object.assign({}, m, { minutes: (byId[m.id] || {}).minutes || {} });
    });
    /* ad-hoc meetings are stored only — they have no derived twin */
    stored.filter(function (m) { return m.kind === 'adhoc'; }).forEach(function (m) { all.push(m); });
    return all.sort(function (a, b) {
      return (b.cycle - a.cycle) || (b.day - a.day);
    });
  }
```

- [ ] **Step 4: Render, with the seats**

Each meeting is a `.card` with `data-meet data-meetkind`. Inside, one row per pod seat resolved through `HV.staffFor(c, roleKey)` (cover-aware for free), carrying `data-seat`. A seat with minutes shows the text and when; a seat without shows `data-notfiled` and, when it is the **viewer's own seat**, a `[data-file="<meetingId>|<staffId>"]` button.

- [ ] **Step 5: Implement filing**

```js
  function fileSheet(c, meetingId, staffId) { … }
```
On save: find or create the stored meeting, set `minutes[staffId] = { text, at: Date.now() }`, `HV.save()`, `HV.logAct(c, 'note', 'Filed minutes for …')`.

**A coach files only their own seat.** The button renders only where `staffId === HV.me().id`, and the handler re-checks — the same twice-enforced pattern the router and views already use for RBAC.

- [ ] **Step 6: Run the test**

```bash
node --check app/js/views/console-client-record.js && cd $SCRATCH && node t14.js
```
Expected: `6 passed, 0 failed, 0 console errors`

- [ ] **Step 7: Commit**

```bash
git add app/js/views/console-client-record.js
git commit -m "feat(console): Meetings — the programme's reviews derive themselves, and an unfiled minute leaves a visible trace"
```

---

## Task 15: Nine tabs, the Documents rename, and the rail status filters

**Files:**
- Modify: `app/js/views/console-clients.js:13-21` (`TABS`), `:24-30` (`planFilters`), `:696-702` (`railMatches`), `:2064-2075` (`bodyFor`)

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t15.js */
const { open } = require('./h');
const WANT = ['Overview','Logs','Circle','Plan','Emotions','Documents','Meetings','Trackers','Notes'];
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-anita')`); await h.nav('#/clients/c-rajesh/overview'); await h.wait(800);
  const tabs = await h.ev(`[...document.querySelectorAll('.cwtabs button')].map(b=>b.textContent.trim())`);
  h.ok('nine tabs, in the asked-for order', JSON.stringify(tabs) === JSON.stringify(WANT), tabs);
  h.ok('the tab strip scrolls rather than wrapping',
    (await h.ev(`getComputedStyle(document.querySelector('.cwtabs')).overflowX`)) === 'auto');
  /* the id stays 'docs' — it is in the route, and changing it breaks every
     existing deep link */
  await h.nav('#/clients/c-rajesh/docs'); await h.wait(600);
  h.ok('the old /docs deep link still lands on Documents',
    (await h.ev(`document.querySelector('.cwtabs button.on').textContent.trim()`)) === 'Documents');
  /* every tab renders something */
  for (const t of ['overview','logs','circle','plan','emotions','docs','meetings','trackers','notes']) {
    await h.nav('#/clients/c-rajesh/' + t); await h.wait(500);
    const n = await h.ev(`document.querySelector('.ccscroll')?document.querySelector('.ccscroll').textContent.trim().length:0`);
    h.ok('tab ' + t + ' renders', n > 100, n);
  }
  /* rail status filters */
  await h.nav('#/clients'); await h.wait(600);
  const chips = await h.ev(`[...document.querySelectorAll('[data-fil]')].map(b=>b.dataset.fil)`);
  h.ok('the rail gained status filters',
    ['active','paused','inactive'].every(k => chips.indexOf(k) !== -1), chips);
  await h.ev(`document.querySelector('[data-fil="paused"]').click()`); await h.wait(500);
  const rows = await h.ev(`document.querySelectorAll('[data-cid]').length`);
  h.ok('filtering to paused narrows the rail',
    rows === (await h.ev(`HV.myClients().filter(c=>c.status==='paused').length`)), rows);
  h.done('t15');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — seven tabs, labelled "Docs", no status chips.

- [ ] **Step 3: Nine tabs, in the client's order**

```js
  /* The order TJ's client asked for, with Trackers and Notes kept and moved
     to the end. `docs` keeps its ID even though its LABEL is now Documents:
     the id is in the route (#/clients/:cid/docs), so renaming it would break
     every existing deep link and bookmark. */
  var TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs',     label: 'Logs' },
    { id: 'circle',   label: 'Circle' },
    { id: 'plan',     label: 'Plan' },
    { id: 'emotions', label: 'Emotions' },
    { id: 'docs',     label: 'Documents' },
    { id: 'meetings', label: 'Meetings' },
    { id: 'trackers', label: 'Trackers' },
    { id: 'notes',    label: 'Notes' },
  ];
```

- [ ] **Step 4: Dispatch the two new tabs**

```js
    if (tab === 'logs') return HV.clientRecord.logsHtml(c);
    if (tab === 'meetings') return HV.clientRecord.meetingsHtml(c);
```

- [ ] **Step 5: Status filters on the rail**

Extend `planFilters()` with the three statuses and `railMatches` to honour them:

```js
      .concat(STATUS_FILTERS)
      .concat([{ k: 'risk', label: 'High risk' }]);
```
```js
    if (['active','paused','inactive'].indexOf(railFilter) !== -1) return c.status === railFilter;
```

Also accept `#/clients/status/:s` so the dashboard tiles land pre-filtered.

- [ ] **Step 6: Run the test**

```bash
node --check app/js/views/console-clients.js && cd $SCRATCH && node t15.js
```
Expected: `14 passed, 0 failed, 0 console errors`

- [ ] **Step 7: Commit**

```bash
git add app/js/views/console-clients.js
git commit -m "feat(console): nine tabs in the client's own order, Docs becomes Documents (id unchanged), and the rail filters by status"
```

---

## Task 16: `termDays` in Configuration

**Files:**
- Modify: `app/js/views/console-config.js:59-124`

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t16.js */
const { open } = require('./h');
(async () => {
  const h = await open(8082);
  await h.ev(`HV.login('u-sureshk')`); await h.nav('#/config/program'); await h.wait(800);
  h.ok('term length is a Program lever',
    (await h.ev(`!!document.querySelector('[data-stat="termDays"]')`)) === true);
  const bad = await h.ev(`HV.store.programShape.termDays`);
  h.ok('it reads the configured value', bad === 90, bad);
  /* validation refuses nonsense and says so without saving anything */
  const v = await h.ev(`(()=>{const ps=Object.assign({},HV.store.programShape,{termDays:0});
    return typeof HV.configValidate === 'function' ? HV.configValidate(ps) : 'no-validator';})()`);
  h.ok('a zero-day term is refused', typeof v === 'string' && v.length > 0, v);
  h.done('t16');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — no `termDays` tile.

- [ ] **Step 3: Add the tile and the validation rule**

In `programHtml`, beside the existing tiles:

```js
      statTile('termDays', 'Engagement term', ps.termDays + ' days',
        'The commercial term — separate from the programme', canEdit),
```

In `validateProgram`, before the cycle checks:

```js
    /* the term is the SECOND clock and is deliberately not tied to the
       programme's length — but a term of zero days would make every client
       read as expired the moment it saved */
    if (!(ps.termDays > 0 && ps.termDays % 1 === 0))
      return 'The engagement term must be a whole number of days. Nothing was saved.';
```

- [ ] **Step 4: Run the test**

```bash
node --check app/js/views/console-config.js && cd $SCRATCH && node t16.js
```
Expected: `3 passed, 0 failed, 0 console errors`

- [ ] **Step 5: Commit**

```bash
git add app/js/views/console-config.js
git commit -m "feat(config): the engagement term joins the Program levers, with validation that refuses a zero-day term"
```

---

## Task 17: The flip to 14

Last, deliberately. Tasks 1–16 leave the client app byte-identical on screen, so each was verifiable against a known-good. This is the only step where the screen is *supposed* to change.

**Files:**
- Modify: `app/js/data.js:24` (`SHAPE`), `app/js/data.js:11` (`seedVersion` → 39)
- Modify: `CLAUDE.md:144`, `app/README.md:3`

- [ ] **Step 1: Write the failing test**

```js
/* $SCRATCH/t17.js */
const { open } = require('./h');
(async () => {
  const h = await open(8081);
  await h.ev(`HV.login('u-cl-rajesh')`); await h.wait(500);
  const s = await h.ev(`HV.shape()`);
  h.ok('cycle is 14 days', s.cycleDays === 14, s);
  h.ok('review is day 12', s.reviewDay === 12, s);
  h.ok('the meeting is day 14', s.meetingDay === 14, s);
  h.ok('rest days are 5 and 10', JSON.stringify(s.restDays) === '[5,10]', s);
  h.ok('the derived calendar is 14 days',
    (await h.ev(`HV.calendarFor(HV.myClient()).length`)) === 14);
  h.ok('every template holds 14 days',
    (await h.ev(`HV.store.templates.every(t=>Object.keys(t.days).length===14)`)) === true);
  h.ok('the film library still covers a full cycle without repeating',
    (await h.ev(`(HV.store.catalog.motivation||[]).length`)) >= 14);
  await h.nav('#/plan'); await h.wait(700);
  h.ok('My Plan says 14, not 11',
    (await h.ev(`/of\\s*14|14\\s*day/i.test(document.querySelector('main').textContent)`)) === true);
  /* THE RENDERING RULE: config decides what gets BUILT, data what gets DRAWN */
  await h.nav('#/journey'); await h.wait(800);
  const past = await h.ev(`(()=>{const c=HV.myClient();
    const p=(HV.store.calendarsPast[c.id]||{});
    return Object.keys(p).map(k=>p[k].length);})()`);
  h.ok('a past 11-day cycle STILL draws 11 cells', past.every(n => n === 11), past);
  h.done('t17');
})();
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — every shape assertion reads the 11-day values.

- [ ] **Step 3: Flip the single literal**

`app/js/data.js:24`:

```js
  const SHAPE = { levels: 7, cycleDays: 14, reviewDay: 12, restDays: [5, 10],
                  meetingDay: 14, termDays: 90,
                  sessions: { fitness: 5, yoga: 3, mind: 1 } };
```

- [ ] **Step 4: Bump `seedVersion` to 39**

Seeded arrays change length. Without this, anyone with a saved store keeps 11-day data while every helper answers 14 — the classic "my change didn't do anything".

- [ ] **Step 5: Leave `calendarsPast`'s literal 11 alone, and say why**

`data.js:1936` generates past cycles with a hardcoded `11`. That is **correct** and must stay: those cycles ran under the old rhythm, and *config decides what gets built; data decides what gets drawn*. Add the comment so nobody "fixes" it:

```js
  /* NOTE: 11 here is deliberate and must NOT become SHAPE.cycleDays. These
     cycles already ran, under the 11-day rhythm. Config decides what gets
     BUILT; the data decides what gets DRAWN — a past cycle draws 11 cells
     forever, which is exactly what t17 asserts. */
```

Also fix the stale copy at `data.js:1975` — `'Draft a Day-11 progress note'` should read from `SHAPE.meetingDay`.

- [ ] **Step 6: Update the two documents by hand**

`CLAUDE.md:144` and `app/README.md:3` both describe an 11-day cycle.

- [ ] **Step 7: Run everything**

```bash
cd $SCRATCH
for t in t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14 t15 t16 t17; do
  echo "== $t"; node $t.js || echo "  ^^ FAILED"; done
```
Expected: every suite green. **t5's `HV_REST` constant and t2's status expectations are the ones most likely to need updating** — check any failure is a stale assertion rather than a real regression before changing it.

- [ ] **Step 8: Commit**

```bash
git add app/js/data.js CLAUDE.md app/README.md
git commit -m "feat(program): the cycle becomes 14 days — review day 12, meeting day 14, rest 5 and 10 (seedVersion 39)

calendarsPast keeps its literal 11 on purpose: those cycles already ran
under the old rhythm. Config decides what gets BUILT; the data decides
what gets DRAWN."
```

---

## Task 18: Ship

**Files:**
- Modify: `app/index.html` (every `?v=`), `app/sw.js` (`CACHE`, `ASSETS`)

- [ ] **Step 1: Re-grep the live version numbers before touching them**

Parallel sessions have raced these before. Adopt the highest value present, do not assume 194.

```bash
grep -o "v=[0-9]*" app/index.html | sort -u
grep -n "const CACHE" app/sw.js
grep -n "HV.seedVersion" app/js/data.js
```

- [ ] **Step 2: Bump all three levers**

```bash
sed -i '' 's/?v=194/?v=195/g' app/index.html
sed -i '' "s/haalving-demo-v194/haalving-demo-v195/" app/sw.js
```
`HV.seedVersion` is already 39 from Task 17.

- [ ] **Step 3: Confirm the new view is registered in both places**

```bash
grep -n "console-client-record" app/index.html app/sw.js
```
Expected: one line in each. **A view missing from `ASSETS` works online and breaks offline** — the failure appears days later and looks unrelated.

- [ ] **Step 4: Syntax-check everything that changed**

```bash
for f in $(git diff --name-only main -- 'app/js/*.js' 'app/js/**/*.js'); do
  node --check "$f" || echo "SYNTAX FAIL $f"; done
```

- [ ] **Step 5: The full regression, both apps, both themes**

```bash
cd $SCRATCH && for t in t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14 t15 t16 t17; do node $t.js; done
```
Plus the prior waves, which must still be green: `phase1.js`, `phase1c.js`, `phase2.js`, `coach189.js`, `chart190.js`.

- [ ] **Step 6: Walk the core loop by hand, in a real browser**

This is the one thing no assertion proves. Catalog ▸ Nutrition → add a food. Templates → new Nutrition · L1 · Sedentary → put that food in Day 1 Breakfast with an OR alternative → publish. Clients → Rajesh → Plan → assign. **Open the client app and find that food on My Plan, Day 1.** That single walk is F2 closed.

- [ ] **Step 7: Look at the screenshots**

Read `v195-profile.png`, `v195-term-dark.png`, and take one of Logs and one of Meetings. Every wave so far has produced at least one copy defect that passed every assertion and was only visible by looking.

- [ ] **Step 8: Commit**

```bash
git add app/index.html app/sw.js
git commit -m "chore(ship): v195 — cache name, asset versions, and console-client-record.js in the offline manifest"
```

---

## Self-Review

**Spec coverage** — every section maps to a task:

| Spec section | Task |
|---|---|
| §1 Logs derives + `c.log` | 3, 13 |
| §2 The record grows; `sex` ≠ `gender`; age derived | 1, 2 |
| §3 The two clocks; `termOf`/`termLeft`; Renew | 1, 12 |
| §4 The dashboard; status set by hand with a reason | 9, 11 |
| §5 Nine tabs; Overview's four sections; Meetings | 10, 11, 14, 15 |
| §6 The derived calendar; `markSession` first; `plateFor` | 4, 5, 6, 7, 8 |
| §7 The flip to 14 | 17 |
| §8 Files, incl. the new view in three places | 10, 18 |
| §9 The eleven verification steps | woven through; the hand-walk is 18/6 |
| Configuration gains `termDays` | 16 |

**Ordering** — the one hard constraint is honoured: `HV.markSession` (Task 4) and its three call sites land **before** any reader switches (Task 8), with a transition dual-write so nothing regresses in between. Task 8's step 7 removes the dual-write once `HV.store.calendars` is gone.

**Type consistency** — checked across tasks: `HV.termOf` returns the same eight-key object in Tasks 1, 12 and its callers; `markSession(client, day, pillar, status)` has the same four parameters in Tasks 4, 5 and 8; `plateFor` returns `{slots:[…]}` matching exactly what `HV.tasks` consumed from `mealPlans`; `HV.clientRecord`'s five exports are the five the consumers call.

**One gap found and fixed while reviewing:** Task 5 needed to stamp `day` onto each calendar item, or Task 8's rewritten `dayOf` fallback would have nothing to match on. Added to Task 8 step 3.
