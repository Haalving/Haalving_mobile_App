import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import * as config from '../src/services/config.service.js';
import { raiseFor } from '../src/services/escalations.service.js';
import * as notice from '../src/services/notice.service.js';
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
 * NOTICES — the sweeps' outbox, and the morning that fills it.
 *
 * The suite is built around the one claim that made this work worth doing: the
 * SLA and at-risk lines on the work board used to be SYNTHESISED at read time
 * and handed out pre-seen, because a sweep that wrote them would write them
 * again on every run. So the assertions that matter here are the ones a
 * refactor would quietly lose:
 *
 *   THE JOB IS IDEMPOTENT THROUGH THE DATABASE. `raiseFor` is called twice in a
 *   row over one client and the assertion is that ONE ticket, ONE notice and ONE
 *   log row exist afterwards — and that a notice somebody had already read did
 *   not come back unread just because the condition is still true.
 *
 *   A RECURRENCE IS NEWS. Close the ticket, run the sweep again, and the
 *   assertion flips: a new ticket, and the notice standing back up unread.
 *
 * Everything is built rather than borrowed. A client with nothing logged and a
 * plate past its promise are conditions this file creates, so the assertions do
 * not move when the seed does — and everything made here is removed again,
 * because the suites share one database.
 */

let anita: Session; /* Super Admin — seeAllClients, so every ticket is hers to close */
let vikram: Session; /* Fitness Coach — the seat that carries the quiet client */
let sneha: Session; /* Dietician — the seat a late plate is addressed at */

/** Everything this file created, cleaned up whatever the assertions did. */
const MADE: string[] = [];
const DAY = 86_400_000;
const MIN = 60_000;

const RAJESH_PHONE = '+919847022110';

async function makeClient(name: string, extra: Record<string, unknown> = {}): Promise<string> {
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
}

/**
 * Clear what the sweep wrote about one client.
 *
 * IN THE ORDER THE FOREIGN KEYS ALLOW: a notice points at the ticket it
 * announces and at the log row that raised it, and a ticket points at the log
 * row too. Deleting the log first leaves two SetNull writes behind and a test
 * that reads `relatedLogId` for a row that no longer has one.
 */
async function clearFor(clientId: string): Promise<void> {
  await prisma.notice.deleteMany({ where: { clientId } });
  await prisma.attention.deleteMany({ where: { clientId } });
  await prisma.clientLog.deleteMany({ where: { clientId } });
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
  for (const id of MADE) await clearFor(id);
  await prisma.podSeat.deleteMany({ where: { clientId: { in: MADE } } });
  await prisma.meal.deleteMany({ where: { clientId: { in: MADE } } });
  await prisma.digestEntry.deleteMany({ where: { clientId: { in: MADE } } });
  await prisma.client.deleteMany({ where: { id: { in: MADE } } });
  await closeConnections();
});

/* ─────────────────────────────────────────────── the 08:00 escalations step */

