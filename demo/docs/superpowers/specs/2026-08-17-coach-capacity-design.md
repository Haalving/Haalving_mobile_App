# Coach capacity — design

**Date:** 17 Aug 2026 · **Author:** Claude, with TJ
**Status:** approved
**Follows:** `2026-08-17-client-record-design.md` (v195) and the v196 schedule
reconciliation, which named this gap and deferred it.

---

## The dispatcher

The console's Schedule is a **taxi dispatcher's board**. Each coach is a driver,
and a driver has three real limits:

| The driver | The coach |
|---|---|
| a **shift** — the hours they're on the road | `u.avail`, a window per weekday |
| **days off** | approved leave in `store.leaves` |
| **one car** — no two fares at once | a 1-on-1 session can't run in parallel |

Separately, the office tracks **how many regular customers each driver has on
their books**. That is a different question, and this spec does not touch it.

The board writes fares onto the grid. **It never looks at any of the three
before writing.** That is the whole of this change.

---

## What the seeded data actually says today

Measured against the live store before any code was written, not inferred:

| Check | Result |
|---|---|
| Session occurrences **outside** the coach's declared week | **38** |
| **Same-coach time collisions** | **22** |
| Tasks carrying a double-booking block | **0** |
| Session occurrences inside a **leave window** | **8** |

The worst of it arrived in v196. **Vikram works 06:00–14:00 and every fitness
session starts at 18:30** — four and a half hours after he goes home, for every
client, on every run-day. Lakshmi is booked on days she does not work.

The 15-minute stagger v196 added was arithmetically guaranteed to fail: a
60-minute session at 18:30 and another at 18:45 overlap for 45 minutes. It
looked spaced out and was not. The v196 commit called it "a near-miss rather
than two identical blocks" without noticing that near-miss *is* the bug.

### A second defect, found while probing

v196 made the booking win on *with whom*. A leave cover moves the **seat**
through `HV.staffFor`. **Nothing moves the appointment.** Setting a cover on
Rajesh's fitness seat:

```
  HV.staffFor(rajesh,'fitness')  →  Nikhil T.     ← the seat moved
  every booked fitness session   →  Vikram S.     ← the appointment did not
```

So an approved cover today sends a client to meet a coach who is on leave, and
says so on the client's own My Plan. §5 closes this at its root.

---

## Why the machinery exists and nothing uses it

Capacity is asserted in four unrelated places, and **no writer consults any of
them**:

```
  u.avail          declared weekly hours  →  a soft hint in ONE sheet; hatched
                                             on the grid only when exactly one
                                             person is in the lens
  store.leaves     approved leave         →  drives cover for pod SEATS; the
                                             Schedule grid never mentions it
  collisions()     real overlap detection →  correct, but PRIVATE to the view,
                   + t.noOverlap             off by default, never set
  store.capacity   load / cap per coach   →  narrative; a different question
```

**This is the identical disease v196 cured for the recurrence rule.** A correct
rule sat inside a view, so the seed generator and every other writer could not
reach it and quietly did the wrong thing instead. The cure is the same: lift it
into core, where a view may read it and it may reach into no view.

---

## Decisions taken (TJ, 17 Aug 2026)

| Question | Decision |
|---|---|
| The overlap rule | **No-overlap is the default for every task kind.** Overlap is permitted only when explicitly ticked at scheduling time. This reverses the earlier "the calendar never rejects" rule, deliberately. |
| Fixing the seeded times | **Change the coaches' availability so the sessions batch**, rather than moving sessions to fit today's windows. |
| Leave | **Leave is permitted only after the affected tasks are reassigned and the named cover has accepted.** Only then does it reach the approver. |
| `store.capacity` | **Untouched.** It answers *how many clients*, not *can this person be in two rooms at 06:30*. |

Flipping the default was measured before being accepted: of 23 collisions on
the whole board, **22 are the v196 session bug** and disappear with §4. Exactly
**one** genuine parallel pair survives — Anita and Rohan hold *"Calendar
completion"* and *"Observation data complete check"* at the same noon on review
day. That pair takes the explicit tick. The default flip costs one line of seed.

