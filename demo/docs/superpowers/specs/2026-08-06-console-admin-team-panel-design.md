# Console IA — Admin & Team Panel design

Date: 2026-08-06 · Branch: `console-ia-phase-a` · Approved by TJ (all sections, 06 Aug).
Approach: **full workspace rebuild of the Clients area + re-home everything else**, reusing the
portable engines (`HV.chatui`, `HV.registerBoard`/`HV.boardsFor`, `HV.approvals`, `HV.consoleui`,
`HV.capacityPanel`) unchanged.

The same pages serve every staff role; what a role *sees* is decided by RBAC (nav membership +
`HV.can()` perms), never by separate pages.

---

## 1. Sidebar: 11 items → 8

| Nav id | Label | Route | Fate of old items |
|---|---|---|---|
| home | Home | `#/home` | Digest grows into vital-stats dashboard; Reports' exports+incentives boards re-home here (ops roles) |
| clients | Clients | `#/clients[/:cid[/:tab]]` | Absorbs `circles` (workspace) and `pipeline` (onboarding rail tab) |
| queues | Work Queues | `#/queues[/:board]` | Absorbs `approvals` board + the `work` board currently mounted under Schedule; gains filter row |
| schedule | Schedule | `#/schedule` | Unchanged except the work-board tab is removed |
| catalog | Catalog | `#/catalog[/:pillar]` | `library` renamed + rebuilt: 4 pillar catalogs + Templates tab |
| tribeadmin | Tribe | `#/tribe-admin[/:section]` | New |
| people | People & Access | `#/people[/:tab]` | Grows read-only → editor |
| config | Configuration | `#/config[/:tab]` | Existing route (registered in console-pipeline.js) expanded |

**Redirect aliases** (router-level, so mid-demo deep links and stale in-page links survive):
`#/circles` → `#/clients`; `#/circles/:cid` → `#/clients/:cid/circle`; `#/approvals` → `#/queues/approvals`;
`#/pipeline` → `#/clients` (onboarding rail tab); `#/library[/:p]` → `#/catalog[/:p]`; `#/meals` → `#/queues/meals`.
`#/reports`, `#/builder`, `#/review` stay registered (reachable from Home / Work Queues / client Plan tab)
but leave the nav.

**Badges**: `HV.navCounts` (data.js:1674) currently returns `{home, pipeline, circles, queues, approvals}` —
remap to `{home, clients: pipeline+circles-unread, queues: queues+approvals}`. The circles badge-sync
hack in console-circles.js:678 (`[data-r="#/circles"]`) retargets `#/clients`.

**Link sweep** (must follow the moves): digest replyRow `#/circles/:id` → `#/clients/:id/circle`;
digest signRow `#/approvals` → `#/queues/approvals`; approvals returned-card hint `#/builder`;
library self-links `#/library/:p`; `HV.ROLES.core.home = '#/approvals'` → `#/queues/approvals`.

## 2. Roles: retitle only — keys frozen

| Key (frozen) | New display title | Chain seat |
|---|---|---|
| admin | Super Admin | — |
| core | Super User | final signature |
| opshead | Operations Head | second signature |
| opsmgr | Haalving Coach | first signature |
| doctor | Doctor | — |
| dietitian | Dietician | draft owner |
| fitness | Fitness Coach | draft owner |
| yoga | Yoga Coach | draft owner |
| mind | Mind Wellness Coach | draft owner |

The existing chain order (`chains`: opsmgr → opshead → core, data.js:1190) already realizes
"Haalving Coach signs first, Operations Head second, Super User last" — no chain edits needed.
Also update display strings in seed: `capacity[].roleLabel` (data.js:1485), and note the approved
spelling **Dietician** (display only; key stays `dietitian`).

`client` and `ai` role entries are untouched.

## 3. RBAC

### 3.1 Matrix (V view · C create · E edit · D delete · A approve; blank = not in sidebar)

