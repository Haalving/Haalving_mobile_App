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

## Tests

```
pnpm test
```