---

## The big picture

```
                    ┌──────────────────────────────────────────┐
   who? when?  ───> │            HV.conflicts()                │ ───> typed list
   how long?        │  busy    another task holds them         │      [{type, who,
                    │  hours   outside their declared week     │        detail}]
                    │  leave   approved leave that day         │
                    │  ...an overlap needs BOTH sides to allow │
                    └──────────────────────────────────────────┘
                        ▲          ▲          ▲          ▲
                        │          │          │          │
                    data.js    task sheet   drag &    cover board
                   (seeding)   (creating)   drop      (is the bench
                                                       actually free?)
```

**The core loop** — the smallest thing that does the fundamental job:

> Before any writer puts a person in a slot, it asks `HV.conflicts()`. If the
> list is non-empty, the write is refused with the reason named.

Everything else layers on that one question.

---

## §1 · The conflict engine, in core

Three predicates, one union, one placement helper. Each does one thing, so each
can be tested alone.

```js
/* ---- availability, normalised ---- */
HV.WD = ['sun','mon','tue','wed','thu','fri','sat'];
HV.availWindows(user, wdKey)          → [[fromMin,toMin], …]   /* [] = off */
HV.availFits(user, wdKey, start, dur) → bool  /* ONE window must hold it whole */

/* ---- the three questions ---- */
HV.busyAt(people, rd, start, dur, o)      → [{whoId, who, what, taskId}]
HV.outsideHours(people, rd, start, dur, o)→ [{whoId, who, works}]
HV.onLeaveAt(people, rd, o)               → [{whoId, who, from, to}]

/* ---- the union, and placement ---- */
HV.conflicts(people, rd, start, dur, o)   → [{type, whoId, who, detail}]
                                             type ∈ 'busy' | 'hours' | 'leave'
HV.firstFreeSlot(personId, rds, dur, o)   → startMin | null
```

**`o` carries the world, and every field defaults to `HV.store`:**

```js
o = { tasks, users, leaves, exceptIds, from, allowOverlap }
```

`exceptIds` excludes the task being edited from colliding with itself.
`from` is the earliest minute `firstFreeSlot` should consider. `allowOverlap`
is the **incoming** task's own flag, which `busyAt` needs before the task
exists as a record — at creation time there is nothing to read it off.

**The engine must be pure.** `data.js` builds the seed at parse time, when
`HV.store` is `null` and `HV.staff()` cannot resolve anybody. The engine
therefore resolves people out of `o.users` and tasks out of `o.tasks`, falling
back to the store only when they are absent. Getting this wrong reproduces the
v196 boot failure exactly — *"Cannot read properties of null (reading 'users')"*.

**`firstFreeSlot` takes a LIST of relative days, not one.** A recurring session
must clear every day it runs on, and a coach's Saturday window differs from
their Tuesday. It returns the earliest minute on the 15-minute grid that has no
conflict on *any* of them, searching from `o.from` (a preferred earliest hour)
and then from the start of the working day. `null` means the series cannot be
placed — which is a real answer, not a failure.

**Why we need it.** `collisions()` and `outsideAvail()` already exist and are
correct, but they are private to `console-schedule.js`, so the seed generator
and the leave board cannot reach them.

**What breaks without it.** Every writer keeps its own idea of "free", and the
three-drifting-copies problem returns.

---

## §2 · Availability gains more than one window a day

A personal trainer with six one-on-ones works a **split shift** — early
mornings and evenings, nothing in between. Vikram needs 5½ hours of session
time and no single window in the seed can hold it without someone training at
midnight. This is not a workaround; it is how the job runs.

```js
// BEFORE — one range per weekday
avail: { mon: ['06:00','14:00'], … , sun: null }

// AFTER — one range OR several; both shapes are read
avail: { mon: [['06:00','10:00'], ['17:00','21:00']], … , sun: null }
```

