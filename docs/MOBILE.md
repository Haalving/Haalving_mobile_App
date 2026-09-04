# MOBILE — the client app, screen by screen

The Expo client app under `mobile/`. Each screen is ported from the demo's
`client-*.js` view at the demo's exact boxes, dark, on `ClientGround`. Where a
`/client/*` route is committed the screen uses it; otherwise it reads a fixture in
`mobile/src/api/fixtures/` that falls back on a 404 (`orFixture`), and the route is
listed in `docs/pixel/TODO.md` under "needs route".

## Routing

The client shell is `(tabs)/_layout.tsx` — five tabs (Plan · Today · My Circle ·
Trackers · Community) plus Profile on the avatar. Pushed client screens are
registered `href:null` in that layout so they render **with the tab bar**, as the
demo does inside its client shell. Onboarding is the one exception: standalone, no
shell, a top-level route in `app/_layout.tsx`.

| Screen | Demo view | App route | Committed route | Fixture |
|---|---|---|---|---|
| Today | client-today.js | `/today` (tab) | `/client/me`, `/client/today` | — |
| Profile + Settings | client-profile.js | `/profile` (avatar) | `/client/profile` | `settings.ts` |
| My Circle | client-coach.js | `/coach` (tab) | — | `circle.ts` |
| Plan | client-plan.js | `/plan` (tab) | — | `plan.ts` |
| Trackers | client-trackers.js | `/trackers` (tab) | — | `trackers.ts` |
| Journey | client-journey.js | `/journey` (hidden) | `/client/me` | — |
| Community | client-tribe/hive.js | `/community` (tab) | `/client/community/gatherings` | (stub) |
| Meal capture | client-meal.js | `/meal` (hidden) | `/client/me` | — |
| Meal detail | client-meal.js | `/meal-detail/[id]` (hidden) | — | `meal.ts` |
| Get a coach | client-coaches.js | `/coaches/[pillar]` (hidden) | — | `coaches.ts` |
| Onboarding | client-onboard.js | `/onboard` (standalone) | — (reads plan flags) | — |

## C2 — meal capture, meal detail, My Circle, Get a coach

- **Meal capture** (`(tabs)/meal.tsx`) — Photo → Fullness → Confirm wizard. Reads
  `/client/me` for the dietitian name + observation. Stubbed: camera viewfinder
  (no expo-camera), three-stop fullness (no native Slider), "Log this meal" returns
  to Today (no `POST /client/meals` yet).
- **Meal detail** (`(tabs)/meal-detail/[id].tsx`) — three branches: rated (lg stars,
  voice note, note, rubric, plate), observation (capture-only), dietitian-pending.
  Fixture `meal.ts` (`useMeal`). Photos null until R2.
- **My Circle** (`(tabs)/coach.tsx`) — the day-session thread (pinned card, bubbles,
  meal attachments, a coach rating with voice, composer fixed above the tab bar).
  Fixture `circle.ts` (`useCircle`). Composer presentational (no Socket.IO).
- **Get a coach** (`(tabs)/coaches/[pillar].tsx`) — the per-pillar marketplace with
  the "Your coach" marker. Fixture `coaches.ts` (`useCoaches`). Connect presentational.

## C3 — Plan, Trackers, Journey

- **Plan** (`(tabs)/plan.tsx`) — the tab strip (Calendar · Weight · Daily ·
  Level-up) and each tab: the 14-cell cycle calendar (rest 5 & 10, review 12,
  meeting 14), pillar tiles, goal ledger, daily targets, level-up criteria. Fixture
  `plan.ts` (`usePlan`). Calendar marks are pillar status dots (not the demo's named
  session rings — needs the session catalogue); cycle-strip chips, day sheet, past
  cycles and the journey gallery are deferred.
- **Trackers** (`(tabs)/trackers.tsx`) — scene band, Daily/Journey control, day
  strip, six signal readings and the Nutrient-Panel ledger. Fixture `trackers.ts`
  (`useTrackers`). **Deferred:** the floating hologram figure (needs `body.webp`,
  expo-blur, SVG masks) is a signal grid here; per-signal detail pages and the FAB
  entry sheets are not ported.
