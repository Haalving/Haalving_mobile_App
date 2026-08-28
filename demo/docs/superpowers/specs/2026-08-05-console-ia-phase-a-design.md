# Team Console IA — Phase A design

**Date:** 2026-08-05
**Status:** approved for planning
**Scope:** navigation and information architecture only. No seed changes, no new product data.

---

## 1. Why

The Team Console grew to twelve sidebar items, added one at a time as screens were
built. Two of them (`clients`, `circles`) list the same people ranked by different
things; two more (`schedule`, `worklist`) both answer "what am I doing today"; and
the five boards inside `worklist` are unrelated to each other.

TJ proposed an eight-item menu. The audit found that eight leaves four existing
screens with no door (Onboarding, Medical Review, Meal Queue, Charts & Plans) and
that two of the proposed items — Library and Configuration — are each larger than
everything else combined.

Phase A therefore restructures the corridor using **only content that already
exists**. Library, Configuration and People & Access ship as real read-only screens
over existing data; their authoring surfaces are Phases B–D.

### Goals

- Nine sidebar items, each with real content on day one.
- No screen loses its door.
- No role loses access to anything it can see today.
- No new seed data, no `HV.seedVersion` bump.

### Non-goals (deferred)

| Deferred to | What |
|---|---|
| Phase B | User CRUD, role editing, audit-log viewer |
| Phase C | Cycle config, pass-condition editing, per-plan rules, SLA config |
| Phase D | Library authoring, content approval chain, media management |
| Unscheduled | Billing, community moderation, DPDP consent register, staff leave, coach-marketplace admin, broadcasts, global search |

---

## 2. The nine items

| # | id | Label | Icon | Route | Tabs |
|---|---|---|---|---|---|
| 1 | `home` | Home | `home` | `#/home` | — |
| 2 | `circles` | Care Circles | `circle` | `#/circles` | Circles · Risk queue · Incoming |
| 3 | `schedule` | Schedule | `cal` | `#/schedule` | Calendar · Work list |
| 4 | `queues` | Queues | `clock` | `#/queues` | Meals · Medical · Deviations · Live |
| 5 | `approvals` | Approvals | `shield` | `#/approvals` | — |
| 6 | `library` | Library | `bookmark` | `#/library` | Nutrition · Fitness · Yoga · Mind Wellness |
| 7 | `reports` | Reports | `chart` | `#/reports` | Exports · Calorie log · Incentives |
| 8 | `config` | Configuration | `gear` | `#/config` | Notifications · Cycles ○ · Pass conditions ○ |
| 9 | `people` | People & Access | `users` | `#/people` | Staff · Roles & permissions · Capacity |

○ = labelled placeholder stating "Defined in Phase C", not an empty screen.

All nine icons exist in the current 45-mark `ICONS` set. **No new SVG marks are
required.**

---

## 3. The board contract

Four host views (Care Circles, Schedule, Queues, Reports) each display panels that
today live inside other modules. Rather than duplicate renderers or nest routers,
each owning module registers its panel once and hosts compose them.

Added to `core.js` (infrastructure, not a view reference — core still never
references a view):

```js
HV.boards = {};
HV.registerBoard = function (key, def) { HV.boards[key] = def; };
```

A board definition:

```js
{
  label: 'Meals',            // tab label
  roles: ['dietitian', 'admin', 'opshead'],   // who may see this tab
  count: function () { ... },                 // optional; number for the tab badge
  mount: function (el) { ... },               // renders body into el AND wires listeners
}
```

Rules:

- `mount` renders the **body only** — no `h1`, no page header. The host owns the
  page header and the tab bar.
- A host filters `HV.boards` by `roles` against the current user, renders a tab bar
  from what survives, and calls `mount` on the active one.
- If a role has zero permitted boards in a host, the host's nav item is not shown
  for that role.
- Boards are registered by the module that owns the data. Registration order does
  not matter; hosts read `HV.boards` at render time.

Boards registered in Phase A:

