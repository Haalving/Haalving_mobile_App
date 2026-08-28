# Day 1 — the demo, ported

The HAALVING demo PWA is now a monorepo: a PostgreSQL-backed API, a Next.js Team
Console, and an Expo client app. The demo is untouched at `demo/` and remains the
reference for everything visual.

**The client accepted the demo's screens, so the port matches them.** The design
tokens and the shared layout classes were copied out of `demo/app/css/app.css`
verbatim, section by section, each labelled with the source lines it came from.
The 77-mark icon set was lifted rather than retraced. Where a component had to be
rewritten in React or React Native, the markup is the same markup — because the
class names *are* the visual system.

---

## Run it

You supply PostgreSQL and Redis; this repo contains no container setup.

```bash
pnpm install

# 1. point backend/.env at your own PostgreSQL and your hosted Redis
#    (copy the block from .env.example)

# 2. prove both answer BEFORE touching the schema
pnpm --filter @haalving/backend check

# 3. build the schema and load the demo's story
pnpm db:migrate && pnpm db:seed

# 4. run everything
pnpm dev            # API :4000, console :3000, Expo :8081
pnpm test           # 95 tests
```

### The two services

| | What it needs to be |
|---|---|
| **PostgreSQL** | A database **this project owns**. `prisma migrate reset` drops and recreates it, so pointing it at a database another app uses destroys that app's data. Set the server's timezone to `Asia/Kolkata` — every clock rule here (cycle day, quiet hours 22:00–07:00, the SLA ladder) is a local-time rule. Both `postgresql://` and `postgres://` are accepted. |
| **Redis** | Anything reachable, including a small hosted instance. It holds only rate-limit counters and the OTP throttle — no application state — so losing it degrades rate limiting and nothing else. Use `rediss://` where the provider offers TLS. |

`pnpm --filter @haalving/backend check` runs both probes and is the gate before
any schema work. It reports host, port, database, server version and **existing
table count**, and tells "server unreachable" apart from "database not created
yet" — so a reset is never run blind against a database holding somebody's work.
It prints no credential, and scrubs the password out of driver errors.

### A remote Redis is fine, and the code expects one

The limiter folds `INCR` and `EXPIRE NX` into a single `MULTI`, so one request
costs **one** round trip rather than two. Timeouts are sized for a link across
the internet (3s per command, 10s to connect), and the limiter **fails open** —
if Redis is unreachable the request proceeds. That is deliberate for a health
product: a limiter that fails closed locks every client out of their own plan
the moment a cache node blinks.

### Ports on this machine

| What | Default | Here | Why |
|---|---|---|---|
| API | 4000 | **4001** | another Node service (started before this work) owns 4000 |
| Console | 3000 | **3001** | another Next app (`D:\Haalving_app`) owns 3000 |

Set in `backend/.env` and `web/.env.local`. Start the console with
`PORT=3001 pnpm dev`. A clean machine needs neither override. Nothing on this
machine was stopped or reconfigured to make room.

### Logins

| Who | Credential |
|---|---|
| Staff | `<id>@haalving.dev` / `Haalving@123` — e.g. `anita@haalving.dev` (Super Admin), `vikram@haalving.dev` (Fitness Coach) |
| Clients | phone + OTP. The code prints in the API terminal (`SMS_PROVIDER=console`). |

Client numbers: Rajesh `+919847022110`, Priya `+919746041190`, Dev
`+919809063317`, Ananya `+919400126834`, Mathew `+919846155207`.

The email is the demo's **user id**, not the first name — two people are called
Suresh, and "Dr. Kavya" would have given `dr@haalving.dev`.

---

## What was ported

### `shared/` — the one place all three agree

Pure TypeScript: no database client, no fetch, no React. That is what lets the
same permission test run in an Express middleware, a Next middleware and a React
Native screen.

