# The morning film — design

**Date:** 9 Aug 2026
**Status:** approved by TJ
**Ships as:** v184

## What we are building

The client's Today page opens, once each day, with a prescribed motivational
film. When the film ends — or the client closes it — it collapses into a play
mark that lives in the Today hero band, so it can be watched again at any point
that day.

The film is not decoration and not a random quote. It is **prescribed**, the
same way a fitness set or a dinner is: authored in the Team Console's Catalog as
a Motivation library item, placed on a day of the 11-day programme template, and
resolved for the client from the template assigned to them.

## The cinema

One analogy, used throughout the code comments as well as here.

- **The library** — the reels available (Catalog ▸ Motivation)
- **The schedule** — which reel screens on which day (Templates, the 7×11 grid)
- **The projectionist** — picks today's reel for this client (`HV.motivationFor`)
- **The auditorium** — the full-bleed portrait takeover
- **The lobby poster** — the play mark left behind in the hero band

## Flow

```
CONSOLE — Ops authors                    CLIENT — first open of the day
┌───────────────────────────┐            ┌─────────────────────────────┐
│ Catalog ▸ Motivation      │            │  Today                      │
│  mv-belong   mv-move      │  the reels │    ┌───────────────┐        │
│  mv-plate    mv-breath    │───────────▶│    │  full-bleed   │        │
└─────────────┬─────────────┘            │    │   9:16 film   │  ✕     │
              │ dropped into a day       │    └───────┬───────┘        │
              ▼                          │            │ ends, or ✕     │
┌───────────────────────────┐            │            ▼                │
│ Catalog ▸ Templates       │ HV.motivationFor(c)     ┌──────────────┐ │
│  7 cycles × 11 days       │───────────▶│            │ THIS MORNING │ │
│  cy3·d4 ▸ "Morning film"  │            │            │ Good morning │ │
└───────────────────────────┘            │            │  Rajesh   ▶  │ │
                                         │            └──────────────┘ │
                                         └─────────────────────────────┘
```

**The core loop**, the smallest piece that does the fundamental thing:

```
has this client seen today's film?
  no → resolve the film for their cycle + day
     → play it
     → stamp today's date
```

Everything else layers on that.

## 1. The Motivation library

New reference catalogue: `HV.store.catalog.motivation`, a fifth library beside
the four pillar ones. It uses the **same item shape** as every other catalogue
item so the existing Catalog editor machinery works unchanged.

```js
{ id: 'mv-belong',
  name: 'The village that eats together',
  instructions: 'Ninety seconds on why the people who live longest…',
  media: { kind: 'youtube', ref: 'dQw4w9WgXcQ' },
  mins: 2,
  tags: ['weight loss', 'diabetes'] }
```

- `media.kind` is `'youtube'` or `'image'`.
- For `'youtube'`, `ref` is a video id **or** a full YouTube URL — the player
  extracts the id, so a pasted link works without thought. Placeholder ids ship
  in the seed; real films replace them later with no code change.
- For `'image'`, `ref` is a path or URL to a portrait still.
- `track` is optional here. A film is not prescribed by activity level, so the
  Motivation tab hides the track filter that the pillar tabs carry.

`catalog` is not in core's boot-refill array, so the new library lands via a
`HV.seedVersion` bump (32 → 33).

### Console

Motivation becomes a fifth tab in Catalog, after the four pillars and before
Templates. It reuses `renderPillarTab`'s grammar — search row, item rows, item
sheet, add/edit/delete — with two differences: no track filter, and a media
field that takes a YouTube link.

**Who may edit it:** `editAnyCatalog` only (Ops, Super User). Motivation is not
any pillar coach's property, so `ROLE_PILLAR` grants nothing here; pillar
coaches see the library read-only. This falls out of the existing
`canEditPillar()` check without special-casing.

## 2. The template slot

`genTemplate()` in `data.js` gains one slot on every day of every cycle:

```js
{ pillar: 'motivation', time: '6:00', label: 'Morning film',
  options: [['mv-belong']] }
```

`motivation` is a **slot kind, not a pillar**. `HV.PILLARS` keys stay frozen at
four per the 30 Jul naming decision. The four console render helpers already
degrade correctly on a key that is not in `HV.PILLARS`:

| Helper | Behaviour on `pillar: 'motivation'` |
|---|---|
| `pillarDot(k)` (console-clients.js:982) | returns `''` — no colour invented |
| `tplSlotRow(slot)` (console-catalog.js:531) | falls back to `slot.label` |
| `optionsLine(slot)` / `itemName()` | reads `catalog.motivation`, works |
| `mayEditSlot(g, slot)` | `g.all` only → Ops, which is what we want |

So the 7×11 grid, the day sheet and the AND/OR option editor pick the slot up
with no new console code.

## 3. The projectionist — `HV.motivationFor(client)`

New function in `core.js`. Resolution order:

```
1. clientPlans[c.id].overrides['<cycle>.<day>'].slots   a coach changed this day
2. templates[…].cycles[<cycle>].days[<day>].slots       the authored template
     → find slot.pillar === 'motivation', take options[0][0]
     → catalog.motivation.find(id)
3. catalog.motivation[(cycle * 11 + day) % length]      never blank
```