| Key | Registered by | Hosted in |
|---|---|---|
| `work` | `console-ops.js` | Schedule |
| `deviations` | `console-ops.js` | Queues |
| `live` | `console-ops.js` | Queues |
| `calories` | `console-ops.js` | Reports |
| `incentives` | `console-ops.js` | Reports |
| `exports` | `console-ops.js` | Reports |
| `meals` | `console-meals.js` | Queues |
| `medical` | `console-medical.js` | Queues |
| `incoming` | `console-pipeline.js` | Care Circles |

---

## 4. Screen-by-screen

### 4.1 Home (`#/home`)

Replaces the `digest` view. Order, top to bottom:

1. **Next** — a single card: the highest-urgency open task owned by the signed-in
   user, with its due pill and a button to its target route. Absent if none.
2. **Your open tasks** — the remaining open tasks owned by the user, count in the
   section header. Uses the same row markup as the work board, minus the Done
   button (Done lives on the full board).
3. **Needs attention** — today's digest flag list, unchanged, in attention order.
4. **Follow-ups drafted** — the AI follow-up drafts, unchanged.

Ordering rule for "Next": tasks whose `due` contains a clock time or `SLA` rank
above `today`, which ranks above everything else; ties break on existing array
order (which is rule order). No new field on the task.

Data helper added to `data.js` beside `HV.navCounts`:

```js
HV.tasks = {
  mine: function () { ... },   // open tasks owned by HV.me(), rule order preserved
  next: function () { ... },   // the single most urgent of mine(), or null
};
```

Ops roles (`seeAllClients`) see the full task list as today; coaches see their own.
This mirrors `scopedWorklist` in `console-ops.js`, which moves into `HV.tasks`.

### 4.2 Care Circles (`#/circles`)

Merges the `clients` roster and the `circles` list into one list carrying both
signals. Tabs:

- **Circles** (default) — one row per client: avatar, name, last-message preview,
  `n new` unread pill, red left-border cue for high risk. Unread rooms first, then
  by message recency — the existing `listHtml` ordering.
- **Risk queue** — the existing severity-sorted view with the logged flag-dismissal
  flow, unchanged.
- **Incoming** — the six-column onboarding kanban, team allocation, live capacity
  and the InBody key-in / welcome-send flows, mounted from `console-pipeline.js`.
  Visible only to roles with `allocate` (admin, opsmgr, opshead).

The three summary stats (On roster / High risk / On watch) stay above the tab bar.

Tapping a row opens **Client 360** at `#/client/<id>`, unchanged, including its
existing six tabs. Client 360's Circle tab keeps its lightweight thread and gains
an **"Open circle workspace →"** button to the full three-panel room.

Client 360's back button changes target from `#/clients` to `#/circles`.

### 4.3 The circle workspace (`#/room/<id>`)

The three-panel workspace moves from `#/circles/<id>` to `#/room/<id>` so that
`#/circles/<tab>` is unambiguous. It loses its sidebar entry; it is reached from a
roster row and from Client 360. Everything inside it — Teams / Assistant /
Automations pad, splitter, rail, `cc3` full-viewport layout, `HV.chatui` wiring —
is unchanged.

**Alias rule:** `#/circles/<x>` where `HV.client(x)` resolves redirects to
`#/room/<x>`; otherwise `<x>` is read as a tab key. Deterministic because client
ids are `c-`-prefixed and no tab key starts with `c-`.

The badge-sync block at `console-circles.js:681` reaches into the DOM for
`.side nav button[data-r="#/circles"]`. Care Circles keeps route `#/circles`, so
the selector still resolves — but it must be verified, not assumed, because the
count it writes now comes from a different `navCounts` key.

### 4.4 Schedule (`#/schedule`)

Tabs: **Calendar** (default, the drag-and-drop grid, unchanged) and **Work list**
(the `work` board — every task the rules generated, with its Done button).

The calendar's internal `repaint()` calls `HV.refresh()`, which re-runs the router
and re-renders the whole view root — so the tab bar, being part of the same view's
output, survives. No change needed to `repaint`.

### 4.5 Queues (`#/queues`)