| File | What |
|---|---|
| `rbac.ts` | `HV.ROLES` and `HV.NAV_ITEMS` **verbatim** — 12 roles, 9 nav items, 27 permissions |
| `pillars.ts` | the four pillars, both vocabularies, the pod seats, the departments |
| `plans.ts` | `poorna` / `svayam`, `aiLeads()`, `humanPillar()` |
| `cycle.ts` | the programme's shape, the term clock, local-date arithmetic |
| `conflicts.ts` | `HV.conflicts` and friends as pure functions taking their world **and their clock** in `w` |
| `tokens/` | `app.css`'s `:root` and dark block as a typed object, plus a Tailwind preset |
| `schemas/` | Zod for auth, user, client, pod, capacity |

### `backend/` — Express + Prisma + PostgreSQL + Redis

17 Prisma models, named after the demo's store keys. Request flow, written out on
every route so a missing step shows in the diff:

```
validate → authenticate → audience → authorize → controller → service → prisma
```

### `web/` — the Team Console

Next.js 15, App Router. `styles/tokens.css` and `styles/demo-classes.css` are
copied from `app.css`; `components/ui/` reproduces `HV.ui.*` with the same
markup; `components/icons/Icon.tsx` carries all 77 marks.

### `mobile/` — the client app

Expo SDK 52, Expo Router. Five tabs in the demo's order, the same token object
resolved through a hook (React Native has no CSS custom properties), phone + OTP
sign-in, refresh token in the OS keychain.

---

## The rules the port keeps

These are the ones that break silently, so each is stated where it is enforced.

**Pillar keys, display names and role keys all differ, and none may be renamed.**
Key `culture` displays as "Nutrition" and is coached by role `dietitian`; key
`wellness` displays as "Mind Wellness" and is coached by role `mind`. A client
record carries both vocabularies at once — `levels.wellness` but `pod.mind`.

**There is no headline level.** The four pillar levels are the whole reading. The
client record draws four dials and no fifth; `PillarIndex` has no `done` prop,
because a closed ring could only mean *every* pillar cleared that level — the
retired lowest-pillar rule in disguise.

**Capacity is declared, never derived.** Vikram reads 50 of 50 and FULL while
carrying six clients in the database, and that is correct: what fills up is his
*week*. Nothing counts pod seats to produce it. Going past a ceiling needs
`overrideCapacity` **and** a reason on the audit row.

**`staffId: null` on a pod seat is a real value** — it means the AI holds it,
which is the ordinary state for an unbought pillar on Svayam. Ananya's pod is
empty on purpose: AI end to end.

**Two plans, and Svayam is not on sale.** `PLANS.svayam.launch === false`, so the
plan filter offers only Poorna. Black/Grey/White is gone; `demo/app/README.md`
still describing it is stale.

**Every clock rule is a local-time rule.** Postgres, the API process and the cron
schedule are all `Asia/Kolkata`, and no date goes through `toISOString()` — that
converts to UTC first, so local midnight in IST reports as the previous day.

---

## Where the rules are enforced

Access is checked in three places, and only one of them binds.

| Where | What it does | Binds? |
|---|---|---|
| `web/src/middleware.ts` | redirects from a non-secret nav hint cookie | no — optimistic |
| `NavGate` | re-checks against the session `/me` returned | no — a browser is a client |
| **the API** | re-checks every rule on every request | **yes** |

The demo checks twice (router, then view) and both survive. The API is the gate
that matters; if the three ever disagree the API wins, which is the correct
failure direction.

Notable API behaviour:

- **Client scoping is a Prisma `WHERE` fragment**, not a filter applied after the
  query. A scope applied in JavaScript has already loaded the rows it is about to
  discard, and can be forgotten by a count, an export or a join.
- **A client outside your scope answers 404, not 403.** A 403 confirms the record
  exists, and "is this person a member of a health programme" is itself the
  sensitive fact.
- **Every refusal writes an `AuditLog` row with action `denied`.** The demo's lock
  screen says "This access attempt was logged"; in production that is true,
  including for a page blocked at the edge, which reports itself to
  `POST /audit/denied`.
- **A wrong password and an unknown account are indistinguishable** — same code,
  same message, same cost (`verifyPasswordConstantTime`).
