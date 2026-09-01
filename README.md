# Haalving_mobile_App

The HAALVING production monorepo — the Blue Zones health platform, ported from the
demo PWA in `demo/` to a real stack without changing a pixel.

| Workspace  | What it is                                                      |
|------------|-----------------------------------------------------------------|
| `shared/`  | RBAC, domain logic, Zod schemas and design tokens — one source   |
| `backend/` | Express + Prisma + PostgreSQL + Redis                            |
| `web/`     | Next.js 15 Team Console                                          |
| `mobile/`  | Expo client app, same design system                              |
| `demo/`    | The original zero-dependency PWA, kept as the visual reference   |

## Running it

Requires Node 22, pnpm, a local PostgreSQL and a Redis instance.

```
pnpm install
cp .env.example backend/.env      # then fill in DATABASE_URL and REDIS_URL
pnpm --filter @haalving/backend prisma migrate deploy
pnpm --filter @haalving/backend seed
pnpm dev
```

Secrets live only in `.env`, which is git-ignored. `.env.example` lists every key
with placeholder values.

## Where we deliberately differ from the demo

The demo is the visual reference and the port follows it exactly, with one
intentional exception recorded here so a future reader does not "fix" it back.

**Onboarding is the Super Admin's desk.** The demo puts ten roles on the
Onboarding board and narrows the detail each one sees. HAALVING grants
`ownsOnboarding` to `admin` alone, and every arrivals route, the board, the
record, the twelve step verbs, promote, and the Home pipeline tile is behind it.
The reasoning: the care team is allocated *during* onboarding, so allocation is a
Super-Admin act, and a coach meets a client when that client is promoted.

The accepted consequence is that a coach allocated to an arrival cannot see that
person until promotion — there is no pre-promotion prep window in the app, and
briefing happens out of band. This is a change from earlier behaviour, where
being seated on an arrival opened its record; `backend/tests/arrivals.test.ts`
pins the new rule, including that the Haalving Coach and the Operations Head are
refused even though both hold `allocate` and `seeAllClients`.

It is a permission rather than a role check, so widening it later — to the
Operations Head, say — is a row edit in People & Access rather than a deploy.

**The pod coach rates the plate; the Super Admin monitors it.** The demo grants
`rateMeals` to the Dietician alone. HAALVING also grants it to the Haalving Coach
(`opsmgr`), because the plate belongs to whoever coaches that client's pod — and
withholds it from `admin`, `opshead` and `core`, who see the Meals board and the
rating once made but get no star input and no submit.

That read-only stance is the point rather than an omission: the meal SLA escalates
to `admin` (`config.service.ts` defaults `escalateToRole`), and an escalation that
lands on a seat already holding the pen escalates nothing. `backend/tests/
queues.test.ts` pins both halves — the Haalving Coach can rate, and the three
oversight seats are refused while still able to read the plate.

Enforcement is in `queues.service.rateMeal`, not on the route, and deliberately so:
the service's refusal records `subjectType: 'meal'` with the plate's own id, while
route middleware could only write a generic `access` row and a message kept vague
on purpose. Route middleware runs first, so a guard there would replace the better
record rather than add to it. The same reasoning governs the arrivals routes.

**Deviations are scoped by pod seat, and badge what is new.** The demo gates this
board on `seeAllClients`. That was pointed the wrong way twice: it locked every
pillar coach out of a board about their own clients, and handed the Haalving Coach
(who holds `seeAllClients` and sits on no pod) every deviation in the building with
no way to act on one. The board is now ungated and narrowed by pod seat, with
`seeAllDeviations` — granted to `admin` alone — as the exemption, because every SLA
in the system escalates to that seat.

Consequence worth knowing: in the seeded cast the Haalving Coach sits on no pod, so
his Deviations board is empty. That is the rule working, not a bug. Seating him on
pods in People & Access fills it — a data act, not a deploy.

The tab also carries a count now, which the demo gives it no equivalent of. It is
"new since you looked" rather than "how many exist", because `Deviation` has no
resolved state and a plain count would climb forever. It reuses the demo's own
seen-bag (`HomeSeen`, whose `tabKey` is a free string, so no migration), and the
board stamps itself read on open via `POST /queues/deviations/seen` — a deliberate
write, since a GET that clears your own notice loses it to any prefetch.

**You book upward, on your own clients.** The Schedule's New-task sheet used to
offer every colleague and every client to anyone who could open it, and `create`
enforced nothing at all — the pickers were the only gate, which means there was no
gate. Two rules now, both server-side:

- *Who* — yourself, plus anyone holding `allocate` (Super Admin, Haalving Coach,
  Operations Head, Head of Department). Never a coach's calendar: a coach's hours
  are booked by whoever runs their pod. Derived from the permission rather than a
  role list, so it survives a rename in People & Access.
- *Which client* — the ones whose pod you sit on, via the same `podSeatScope` the
  Deviations board uses. `clientScopeWhere` is deliberately NOT used: it answers
  "whose record may you read", and a `seeAllClients` seat reads everybody. Booking
  is the narrower act.

`bookAnyone`, granted to `admin` alone, is the exemption from both halves.

