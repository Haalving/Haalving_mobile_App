import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * The Attention tab, exercised through the API.
 *
 * Asserted against the SEEDED digest — six lines, Meena high, Rajesh and Mathew
 * med, three unflagged — so a failure means the product's behaviour changed
 * rather than a fixture drifting.
 */

let anita: Session; /* Super Admin — sees every client */
let vikram: Session; /* Fitness Coach — every client except Ananya */
let sneha: Session; /* Dietician — no seat on Dev either, so the digest narrows */
let kavya: Session; /* Doctor — on five pods */

/*
 * A NOTE ON WHO NARROWS WHAT, because it caught this suite out once.
 *
 * Vikram is off exactly one client's pod — Ananya, who is Svayam with no pod at
 * all — and Ananya has NO digest line. So Vikram legitimately sees all six rows,
 * and asserting "a coach sees fewer than the admin" against him fails while the
 * scoping is perfectly correct.
 *
 * Sneha is the honest narrowing case: she has no dietitian seat on Dev either
 * (Svayam, fitness only), and Dev DOES have a line. Five rows, not six.
 */
beforeAll(async () => {
  await clearRateLimits();
  [anita, vikram, sneha, kavya] = await Promise.all([
    loginStaff('anita'),
    loginStaff('vikram'),
    loginStaff('sneha'),
    loginStaff('kavya'),
  ]);
});

afterAll(async () => {
  /* leave the freshness bag as the seed leaves it — these tests stamp tabs, and
     a suite that mutated shared state without clearing it would make the next
     run's "everything is New" assertions fail for the wrong reason */
  await prisma.homeSeen.deleteMany({});
  await closeConnections();
});

beforeEach(async () => {
  await prisma.homeSeen.deleteMany({});
});

const get = (s: Session) => request(app).get('/api/v1/home/attention').set(...auth(s.accessToken));

describe('GET /home/attention', () => {
  it('gives a Super Admin all six lines in the demo order', async () => {
    const res = await get(anita);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(6);

    const names = res.body.data.map((r: { client: { name: string } }) => r.client.name);
    /* attention order: loudest first, then the order the lines were written in.
       Meena is the silent one; Rajesh and Mathew are the two watches. */
    expect(names[0]).toBe('Meena I.');
    expect(names.slice(1, 3).sort()).toEqual(['Mathew', 'Rajesh D.']);

    const flags = res.body.data.map((r: { flag: string | null }) => r.flag);
    expect(flags).toEqual(['HIGH', 'MED', 'MED', null, null, null]);
  });

  it('sorts unflagged lines LAST, not first', async () => {
    const res = await get(anita);
    const flags = res.body.data.map((r: { flag: string | null }) => r.flag);
    const firstNull = flags.indexOf(null);
    /* a null sorts first or last depending on the SQL dialect, and an unflagged
       line at the top of an attention-ordered list is exactly backwards */
    expect(firstNull).toBe(3);
    expect(flags.slice(firstNull).every((f: string | null) => f === null)).toBe(true);
  });

  it('carries what the row needs to draw itself', async () => {
    const res = await get(anita);
    const row = res.body.data[0];

    expect(row.text).toContain('No logs for 3 days');
    /* the demo's 'a · b' arrives split — the row prints it joined, and a later
       evidence viewer will want the parts */
    expect(Array.isArray(row.evidence)).toBe(true);
    expect(row.evidence.length).toBeGreaterThan(1);

    /* the level badges and the session rings both read off the client */
    expect(Object.keys(row.client.levels).sort()).toEqual(['culture', 'fitness', 'wellness', 'yoga']);
    expect(Object.keys(row.client.sessions).sort()).toEqual(['fitness', 'mind', 'yoga']);
  });

  it('scopes to the caller, exactly as /clients does', async () => {
    const admin = await get(anita);
    const coach = await get(sneha);

    /* Sneha has no seat on Dev, and Dev has a line — so hers is genuinely shorter */
    expect(coach.body.data.length).toBeLessThan(admin.body.data.length);

    const coachNames = coach.body.data.map((r: { client: { name: string } }) => r.client.name);
    expect(coachNames).not.toContain('Dev K.');
    expect(coachNames).not.toContain('Ananya S.');
  });

  it('never shows a line about a client the caller could not open', async () => {
    /* the real scoping assertion, and the one that holds for EVERY role: the
       digest and the client list read the same clause, so a row here always has
       a record there */
    for (const who of [vikram, sneha, kavya]) {
      const rows = await get(who);
      const clients = await request(app).get('/api/v1/clients').set(...auth(who.accessToken));
      const allowed = new Set(clients.body.data.map((c: { name: string }) => c.name));
      for (const r of rows.body.data as Array<{ client: { name: string } }>) {
        expect(allowed.has(r.client.name)).toBe(true);
      }
    }
  });

  it('keeps the flag order inside a narrowed scope too', async () => {
    const res = await get(kavya);
    const flags = res.body.data.map((r: { flag: string | null }) => r.flag);
    const rank = (f: string | null) => (f === 'HIGH' ? 0 : f === 'MED' ? 1 : 2);
    for (let i = 1; i < flags.length; i++) {
      expect(rank(flags[i])).toBeGreaterThanOrEqual(rank(flags[i - 1]));
    }
  });

  it('answers [] for a coach with no clients, not an error', async () => {
    /* Meera holds mind seats in the seed, so build the genuine empty case: a
       staff account on nobody's pod */
    const nobody = await request(app)
      .post('/api/v1/users')
      .set(...auth(anita.accessToken))
      .send({
        name: 'Unallocated Coach',
        role: 'yoga',
        email: 'unallocated@haalving.dev',
        password: 'Haalving@123',
        dept: 'yoga',
        tz: 'Asia/Kolkata',
        status: 'active',
      });
    expect(nobody.status).toBe(201);

    try {
      const s = await loginStaff('unallocated');
      const res = await get(s);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    } finally {
      await prisma.user.deleteMany({ where: { email: 'unallocated@haalving.dev' } });
    }
  });

  it('every row starts fresh for a user who has not looked', async () => {
    const res = await get(anita);
    expect(res.body.data.every((r: { fresh: boolean }) => r.fresh)).toBe(true);
  });

  it('refuses an unauthenticated caller', async () => {
    const res = await request(app).get('/api/v1/home/attention');
    expect(res.status).toBe(401);
  });
});

