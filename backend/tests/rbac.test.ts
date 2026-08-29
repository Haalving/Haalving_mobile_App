import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { todayISO } from '@haalving/shared';

import { prisma } from '../src/config/prisma.js';
import { startOfDay } from '../src/utils/dates.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * The access rules, exercised through the API.
 *
 * These assert against the SEEDED story rather than invented fixtures, so a
 * failure means the product's behaviour changed — not that a fixture drifted.
 */

let anita: Session; /* Super Admin — seeAllClients, managePeople, assignPod */
let vikram: Session; /* Fitness Coach — pod seats only, no people, no assignPod */
let sneha: Session; /* Dietician — pod seats only */
let arjun: Session; /* Head of Department (fitness) — the whole bench's clients */
let kavya: Session; /* Doctor — the only holder of rawRecords */

beforeAll(async () => {
  await clearRateLimits();
  [anita, vikram, sneha, arjun, kavya] = await Promise.all([
    loginStaff('anita'),
    loginStaff('vikram'),
    loginStaff('sneha'),
    loginStaff('arjun'),
    loginStaff('kavya'),
  ]);
});

afterAll(async () => {
  await closeConnections();
});

const names = (body: { data: Array<{ name: string }> }) => body.data.map((c) => c.name).sort();

describe('client scoping — the port of HV.myClients', () => {
  it('shows a Super Admin every client', async () => {
    const res = await request(app).get('/api/v1/clients').set(...auth(anita.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(7);
  });

  it('shows a coach only the clients whose pod they sit on', async () => {
    const res = await request(app).get('/api/v1/clients').set(...auth(vikram.accessToken));
    expect(res.status).toBe(200);
    /* every client except Ananya — she is Svayam with an empty pod, AI end to end,
       so no coach holds a seat on her */
    expect(names(res.body)).not.toContain('Ananya S.');
    expect(names(res.body)).toContain('Rajesh D.');
  });

  it('narrows further for a coach on fewer pods', async () => {
    const res = await request(app).get('/api/v1/clients').set(...auth(sneha.accessToken));
    /* Dev is Svayam with only Fitness bought, so his pod has no dietitian seat */
    expect(names(res.body)).not.toContain('Dev K.');
    expect(names(res.body)).not.toContain('Ananya S.');
  });

  it('shows an HoD the whole bench, not just their own clients', async () => {
    const res = await request(app).get('/api/v1/clients').set(...auth(arjun.accessToken));
    expect(res.status).toBe(200);
    /* Arjun holds no pod seat himself — he sees the clients whose FITNESS seat is
       held by anyone on his bench */
    expect(names(res.body)).toContain('Rajesh D.');
    expect(names(res.body)).toContain('Dev K.');
    expect(names(res.body)).not.toContain('Ananya S.');
  });

  it('answers 404, not 403, for a client outside the caller’s scope', async () => {
    /* a 403 would confirm the record exists, and "is this person a member of a
       health programme" is itself the sensitive fact */
    const res = await request(app).get('/api/v1/clients/c-ananya').set(...auth(vikram.accessToken));
    expect(res.status).toBe(404);

    const allowed = await request(app).get('/api/v1/clients/c-ananya').set(...auth(anita.accessToken));
    expect(allowed.status).toBe(200);
  });

  it('cannot be widened by a query parameter', async () => {
    const res = await request(app)
      .get('/api/v1/clients')
      .query({ staffId: 'u-sneha' })
      .set(...auth(vikram.accessToken));
    /* the filter narrows within the scope; it never reaches outside it */
    expect(names(res.body)).not.toContain('Ananya S.');
  });
});

describe('nav gate — console access IS nav membership', () => {
  it('lets a role with the People item read the directory', async () => {
    const res = await request(app).get('/api/v1/users').set(...auth(anita.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(10);
  });

  it('refuses a role whose sidebar does not carry it, and logs the attempt', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'denied', actorId: 'u-vikram' } });

    const res = await request(app).get('/api/v1/users').set(...auth(vikram.accessToken));
    expect(res.status).toBe(403);
    /* the message never names the missing permission — that would map the matrix
       for anyone probing it */
    expect(res.body.error.message).toBe('Not available for your role.');

    const after = await prisma.auditLog.count({ where: { action: 'denied', actorId: 'u-vikram' } });
    expect(after).toBe(before + 1);
  });

  it('gives an HoD the People item without the right to create anyone', async () => {
    /* reading the bench and editing it are two different rights */
    const read = await request(app).get('/api/v1/users').set(...auth(arjun.accessToken));
    expect(read.status).toBe(200);

    const write = await request(app)
      .post('/api/v1/users')
      .set(...auth(arjun.accessToken))
      .send({ name: 'Test Coach', role: 'fitness', email: 'nope@haalving.dev', password: 'Haalving@123' });
    expect(write.status).toBe(403);
  });
});

