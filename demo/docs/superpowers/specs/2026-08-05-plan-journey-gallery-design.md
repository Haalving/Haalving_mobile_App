# My Plan — Journey Gallery design

**Date:** 2026-08-05 · **Status:** approved-by-default (TJ said "continue"; decisions below are the recommended options)

## The idea in one line

A **gallery chip** becomes the first item in the Plan cycle strip; selecting it turns the
Calendar tab into a zoomable wall of **every day the client has walked** (like a phone
photo gallery), and turns the other tabs into one flowing all-time list.

## The analogy — a photo gallery of your journey

Your phone's photo app has two truths at once: pinch out and you see *years* — hundreds
of tiny squares, the shape of your life at a glance; pinch in and you see *one day* —
each photo readable. The Plan calendar today only has the "one day" view (one cycle at a
time). The Journey Gallery adds the "years" view: the whole journey as a wall of day
cells, one row per cycle, and a pinch (or a button) moves you between the two densities.

## Big picture

```
cycle strip:  [▦ gallery] [Cycle 8 · now] [Cycle 7] ... [Cycle 1]
                   │
                   ▼ (viewCycle = 'all')
   ┌────────────────────────────────────────────────┐
   │ Calendar tab      →  zoomable wall of all days │
   │   z0 "journey"    →  1 row per cycle, 11 tiny  │
   │                      cells, status washes      │
   │   z1 "days"       →  per-cycle .calc grids of  │
   │                      full day cells (existing) │
   │ Weight goals tab  →  ledger + EVERY cycle      │
   │                      report, flowing           │
   │ Level-up tab      →  all 4 pillars' criteria   │
   │                      inline, flowing           │
   │ Daily activities  →  unchanged (already        │
   │                      journey-wide targets)     │
   └────────────────────────────────────────────────┘
```

## Decisions (and why)

1. **Scope: all walked cycles** — every `cycleHistory` entry has a generated calendar in
   `calendarsPast` (data.js:1554) plus the live cycle in `calendars`. A cycle-8 client
   shows 88 cells; a cycle-3 client shows 33. No ghost/future cells: the gallery is the
   *record*, and the record only contains days that happened. (The "77 days" in the ask
   is the 7-level program arc; carries make the real number per-client, so we show what
   was actually lived.)
2. **Two zoom densities, not continuous zoom** — like iOS Photos, zoom *snaps* between
   grids. z0 = the wall (everything visible at once); z1 = the existing `.calc` day-cell
   grid stacked per cycle. Continuous CSS-transform zoom would blur text and fight
   scrolling; density snapping is what photo galleries actually do.
3. **Three ways to zoom** — pinch (two-finger spread/squeeze on the wall), the +/−
   buttons (desktop, accessibility), and **tap a z0 cycle row to zoom into it** (like
   tapping a year in Photos). Pinch alone would strand desktop and switch-access users.
4. **Gallery day sheets are read-only** — tapping a day at z1 opens the existing day
   sheet as the record (live=false), even for the current cycle. Acting on today stays
   on the "Cycle 8 · now" chip; the gallery is for looking back, and a mark-done from
   inside it would re-render and dump the user out of gallery mode anyway.
5. **Other tabs flow, not filter** — gallery + Weight goals = goal ledger followed by
   every cycle report chronologically (reuses `reportHtml`); gallery + Level-up = all
   four pillars' criteria cards inline (reuses `HV.levelup`) instead of tap-per-pillar
   sheets; Daily activities is already journey-wide standing targets, so it reads the
   same — honest, not broken.

## Components

- **`cycleStrip()`** — prepend an icon-only `.cyc` chip (`grid` icon, aria-label
  "Whole journey — every cycle"), `data-cy="all"`. Wire: `'all'` string sidesteps the
  `Number()` cast.
- **`galleryTab()`** (new, in client-plan.js) — builds `[{cycle, days, live, report}]`
  from `calendarsPast` + current `calendars`, oldest first; renders per density:
  - **z0**: per cycle a label line ("Cycle 1 · L1 · achieved") + an 11-column grid of
    `.gc` cells — serif day number on a status wash (`--ok-wash` all-done, `--danger-wash`
    any-missed, `--surface-3` rest, plain upcoming; today keeps the brand outline).
  - **z1**: per cycle a `card` with title + the existing `bigCell` grid (`.calc`), day
    taps open `openDaySheet(client, d, false)`.
- **Zoom state** — a `galZoom` variable alongside `tab`/`viewCycle` in the view closure;
  survives re-draws within the view, resets on route change (same lifetime as `tab`).
- **Pinch** — non-passive `touchstart/touchmove` on the gallery wrap; two-finger distance
  ratio > 1.25 → zoom in (anchored to the cycle under the pinch midpoint),
  < 0.8 → zoom out. `touch-action: pan-y` + `preventDefault()` keeps the browser's own
  page-zoom from swallowing the gesture (the viewport meta allows user zoom).
- **Anchoring** — zooming in from a tapped/pinched cycle re-renders then
  `scrollIntoView`s that cycle's section (smooth unless `prefers-reduced-motion`).
- **CSS** (app.css, tokens only) — `.galtools` (zoom buttons row), `.galcy` (cycle label),
  `.galc` (11-col grid), `.gc` (+`.ok/.miss/.rest/.today` washes). z1 reuses `.calc`
  wholesale. Dark mode arrives free via the wash tokens.

## Data flow

`cycleHistory` + `calendarsPast[clientId]` + `calendars[clientId]` (all already in the
store) → `galleryTab()` assembles → render string → `el.innerHTML` → listeners by
`[data-*]` — the standard view shape. **No seed change, no new data**, so `seedVersion`
stays put; ship needs only the `?v=` bump + `sw.js` CACHE bump (both, per CLAUDE.md).

## Edge cases

- **Observation clients** (no `cycleStrip`): unchanged — no strip, no gallery.
- **No history** (cycle 1, live calendar only): gallery shows the one live cycle; still
  valid ("your journey so far is one cycle").
- **Current cycle inside the wall**: z0 washes derive from real item statuses (done →
  ok wash only when *all* items done; missed → danger wash; future → plain).
- **Missing past calendar** for a history entry: skip the grid, still show the report
  row in Weight goals (defensive read, not invented data).

## What could go wrong

- **Pinch vs scroll**: two-finger gestures near the edge of the wall may start a scroll
  first. `touch-action: pan-y` mitigates; buttons are the fallback path.
- **Re-render kicks you out**: any `HV.refresh()` resets closure state (tab, viewCycle,
  zoom). Mitigated by read-only day sheets in gallery (decision 4).
- **Cell tap targets at z0** are ~30px (below 44px): acceptable because z0 cells are not
  the only path to a day — the whole row is a "zoom in" target, and days are properly
  tappable at z1.
- **Version bump race** with concurrent sessions: re-grep the live `?v=`/CACHE values at
  ship time and adopt highest+1.

## Why does this matter?

The product's promise is "the coach's judgement above the AI, levels earned never
erased" — but the record of that journey is currently only visible one cycle at a
time. The gallery makes the whole climb visible in one glance, which is exactly the
thing a client on their 8th cycle wants to feel.
