# My Tribe · honeycomb version — design

**Date:** 6 Aug 2026
**Status:** approved for build
**Why:** the client rejected the feed-first My Tribe page. This is a second version
that keeps the tribe's *content* and throws away its *shell*. The old page is
retained, not deleted.

---

## The shape of it

```
  the old page                          the new page
  ────────────                          ────────────
  a story ring row                      a greeting + a score
  a scrolling feed of posts    ──►      three hexagons (the doors)
  (likes, comments, photos)             four tiles (the shelves)
                                        what you have joined (only if you have)

  the three faces behind the rings — quiz book, events deck,
  challenges deck — are UNCHANGED and shared by both pages.
```

Think of it as a hotel. The old page was the **lobby noticeboard**: everything
pinned up at once, newest on top, you scroll past other people's photos to find
the thing you came for. The new page is the **lift lobby**: three big doors, four
labelled shelves, and nothing on the walls. The rooms behind the doors are the same
rooms.

---

## Reference and what we take from it

TJ supplied a screen from the Wim Hof app. What we take:

| Taken | Left behind |
| --- | --- |
| The honeycomb: two hexagons above, one nested below | Their hues (teal / ice / amber) |
| Gradient fills inside each hexagon | The raised centre tab-bar logo |
| Large hairline icon + two-line label per hexagon | The bottom nav (we already have one) |
| A 2×2 grid of dark tiles beneath | Their icon-left / text-right tile layout |
| A greeting and a single counter at the top | Their second avatar (our shell has one) |

---

## 1. Route and file layout

| Thing | Before | After |
| --- | --- | --- |
| Honeycomb page | — | `#/tribe` · `app/js/views/client-hive.js` |
| Feed page | `#/tribe` | `#/tribe-classic` · `app/js/views/client-tribe.js` |
| Tab bar seat "My Tribe" | `#/tribe` | `#/tribe` (now the honeycomb) |

The tab keeps its label and its icon. The old page stays one tap away: a quiet
`.audit` line at the foot of the honeycomb reads *"The earlier Tribe feed is still
here"* and links to `#/tribe-classic`.

**Nothing is deleted.** `client-tribe.js` changes in exactly two ways:

1. its route constant becomes `#/tribe-classic` and it registers under that name;
2. it hangs its three face-openers on `HV.tribeFaces` so the honeycomb can open the
   same sheets.

### Why share rather than copy

The quiz book, the events deck and the challenges deck are ~200 lines of working,
reviewed, accessible code. Copying them into a second file means every future fix
has to be made twice, and the second copy is the one that gets forgotten. The
export is four lines.

```
client-tribe.js                        client-hive.js
  ├─ the feed        (its own)           ├─ the honeycomb   (its own)
  ├─ the rings row   (its own)           ├─ the four tiles  (its own)
  └─ openFace() ────────────┐            └─ HV.tribeFaces.open() ──┐
                            └──────────────────────────────────────┘
                                    ONE implementation
```

`HV.tribeFaces.open(params, home)` — `home` is the hash the back chevron, the close
X and the backdrop all land on, so each host page keeps its own trail. The old page
passes `#/tribe-classic`; the honeycomb passes `#/tribe`.

---

## 2. The page, top to bottom

### 2.1 The greeting row

Left: `Welcome,` on one line, the client's name on the next, in the display face.
Right: a hairline circle holding one serif numeral — **stars earned in today's
quiz**, 0–5. It is the only number on the page above the fold, so it gets the data
face and an `aria-label` that says what it counts.

No avatar here — the client shell's own header already carries one, eight pixels
above. Two avatars in one viewport is a bug, not a feature.

### 2.2 The honeycomb — three doors

| Position | Door | Icon | Fill |
| --- | --- | --- | --- |
| top-left | Health Quiz | `bulb` | deep teal, dark → darker |
| top-right | Events | `cal` | pale ice-mint, light → less light |
| below, centred | Challenges | `flame` | pale honey, light → deeper |

Each hexagon carries, stacked and centred: the icon at 30% of the hexagon's width,
the label in up to two lines, and one line of live meta —

- Health Quiz → `n of 5 today` once anything is answered, `5 questions today` before
- Events → `n coming up`
- Challenges → `n running`

Behind the three, four **ghost hexagons** at 4% white — larger, unlabelled, clipped
by the section. They make the three read as three cells of a comb rather than three
loose badges.