- **Journey** (`(tabs)/journey.tsx`) — the HAALVING Index as four brick towers, the
  review countdown, the observation variant. Reads `/client/me` (levels + day) — no
  fixture. The level-up preview / how-it-works sheets are presentational.

## C4 — Onboarding, Profile settings

- **Onboarding** (`app/onboard.tsx`) — the standalone chaptered flow (welcome, you,
  goals, conditions, fitness, measures, guide, begin) over the night scene, with the
  segmented progress and the **Svayam "Opening soon"** gate that refuses the tap.
  **Deferred:** the swipe story deck is a static step; the measure tapes are
  ±steppers; `POST /client/onboard` is backend, so "Begin" routes to login.
- **Profile settings** (`(tabs)/profile.tsx`) — the settings block below the vault:
  notification toggles, the announcements opt-out, and the two DPDP consents shown
  "Granted" with Manage. Fixture `settings.ts` (`useSettings`). Toggles flip
  locally; PATCH writes are backend. **Push notifications skipped** per instruction.

## Load-bearing rules kept

- **Fixtures never mask a real failure** — `orFixture` substitutes only on a 404, so
  a route that exists but is broken (401/500) still throws.
- **The phone is not a second gate** — fixtures are shaped as the serialised
  (post-`rules.ts`) payload; nothing the server would strip (e.g. `teamonly` circle
  rows) is present to be filtered here.
- **Dark always, on the shared ground** — every screen sits on `ClientGround`; the
  scene band is transparent on the client shell.
- **No backend source touched** — only `mobile/`, `scripts/pixel-compare.mjs` and
  `docs/`. The C2 backend work stays in another session.

## Harness

`scripts/pixel-compare.mjs` now lists all client screens (report mode). Capturing
requires the API on :4001, Metro on :8081, and a signed-in session — which the
in-flight C2 backend work repeatedly invalidates by resetting the dev DB. See
`docs/pixel/REPORT.md` for the last clean numbers and the standing sign-in caveat.

## Status — F2 baselined, F1b-plan next (2026-09-02)

**F1 (real client routes) shipped.** Every fixture with backend substrate is now
served — settings, arrival, meal-detail, push-token, circle (+ the client-app state
migration). See the `F1:` commits on `main`; the backend suite is 421 green.

**F2 (pixel gate) is baselined and the harness is operational.** The old sign-in
blocker is gone: a dev-only `POST /auth/client/otp/dev-code` mints a code through the
real flow, and the harness takes a **fresh token per screen** — the app rotates the
refresh token on boot, so a reused one was spent by the second capture and every later
screen photographed the login wall. The route is registered only when `env.ts` judges
the API a development box — no hosting-platform variable (`RAILWAY_*`, `RENDER`, `FLY_APP_NAME`, ...) and a localhost `DATABASE_URL`
(the host Prisma uses, so a `?host=` parameter counts). Against a hosted database set
`HV_DEV_ROUTES=allow` in `backend/.env` (see `.env.example`; it is ignored on Railway
itself); the API prints a boot warning when it has turned the route off, and the
harness prints one line naming the fix when it meets the 404. Two runtime traps were
also cleared: a stale Metro
cache serving a 500 bundle (restart with `--clear`), and CORS being a one-origin
allow-list (run the app Metro on **:8081**). Baseline numbers are in
`docs/pixel/REPORT.md`.

**A pixel delta is not pure layout yet.** The gate compares the demo's date-relative
day against the dev DB, which does not reproduce it (e.g. rajesh has no session dated
today, so the app shows "No session today" where the demo derives a full day), plus the
known stubs (streak, coins) and a few real layout bugs. So `today`/`plan` cannot reach
threshold until the data matches.

**Next: F1b-plan/seed, then F2 tuning.** Model + seed the goal ledger, level-up criteria
and per-day marks, and align the date-relative day, so `GET /client/plan` serves what
the fixture shows and the gate measures true layout parity. The full substrate map —
where each piece lives in the demo (`goalLedger` in `data.js`, `HV.levelup` /
`HV.calendarFor` in `core.js`, `daily` from the `program` blob) — is recorded in the
`pixel-harness-operation` and `f1-client-routes-status` memories.

**`community.test.ts` is load-flaky; if it's the sole failure, verify in isolation before treating red as real.**