- **An OTP request answers identically for a known and an unknown number.** A
  different answer would let anyone check membership one number at a time.
- **Refresh tokens rotate, and a replay kills the family.** Presenting an already
  rotated token means someone holds a copy; there is no way to tell which of the
  two is the thief, so both are revoked.

---

## Every route

All under `/api/v1`. "Gate" is what the API requires beyond a valid session.

| Method | Route | Gate |
|---|---|---|
| POST | `/auth/staff/login` | rate limited, 10 / 15 min / IP |
| POST | `/auth/client/otp/request` | rate limited, 5 / h / **number** |
| POST | `/auth/client/otp/verify` | rate limited, 20 / h / number |
| POST | `/auth/refresh` | the token itself |
| POST | `/auth/logout` | — |
| GET | `/me` | any session |
| GET | `/roles` | staff |
| PATCH | `/roles/:key` | `manageConfig` |
| GET | `/users` | nav `people` |
| GET | `/users/:id` | nav `people` |
| POST | `/users` | `managePeople` |
| PATCH | `/users/:id` | `managePeople` |
| PATCH | `/users/:id/role` | `managePeople` + a reason |
| PATCH | `/users/:id/availability` | `managePeople` |
| PATCH | `/users/:id/capacity` | `allocate`; over the ceiling also `overrideCapacity` + a reason |
| GET | `/clients` | nav `clients`, **scoped** |
| GET | `/clients/:id` | nav `clients`, **scoped** |
| PUT | `/clients/:id/pod/:pillarKey` | `assignPod` |
| GET | `/home/summary` | staff, **scoped** |
| GET | `/audit` | `manageConfig` |
| POST | `/audit/denied` | staff — the caller is the person being recorded |

Reading the bench and editing it are different rights on purpose: `/users` sits
behind the **sidebar item**, which an HoD holds, while creating and editing needs
`managePeople`, which only the Super Admin holds.

---

## What is stubbed

Named, routed and drawn — only the board inside is outstanding. Each renders the
demo's own empty state, a sentence a human would say, because a blank screen and
a broken screen look identical.

**Console:** Work Queues, Schedule, Catalog, Community, Time & Cover,
Configuration. On Home, six of the seven tabs. On the client record, eight of the
nine tabs (Overview is ported).

**Mobile:** all five tabs and Profile. Login is real.

**Backend, deliberately not started:**

- **The five sweeps** (SLA, session reminders, standing rules, workflow
  templates, the session-report chase). Each writes into surfaces that do not
  exist yet, and a sweep with nowhere to deliver is worse than no sweep.
  `jobs/index.ts` is where they go, with the two rules they will need already
  written down.
- **Cover-awareness.** In the demo, `HV.staffFor` resolves through `podCover`, so
  while Sneha is on leave her seat belongs to Divya and every screen agrees.
  There is no leave board yet, so `seatHolder()` in `scope.service.ts` is the one
  seam that resolution plugs into.
- **Media.** R2 keys are in the env and nothing uploads yet.
- **Config tables** (`CatalogItem`, `MealPlan`, `NotifRule`) hold the demo's
  content as JSON so the seed has somewhere to put it. The JSON is a holding pen,
  not the destination.

---

## Deviations from the brief, and why

**Pod seats are keyed by staff role, not pillar key.** The brief's model listed
`(fitness | culture | yoga | mind | coach | doctor)`. The demo's `c.pod` is keyed
`dietitian, fitness, yoga, mind, doctor, admin, opshead`, and both `HV.staffFor`
and `HV.myClients` look a seat up by **role**. Renaming would break client scoping
for every coach, and the brief's own hard rule says the staff role keys stay
`dietitian` and `mind`. The demo's seven keys are what shipped.

**Client status is `active | paused | inactive`.** The demo's own three
(`console-clients.js` `STATUS_FILTERS`). An `ended` was invented briefly and
corrected before it shipped: a lapsed term is a win-back call waiting to be made,
not a closed record.

