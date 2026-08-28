# Mind Wellness rename + abstract pillar marks — design

Date: 2026-08-03 · Requested by TJ · Shipped as v120

> **EPILOGUE (same evening, v130): the abstract-art direction was REVERTED at
> TJ's instruction** — "Revert to the old version for piller images as well as
> piller tasks." Photographic pillar images and the task wash tiles are
> restored and canonical. What survives from this spec: the Mind Wellness
> rename, the radar two-line label rule, the lvlmap legend wrap, and the
> process.py enclosed-window keying (tools only). The abstract set is archived
> in `tools/work/out/`.

## The two asks

1. Pillar display name **"Mindspace" → "Mind Wellness"** everywhere a person reads it.
2. The four **pillar hero images** (`app/img/pillars/*.webp`) become **abstract marks**
   in the spirit of TJ's reference image (soft stacked zen-stones figure) —
   "understandable but abstract", current pillar colours retained.
   **Task art is explicitly out of scope** — the photographic task set stays.

## Decisions (made autonomously, TJ away)

- **Keys stay frozen** per the 30 Jul naming rule: `wellness`, `mind`, `p-wellness`,
  `img/onboard/mindspace.webp` are untouched. Only display strings changed
  (21 occurrences across core.js, data.js, 4 client views + CLAUDE.md).
- **Radar gutter re-measured.** The Journey Index radar's left padding (`PX` in
  `core.js index()`) was sized for the 9-char "Mindspace" (~65 viewBox units).
  "Mind Wellness" is ~88 units → `PX 80 → 104`, verified visually in the browser.
- **All four marks regenerated, including wellness.** TJ's attachment is a cropped
  phone screenshot (too small to ship). A clean matching stacked-stones mark was
  generated so the set is stylistically coherent. Wellness keeps its **purple**
  token family ("current colour may be retained"), not the reference's green.
- **Art pipeline: existing `tools/gen.sh` + `process.py` (grade mode, 640px).**
  The matte-clay museum-specimen prompt produces exactly the reference's soft
  abstract look, and the luminance→token remap guarantees each mark lives inside
  its pillar's CSS colour family by construction. Transparent background (marks
  sit on pillar washes in-app), not the reference's dark circle.
- **Subjects** (recognisable at 64px, one silhouette each):
  - wellness · balanced stack of three rounded stones (seated-meditator read)
  - yoga · figure in tree pose, arms meeting overhead
  - fitness · kettlebell (sphere + arch handle)
  - culture · low wide bowl holding three round fruits, one leaf
- **seedVersion 25 → 26** — seed display strings changed (coach titles, digest
  card draft, capacity labels).
- **Cache/asset version → v120** (all `?v=` in index.html + `sw.js` CACHE).

## Round 2 (TJ feedback, same evening — shipped v124)

- **Fitness subject replaced**: kettlebell → two abstract figures back to back
  (man flexing, woman with dumbbell), per TJ's reference image.
- **Enclosed windows keyed**: `process.py` grade mode now also keys enclosed
  near-white regions (`HOLE_THRESH 26`) — the pale fills inside yoga's arm/leg
  gaps and the kettlebell handle read as "a background"; TJ rejected them.
  Task photos ('natural' mode) deliberately untouched; task files verified
  byte-identical to the canonical photo set.
- **Radar rule learned — stack, never widen**: PX 108 shrank the whole
  instrument ~18% under the capped CSS width, pushing type below the 12px
  floor (review-workflow finding, confirmed). Fix: "Mind"/"Wellness" stacks in
  two tspans at the left vertex, PX back to 80, viewBox back to 340.
- **320px legend guard**: ellipsis removal made "Nutrition" bleed into the
  next column on 320px phones (review finding) — at ≤340px the header dot
  yields and hyphenation is the last resort.

## Round 3 (TJ feedback — shipped v126)

- TJ reported "the background still exists" + supplied a second fitness
  reference (man + woman back to back, BOTH curling dumbbells, ponytail).
- Diagnosis: a DOM sweep of every `img[src*=pillars]` across today / journey /
  plan / coaches / tribe found zero painted grounds (only the long-standing
  full-plan tile washes, v75 design). The 6× clip of a calendar mark shows art
  directly on the cell. The background TJ saw was the **pre-v124 art in his
  device's SW cache** — pale un-keyed windows baked into the v120 images.
- Actions anyway: wellness + culture reprocessed through the hole-keyed
  pipeline (byte-equivalent transparency, now provably uniform), fitness
  regenerated to the new reference in the same clay language.

## What could go wrong (watched for)

- Radar label clipping on the left edge → measured in browser, PX adjusted.
- Plan calendar `TILE_WORDS` "Mind Wellness" overflowing its half-width tile →
  visually checked light + dark.
- The photographic-set memory guard ("never revert pillar art") — this change is
  TJ's own 3 Aug instruction and covers pillar mains only; memory updated.