#### Geometry

**Regular** flat-top hexagons: flat edges top and bottom, points left and right,
six equal sides and six 120° corners. That last part is a constraint, not a
description — a flat-top hexagon is regular *only* when

```
    height = width × √3/2  ≈  width × 0.86603
```

The first draft used 1.02 (near-square, matching a rough measurement of the
reference). At that ratio the four slanted sides run 13% longer than the two flat
ones and the corners alternate 116° and 128°, which reads at a glance as a
hexagon drawn slightly wrong. Verified after the correction: all six sides
79.95px, all six angles 120.00°.

The mask SVG's viewBox is therefore `0 0 100 86.603`, matching the element's own
aspect ratio, so `preserveAspectRatio="none"` scales it uniformly and the rounded
corners stay circular instead of being squashed vertically.

Two above with a small gutter; the third centred and pulled up so it nests in
their gap. In a `--hex` unit `H`:

```
      ┌── H ──┐ gap ┌── H ──┐
      ╱‾‾‾‾‾╲       ╱‾‾‾‾‾╲          row 1
     │ QUIZ  │     │EVENTS │
      ╲_____╱       ╲_____╱
            ╱‾‾‾‾‾╲                  row 2, pulled up by H/4,
           │ CHAL  │                 centred on the gutter
            ╲_____╱
```

The shape is cut twice, on purpose:

- `clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)` — a sharp
  hexagon, which is what decides **where taps land**;
- `mask-image` with an inline-SVG rounded hexagon — which is what you **see**.

The mask rounds the six corners; the clip keeps the hit area a hexagon so the two
top cells never steal each other's taps in the gutter. The clip is a superset of the
mask by a few pixels at each corner — a rounding error in the toucher's favour.

`preserveAspectRatio="none"` on the mask SVG lets one path serve every size.

#### The focus ring has to live inside the shape

`clip-path` cuts at the border box, and the app's global `:focus-visible` outline
is painted **3px outside** it — so a keyboard user tabbing onto a hexagon saw
nothing at all. Verified in headless Chrome: `:focus-visible` matched, the
outline computed as a solid 2px teal, and not one pixel of it reached the screen.

The ring is therefore drawn inside: the hexagon mask, XOR a copy of itself inset
8px, leaves a hexagonal band hugging the edge, painted in the cell's own ink
(already contrast-checked against its fill). Where `mask-composite` is missing
that `::after` would be a solid hexagon rather than a ring, so an `@supports`
guard drops it and falls back to an inset band the polygon trims to the flat top
and bottom edges — partial, but unmistakable.

#### Scroll position

Core's `render()` scrolls to top on every route change. Opening a face hides
that (the sheet covers the page) and closing one reveals it: you land back at
the top with the row you tapped off screen. Measured before the fix: 322 → 0.
The honeycomb carries the same two halves the feed page has had since v116 — a
`hashchange` listener that banks `scrollY` before core re-renders, and a
`requestAnimationFrame` restore after.

The route test must be exact, not a prefix: `'#/tribe-classic'.indexOf('#/tribe')`
is `0`, so a plain `startsWith` would hand the honeycomb the feed page's scroll
position every time you left it.

### 2.3 The four tiles

A 2×2 grid of cards — tone and shadow, no border, per the design system. Icon
medallion top-left, label beneath in up to two lines.

| Tile | Icon | Behaviour |
| --- | --- | --- |
| Our Partners | `award` | opens a sheet listing the studios, clinics and kitchens |
| E-Learning & Content | `doc` | opens a sheet listing the current reading and film |
| Placeholder 3 | `grid` | quieted, `Soon` pill, toasts |
| Placeholder 4 | `flow` | quieted, `Soon` pill, toasts |

A not-yet tile changes **colour**, not opacity: label to `--ink-2`, icon to
`--ink-3`, and a `neutral` rather than `info` pill. This is the rule
`.btn[disabled]` already follows, and for the same reason — a group `opacity`
composites the pill's fill *and* its ink against the page, and the first draft's
`.58` put that 12px "Soon" at 2.65:1. Measured after the change: pill 6.22:1,
label 6.87:1.

Partners and e-learning content are static reference lists with no user state, so
they live as constants in the view file rather than in `HV.seed` — nothing about
them is ever written back.

### 2.4 What you have joined

