import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import * as attention from '../src/services/attention.service.js';
import {
  app,
  auth,
  clearRateLimits,
  closeConnections,
  issueTestOtp,
  loginStaff,
  type Session,
} from './helpers.js';

/**
 * ATTENTION — the ticket, exercised through the API.
 *
 * The suite is built around the two things that make a ticket different from a
 * digest line, because they are the two a refactor would quietly lose:
 *
 *   THE DEDUPE KEY IS A DATABASE FACT. The 08:00 sweep asks the same question
 *   every morning, so `raise` is called twice in a row here and the assertion is
 *   that ONE row exists and that a ticket somebody already picked up did not go
 *   back to OPEN. Then the condition is closed and returns, and the assertion
 *   flips: a recurrence is news and earns a NEW ticket.
 *
 *   A CLOSE IS OWED A REASON. Resolve and dismiss are refused without one, and
 *   refused again for a reason too short to mean anything.
 *
 * Everything is asserted against the ANSWER THE SERVER GIVES rather than against
 * a helper called in isolation, except `raise` itself — which has no route,
 * because the caller it exists for is a job.
 */

let anita: Session; /* Super Admin — seeAllClients, so every client and every hand-over */
let vikram: Session; /* Fitness Coach — six pods, no seeAllClients, no Ananya */
let sneha: Session; /* Dietician — no seat on Dev, which is what makes her unassignable there */

/** Rajesh and Meena are on both coaches' pods; Dev has no dietitian seat; Ananya has no pod at all. */
const RAJESH = 'c-rajesh';
const MEENA = 'c-meena';
const DEV = 'c-dev';
const ANANYA = 'c-ananya';
const TEST_CLIENTS = [RAJESH, MEENA, DEV, ANANYA];

const RAJESH_PHONE = '+919847022110';

/** Everything this file wrote, and nothing else — the test DB is shared. */
const suiteStart = new Date();

async function reset(): Promise<void> {
  /* the tickets first: a closed one still points at the log row that raised it */
  await prisma.attention.deleteMany({
    where: {
      clientId: { in: TEST_CLIENTS },
      OR: [{ dedupeKey: { startsWith: 'test:' } }, { dedupeKey: { startsWith: 'manual:' } }],
    },
  });
  await prisma.clientLog.deleteMany({
    where: { clientId: { in: TEST_CLIENTS }, type: 'ATTENTION', createdAt: { gte: suiteStart } },
  });
}

beforeAll(async () => {
  await clearRateLimits();
  [anita, vikram, sneha] = await Promise.all([
    loginStaff('anita'),
    loginStaff('vikram'),
    loginStaff('sneha'),
  ]);
});

afterAll(async () => {
  await reset();
  await closeConnections();
});

beforeEach(reset);

const api = (s: Session) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set(...auth(s.accessToken)),
  post: (path: string, body?: object) =>
    request(app)
      .post(`/api/v1${path}`)
      .set(...auth(s.accessToken))
      .send(body ?? {}),
  patch: (path: string, body: object) =>
    request(app)
      .patch(`/api/v1${path}`)
      .set(...auth(s.accessToken))
      .send(body),
});

/**
 * A ticket raised the way the 08:00 sweep raises one — through the same helper,
 * so the dedupe rule under test is the rule the job will actually run.
 */
async function sweep(
  clientId: string,
  key: string,
  severity: 'INFO' | 'WATCH' | 'HIGH' | 'CRITICAL' = 'HIGH',
  description = 'No logs for 3 days.',
) {
  return attention.raise({
    clientId,
    dedupeKey: `test:${key}`,
    source: 'noLogs',
    severity,
    title: 'Three days quiet',
    description,
    evidence: ['meal log', 'circle messages'],
  });
}