| Section | Super Admin | Super User | Ops Head | Haalving Coach | Doctor | Dietician | Fitness | Yoga | Mind |
|---|---|---|---|---|---|---|---|---|---|
| Home | V | V | V | V | V | V | V | V | V |
| Clients roster | V·all | V·all | V·all | V·all | V·pod | V·pod | V·pod | V·pod | V·pod |
| Clients onboarding tab | V C E | V | V C E A | V E | | | | | |
| Clients circle chat | V C | V | V C | V C | V C | V C | V C | V C | V C |
| Clients plan tab | V E | V A | V E A | V E C¹ | V | V E² | V E² | V E² | V E² |
| Raw medical records | | | | | V E | | | | |
| Work Queues: my tasks | V E | V | V E | V E | V E | V E | V E | V E | V E |
| Work Queues: approvals | V A | V A·final | V A | V A·first | | V A | V A | V A | V A |
| Work Queues: meals board | V | V | V | V | | V E | | | |
| Work Queues: medical board | | | | | V E | | | | |
| Schedule | V C E D | V | V C E D | V C E | V·self E·self | V·self E·self | V·self E·self | V·self E·self | V·self E·self |
| Catalog items | V C E D | V | V C E D | V | V | V C E·Nutrition | V C E·Fitness | V C E·Yoga | V C E·Mind |
| Catalog templates | V C E D | V A | V C E A | V C E | V | V E·pillar | V E·pillar | V E·pillar | V E·pillar |
| Tribe | V C E D | V | V C E D | V C E | | | | | |
| People & Access | V C E D | V | V E·capacity | | | | | | |
| Configuration | V C E D | V | V E | | | | | | |

¹ C = "Save modified client plan as a new template". ² Pillar coaches edit only their own pillar's
slots in a client plan.

### 3.2 Mechanism — roles move into the store

- New seed key `roles`: a copy of the nine staff entries of `HV.ROLES` (`{title, shell, home, nav,
  perms}`), plus any roles created at runtime. `HV.roleMeta()` and `HV.can()` resolve
  `HV.store.roles[role] || HV.ROLES[role]` (client/ai stay code-only).
- **Router gate becomes nav-driven**: every registered view names its nav parent (`navId` on the
  view or a `VIEW_NAV` map in core). A role may open a view iff that nav id ∈ its `nav` list.
  Hard-coded per-view `roles:[…]` arrays are deleted from console views — this is what makes a
  *runtime-created* role actually reach pages. Client-app views (`shell:'client'`) keep their
  `roles:['client']` gate.
- Boards gate by **perm**, not role list: approvals board → `approve`; meals → `rateMeals`;
  medical → `rawRecords`; deviations/live → `seeAllClients`; work board → everyone.
- Sub-section checks stay `HV.can()` (double-enforcement rule unchanged).
- **Per-role nav lists** (derived from the matrix; these ARE the router gates):
  admin/opshead → all 8; core → all 8 (read-only renders where no perm);
  opsmgr → home, clients, queues, schedule, catalog, tribeadmin;
  doctor/dietitian/fitness/yoga/mind → home, clients, queues, schedule, catalog.
- Perm vocabulary gains labels (for the editor UI) and new entries:
  `editCatalog` (own pillar via ROLE_PILLAR), `editAnyCatalog`, `editTemplates`, `assignPlan`,
  `manageTribe`, `managePeople`, `manageConfig`.
- Perm grants per role (delta from today): admin += overrideCapacity, finalizeLevel,
  editAnyCatalog, editTemplates, assignPlan, manageTribe, managePeople, manageConfig;
  opshead += editAnyCatalog, editTemplates, assignPlan, manageTribe, manageConfig;
  opsmgr += assignPlan, editTemplates, manageTribe; dietitian/fitness/yoga/mind += editCatalog;
  core unchanged (seeAllClients, approve).
- The People & Access matrix table keeps its "cannot drift" guarantee by rendering from the same
  object `HV.can()` consults (now the store copy).

## 4. Clients — rebuilt three-panel workspace

