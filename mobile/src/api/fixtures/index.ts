import { ApiError } from '@/api/client';

/**
 * FIXTURES MODE — a screen renders against a hard-coded payload until its real
 * `/client/*` route ships.
 *
 * `orFixture` runs the real request first and only falls back to the fixture when
 * the route answers **404** — i.e. the endpoint does not exist yet. Any other
 * error (401, 500, a network failure) still throws, so a route that exists but is
 * broken is NOT masked by stale demo data — that would hide the very failure the
 * screen is there to surface.
 *
 * Each fixture in this folder is shaped EXACTLY as its route will return (the
 * serialised client shape, post-`rules.ts`), carries a `// TODO(route): …` naming
 * the endpoint, and is listed in docs/pixel/TODO.md under "needs route". When the
 * route lands, the hook starts using it with no screen change and the fixture is
 * deleted.
 */
export async function orFixture<T>(fetcher: () => Promise<T>, fixture: T): Promise<T> {
  try {
    return await fetcher();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return fixture;
    throw err;
  }
}