New host view, `app/js/views/console-queues.js`. Tabs are the permitted boards, in
order: Meals, Medical, Deviations, Live. Default is the first permitted board. Tab
badges use each board's `count()`.

Audience is **exactly today's audience** — Phase A narrows nothing:

| Tab | Roles | Same as today |
|---|---|---|
| Meals | dietitian, admin, opshead | yes (`console-meals.js` roles) |
| Medical | doctor | yes (`console-medical.js` roles) |
| Deviations | admin, opshead, doctor, dietitian, fitness, yoga, mind | yes — exactly today's `worklist` role list |
| Live | admin, opshead, doctor, dietitian, fitness, yoga, mind | yes |

"All staff" below means that list. Management · Core and Ops Manager have no
`worklist` access today and gain none here, so neither gets a Queues item.

Tightening Deviations/Live to Ops-only is a product decision, explicitly out of
scope here.

### 4.6 Approvals (`#/approvals`)

Unchanged in every respect.

### 4.7 Library (`#/library`)

New view, `app/js/views/console-library.js`. **Read-only in Phase A.** Four tabs,
one per pillar, in the fixed order Nutrition · Fitness · Yoga · Mind Wellness
(pillar keys `culture`, `fitness`, `yoga`, `wellness`).

Each tab renders `HV.store.program[pillar]` — which exists for all four pillars —
as: an activity-track selector (Sedentary / Moderately Active / Active), then the
seven levels, each showing phase name, tag, goal, intensity, RPE, steps, water,
screen-time, home sets, demos and the gym line where present.

Nutrition additionally shows `mealPlans` and the `cultureCriteria` gates; Fitness
and Yoga additionally show `bodyCriteria` level goals and session bars.

Visible to all staff roles. Every field is read-only; a single line states that
authoring arrives in Phase D. No edit affordances are drawn — not even disabled
ones.

### 4.8 Reports (`#/reports`)

