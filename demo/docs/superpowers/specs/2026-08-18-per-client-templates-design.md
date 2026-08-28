# Per-client templates — the ticket, the clock, the targets and the plate

**Date:** 18 Aug 2026
**Status:** approved by TJ (all five points), cleared to build
**Ships as:** v202 · `HV.seedVersion` 44 → 45
**Builds on:** the v201 catalog refinements (three tiers, two vocabularies, one media pipeline)

---

## The idea in one picture

A restaurant kitchen carries the distinction the product needs.

```
  MASTER RECIPE BOOK              THE TICKET (one diner)              THE DINER SEES
  store.templates                 clientPlans[cid][pillar]
  ┌──────────────────┐   call    ┌──────────────────────────┐ approve ┌──────────────┐
  │ tp-nut-l2        │ ────────► │ draft: {templateId,      │ ──────► │ live fields  │
  │  days 1..14      │           │   overrides, time,       │         │  templateId  │
  │  targets  (NEW)  │           │   targets}   ← the coach │         │  overrides   │
  └──────────────────┘           │              writes here │         │  time  (NEW) │
         ▲                       └──────────────────────────┘         │  targets(NEW)│
         │ authored in the                                            └──────┬───────┘
   Catalog composer                ONLY the console reads `draft`             │
   (pop-up → side panel)           the client reads only LIVE                 ▼
                                                                    Today · My Plan ·
                                                                    Nutrient Panel
```

The book is never scribbled on. Calling a template writes a **ticket** for one
diner: pre-filled from the book, adjusted for that diner's needs and their
reservation time, signed by the chef before it leaves the pass.

**The core loop is untouched.** `HV.slotsFor(client, pillar, day)` (core.js:2793)
still answers *override-day → template-day → []*, and it is still the only
resolver. Everything below either stages beside it (`draft`) or resolves around
it (`time`, `targets`), so the client-facing pipeline stays one unbroken path.

**The governing invariant.** Client-facing readers — `HV.slotsFor`,
`HV.calendarFor`, `HV.plateFor`, `HV.tasks`, `npReading` — read **only live
fields**. Only console code reads `a.draft`. An absent field means today's
behaviour, the same absent-means-default contract `HV.flowOn` keeps, so the
eleven seeded assignments need no migration and no `seedVersion` bump of their
own.

---

## Part A — the ticket (TJ point 1)

### A1. What is broken

`editDaySheet`'s save (console-clients.js:1673-1684) writes straight into
`a.overrides[d]` and calls `HV.save()`. The client sees the edit on the next
paint. Its own toast says *"…and Rajesh sees it tomorrow"* — which was never
true; he saw it immediately. Library templates are fully gated behind
`HV.approvals`; a client's actual plan has no gate at all. That asymmetry is the
seam this closes.

### A2. The draft is a full shadow copy

```js
a.draft = {
  templateId: 'tp-nut-l2',              // may differ from a.templateId — a "called" template
  overrides: { 3: { slots: [...] } },   // FULL deep copy of a.overrides at draft creation
  time: '19:30',                        // Part B, session pillars only, optional
  targets: { kcal: 1650, protein: 95, fibre: 30 },  // Part C, culture only, optional
  by: 'u-sneha',
}
```

Full copy, not a sparse patch. Two consequences, both wanted:

- The console renders **draft if present, else live** with no merge logic —
  `draftView(a)` returns something the existing `effectiveDay` / `isEdited`
  already understand, unchanged.
- **Approve is a wholesale copy.** A sparse patch would make
  `a.overrides = d.overrides` silently delete previously approved day edits.
  The deep copy in `ensureDraft` is what makes the wholesale replace safe, and
  it must not be "optimised" away.

Cost is a few KB per pending draft, at most one per pillar per client.

### A3. Calling, approving, discarding

| Act | Writes | The client |
|---|---|---|
| **Call** a template (was: Assign) | `rec.draft = { templateId, overrides:{}, by }` | sees nothing new |
| **Edit day N** | `ensureDraft(a).overrides[N]` | sees nothing new |
| **Set time / targets** | `ensureDraft(a).time` / `.targets` | sees nothing new |
| **Approve** | copies draft → live wholesale, deletes draft, logs | sees all of it |
| **Discard** | deletes draft, logs | never saw any of it |

A pillar called for the first time gets
`{ templateId: null, modified: false, assignedBy, overrides: {}, log: [], draft }`.
Verified: `HV.slotsFor` already returns `[]` for a null `templateId` — empty
overrides fall through, `.find()` misses — so the client sees nothing until the
first Approve, with no new guard anywhere in core.

