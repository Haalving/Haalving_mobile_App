# Catalog refinements — three tiers, two vocabularies, one media pipeline

**Date:** 18 Aug 2026
**Status:** approved by TJ (Sections 1 and 2), cleared to build
**Ships as:** v201

---

## The idea in one picture

The Catalog page holds three kinds of thing, and it currently draws two of them
identically. A supermarket carries the distinction cleanly:

```
  AISLE            SHELF                 STICKERS ON THE JAR
  ─────            ─────                 ───────────────────
  Fitness          Sedentary             weight loss
  Yoga        →    Moderate         →    diabetes        ← a jar carries
  Nutrition        Active                PCOD              several at once
  Mind Wellness                          muscle building
  Motivation
  you are IN one   every jar sits on     they cut ACROSS
  aisle at a time  exactly ONE shelf     aisles and shelves
```

The tiers differ in **how many you may pick**: one aisle, exactly one shelf, any
number of stickers. That is the whole of the visual problem, and the whole of the
visual solution.

The second idea: an item authored in the Catalog carries a picture, a film and a
set of instructions, and **those reach the client**. Today they do not — for four
of the five libraries the client sees stock art chosen by a regular expression.

---

## Part A — the three tiers (TJ points 1, 3, 4)

### A1. Category and tag stop sharing a row

`chipsRowHtml()` (console-catalog.js) concatenates `trackBtns + tagBtns` into a
single `.tfil` row, so fifteen identical teal pills scroll past in one strip and
nothing says which are exclusive.

| Tier | Now | After | Why that shape |
|---|---|---|---|
| Library | underlined `.tabs` row | **unchanged** | already the strongest mark on the page, already right |
| Category | teal pill in a shared row | segmented control on a recessed track, own row, labelled `Category`, with an `All` member | the universal "pick exactly one" shape |
| Tag | identical teal pill, same row | smaller wash chips, own row, labelled `Tags`, each carrying its count | small + multiple + counted reads as "narrow it down" |

```
BEFORE                          AFTER
┌──────────────────────────┐    Category  ┌────┬───────────┬────────┬──────┐
│Sed│Mod│Act│wt loss│diab..│              │ All│ Sedentary │Moderate│Active│
└──────────────────────────┘              └────┴───────────┴────────┴──────┘
 fifteen identical pills
 in one scrolling row           Tags  ⟨weight loss 4⟩ ⟨diabetes 2⟩ ⟨PCOD 3⟩
```

New CSS, `.cat-` prefixed, written by the Catalog view's own `render()`:

- `.catseg` — the segmented control: a `--surface-2` track, `--r-full`, one
  selected member raised onto `--bg` with elevation 1. Not a pillar colour: this
  is a control, and §2 of the colour law keeps pillar colour in that pillar's own
  dial, dot, ribbon and series.
- `.cattags` — a wrapping chip row; `.on` fills with `--brand-fill`.
- `.catfl` — the small `--t-micro` uppercase label that names each row.

Counts come from the items **after the category filter is applied but before the
tag filter is**, which is what makes a faceted count honest: it answers "how many
would I get if I added this tag", not "how many exist in total". Same grammar
People & Access shipped in v198.

A tag whose count is zero under the current category is rendered disabled rather
than hidden — a chip row that reshuffles as you filter is unreadable.

### A2. The author sheet names its library

`'<div class="h1">' + (isNew ? 'Add item' : 'Edit item')` becomes
`Add item — Fitness` / `Edit item — Fitness`, built from the existing `libName()`
so the naming rules hold: key `culture` prints **Nutrition**, key `wellness`
prints **Mind Wellness**. The film library keeps its own noun — `Add film —
Motivation`. Em dash, matching house typography.

### A3. Tags become a multiselect

The comma-separated `<input>` is replaced by toggle chips drawn from the governed
vocabulary (Part B). No typing, so `diabetes` / `Diabetes` / `diabetic` can no
longer become three tags that filter three different ways.

A coach cannot mint a tag from inside this sheet. If the vocabulary is empty the
field says so and points at Configuration. Tags already on an item but no longer
in the vocabulary still render, marked, so nothing is silently dropped.

---

## Part B — two governed vocabularies (TJ point 2)

| Key | Replaces | Read through |
|---|---|---|
| `store.tracks` | `HV.TRACKS` (core.js:31) **and** `TRACKS` (console-catalog.js:31) — two copies of one list | `HV.tracks()` |
| `store.catTags` | nothing; tags are currently whatever anyone typed | `HV.catTags()` |