describe('permission gate', () => {
  it('lets only assignPod holders move a seat', async () => {
    const refused = await request(app)
      .put('/api/v1/clients/c-rajesh/pod/fitness')
      .set(...auth(vikram.accessToken))
      .send({ staffId: 'u-nikhil' });
    expect(refused.status).toBe(403);

    const allowed = await request(app)
      .put('/api/v1/clients/c-rajesh/pod/fitness')
      .set(...auth(anita.accessToken))
      .send({ staffId: 'u-nikhil', reason: 'test' });
    expect(allowed.status).toBe(200);

    /* put the seeded story back */
    await request(app)
      .put('/api/v1/clients/c-rajesh/pod/fitness')
      .set(...auth(anita.accessToken))
      .send({ staffId: 'u-vikram', reason: 'restore' });
  });

  it('records the reason with the seat change', async () => {
    await request(app)
      .put('/api/v1/clients/c-mathew/pod/fitness')
      .set(...auth(anita.accessToken))
      .send({ staffId: 'u-nikhil', reason: 'Vikram is at capacity this cycle' });

    const row = await prisma.auditLog.findFirst({
      where: { action: 'pod.assign', subjectId: 'c-mathew' },
      orderBy: { at: 'desc' },
    });
    expect(row?.reason).toBe('Vikram is at capacity this cycle');
    expect(row?.actorId).toBe('u-anita');

    await request(app)
      .put('/api/v1/clients/c-mathew/pod/fitness')
      .set(...auth(anita.accessToken))
      .send({ staffId: 'u-vikram', reason: 'restore' });
  });

  it('refuses a coach whose role does not match the seat', async () => {
    const res = await request(app)
      .put('/api/v1/clients/c-rajesh/pod/dietitian')
      .set(...auth(anita.accessToken))
      .send({ staffId: 'u-lakshmi' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.staffId).toBe('Wrong role for this seat');
  });

  it('accepts null — the AI holding a seat is a real state, not a gap', async () => {
    const res = await request(app)
      .put('/api/v1/clients/c-ananya/pod/fitness')
      .set(...auth(anita.accessToken))
      .send({ staffId: null });
    expect(res.status).toBe(200);
    expect(res.body.data.ai).toBe(true);
  });

  it('keeps the audit log behind manageConfig', async () => {
    expect((await request(app).get('/api/v1/audit').set(...auth(kavya.accessToken))).status).toBe(403);
    expect((await request(app).get('/api/v1/audit').set(...auth(anita.accessToken))).status).toBe(200);
  });
});

describe('capacity — declared, never derived', () => {
  it('lets an allocator raise the ceiling without a reason', async () => {
    const res = await request(app)
      .patch('/api/v1/users/u-meera/capacity')
      .set(...auth(anita.accessToken))
      .send({ declared: 45, load: 18 });
    expect(res.status).toBe(200);
    expect(res.body.data.declared).toBe(45);
  });

  it('keeps the seeded number that contradicts the seat count', async () => {
    /* Vikram reads 50 of 50 and FULL while carrying six clients in the database.
       That is correct rather than a bug to tidy: what fills up is his WEEK. A
       derived load would make this story impossible to tell. */
    const cap = await prisma.capacity.findUnique({ where: { staffId: 'u-vikram' } });
    const seats = await prisma.podSeat.count({ where: { staffId: 'u-vikram' } });
    expect(cap?.declared).toBe(50);
    expect(cap?.load).toBe(50);
    expect(seats).toBeLessThan(10);
  });

  it('needs overrideCapacity and a reason to go past the ceiling', async () => {
    const noPerm = await request(app)
      .patch('/api/v1/users/u-meera/capacity')
      .set(...auth(arjun.accessToken))
      .send({ declared: 45, load: 60, reason: 'covering for Meera' });
    /* an HoD may allocate but may not override a ceiling */
    expect(noPerm.status).toBe(403);

    const noReason = await request(app)
      .patch('/api/v1/users/u-meera/capacity')
      .set(...auth(anita.accessToken))
      .send({ declared: 45, load: 60 });
    expect(noReason.status).toBe(400);

    const ok = await request(app)
      .patch('/api/v1/users/u-meera/capacity')
      .set(...auth(anita.accessToken))
      .send({ declared: 45, load: 60, reason: 'Two clients moved across while Sneha is away' });
    expect(ok.status).toBe(200);

    const row = await prisma.auditLog.findFirst({
      where: { action: 'capacity.override', subjectId: 'u-meera' },
      orderBy: { at: 'desc' },
    });
    expect(row?.reason).toContain('Sneha is away');

    /* restore the seeded numbers */
    await request(app)
      .patch('/api/v1/users/u-meera/capacity')
      .set(...auth(anita.accessToken))
      .send({ declared: 40, load: 18 });
  });
});

describe('the matrix in the database', () => {
  it('carries all twelve roles, seeded from the shared matrix', async () => {
    const res = await request(app).get('/api/v1/roles').set(...auth(anita.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(12);
  });

  it('refuses to hand rawRecords to anyone but the Doctor', async () => {
    /* raw medical documents stop at her desk and the pod sees only the signed
       summary — that boundary is a clinical decision, not a console toggle */
    const res = await request(app)
      .patch('/api/v1/roles/fitness')
      .set(...auth(anita.accessToken))
      .send({ perms: ['buildCharts', 'editCatalog', 'rawRecords'] });
    expect(res.status).toBe(400);
  });

  it('refuses a permission that does not exist', async () => {
    const res = await request(app)
      .patch('/api/v1/roles/fitness')
      .set(...auth(anita.accessToken))
      .send({ perms: ['buildCharts', 'doAnythingAtAll'] });
    expect(res.status).toBe(400);
  });
});

describe('home summary', () => {
  it('scopes every count to the caller', async () => {
    const admin = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    const coach = await request(app).get('/api/v1/home/summary').set(...auth(vikram.accessToken));

    expect(admin.body.data.clients.total).toBe(7);
    /* a headline that disagrees with the list under it teaches people to
       distrust the whole screen */
    expect(coach.body.data.clients.total).toBeLessThan(admin.body.data.clients.total);
  });

  it('splits paused from inactive rather than rolling them together', async () => {
    const res = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    const c = res.body.data.clients;
    /* a paused client is coming back and an inactive one is not — the only
       number a win-back call acts on is the second, and merging hides it */
    expect(c.paused).toBe(1);
    expect(c.inactive).toBe(1);
    expect(c.active + c.paused + c.inactive).toBe(c.total);
  });

  it('reports risk as two counts, not one', async () => {
    const res = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    /* Meena is the high-risk record — silent three days. The medium count is
       the "gentle watch" line under it, and both are needed to write that row. */
    expect(res.body.data.risk.high).toBe(1);
    expect(res.body.data.risk.medium).toBeGreaterThan(0);
  });

  it('averages levels over the SCORED clients only', async () => {
    const res = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    const { scored, mean } = res.body.data.levels;

    /* six of the seven: Priya is in her observation window and sits at level 1
       because nothing has been assessed, not because she was assessed at 1.
       Averaging her in drags every pillar toward the floor exactly when the
       roster takes on new people. */
    expect(scored).toBe(6);

    /* FOUR means and no fifth — there is no combined level */
    expect(Object.keys(mean).sort()).toEqual(['culture', 'fitness', 'wellness', 'yoga']);
    expect(mean).not.toHaveProperty('overall');
    for (const v of Object.values(mean) as number[]) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(7);
      /* one decimal, as the demo prints it: "L2.7" says more than "L3" */
      expect(Math.round(v * 10) / 10).toBe(v);
    }
  });

  it('scopes the level means too, not just the counts', async () => {
    const admin = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    const coach = await request(app).get('/api/v1/home/summary').set(...auth(sneha.accessToken));
    /* Sneha carries fewer clients, so her roster reads differently — a mean
       computed over everyone would be the same number on every screen */
    expect(coach.body.data.levels.scored).toBeLessThan(admin.body.data.levels.scored);
  });

  it('carries both celebration kinds, soonest first', async () => {
    const res = await request(app).get('/api/v1/home/summary').set(...auth(anita.accessToken));
    const cels = res.body.data.celebrations as Array<{ kind: string; inDays: number; name: string }>;

    /* dob alone would give birthdays and silently drop every anniversary */
    expect(cels.length).toBeGreaterThan(0);
    expect(cels.every((c) => c.inDays >= 0 && c.inDays <= 7)).toBe(true);
    expect(cels.every((c) => !!c.name)).toBe(true);
    for (let i = 1; i < cels.length; i++) {
      expect(cels[i]!.inDays).toBeGreaterThanOrEqual(cels[i - 1]!.inDays);
    }
  });
});

describe('the roster fields reached the database', () => {
  it('gives every client a risk and its reason together', async () => {
    const withRisk = await prisma.client.count({ where: { risk: { not: null } } });
    const withReason = await prisma.client.count({ where: { riskWhy: { not: null } } });
    /* a flag with no reason is an alarm nobody can act on — the two travel
       together or neither is useful */
    expect(withRisk).toBe(7);
    expect(withReason).toBe(withRisk);
  });

  it('keeps compliance NULL rather than 0 where there is none', async () => {
    /* 0% reads as total non-compliance; a client in their observation window
       has nothing to comply with yet, and that is a different statement */
    const zero = await prisma.client.count({ where: { compliance: 0 } });
    expect(zero).toBe(0);
  });

  it('stores the session ledger keyed by STAFF role, not pillar key', async () => {
    const c = await prisma.client.findUnique({ where: { id: 'c-rajesh' }, select: { sessions: true } });
    const s = c?.sessions as Record<string, unknown>;
    /* `mind`, never `wellness` — the ledger speaks the staff vocabulary, and
       the two are different keys for the same pillar */
    expect(Object.keys(s).sort()).toEqual(['fitness', 'mind', 'yoga']);
    expect(s).not.toHaveProperty('wellness');
  });

  it('holds the digest, including its unflagged lines', async () => {
    /*
     * TODAY'S lines, not every line ever written.
     *
     * The digest builder never deletes — the seeded lines are the demo's story
     * and a build that cleared the day first would erase them the first time the
     * 08:00 job ran. So a database seeded on more than one day legitimately holds
     * more than six rows, and counting them all was asserting that the seed had
     * only ever run once rather than anything about the digest.
     */
    const today = startOfDay(todayISO());
    const total = await prisma.digestEntry.count({ where: { date: today } });
    const flagged = await prisma.digestEntry.count({
      where: { date: today, flag: { not: null } },
    });
    expect(total).toBe(6);
    /* a null flag is a real value: "no action needed" is still a line worth
       printing, and the demo prints it */
    expect(flagged).toBeLessThan(total);
  });
});
