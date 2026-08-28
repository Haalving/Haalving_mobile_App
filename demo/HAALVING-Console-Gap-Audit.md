# HAALVING Admin & Team Console — Requirements Gap Audit

> **HISTORICAL — do not read the scores below as current state.**
>
> This audit was taken on **8 Aug 2026 at ~v156**. The handover build is
> **v206**, and **57 commits** landed in between. The "44% overall" headline
> and every score in the scoreboard describe the app *as it stood that day*.
>
> Most of the lowest-scored gaps have since been built. Non-exhaustively:
> #2 leave workflow and #3 cover access (the reassign → accept → approve
> board), #9 overlap control and #11 weekly availability (declared hours,
> split shifts, and `HV.conflicts` refusing a booking), #14 automated tasks
> (workflow templates, switched on per client), #17 all-staff broadcasts,
> #21 employee records (People & Access), and #22/#23/#24 session
> attendance, the pre-session brief and two-way star feedback (session
> rooms and the report that closes them).
>
> Keep this file as the record of what the work was aimed at. For what the
> code actually does now, read `CLAUDE.md` and the design specs under
> `docs/superpowers/specs/`, which are maintained alongside the code.

**Date:** 8 Aug 2026 · **Branch:** `console-ia-phase-a` (working tree at ~v156) · **Scope:** the 24-point Admin & Team console checklist supplied by TJ.

**Method:** 13 audit agents swept the whole codebase (core.js, data.js, vitals.js, all 26 views). Every verdict is anchored to `file:line` evidence, and a second wave of skeptical cross-checkers re-verified all 24 verdicts (every "missing" claim was re-hunted under alternative names). All 24 verdicts were confirmed with zero corrections.

**Numbering note:** the source list numbers 21 and 22 twice. The second pair is renamed here: **#23** = AI pre-session brief, **#24** = two-way session feedback. Also, **#4's requirement text is cut off in the source** ("In the config page I should …") — it was scored as "does a working config page exist", and the real ask still needs to be written down.

---

## The one rule behind every score

This is a client-side demo, so a feature only counts to the degree the workflow is **demonstrable in the UI and backed by the store** (you tap, it saves, it survives reload). A screen that merely *displays* seeded numbers is a showroom car with no engine — it looks finished but nothing turns over. Several boards below lost points for exactly that.

**Score rubric:** 100 = end-to-end demonstrable as specced · 70–99 = core flow works, edges missing · 30–69 = real substrate, but the specced workflow can't be walked through · 1–29 = only tangential substrate · 0 = nothing.

---

## Scoreboard — overall completion: 44%

| # | Requirement | Done | Verdict |
|---|-------------|-----:|---------|
| 8 | Scheduler: self / team / client tasks | 88% | Mostly there |
| 10 | Super admin sees all client + admin data | 85% | Mostly there |
| 4 | Configuration page *(ask cut off — see note)* | 80% | Mostly there |
| 20 | Team evaluations at client meetings | 78% | Mostly there |
| 16 | Super admin tracking boards | 75% | Mostly there |
| 19 | Admin retrieves full client data | 70% | Mostly there |
| 12 | Team sees full client file | 68% | Partly there |
| 22 | Session reminders + attendance tracking | 55% | Partly there |
| 5 | Client emotion graph in console | 40% | Partly there |
| 9 | Overlap control + group-task acceptance | 40% | Partly there |
| 11 | Weekly availability + time zones | 40% | Partly there |
| 15 | Review-meeting questionnaire | 40% | Partly there |
| 18 | Employee KPIs, best performers | 40% | Partly there |
| 7 | Reply deadlines + escalation ladder | 35% | Partly there |
| 14 | Automated tasks (day-8 weight nudge) | 35% | Partly there |
| 23 | AI pre-session brief | 35% | Partly there |
| 1 | HoD role: team oversight + allocation | 30% | Partly there |
| 13 | Medical uploads + change tracking | 30% | Partly there |
| 21 | Employee records + level badges | 30% | Partly there |
| 24 | Two-way session star feedback | 30% | Partly there |
| 2 | Leave workflow (reassign → approve) | 12% | Barely started |
| 17 | All-staff broadcast messages | 10% | Barely started |
| 3 | Temporary client access during leave | 8% | Barely started |
| 6 | Birthday & anniversary alerts | 5% | Barely started |