Single route family `#/clients/:cid?/:tab?`. Layout = the circle-workspace grammar (`cc3`
viewport-fill mode; panels scroll, page doesn't):

- **Left rail** (replaces roster page + circles list): search input, filter chips (plan
  black/grey/white · risk · pillar), client rows (avatar, name, unread badge, risk cue, level
  badges), sorted unread-first. Rail has two tabs: **Clients** and **Onboarding** — the second
  mounts the existing `incoming` pipeline kanban (`mountIncoming` is already host-agnostic).
  Ops-only affordances (allocation, capacity override, welcome review) ride along unchanged.
- **Middle panel**: compressed client header (avatar · tier · cycle/day · level rings · radar,
  observation-aware) + tab row: **Overview** (timeline merge of circle msgs + meals), **Circle**
  (client-visible chat via `HV.chatui`, teamonly stripped), **Plan** (new — see below),
  **Trackers**, **Documents** (rawRecords double-gate intact), **Notes**. Day-9 review pack links
  from Plan when `levelPack.clientId` matches.
- **Right pad** with tabs **Assistant / Automation / Team** — the existing pad engine (padSug
  suggestion cards with accept/reject/post/later/refine, padAuto toggles, teamonly lane +
  composer), moved whole. The old copilotRail dies; its content merges into padSug
  (dismiss-reasons → `status:'rejected'`).
- **Deep links**: tab is URL state (`#/clients/c-rajesh/plan`); module-local `clientTab/padTab`
  amnesia is retired. Unknown cid → existing guard card.
- **Phone**: same stacked responsive treatment as today's circle workspace (pad 44% height,
  splitter hidden). Splitter + persisted `store.ui.padW` carry over.
- **Engine reuse contract**: `HV.chatui` unchanged; workspace HTML/wiring functions currently
  IIFE-private in console-circles.js (threadHtml, wireWorkspace, wireSplitter, pad tab renderers,
  delegated click handler) move into the rebuilt console-clients.js; console-circles.js slims to
  the `HV.chatui` engine + the `circles`→redirect stub. Duplicate composer id paths unify on the
  `idPrefix` contract.

### 4.1 Plan tab (the star flow)

Shows the client's assigned template instance: template name + track, cycle picker limited to the
client's current cycle context, 11-day mini-grid (rest/review/meeting marks), and per-day slot
list rendered with the AND/OR grammar (§6.2). Actions, perm-gated:

- **Assign template** (`assignPlan`): picker over published templates; writes `clientPlans[cid]`.
  "Ask AI to fit" variant produces an aidraft the human confirms (containment rule: a named human
  taps every apply).
