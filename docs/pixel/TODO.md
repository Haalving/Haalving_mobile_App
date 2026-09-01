# Pixel TODO

Screens whose measured delta is over the threshold. This is the precision list:
each line is a screen to sit with and close, not a screen that is broken.

<!-- PIXEL:AUTO:START -->

_From the last clean run, 2026-09-01 16:05 UTC. (A 16:09 re-run could not sign in —
the C2 session was resetting the dev DB, which revokes tokens mid-run. Re-run when
the DB is stable, with a live token in `scripts/.pixel-tokens.json`.)_

- [ ] **today** (rajesh) - 70,998 px differ (down from ~151k). Diff: `docs/pixel/shots/today.rajesh.diff.png`
- [ ] **today** (ananya) - 70,883 px differ (down from 151,241). Diff: `docs/pixel/shots/today.ananya.diff.png`
- [ ] **profile** (rajesh) - 802,559 px: the harness caught the LOGIN WALL (the session
      died before this capture when the DB was reset), not the profile screen. Not a
      design delta — profile has not yet been measured signed-in. Re-run on a stable DB.

The `today` residual is the streak stub (reads 0 until `me.streak` is served) plus a
seed divergence for Ananya (backend: 1 meal, no session; demo: 4 meals, a live yoga
session) — a backend/seed matter, not a mobile one. See REPORT.md for the breakdown.

<!-- PIXEL:AUTO:END -->

## Needs API field

Cards the client app draws at the demo's real boxes today, with the value stubbed
because the client API does not serve the fact yet. Each lights up the moment its
field arrives — no mobile change needed. Shapes the backend session can add:

- **`today` streak** — the streak card (app.css `.streak` :591) is drawn on Today
  and reads `0` with seven unlit flames. Add to **`GET /client/me`**:

  ```ts
  streak: {
    days: number;      // consecutive kept-days ending today (a day is "kept" when
                       // every one of that day's tasks is done; today never breaks it)
    kept: boolean[];   // exactly 7, oldest → today — the last seven cycle-days,
                       // true where that day was kept, for the flame row
  }
  ```

  Demo source: `client-today.js:790-821` computes both from the calendar; the mobile
  screen only renders them (`mobile/src/components/client/TodayBands.tsx` `StreakBand`).

- **`today` arrival** — the "How are you arriving?" band (app.css `.arrive` :550) is
  drawn on Today in its unanswered state. Add to **`GET /client/today`**:

  ```ts
  arrival: { mood: 'happy' | 'sad' | 'angry' | 'drained' | null }  // for THIS cycle-day
  ```

  and, when the C2 sheet is wired, **`POST /client/arrival`** `{ mood, note? }` writing
  the mood for the current cycle-day (one per day, revocable), `actorKind: CLIENT`.
  Demo source: `client-today.js:298-444`.

- **`today` morning film** — the play mark (app.css `.filmmark` :3622) rides the band's
  right seat, present but inert. Add to **`GET /client/today`**:

  ```ts
  film: { name: string; url: string } | null   // the day's prescribed clip, or null
  ```

  Demo source: `client-today.js:849-860`, `HV.motivationFor`. Only the real today plays
  (a browsed day is a glance, not an arrival).

### Still deferred on Today (need more than one field)

- **The plate prescription and per-session dose** (reps, poses, dishes) shown inside an
  open pillar drawer — needs the task catalogue, a later sprint. The drawers, their
  summaries and the plate slots are drawn; the level-book detail is not.
- **The "Today's read" card** (`client-today.js:756-769`) — static content in the demo,
  below the fold at 390×844, not yet ported.

## Needs route

Screens (C2–C4) built breadth-first against a fixture in `mobile/src/api/fixtures/`,
falling back to demo data until the real `/client/*` route ships. When the route
lands the hook uses it with no screen change; then delete the fixture.

- **`GET /client/meals/:id`** → `mealFixtures` (`fixtures/meal.ts`), `useMeal`. The
  meal-detail read (slot, dishes, fullness, protein, kcal, `final` rating with rubric +
  voice, `observation`, `pendingLine`). Serialise post-rules.ts: `final` only after a
  rating; observation clients never carry stars. (m-raj-bf rated, m-raj-lunch pending.)
- **`POST /client/meals`** (+ presign) — the meal WRITE. Meal capture's "Log this meal"
  currently returns to Today instead of persisting; wire when the C2 backend lands.

## Pushed screens shown with the tab bar

The new pushed routes (meal, meal-detail, and the C2–C4 screens to come) are
registered `href:null` in `(tabs)/_layout.tsx` so they render inside the client
shell with the tab bar, as the demo does. Onboarding stays a standalone route
(no shell), which is correct.
