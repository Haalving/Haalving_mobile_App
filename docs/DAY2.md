# Day 2 — Home › Attention

The first work surface. Home already drew its Dashboard; this adds the tab a
coach actually opens in the morning: one line per client, loudest first, with
the evidence behind it and a mark on what arrived since they last looked.

Ported from `attentionHtml` and `stampSeen` in `console-digest.js:570-592`.
Nothing here is a redesign — the row's element order, its two flag tones, the
serif numerals and the two roster instruments are the demo's.

---

## Routes

Both under `/api/v1`.

| Method | Route | Gate |
|---|---|---|
| GET | `/home/attention` | staff, nav `home`, **scoped** |
| POST | `/home/seen` | staff — the caller is the person being stamped |

`GET /home/summary` gained two fields rather than a third endpoint, because the
sidebar badge and the tab badge must never disagree with the list they describe:

```
generatedAt : string | null    when today's digest was built
fresh       : { attention, replies, followups, tasks, notices, sessions }
```

The five unbuilt tabs return `0` from real code paths, not from a placeholder —
`tabIds()` names the table each will read when it exists, so the badge lights up
the day its rows land and no wiring is needed then.

### Scoping

`listAttention` filters `{ date: today, client: <scope> }`, where `<scope>` is
the same Prisma WHERE fragment `/clients` uses. **Nested, not post-query.** A
digest line about a client you cannot open is never fetched, so it cannot leak
through a count, a length, or a later refactor that forgets the filter.

---

## Models

```prisma
enum DigestFlag { HIGH @map("high")  MED @map("med") }

model DigestEntry {
  date     DateTime @db.Date
  clientId String
  flag     DigestFlag?
  text     String
  evidence String[]          // the parts, unjoined; the row prints ' · ' between
  position Int               // seed order, the demo's tiebreak
  @@unique([date, clientId])
}

model HomeSeen {
  userId  String
  tabKey  String
  ids     String[]
  @@unique([userId, tabKey])
}
```

Three decisions worth keeping:

**`evidence` is a list, not a string.** The demo stores `tracker log · ladder
rule` and the row prints it verbatim. Splitting it on write means the eventual
evidence viewer gets addressable parts instead of a sentence to re-parse, and
the row joins them back for display, so today's pixels are unchanged.

**Ordering is `flag` then `position`, and an unflagged line sorts LAST.**
`FLAG_RANK` is `{ HIGH: 0, MED: 1 }` and `rank()` returns a value above both for
`null`. That is the demo's order — High, Watch, then everything else in seed
order — and it is deliberate rather than incidental: a null sorting first is the
usual database default and would put the quietest client at the top of a screen
whose whole job is loudest-first.

**Seen state is server-side, per user, per tab.** Never `localStorage`. A coach
who reads the digest on their phone must not be shown the same six lines as new
at the desk. `POST /home/seen` compares as a SET, so a re-order is not a change
and answers `{ changed: false }`.

---

## The digest builder

`digest.service.ts` exposes `buildFor(date)`, run by cron at `0 8 * * *` in the
configured timezone. It runs every rule, then **UPSERTS** — it never deletes. A
line a coach has already seen does not resurrect itself as new because the job
ran twice.

The rules live one per file in `services/digest-rules/`, registered in
`DIGEST_RULES` in write order. All five return `[]` today, and each names in a
comment exactly what it will read:

| Rule | Will read | Fires when |
|---|---|---|
| `noLogs` | `Meal`, `WeightLog`, `CircleMessage` | nothing logged for N days; carries the non-response ladder step |
| `mealRatingDecline` | `Meal` | the rolling mean drops against the prior window |
| `slaPending` | `Meal` + `SlaConfig` | a photo is waiting on a rating and the SLA clock is running |
| `levelReview` | `LevelReview`, `Approval` | a review pack is ready, or a signature is outstanding |
| `observation` | `Meal` | days 1–5, where nothing is graded yet and the line is a progress count |

They return `[]` rather than being absent so the pipeline, the ordering, the
upsert and the scoping are all exercised by the seeded rows today. Adding a rule
later is a file and a line in the registry, not a change to the service.

---

## Web

```
app/(console)/home/[[...tab]]/page.tsx   the tab lives in the URL, as #/home/attention does
features/home/attention/AttentionTab.tsx
features/home/attention/AttentionRow.tsx
features/home/attention/queries.ts
features/home/summary.ts                 one useHomeSummary(), read by the page AND the sidebar
components/ui/rosterInstruments.tsx      LevelBadges + SessionRings, shared with the Clients rail
```

