# The client record — design

**Date:** 17 Aug 2026
**Status:** approved by TJ
**Ships as:** v195 · `HV.seedVersion` 38

## What we are building

Three things that arrived together as one request from the client, and are built
as one change because the third depends on the second.

1. **The console's Clients workspace becomes a real client record** — a dashboard
   that counts the roster by status, and nine tabs that hold everything known
   about a person: who they are, everything they have done, every conversation,
   their plan, their moods, their trackers, their documents, their meetings, and
   the pod's private notes.
2. **A second clock** — the 90-day engagement term, counting down beside the
   existing cycle-and-day clock.
3. **The derived calendar** — the assigned per-pillar templates finally reach the
   client's My Plan, closing finding **F2**. Then the programme flips from an
   11-day cycle to a 14-day one.

## The patient file

One analogy, carried through this document and into the code comments.

A client's record is a **patient file** in a records room.

- **The shelf label** — how many files there are and which are live (the Dashboard)
- **The shelf** — the roster rail, filterable by status
- **The spine stamp** — the admission date and the discharge date (the term clock)
- **The cover sheet** — who this person is (Overview ▸ Profile)
- **The running notes** — everything that has happened, latest first (Logs)
- **The correspondence** — what was said to them (Circle)
- **The prescription** — what they have been told to do (Plan)
- **The charts** — moods and trackers (Emotions, Trackers)
- **The attachments** — reports and letters (Documents)
- **The ward-round minutes** — what each specialist said afterwards (Meetings)
- **The pod's margin notes** — never shown to the patient (Notes)

The file follows the person. Nothing in it is invented by a screen; every tab
draws something the store already holds, or something one named writer put there.

## Flow

```
  DASHBOARD                THE SHELF                       ONE FILE OPEN
  ─────────                ─────────                       ─────────────
 ┌──────────────┐    ┌──────────────────────┐   ┌─────────────────────────────────┐
 │ Total     7  │───>│ ● Rajesh D.          │──>│ Rajesh D.       Poorna   ⚠ Care │
 │ Active    5  │    │ ● Meera P.           │   │ Cycle 3 · Day 6                 │
 │ Paused    1  │    │ ◐ Arun K.    paused  │   │ ▓▓▓▓▓▓▓░░░ 56 days left of 90   │
 │ Inactive  1  │    │ ○ Sara J.  inactive  │   ├─────────────────────────────────┤
 └──────────────┘    └──────────────────────┘   │ Overview │Logs│Circle│Plan│Emo… │
  HV.myClients()      + status filter chips     └─────────────────────────────────┘
  — role-scoped                                          the nine tabs

  AND, underneath, the pass from kitchen to dining room that F2 has been waiting for:

   clientPlans[cid]              HV.calendarFor(client)          CLIENT APP
  ┌──────────────────┐          ┌────────────────────┐          ┌──────────┐
  │ culture    → tpl │          │ Day 1 … Day 14     │          │ My Plan  │
  │ fitness    → tpl │─ UNION ─>│   items[] sessions │─────────>│ Today    │
  │ yoga       → tpl │  of five │   meals[] plate    │          │ Trackers │
  │ wellness   → tpl │          └────────────────────┘          └──────────┘
  │ motivation → tpl │                    ▲
  └──────────────────┘         HV.markSession writes status back
```

## Decisions taken (TJ, 17 Aug 2026)

| Question | Decision |
|---|---|
| What is the 90-day clock? | **The engagement term** — a commercial term, independent of levels and cycles. Default 90 days, set in Configuration, overridable per client. |
| Trackers and Notes | **Kept as tabs.** Nine tabs in total. |
| What goes in Logs | **Everything, one stream** — the client's own acts *and* the team's acts on them. |
| Status | **Set by hand, with a mandatory reason.** Four dashboard numbers: Total, Active, Paused, Inactive — Paused counts separately, because a paused client is coming back. |
| Verifying email and mobile | **An admin marks it verified**, with an audit line naming who and when. |
| Height and weight | **Both typed at intake.** |
| Order of work | **All in one go** — the Clients rework, the derived calendar, and the flip to 14 days. |

## The core loop

The smallest thing that does the fundamental job of this change:

> A staff member does something to a client → one named writer records it →
> the Logs tab draws it, latest first.

Everything else — the profile fields, the term clock, the dashboard counts, the
meeting minutes — layers on top of that one loop. If the loop works, the record
is honest; if it does not, every tab is a screen that shows what it happens to
know rather than what happened.

