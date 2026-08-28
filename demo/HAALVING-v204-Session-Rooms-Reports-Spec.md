# v204 — Session rooms, session reports, session ratings

Build spec. Implements the plan at `~/.claude/plans/admin-flow-to-join-snoopy-newt.md`.

## The product sentence

A coach (or the Super Admin, for anything) **joins** a session from wherever they are
standing — the client's Plan tab, the Work Queue, or the Schedule. The room is simulated.
Walking out of it is what ends the session: **staff owe a structured report** (prompted at
once, chased by the queue until filed) and the **client is offered stars + a comment**,
which they may ignore.

## Doctrine: date keys, never day-offset keys

`rd` is a sliding axis — `0` is always today and nothing ages (`console-schedule.js:14-17`);
the demo world replays daily. Therefore:

* `rd` keys = schedule SHAPE that must slide with a series (`exc`, `done`, remapped by
  `shiftSeries`).
* `dateISO` keys = records that something HAPPENED (`t.reminded[todayISO]` core.js:3580,
  `autoOnce('photo|cid|today')` core.js:3739).

`t.joined`, `sessionReports.dateISO`, once-guards, worklist ids and deck-card ids are all
date-keyed, so `shiftSeries` needs no change and yesterday's record never masks today's
obligation.

## Data contract

```
t.reportRequired   absent = ON  iff  kind ∈ {session, meeting} AND t.clientId
                   explicit false when unchecked. Series-level (never in exc[rd]).
                   Copied by BOTH detach paths beside allowOverlap.
                   Meetings with no client (all-hands) default OFF.

t.joined           { [dateISO]: { [uid]: ts } }     stamped on entering the room

store.sessionReports[]
                   { id:'sr-'+seq, taskId, dateISO, clientId, byId, cy, day,
                     went:'great'|'okay'|'tough', note, concern, next, ts }
                   cy/day snapshot c.cycle/c.day at write time — the join key for
                   every existing (cy, day, key) surface. Pod-side only.

owed (derived)     occ = HV.occursOn(t, 0); ended = occ.start + occ.dur <= nowMin
                   owed = (occ.assignees ∪ keys(t.joined[todayISO]))
                          − client uids − already-filed
                   occ.assignees (cover swaps), not t.assignees.
                   Groups owe only if they joined (core cannot expand groups).
                   Skipped for c.observation.

guard              autoOnce('rpt|'+taskId+'|'+dateISO+'|'+uid)   — per PERSON,
                   stamped LAST, after every refusal.

worklist row       { id:'w-rpt-'+taskId+'-'+dateISO+'-'+uid, text, owner:uid,
                     due:'today', pill:'warn', status:'open', type:'report',
                     pillar, taskId, dateISO }

deck card id       'rate.'+taskId+'.'+todayISO        (reqIgnored is permanent)

perm               'joinAnySession' on admin + HV.PERM_LABELS
auto key           'rating' row in HV.defaultAutos (the one source of auto keys)
seedVersion        45 → 46
```

UI copy always reads **"Session report"** — `labReports` and "Reports & Exports" own the
bare word elsewhere.

## Build order

| # | File | Change |
|---|---|---|
| 1 | core.js | `HV.reportRequired` · `HV.sessionEnded` · `HV.reportFiled` · `HV.reportsOwed(o)` after `bookingsOn` (:518) |
| 2 | core.js, console-people.js, data.js | perm `joinAnySession`; `PERM_LABELS`; seedVersion 46 |
| 3 | console-schedule.js | `#tf-repreq` checkbox after `#tf-allowov` (:1160); 3 save paths; both detach copies |
| 4 | **js/views/meet.js (NEW)** | `HV.meetui = { join, reportSheet }` — own `.mtg-` CSS, own overlay |
| 5 | console-schedule.js | detail-sheet Join + "N of M filed" pill + `HV.schedui` export |
| 6 | core.js, client-plan.js | lift `openFeedbackSheet` → `HV.rateSheet`; deck rate-card; `defaultAutos` rating row |
| 7 | core.js | `HV.reportSweep(o)`; register in tick (:3969) + boot (:3993). No quiet-hours gate |
| 8 | console-ops.js | `TYPE_LABELS.report`; File button; "Happening now" Join strip |
| 9 | console-clients.js | Plan-tab "Session room" row + `wirePlan` join dispatch |
| 10 | client-today.js | in-window Join chip → the room |
| 11 | console-clients.js, core.js | `sessionsCard` report render; `HV.brief` line |
| 12 | core.js, data.js | demo grafts (ended-90m, live-now) + one seeded filed report |
| 13 | index.html, sw.js | `?v=204` everywhere · `CACHE='haalving-demo-v204'` · meet.js in both |

## Non-negotiables (each one is a defect that already bit this codebase)

1. The room is its **own overlay**, not `HV.sheet` — sheets are single-slot and the Leave
   moment must open one.
2. `closePop(false)` / `HV.closeSheet()` before opening the next surface.
3. `HV.esc()` every free-text render; deck `rq.html` is injected RAW.
4. Report bylines resolve to REAL user ids — `HV.staff()` signs unknown ids as the AI.
5. Default-ON only for tasks with a `clientId`, or the all-hands meeting conscripts twelve
   people.
6. `reportSweep` ignores quiet hours (n5 "session-critical exempt"); adding the flowSweep
   gate breaks evening sessions and late test runs.
7. Client feedback speaks PILLAR keys, staff records speak session-role keys
   (`wellness` ↔ `mind`) — use the existing mappers when joining.
8. Version levers are three: `?v=`, `CACHE`, `seedVersion`. The CACHE name is the real one.