---

## Five foundations most gaps trace back to

These are the load-bearing absences. Fixing them unlocks whole clusters of the checklist at once.

1. **No HoD layer.** `HV.ROLES` (core.js:17) has no Head-of-Department role, each department has exactly **one** seeded coach (data.js:90) so there is no "team under a head", and — critically — **nothing in the app ever writes a client's pod**: no picker exists to assign a coach to a client (the only pod write is onboarding clearing it, client-onboard.js:1215). Blocks #1, and starves #2, #3, #11.
2. **No clock.** Chat messages have no real timestamps (only `seq` + a frozen `minsAgo`), meal SLAs are static numbers that never tick, and there is **no `setInterval` anywhere in the codebase**. Blocks the timers in #7, firing reminders in #14/#22, the hour axis in #5, and date-math in #6.
3. **Thin staff records.** A staff member is just `{id, role, name, subtitle}` — no level, no joining date, no availability, no time zone, no emergency contact. Blocks #2 (level-matched cover), #11, #21, and halves #18.
4. **Seeded dashboards, no derivation.** Incentives, deviations, calorie log, and the live ops stats are hard-coded seed tables — the caption "Auto-computed from telemetry" is copy, not code (console-ops.js:150, data.js:1508). Caps #16 and #18.
5. **No feedback/questionnaire structures for sessions.** No file upload exists anywhere (#13), no session rating or comment structure (#24), no meeting log (#23), no review-day questionnaire trigger (#15) — though the engines to build on (assessFlow chat, starInput, approvals chains) all exist and work.

---

## Per-requirement detail

### #1 — HoD role & team oversight — 30%
**Exists:** Ops-wide pieces only. People & Access shows every staff member with a live "n allocated" count (console-people.js:74) and editable capacity bars (console-pipeline.js:186); the work list filters by owner so a manager can see one person's task load (console-ops.js:52); a Care-team-allocation approval travels a real signature chain (data.js:1359) — but its pod proposal is fixed seeded text.
**Gap:** No HoD role, no department teams (one coach each), no department-scoped view, and no UI that actually writes `c.pod[roleKey] = staffId`. The heart of the requirement — the HoD allocating people to clients — cannot be demonstrated.

### #2 — Leave workflow — 12%
**Exists:** No leave feature at all. What exists is machinery it could ride on: the working multi-stage approvals engine (core.js:160), a schedule editor that can move a task to another person, and capacity bars.
**Gap:** Leave request object + "Apply leave" UI; a `leave` approval type routed HoD → configurable approver; a gate blocking approval until tasks are reassigned; the approver seeing the reallocation; a `level` field on staff and a same-level replacement picker. The Chains tab (console-config.js:155) is read-only today, so "who approves" is not yet configurable from the UI.

### #3 — Temporary access during leave — 8%
**Exists:** The enforcement point works: a coach sees a client only while their id is in `c.pod` (core.js:97), so access genuinely follows pod membership.
**Gap:** Pod seats carry no dates; there is no substitute/cover concept, no auto-revert, and no pod-writing UI at all. Needs `{staffId, coverId, from, to}` on the seat, access checks honouring the range, and a cover-setting UI inside the #2 flow.

### #4 — Configuration page — 80% *(requirement text cut off)*
**Exists:** A real four-tab Config page (console-config.js). Program tab: six store-backed editable tiles (levels, cycle length, review day, rest days, meeting day, sessions per cycle). Notifications tab: five persisted rules with editable schedules and on/paused toggles. Plans and Chains tabs are read-only reference displays. Edits gated on `manageConfig`.
**Gap:** Plans tab is static (HV.PLANS is a code constant); Chains can't be edited (blocks #2's configurable approver); rules can't be added/deleted; no input validation. **TJ: the original sentence needs finishing so the real ask can be scored.**