---

# The design

## §1 · How Logs fills — derive, plus one small writer

Three ways to build "every activity, latest first":

| | Approach | Cost | Catch |
|---|---|---|---|
| A | Teach every mutation site to append a log line | ~30 call sites | The seed's existing history appears **empty** — nothing back-fills it |
| B | Derive entirely at render from existing stores | Cheap | Staff acts recorded nowhere today still have no home |
| **C** | **Derive, plus one append-only `client.log[]`** | **Small** | **Two sources merged at render** |

**C is chosen**, and it is the idiom this codebase already uses: the Overview
timeline (`console-clients.js:816`) already merges `circles` and `meals` at render
time. Deriving means the demo's seeded history appears in Logs immediately with
zero back-fill, which no amount of new writing can achieve.

**Derived from eight stores that already record things:**

| Source | Gives |
|---|---|
| `HV.store.circles[cid]` | messages, cards, delivered documents, broadcasts |
| `HV.store.meals` | meal logs and their ratings |
| `c.moodLog` | check-ins with time and note |
| `c.weightLog` | weigh-ins |
| `c.sessionLog` | sessions marked done or missed (**new in this change**, see §6) |
| `c.sessionFeedback` | the client's stars after a session |
| `clientPlans[cid][pillar].log` | template assignments and per-day edits |
| `HV.store.approvals` | approvals naming this client |

**Written to `c.log[]` — acts with no other home:**

```js
{ ts: <ms>, byId: 'u-anita', act: 'status', text: 'Paused — travel, back 1 Sep' }
```

Acts: `status`, `profile`, `verify`, `level`, `coach`, `term`, `note`.
One writer, one place:

```js
HV.logAct(client, act, text)   /* appends, saves, never renders */
```

**Filter chips:** All · Client · Team · Plan · Medical. Grouped by day, newest
day first, newest entry first within a day.

## §2 · The record grows

**NEW** fields on a client. `sex` and `dob` are **UNCHANGED**. `heightCm` and
`weightKg` are keys that already exist — onboarding writes them
(`client-onboard.js:1259`); the seven seeded clients simply never got them.

| Field | Example | Note |
|---|---|---|
| `code` | `'HV-0142'` | Human-facing client id. The internal `c-rajesh` moves to the audit line |
| `designation` | `'Regional Sales Head'` | |
| `gender` | `'M' \| 'F' \| 'X'` | **Identity** — how we speak to and about them |
| `address` | `'they/them'` | Free text, "how they will be addressed". Shown for any gender, not only `X` |
| `joinedISO` | `'2026-06-12'` | |
| `heightCm` | `172` | Existing key, now seeded |
| `weightKg` | `84.0` | Existing key, now seeded |
| `status` | `'active' \| 'paused' \| 'inactive'` | |
| `statusWhy` / `statusBy` / `statusAt` | `'Travel — back 1 Sep'` | Reason is mandatory |
| `email` / `emailOk` / `emailBy` / `emailAt` | | Admin marks verified |
| `mobile` / `mobileOk` / `mobileBy` / `mobileAt` | | Admin marks verified |
| `location` | `'Kochi, Kerala'` | |
| `term` | `{ days: 90, startISO, renewals: [] }` | Default `days` from `programShape.termDays` |
| `log` | `[]` | §1 |
| `meetings` | `[]` | §5 |

`programShape` gains **`termDays: 90`**, editable at Configuration ▸ Program
alongside `levels`, `cycleDays`, `reviewDay`, `meetingDay` and `restDays`.

### Two rules inside this section that are load-bearing

**`sex` is clinical and must not become `gender`.** `c.sex` feeds
`HV.vitals` reference bands (`console-medical.js:116`, `client-profile.js:72`,
`console-clients.js:607`) — haemoglobin, ferritin and creatinine have different
normal ranges for male and female bodies — and the BMR formula
(`client-onboard.js:1260`, `console-pipeline.js:1059`). Gender is a **separate,
new** field for how a person is addressed. Merging the two silently moves a
client's lab reference bands, which is the kind of defect nobody notices until it
matters. The seed comment must say this, next to the fields.

**Age is derived from `dob`, never typed.** `HV.ageOf(c)` returns the years from
`dob`, falling back to a stored `c.age` for any record without one. Two typed
numbers that must agree will eventually disagree; a derived one cannot.