**Seventeen users, not eleven.** The brief said eleven, which is the README's
persona list. `data.js` actually carries 12 staff and 5 client logins, and the
demo's story needs all of them — Nikhil and Divya are the L2 seats the cover board
reaches for, and Arjun is the HoD whose scoping the tests exercise.

**Edge middleware is optimistic, not authoritative.** The brief asked for
`middleware.ts` to block on `role.nav`. It does — but from a **non-secret hint
cookie** (the role key and its nav list), because the access token is memory-only
and the refresh cookie is scoped to `/api/v1/auth`, so the edge cannot read the
real session without minting a token of its own on every navigation. Forging the
hint buys a redirect and nothing else. `NavGate` re-checks against the real
session, and the API re-checks everything.

**Client login does not use the demo's persona picker.** That was a demo
affordance — eleven people you could become with one tap — not the product.

---

## Things that bit, and what was done

Each of these is commented at the site, not just here.

**Two React majors in one workspace.** The console is React 19; Expo SDK 52 ships
React 18.3. `next` declares `@types/react` as an *optional* peer, so pnpm links no
copy and Next's `.d.ts` files resolve `react` from the hoist area — where mobile's
18.3 sits. TypeScript then had two React type trees and reported errors that named
no mistake anyone made. Fixed with `paths` in `web/tsconfig.json`; see
`web/TYPES.md`, which also says when to delete it.

**NativeWind 4.2 does not work on SDK 52.** It pulls
`react-native-css-interop@0.2.x`, whose babel preset hard-codes
`react-native-worklets/plugin` — that is Reanimated 4, and SDK 52 ships 3.16.
Pinned to `4.1.23` **exactly**; the caret is what let a minor bump break the
bundler.

**pnpm does not expose transitive packages to app code.** Babel emits imports for
`@babel/runtime` helpers and `react-native-css-interop/jsx-runtime` into the app's
*own* files, so both are declared directly in `mobile/package.json`.

**The rate limiter did not actually fail open.** It was written to allow requests
when Redis is unavailable, and the catch was right — but with ioredis defaults a
command against a dead node *queues* rather than rejecting, so a sign-in hung
instead of proceeding. Found for real when the Redis it pointed at went away
mid-session and every sign-in blocked for minutes.
`maxRetriesPerRequest: 1`, `commandTimeout`, and `enableOfflineQueue: false` are
what make the promise true; the error log is now once per state change, not once
per reconnect attempt.

**Icons had no home in React.** `app.css` styles SVGs per context
(`.side nav button svg`, `.icon-tile svg`) because in a string-built UI every mark
had a known place. The React port puts the same component in contexts the demo
never had, and an unstyled SVG defaults to `fill: black` — which turned the warn
triangle into a solid wedge. A `:where(svg.hv-icon)` base carries the hairline
language at **zero specificity**, so every one of the demo's own rules still wins.

**The toast portal broke hydration.** `typeof document !== 'undefined'` is true
during hydration, so the portal rendered on the client's first pass while the
server HTML had no `#toast-root`. Mounting on an effect fixes it.

---

## Verified

```
pnpm typecheck    5/5 tasks
pnpm build        4/4 tasks
pnpm test         95 tests — 59 shared, 36 backend
```

Plus a headless-Chrome pass over the console, 15/15:

- Anita (Super Admin) lands on `/home`; sidebar is the demo's nine, in order
- Vikram (Fitness Coach) gets the demo's six — no People, Community or Configuration
- Anita sees 7 clients, Vikram 6 (not Ananya — her pod is empty), Sneha 5, Arjun 6
- `/clients/c-rajesh` draws four dials labelled Fitness, Nutrition, Yoga, Mind Wellness
- all seven pod seats listed, assignable, wrong-role assignment refused
- Vikram's split shift prints **both** windows; he reads FULL
- `/people` as a coach shows the lock screen **inside the shell** and writes an audit row
- light and dark both correct; no console errors

The seed is idempotent and **restores**: re-running it puts back any pod seat a
session changed, so a reviewer always meets the story they were shown.