describe('POST /home/seen', () => {
  it('stamps once and reports no change the second time', async () => {
    const rows = await get(anita);
    const ids = rows.body.data.map((r: { clientId: string }) => r.clientId);

    const first = await request(app)
      .post('/api/v1/home/seen')
      .set(...auth(anita.accessToken))
      .send({ tab: 'attention', ids });
    expect(first.status).toBe(200);
    expect(first.body.data.changed).toBe(true);

    /* mirrors stampSeen: the same list is not a change, and writing anyway would
       churn updatedAt on a page nobody interacted with */
    const second = await request(app)
      .post('/api/v1/home/seen')
      .set(...auth(anita.accessToken))
      .send({ tab: 'attention', ids });
    expect(second.body.data.changed).toBe(false);
  });

  it('compares as a SET — a re-order is not a change', async () => {
    const rows = await get(anita);
    const ids = rows.body.data.map((r: { clientId: string }) => r.clientId);

    await request(app)
      .post('/api/v1/home/seen')
      .set(...auth(anita.accessToken))
      .send({ tab: 'attention', ids });

    const reordered = await request(app)
      .post('/api/v1/home/seen')
      .set(...auth(anita.accessToken))
      .send({ tab: 'attention', ids: [...ids].reverse() });
    expect(reordered.body.data.changed).toBe(false);
  });

  it('turns the rows unfresh and zeroes the badge', async () => {
    const before = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    expect(before.body.data.fresh.attention).toBe(6);

    const rows = await get(anita);
    await request(app)
      .post('/api/v1/home/seen')
      .set(...auth(anita.accessToken))
      .send({ tab: 'attention', ids: rows.body.data.map((r: { clientId: string }) => r.clientId) });

    const after = await get(anita);
    expect(after.body.data.every((r: { fresh: boolean }) => !r.fresh)).toBe(true);

    const summary = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    expect(summary.body.data.fresh.attention).toBe(0);
  });

  it('is per user — one person reading does not mark it read for another', async () => {
    const rows = await get(anita);
    await request(app)
      .post('/api/v1/home/seen')
      .set(...auth(anita.accessToken))
      .send({ tab: 'attention', ids: rows.body.data.map((r: { clientId: string }) => r.clientId) });

    const coach = await get(vikram);
    expect(coach.body.data.every((r: { fresh: boolean }) => r.fresh)).toBe(true);
  });

  it('is per tab — stamping one leaves the others alone', async () => {
    await request(app)
      .post('/api/v1/home/seen')
      .set(...auth(anita.accessToken))
      .send({ tab: 'notices', ids: ['nt-1'] });

    const res = await get(anita);
    expect(res.body.data.every((r: { fresh: boolean }) => r.fresh)).toBe(true);
  });

  it('rejects a tab that is not one of the six', async () => {
    const res = await request(app)
      .post('/api/v1/home/seen')
      .set(...auth(anita.accessToken))
      .send({ tab: 'dashboard', ids: [] });
    /* `dash` carries no ids on purpose — a summary is never unread */
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('tab');
  });
});

describe('GET /home/summary — the digest fields', () => {
  it('reports when today’s digest was written', async () => {
    const res = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    expect(res.body.data.generatedAt).toBeTruthy();
    expect(new Date(res.body.data.generatedAt).toString()).not.toBe('Invalid Date');
  });

  it('names every tab in fresh, with only attention non-zero today', async () => {
    const res = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    const fresh = res.body.data.fresh;

    expect(Object.keys(fresh).sort()).toEqual([
      'attention', 'followups', 'notices', 'replies', 'sessions', 'tasks',
    ]);
    expect(fresh.attention).toBe(6);
    /* the rest are 0 because their boards do not exist — a tab that invented a
       count would put a badge on a page that cannot explain it */
    for (const k of ['replies', 'followups', 'tasks', 'notices', 'sessions']) {
      expect(fresh[k]).toBe(0);
    }
  });

  it('scopes fresh.attention like everything else', async () => {
    const admin = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    const coach = await request(app).get('/api/v1/home/summary').set(...auth(sneha.accessToken));
    expect(coach.body.data.fresh.attention).toBeLessThan(admin.body.data.fresh.attention);

    /* and it equals the row count that caller actually gets */
    const rows = await get(sneha);
    expect(coach.body.data.fresh.attention).toBe(rows.body.data.length);
  });
});

describe('the digest build hook', () => {
  it('runs every rule and writes nothing yet, leaving the seeded lines alone', async () => {
    const { buildFor } = await import('../src/services/digest.service.js');
    const before = await prisma.digestEntry.count();

    const result = await buildFor(new Date());

    /* every rule returns [] today — the hook is registered so the schedule and
       the failure handling are settled before the rules that matter arrive */
    expect(result.written).toBe(0);
    expect(Object.keys(result.byRule).sort()).toEqual([
      'levelReview', 'mealRatingDecline', 'noLogs', 'observation', 'slaPending',
    ]);

    /* and it NEVER deletes: the seeded story is what a reviewer expects to find */
    expect(await prisma.digestEntry.count()).toBe(before);
  });
});