## §3 · The two clocks

The programme is 7 levels × 14 days = **98 days**. The engagement term is **90**.
They are different clocks and the screen must never let them be confused:

```
CYCLE CLOCK    Cycle 3 · Day 6 of 14        where they are in the programme
TERM CLOCK     56 days left of 90           how long they have paid for
```

A client can sit mid-level with two weeks of term left; that is an ordinary
state, not an error.

**Helpers on `core.js`:**

```js
HV.termOf(c)     /* → { days, startISO, endISO, elapsed, left, pct } */
HV.termLeft(c)   /* → days remaining, negative once the term has ended */
```

**Where it appears:**

- **The client header** (`headHtml`) — a slim bar under the name.
- **Overview ▸ Profile** — the full reading: start date, end date, renewal history.

**States:**

| Days left | Reading | Tone |
|---|---|---|
| > 14 | `56 days left of 90 · renews 15 Nov` | neutral |
| 1–14 | same | `warn` |
| ≤ 0 | `Term ended 3 days ago` + **Renew** | `bad` |

**Renew** appends `{ fromISO, toISO, byId, at }` to `term.renewals`, moves
`term.startISO` forward, and writes a `term` line to `c.log[]`. The term clock
never silently rolls over — a renewal is a person's decision, recorded.

## §4 · The dashboard

`HV.myClients()` (`core.js:225`) is **already role-scoped**: Ops and Admin get
everyone through `seeAllClients`, a HoD gets their department, a coach gets their
own pod. The counts follow it, so every role sees a true count of *their* people
with no new access logic and no new permission.

Home ▸ Dashboard gains one card above the existing tiles:

```
┌─────────────────────────────────────────────────┐
│ YOUR PEOPLE                                     │
│   7          5          1           1           │
│   Total      Active     Paused      Inactive    │
└─────────────────────────────────────────────────┘
```

Each number is a tap-through to `#/clients` with the matching status filter set.
The rail's existing filter chips (`planFilters()`, `console-clients.js:24`) gain
Active · Paused · Inactive beside All · Poorna · Svayam · High risk.

**Status is set by hand with a mandatory reason.** The sheet refuses to save an
empty reason, writes `statusBy`/`statusAt`, and appends to `c.log[]`. A status
nobody can explain is worse than no status at all.

## §5 · The nine tabs

```
Overview │ Logs │ Circle │ Plan │ Emotions │ Documents │ Meetings │ Trackers │ Notes
```

`.tabs` already carries `overflow-x:auto` with a hidden scrollbar
(`app.css:1259`), so nine scroll cleanly at laptop width. **No CSS change.**

| Tab | State |
|---|---|
| **Overview** | Rewritten — see below |
| **Logs** | **New** — §1 |
| Circle | Unchanged |
| Plan | Unchanged in this change; fed by §6 |
| Emotions | Unchanged |
| **Documents** | Label renamed from "Docs". Body unchanged, and **the tab id stays `docs`** — it is in the route (`#/clients/:cid/docs`), so changing it would break every existing deep link and bookmark |
| **Meetings** | **New** — see below |
| Trackers | Unchanged |
| Notes | Unchanged |

### Overview — four sections

1. **Profile** — the cover sheet. Photo (`HV.ui.avatar`), code, name, designation,
   gender + form of address, joining date, age (derived), height, weight, status,
   email + verify, mobile + verify, date of birth, location, plan. Edited through
   one sheet; every save writes a `profile` line to `c.log[]`.
2. **Goal** — the existing `goalCard(c)`, unchanged.
3. **Team** — the existing `careTeamCard(c)`, unchanged. Resolves through
   `HV.staffFor`, so it is already cover-aware.
4. **Medical Details** — reuses the rule the codebase already enforces: the
   **signed Health Summary** (conditions, flags, metrics from
   `HV.store.healthSummaries`) is visible to the pod; **raw records are
   Doctor-only** via `HV.can('rawRecords')` and every open is written to the audit
   trail. This section invents no second policy.

The existing `sessionsCard`, `onboardingCard` and the merged timeline stay on
Overview; the timeline keeps its place as the recent-activity glance, with Logs
as the complete record behind it.

**One typed-weight guard.** Weight is typed, per the decision. A read-only
caption sits under it — `latest weigh-in 81.4 kg · Day 8, cycle 2` — drawn from
`c.weightLog` when one exists. The field stays typed and editable; the caption
only ensures the card can never silently contradict the Trackers tab.

