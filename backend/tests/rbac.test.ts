import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
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
});