**The stamp is timed, and the timing is the point.** The render that first shows
the rows must still show its New marks; the next visit must not. So the post
happens in an effect after paint, the `attention` query is deliberately not
invalidated, and `home/summary` is invalidated with `refetchType: 'none'` —
marked stale, not refetched — or the badge would blank while the reader is still
looking at the six marks that justify it.

The guard against double-posting is **module-scoped**, not a ref: StrictMode
gives the second mount a fresh `useRef`, which let the effect fire twice.

`SessionRings` names its order explicitly. The demo iterates
`Object.keys(c.sessions)` and gets fitness, yoga, mind, because JavaScript keeps
insertion order. The port stores that ledger in a `jsonb` column, and jsonb does
not: it returns mind, yoga, fitness, and the rings rendered backwards.

---

## Two bugs this work surfaced

Both were found by measuring the port against the demo rather than by reading
it, and neither was visible in the port alone.

### The Super User could not sign in

`homePath('core')` is `#/queues/approvals` and `homePath('dietitian')` is
`#/queues/meals`, but only `/queues` existed on disk. Both roles signed in and
landed on Next's bare 404 — no shell, no sidebar, no way back except editing the
URL. Three seeded accounts could not use the product at all.

Work Queues is now a catch-all, `queues/[[...board]]`, which is how the demo
routes it: one `queues` view handed `['approvals']`, not a route per board
(`core.js:1332`). Each of the four boards names what it will hold; an unknown
segment falls back to the host rather than 404ing.

The five client-role accounts have the same shape of gap — `#/today`, a shell
that is not built — but they carry `email: null` and cannot authenticate, so
nothing reaches it. Left as is, noted here.

### Tailwind was silently overriding the demo's classes

Tailwind emits its utilities **after** `demo-classes.css`, so any utility whose
name matches a demo class of equal specificity simply wins. Three of the demo's
203 class names collide: `block`, `grow`, `ring`.

`grow` was live. The demo grants `flex:1` only through `.row .grow`, and a
`.trow` is not a `.row` — the demo's own stylesheet says so at `app.css:1739`.
Tailwind's bare `.grow{flex-grow:1}` matched anyway and stretched the digest
row's middle column from 494px to 904px, throwing the session rings 410px right,
hard against the card edge. The rows looked fine on their own; the error only
appears beside the demo.

`ring` is the same collision on every session ring in the product. It renders as
`none` today **only** because preflight is off, so the `--tw-ring-*` defaults are
never emitted and the box-shadow is invalid. Define one of those anywhere and
three rings per row gain a halo.

Fixed by prefixing every generated utility (`prefix: 'tw-'`). Nothing in
`web/src` uses a Tailwind utility — the demo's classes are the visual system — so
this costs nothing and makes the collision unrepresentable rather than merely
absent.

---

## Verified

```
pnpm typecheck    5/5 tasks
pnpm test         123 tests — 59 shared, 64 backend
```

The 20 new backend tests cover scoping, the null-sorts-last order, per-user and
per-tab seen state, SET comparison, and that a line about an unreachable client
is never returned.

A headless-Chrome pass over the tab, 20/20, as Anita, Vikram and Bineesh:

- six rows for Anita; Meena first carrying **High**, Rajesh and Mathew **Watch**,
  then the three unflagged in seed order
- every row New and striped on the first visit; no New pills and no stripes on
  the second; the tab badge drains to nothing
- `/home/seen` posted **at most once** per visit, on the third visit too
- four level badges and three session rings per row, reading fitness, yoga, mind
  — `2/5 1/3 0/1`
- evidence prints as the demo writes it: `tracker log · ladder rule`
- Vikram sees only his clients, still ordered High → Watch → none
- the tab renders for a read-only role
- no console errors

And measured against the demo, first row, same viewport:

| | demo | port |
|---|---|---|
| row box | `l276 r1392 w1116 h133` | identical |
| middle column | `494px`, `flex 0 1 auto` | identical |
| rings begin at | `x=848` | identical |
| ring size | `34px` | identical |

Light and dark both match: surfaces, pill tones, pillar dots, ring colours,
evidence links and the fresh-row brand stripe.

---

## Still open

- `pnpm lint` fails in `shared`, `backend` and `mobile`: the scripts are declared
  but eslint was never installed there. Only `web` lints today, through
  `next lint`. Pre-existing, unrelated to this tab, not fixed here.
- Home is still missing the demo's global search bar and its Announcement card,
  which sit above the tabs. Separate modules, not part of this tab.
- Replies, Follow-ups, Tasks, Notices and Sessions remain empty states. Their
  freshness plumbing is live and returns `0`; each will light up when its table
  lands.
- The Evidence button raises a toast naming the parts. There is no evidence
  viewer, and none was invented.
