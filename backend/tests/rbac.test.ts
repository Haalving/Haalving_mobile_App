import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { todayISO } from '@haalving/shared';

import { prisma } from '../src/config/prisma.js';
import { calendarDay } from '../src/utils/dates.js';
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

/**
 * When this run started, so the seat notes it writes can be taken back out.
 *
 * A seat change now posts a TEAMONLY line into the client's thread and a notice
 * to the incoming coach, so every suite in this file that moves a seat leaves
 * two rows behind. Deleting them by "written since we began" rather than by id
 * catches the ones the restore PUTs write too — a restore is itself a seat
 * change, and it announces like one.
 */
let runStartedAt: Date;

/* the clients whose seats this file moves */
const SEAT_CLIENTS = ['c-rajesh', 'c-mathew', 'c-sureshp', 'c-dev', 'c-ananya'];

beforeAll(async () => {
  runStartedAt = new Date();
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
  /* before the disconnect, and audit rows are deliberately left alone: the log
     is append-only by design and a test that erased it would be lying about it */
  await prisma.circleMessage.deleteMany({
    where: { clientId: { in: SEAT_CLIENTS }, kind: 'TEAMONLY', createdAt: { gte: runStartedAt } },
  });
  await prisma.notice.deleteMany({
    where: { clientId: { in: SEAT_CLIENTS }, kind: 'TASK', createdAt: { gte: runStartedAt } },
  });
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

/* ───────────────────────────────── a seat change has to say why, and say so */

describe('pod seat changes — the reason, and who hears about it', () => {
  /*
   * Suresh P.'s Fitness seat carries the whole story: Vikram holds it in the
   * seed, so it can be refused, replaced, handed back to the AI and put back
   * without any other suite in this file noticing. Dev K.'s Yoga seat is the
   * other half — he is Svayam with only Fitness bought, so that seat has no row
   * at all and is the genuine "nobody has ever held this" case.
   */
  const HELD = 'c-sureshp';
  const EMPTY = 'c-dev';

  const move = (clientId: string, seat: string, body: Record<string, unknown>) =>
    request(app)
      .put(`/api/v1/clients/${clientId}/pod/${seat}`)
      .set(...auth(anita.accessToken))
      .send(body);

  const heldBy = async (clientId: string, seat: string) =>
    (
      await prisma.podSeat.findUnique({
        where: { clientId_seat: { clientId, seat: seat as never } },
        select: { staffId: true },
      })
    )?.staffId ?? null;

  const lastTeamNote = (clientId: string) =>
    prisma.circleMessage.findFirst({
      where: { clientId, kind: 'TEAMONLY' },
      orderBy: { seq: 'desc' },
    });

  afterAll(async () => {
    /* the seeded story back: Vikram in Suresh's chair, and Dev's Yoga seat
       empty again — a row with a staffId of null is NOT the same state, because
       the seed's own cleanup deletes seats it does not name */
    await prisma.podSeat.update({
      where: { clientId_seat: { clientId: HELD, seat: 'fitness' as never } },
      data: { staffId: 'u-vikram', assignedBy: 'u-anita' },
    });
    await prisma.podSeat.deleteMany({ where: { clientId: EMPTY, seat: 'yoga' as never } });
    /* the thread notes and notices these tests provoked go with the file's own
       afterAll, which sweeps every client named in SEAT_CLIENTS */
  });

  it('refuses to replace a coach with no reason, and leaves the seat alone', async () => {
    const res = await move(HELD, 'fitness', { staffId: 'u-nikhil' });
    expect(res.status).toBe(400);
    /* the console paints this under the field, so the key is part of the contract */
    expect(res.body.error.details.reason).toBe('Required when a coach is replaced');
    /* a refused change must not half-land */
    expect(await heldBy(HELD, 'fitness')).toBe('u-vikram');
  });

  it('refuses a reason too short to be one', async () => {
    /* three characters is the "n/a" a required field collects when nobody means
       it — and this is the SCHEMA's refusal, before the service sees the row */
    const res = await move(HELD, 'fitness', { staffId: 'u-nikhil', reason: 'n/a' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.reason).toBeTruthy();
    expect(await heldBy(HELD, 'fitness')).toBe('u-vikram');
  });

  it('records the reason, tells the team, and tells the incoming coach', async () => {
    const why = 'Vikram is at capacity this cycle';
    const res = await move(HELD, 'fitness', { staffId: 'u-nikhil', reason: why });
    expect(res.status).toBe(200);
    expect(await heldBy(HELD, 'fitness')).toBe('u-nikhil');

    const row = await prisma.auditLog.findFirst({
      where: { action: 'pod.assign', subjectId: HELD },
      orderBy: { at: 'desc' },
    });
    expect(row?.reason).toBe(why);

    /* the pod's own thread, in the lane the client never reads */
    const note = await lastTeamNote(HELD);
    expect(note?.kind).toBe('TEAMONLY');
    expect(note?.fromUserId).toBe('u-anita');
    expect(note?.text).toContain('Fitness seat');
    expect(note?.text).toContain('Vikram S.');
    expect(note?.text).toContain('Nikhil T.');
    expect(note?.text).toContain(`Why: ${why}`);

    const notice = await prisma.notice.findFirst({
      where: { toId: 'u-nikhil', clientId: HELD, kind: 'TASK' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notice?.text).toContain('Suresh P.');
    expect(notice?.text).toContain('Fitness seat');
    /* THE REASON STOPS AT THE THREAD. It is a judgement about the colleague
       being replaced, and handing it to the one taking over makes a verdict on a
       peer travel through a third party. */
    expect(notice?.text).not.toContain(why);
  });

  it('needs a reason to hand a held seat back to the AI, and notifies nobody', async () => {
    const refused = await move(HELD, 'fitness', { staffId: null });
    expect(refused.status).toBe(400);
    expect(refused.body.error.details.reason).toBe('Required when a coach is replaced');

    const before = await prisma.notice.count({ where: { clientId: HELD, kind: 'TASK' } });

    const ok = await move(HELD, 'fitness', { staffId: null, reason: 'Nikhil is on leave all next cycle' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.ai).toBe(true);

    const note = await lastTeamNote(HELD);
    expect(note?.text).toContain('Nikhil T. → Your AI coach');
    expect(note?.text).toContain('Why: Nikhil is on leave all next cycle');

    /* nobody GAINED the seat, so there is nobody to congratulate — and the
       outgoing coach is deliberately not told either */
    expect(await prisma.notice.count({ where: { clientId: HELD, kind: 'TASK' } })).toBe(before);
  });

  it('lets an empty seat be filled without one, and still announces it', async () => {
    /* filling an AI seat replaces nobody, so there is nothing to explain */
    const res = await move(EMPTY, 'yoga', { staffId: 'u-lakshmi' });
    expect(res.status).toBe(200);
    expect(await heldBy(EMPTY, 'yoga')).toBe('u-lakshmi');

    const note = await lastTeamNote(EMPTY);
    expect(note?.text).toContain('Yoga seat: Your AI coach → Lakshmi N.');
    /* no reason was given, so no Why line is invented */
    expect(note?.text).not.toContain('Why:');

    const notice = await prisma.notice.findFirst({
      where: { toId: 'u-lakshmi', clientId: EMPTY, kind: 'TASK' },
      orderBy: { createdAt: 'desc' },
    });
    expect(notice?.text).toContain('Yoga seat');
  });

  it('says nothing when the seat does not actually move', async () => {
    const before = await lastTeamNote(EMPTY);

    /* re-confirming the coach already in the chair is not news */
    const res = await move(EMPTY, 'yoga', { staffId: 'u-lakshmi' });
    expect(res.status).toBe(200);

    const after = await lastTeamNote(EMPTY);
    expect(after?.id).toBe(before?.id);
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
     * The digest is a DATED reading, so a database seeded on more than one day
     * legitimately holds a line per client per morning. Counting them all was
     * asserting that the seed had only ever run once rather than anything about
     * the digest.
     */
    const today = calendarDay(todayISO());
    const rows = await prisma.digestEntry.findMany({
      where: { date: today },
      select: { clientId: true, flag: true },
    });

    /* THE COUNT IS NOT A FIXTURE ANY MORE. The seed runs the rules, so how many
       lines today holds depends on what the seeded plates and messages say. What
       must hold whatever they say: there IS a morning, and it is one line per
       client — the constraint the table carries and the reason a louder rule
       takes a client from a quieter one rather than writing over it. */
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.clientId)).size).toBe(rows.length);

    /* a null flag is a real value: "no action needed" is still a line worth
       printing, so the column is nullable and some mornings use it */
    const flagged = rows.filter((r) => r.flag !== null).length;
    expect(flagged).toBeLessThanOrEqual(rows.length);
  });
});

/* ─────────────────────────────────── the client record's merged log */

describe('client record logs', () => {
  it('merges every source, newest-first, bucketed with counts', async () => {
    const res = await request(app).get('/api/v1/clients/c-meena/logs').set(...auth(anita.accessToken));
    expect(res.status).toBe(200);
    const { entries, counts } = res.body.data as {
      entries: { at: string; bucket: string }[];
      counts: Record<string, number>;
    };
    expect(Array.isArray(entries)).toBe(true);
    /* counts add up and cover the four buckets */
    expect(counts.all).toBe(counts.client! + counts.team! + counts.plan! + counts.medical!);
    for (const e of entries) expect(['client', 'team', 'plan', 'medical']).toContain(e.bucket);
    /* newest first */
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1]!.at >= entries[i]!.at).toBe(true);
    }
  });

  it('scopes like the record — 404 for a client the caller may not see', async () => {
    /* vikram is a coach whose scope does not reach c-ananya (see the record test) */
    const res = await request(app).get('/api/v1/clients/c-ananya/logs').set(...auth(vikram.accessToken));
    expect(res.status).toBe(404);
  });
});