Returns the catalogue item, or `null` if the library itself is empty.

Step 3 matters for the demo: only two of the eleven personas have a
`clientPlans` entry, and a feature that shows nothing for nine of them cannot be
demonstrated. It is a fallback, not a shortcut — the template still wins
whenever one exists.

## 4. The auditorium

A full-bleed portrait overlay mounted on `document.body`, not `HV.sheet`. A
sheet reads as *a form to deal with*; this is a moment to receive.

- 9:16 stage, centred, letterboxed on wide screens.
- Close ✕ top-right, 44px touch target.
- The film's name and first line at the foot.
- On end or close it animates down into the play mark's rect, so the client
  watches where it went and learns where to find it again.
- Tears itself down on `hashchange` — the overlay must never outlive its page,
  and `HV.refresh()` repaints the view underneath a live iframe.

### Sound

Browsers refuse to autoplay video with sound without a user gesture, and a
YouTube iframe is no exception. The film therefore starts **muted**, with a
prominent "Tap for sound" control that unmutes on first touch. This is not a
shortcut — every platform does the same because there is no alternative.

Embed parameters: `autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`.

### End detection

The YouTube iframe API, via `postMessage`: the player is asked to report state
changes, and state `0` (ended) triggers the collapse. If that message never
arrives — offline, blocked, an ad-blocker eating the frame — the ✕ is always
present and the collapse still happens by hand.

### Offline

Both the iframe and YouTube's thumbnail need network. With none, the band shows
its own dark ground, the film's title line, and the play mark; the overlay opens
to an empty stage with the title and the ✕. Nothing breaks. The service worker
cannot cache a YouTube embed and does not pretend to.

## 5. The play mark

YouTube's silhouette in HAALVING's voice: a `--brand-fill` teal squircle with a
white triangle. It sits at the right of the hero band, vertically centred
against the greeting, so the band reads:

```
┌────────────────────────────────┐
│ THIS MORNING                   │
│ Good morning, Rajesh      ▶    │
│ Cycle 8 · Day 4 · Poorna       │
└────────────────────────────────┘
```

Brand teal is not a pillar colour, so §2 of the colour law is untouched.

`HV.ui.sceneBand(kicker, title, sub)` gains an optional fourth argument
`extra` — HTML placed in the band's right seat. Today passes the mark; every
other caller passes nothing and is unaffected.

## 6. Once a day

```js
HV.store.motSeen = { 'c-rajesh': '2026-08-09' }
```

One ISO date string per client. On render, if the stored date is not
`HV.todayISO()`, the film takes over — and the date is stamped **the moment it
opens**, not when it ends, so a refresh mid-film does not replay it forever.

`Reset demo data` clears it, which is also how the flow is re-tested.

### Which day counts as an arrival

A day the client browsed back to is a glance, not an arrival, so it neither
plays nor carries the mark. The test for that is **"did you browse away"**, not
Today's existing `isToday`:

```js
const browsedAway = asked !== -1 && asked !== todayIdx;
```

`isToday` is derived from the client's calendar, and a client inside the
observation window has no calendar yet — so `isToday` is false for them every
single morning. The observation window is precisely when a reason to get up
matters most, so the film must not be gated on it.

## Files touched

| File | Change |
|---|---|
| `app/js/data.js` | `seed.catalog.motivation`, motivation slot in `genTemplate`, `seedVersion` 32 → 33 |
| `app/js/core.js` | `HV.motivationFor`, the film overlay, the play mark, `sceneBand` extra arg |
| `app/js/views/client-today.js` | first-open-of-day trigger, mark in the band |
| `app/js/views/console-catalog.js` | Motivation tab |
| `app/css/app.css` | overlay, portrait stage, play mark — light and dark |
| `app/index.html` | `?v=184` on every asset |
| `app/sw.js` | `CACHE = 'haalving-demo-v184'` |

No new files, so `sw.js`'s `ASSETS` list is unchanged.

## What could go wrong

| Trap | Why it bites | Guard |
|---|---|---|
| Autoplay silently blocked | Even muted autoplay fails in low-power mode | The mark is always present; a blocked film simply never covers the screen |
| Stamping "seen" too late | Stamp on *end* and a refresh replays it forever | Stamp the moment it opens |
| `itemName()` on a dead id | A film deleted from the library but still named in a template | Resolver returns `null`; the band carries no mark |
| Overlay outliving its page | `HV.refresh()` repaints the view under a live iframe | Mount on `body`, tear down on `hashchange` |
| Version bump | A returning user gets stale code | `?v=` **and** `CACHE` **and** `seedVersion` — all three change here |
| Colour law | A teal mark could read as a pillar signal | `--brand-fill` is the brand, not a pillar; no pillar hue is used |

## Why this matters

Without it, Today opens as a list of things you owe. With it, the day opens with
something given to you first — which is the whole difference between a
compliance app and a way of living.