describe('the morning sweep writes real rows', () => {
  let quiet: string;

  beforeAll(async () => {
    quiet = await makeClient('Ported acceptance — notices, gone quiet');
    /* somebody has to be told, and who that is resolves through the pod */
    await prisma.podSeat.create({
      data: { clientId: quiet, seat: 'fitness', staffId: vikram.user.id },
    });
  });

  beforeEach(async () => {
    await clearFor(quiet);
  });

  it('raises a ticket, a log row and a notice for a client who has gone quiet', async () => {
    const counts = await raiseFor(new Date(), [quiet]);
    expect(counts).toEqual({ attentions: 1, notices: 1, logs: 1 });

    const log = await prisma.clientLog.findFirst({ where: { clientId: quiet } });
    expect(log?.type).toBe('INACTIVITY');
    /* the job wrote it, so nobody's name is on the decision */
    expect(log?.actorId).toBeNull();

    const ticket = await prisma.attention.findUnique({ where: { dedupeKey: `noLogs:${quiet}` } });
    expect(ticket?.severity).toBe('HIGH');
    expect(ticket?.status).toBe('OPEN');
    expect(ticket?.source).toBe('noLogs');
    expect(ticket?.relatedLogId).toBe(log?.id);

    const row = await prisma.notice.findFirst({ where: { clientId: quiet } });
    expect(row?.toId).toBe(vikram.user.id);
    expect(row?.kind).toBe('CLIENT_RISK');
    expect(row?.status).toBe('UNREAD');
    expect(row?.severity).toBe('HIGH');
    /* the click-through, and the seat it was addressed at */
    expect(row?.attentionId).toBe(ticket?.id);
    expect(row?.targetRole).toBe('fitness');
  });

  it('runs twice and still holds one of each', async () => {
    await raiseFor(new Date(), [quiet]);
    const first = await prisma.attention.findUnique({ where: { dedupeKey: `noLogs:${quiet}` } });

    /* the reader has looked at it. The second run must not undo that. */
    await request(app)
      .post(`/api/v1/notices/${(await prisma.notice.findFirstOrThrow({ where: { clientId: quiet } })).id}/read`)
      .set(...auth(vikram.accessToken));

    const again = await raiseFor(new Date(), [quiet]);
    /* nothing NEW — the wording was refreshed, which is not the same as written */
    expect(again).toEqual({ attentions: 0, notices: 0, logs: 0 });

    expect(await prisma.attention.count({ where: { clientId: quiet } })).toBe(1);
    expect(await prisma.clientLog.count({ where: { clientId: quiet } })).toBe(1);

    const rows = await prisma.notice.findMany({ where: { clientId: quiet } });
    expect(rows).toHaveLength(1);
    /* the condition being still true tomorrow is not news, and does not un-read */
    expect(rows[0]?.status).toBe('READ');

    const now = await prisma.attention.findUnique({ where: { dedupeKey: `noLogs:${quiet}` } });
    expect(now?.id).toBe(first?.id);
  });

  it('treats a condition that returns after a close as news — new ticket, notice stood back up', async () => {
    await raiseFor(new Date(), [quiet]);
    const first = await prisma.attention.findFirstOrThrow({ where: { clientId: quiet } });
    const told = await prisma.notice.findFirstOrThrow({ where: { clientId: quiet } });

    await request(app)
      .post(`/api/v1/notices/${told.id}/acknowledge`)
      .set(...auth(vikram.accessToken));

    const closed = await request(app)
      .patch(`/api/v1/attentions/${first.id}`)
      .set(...auth(anita.accessToken))
      .send({ action: 'resolve', resolutionReason: 'Called her; she is logging again from tomorrow.' });
    expect(closed.status).toBe(200);

    const again = await raiseFor(new Date(), [quiet]);
    expect(again.attentions).toBe(1);

    /* a SECOND ticket, not the first one reopened — the close is still readable */
    const tickets = await prisma.attention.findMany({ where: { clientId: quiet } });
    expect(tickets).toHaveLength(2);
    expect(tickets.filter((t) => t.status === 'OPEN')).toHaveLength(1);
    expect(await prisma.attention.count({ where: { dedupeKey: `noLogs:${quiet}` } })).toBe(1);

    /* and the person who acknowledged the old one is told again, rather than the
       row being refreshed underneath them */
    const rows = await prisma.notice.findMany({ where: { clientId: quiet } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('UNREAD');
    expect(rows[0]?.acknowledgedAt).toBeNull();
    expect(rows[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(told.createdAt.getTime());

    /* the sweep saw the absence a second time, and the timeline says so twice */
    expect(await prisma.clientLog.count({ where: { clientId: quiet, type: 'INACTIVITY' } })).toBe(2);
  });
});

describe('a late plate', () => {
  let waiting: string;
  let mealId: string;

  beforeAll(async () => {
    waiting = await makeClient('Ported acceptance — notices, plate waiting');
    await prisma.podSeat.create({
      data: { clientId: waiting, seat: 'dietitian', staffId: sneha.user.id },
    });
  });

  beforeEach(async () => {
    await clearFor(waiting);
    await prisma.meal.deleteMany({ where: { clientId: waiting } });
  });

  /** Put the capture this many minutes in the past. The clock is config's, not a constant. */
  async function plateAgedBy(minutes: number): Promise<void> {
    const m = await prisma.meal.create({
      data: {
        clientId: waiting,
        slot: 'Lunch',
        fullness: 'Just right',
        capturedAt: new Date(Date.now() - minutes * MIN),
      },
      select: { id: true },
    });
    mealId = m.id;
  }

  it('tells the dietitian at the breach, and does not open a ticket yet', async () => {
    const sla = await config.getSla();
    /* past the promise, inside the escalation window — the common case, and the
       one that must not fill the ticket board */
    await plateAgedBy(sla.replyTargetMin + 1);

    const counts = await raiseFor(new Date(), [waiting]);
    expect(counts.notices).toBe(1);
    expect(counts.attentions).toBe(0);

    const row = await prisma.notice.findFirstOrThrow({ where: { clientId: waiting } });
    expect(row.kind).toBe('SLA_BREACH');
    expect(row.toId).toBe(sneha.user.id);
    expect(row.targetRole).toBe('dietitian');
    expect(row.attentionId).toBeNull();
    /* KEYED ON THE PLATE: the next late plate is a different let-down */
    expect(row.dedupeKey).toBe(`mealSla:${mealId}`);
    expect(row.text).toContain('awaiting rating');
  });

  it('opens a ticket once the ladder escalates, and does not double the notice', async () => {
    const sla = await config.getSla();
    await plateAgedBy(sla.notifyAfterMin + sla.escalateAfterMin + 5);

    await raiseFor(new Date(), [waiting]);

    const ticket = await prisma.attention.findUnique({ where: { dedupeKey: `mealSla:${mealId}` } });
    expect(ticket?.severity).toBe('HIGH');
    expect(ticket?.source).toBe('mealSla');

    /* the dietitian still holds ONE line about this plate, now pointing at the
       ticket — the escalate-to bench is told separately, under its own seat */
    const hers = await prisma.notice.findMany({ where: { clientId: waiting, toId: sneha.user.id } });
    expect(hers).toHaveLength(1);
    expect(hers[0]?.attentionId).toBe(ticket?.id);

    /* a late plate owns no log row: the meal is already a row, and the timeline
       merges it — only an ABSENCE has nowhere else to be written down */
    expect(await prisma.clientLog.count({ where: { clientId: waiting } })).toBe(0);
  });
});

/* ────────────────────────────────────────────────────────────────── the page */

describe('GET /notices', () => {
  let subject: string;

  beforeAll(async () => {
    subject = await makeClient('Ported acceptance — notices, the page');
  });

  beforeEach(async () => {
    await clearFor(subject);
    /* three, newest last, so the cursor has something to walk */
    for (const n of [1, 2, 3]) {
      await notice.raise({
        toIds: [vikram.user.id],
        kind: 'REMINDER',
        title: `Reminder ${n}`,
        text: `The ${n}th thing to remember.`,
        clientId: subject,
        dedupeKey: `test:page:${subject}:${n}`,
      });
    }
  });

  const get = (q: string) =>
    request(app)
      .get(`/api/v1/notices?${q}`)
      .set(...auth(vikram.accessToken));

  it('answers the caller’s own outbox, newest first, with its page', async () => {
    const res = await get(`clientId=${subject}`);
    expect(res.status).toBe(200);

    const { rows, pagination } = res.body.data;
    expect(rows).toHaveLength(3);
    expect(rows[0].title).toBe('Reminder 3');
    expect(rows[0].status).toBe('UNREAD');
    expect(pagination.nextCursor).toBeNull();
  });

  it('pages by cursor without repeating a row or skipping one', async () => {
    const first = await get(`clientId=${subject}&limit=2`);
    expect(first.body.data.rows).toHaveLength(2);
    expect(first.body.data.pagination.nextCursor).toBeTruthy();

    const next = await get(
      `clientId=${subject}&limit=2&cursor=${first.body.data.pagination.nextCursor}`,
    );
    expect(next.body.data.rows).toHaveLength(1);
    expect(next.body.data.pagination.nextCursor).toBeNull();

    const ids = [...first.body.data.rows, ...next.body.data.rows].map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('narrows on unreadOnly — and `false` means false', async () => {
    const one = await prisma.notice.findFirstOrThrow({ where: { clientId: subject } });
    await request(app)
      .post(`/api/v1/notices/${one.id}/read`)
      .set(...auth(vikram.accessToken));

    expect((await get(`clientId=${subject}&unreadOnly=true`)).body.data.rows).toHaveLength(2);
    /*
     * THE COERCION TRAP. `z.coerce.boolean()` makes the string "false" true,
     * because every non-empty string is truthy — a caller asking for everything
     * would silently get only what they had not read.
     */
    expect((await get(`clientId=${subject}&unreadOnly=false`)).body.data.rows).toHaveLength(3);
  });

  it('narrows on kind, and refuses a kind that is not one', async () => {
    expect((await get(`clientId=${subject}&kind=REMINDER`)).body.data.rows).toHaveLength(3);
    expect((await get(`clientId=${subject}&kind=LEAVE`)).body.data.rows).toHaveLength(0);

    const bad = await get(`clientId=${subject}&kind=SHOUTING`);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toHaveProperty('kind');
  });

  it('is one person’s outbox and nobody else’s', async () => {
    const hers = await request(app)
      .get(`/api/v1/notices?clientId=${subject}`)
      .set(...auth(sneha.accessToken));
    expect(hers.body.data.rows).toHaveLength(0);
  });

  it('is a staff surface — a client token is refused at the door', async () => {
    /* a code of this file's own: `issueTestOtp` consumes whatever was pending for
       the number, and two suites sharing one would consume each other's */
    await issueTestOtp(RAJESH_PHONE, '727272');
    const signIn = await request(app)
      .post('/api/v1/auth/client/otp/verify')
      .set('X-Client', 'mobile')
      .send({ phone: RAJESH_PHONE, code: '727272' });
    expect(signIn.status).toBe(200);

    const res = await request(app)
      .get('/api/v1/notices')
      .set(...auth(signIn.body.data.accessToken));
    expect(res.status).toBe(403);
  });
});

describe('the badge and the two doors', () => {
  let subject: string;

  beforeAll(async () => {
    subject = await makeClient('Ported acceptance — notices, the doors');
  });

  beforeEach(async () => {
    await clearFor(subject);
  });

  const badge = async (): Promise<number> => {
    const res = await request(app)
      .get('/api/v1/notices/unread-count')
      .set(...auth(vikram.accessToken));
    expect(res.status).toBe(200);
    return res.body.data.unread as number;
  };

  it('counts what is still unread, and drops as it is read', async () => {
    const before = await badge();

    await notice.raise({
      toIds: [vikram.user.id],
      kind: 'REMINDER',
      text: 'Something is waiting.',
      clientId: subject,
      dedupeKey: `test:badge:${subject}`,
    });
    expect(await badge()).toBe(before + 1);

    const row = await prisma.notice.findFirstOrThrow({ where: { clientId: subject } });
    const read = await request(app)
      .post(`/api/v1/notices/${row.id}/read`)
      .set(...auth(vikram.accessToken));
    expect(read.status).toBe(200);
    expect(read.body.data.status).toBe('READ');
    expect(await badge()).toBe(before);
  });

  it('acknowledges once, and reading afterwards does not walk it back', async () => {
    await notice.raise({
      toIds: [vikram.user.id],
      kind: 'CLIENT_RISK',
      severity: 'HIGH',
      text: 'Somebody has to pick this up.',
      clientId: subject,
      dedupeKey: `test:ack:${subject}`,
    });
    const row = await prisma.notice.findFirstOrThrow({ where: { clientId: subject } });

    const first = await request(app)
      .post(`/api/v1/notices/${row.id}/acknowledge`)
      .set(...auth(vikram.accessToken));
    expect(first.body.data.status).toBe('ACKNOWLEDGED');
    expect(first.body.data.acknowledgedAt).toBeTruthy();

    /* a second click is not a second taking-on */
    const twice = await request(app)
      .post(`/api/v1/notices/${row.id}/acknowledge`)
      .set(...auth(vikram.accessToken));
    expect(twice.body.data.acknowledgedAt).toBe(first.body.data.acknowledgedAt);

    const back = await request(app)
      .post(`/api/v1/notices/${row.id}/read`)
      .set(...auth(vikram.accessToken));
    expect(back.body.data.status).toBe('ACKNOWLEDGED');
  });

  it('writes nothing to the client’s timeline — reading a notice is not an event', async () => {
    await notice.raise({
      toIds: [vikram.user.id],
      kind: 'REMINDER',
      text: 'Glanced at.',
      clientId: subject,
      dedupeKey: `test:quiet:${subject}`,
    });
    const row = await prisma.notice.findFirstOrThrow({ where: { clientId: subject } });

    await request(app)
      .post(`/api/v1/notices/${row.id}/read`)
      .set(...auth(vikram.accessToken));
    await request(app)
      .post(`/api/v1/notices/${row.id}/acknowledge`)
      .set(...auth(vikram.accessToken));

    expect(await prisma.clientLog.count({ where: { clientId: subject } })).toBe(0);
  });

  it('refuses somebody else’s notice as a 404, never a 403', async () => {
    await notice.raise({
      toIds: [vikram.user.id],
      kind: 'REMINDER',
      text: 'Addressed to one person.',
      clientId: subject,
      dedupeKey: `test:mine:${subject}`,
    });
    const row = await prisma.notice.findFirstOrThrow({ where: { clientId: subject } });

    /* 403 would confirm the row exists to somebody it was never written for */
    const res = await request(app)
      .post(`/api/v1/notices/${row.id}/read`)
      .set(...auth(sneha.accessToken));
    expect(res.status).toBe(404);

    const missing = await request(app)
      .post('/api/v1/notices/nt-nothing-here/read')
      .set(...auth(vikram.accessToken));
    expect(missing.status).toBe(404);
  });
});

/* ─────────────────────────────────────────────────────────────── the writer */

describe('notice.raise', () => {
  let subject: string;

  beforeAll(async () => {
    subject = await makeClient('Ported acceptance — notices, the writer');
  });

  beforeEach(async () => {
    await clearFor(subject);
  });

  it('writes one row per recipient and de-duplicates the recipients', async () => {
    const res = await notice.raise({
      toIds: [vikram.user.id, sneha.user.id, vikram.user.id],
      kind: 'REMINDER',
      text: 'Two people, three ids.',
      clientId: subject,
      dedupeKey: `test:fanout:${subject}`,
    });
    expect(res).toEqual({ written: 2, created: 2 });
    expect(await prisma.notice.count({ where: { clientId: subject } })).toBe(2);
  });

  it('keyed, it refreshes the wording and leaves the lifecycle alone', async () => {
    await notice.raise({
      toIds: [vikram.user.id],
      kind: 'SLA_BREACH',
      text: 'Lunch is 4 min past the promise.',
      clientId: subject,
      dedupeKey: `test:refresh:${subject}`,
    });
    const before = await prisma.notice.findFirstOrThrow({ where: { clientId: subject } });
    await prisma.notice.update({ where: { id: before.id }, data: { status: 'READ' } });

    const again = await notice.raise({
      toIds: [vikram.user.id],
      kind: 'SLA_BREACH',
      text: 'Lunch is 40 min past the promise.',
      clientId: subject,
      dedupeKey: `test:refresh:${subject}`,
    });
    expect(again).toEqual({ written: 1, created: 0 });

    const after = await prisma.notice.findFirstOrThrow({ where: { clientId: subject } });
    expect(after.id).toBe(before.id);
    expect(after.text).toContain('40 min');
    expect(after.status).toBe('READ');
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
  });

  it('unkeyed, it writes freely — a one-off invents no key for itself', async () => {
    for (const n of [1, 2]) {
      await notice.raise({
        toIds: [vikram.user.id],
        kind: 'LEAVE',
        text: `Leave decision ${n}.`,
        clientId: subject,
      });
    }
    /* Postgres does not collide nulls, which is what keeps the leave flow
       writing as it always did without a key of its own */
    expect(await prisma.notice.count({ where: { clientId: subject } })).toBe(2);
  });
});