`HV.tracks()` and `HV.catTags()` read store-then-seed, the same shape as
`HV.shape()`, because data.js builds the seed at parse time when `HV.store` is
still null.

Both keys join the boot-refill list at core.js:3665.

**Verified, and narrower than it looks.** That list grafts a key only when it is
**absent** — `if (!HV.store[k] && HV.seed[k])`. It never refreshes one. Proven at
runtime: pushing a fourth option onto `seed.assessFlow` and rebooting still read
the old three; only a `seedVersion` bump rebuilt it. So a **new** key lands in
every existing save (it is absent from all of them), while an **edit to seeded
content** does not. `store.catalog` is not on that list at all, despite the
comment at data.js:2294 claiming it is — which is why authored items survive a
reload, and why seeding new media onto existing items needs the version lever.

A new **Configuration → Catalog** tab holds both editors, gated on
`manageConfig` exactly as the other tabs are; roles that reach Configuration
through nav membership see it read-only.

### B1. Deletion is refused while something uses the value

Adding is free. Deleting a category or a tag that is still in use is refused,
with the count stated: `3 items and 1 template are on this shelf.` One rule for
both lists, so there is one thing to learn. Renaming a label is free — the key
never changes, which is what keeps stored items pointing at the right thing.

### B2. What a new category actually does — verified at runtime

A category is not only a catalog filter. The key is `client.track`, and it also
indexes the level books (`HV.store.program[pillar][track][level]`) and the
level-review criteria.

An adversarial audit booted core.js + data.js in a node harness and set
`c.track` to `'athlete'`, `null`, absent and `42`, then called `HV.levelup` on
all four pillars and `HV.tasks`. **Nothing throws, in any case.** But the claim
that "every reader falls back to Sedentary" is false — seven do not:

| Site | What actually happens with an unknown key |
|---|---|
| core.js:2619 `trackLabel` | prints the **raw key**, and client-plan.js:1476 renders it **to the client** as a pill reading `athlete` |
| console-catalog.js:103, :435 | print the raw key |
| console-clients.js:1040 | capitalises it → `Athlete` |
| console-clients.js:1403 `catalogFor` | falls back to the **entire library**, not to Sedentary |
| console-builder.js:412 | substitutes an empty levels map |
| console-catalog.js:295 → :338 | **silent data loss** — see B3 |

So three things must be built rather than assumed:

- **`HV.trackLabel(key)`** becomes the single label reader, store-backed, falling
  back to the raw key only when the category has genuinely been deleted. This
  also unpicks a cross-wire found by the audit: core.js:2618 takes the Nutrition
  card's *label* from `bodyCriteria` while taking its *goals* from
  `cultureCriteria`, so adding a track to one alone made the client's card read
  `Athlete` over Sedentary goals. Reading the label from `store.tracks` removes
  the second source entirely.
- The Config `.audit` line states the real behaviour:
  > New categories fall back to the Sedentary level book until one is written for
  > them. Templates and catalog items file under it immediately.
- `HV.TRACKS` (core.js:31) is **dead** — confirmed zero readers repo-wide. It is
  deleted, not migrated.

### B3. A live bug this fixes

`openAuthorSheet`'s Track `<select>` (console-catalog.js:295) sets `selected`
only on an exact key match. Open the editor on an item whose track is not in the
list and no option is selected, so the browser lands on index 0 — Sedentary — and
the Save handler at :338 writes `item.track = select.value` **over the real
value**. Because `store.catalog` is not boot-refilled, that reclassification
survives a reload.

The segmented editor must therefore render an unmatched value as an explicit
member rather than dropping it, and Save must not rewrite a field the user never
touched.

Two smaller live defects, also confirmed, fixed in passing:

- `tagUnion`'s `seen = {}` inherits `Object.prototype`, so a tag named
  `constructor`, `toString` or `__proto__` never becomes a chip although it still
  prints on the item. The governed vocabulary replaces this lookup; the
  replacement uses a prototype-less map.
- console-catalog.js:112 puts a `.grow` inside a `.trow` with no rule of its own
  — the exact defect CLAUDE.md documents — so Catalog rows already show their
  trailing pill mid-row. The new row CSS carries its own `.grow` rule.

---

## Part C — the media pipeline (TJ point 5)

### C1. What is broken