### #5 — Client emotion graph in console — 40%
**Exists:** The client half is real: the Today arrival sheet saves mood + optional note to `c.moods`/`c.moodNotes` instantly (client-today.js:532), with a 7-day strip and seeded history for Rajesh. Both apps share the store, so the console *could* read it live — but no console view mentions moods at all. The Clients workspace tab row (#/clients/:cid/:tab) is exactly where an Emotions tab would slot in.
**Gap:** The chart itself; and a data-model catch — check-ins are keyed one-per-day (`'3.5'`) with **no clock time**, so the inspiration image's hour axis (6/12/18 ticks) has nothing to plot. Either timestamp check-ins (and allow several per day) or simplify the chart to one point per day.

### #6 — Birthday & anniversary alerts — 5%
**Exists:** Clients carry only `age`. The single trace of a birth date is a hardcoded `dob` in the onboarding draft (client-onboard.js:125), never displayed again. "Anniversary" appears nowhere.
**Gap:** Everything: dob/anniversary fields in the seed (+ `HV.seedVersion` bump), date-vs-demo-today logic, alert surfacing (Clients rail badge / digest strip / client greeting), and an acknowledge action so it's *managed*, not just shown.

### #7 — Reply deadlines & escalation — 35%
**Exists:** A real per-meal SLA model: food photos get `slaMin: 60` when a human must rate (client-meal.js:234); the meal queue sorts by SLA, shows "N min left" pills and breach states, and publishing a rating clears it (console-meals.js:24). One breach is hand-seeded.
**Gap:** Nothing ticks (no timestamps, no interval timer), nothing notifies the dietitian, nothing escalates to HoD/Super admin ("Ops notified" is a hard-coded label), and the 15/10-min thresholds are code literals, not config. Needs a demo clock, an escalation ladder that writes real notifications, and threshold/target fields in Config.

### #8 — Scheduler task types — 88%
**Exists:** The strongest area. Full drag-drop team calendar (console-schedule.js): tasks carry individual assignees (self-task is one tap), live-resolved groups (whole team, departments, ops, per-client pods) and an optional attached client; kinds are session/meeting/internal/duty; person and client filter dropdowns switch lenses; `allocate` roles land on the whole-team view; create/edit/drag/resize/recur/delete all persist.
**Gap:** No literal "Self/Team/Client" category field (it's inferred); no "my department" lens for a future HoD; and whole-team visibility isn't restricted — every console role can pick "Everyone", only the default differs.

### #9 — Overlap control & task acceptance — 40%
**Exists:** Overlap: genuinely handled — saving into an occupied slot is blocked with a warning naming who holds it until you tick "Schedule in parallel anyway" (console-schedule.js:301); colliding tiles lane-pack side by side.
**Gap:** The acceptance lifecycle is absent entirely: group tasks are final on save — no per-participant accept / reject / reschedule / hold, no "No response" pending state (greps for rsvp/invite/attendee: zero). Needs `t.responses[userId]`, response buttons for invitees, and a finalized-on-acceptance gate. Optionally a per-task "allow overlap" flag applied to drag-moves too (today drags only toast).

### #10 — Super admin sees everything — 85%
**Exists:** Super Admin holds all 8 sidebar sections and the widest perm list (core.js:19); `seeAllClients` opens every client's six-tab file; People & Access, Config, Reports/Exports and Incentives are admin-editable/reachable.
**Gap:** The deliberate raw-medical carve-out: Docs raw list, Medical Review queue and the medical route are Doctor-only. Admin can even self-grant `rawRecords` in the live matrix (console-people.js:239), but console-medical.js is registered `roles:['doctor']` — a hard literal that wouldn't open even then. Decide: keep the carve-out (defensible clinically) or add `rawRecords` to admin and swap the role literal for the perm gate.

### #11 — Availability & time zones — 40%
**Exists:** Legs two and three of the workflow: the dept-head-style calendar shows everyone's booked hours with per-person filtering, and assignment with collision warnings works end to end (console-schedule.js:331). Capacity (client-count) bars exist per staff member.
**Gap:** Leg one and the whole timezone dimension: staff can't declare weekly availability (no field, no editor — a comment even notes the old stub was superseded), and **no timezone exists anywhere** — no tz field on anyone, all times naive local (greps for timezone/UTC/offset/Intl: only false positives). Needs `u.avail` + a paint-your-week editor, free/busy shading on the calendar, tz fields and per-zone rendering.

### #12 — Team sees full client file — 68%
**Exists:** The six-tab client workspace is real and partly live: Overview merges chat + meal logs from the shared store (a client action appears on re-render), Trackers shows daily numbers and session rings, Docs shows doctor-signed summaries (raw = Doctor only, by design), Notes writes pod-private notes, and the Doctor's summary-signing workflow works end to end (console-clients.js:13,221,265).
**Gap:** Onboarding *answers* have no console surface (only pipeline stage cards); the entire lab panel (`HV.vitals`, 80+ markers) renders only in the client app — not even the Doctor sees values console-side; the raw-doc viewer is a placeholder toast; tracker *history* (21-day strips) is client-app-only. Note the spec tension: "team sees medical reports" vs. the product's deliberate Doctor-only raw-records rule — needs TJ's call.

### #13 — Medical uploads & change tracking — 30%
**Exists:** A serious clinical model (vitals.js: ~90 markers, reference bands, 12 body systems) rendered as the client Vital Panel; a Records Vault list; and the Doctor's summary sign-off flow — the only real medical data entry.
**Gap:** No file input exists anywhere in the app; marker readings are **one hard-coded report per client in module code**, not a dated series in the store, so Feb-vs-July comparison has nothing to compare; the "every document is versioned" notices are copy with no mechanism (summaries would overwrite on re-sign). Needs store-backed dated reports, an add-report flow (client upload sheet or console key-in), per-marker deltas/sparklines, and a real supersede chain.

### #14 — Automated tasks — 35%
**Exists:** Automation *settings* that persist: per-client Automations pad toggles (console-clients.js:1117) and five Config notification rules. The Assistant pad genuinely computes suggestions from live client state from day 8+ (closest thing to a cycle-day trigger).
**Gap:** Nothing ever executes a rule — no engine, no fired reminder, no "automated"-stamped timeline entries; no day-8 weight rule and **no weight-submission flow at all** in the client app. Needs a demo engine keyed to cycle day, a weight-entry surface, and fired reminders landing visibly in the circle.

### #15 — Review-meeting questionnaire — 40%
**Exists:** A fully working questionnaire machine — the conversational assessment in My Circle saves every tapped answer to the store and posts a team-only summary staff can read (client-coach.js:222) — but it fires at onboarding, not at the Day-9 review. Day 9 shows only passive markers.
**Gap:** A review-day trigger reusing the assessFlow engine with a second question catalogue, answers keyed to the cycle, surfaced inside the Level Review Pack (console-builder.js) for the meeting.

### #16 — Super admin tracking boards — 75%
**Exists:** Client list with search/filters, the six-stage onboarding kanban with real actions (welcome send, InBody key-in, capacity override), rich per-client status everywhere, goal-sheet sign-off grid, per-person calendar lens, capacity bars, staff allocation counts, Incentives and Live boards (console-pipeline.js:16, console-digest.js:284).
**Gap:** "Full goal tracking" is half-surfaced — `goal`, `purpose`, `goalLedger` render only in the client app (client-plan.js:425), nothing console-side; and several boards (deviations, calorie log, incentives, ops stats) are static seed with no derivation. Kanban stages also aren't draggable.

### #17 — All-staff broadcasts — 10%
**Exists:** A working chat system — but every thread hangs off one client (circles keyed by clientId, core.js:120). Team-only notes exist, still per-client. The only fan-out ("Send all reviewed") targets clients.
**Gap:** An all-staff channel: a team-wide thread key, a perm-gated compose surface, and staff unread badges. Greps for broadcast/announce/holiday/policy: empty.

### #18 — Employee KPIs — 40%
**Exists:** A real, access-restricted per-staff performance table — Incentives board: sessions, avg rating, on-time %, payout (console-ops.js:251) — plus capacity bars.
**Gap:** Every number is hard-coded seed ("Auto-computed from telemetry" is aspirational copy); nothing recomputes from actual sessions/ratings/worklist, and there's no ranking or top-performer highlight. Derive the numbers from store activity and add a leaderboard.

### #19 — Admin retrieves full client data — 70%
**Exists:** A genuine client-360 two clicks away: the six-tab workspace, deep-linkable per tab, plus a Reports & Exports page listing per-client progress sheets with Export buttons.
**Gap:** Export buttons are stubs (toast "Exported (demo)", console-ops.js:288) — nothing leaves the app; goal ledger and the vitals panel are client-app-only; raw medical excluded by design. Make one export real (printable/CSV) and pull goals + vitals into the console file.

### #20 — Meeting evaluations — 78%
**Exists:** Demonstrable end to end via the Level Review Pack (#/review): four department owners record Upgrade/Hold with forced reasons, RBAC-gated per seat, written to `store.levelPack.decisions`, visible to all team roles; the final card travels the SOP chain and lands in the client's circle as a pinned card — so the outcome reaches team *and* client (console-builder.js:325→443). The dietitian's meal rating is a second working evaluation loop.
**Gap:** The pack is one seeded instance hard-bound to Suresh — no per-client/per-meeting creation; vocabulary limited to Upgrade/Hold + one line; Day-11 progress meeting captures nothing.

### #21 — Employee records & level badges — 30%
**Exists:** Working staff management at the name/role level: Add employee, Deactivate/Reactivate, full role/permission matrix, allocation counts (console-people.js:98).
**Gap:** The record itself is four fields — no date of joining, CV, emergency contact, or memo; existing staff can't even be edited (only added/deactivated); and no staff level/badge concept exists (levels and badges belong exclusively to clients today). Extend the user object + forms, add a settable staff tier rendered as a badge.

### #22 — Session reminders & attendance — 55%
**Exists:** Real pieces: the client "Request a change" flow pushes a message *and* a real ops worklist item (client-plan.js:392); "Mark session done" writes status and increments counters feeding the level-review criterion; team-side reschedule (drag/detach/cancel-occurrence) fully works; reminder *configuration* persists in three places (Config rule, client Profile toggles, per-client pad switch).
**Gap:** No reminder ever fires; the client can't cancel/reschedule a *specific* session (the request flow only exists while a proposed calendar awaits confirmation); no `rescheduled`/`no-show` states — the `cancelled` counter has no write path. Needs a demo tick surfacing "session in 2 h" cards, per-session client actions, and a console accept that updates the calendar.

### #23 — AI pre-session brief — 35%
**Exists:** Three brief-shaped surfaces; only one computes: the Assistant pad reads live client state (risk, cycle day, latest message) and generates suggestions with working accept/reject/post (console-clients.js:972). The morning digest "Copilot brief" lines are static seed. Mood is now recorded client-side but **never read by any console view**.
**Gap:** No brief is tied to a session: calendar sessions carry no brief, no meeting-log structure exists to draw on, and mood is unconsumed. Needs a per-upcoming-session generator composing from meals + trackers + thread + `c.moods`, surfaced on the responsible coach's Home/Schedule before the slot.

### #24 — Two-way session feedback — 30%
**Exists:** A complete star+comment pipeline — but only for meals, one direction: `HV.ui.starInput` (core.js:952) in the dietitian's composer, sub-5-star requires a note, rating lands in the client's chat with "See why". Coach-marketplace stars are static seed.
**Gap:** No client-side star input anywhere (the client can't rate a session, coach, or meeting); no team-side per-session "summary + rate the client" form; no feedback structure on sessions. Needs a post-session sheet on the client's done-mark flow, a mirrored console form per pod member, and both surfaced to the circle.

---

## Suggested build order for the gap phase

1. **The HoD foundation** (#1): HoD roles + multi-member departments in the seed + the pod-assignment sheet (the first real `c.pod` write). Nearly everything people-related sits on this.
2. **The staff record** (#21 + fields for #2/#11): levels, joining date, availability, timezone, contacts — one seed change feeds four requirements.
3. **The demo clock**: real timestamps + one ticking mechanism. Unlocks SLAs (#7), firing reminders (#14/#22), hour-level moods (#5), date alerts (#6).
4. **Leave end-to-end** (#2 + #3): now buildable on 1–3 with the existing approvals engine and an editable Chains tab.
5. **Availability editor + timezone lens** (#11) on the existing calendar.
6. **The quick wins on strong bases:** Emotions tab (#5), review questionnaire via assessFlow (#15), session feedback via starInput (#24), all-staff channel (#17), broadcast-ready People page badges, dob alerts (#6), goal ledger + vitals into the console 360 (#16/#19), derived KPIs (#18), per-client review packs (#20), pre-session briefs reading `c.moods` (#23), acceptance lifecycle on group tasks (#9), medical report series (#13).

**Open decisions for TJ:** finish requirement #4's sentence; rule on the raw-medical tension (#10/#12): should Super Admin and team members see raw records, or does the Doctor-only rule stand?