Tabs: **Exports** (today's five export cards), **Calorie log**, **Incentives**.

The nav item opens to every role that can see a Calorie log today — admin, opshead,
doctor, dietitian, fitness, yoga, mind — with tabs role-scoped. This is needed
because Calorie log is visible to every coach today (as a `worklist` tab) while the
Reports view itself is admin-only, so a straight move would silently remove it.

| Tab | Roles | Same as today |
|---|---|---|
| Exports | admin, opshead | yes |
| Calorie log | all staff (§4.5 definition) | yes |
| Incentives | admin, opshead | yes — replaces the in-view lock screen with tab absence |

A coach opening Reports sees one tab. Ops Manager and Core get no Reports item —
see §6.1.

### 4.9 Configuration (`#/config`)

The `admin` view renamed and narrowed. Tabs:

- **Notifications** — the notification-rules table, unchanged, including inline
  schedule editing and the enable/pause toggle.
- **Cycles** ○ — placeholder stating the 11-day cycle and 7-level ladder as
  read-only facts, and that editing arrives in Phase C.
- **Pass conditions** ○ — placeholder naming the two rule sets that will become
  editable (`cultureCriteria`, `bodyCriteria`) and their current shape, read-only.

Capacity administration **moves out** of this screen into People & Access.

Roles: admin, opshead (unchanged from `admin`).

### 4.10 People & Access (`#/people`)

New view, `app/js/views/console-people.js`. **Read-only in Phase A.** Tabs:

- **Staff** — every non-client user from `HV.store.users`: avatar, name, role title,
  and their allocated-client count.
- **Roles & permissions** — a matrix rendered from `HV.ROLES`: one row per role, its
  shell, its nav items and its `perms` list. This is documentation of the RBAC
  matrix, generated from the matrix itself, so it cannot drift.
- **Capacity** — the capacity list with load bars, moved from the admin screen.
  Cap editing stays gated on `overrideCapacity` exactly as today, so Ops Head keeps
  the ability it has now.

Roles: admin, opshead.

---

## 5. Routes

| Route | View | Notes |
|---|---|---|
| `#/home` | home | |
| `#/circles` `#/circles/risk` `#/circles/incoming` | circles | |
| `#/room/<id>` | room | full-viewport three-panel workspace |
| `#/client/<id>` | client | unchanged |
| `#/schedule` `#/schedule/work` | schedule | |
| `#/queues/<board>` | queues | default = first permitted |
| `#/approvals` | approvals | unchanged |
| `#/library/<pillar>` | library | default = `culture` |
| `#/reports/<tab>` | reports | default = first permitted |
| `#/config/<tab>` | config | default = `notifications` |
| `#/people/<tab>` | people | default = `staff` |
| `#/builder` `#/review` | builder, review | keep routes, no nav entry; reached from Client 360 |

### Aliases

Applied in the router before view lookup, using `location.replace` so Back does not
loop:

| Old | New |
|---|---|
| `#/digest` | `#/home` |
| `#/clients` | `#/circles` |
| `#/circles/<client-id>` | `#/room/<client-id>` |
| `#/pipeline` | `#/circles/incoming` |
| `#/worklist` | `#/schedule/work` |
| `#/worklist/deviations` | `#/queues/deviations` |
| `#/worklist/live` | `#/queues/live` |
| `#/worklist/calories` | `#/reports/calories` |
| `#/worklist/incentives` | `#/reports/incentives` |
| `#/meals` | `#/queues/meals` |
| `#/medical` | `#/queues/medical` |
| `#/admin` | `#/config` |

Tab state lives in the hash for every host view — refresh keeps your place. This
follows the existing `worklist` pattern and replaces the module-variable pattern
used by `rosterTab` and `clientTab`.

---

## 6. RBAC

`HV.ROLES[*].nav` after Phase A:

| Role | nav | home |
|---|---|---|
| admin | all nine | `#/home` |
| opsmgr | home, circles, schedule, approvals, library | `#/home` |
| opshead | all nine | `#/home` |
| core | home, circles, schedule, approvals, library | `#/approvals` |
| doctor | home, circles, schedule, queues, library, reports | `#/home` |
| dietitian | home, circles, schedule, queues, approvals, library, reports | `#/home` |
| fitness | home, circles, schedule, queues, approvals, library, reports | `#/home` |
| yoga | home, circles, schedule, queues, approvals, library, reports | `#/home` |
| mind | home, circles, schedule, queues, approvals, library, reports | `#/home` |
| ai | `[]` | `#/home` |

`perms` are unchanged. Double enforcement is unchanged: the router blocks the route
and sensitive sections re-check `HV.can()` inside the view.

### 6.1 Three dead nav entries, removed

Auditing the matrix against each view's declared `roles` turned up three sidebar
entries that lead to a lock screen today:

| Role | Entry | Why it locks |
|---|---|---|
| opsmgr | Work List | `worklist` roles are admin, opshead, doctor, dietitian, fitness, yoga, mind — opsmgr is absent |
| opsmgr | Reports | `reports` roles are admin, opshead only |
| core | Reports | same |

Phase A removes them rather than drawing doors that open onto a lock. This grants
no new access and removes none — the screens were already unreachable for those
roles.

**Open product question, not a blocker:** should Ops Manager and Management · Core
actually *have* Work List and Reports? Both are plausible — an Ops Manager who
cannot see the work list is odd. Granting it is a permission change, so it is
deliberately out of Phase A's scope. If TJ wants it, it is a one-line addition to
each board's `roles` and to the role's `nav`.

---

## 7. Badge counts

`HV.navCounts()` in `data.js` returns six keys today; five of those nav ids stop
existing. It must be rewritten in the same commit:

| Nav id | Count |
|---|---|
| `home` | open tasks owned by me |
| `circles` | clients with unread + pipeline items (Incoming), for roles that see Incoming |
| `queues` | sum of permitted board counts: unfinalised meals + pending summaries |
| `approvals` | unchanged — `HV.approvals.queueFor(me.id).length` |
| `schedule`, `library`, `reports`, `config`, `people` | no badge |

---

## 8. Shell change

`consoleShell` currently hardcodes one parent/child relationship for the active
highlight:

```js
const on = active === routeName || (routeName === 'clients' && active === 'client');
```

Replaced by an explicit `owns` array on each nav item, so every sub-route declares
its parent:

```js
circles: { route: '#/circles', label: 'Care Circles', icon: 'circle',
           owns: ['client', 'room'] },
```

`const on = active === routeName || (it.owns || []).includes(active);`

---

## 9. Files

**New**

| File | Purpose |
|---|---|
| `app/js/views/console-queues.js` | Queues host |
| `app/js/views/console-library.js` | Read-only Library |
| `app/js/views/console-people.js` | Read-only People & Access |

**Changed**

| File | Change |
|---|---|
| `app/js/core.js` | `NAV_ITEMS` → nine items with `owns`; `ROLES[*].nav` and `home`; `HV.boards` + `HV.registerBoard`; route aliases; shell active-match |
| `app/js/data.js` | `navCounts` rewrite; new `HV.tasks.mine/next` |
| `app/js/views/console-digest.js` | view `digest` → `home`; tasks section above flags |
| `app/js/views/console-clients.js` | roster gains unread pill + preview + risk cue; tabs incl. Incoming; hash-based tab state; back button → `#/circles` |
| `app/js/views/console-circles.js` | drop list mode; workspace registers as view `room`; verify badge-sync selector |
| `app/js/views/console-pipeline.js` | pipeline → `incoming` board; `admin` view → `config` with three tabs; capacity block moves out |
| `app/js/views/console-ops.js` | split into six registered boards; `reports` becomes a tab host |
| `app/js/views/console-meals.js` | register `meals` board; view registration removed (alias handles the old route) |
| `app/js/views/console-medical.js` | register `medical` board; view registration removed |
| `app/js/views/console-schedule.js` | tab bar host: Calendar + Work list |
| `app/index.html` | three new `<script>` tags; every `?v=139` → `?v=140` (24 occurrences) |
| `app/sw.js` | `CACHE = 'haalving-demo-v140'`; three new files added to `ASSETS` |

`HV.seedVersion` is **not** bumped — no seed shape changes.

---

## 10. Verification

There is no test suite. Verification is `node --check` on every edited file, then a
browser pass per persona with a clean console.

Per-persona checklist (eleven personas on the login screen; the nine console roles
matter here):

1. Sidebar shows exactly the items in §6 for that role — no more, no fewer.
2. Every sidebar item opens without a console error.
3. The active item highlights correctly on a sub-route (`#/client/<id>` highlights
   Care Circles; `#/room/<id>` highlights Care Circles).
4. Every alias in §5 lands on the right screen and does not loop on Back.
5. Badge counts match §7 and clear when the underlying work is done.
6. Refreshing on a tab keeps that tab.
7. Access parity: for each role, every screen reachable before is still reachable.

Explicit parity checks:

- Dietitian reaches the meal queue and can rate a meal.
- Doctor reaches medical review and sees raw records; no other role does.
- A coach still reaches Deviations, Live board and Calorie log.
- A coach still cannot see Incentives.
- Ops Head can still edit caps; nobody else can.
- Capacity override still demands a reason.

---

## 11. Risks and guards

| Risk | Guard |
|---|---|
| `navCounts` returns dead keys → badges silently vanish | Rewritten in the same commit; checked per persona in step 5 |
| Active-highlight breaks on sub-routes | `owns` array; checked in step 3 |
| `role.home` points at a retired route → login lands on "Screen not found" | Updated in the same edit as `nav`; caught by logging in as each persona |
| Circle workspace badge-sync selector goes stale | Route `#/circles` is retained; verified explicitly, not assumed |
| Board `mount` duplicates a page header | Contract states body-only; hosts own the header |
| `#/circles/<tab>` collides with `#/circles/<client-id>` | Workspace moved to `#/room/<id>`; alias resolves by `HV.client()` lookup |
| Returning user gets stale JS | `CACHE` bumped in `sw.js` — the query string alone does nothing, the SW matches with `ignoreSearch: true` |
| New view files missing from `ASSETS` → offline load fails | Three new files added to `sw.js` in the same commit |
| Module-variable tab state resets on refresh | Tab state moves into the hash for all host views |