### Meetings

A meeting is a record with **one minutes card per coach**.

```js
{ id, kind: 'review' | 'cycle' | 'assessment' | 'calendar' | 'adhoc',
  cycle, day, dateISO, title,
  minutes: { 'u-sneha': { text, at }, 'u-vikram': { text, at } } }
```

**Derived automatically** — for every completed cycle and the current one, a
Day-`reviewDay` *Level review* and a Day-`meetingDay` *Cycle meeting*, both read
from `programShape`; plus onboarding's assessment call and calendar meeting from
the SOP. **Stored** — `c.meetings[]` holds the minutes and any ad-hoc meeting.

A derived meeting with no stored minutes still appears, showing each pod member
and a *not filed* marker against anyone who has not written theirs. A coach
viewing their own unfiled meeting gets a **File your minutes** action. This is
the whole point: an unfiled review must leave a visible trace that it was due.

Session notes stay in Logs. Meetings is for meetings, or the tab becomes a
nine-entries-per-cycle firehose and stops being readable.

## §6 · The derived calendar — closing F2

Unchanged from the approved catalogue-and-template plan, restated here because it
ships in this commit.

```
for each day d in 1..cycleDays:
  for each assigned pillar p:
     slots = overrides[d] || template.days[d] || { slots: [] }
     culture slots  → day.meals[]     (the plate)
     other slots    → day.items[]     (sessions)
  day.date    = derived from today ± (d - client.day)
  day.today   = d === client.day
  day.rest    = programShape.restDays.includes(d) && !day.items.length
  day.review  = d === programShape.reviewDay
  day.meeting = d === programShape.meetingDay
```

| Field | Derivation |
|---|---|
| `staffId` | `HV.staffFor(client, roleKey).id`, map `{culture:'dietitian', fitness:'fitness', yoga:'yoga', wellness:'mind'}` — reproduces every seeded value exactly, and makes every call site cover-aware for free |
| `status` | `c.sessionLog` first, then the clock: past = done, `c.day` = today, future = planned |
| `date` | Derived from the machine's today, via `HV.fmtMonthDay` |
| `rest` / `review` / `meeting` | `programShape` |

**Three rules that are load-bearing, not tidiness:**

1. **`items` stays sessions-only; the plate gets its own `meals` array.** Three
   meals a day inside `items` breaks five readers at once — `dayDone` would demand
   three meals be ticked before the day-complete celebration fires, `dayKept`
   would kill every streak, and `HV.coachBrief` would announce *"Next session:
   Breakfast"*.
2. **Filter to known pillar keys.** `client-plan.js:464` does
   `HV.PILLARS[it.pillar].name` unguarded. One `motivation` slot leaking into
   `items` is a TypeError that blanks My Plan.
3. **Always return the full N-day skeleton, never `[]`.** An empty array is what
   quietly breaks things: `cal.findIndex(d => d.today)` returns `-1`, which
   silently removes Join buttons and the meal counter, and opens the Nutrient
   Panel on day 1 instead of today.

**The blocking hazard.** Three places mutate a calendar item's status at runtime:
`client-plan.js:237` (*Can't make it*), `client-plan.js:381` (*Mark session
done*), `core.js:865` (the reminder-band exit). Against a derived calendar those
write to a throwaway object and vanish on the next paint — the toast fires, the
counter moves, and the change reverts. **`HV.markSession` lands and those three
sites switch BEFORE any reader switches**, and the done/cancel path is tested
first.

`HV.markSession(client, day, key, status)` appends to `c.sessionLog` — on the
client record, mirroring `sessionFeedback` / `moodLog` / `weightLog` — and is the
only writer. `calendarFor` is memoised with a one-entry cache cleared in
`render()` and `HV.save()`.

**`dayOf` (`client-plan.js:62`) must be rewritten.** It finds a day by
`items.indexOf(it)`, which cannot work against a freshly derived graph, and every
caller is null-tolerant — so it fails *silently*.

**`mealPlans` stays.** It carries three things a template slot does not: per-slot
kcal/protein used as the Nutrient Panel's daily targets, the fibre→protein→carbs
`parts` teaching order, and the human-voiced `swap` line. `HV.plateFor(client, day)`
returns the day's `meals` when a Nutrition template is assigned and falls back to
`mealPlans` otherwise; `HV.tasks`' culture branch (`core.js:2291`) points at it.
**That single call-site change closes F2 for Nutrition**, because Today, My Plan
and the task sheets all already read `HV.tasks(client).culture`.