`HV.availWindows` normalises both by testing `Array.isArray(av[0])`, so **no
stored data needs migrating** — a saved store keeps its single-range arrays and
keeps working.

**Five readers and three writers move onto the normaliser:**

| Where | What it does |
|---|---|
| `console-schedule.js` `availOffSegs` | hatches the grid outside the windows |
| `console-schedule.js` `outsideAvail` | the live hint in the task sheet |
| `console-people.js` `availSummaryHtml` | *"Mon–Fri 07:00–15:00 · Sun off"* — currently `join('–')`, which would print `06:00,10:00–17:00,21:00` |
| `console-people.js` `weekStripHtml` | the week strip; reads `r[0]`/`r[1]` |
| `console-leave.js` `availHtml` / `wireAvail` | the paint-your-week editor — gains **Add a second range** and a per-range remove |

**What breaks without it.** Either Vikram's clients train at 23:30, or his
declared hours become a fiction written to keep the times — and the whole point
of this change is that the declared hours are the authority.

---

## §3 · Overlap becomes opt-in

`t.noOverlap` (absent = allowed) inverts to **`t.allowOverlap`** (absent =
refused).

This is a change of **meaning**, not of a checkbox default. Fourteen seeded
sessions carry no flag at all; flipping only the UI default would leave every
one of them colliding, and the gap would not be closed.

**An overlap is permitted only when the incoming task AND every task it
collides with carry `allowOverlap`.** A task that permits overlap cannot force
itself on top of one that does not — the strict reading, and the safe one.

The sheet's control becomes *"Allow this task to overlap another"*, unticked by
default. The refusal names who and what, on **all four write paths**: the task
sheet, in-day drag, cross-day move, and proposal apply. All four already route
through `hardClashAt`, so they inherit it.

**Assigning a session checks both things TJ listed, and both refuse:**

1. **Working hours** — the coach is not working then.
2. **An existing non-overlapping task** — someone already holds those minutes.

Hours were a soft warning in the first draft. TJ listed them as a check, so
they block. Because §4 makes the demo data fit, nothing in the demo trips it.

---

## §4 · The seed batches sessions inside declared hours

`bookingsFor()` in `data.js` stops using a hardcoded hour and the 15-minute
stagger. For each client-and-pillar it asks:

```js
const rds   = days.map(cd => cd - c.day);        /* every day the series runs */
const start = HV.firstFreeSlot(staffId, rds, b.dur,
                { users: seed.users, tasks: seed.tasks, from: b.pref });
```

`BOOK` gains a `pref` — the hour that pillar *wants*, so the demo keeps its
character while the engine decides what is actually possible:
`yoga 06:00`, `fitness 17:00`, `wellness 18:00`. The preference is a starting
point for the search, never a guarantee; when the preferred stretch fills, the
batch spills to the rest of the working day.

**Because each client of a coach gets a distinct slot, no two of that coach's
sessions can collide on any day** — which is the guarantee the 15-minute
stagger only pretended to give.

**A run-day the coach does not work cancels that occurrence** through `exc`, the
mechanism the grid already honours. The template's prescription remains and
simply goes unbooked — a path `HV.calendarFor` already supports. A coach's day
off removing a session is true, and worth showing.

**The one availability change:** Vikram moves to a split shift,
`[['06:00','10:00'], ['17:00','21:00']]`. Lakshmi (06:00–12:00) and Meera
(14:00–21:00) already have room for their batches and are left alone — so the
split shift also becomes a visible contrast in the demo rather than a uniform
rule.

Expected layout, six sessions against a 21:00 finish:

```
  Vikram   5 × 60m, split shift 06:00–10:00 + 17:00–21:00
           17:00 · 18:00 · 19:00 · 20:00       ← the evening holds four
           06:00                               ← the fifth spills to the morning

  Lakshmi  4 × 60m, 06:00–12:00 Mon–Fri, 07:00–11:00 Sat
           07:00 · 08:00 · 09:00 · 10:00       ← 07:00, not the preferred 06:00:
                                                 their Saturday window opens at
                                                 07:00 and the series must clear
                                                 EVERY run-day

  Meera    4 × 45m, 14:00–21:00 Mon–Fri, Saturday off
           18:00 · 18:45 · 19:30 · 20:15       ← the last ends at 21:00 exactly;
                                                 Saturday occurrences cancel
```

