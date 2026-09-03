import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { startOfDay, todayISO } from '../src/utils/dates.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * The Attention tab, exercised through the API.
 *
 * THIS SUITE INSTALLS ITS OWN DIGEST and does not read the seed's.
 *
 * It used to assert against the seeded lines, which was safe while those lines
 * were six hand-written strings. They are not: the seed now RUNS THE RULES, so
 * what the digest holds depends on the plates and messages the seed happens to
 * carry, and a rule getting better at its job would fail a test about sorting.
 *
 * Two different things are being tested and they are now cleanly apart. The read
 * path — flag order, scoping, freshness — is asserted here over a fixture this
 * file writes, so it is deterministic. What the rules SAY is asserted in `the
 * digest rules`, over conditions those tests create.
 *
 * The fixture is the demo's own six lines, so the assertions below are the ones
 * this suite always made.
 */

/** The six lines this suite reads: loudest first, three unflagged behind them. */
const FIXTURE = [
  { clientId: 'c-meena', flag: 'HIGH' as const, text: 'No logs for 3 days. Last seen Tue evening.', evidence: ['meal log', 'circle messages'] },
  { clientId: 'c-rajesh', flag: 'MED' as const, text: 'Ratings averaging 3.5 stars, down from 4.2.', evidence: ['6 rated meals', 'meal ratings'] },
  { clientId: 'c-mathew', flag: 'MED' as const, text: 'Lunch awaiting rating — 38 min past the promise.', evidence: ['meal queue', 'SLA config'] },
  { clientId: 'c-sureshp', flag: null, text: 'Day 12. Level Review Pack ready.', evidence: ['level pack', 'cycle day'] },
  { clientId: 'c-priya', flag: null, text: 'Observation day 3 of 5, with 7 of 10 meal photos in. On pace; no action needed.', evidence: ['observation counter', 'meal photos'] },
  { clientId: 'c-dev', flag: null, text: 'Svayam plan: AI coaches day-to-day, you lead Fitness.', evidence: ['copilot brief'] },
];

async function installFixture(): Promise<void> {
  const today = startOfDay(todayISO());
  await prisma.digestEntry.deleteMany({ where: { date: today } });
  for (const [i, d] of FIXTURE.entries()) {
    await prisma.digestEntry.create({ data: { date: today, position: i, ...d } });
  }
}

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
  await installFixture();
});

