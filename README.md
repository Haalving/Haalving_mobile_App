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

**One row, two screens.** A task is a single `Task` row. Schedule draws it
positioned by time; the Work list draws the same row as a thing to do. Ticking it
Done in one is Done in the other, because there is exactly one of it. Scheduled
tasks are never copied into a work-item table and reconciled — a second source of
truth for one fact is the drift this board already recorded fixing once.

The Work list is **one person's day**, not the slotless half of the table. An
earlier version of the merge cut it at `date: null` with the note "scheduled rows
belong to the calendar and are read there", and that clause is precisely why a task
added in Schedule never appeared here. The lens now takes rows with no slot at all
OR rows scheduled for today, owned by you **or booked onto you** — asking only
`ownerId` is how a task the Super Admin put on your calendar stayed invisible.

Each row carries `source`: `manual` (you made it), `assigned` (somebody booked it
onto you, including a client's request the Super Admin applied), or `rule` (a rule
raised it). That is a **field**, not two systems — a typed-in task and a rule's row
sort together in one list.

Two consequences worth knowing before refactoring:

- **Status is not a SQL clause and cannot be.** "Done" means one thing for a
  slotless row (any `TaskDone` closes it) and another for a recurring duty (only a
  `TaskDone` stamped with *today* closes today's occurrence). Postgres cannot
  express that in one predicate over a joined table, so the filter runs in the
  service over a page that is one person's day.
- **The badge counts the list literally**, by calling the same function. It used to
  be a `count()` over the same where-clause, which was honest while "open" was a
  column. It is not one any more, and a SQL count would answer a different question
  from the list beneath it.

`worklist_items` still exists and still holds the demo's six rows. It is the way
back until the merge has proved itself in production; nothing reads it any more.

## Tests

```
pnpm test
```