Calling a template while a draft is pending simply overwrites `rec.draft`; the
live plan is untouched either way, and one log line records it.

`saveTemplateSheet` (promote to library) keeps reading **live** fields. A
library template is promoted from what the client is actually living, never from
an unapproved sketch.

### A4. What the coach sees

- The live `Modified` / `As published` pill is unchanged; a draft **adds** a
  `Draft — unpublished` warn pill beside it.
- A pillar called but never approved reads `Draft — client sees nothing yet`,
  and the live pill is suppressed — there is no live plan to describe.
- Day chips keep `Edited` for an override; days where draft differs from live
  also carry `Staged`.
- The day-edit toast tells the truth: *"Day staged — Rajesh sees it when you
  approve."*

**Not the approvals engine.** `HV.approvals` (core.js:976) is a role-chain
machine — `canAct` asks "is your *role* next in the chain", not "are you this
client's coach". TJ chose same-coach approval, so a chain of one is a chain
with nothing to say. The draft layer keeps only the `log[]` convention the two
share.

---

## Part B — the clock (TJ point 2)

### B1. Where a time comes from today

`HV.calendarFor` (core.js:580) is the one decision:

```js
time: b ? HV.fmtTime(b.start) : (slot.time || ''),
```

A coach **booking** wins on when and with whom; the template's `slot.time`
is the fallback. So every client on one template trains at the template
author's hour.

### B2. One clock per pillar, on the ticket

`a.time` — a zero-padded 24-hour `'HH:MM'` string, exactly what
`<input type="time">` yields — on **fitness / yoga / wellness** assignments
only. Staged as `draft.time`; `''` means *clear it, template times resume*.

**Precedence: booking > per-client time > template slot time.**

```js
time: b ? HV.fmtTime(b.start)
        : (ap && ap.time != null && HV.hmToMin(ap.time) != null
            ? HV.fmtTime(HV.hmToMin(ap.time)) : (slot.time || '')),
```

`HV.hmToMin` is new and trivial; it exists so the per-client time prints in the
same `6:30 pm` voice as a booking rather than a second dialect of clock.

Nutrition keeps per-slot template times: breakfast at 8:00 and dinner at 19:30
are not one number, and meals are not a pillar with a single daily hour.

Consequence, accepted by decision: on a wellness day carrying both an evening
session and a nightly wind-down, an unbooked occurrence shows the one
per-client time on both. Bookings still win wherever one exists.

### B3. A live bug in the way

`to24` (console-clients.js:1395) parses only 24-hour `H:MM`. A seeded
`'6:30 pm'` fails the regex, comes back `''`, and the Save handler writes that
empty string over the real time — so opening and saving a day silently drops it.
Fixed here because Part B's default-time prefill reads the same function.

---

## Part C — the targets (TJ point 4)

### C1. What is broken

`npReading` (client-today.js:78-87) reads `HV.store.mealPlans[c.id]` directly:

```js
const kcalT = plan.kcal || 1800;
protein: plan.protein || Math.round(kcalT * 0.2 / 4),
fibre:   Math.round(kcalT / 1000 * nut.fibrePer1000),
```

Three facts follow. An assigned nutrition template has **zero** influence on the
client's dials. **Fibre cannot be authored at all** — it is always derived. And
a client with a template but no `mealPlans` entry gets `null` and no panel.

### C2. Targets on the template, overridable on the ticket

`genTemplate` gains `targets: o.targets || null`. Nutrition templates carry
`{ kcal, protein, fibre }`; the composer shows the three fields for `culture`
only. The ticket may override them per client, staged like everything else.

One resolver, so the panel and the console cannot drift:

```js
/* per field: client override → template targets → mealPlans → derived */
HV.nutTargetsFor(client) → { kcal, protein, fibre, src }
```

Read order per field: `a.targets.X` → `template.targets.X` →
`mealPlans[cid].kcal/.protein` → the existing fallbacks (1800, 20 % of kcal,
`kcal/1000 × fibrePer1000`). **An authored fibre target finally wins**; the
derived formula survives as the last rung, so nothing that works today stops.

`npReading` drops its `!plan` early return: a client with a template and no
legacy meal plan now gets a working panel. Carbs and fat stay derived from kcal
via `nutrition.split`, unchanged — they were never authored and are not being
made authorable.

---

## Part D — the composer gets a side panel (TJ point 3)

### D1. What is broken