Exact times are whatever the engine returns; the spec fixes the *rule*, not the
numbers. **No test may assert a literal time.**

**One booking does not come from `BOOK`:** `core.js` patches a demo extra onto
the task list — the session used to demo the two-hours-out reminder. It is
placed by hand and must be moved inside its coach's window too, or the
re-measurement in §8 will report one stubborn outside-hours occurrence.

**`seedVersion` bump is mandatory.** Booking times change shape; without it a
saved store keeps evening sessions while every helper says morning.

---

## §5 · Leave reassigns the appointments, and the cover has to accept

The board already walks `reassign → pending → approved`. TJ's rule adds a step
and widens what is reassigned.

```
  apply ──> reassign ─────────> accept ─────────> pending ──> approved
             │                   │                 │
             the SESSIONS in     each named        the approver
             the window, not     cover accepts     signs
             just client seats   or declines
                    ▲                 │
                    └── declined ──────┘
```

**Two changes of substance:**

**(a) Sessions, not just seats.** `planSheet` today reallocates *clients riding
the seat*. It gains the **actual session occurrences** falling inside the
window, and the bench picker consults `HV.conflicts` for each candidate —
*"Nikhil is free for all 8"* or *"Nikhil already holds 3 of these."* This is
where capacity checking earns its keep: `bench()` currently excludes only people
on approved leave, and will happily hand you someone already booked solid.

**(b) Acceptance.** Today a HoD picks a cover from a dropdown and it is done;
the covering coach is never asked. New state on the record:

```js
lv.sessions     = [{ taskId, rd, toId }]                  /* the occurrences */
lv.coverAccepts = { 'u-nikhil': 'accepted' | 'declined' | null }
```

Acceptance is keyed by **person**, not by client — that is who is being asked.
All accepted → `pending`, and the approvers are notified. **Any decline sends
it back to `reassign`** with a notice to the planner, which is what stops the
new state deadlocking.

**On approval**, alongside the existing `podCover` write, each reassigned
occurrence gets:

```js
t.exc[rd].assignees = [toId];
```

`HV.occursOn` already carries `start`, `dur`, `title`, `link` and `notes`
through an exception. **Adding `assignees` is one line**, and it makes the swap
visible on the grid, the digest, the reminder sweep *and* the client's My Plan
at once — because `HV.calendarFor` reads the occurrence. That single line is
the root fix for the cover defect in the preamble; `calendarFor` moves from
`b.t.assignees[0]` to `b.assignees[0]` to consume it.

---

## §6 · What stays untouched, deliberately

**`store.capacity`.** Vikram reads 50/50 FULL while carrying six demo clients
because that number is **narrative**: it drives the *"Full — Ops Head override
required, reason logged"* beat, and seeded approval history quotes it
(*"Vikram at capacity — override noted"*). Deriving it would drop him to 6/50
and kill both. It answers *how many clients*, not *can he be in two rooms at
06:30*, and the two vocabularies stay apart so that no screen says "capacity"
meaning two different things.

**`console-builder.js:239`** already promises *"double-booking impossible —
conflicting slots cannot save."* After this change that sentence becomes true.
It needs no edit.

**The 5-day observation window** and the two SOP strings quoting controlled
documents (*"77 days to reach the goal"*, *"the 7-11 progress sheet"*) are out
of scope, as in the previous two specs.

---

## §7 · Files