**`calendarsPast` and `proposedCalendars` are unchanged.** Past cycles record what
actually happened at a different level, often under a different template —
deriving them from today's assignment would be a lie. `calendarFor` takes an
`opts.cycle` parameter now so a later pass needs no signature change.

## §7 · The flip to 14

Last, deliberately: §1–§6 leave the client app byte-identical on screen, so each
can be verified against a known-good. This is the only step where the screen is
*supposed* to change.

```js
SHAPE = { levels: 7, cycleDays: 14, reviewDay: 12, meetingDay: 14, restDays: [5, 10], termDays: 90 }
```

Also required in the same commit: `HV.seedVersion` → 38 (seeded arrays change
length; without it a saved store keeps 11-day data while every helper answers
14), and `CLAUDE.md:144` and `app/README.md:3` updated by hand.

**Do not touch:** the 5-day observation window (`OBS_DAYS` and the
`obs1/obs2/obs4/obs5` SOP steps) runs *before* Day 1 of Level 1 and is not in
`programShape`. `console-pipeline.js:113` (*"77 days to reach the goal"*) is a
quotation from the signed Assessment Call Script. `console-pipeline.js:170`
(*"the 7-11 progress sheet"*) is the proper name of a real spreadsheet outside
the app — renaming it to "7-14" would send an Ops Head to a document that does
not exist.

## §8 · Files

`console-clients.js` is already 2,436 lines; this change would push it past
3,400. Profile, Medical Details, Logs and Meetings therefore go into a **new**
file.

| File | Change |
|---|---|
| **`js/views/console-client-record.js`** | **New.** Exports `HV.clientRecord = { profileHtml, medicalHtml, logsHtml, meetingsHtml, wire }`. Same load-order contract as `HV.consoleui` and `HV.chatui` — consumers call it inside `render()` only |
| `js/core.js` | `HV.termOf`, `HV.termLeft`, `HV.ageOf`, `HV.logAct`, `HV.markSession`, `HV.calendarFor`, `HV.plateFor`; `HV.tasks` culture branch; reminder-band mutation at `:865` |
| `js/data.js` | 14 new fields across 7 clients, `programShape.termDays`, `cycleDays` 11 → 14, `HV.seedVersion` 38 |
| `js/views/console-clients.js` | `TABS` (nine), header term bar, tab dispatch, rail status filters; Profile/Medical/Logs/Meetings delegate to `HV.clientRecord` |
| `js/views/console-digest.js` | The Your People counts card |
| `js/views/console-config.js` | `termDays` in the Program tab, with validation |
| `js/views/client-plan.js` | 5 calendar readers, `dayOf` rewrite, 2 mutation sites |
| `js/views/client-today.js` | 2 calendar readers |
| `js/views/client-trackers.js` | 2 calendar readers |
| `js/views/console-pipeline.js` | Calendar writer deleted; new clients seeded with record fields |
| `js/views/client-onboard.js` | Calendar writer deleted; new clients seeded with record fields |
| `css/app.css` | Profile grid, term bar, log spine, meeting minutes |
| `index.html` · `sw.js` | New file registered in **both**; every `?v=` → 195; `CACHE` → `haalving-demo-v195` |

Adding a view means adding it in **three** places: the file, `index.html`, and
the `ASSETS` list in `sw.js`.

## §9 · Verification

There is no test suite. Verification is a browser plus the headless CDP harness
in the session scratchpad. **Run against a freshly deleted Chrome profile
directory** — a persisted profile has faked "clean state" results before.

Each numbered step is a boundary; a failure at step *n* says which piece broke,
which is why the work is verified in order rather than only at the end.

1. **The record.** Every seeded client shows a complete Profile card. Age matches
   `dob`. No client shows `undefined` in any field.
2. **`sex` is untouched.** Open a lab report as the Doctor before and after —
   every reference band is identical. Set a client's `gender` to `X` and confirm
   the bands still read from `sex`.
3. **Status and the dashboard.** Total = Active + Paused + Inactive for every
   role. Pause a client with a reason → the count moves, the reason appears in
   Logs, the reason cannot be left blank.