Clicking any day chip in the template editor repaints and immediately opens a
modal (`openTplDaySheet`, console-catalog.js:954). `.sheet` is capped at
`max-width:520px`, so the widest editor in the product is authored through the
narrowest surface, with the day grid hidden behind it.

### D2. The panel

```
  BEFORE                              AFTER
  ┌─────────────────────┐             ┌───────────────┬╎┬──────────────┐
  │  day grid           │             │  day grid     │╎│  Day 3       │
  │  ┌───────────────┐  │             │  1 2 3 4 5…   │╎│  ┌─────────┐ │
  │  │ MODAL: day 3  │  │             │               │╎│  │ slots   │ │
  │  │  520px        │  │             │  (still       │╎│  │ editor  │ │
  │  └───────────────┘  │             │   visible)    │╎│  └─────────┘ │
  └─────────────────────┘             └───────────────┴╎┴──────────────┘
                                                    drag 300–560px
```

The page keeps its 1180px column — the templates editor is one sub-state of one
tab, and the full-bleed `cc3` workspace class is added by a view's own
`render()`, not by a nested repaint function. At 1180px a panel clamped
300–560px still leaves 590–850px for the grid: wider than the modal it replaces,
*and* the book stays open beside the page.

`wireSplitter` (console-clients.js:2196) is promoted to
**`HV.wireSplitter(root, opts)`** — a mechanical move with five hardcoded values
parameterised, zero behaviour change. The Clients pad keeps `padW`; the composer
uses `tplPadW`, so a coach sizes the two surfaces for their two different jobs.

At ≤860px the wrap stacks and the seam hides — the house fallback is CSS, not a
JS panel/sheet swap (app.css:2761). **One code path**, which is the whole point.

### D3. One slot grammar, two homes

`slotSheet` splits at its `HV.sheet` seam:

```js
slotEditor(host, slots, opts, onSave) → { isDirty() }   // mounts into ANY container
slotSheet(slots, opts, onSave)                          // signature UNCHANGED — wraps it
```

Same grammar as ever: works on a deep copy, nothing touches the store until
Save, `onSave` gets the pruned copy, **the caller writes and closes**. The Plan
tab keeps the sheet; the Catalog mounts the editor in the panel. The one-grammar
rule the `HV.planui` comment exists to protect is preserved by construction.

At most one editor is mounted at a time — its `#ed-*` ids are singletons. Sheet
and panel live on different routes, so this holds; it is stated in the contract
because it is a law, not a guarantee.

### D4. Switching days with unsaved work

The sheet always discarded its deep copy silently on dismiss. The panel keeps
that grammar and **says it out loud**: switching away from a dirty day discards
and toasts once — *"Day 3 edits discarded — Save writes a day before you leave
it."* No confirm modal (that re-imports the pop-up this removes), no per-day
draft cache (state that outlives what the eye can see is how demos break). The
toast fires only when the editor is actually dirty, so browsing never nags.

---

## Part E — AI dish images (TJ point 5)

### E1. What is real and what is simulated

The demo is client-side with no backend, so nothing generates at runtime. What
the flow does is **honest about itself**:

- The prompt shown is the **real** prompt — `tools/genphoto.sh`'s STYLE recipe
  verbatim, the same string that produced every photograph in the app. That
  fixed preamble *is* the "system prompt ensuring uniform design style": one
  lighting setup, one background, one framing ratio, for every food item.
- Delivery comes from a pool rendered offline through that exact pipeline
  (GPT Image 2 → `process.py`), so what appears is what the prompt makes.
- "Modify by prompting" merges the coach's words into the shown prompt and
  advances deterministically to the next variant.

No API key ships in the browser; nothing is base64'd into the store (one
localStorage key holds the whole demo world, and a few inline photos would pass
the quota and stop *everything* saving). The item stores a **path**, as it
already does.

### E2. The state machine

```
  idle ──click──► composing ──click──► generating ──700ms──► delivered
   │              (real prompt         ("Rendering…")        (path → #cf-image,
   │               on the AI ground)                          preview paints)
   │                                                              │
   └──────────────────── refine: merge words, next variant ◄───────┘
```

700 ms sits in the house band for a simulated AI act (client-coach.js:713 uses
600 for a text reply; an image reads as heavier work). The delivery lands in the
existing `#cf-prev` thumbnail — the preview built for typed paths *is* the
result view, so there is no second rendering of the same thing. **Nothing
auto-saves**; the coach still presses Save, and `item.media` keeps the shape
`HV.itemMedia` already normalises.

Everything is inline in the author sheet. `HV.sheet` is single-slot — a second
sheet would destroy the first — so a generate *dialog* is not available even if
it were wanted.