- **Edit a day** (pillar coaches: own pillar's slots; ops + Haalving Coach: all): swap/add/remove
  items via catalog picker, add/remove OR-options. Writes `clientPlans[cid].overrides['cy.d']`,
  flips `modified:true`, shows a "Modified from <template>" audit line.
- **Save as new template** (Haalving Coach, ops): copies template + overrides into a new
  `templates[]` entry (`base` = source id, `status:'draft'`) and offers "Submit for approval"
  (type `template` rides the standard chain).

## 5. Work Queues

Board host at `#/queues/:board`, tabs by perm: **My work** · **Approvals** · **Meals** ·
**Medical** · **Deviations** · **Live SLA**.

- **My work** = the `work` board moved out of Schedule, upgraded with a `.tfil` filter row
  (owner — ops only · pillar · type · open/done). Worklist items gain optional `{pillar, type}`
  fields to filter on (seed backfill).
- **Approvals** = console-approvals.js re-registered as a board (render fn unchanged: chain
  stepper cards, approve/return sheets, "mine in flight", "all approvals" gated `seeAllClients`).
  Doctor doesn't hold `approve` → sees no Approvals tab; opsmgr/core now reach the queues route
  (they must — they sign).
- Meals/medical/deviations/live boards unchanged; hardcoded demo shortcuts stay (out of scope).
- Header total-waiting pill sums visible boards' `count()`.

## 6. Catalog

Route `#/catalog/:pillar|templates`, default tab per role's pillar. Tabs: **Fitness · Yoga ·
Nutrition · Mind Wellness · Templates**. Pillar keys stay `fitness/yoga/culture/wellness`;
display names follow the naming law.

### 6.1 Catalog items (new seed key `catalog`)

```
catalog: { fitness:[item], yoga:[item], culture:[item], wellness:[item] }
item: { id:'ci-…', track:'sedentary'|'moderate'|'active', name, instructions,
        media?:{kind:'photo'|'video', ref}, caution?, notes?, tags:[…],
        levels?: 'L1–L3',                       // optional display tag
        nutrients?:{kcal,protein,carbs,fat,fibre,micros?:[{k,v}]},  // culture only
        allergies?:[…] }                        // culture only
```

- Field label is **Track** (Sedentary/Moderate/Active) — TJ's "Level" wording maps to the app's
  existing track axis; Level stays the 1–7 ladder. (Approved 06 Aug.)
- Nutrition items use field label **Food**; media doubles as cooking instructions. Mind Wellness
  items omit Caution.
- List UI: track sub-tabs + tag filter chips + text search; item cards (`.trow`) opening a detail/
  edit sheet. Authoring gated `editCatalog` (own pillar) / `editAnyCatalog`; delete is
  ops/Super-Admin only. Media refs reuse existing art (`img/food/*`, `img/tasks/*`).
- Seed: 10–12 items per pillar, tags drawn from {weight loss, PCOD, muscle building, diabetes,
  stress, sleep}; culture items include idli, chutney, dosa (the AND/OR demo trio) with macro +
  2–3 micro values and allergy marks.
- The old read-only "level books" remain reachable as a sixth **Books** tab inside Catalog
  (hosting the existing library render over `program`, unchanged) so nothing seeded disappears.

### 6.2 Templates (new seed keys `templates`, `clientPlans`)

```
templates: [{ id:'tp-…', name, desc, track, by, base?, status:'draft'|'published',
              cycles:{ '1'…'7': { days:{ '1'…'11':
                { rest?, review?, meeting?, slots:[slot] } } } } }]
slot: { pillar, time?, label?, options:[[itemId,…],[itemId,…]], note? }
clientPlans: { [clientId]: { templateId, modified:false, assignedBy,
               overrides:{ 'cy.d': {slots:[slot]} }, log:[{act,byId,minsAgo}] } }
```

- **AND/OR model**: `options` is an OR-list of AND-groups (disjunctive normal form). Rendered as
  "Option A: Idli + Chutney · Option B: Dosa + Chutney · + Add alternative". One level of nesting
  only — no groups inside groups.
- Template editor: template list → editor with cycle picker (1–7) over an 11-day grid; day sheet
  edits slots (pillar, item picker from catalog filtered to pillar+track, option groups, time,
  note). Rest d5/d10, review d9, meeting d11 pre-marked from `programShape`.
- Publishing: "Submit for approval" creates an approvals entry `type:'template'` riding the
  standard chain; `TYPE_LABELS` gains `template`. Only `published` templates are assignable.
- Seed: one **published** complete 7×11 template ("Foundation — Sedentary"), generated at seed
  time from catalog items following the existing pattern (5 fitness + 3 yoga + 1 mind sessions,
  daily meal slots); one **draft** ("Muscle Building — Moderate", 2 cycles filled). `clientPlans`
  seeded for c-rajesh (modified: one swapped breakfast) and c-dev (clean), assigned by u-rohan.

## 7. Tribe (console)

New view `#/tribe-admin/:section`, nav label **Tribe**; sections **Quiz days · Gatherings ·
Challenges · Posts** (gatherings = `tribeFeed.events`). Each: list rows + Add/Edit sheet writing
the same `tribeFeed` objects the client pages read (long-read fields about/agenda/arc/bring
included as textarea-per-line editors). Content and member-state fields are interleaved in the
seed; console edits mutate content fields in place and never touch state fields (`going`,
`joined`, `likes`, `answered`). Delete = Super Admin/Ops Head, with confirm sheet. Demo round
trip: create a gathering in console → log in as Rajesh → it's on the client Tribe page.

## 8. People & Access

Tabs: **Staff · Roles & Permissions · Capacity** (capacity = existing `HV.capacityPanel`).

- **Staff**: list (avatar, title, allocation count) + **Add employee** sheet (name, role picker,
  optional subtitle) → appends to `users`, creates a `capacity` row (load 0, default cap), toast.
  Deactivate hides from pickers (flag `inactive`, filtered in staffAll/schedule groups).
- **Roles & Permissions**: matrix grid rendered from store `roles` — rows = roles, columns = nav
  items + perms, editable as toggles (`managePeople` only; Super User sees read-only). **New
  role** = copy-from-existing sheet (name + base role) → appears immediately in the role picker
  and router. Guard: `admin` row's People & Access access cannot be revoked (no lock-yourself-out).
- Schedule's hardcoded staff-id→pillar map (console-schedule.js:729) switches to deriving pillar
  from the assignee's role key, so new employees schedule correctly.

## 9. Configuration

Tabs at `#/config/:tab`: **Program** (new; renders `programShape` — 7 levels · 11-day cycle ·
Day-9 review · rest d5/d10 · 5+3+1 sessions — editable by `manageConfig` with an "applies from
next cycle" audit note) · **Plans** (Black/Grey/White from `HV.PLANS`, read-only cards) ·
**Chains** (approval chain steps per type from `chains`, read-only) · **Notifications** (existing
editable rules, unchanged). The old Cycles/Pass-conditions read-only tabs fold into Program.
New seed key `programShape: {levels:7, cycleDays:11, reviewDay:9, restDays:[5,10], meetingDay:11,
sessions:{fitness:5,yoga:3,mind:1}}`; template editor and config read it (existing generators keep
their literals — display-source only, no behavior change this phase).

## 10. Home

Role-aware dashboard, one column order for all roles (sections drop out by perm/scope):
greeting + **NEXT** card + open tasks (worklist) · **vital-stats tile grid** (clients by plan,
high-risk count, waiting-on-signature, unrated meals, pending documents, on-time dial — computed
from live store where cheap: unrated from `meals`, signatures from `HV.approvals.queueFor`;
seeded `opsStats` fills the rest) · needs-a-reply rooms (→ `#/clients/:id/circle`) · attention
queue (→ `#/clients/:id`) · drafted follow-ups (sendDigest bulk flow unchanged) · **Ledger**
section for ops roles (exports + incentives boards re-homed from Reports; `#/reports` route kept
as their standalone host, out of nav).

## 11. Data & shipping

- `HV.seedVersion` 27 → **28** (new keys: `catalog`, `templates`, `clientPlans`, `roles`,
  `programShape`; worklist items gain `{pillar?, type?}`). `catalog`/`templates`/`programShape`
  boot-refill as catalogues; `clientPlans`/`roles` are user state (persisted; `roles` re-seeds
  only when absent).
- Files: rebuild `console-clients.js`; slim `console-circles.js` (chatui engine + redirect);
  new `console-catalog.js` (replaces console-library.js in index/sw), new `console-tribe-admin.js`,
  new `console-config.js` (config moves out of console-pipeline.js; pipeline file keeps the
  incoming board); edits in core.js, data.js, console-queues.js, console-approvals.js,
  console-digest.js, console-ops.js, console-schedule.js, console-people.js, app.css.
- Ship levers (all mandatory, re-grep live values first — concurrent sessions exist): every
  `?v=NN` in index.html, `CACHE` in sw.js (currently v148), ASSETS list add/remove, seedVersion.
- Verification: browser pass per persona (all 9 staff + Rajesh client), clean console, redirect
  aliases hit, phone-width pass on the Clients workspace, dark + light.

## 12. Demo script (per role, 60–90s each)

| Login | Show |
|---|---|
| Super Admin | Home vitals → People & Access: add employee, create role "Content Editor", tick Catalog only → log a lock screen as that role's story |
| Operations Head | Clients onboarding rail: allocate + capacity override → Configuration Program tab |
| Haalving Coach | Clients workspace: Rajesh → Plan tab → swap breakfast (Idli+Chutney ↔ Dosa) → Save as new template → submit for approval |
| Super User | Work Queues → Approvals: the template arrives for final signature → approve → published |
| Dietician | Catalog Nutrition: add a food with macros/allergies → Work Queues meals rating |
| Fitness / Yoga / Mind | Own catalog authoring + own slots in a client plan |
| Doctor | Clients → Documents raw records (access logged) → Work Queues medical sign-off |
| Client (Rajesh) | Tribe gathering created earlier appears; plan reflects the swapped meal |

## Out of scope (this phase)

Real behavior changes from `programShape` edits (display-source only) · restructuring `tribeFeed`
content/state split · computing every Home stat live · stage-advance controls on the pipeline
kanban beyond what exists · touch-drag template editing.