4. **Logs.** Every seeded client shows history from all eight derived sources on
   first load, with no back-fill. Newest first. Each filter chip narrows and none
   empties the list wrongly.
5. **The term clock.** Set a client's term to end in 3 days → amber. To yesterday
   → *Term ended*, and **Renew** moves the date and writes a log line. Confirm the
   cycle clock is unaffected by all of it.
6. **Meetings.** A cycle with no filed minutes still lists the Day-12 review with
   every pod member marked *not filed*. A coach can file their own and only their
   own.
7. **The mutation path — test this first of the calendar work.** Client app →
   *Mark session done* → **reload** → still done. Same for *Can't make it*.
8. **The core loop.** Catalog ▸ Nutrition → add a food. Templates → new Nutrition
   · L1 · Sedentary → put that food in Day 1 Breakfast with an OR alternative →
   publish. Clients → Rajesh → Plan → assign. **Open the client app: the food is
   on My Plan, Day 1.** That single walk is F2 closed.
9. **Empty and partial.** A client freshly promoted from onboarding shows a
   14-day skeleton with the "your team is building it" notice, not a blank screen.
   A client with 2 of 5 pillars assigned shows those two and no error.
10. **The flip.** Every day grid, every "Day N of M" and the Journey copy read 14.
    A past 11-day cycle still draws **11** cells.
11. **All seven personas plus a promoted one**, in light and dark, console clean.
    Check a client set to day 12, 13 and 14.

## What could go wrong

**Conflating `sex` and `gender`.** The single most damaging possible mistake here:
it moves a client's lab reference bands and nothing on screen says so. They are
separate fields with separate purposes and the seed comment must say why.

**The revert-on-repaint trap.** The biggest one in §6. It looks like it works and
then quietly undoes itself. Land `markSession` first, test the done/cancel path
first.

**Silent nulls.** `dayOf` returning `null`, `HV.esc(undefined)` returning `''`,
`if (!e) break` in the streak walk — this codebase degrades quietly rather than
throwing. A wrong result will look like a design choice. Assert values, do not
eyeball screens.

**Find-and-replace on `11`.** It is also a YouTube-id length, a CSS padding, a
sleep time, a haemoglobin reading and a coach's years of experience. **Change the
meaning, never the digit.**

**The `7`s that are left are weeks, not levels.** Phase 1 already converted every
level-`7` to `HV.levels()`. The literals still standing in
`console-clients.js` — `upcomingCelebrations(7)` at `:168`, `inDays < 7` at
`:174`, `days.slice(-7)` at `:268` — are all **a week**, and templating them
would be a regression. The one stale item is the *comment* at `:64` ("the 7-level
HAALVING Index glimpse"), which should read from configuration in words.

**Typed weight drifting from the weigh-in log.** Accepted, by decision. The
read-only caption in §5 is the guard: the card may be stale, but it can never
silently contradict Trackers.

**Nine tabs.** `.tabs` scrolls, but the ninth tab is off-screen at laptop width
with no visual cue. Verify a coach can find Notes without being told it exists.

**Two clocks read as one.** A client at *Cycle 3 · Day 6* with *56 days left* is
correct and looks contradictory. The header labels both, always, and never shows
a bare number.

**"My change didn't do anything."** Either the saved store is at the same `__v`
(bump `seedVersion`, or hit Reset demo), or the service worker served the old file
(bump `CACHE`, not just `?v=` — the SW matches with `ignoreSearch: true`, so the
cache name is the only real lever). Both have cost real time before.

**Mathew's demo moves.** Derived, his today goes from day 3 to day 8 — a rest day
— and he is the persona used to demo the Day-8 weigh-in automation. Check the
automation still fires.

**Rajesh's dietitian is on cover.** Deriving through `HV.staffFor` correctly shows
Divya rather than Sneha for 24 hours. Correct, but it will read as a regression to
anyone who knows the seed.

**Two clocks, elsewhere.** `console-schedule.js` keeps its own scheduling grid on
a days-relative-to-today axis. After this change the console can show a coach one
set of times and the client another, with nothing reconciling them. Out of scope,
named as the next gap.

## Out of scope

- Reconciling `console-schedule.js` with the derived calendar.
- Deriving `calendarsPast` — past cycles stay recorded as they happened.
- Any real email or SMS delivery. Verification is an admin's mark, by decision.
- Client-side editing of profile fields. The console owns the record; the client
  app reads it.