```
  CATALOG ITEM                TEMPLATE                CLIENT'S TODAY
  ci-squat                    tp-fit-l1               ┌──────────────┐
  ├ media.ref  ──┐            day 3 slot              │ [img] Strength│
  ├ instructions │            options:[[ci-squat]] ──►│  (bands) II   │
  └ tags         │                                    └──────────────┘
                 │                                           ▲
                 └──── never arrives ──✗                     │
                                                    img/tasks/fitness-strength.webp
                                                    stock art, picked by REGEX on the label
```

`HV.tasks()` (core.js:2903) builds Fitness, Yoga and Mind Wellness cards from the
**level book**, and sets `art` from `HV.ui.taskArtSrc(pillar, label)` — a generic
family picture resolved by matching words in the label. Nutrition is the
exception: `HV.plateFor()` already walks template → catalog, which is why a real
dish name reaches the plate.

So media authored on a Fitness, Yoga, Mind Wellness or Motivation item is
currently **write-only**. That gap is the substance of point 5.

### C2. The data model barely moves

`media` gains two fields and keeps the old ones, so **nothing needs migrating**:

```js
media: { image: 'img/tasks/…webp',    // NEW — tile picture and sheet hero
         video: 'https://youtu.be/…',  // NEW — plays inside the instruction sheet
         kind: 'youtube', ref: '…' }   // KEPT — HV.film still reads these
```

`HV.itemMedia(item)` normalises both shapes and is the only reader:

| Wanted | Source order |
|---|---|
| image | `media.image` → `media.kind === 'photo' ? media.ref : ''` |
| video | `media.video` → `media.kind === 'youtube' ? media.ref : ''` |

The legacy seed therefore keeps working untouched: every pillar item already
carries `{kind:'photo', ref}` and every film `{kind:'youtube', ref}`.

**The text needs no new field.** `item.instructions` already exists. It becomes a
multi-line textarea, and each non-empty line becomes one step page — the same
shape `HV.howto` (data.js:2850) already produces.

Attachment is by **path or URL with a live preview thumbnail**, never a file
picker: the store is one localStorage key holding the entire demo world, and a
few base64 photos would pass the quota and stop *everything* saving.

### C3. The pipeline

```
  NOW                                   AFTER
  level book ─► HV.tasks ─► card        template slot for THIS DAY
       │                    ▲                │
       │                    │                └─► catalog item ─► HV.tasks ─► card
  regex on label ───────────┘                        │                        ▲
                                                     └── own image, video, ────┘
  ✗ media never arrives                                  instructions

                                        no template that day ─► level book (unchanged)
```

`HV.tasks(client, day)` — `day` defaults to `client.day`. For fitness, yoga and
wellness:

1. `slots = HV.slotsFor(client, pillar, day)`; if empty, fall back to the level
   book exactly as now (Priya has no plan assigned; the pillar-plan pages are
   level-scoped, not day-scoped — both must keep working).
2. For each slot, the **first option group** becomes the task cards — one card
   per catalog item. First-group-only is the rule `HV.slotSum` and `HV.doseOf`
   already use: alternatives are alternatives, not extra work.
3. Later option groups become an **Or instead** page on the sheet — the word the
   plate already uses.
4. The `sub` line is the dose via `HV.doseOf(slot, pillar, key)`, formatted per
   `HV.slotSpec[pillar].fields`, so sets/reps/RPE/minutes/focus each print in the
   pillar's own language.
5. `art` is `HV.itemMedia(item).image`, falling back to `HV.ui.taskArtSrc()` so an
   item with no picture yet still renders rather than showing a broken image.

### C4. The desync trap, and the fix

`HV.tasks` is called **twice** per surface — once to draw rows via
`HV.ui.taskRow(item, trailing, groupId, index)`, once to attach taps via
`HV.ui.wireTasks(root, HV.tasks(client))`. The two calls must return arrays of
identical order and length or `data-topen="fitness:2"` opens the wrong exercise.

`openTaskSheet()` (client-plan.js:347) can be opened for a session on **any** day
— it computes `itDayN` for exactly that reason — but wires with a bare
`HV.tasks(client)`. Make `HV.tasks` day-aware without threading the day through
and every tap on a non-today session sheet opens the wrong task.

So the day is threaded, never defaulted twice:

| Site | Change |
|---|---|
| client-plan.js `pillarBlock(client, key, it)` | takes `day`, passes to each block fn |
| client-plan.js `openTaskSheet` | renders **and** wires with `itDayN` |
| client-plan.js:1212 full-plan page | renders and wires with `client.day` |
| client-today.js:516 | `HV.tasks(c, todayEntry ? todayEntry.day : c.day)` |