describe('client record panels — trackers, meetings, documents', () => {
  it('trackers: the four cards, the session rings and compliance', async () => {
    const res = await request(app)
      .get('/api/v1/clients/c-meena/trackers')
      .set(...auth(anita.accessToken));
    expect(res.status).toBe(200);
    const { cards, sessions, compliance } = res.body.data as {
      cards: { key: string; value: string; sub: string }[];
      sessions: { pillar: string; done: number; target: number }[];
      compliance: number | null;
    };
    /* the four readings the app logs — water, steps, sleep, meals — in that order */
    expect(cards.map((c) => c.key)).toEqual(['water', 'steps', 'sleep', 'meals']);
    /* rings only appear for a pillar that carries sessions this cycle */
    for (const s of sessions) expect(['fitness', 'yoga', 'wellness']).toContain(s.pillar);
    expect(compliance === null || typeof compliance === 'number').toBe(true);
  });

  it('meetings: the client’s MEETING rows, newest-first', async () => {
    const res = await request(app)
      .get('/api/v1/clients/c-meena/meetings')
      .set(...auth(anita.accessToken));
    expect(res.status).toBe(200);
    const rows = res.body.data as { id: string; date: string | null }[];
    expect(Array.isArray(rows)).toBe(true);
    /* newest-first by date, nulls (unscheduled) sinking to the end */
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]!.date ?? '';
      const b = rows[i]!.date ?? '';
      expect(a >= b).toBe(true);
    }
  });

  it('documents: the client’s file, each with a signed flag', async () => {
    const res = await request(app)
      .get('/api/v1/clients/c-meena/documents')
      .set(...auth(anita.accessToken));
    expect(res.status).toBe(200);
    const rows = res.body.data as { id: string; title: string; signed: boolean }[];
    expect(Array.isArray(rows)).toBe(true);
    for (const d of rows) expect(typeof d.signed).toBe('boolean');
  });

  it('all three scope like the record — 404 for a client the caller may not see', async () => {
    for (const panel of ['trackers', 'meetings', 'documents']) {
      const res = await request(app)
        .get(`/api/v1/clients/c-ananya/${panel}`)
        .set(...auth(vikram.accessToken));
      expect(res.status, `${panel} should 404 out of scope`).toBe(404);
    }
  });
});