A group is bookable only if every member is, so the pillar benches and every client
pod go unbookable for anyone but the Super Admin. Staff and groups are **flagged,
not filtered** — `SchedStaff.who` is a positional colour slot, so dropping people
would recolour the whole grid, and both lists also name people on tiles somebody
else booked.

Same consequence as Deviations: the Haalving Coach sits on no pod in the seeded
cast, so his client picker is empty and he can book internal meetings only. Seat
him on pods to change that — a data act, not a deploy.

Separately, `GET /schedule?client=<id>` was **unscoped**: the id went straight into
the WHERE, and the lens filters people rather than clients, so any seat holding the
schedule rail could read any client's calendar by guessing an id. It is now scoped
through `clientScopeWhere`, and an id you may not see answers an empty week rather
than a 403 — a refusal would confirm the client exists.

**The work list is one person's day, from two producers.** A task added in
Schedule now appears on the Work list, because the board reads both `worklist_items`
(what a rule raised) and today's `tasks` (what is booked onto you). It could not
before: Schedule writes `tasks` and the queue read `worklist_items`, so the two
screens looked at different tables and a booking was invisible however hard the
board looked.

Nothing is copied between them. The calendar row IS the work row, read a different
way — so ticking a booked row here writes the same `TaskDone` the Schedule reads,
and the two cannot drift. A booked row's id carries a `task:` prefix so it can never
be confused with a rule row, and `done` routes on it.

Each row carries `source`: `rule` (a rule raised it), `manual` (you booked it), or
`assigned` (somebody booked it onto you — including a client's request the Super
Admin applied). A field, not two systems.

Three things a later refactor should not undo:

- **Whose day is `assigneeIds` OR `createdById`.** Asking only the second is how a
  task the Super Admin puts on your calendar stays invisible.
- **Done on a booking is per-occurrence.** A daily duty is done on Tuesday and not
  on Wednesday, so only a completion stamped with today closes today's.
- **The badge calls the list function.** It was a `count()` over one table, honest
  while the board read one table. It reads two now, and a count over either alone
  would disagree with the list beneath it.

This deliberately needs NO migration — `Task` already carries everything a work row
needs. When `worklist_items` is eventually absorbed into `tasks` the two producers
collapse into one query, and `feat/worklist-lens` holds that version.

**A gathering is proposed, then let out.** Anyone who can open Community may put
one up — Super Admin, Haalving Coach, Operations Head and Super User. It lands
PENDING and reaches nobody until somebody with `approveGathering` approves it, and
that key is the Super Admin's alone. Holding it is necessary and not sufficient:
**nobody approves their own, the Super Admin included**, because she is the only
person holding both halves and so the only one who could walk around the gate. Her
own proposal reads "Yours — somebody else approves it."

Writing a gathering used to need `manageTribe`, which the Super User does not hold
— it is a reviewing seat, read-only elsewhere. The bar for PROPOSING is now simply
the Community nav, and that is safe only because of the gate: a proposal is
invisible to everyone but its author and the approver. Granting the Super User
`manageTribe` to let it suggest a trek would have opened Challenges, Game Days,
Feed and Zones as well.

The refusals are different answers to different questions. **403** — you may not
approve at all, a permission fact, logged with `subjectType: 'gathering'` and the
gathering's own id. **409** — you may, but not this one, a state fact.

State is four nullable columns and no enum: approved is `approvedAt` set, returned
is a `returnNote` without one. No `CREATE TYPE`, no `ALTER TYPE`. The seeded three
are backfilled and re-seed as published — leaving them pending would land the
feature as a deletion.

**Three surfaces, not one list filtered three ways.**

- `GET /community/gatherings` — the editing read, behind the `community` nav.
  Carries approval state, the pending ones, and the controls.
- `GET /community/gatherings/approved` — any staff seat, no nav needed. The six
  roles without Community (Doctor, Dietician, the three pillar coaches, a Head of
  Department) read it on Home under "What the community has on". Editing the
  community is not their business; knowing what it is doing is.
- `GET /client/community/gatherings` — `clientOnly`, the first route the client
  app may read. The other half of the audience split `staffOnly` has enforced all
  along: a token minted for one surface must not open the other.

A pending gathering is not merely hidden from the last two — it is absent from the
answer they are given, and no query parameter widens it.

## Tests

Tests run against **their own database**, not the one `pnpm dev` serves.

```
pnpm test
```

`backend/.env.test` holds the same credentials pointed at `haalving_test` and Redis
database 1; `vitest.config.ts` loads it and puts those on `process.env` before any
module imports, and `dotenv/config` does not overwrite variables that are already
set — so they win inside a test run and change nothing anywhere else. Vitest prints
`injected env (2) from .env.test` when it is working.

This is not tidiness. The suites truncate as they go — `community.test.ts` deletes
every gathering that is not one of the seeded three before each test — so running
them against the dev database quietly destroyed anything created in the browser. It
cut the other way too: a running dev server made the suites fail in ways that looked
like real defects, which cost hours more than once.

First time, or after a schema change:

```
cd backend
node -e "..."                 # or create it by hand:  CREATE DATABASE haalving_test
set -a; . ./.env.test; set +a
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

`.env.test` is gitignored — it carries the same secrets as `.env`.


```
pnpm test
```