/** The timeline rows this act wrote, newest first. */
function logsFor(clientId: string, title?: string) {
  return prisma.clientLog.findMany({
    where: {
      clientId,
      type: 'ATTENTION',
      createdAt: { gte: suiteStart },
      ...(title ? { title } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** The audit row for one act on one ticket. */
function auditFor(action: string, subjectId: string) {
  return prisma.auditLog.findFirst({
    where: { action, subjectType: 'attention', subjectId },
    orderBy: { at: 'desc' },
  });
}

const RAISE = {
  clientId: RAJESH,
  severity: 'HIGH' as const,
  title: 'Chart is three days overdue',
  description: 'The strength chart was promised on Monday and nothing has been filed.',
  evidence: ['plan chain', 'last message'],
};

/* ─────────────────────────────────────────────────────────── raising one */

describe('raising one by hand', () => {
  it('writes the ticket, the timeline row and the audit row', async () => {
    const res = await api(anita).post('/attentions', RAISE);
    expect(res.status).toBe(201);

    const row = res.body.data;
    expect(row.status).toBe('OPEN');
    expect(row.severity).toBe('HIGH');
    /* the body may not claim to be a rule — the server names the source */
    expect(row.source).toBe('manual');
    expect(row.evidence).toEqual(RAISE.evidence);
    expect(row.client.name).toBe('Rajesh D.');

    const logs = await logsFor(RAJESH, 'Attention raised');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe('u-anita');
    expect(logs[0]?.description).toBe(RAISE.title);

    expect(await auditFor('attention.raised', row.id)).not.toBeNull();
  });

  it('lets a coach raise one about a client on their own pod', async () => {
    const res = await api(vikram).post('/attentions', { ...RAISE, clientId: MEENA });
    expect(res.status).toBe(201);
  });

  it('answers 404, not 403, for a client outside the caller’s scope', async () => {
    /* a 403 would confirm the record exists, and "is somebody worried about this
       person" is itself the sensitive fact */
    const res = await api(vikram).post('/attentions', { ...RAISE, clientId: ANANYA });
    expect(res.status).toBe(404);

    const allowed = await api(anita).post('/attentions', { ...RAISE, clientId: ANANYA });
    expect(allowed.status).toBe(201);
  });

  it('refuses a body with nothing in it', async () => {
    const res = await api(anita).post('/attentions', { clientId: RAJESH, severity: 'HIGH' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.title).toBeTruthy();
  });

  it('two hand-raised tickets about one client are two tickets', async () => {
    /* a human raise is never a repeat: two coaches noticing two different things
       must not collapse into one row */
    const a = await api(anita).post('/attentions', RAISE);
    const b = await api(anita).post('/attentions', { ...RAISE, title: 'Missed two sessions' });
    expect(a.body.data.id).not.toBe(b.body.data.id);
  });
});

/* ─────────────────────────────────────────────────────────────── the board */

describe('the board', () => {
  it('defaults to the live three, and ALL asks past that', async () => {
    const open = await sweep(RAJESH, 'live');
    const closed = await sweep(MEENA, 'closed');
    await api(anita).patch(`/attentions/${closed.row.id}`, {
      action: 'dismiss',
      resolutionReason: 'Logged from the gym app instead.',
    });

    const live = await api(anita).get('/attentions').query({ clientId: RAJESH });
    expect(live.body.data.rows.map((r: { id: string }) => r.id)).toContain(open.row.id);

    const dflt = await api(anita).get('/attentions').query({ clientId: MEENA });
    expect(dflt.body.data.rows.map((r: { id: string }) => r.id)).not.toContain(closed.row.id);

    const all = await api(anita).get('/attentions').query({ clientId: MEENA, status: 'ALL' });
    expect(all.body.data.rows.map((r: { id: string }) => r.id)).toContain(closed.row.id);
  });

  it('filters by severity', async () => {
    await sweep(RAJESH, 'loud', 'CRITICAL');
    await sweep(MEENA, 'quiet', 'INFO');

    const res = await api(anita).get('/attentions').query({ severity: 'CRITICAL' });
    const severities = res.body.data.rows.map((r: { severity: string }) => r.severity);
    expect(severities.length).toBeGreaterThan(0);
    expect(new Set(severities)).toEqual(new Set(['CRITICAL']));
  });

  it('pages with a cursor without repeating or skipping a row', async () => {
    const raised = [
      (await sweep(RAJESH, 'p1', 'WATCH')).row.id,
      (await sweep(RAJESH, 'p2', 'CRITICAL')).row.id,
      (await sweep(RAJESH, 'p3', 'HIGH')).row.id,
    ];

    const seen: string[] = [];
    const severities: string[] = [];
    let cursor: string | null = null;
    let total = 0;

    /* walked to the end rather than checked two pages deep: the failure a cursor
       actually has is a row that falls between pages, and one page never sees it */
    for (let guard = 0; guard < 10; guard += 1) {
      const res: request.Response = await api(anita)
        .get('/attentions')
        .query({ clientId: RAJESH, limit: 2, ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      for (const row of res.body.data.rows as Array<{ id: string; severity: string }>) {
        seen.push(row.id);
        severities.push(row.severity);
      }
      total = res.body.data.total;
      cursor = res.body.data.nextCursor;
      if (!cursor) break;
    }

    expect(new Set(seen).size).toBe(seen.length);
    for (const id of raised) expect(seen).toContain(id);
    /* the count is the whole filtered set, not the page — the tab's badge counts
       work, not rows shown */
    expect(total).toBe(seen.length);

    /* loudest first — the enum's own declaration order is what `severity: desc`
       reads, so CRITICAL leads and INFO trails */
    const rank = ['CRITICAL', 'HIGH', 'WATCH', 'INFO'];
    const ranks = severities.map((s) => rank.indexOf(s));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('never shows a coach a ticket about a client outside their scope', async () => {
    const hidden = await sweep(ANANYA, 'hidden');

    const coach = await api(vikram).get('/attentions').query({ status: 'ALL', limit: 200 });
    expect(coach.body.data.rows.map((r: { id: string }) => r.id)).not.toContain(hidden.row.id);

    /* and the filter cannot be used to reach outside it either */
    const probe = await api(vikram).get('/attentions').query({ clientId: ANANYA, status: 'ALL' });
    expect(probe.status).toBe(200);
    expect(probe.body.data.rows).toHaveLength(0);
  });

  it('resolves `me` from the token, never from the query', async () => {
    const mine = await sweep(RAJESH, 'mine');
    await api(anita).patch(`/attentions/${mine.row.id}`, {
      action: 'assign',
      assignedToId: 'u-vikram',
    });

    const his = await api(vikram).get('/attentions').query({ assignedToId: 'me' });
    expect(his.body.data.rows.map((r: { id: string }) => r.id)).toContain(mine.row.id);

    const hers = await api(sneha).get('/attentions').query({ assignedToId: 'me' });
    expect(hers.body.data.rows.map((r: { id: string }) => r.id)).not.toContain(mine.row.id);
  });

  it('serves the record’s own panel, and 404s a record out of reach', async () => {
    const t = await sweep(RAJESH, 'record');

    const ok = await api(vikram).get(`/clients/${RAJESH}/attentions`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.rows.map((r: { id: string }) => r.id)).toContain(t.row.id);

    const blocked = await api(vikram).get(`/clients/${ANANYA}/attentions`);
    expect(blocked.status).toBe(404);
  });

  it('cannot be pointed at another client from the query', async () => {
    const elsewhere = await sweep(MEENA, 'elsewhere');
    const res = await api(anita).get(`/clients/${RAJESH}/attentions`).query({ clientId: MEENA });
    expect(res.status).toBe(200);
    expect(res.body.data.rows.map((r: { id: string }) => r.id)).not.toContain(elsewhere.row.id);
  });
});

/* ───────────────────────────────────────────────────────────── the five doors */

describe('the five doors', () => {
  it('acknowledges, and writes both trails', async () => {
    const t = await sweep(RAJESH, 'ack');

    const res = await api(vikram).patch(`/attentions/${t.row.id}`, { action: 'acknowledge' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACKNOWLEDGED');

    const logs = await logsFor(RAJESH, 'Attention acknowledged');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe('u-vikram');

    const row = await auditFor('attention.acknowledged', t.row.id);
    expect(row).not.toBeNull();
    expect((row?.meta as { from?: string }).from).toBe('OPEN');
  });

  it('picks one up, from open or from acknowledged', async () => {
    const t = await sweep(RAJESH, 'start');
    const res = await api(vikram).patch(`/attentions/${t.row.id}`, { action: 'start' });
    expect(res.body.data.status).toBe('IN_PROGRESS');
    expect(await logsFor(RAJESH, 'Attention picked up')).toHaveLength(1);
  });

  it('refuses a second acknowledgement rather than silently repeating it', async () => {
    const t = await sweep(RAJESH, 'twice');
    await api(vikram).patch(`/attentions/${t.row.id}`, { action: 'acknowledge' });

    const again = await api(vikram).patch(`/attentions/${t.row.id}`, { action: 'acknowledge' });
    expect(again.status).toBe(409);
  });

  it('will not close one without a reason', async () => {
    const t = await sweep(RAJESH, 'noreason');

    const bare = await api(vikram).patch(`/attentions/${t.row.id}`, { action: 'resolve' });
    expect(bare.status).toBe(400);
    expect(bare.body.error.details.resolutionReason).toBeTruthy();

    /* and not with a reason too short to mean anything — the pod-seat floor */
    const thin = await api(vikram).patch(`/attentions/${t.row.id}`, {
      action: 'dismiss',
      resolutionReason: 'na',
    });
    expect(thin.status).toBe(400);

    const still = await prisma.attention.findUniqueOrThrow({ where: { id: t.row.id } });
    expect(still.status).toBe('OPEN');
  });

  it('resolves with a reason, and records who closed it', async () => {
    const t = await sweep(RAJESH, 'resolve');
    const why = 'Called her — she was travelling and logged from the gym app.';

    const res = await api(vikram).patch(`/attentions/${t.row.id}`, {
      action: 'resolve',
      resolutionReason: why,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RESOLVED');
    expect(res.body.data.resolutionReason).toBe(why);
    expect(res.body.data.resolvedBy.id).toBe('u-vikram');
    expect(res.body.data.resolvedAt).toBeTruthy();

    const logs = await logsFor(RAJESH, 'Attention resolved');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.description).toContain(why);

    const row = await auditFor('attention.resolved', t.row.id);
    expect(row?.reason).toBe(why);
  });

  it('dismisses, which is a different close from resolved', async () => {
    const t = await sweep(RAJESH, 'dismiss');
    const res = await api(vikram).patch(`/attentions/${t.row.id}`, {
      action: 'dismiss',
      resolutionReason: 'Raised against the wrong client.',
    });
    expect(res.body.data.status).toBe('DISMISSED');
    expect(await auditFor('attention.dismissed', t.row.id)).not.toBeNull();
  });

  it('has no reopen — a closed ticket stays closed', async () => {
    const t = await sweep(RAJESH, 'closed-final');
    await api(vikram).patch(`/attentions/${t.row.id}`, {
      action: 'resolve',
      resolutionReason: 'Spoke to him on Tuesday.',
    });

    for (const action of ['acknowledge', 'start', 'resolve', 'dismiss', 'assign']) {
      const res = await api(vikram).patch(`/attentions/${t.row.id}`, {
        action,
        assignedToId: 'u-vikram',
        resolutionReason: 'Trying again anyway.',
      });
      expect(res.status, action).toBe(409);
    }
  });

  it('answers 404, not 403, for a ticket about a client out of reach', async () => {
    const hidden = await sweep(ANANYA, 'unreachable');
    const res = await api(vikram).patch(`/attentions/${hidden.row.id}`, { action: 'acknowledge' });
    expect(res.status).toBe(404);
  });
});

/* ──────────────────────────────────────────────────────────── handing it over */

describe('assigning', () => {
  it('lets anybody take one themselves', async () => {
    const t = await sweep(RAJESH, 'takeit');
    const res = await api(vikram).patch(`/attentions/${t.row.id}`, {
      action: 'assign',
      assignedToId: 'u-vikram',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.assignedTo.id).toBe('u-vikram');
    /* an assignment does not move the status — somebody owning it is not somebody
       having started it */
    expect(res.body.data.status).toBe('OPEN');
    expect(await logsFor(RAJESH, 'Attention assigned')).toHaveLength(1);
  });

  it('needs the permission that sees everybody to put one on somebody else, and logs the attempt', async () => {
    const t = await sweep(RAJESH, 'handover');
    const before = await prisma.auditLog.count({
      where: { action: 'denied', actorId: 'u-vikram', subjectType: 'attention' },
    });

    const res = await api(vikram).patch(`/attentions/${t.row.id}`, {
      action: 'assign',
      assignedToId: 'u-sneha',
    });
    expect(res.status).toBe(403);

    const after = await prisma.auditLog.count({
      where: { action: 'denied', actorId: 'u-vikram', subjectType: 'attention' },
    });
    expect(after).toBe(before + 1);
  });

  it('refuses an assignee who could not open the record', async () => {
    /* Dev is Svayam with Fitness only, so Sneha holds no seat on him — a ticket
       filed with her would be a ticket nobody can work */
    const t = await sweep(DEV, 'unreachable-assignee');
    const res = await api(anita).patch(`/attentions/${t.row.id}`, {
      action: 'assign',
      assignedToId: 'u-sneha',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.assignedToId).toBeTruthy();
  });

  it('hands one back to the pod with an explicit null', async () => {
    const t = await sweep(RAJESH, 'handback');
    await api(anita).patch(`/attentions/${t.row.id}`, {
      action: 'assign',
      assignedToId: 'u-vikram',
    });

    const res = await api(anita).patch(`/attentions/${t.row.id}`, {
      action: 'assign',
      assignedToId: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.assignedTo).toBeNull();
    expect(await logsFor(RAJESH, 'Attention handed back to the pod')).toHaveLength(1);
  });

  it('refuses an assign that names nobody at all', async () => {
    /* leaving the field out is a malformed request; sending null is a real act */
    const t = await sweep(RAJESH, 'nobody');
    const res = await api(anita).patch(`/attentions/${t.row.id}`, { action: 'assign' });
    expect(res.status).toBe(400);
  });
});

/* ───────────────────────────────────────────────────────────── the dedupe key */

describe('the dedupe key — what makes a re-run safe', () => {
  it('refreshes the standing ticket on a repeat instead of raising a second', async () => {
    const first = await sweep(RAJESH, 'norun', 'HIGH', 'No logs for 3 days.');
    expect(first.created).toBe(true);

    /* somebody picks it up between the two runs — the state a naive upsert loses */
    await api(vikram).patch(`/attentions/${first.row.id}`, { action: 'acknowledge' });

    const second = await sweep(RAJESH, 'norun', 'HIGH', 'No logs for 4 days.');
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    /* the WORDS move on; the status and the assignee do not */
    expect(second.row.description).toBe('No logs for 4 days.');
    expect(second.row.status).toBe('ACKNOWLEDGED');

    const count = await prisma.attention.count({ where: { dedupeKey: 'test:norun' } });
    expect(count).toBe(1);
  });

  it('raises a NEW ticket when a closed condition comes back', async () => {
    const first = await sweep(MEENA, 'recurrence');
    await api(anita).patch(`/attentions/${first.row.id}`, {
      action: 'resolve',
      resolutionReason: 'She was on holiday and is back logging.',
    });

    const again = await sweep(MEENA, 'recurrence');
    expect(again.created).toBe(true);
    expect(again.row.id).not.toBe(first.row.id);
    expect(again.row.status).toBe('OPEN');

    /* the closed row kept its history and released the key — a recurrence is news,
       and a resolved ticket that could be revived would hide it */
    const closed = await prisma.attention.findUniqueOrThrow({ where: { id: first.row.id } });
    expect(closed.status).toBe('RESOLVED');
    expect(closed.dedupeKey).toContain('test:recurrence');
    expect(closed.dedupeKey).not.toBe('test:recurrence');
  });
});

/* ──────────────────────────────────────────────────────────────────── the door */

describe('the audience', () => {
  it('refuses a client token every attention route', async () => {
    await issueTestOtp(RAJESH_PHONE, '515151');
    const verify = await request(app)
      .post('/api/v1/auth/client/otp/verify')
      .set('X-Client', 'mobile')
      .send({ phone: RAJESH_PHONE, code: '515151' });
    expect(verify.status).toBe(200);
    const token = verify.body.data.accessToken as string;

    const t = await sweep(RAJESH, 'not-for-them');

    for (const res of [
      await request(app).get('/api/v1/attentions').set(...auth(token)),
      await request(app).get(`/api/v1/clients/${RAJESH}/attentions`).set(...auth(token)),
      await request(app)
        .patch(`/api/v1/attentions/${t.row.id}`)
        .set(...auth(token))
        .send({ action: 'acknowledge' }),
    ]) {
      expect(res.status).toBe(403);
    }
  });
});