That last line fixes a live bug on the way past: Today already supports browsing
another day (`#/today/3`) and shows that day's sessions, but its task cards come
from the day-blind level book — so day 3 currently lists today's exercises.

### C5. The instruction sheet gains the film

`HV.taskSheet(item)`'s first page becomes **video and text together**, which is
what "contains the video along with text instructions" asks for:

```
┌─────────────────────────┐
│      hero image         │  ← media.image
├─────────────────────────┤
│ Chair squats            │
│ 3 × 10 · RPE 5          │
├─────────────────────────┤
│ How to do it            │
│ ┌─────────────────────┐ │
│ │   ▶  embedded film  │ │  ← media.video, 16:9, only when there is one
│ └─────────────────────┘ │
│ Stand in front of a     │  ← instructions, line by line
│ sturdy chair…           │
├─────────────────────────┤
│  ‹      1/4        ›    │
└─────────────────────────┘
```

Pages, in order: **How to do it** (film + first instruction line) → one page per
remaining instruction line → **Caution** if set → **Or instead** if the slot
carries alternatives → **At a glance** (unchanged).

The embed reuses `HV.film.ytId()`, which already accepts a full link, a
`youtu.be` link, a Shorts link or a bare id. No video → the page is text only,
exactly as now.

This also retires a small dishonesty: the current `.chip vid` links to a YouTube
**search results page** for the exercise name, presented as though it were the
exercise's video. Where a real video exists it now plays; where none does, the
search chip stays, which is the truthful version of the same offer.

`.tvid` (16:9 container, `--r-md`, `overflow:hidden`) goes in **app.css**, not in
a view's `<style>` block — the task sheet is reachable from Today, My Plan and the
pillar pages, and a sheet that only styles itself when one particular view has
rendered is the exact defect that printed `Mon6:00 am12:00 pm` in v198.

---

## Files touched

| File | Change |
|---|---|
| `js/core.js` | `HV.tracks()`, `HV.catTags()`, `HV.itemMedia()`; `HV.tasks(client, day)` reads templates for the three session pillars; `HV.taskSheet` video page; two keys onto the boot-refill list; `HV.TRACKS` literal retired |
| `js/data.js` | `seed.tracks`, `seed.catTags`; item `media.image` / `media.video` on seeded items where useful |
| `js/views/console-catalog.js` | three-tier filter bar, faceted counts, per-library heading, tag multiselect, media fields with preview, `TRACKS` literal retired |
| `js/views/console-config.js` | new **Catalog** tab — categories and tags editors |
| `js/views/client-plan.js` | day threaded through `pillarBlock` and both wire sites |
| `js/views/client-today.js` | `HV.tasks(c, day)` for the browsed day |
| `css/app.css` | `.tvid`; catalog filter-bar classes if shared |
| `index.html`, `sw.js` | `?v=201` on every asset; `CACHE = 'haalving-demo-v201'` |

**`HV.seedVersion` 43 → 44.** The two new vocabulary keys would not need it — they
graft on absence. But seeding `media.video` onto existing catalog items does:
`store.catalog` is not boot-refilled, so without the bump a returning user's saved
items would carry no film and the feature would be invisible until they reset the
demo. The bump is the honest lever; saved demo state resets, which is the normal
cost in this repo.

---

## What could go wrong

- **The double-call desync (C4)** is the one that will actually bite. Symptom is
  quiet: taps open a neighbouring exercise instead of erroring.
- **A pillar with a template but an empty day.** Fitness runs on alternate days;
  `slots` is legitimately `[]` and the level-book fallback must fire, or Today
  goes blank on half the cycle.
- **An item id in a template that no longer exists in the catalog.** Already
  survivable for films (`HV.motivationFor` walks past it); the new resolver must
  skip unknown ids rather than push `undefined` into the card list.
- **`.grow` is scoped to `.row`, never `.trow`.** Any new row component needs its
  own `.grow` rule or its trailing pill sits mid-row.
- **Rendering a track key that no longer exists in `store.tracks`** — an item
  filed under a deleted category. Deletion is refused while in use (B1), so this
  can only arise from a hand-edited store; the label falls back to the raw key.
- **Quiet hours and the 45 s sweeps are untouched** by this work, but a test run
  after 22:00 still fails delivery assertions unless it passes a daytime
  `nowMin` — the standing trap in this repo.