Only drawn when the client has enrolled in something: a `.sec-title` and a `.list`
of `.trow`s, each opening that gathering's own route. Status by exception — an empty
section is not drawn at all, so a client who has joined nothing sees a page that
ends at the four tiles.

This replaces the squared "mine" rings on the old page. Enrolling has to have a
visible consequence somewhere, or the join button is a lie.

---

## 3. Colour

The design system's second law: *a pillar's colour appears only in that pillar's own
dial, dot, ribbon and series.* The reference's three hues would break it — its amber
is within a few percent of `--culture` (Nutrition) in dark mode, and its teal is the
brand.

So the honeycomb gets **its own three-token palette, declared once, used nowhere
else**:

```css
--hx-quiz-a / --hx-quiz-b     deep teal      #0F5B56 → #093F3C   white ink
--hx-event-a / --hx-event-b   pale ice-mint  #CDDED8 → #A7C3BA   dark ink
--hx-chal-a / --hx-chal-b     pale honey     #EFDCB0 → #C9AE74   dark ink
```

Two of the three sit deliberately close to things the product already means:

- the deep teal is the brand's own family — the tribe is HAALVING's own room;
- the honey is the **star** gold (`#EAD9AF`), which in this app already means
  *earned*. Challenges are the earning axis. It is materially paler and less
  chromatic than `--culture`'s `#D9A63F`, so it cannot be misread as Nutrition.

Ink on the pale fills is `#141A17` (`--ink` in light mode), which clears 4.5:1 on
both. Ink on the deep teal is white, which clears 7:1.

Gradients run **135°** — light from the top-left, the same direction as every card
shadow in the app.

---

## 4. What is not on this page

- **The feed.** No posts, no photos, no likes, no comments, no double-tap heart, no
  share, no save. All of it still exists, at `#/tribe-classic`.
- **The story rings.** The three doors replace them; enrolments moved to §2.4.
- **A second avatar.** The shell has one.
- **Any new seed field.** `HV.seedVersion` does not move.

---

## 5. Ship checklist

1. `app/js/views/client-hive.js` — new file.
2. `app/index.html` — add the `<script>`, bump **every** `?v=143` → `?v=144`.
3. `app/sw.js` — add `'./js/views/client-hive.js'` to `ASSETS`, bump
   `CACHE` to `haalving-demo-v144`. A path typo here fails the whole `addAll`.
4. `app/css/app.css` — one new block at the end, plus `.hxlink` added to both
   halves of the shared touch-reach utility.
5. `app/js/core.js` — one line: `tabOn` lights the My Tribe seat on
   `tribe-classic` too, the same way `meal` lights Today. The retained feed page
   is still My Tribe, and the shell should say so.

---

## 6. What could go wrong

**The mask does not land and you get sharp hexagons.** Safari needs
`-webkit-mask-image` as well as `mask-image`. Both are written. If a browser has
neither, the `clip-path` still draws a correct hexagon — it just has crisp corners.
Degrades, never breaks.

**The two top hexagons steal each other's taps.** This is what the `clip-path` is
for. Without it, each button is a rectangle, the rectangles overlap in the gutter,
and the one later in the DOM wins a tap meant for its neighbour. Try deleting the
`clip-path` line and tapping between the two — the wrong sheet opens.

**The client shell is always dark.** `body:has(.shell-client)` forces the dark token
set regardless of the OS setting, in three separate blocks. So the honeycomb must be
checked *in the client shell*, not by flipping the OS theme — the page will look
dark either way and a light-mode bug can hide for weeks.

**A stale service worker serves v143 files.** The cache name is the real lever; the
`?v=` query string is stripped by `ignoreSearch: true`. If the honeycomb does not
appear after a reload, the `CACHE` constant did not move.

**A persisted store predates the quiz book.** `client-tribe.js` already self-heals
this by replacing `tribeFeed` from the seed. The honeycomb reads the same store, so
it must run the same check before drawing, or `tf.quizDays[0]` throws on an old
store.

**Someone deep-links `#/tribe/quiz`.** The honeycomb owns `#/tribe` now, so it must
handle the same sub-routes the old page did, or the back chevron on a face lands on
a lock screen.

---

## 7. Why does this matter?

The tribe is the only part of HAALVING that is other people, and the client looked at
it and saw Instagram. This version says the opposite thing with the same content:
here are three things to do and four places to look, and none of them are somebody
else's holiday photos.