### E3. The pool

Twelve culture dishes × two variants = 24 renders (168 Higgsfield credits, TJ
approved). Every subject clause seats the food on a **non-white vessel** —
banana leaf, terracotta, dark ceramic, brass, copper — because `process.py`
flood-keys near-white to alpha and a white plate touching the frame edge is
eaten by its own background.

A dish with no pooled render (anything authored live in the demo) shows the
composed prompt, runs the delay, and says so: *"No pooled render for this dish
yet — in production this exact prompt goes to the image model."* An idli
photograph delivered for a dish called "Quinoa bowl" reads as a bug on stage; a
sentence reads as engineering.

---

## Files touched

| File | Change |
|---|---|
| `js/core.js` | `HV.hmToMin`, `HV.nutTargetsFor`, `HV.wireSplitter`; the time precedence at `:580` |
| `js/data.js` | `genTemplate` targets; seeded nutrition targets; Rajesh's demo draft + wellness clock; `seedVersion` 45 |
| `js/views/console-clients.js` | draft layer + `draftView`/`ensureDraft`, Call/Approve/Discard, staged day edits, time & targets sheets, `to24` fix, `slotEditor` split |
| `js/views/console-catalog.js` | panel shell + `paintMain`/`loadDay`, `openTplDaySheet` deleted, culture target fields, `DISH_POOL` + generate flow |
| `js/views/client-today.js` | `npReading` reads `HV.nutTargetsFor` |
| `app/img/dishes/` | 24 new renders |
| `index.html`, `sw.js` | `?v=202` everywhere; `CACHE = 'haalving-demo-v202'` |

**`HV.seedVersion` 44 → 45**, required twice over: template `targets` are seeded
onto `store.templates`, and `store.templates` is deliberately not boot-refilled;
and the Rajesh demo draft lives in `seed.clientPlans`, which is not refilled
either. Saved demo state resets — the normal cost in this repo.

---

## Found in adversarial review, and fixed

Two of these were introduced by this change and are worth stating, because both
look like the feature working:

- **A resolver keyed on the record's existence, not on an approved template.**
  `nutTargetsFor` returned derived targets the moment a `clientPlans` record
  existed — and Call creates one deliberately, with `templateId: null`. So a
  calibrating client got a full 1,800 kcal panel off an unapproved ticket, and
  Discard left the orphan record behind so it never reverted. The guard now
  asks for an approved template, a plate, or a stated target.
- **One surface reading the live plan while every other read the ticket.** The
  Call sheet preselected the live `templateId` while a different one sat
  staged, so confirming silently reverted the staged choice and dropped staged
  targets. Day overrides reset on a new call — they belong to the template they
  were written against — but the client's own hour and targets survive it,
  because they describe the person.

Five more, all pre-existing and all in the path this work touches: a template
composer that saved its splitter width but never restored it; faceted tag counts
that went stale as soon as you typed in the search box; a blank `1/1` page for an
item carrying neither film nor words; culture recipes printing four lines as one
paragraph; and a Nutrition header that counted the legacy plate's six slots
against three prescribed meals while quoting 1,400 kcal over a panel counting to
1,800.

## What could go wrong

- **A reader touches `a.draft`.** The client sees unapproved plans and the whole
  feature inverts. The guard is structural: `draftView` exists only in
  console-clients.js, and core.js never mentions the word.
- **The draft staged as a sparse patch.** Approve's wholesale copy would delete
  previously approved day edits. The deep copy is load-bearing.
- **A repaint remounting the panel mid-edit.** Silent draft loss. The rename
  handler repaints the main column only; every `renderTemplateEditor` caller
  must be audited against this.
- **`a.time` in any format but zero-padded 24-hour.** `hmToMin` returns null and
  the time silently falls back to the template — the same failure class as the
  `to24` bug being fixed here.
- **A mutation that skips `HV.save()`.** The calendar cache key carries
  `id|cycle|day` and no store contents, so a stale calendar survives until the
  next route change. Every write ends `save()` then `refresh()`.
- **`process.py` keying a pale dish.** Idli and chutney are near-white subjects
  on a white-keyed pipeline; the vessel clauses are the defence and per-render
  visual QA is the backstop.
- **`.grow` inside a new `.trow`** without its own rule — the trailing pill sits
  mid-row. Standing repo trap, and this ships new rows.
- **Forgetting either ship lever.** `?v=` alone invalidates nothing; `CACHE` is
  the real one. Without `seedVersion` the targets and the demo draft are
  invisible until someone resets the demo.