| File | Change |
|---|---|
| `app/js/core.js` | the engine (§1); `occursOn` carries `assignees`; `calendarFor` reads `b.assignees[0]` |
| `app/js/data.js` | Vikram's split shift; `BOOK.pref`; `bookingsFor` via `firstFreeSlot`; `allowOverlap` on the one SOP pair; `seedVersion` → 41 |
| `app/js/views/console-schedule.js` | `noOverlap` → `allowOverlap`; `collisions`/`outsideAvail` delegate to core; leave marks on the grid |
| `app/js/views/console-leave.js` | multi-range editor; sessions in `planSheet`; the `accept` state; approval writes occurrence exceptions |
| `app/js/views/console-people.js` | `availSummaryHtml` / `weekStripHtml` read multi-range |
| `app/css/app.css` | marks for a conflict row and the accept state |
| `app/index.html`, `app/sw.js` | `?v=197`, `CACHE = 'haalving-demo-v197'` |

No new view file, so the `ASSETS` list is unchanged.

---

## §8 · Verification

No test suite exists. Verification is the headless CDP harness in the session
scratchpad, **run against a freshly cleared profile** — a persisted profile has
faked clean-state results before.

1. **The engine is pure.** `HV.conflicts` answers correctly when handed
   `{users, tasks, leaves}` explicitly, with `HV.store` never consulted.
2. **`availWindows` reads both shapes** — `['09:00','17:00']` and
   `[['06:00','10:00'],['17:00','21:00']]` — and `null` is off.
3. **`availFits` requires ONE window to hold the whole session**; a session
   spanning the gap between two windows does not fit.
4. **`firstFreeSlot` clears every day in `rds`**, not just the first — assert
   against a coach whose Saturday window is narrower than their Tuesday.
5. **The re-measurement.** Re-run the probe from the preamble: outside-hours
   occurrences **0**, same-coach collisions **0**, down from 38 and 22.
6. **The demo still fits.** Every coach's whole batch sits inside a declared
   window on every day it runs; no session is silently lost except on a day the
   coach genuinely does not work.
7. **Overlap refuses on all four write paths** — sheet, in-day drag, cross-day
   move, proposal apply — and the SOP's one flagged pair still saves.
8. **Assigning refuses on hours** as well as on collision, naming which.
9. **The leave walk end to end:** apply → the sessions in the window are listed
   → a bench member already booked is flagged → cover named → status `accept`
   → the cover declines → back to `reassign` → re-named → accepted → `pending`
   → approved.
10. **The cover reaches the client.** After approval, the client's My Plan names
    the covering coach on the reassigned occurrences and the absent coach on
    none of them.
11. **Regression.** The full t1–t20 suite plus phase1/phase1c/phase2 stay green;
    the onboarding SOP still reports 70 tasks with the per-seat lens unchanged.
12. **Both themes, console clean**, on the Schedule grid and the cover board.

---

## §9 · What could go wrong

**`HV.staff()` reads `HV.store`.** The seed calls the engine at parse time. The
engine must resolve people from `o.users`. This is the v196 boot failure waiting
to happen again, and it fails *silently* at seed-build time before surfacing as
a null dereference at boot.

**Refusing too hard.** With hours as a hard check, nobody can book a genuine
out-of-hours favour. That is TJ's explicit instruction and the demo data is made
to fit it. If it turns out to bite, the pattern to copy is the existing
`overrideCapacity` permission — *not* a silent bypass.

**The batch is order-dependent.** Clients are processed in seed order, so the
first client gets the best slot. That is fine and honest, but it means editing
the client list reshuffles session times. The spec fixes the rule, not the
numbers, for exactly this reason — and no test may assert a literal time.

**Changing times changes the demo.** Fitness moves out of the 18:30 evening for
four of five clients. Correct, but it will read as a regression to anyone who
knows the seed.

**`firstFreeSlot` returning `null` must not be swallowed.** An unplaceable
series should cancel visibly, not vanish. An assertion that can pass on an empty
array is not an assertion — the v195 rest-day bug was exactly this.

**The `accept` state can strand a leave.** A decline must route back to
`reassign`; without it the application sits forever with no button anywhere.

**Three version levers.** `?v=` in `index.html`, `CACHE` in `sw.js` (the real
lever — the SW matches with `ignoreSearch: true`), and `HV.seedVersion`, which
is mandatory here because booking times change shape.