afterAll(async () => {
  /* leave the freshness bag as the seed leaves it — these tests stamp tabs, and
     a suite that mutated shared state without clearing it would make the next
     run's "everything is New" assertions fail for the wrong reason */
  await prisma.homeSeen.deleteMany({});
  /* and put the digest back the way the seed left it: DERIVED. The next suite
     along counts today's lines, and it should count the rules' answer rather
     than this file's fixture. */
  const { buildFor } = await import('../src/services/digest.service.js');
  await buildFor(new Date());
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

  it('names every tab in fresh, and counts only the boards that exist', async () => {
    const res = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    const fresh = res.body.data.fresh;

    expect(Object.keys(fresh).sort()).toEqual([
      'attention', 'followups', 'notices', 'replies', 'sessions', 'tasks',
    ]);
    expect(fresh.attention).toBe(6);
    /*
     * `notices` counts the TEAM FEED, which People & Access added. It was 0 here
     * when nothing wrote to it and this test asserted that as if it were the rule;
     * the rule was always "a tab that invented a count would put a badge on a page
     * that cannot explain it", and the feed can now explain its own.
     */
    expect(fresh.notices).toBeGreaterThan(0);

    /* the rest are still 0 because their boards genuinely do not exist */
    for (const k of ['replies', 'followups', 'tasks', 'sessions']) {
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
  it('runs every rule and writes what they say', async () => {
    const { buildFor } = await import('../src/services/digest.service.js');

    const result = await buildFor(new Date());

    expect(Object.keys(result.byRule).sort()).toEqual([
      'levelReview',
      'mealRatingDecline',
      'noLogs',
      'observation',
      'slaPending',
    ]);
    /* the seeded roster carries a client who has never logged, so the morning is
       never completely silent — if this ever reads zero the seed changed, not
       the builder */
    expect(result.written).toBeGreaterThan(0);

    const today = startOfDay(todayISO());
    expect(await prisma.digestEntry.count({ where: { date: today } })).toBe(result.written);
  });

  it('gives a client to the LOUDEST rule that claims them, and clears what no rule said', async () => {
    const { buildFor } = await import('../src/services/digest.service.js');
    const { RULE_STRIDE } = await import('../src/services/digest-rules/order.js');
    const today = startOfDay(todayISO());

    /*
     * A CLIENT NO RULE HAS ANYTHING TO SAY ABOUT, built rather than borrowed:
     * they ate this morning (so they are not silent), the plate is rated (so no
     * SLA is running), there is no earlier week to fall from, they are past
     * observation and it is not their review day. Borrowing a seeded client for
     * this is what made an earlier version of this test wrong — the seed moved
     * and Rajesh acquired a waiting plate.
     */
    const quiet = await prisma.client.create({
      data: {
        name: 'Ported acceptance — nothing to report',
        plan: 'POORNA',
        status: 'active',
        cycleDay: 1,
        onboardedAt: new Date(Date.now() - 60 * 86_400_000),
      },
      select: { id: true },
    });
    await prisma.meal.create({
      data: {
        clientId: quiet.id,
        slot: 'Breakfast',
        fullness: 'Just right',
        capturedAt: new Date(Date.now() - 3_600_000),
        finalStars: 5,
      },
    });

    try {
      /* a line from an earlier run that nothing supports any more */
      await prisma.digestEntry.create({
        data: {
          date: today,
          clientId: quiet.id,
          flag: 'HIGH',
          text: 'A line from an earlier run that nothing supports any more.',
          evidence: ['stale'],
          position: 0,
        },
      });

      await buildFor(new Date());

      /* gone, rather than standing over the day until tomorrow morning */
      expect(
        await prisma.digestEntry.findFirst({ where: { date: today, clientId: quiet.id } }),
      ).toBeNull();

      /* and Meena, who has never logged, is claimed by noLogs — rule index 0,
         which is what puts her position inside the first hundred. A quieter rule
         reaching her later would have written over it. */
      const meena = await prisma.digestEntry.findFirst({
        where: { date: today, clientId: 'c-meena' },
      });
      expect(meena).not.toBeNull();
      expect(meena?.flag).toBe('HIGH');
      expect(meena?.position).toBeLessThan(RULE_STRIDE);
    } finally {
      await prisma.digestEntry.deleteMany({ where: { clientId: quiet.id } });
      await prisma.meal.deleteMany({ where: { clientId: quiet.id } });
      await prisma.client.delete({ where: { id: quiet.id } });
    }
  });

  it('refreshes one client without touching anybody else', async () => {
    const { buildFor } = await import('../src/services/digest.service.js');
    const today = startOfDay(todayISO());

    await buildFor(new Date());
    const before = await prisma.digestEntry.findMany({
      where: { date: today },
      select: { clientId: true, text: true },
      orderBy: { clientId: 'asc' },
    });
    expect(before.length).toBeGreaterThan(0);

    /* the sweep that clears unclaimed lines has to be scoped to the round that
       ran, or refreshing one client would delete the whole morning */
    await buildFor(new Date(), ['c-meena']);

    const after = await prisma.digestEntry.findMany({
      where: { date: today },
      select: { clientId: true, text: true },
      orderBy: { clientId: 'asc' },
    });
    expect(after).toEqual(before);
  });
});

/* ──────────────────────────────────────────────── what the rules actually say */

/**
 * Each rule, over a condition this file creates.
 *
 * A rule is a claim about real data, so these build the data rather than hoping
 * the seed contains it: a client with nothing logged, a plate past its promise,
 * a fortnight of ratings falling. Everything made here is removed again, because
 * the suites share one database.
 */
describe('the digest rules', () => {
  const MADE: string[] = [];
  const DAY = 86_400_000;

  const makeClient = async (name: string, extra: Record<string, unknown> = {}) => {
    const c = await prisma.client.create({
      data: {
        name,
        plan: 'POORNA',
        status: 'active',
        onboardedAt: new Date(Date.now() - 30 * DAY),
        ...extra,
      },
      select: { id: true },
    });
    MADE.push(c.id);
    return c.id;
  };

  afterAll(async () => {
    await prisma.digestEntry.deleteMany({ where: { clientId: { in: MADE } } });
    await prisma.circleMessage.deleteMany({ where: { clientId: { in: MADE } } });
    await prisma.meal.deleteMany({ where: { clientId: { in: MADE } } });
    await prisma.client.deleteMany({ where: { id: { in: MADE } } });
  });

  it('noLogs: flags the client whose newest plate is days old, not the one who ate yesterday', async () => {
    const { noLogsRule } = await import('../src/services/digest-rules/noLogs.rule.js');

    const quiet = await makeClient('Ported acceptance — quiet');
    const busy = await makeClient('Ported acceptance — busy');
    await prisma.meal.createMany({
      data: [
        {
          clientId: quiet,
          slot: 'Lunch',
          fullness: 'Just right',
          capturedAt: new Date(Date.now() - 4 * DAY),
        },
        {
          clientId: busy,
          slot: 'Lunch',
          fullness: 'Just right',
          capturedAt: new Date(Date.now() - 1 * DAY),
        },
      ],
    });

    const rows = await noLogsRule.run(new Date(), [quiet, busy]);
    expect(rows.map((r) => r.clientId)).toEqual([quiet]);
    expect(rows[0]?.flag).toBe('HIGH');
    expect(rows[0]?.text).toContain('4 days');
  });

  it('noLogs: the client’s own message is a sign of life, a message AT them is not', async () => {
    const { noLogsRule } = await import('../src/services/digest-rules/noLogs.rule.js');

    const spoke = await makeClient('Ported acceptance — spoke');
    const spokenAt = await makeClient('Ported acceptance — spoken at');
    await prisma.circleMessage.create({
      data: { clientId: spoke, fromKind: 'CLIENT', kind: 'TEXT', text: 'here', seq: 1 },
    });
    await prisma.circleMessage.create({
      data: { clientId: spokenAt, fromKind: 'AI', kind: 'TEXT', text: 'are you there?', seq: 1 },
    });

    const ids = (await noLogsRule.run(new Date(), [spoke, spokenAt])).map((r) => r.clientId);
    /* letting staff traffic clear a silence flag would let the digest be quieted
       by the very people it exists to alert */
    expect(ids).not.toContain(spoke);
    expect(ids).toContain(spokenAt);
  });

  it('slaPending: flags a plate past the promise, not one still inside it', async () => {
    const { slaPendingRule } = await import('../src/services/digest-rules/slaPending.rule.js');
    const config = await import('../src/services/config.service.js');
    const { replyTargetMin } = await config.getSla();

    const late = await makeClient('Ported acceptance — late plate');
    const fresh = await makeClient('Ported acceptance — fresh plate');
    await prisma.meal.createMany({
      data: [
        {
          clientId: late,
          slot: 'Lunch',
          fullness: 'Just right',
          capturedAt: new Date(Date.now() - (replyTargetMin + 23) * 60_000),
        },
        {
          clientId: fresh,
          slot: 'Lunch',
          fullness: 'Just right',
          capturedAt: new Date(Date.now() - 60_000),
        },
      ],
    });

    const rows = await slaPendingRule.run(new Date(), [late, fresh]);
    expect(rows.map((r) => r.clientId)).toEqual([late]);
    expect(rows[0]?.flag).toBe('MED');
    expect(rows[0]?.text).toContain('Lunch awaiting rating');
  });

  it('slaPending: a rated plate has stopped the clock', async () => {
    const { slaPendingRule } = await import('../src/services/digest-rules/slaPending.rule.js');

    const rated = await makeClient('Ported acceptance — rated plate');
    await prisma.meal.create({
      data: {
        clientId: rated,
        slot: 'Lunch',
        fullness: 'Just right',
        capturedAt: new Date(Date.now() - 6 * 3_600_000),
        finalStars: 4,
      },
    });

    expect(await slaPendingRule.run(new Date(), [rated])).toEqual([]);
  });

  it('mealRatingDecline: wants both windows before it calls a drop a trend', async () => {
    const { mealRatingDeclineRule } = await import(
      '../src/services/digest-rules/mealRatingDecline.rule.js'
    );

    const falling = await makeClient('Ported acceptance — falling');
    const thin = await makeClient('Ported acceptance — one plate a side');
    await prisma.meal.createMany({
      data: [
        /* the week before last: 4.5 */
        { clientId: falling, slot: 'Lunch', fullness: 'Just right', capturedAt: new Date(Date.now() - 10 * DAY), finalStars: 5 },
        { clientId: falling, slot: 'Dinner', fullness: 'Just right', capturedAt: new Date(Date.now() - 9 * DAY), finalStars: 4 },
        /* this week: 3.0 */
        { clientId: falling, slot: 'Lunch', fullness: 'Light', capturedAt: new Date(Date.now() - 3 * DAY), finalStars: 3 },
        { clientId: falling, slot: 'Dinner', fullness: 'Light', capturedAt: new Date(Date.now() - 2 * DAY), finalStars: 3 },
        /* one plate on each side is arithmetic wearing the authority of a trend */
        { clientId: thin, slot: 'Lunch', fullness: 'Just right', capturedAt: new Date(Date.now() - 9 * DAY), finalStars: 5 },
        { clientId: thin, slot: 'Lunch', fullness: 'Light', capturedAt: new Date(Date.now() - 2 * DAY), finalStars: 2 },
      ],
    });

    const rows = await mealRatingDeclineRule.run(new Date(), [falling, thin]);
    expect(rows.map((r) => r.clientId)).toEqual([falling]);
    expect(rows[0]?.flag).toBe('MED');
    expect(rows[0]?.text).toContain('down from');
  });

  it('observation: counts the window, and flags only when the plates are behind pace', async () => {
    const { observationRule } = await import('../src/services/digest-rules/observation.rule.js');

    const behind = await makeClient('Ported acceptance — behind', {
      observation: true,
      onboardedAt: new Date(Date.now() - 3 * DAY),
    });
    const onPace = await makeClient('Ported acceptance — on pace', {
      observation: true,
      onboardedAt: new Date(Date.now() - 3 * DAY),
    });
    /* day 4 of 5 expects 8 of the window's 10 */
    await prisma.meal.createMany({
      data: Array.from({ length: 9 }, (_, i) => ({
        clientId: onPace,
        slot: 'Lunch',
        fullness: 'Just right',
        photo: `test://photo/${i}`,
        capturedAt: new Date(Date.now() - 2 * DAY),
      })),
    });

    const rows = await observationRule.run(new Date(), [behind, onPace]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.clientId === onPace)?.flag).toBeNull();
    expect(rows.find((r) => r.clientId === onPace)?.text).toContain('On pace');
    expect(rows.find((r) => r.clientId === behind)?.flag).toBe('MED');
    expect(rows.find((r) => r.clientId === behind)?.text).toContain('Behind pace');
  });

  it('the drafter writes the template belonging to the rule that raised the line', async () => {
    const { draftText } = await import('../src/services/digest-rules/followup-templates.js');
    const { ruleOf, RULE_STRIDE } = await import('../src/services/digest-rules/order.js');

    const facts = { first: 'Meena', line: 'No logs for 3 days.', sessions: null, photos: null };

    /* position 0 is the first rule, noLogs — a door held open */
    expect(ruleOf(0)).toBe('noLogs');
    expect(draftText(ruleOf(0), facts)).toContain('exactly where you left it');

    /* the fourth stride is levelReview — a good day, not a door */
    expect(ruleOf(3 * RULE_STRIDE)).toBe('levelReview');
    expect(draftText(ruleOf(3 * RULE_STRIDE), facts)).toContain('review is this afternoon');

    /* observation's template needs a photo count, and declines without one
       rather than sending a sentence with a hole in it */
    expect(ruleOf(4 * RULE_STRIDE)).toBe('observation');
    expect(draftText(ruleOf(4 * RULE_STRIDE), facts)).toBeNull();

    /* the last client of a big roster stays inside their own rule's range — the
       hundred-wide stride this replaced put them in the next rule's */
    expect(ruleOf(RULE_STRIDE - 1)).toBe('noLogs');
  });
});
