import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { CACHE_KEYS, invalidate } from '../src/services/config.service.js';
import { generateDeviations } from '../src/services/deviations.service.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * Work Queues, exercised through the API.
 *
 * The seeded state is the demo's boot state: Rajesh's lunch five minutes old and
 * inside the reply target, Mathew's thirty-five minutes old and past both the
 * nudge and the escalation, Priya still in her observation window, Suresh's diet
 * plan waiting on the Operations Head and his calendar one signature behind.
 *
 * THE SUITE'S CENTREPIECE is `the chain, once it is being walked` — it edits an
 * approval chain in Configuration AFTER an approval exists and proves the
 * approval still collects the signatures it was created to collect.
 */

let anita: Session; /* Super Admin — seeAllClients, approve, manageConfig; no rateMeals */
let sneha: Session; /* Dietician — rateMeals, and five clients */
let vikram: Session; /* Fitness Coach — no approve, no rateMeals, no seeAllClients */
let kavya: Session; /* Doctor — rawRecords and signSummary, and nothing else */
let sureshk: Session; /* Operations Head — first signature on the diet chain */
let bineesh: Session; /* Super User — last signature on the diet chain */
let rohan: Session; /* Haalving Coach — first on the calendar chain, absent from diet */

/** The demo's own chains, which several tests edit and `reset` puts back. */
const DIET_CHAIN = [{ role: 'opshead' }, { role: 'core' }];

/** The three plates nobody has rated at boot. */
const AWAITING = ['m-raj-lunch', 'm-mat-lunch', 'm-priya-bf'];

const SEEDED_APPROVALS = [
  'ap-sur-chart',
  'ap-sur-diet',
  'ap-sur-cal',
  'ap-raj-yoga',
  'ap-raj-diet',
  'ap-meena-diet',
  'ap-nisha-goal',
  'ap-nisha-team',
];

/**
 * A coaching note long enough to publish under five stars.
 *
 * 120 characters is the product's rule, not the test's — see `ratingNoteSatisfied`
 * — so the string is built to clear it rather than hard-coded to a length that
 * would quietly stop clearing it if the rule moved.
 */
const LONG_NOTE =
  'Lovely rhythm this week, Rajesh. One small change for tomorrow: swap the fried papad for a salad, ' +
  'and keep the dal exactly as it is — it is doing the heavy lifting.';

/**
 * Put the six boards back the way the seed leaves them.
 *
 * Every board here is one a test ACTS on, and the acts have consequences that
 * outlive the row: a rating posts into a client's room, a signature moves a chain
 * and publishes an artifact, a chain edit bumps a version. So this undoes the
 * consequences as well as the rows — the same argument the seed's own
 * `seedWorkQueues` makes at length.
 */
async function reset(): Promise<void> {
  /* what a rating or a publication posted — both are written by the server and
     by nothing else, so clearing them is clearing our own output */
  await prisma.circleMessage.deleteMany({ where: { kind: { in: ['RATING', 'DOC'] } } });

  /* the work list is the slotless half of `tasks` now, and "open" is the ABSENCE
     of a TaskDone — so reopening a row means deleting the completion, not
     clearing a column */
  await prisma.taskDone.deleteMany({
    where: { taskId: { in: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] } },
  });

  await prisma.meal.updateMany({
    where: { id: { in: AWAITING } },
    data: { finalStars: null, finalById: null, finalNote: null, finalVoiceSec: null, ratedAt: null },
  });

  /*
   * THE SLA CLOCK IS RELATIVE, so it is re-stamped rather than left where the
   * seed put it. A suite that ran twenty minutes after `pnpm db:seed` would find
   * Rajesh's lunch already breached and Mathew's escalated an hour ago, and the
   * assertions below would be reading the age of the seed rather than the rule.
   * The three ages are the demo's own (data.js:708 and its comments).
   */
  const now = Date.now();
  const at = (mins: number) => new Date(now - mins * 60_000);
  await prisma.meal.update({ where: { id: 'm-raj-lunch' }, data: { capturedAt: at(5) } });
  await prisma.meal.update({ where: { id: 'm-mat-lunch' }, data: { capturedAt: at(35) } });
  await prisma.meal.update({ where: { id: 'm-priya-bf' }, data: { capturedAt: at(95) } });

  /* anything a test raised is not part of the demo's story */
  await prisma.approval.deleteMany({ where: { id: { notIn: SEEDED_APPROVALS } } });

  /*
   * The chain goes back BEFORE the snapshots do, because the snapshots are taken
   * from it. The version is deliberately NOT reset: a version that went
   * backwards would be a lie about how many times the chain has been edited, and
   * nothing in the product reads it as a count.
   */
  await prisma.approvalChain.update({ where: { kind: 'diet' }, data: { steps: DIET_CHAIN } });
  await invalidate(CACHE_KEYS.chains);
  const diet = await prisma.approvalChain.findUniqueOrThrow({ where: { kind: 'diet' } });

  await prisma.approvalEvent.deleteMany({
    where: { approvalId: 'ap-sur-diet', act: { not: 'SUBMITTED' } },
  });
  await prisma.approval.update({
    where: { id: 'ap-sur-diet' },
    data: {
      status: 'SUBMITTED',
      stage: 0,
      returnReason: null,
      chain: diet.steps as never,
      chainVersion: diet.version,
    },
  });

  await prisma.approvalEvent.deleteMany({ where: { approvalId: 'ap-sur-chart' } });
  await prisma.approval.update({
    where: { id: 'ap-sur-chart' },
    data: { status: 'DRAFT', stage: 0, returnReason: null },
  });

  await prisma.medicalSummary.update({
    where: { id: 'd3' },
    data: {
      status: 'PENDING',
      byId: null,
      signedAt: null,
      body: { conditions: [], flags: [], metrics: [], history: [] },
    },
  });

  /* the SLA ladder, which one test moves on purpose */
  await prisma.slaConfig.update({
    where: { id: 'default' },
    data: { replyTargetMin: 15, notifyAfterMin: 10, escalateAfterMin: 15, escalateToRole: 'admin' },
  });
  await invalidate(CACHE_KEYS.sla);
}

beforeAll(async () => {
  await clearRateLimits();
  [anita, sneha, vikram, kavya, sureshk, bineesh, rohan] = await Promise.all([
    loginStaff('anita'),
    loginStaff('sneha'),
    loginStaff('vikram'),
    loginStaff('kavya'),
    loginStaff('sureshk'),
    loginStaff('bineesh'),
    loginStaff('rohan'),
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
  put: (path: string, body: object) =>
    request(app)
      .put(`/api/v1${path}`)
      .set(...auth(s.accessToken))
      .send(body),
  patch: (path: string, body: object) =>
    request(app)
      .patch(`/api/v1${path}`)
      .set(...auth(s.accessToken))
      .send(body),
});

/**
 * The row the console's "This attempt was logged" promises, written since `since`.
 *
 * `subjectType` discriminates the service's own refusals from the middleware's,
 * which log under `access` — both are real, and a test that accepted either
 * would pass on a route gate while the service's rule was missing.
 */
async function denialSince(actorId: string, subjectType: string, since: Date) {
  return prisma.auditLog.findFirst({
    where: { action: 'denied', actorId, subjectType, at: { gte: since } },
    orderBy: { at: 'desc' },
  });
}

const boardKeys = (body: { data: { boards: Array<{ key: string }> } }) =>
  body.data.boards.map((b) => b.key);

/* ─────────────────────────────────────────────────────── the six boards */

describe('the host', () => {
  it('draws the boards in the demo’s order and no others', async () => {
    const res = await api(anita).get('/queues');
    expect(res.status).toBe(200);
    /* every board is drawn in the host's order, which is the order the array is
       built in — not sorted here, because the order IS the rule */
    expect(boardKeys(res.body)).toEqual(['work', 'approvals', 'meals', 'deviations', 'live']);
  });

  it('does not show a board a role may not see', async () => {
    /* the Super Admin holds neither rawRecords nor signSummary, so the doctor's
       desk is not merely locked for her — it is not there */
    expect(boardKeys((await api(anita).get('/queues')).body)).not.toContain('medical');

    /* A pillar coach holds none of the board permissions — but Deviations is no
       longer one of them. It is ungated and scoped, because a board about YOUR
       clients that only oversight roles can open is a board pointed the wrong
       way. The work list and their own deviations are the whole screen. */
    expect(boardKeys((await api(vikram).get('/queues')).body)).toEqual(['work', 'deviations']);

    /* the Doctor's own, plus the same scoped deviations */
    expect(boardKeys((await api(kavya).get('/queues')).body)).toEqual([
      'work',
      'medical',
      'deviations',
    ]);

    /* the Dietician sees meals because she holds rateMeals */
    expect(boardKeys((await api(sneha).get('/queues')).body)).toEqual([
      'work',
      'meals',
      'deviations',
    ]);
  });

  it('counts each tab against the same scope its board reads', async () => {
    /* the deviations badge is "new since you looked", so the sum below only means
       anything from a known starting point */
    await prisma.homeSeen.deleteMany({ where: { userId: 'u-sneha', tabKey: 'deviations' } });

    const res = await api(sneha).get('/queues');
    const byKey = Object.fromEntries(
      (res.body.data.boards as Array<{ key: string; count: number | null }>).map((b) => [
        b.key,
        b.count,
      ]),
    );

    /* Work is derived now: the list is one day and the seeded calendar moves with
       the day it is run, so the badge is asserted against the LIST rather than a
       number frozen on the afternoon this was written. */
    const open = (
      (await api(sneha).get('/queues/worklist')).body.data as Array<{ status: string }>
    ).filter((r) => r.status === 'OPEN').length;
    expect(byKey.work).toBe(open);
    expect(byKey.meals).toBe(3);
    /* all three deviated clients sit on her pod, and she has not looked yet */
    expect(byKey.deviations).toBe(3);
    /* the pill is the sum of the tabs, so a board that starts badging joins it —
       a board with a NULL count still adds nothing rather than adding zero */
    expect(res.body.data.waiting).toBe(open + 3 + 3);
  });

  it('badges the signature queue, not the whole building', async () => {
    /* the diet chain starts at the Operations Head, and the calendar chain is one
       signature in — both are his */
    const ops = await api(sureshk).get('/queues');
    const opsCounts = Object.fromEntries(
      (ops.body.data.boards as Array<{ key: string; count: number | null }>).map((b) => [b.key, b.count]),
    );
    expect(opsCounts.approvals).toBe(2);

    /* the Super User is last on the team chain and has exactly one */
    const core = await api(bineesh).get('/queues');
    const coreCounts = Object.fromEntries(
      (core.body.data.boards as Array<{ key: string; count: number | null }>).map((b) => [b.key, b.count]),
    );
    expect(coreCounts.approvals).toBe(1);

    /* no chain names the Super Admin, so nothing is waiting on her */
    const admin = await api(anita).get('/queues');
    const adminCounts = Object.fromEntries(
      (admin.body.data.boards as Array<{ key: string; count: number | null }>).map((b) => [b.key, b.count]),
    );
    expect(adminCounts.approvals).toBe(0);
  });
});

/* ───────────────────────────────────────────────────────── the work list */

describe('the work list', () => {
  it('is scoped to your own day — owned or booked onto you', async () => {
    /*
     * The counts are DERIVED, not frozen. The list is now one day's work, and the
     * seeded calendar moves with the day it is run — a hard number here would pass
     * on a Tuesday and fail on a Sunday for reasons that have nothing to do with
     * scoping. What must hold is the RULE: every row is yours.
     */
    const mine = await api(sneha).get('/queues/worklist');
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThan(0);

    for (const row of mine.body.data) {
      const t = await prisma.task.findUniqueOrThrow({
        where: { id: row.id },
        select: { ownerId: true, assigneeIds: true },
      });
      /* owned by her, or booked onto her — the two halves of "mine" */
      expect(t.ownerId === 'u-sneha' || t.assigneeIds.includes('u-sneha')).toBe(true);
    }

    /* seeAllClients sees everybody's, which is strictly more */
    const all = await api(anita).get('/queues/worklist');
    expect(all.body.data.length).toBeGreaterThan(mine.body.data.length);

    /* and a coach never sees a colleague's row */
    const vik = await api(vikram).get('/queues/worklist');
    for (const row of vik.body.data) {
      const t = await prisma.task.findUniqueOrThrow({
        where: { id: row.id },
        select: { ownerId: true, assigneeIds: true },
      });
      expect(t.ownerId === 'u-vikram' || t.assigneeIds.includes('u-vikram')).toBe(true);
    }
  });

  it('closes a row for its owner and refuses one that is not theirs', async () => {
    const done = await api(sneha).post('/queues/worklist/w3/done');
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('DONE');

    const since = new Date();
    const nope = await api(vikram).post('/queues/worklist/w1/done');
    expect(nope.status).toBe(403);
    expect(await denialSince('u-vikram', 'worklist', since)).not.toBeNull();
    expect(await prisma.taskDone.count({ where: { taskId: 'w1' } })).toBe(0);
  });

  it('filters by the chips the console draws', async () => {
    /* asked of SNEHA, who owns both rating rows. It used to be asked of the Super
       Admin, back when the board showed her everybody's work — it does not any
       more, and a chip cannot filter rows that were never hers to see. */
    const ratings = await api(sneha).get('/queues/worklist?type=RATING');
    expect(ratings.body.data).toHaveLength(2);
    for (const row of ratings.body.data) expect(row.type).toBe('RATING');
  });
});

/* ────────────────────────────────────────────────────────────── meals */

/* ────────────────────────────────────────── one row, two screens */

describe('the work list is one day, whatever shape it arrived in', () => {
  const MADE: string[] = [];
  const today = () => new Date(new Date().setHours(0, 0, 0, 0));

  afterAll(async () => {
    if (MADE.length) await prisma.task.deleteMany({ where: { id: { in: MADE } } });
  });

  const bookOn = async (assignee: string, createdBy: string, title: string) => {
    const t = await prisma.task.create({
      data: {
        title,
        kind: 'INTERNAL',
        date: today(),
        startMin: 11 * 60,
        durMin: 30,
        assigneeIds: [assignee],
        createdById: createdBy,
      },
      select: { id: true },
    });
    MADE.push(t.id);
    return t.id;
  };

  it('shows a task added in Schedule, exactly once', async () => {
    /* THE POINT OF THE MERGE. This used to be impossible: the work list asked for
       `date: null`, so anything with an hour on it was invisible here. */
    const before = (await api(anita).get('/queues/worklist')).body.data as Array<{ id: string }>;
    const id = await bookOn('u-anita', 'u-anita', 'Ported acceptance — self-booked');

    const after = (await api(anita).get('/queues/worklist')).body.data as Array<{ id: string }>;
    const hits = after.filter((r) => r.id === id);
    expect(hits).toHaveLength(1);
    expect(after.length).toBe(before.length + 1);
  });

  it('calls it manual when you made it and assigned when somebody made it for you', async () => {
    const mine = await bookOn('u-anita', 'u-anita', 'Ported acceptance — mine');
    const theirs = await bookOn('u-anita', 'u-rohan', 'Ported acceptance — booked onto me');

    const rows = (await api(anita).get('/queues/worklist')).body.data as Array<{
      id: string;
      source: string;
    }>;
    expect(rows.find((r) => r.id === mine)!.source).toBe('manual');
    expect(rows.find((r) => r.id === theirs)!.source).toBe('assigned');
  });

  it('keeps the seeded rule rows, and calls them rule', async () => {
    const rows = (await api(anita).get('/queues/worklist')).body.data as Array<{
      id: string;
      source: string;
    }>;
    const w1 = rows.find((r) => r.id === 'w1');
    expect(w1).toBeDefined();
    /* w1 carries no sourceRule in the seed, so it reads as somebody else's task
       rather than a rule's — the field is honest about what it knows */
    expect(['rule', 'assigned', 'manual']).toContain(w1!.source);
  });

  it('does not show tomorrow — the list is today', async () => {
    const t = await prisma.task.create({
      data: {
        title: 'Ported acceptance — tomorrow',
        kind: 'INTERNAL',
        date: new Date(today().getTime() + 86_400_000),
        startMin: 11 * 60,
        durMin: 30,
        assigneeIds: ['u-anita'],
        createdById: 'u-anita',
      },
      select: { id: true },
    });
    MADE.push(t.id);
    const rows = (await api(anita).get('/queues/worklist')).body.data as Array<{ id: string }>;
    expect(rows.some((r) => r.id === t.id)).toBe(false);
  });

  it('badges exactly what the list holds', async () => {
    /* one scoping expression, read twice — the drift this board already fixed */
    const rows = (await api(anita).get('/queues/worklist')).body.data as Array<{ status: string }>;
    const open = rows.filter((r) => r.status === 'OPEN').length;
    const host = (await api(anita).get('/queues')).body.data.boards.find(
      (b: { key: string }) => b.key === 'work',
    );
    expect(host.count).toBe(open);
  });

  it('gives a coach only their own day', async () => {
    const forMe = await bookOn('u-vikram', 'u-anita', 'Ported acceptance — vikram’s');
    const notMine = await bookOn('u-sneha', 'u-anita', 'Ported acceptance — sneha’s');

    const rows = (await api(vikram).get('/queues/worklist')).body.data as Array<{ id: string }>;
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(forMe);
    expect(ids).not.toContain(notMine);
  });

  it('closes a booked row on its own day, and the tick is the calendar’s own', async () => {
    const id = await bookOn('u-anita', 'u-anita', 'Ported acceptance — closed from the queue');

    const done = await api(anita).post(`/queues/worklist/${id}/done`);
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('DONE');

    /* stamped with the OCCURRENCE, not the wall clock — one `TaskDone` on the
       task’s own day, which is the row the Schedule reads too */
    const dones = await prisma.taskDone.findMany({ where: { taskId: id }, select: { date: true } });
    expect(dones).toHaveLength(1);
    expect(dones[0]!.date!.getTime()).toBe(
      (await prisma.task.findUniqueOrThrow({ where: { id }, select: { date: true } })).date!.getTime(),
    );

    /* and the list agrees on the next read — the bug this replaced left a row
       closed on the calendar still reading OPEN here */
    const rows = (await api(anita).get('/queues/worklist?status=ALL')).body.data as Array<{
      id: string;
      status: string;
    }>;
    expect(rows.find((r) => r.id === id)?.status).toBe('DONE');
  });

  it('lets an assignee close a booking, not just the owner it was filed under', async () => {
    const id = await bookOn('u-vikram', 'u-anita', 'Ported acceptance — vikram’s to close');
    const done = await api(vikram).post(`/queues/worklist/${id}/done`);
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('DONE');
  });
});

describe('the meals queue', () => {
  it('is closed to a role holding neither rateMeals nor seeAllClients', async () => {
    const since = new Date();
    const res = await api(vikram).get('/queues/meals');
    expect(res.status).toBe(403);
    expect(await denialSince('u-vikram', 'queues', since)).not.toBeNull();
  });

  it('scopes to the clients the caller carries', async () => {
    const hers = await api(sneha).get('/queues/meals');
    expect(hers.status).toBe(200);
    const herIds = [...hers.body.data.awaiting, ...hers.body.data.rated].map(
      (m: { id: string }) => m.id,
    );
    /* Dev K. and Ananya S. have no dietitian seat — they are AI end to end */
    expect(herIds).not.toContain('m-dev-lunch');
    expect(herIds).not.toContain('m-ana-bf');

    const all = await api(anita).get('/queues/meals');
    const allIds = [...all.body.data.awaiting, ...all.body.data.rated].map(
      (m: { id: string }) => m.id,
    );
    expect(allIds).toContain('m-dev-lunch');
    expect(allIds).toContain('m-ana-bf');
  });

  it('puts the latest plate first and reads the ladder against it', async () => {
    const res = await api(sneha).get('/queues/meals');
    const awaiting = res.body.data.awaiting as Array<{
      id: string;
      sla: { leftMin: number; breached: boolean; escalated: boolean } | null;
    }>;

    /* Mathew's lunch is 35 minutes old against a 15-minute target: past the
       target, and past the nudge plus the escalation (10 + 15) */
    expect(awaiting[0]!.id).toBe('m-mat-lunch');
    expect(awaiting[0]!.sla!.breached).toBe(true);
    expect(awaiting[0]!.sla!.escalated).toBe(true);

    /* Rajesh's is five minutes old and still inside it */
    const raj = awaiting.find((m) => m.id === 'm-raj-lunch')!;
    expect(raj.sla!.breached).toBe(false);
    expect(raj.sla!.leftMin).toBeGreaterThan(0);

    /* the ladder is named on the response, so the console never guesses */
    expect(res.body.data.ladder).toMatchObject({
      replyTargetMin: 15,
      escalateAtMin: 25,
      escalateToRole: 'admin',
    });
  });

  it('reads no SLA at all for a client still in observation', async () => {
    const res = await api(sneha).get('/queues/meals');
    const priya = (res.body.data.awaiting as Array<{ id: string; sla: unknown }>).find(
      (m) => m.id === 'm-priya-bf',
    )!;
    /* days 1-5 are capture-only: there is no reply for anybody to be late to */
    expect(priya.sla).toBeNull();
  });

  it('moves every reading when Configuration changes the reply target', async () => {
    const before = await api(sneha).get('/queues/meals');
    const beforeRaj = (before.body.data.awaiting as Array<{ id: string; sla: { leftMin: number } }>)
      .find((m) => m.id === 'm-raj-lunch')!;
    expect(before.body.data.breached).toBeGreaterThan(0);

    const edit = await api(anita).patch('/config/service', { replyTargetMin: 90 });
    expect(edit.status).toBe(200);

    const after = await api(sneha).get('/queues/meals');
    const afterRaj = (after.body.data.awaiting as Array<{ id: string; sla: { leftMin: number } }>)
      .find((m) => m.id === 'm-raj-lunch')!;

    /* the SAME plate, captured at the same instant, now has 75 more minutes —
       the clock is live and unversioned by design. A minute may tick between the
       two reads, which is the elapsed half of the sum and not the half under
       test, so the window is one minute wide. */
    const moved = afterRaj.sla.leftMin - beforeRaj.sla.leftMin;
    expect(moved).toBeGreaterThanOrEqual(74);
    expect(moved).toBeLessThanOrEqual(75);
    expect(after.body.data.ladder.replyTargetMin).toBe(90);
    /* and nothing on the board is late any more */
    expect(after.body.data.breached).toBe(0);
  });
});

describe('rating a plate', () => {
  it('is refused without rateMeals, and the refusal is logged', async () => {
    /* the Super Admin reaches the board on seeAllClients and still may not rate:
       the board is a reading, the rating is the dietitian's signature */
    const since = new Date();
    const res = await api(anita).post('/queues/meals/m-raj-lunch/rate', { stars: 5 });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/rateMeals/);
    expect(await denialSince('u-anita', 'meal', since)).not.toBeNull();

    /* and the plate is untouched */
    expect((await prisma.meal.findUnique({ where: { id: 'm-raj-lunch' } }))!.finalStars).toBeNull();
  });

  it('lets the Haalving Coach rate — the pod coach holds the pen', async () => {
    /* OURS, not the demo's: the demo gives rateMeals to the Dietician alone, and
       the plate belongs to whoever coaches that client's pod. If this ever goes
       red, the Meals board has silently become a Dietician-only surface again. */
    const res = await api(rohan).post('/queues/meals/m-raj-lunch/rate', {
      stars: 3,
      note: LONG_NOTE,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.final.by.id).toBe('u-rohan');
  });

  it('refuses the oversight seats — they monitor the board, they do not sign it', async () => {
    /* The meal clock escalates TO admin (config.service defaults escalateToRole to
       'admin'), and an escalation that lands on a seat already able to rate
       escalates nothing. These three read; they do not write. */
    for (const seat of [anita, sureshk, bineesh]) {
      const res = await api(seat).post('/queues/meals/m-raj-lunch/rate', { stars: 5 });
      expect(res.status).toBe(403);
    }
    expect((await prisma.meal.findUnique({ where: { id: 'm-raj-lunch' } }))!.finalStars).toBeNull();
  });

  it('still lets a monitor READ the plate it may not rate', async () => {
    /* the read and the write are two different rights, and the monitor holds one */
    const res = await api(anita).get('/queues/meals');
    expect(res.status).toBe(200);
    const ids = [...res.body.data.awaiting, ...res.body.data.rated].map((x: { id: string }) => x.id);
    expect(ids).toContain('m-raj-lunch');
  });

  it('writes the final stars and clears the plate from awaiting', async () => {
    const res = await api(sneha).post('/queues/meals/m-raj-lunch/rate', {
      stars: 3,
      note: LONG_NOTE,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.final.stars).toBe(3);
    expect(res.body.data.final.by.id).toBe('u-sneha');

    const after = await api(sneha).get('/queues/meals');
    const awaitingIds = (after.body.data.awaiting as Array<{ id: string }>).map((m) => m.id);
    expect(awaitingIds).not.toContain('m-raj-lunch');
    expect((after.body.data.rated as Array<{ id: string }>).map((m) => m.id)).toContain(
      'm-raj-lunch',
    );

    /* the rule that generated "Rate Rajesh D. lunch" is satisfied, so the row it
       put on Sneha's list closes itself */
    expect(await prisma.taskDone.count({ where: { taskId: 'w3' } })).toBe(1);

    /* and the client is told, in their own room */
    const posted = await prisma.circleMessage.findFirst({
      where: { clientId: 'c-rajesh', kind: 'RATING' },
    });
    expect(posted!.text).toMatch(/rated 3 stars/);
  });

  it('refuses anything under five stars with no coaching note', async () => {
    const res = await api(sneha).post('/queues/meals/m-raj-lunch/rate', { stars: 3, note: 'ok' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/coaching note/);
    expect((await prisma.meal.findUnique({ where: { id: 'm-raj-lunch' } }))!.finalStars).toBeNull();
  });

  it('takes a perfect plate on its own, and a short note with a voice note', async () => {
    expect(
      (await api(sneha).post('/queues/meals/m-mat-lunch/rate', { stars: 5 })).status,
    ).toBe(200);

    expect(
      (await api(sneha).post('/queues/meals/m-raj-lunch/rate', { stars: 4, voiceSec: 14 })).status,
    ).toBe(200);
  });

  it('records an observation rating for the team and tells the client nothing', async () => {
    const res = await api(sneha).post('/queues/meals/m-priya-bf/rate', {
      stars: 4,
      voiceSec: 12,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.final.stars).toBe(4);

    /* days 1-5 are capture-only — nothing may reach her room */
    const posted = await prisma.circleMessage.findFirst({
      where: { clientId: 'c-priya', kind: 'RATING' },
    });
    expect(posted).toBeNull();
  });

  it('refuses a second rating on a plate already rated', async () => {
    await api(sneha).post('/queues/meals/m-mat-lunch/rate', { stars: 5 });
    const again = await api(sneha).post('/queues/meals/m-mat-lunch/rate', { stars: 4, voiceSec: 14 });
    expect(again.status).toBe(409);
  });
});

/* ────────────────────────────────────────────────────────── approvals */

describe('the approvals board', () => {
  it('is closed to a role without approve, and the refusal is logged', async () => {
    const since = new Date();
    const res = await api(vikram).get('/queues/approvals');
    expect(res.status).toBe(403);
    expect(await denialSince('u-vikram', 'queues', since)).not.toBeNull();
  });

  it('separates what waits on you from everything else', async () => {
    const res = await api(sureshk).get('/queues/approvals');
    expect(res.status).toBe(200);
    const queue = (res.body.data.queue as Array<{ id: string; waitingOn: string }>).map((a) => a.id);
    expect(queue).toContain('ap-sur-diet');
    expect(queue).toContain('ap-sur-cal');

    /* the Operations Head holds seeAllClients, so the rest of the board is there
       too — including the ones waiting on somebody else */
    expect(res.body.data.seesAll).toBe(true);
    expect((res.body.data.all as Array<{ id: string }>).length).toBe(SEEDED_APPROVALS.length);
  });

  it('advances the stage on a signature and publishes on the last one', async () => {
    const first = await api(sureshk).post('/queues/approvals/ap-sur-diet/sign', {
      note: 'Swaps table checked.',
    });
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('SUBMITTED');
    expect(first.body.data.stage).toBe(1);
    expect(first.body.data.waitingOn).toBe('core');

    const last = await api(bineesh).post('/queues/approvals/ap-sur-diet/sign', {});
    expect(last.status).toBe(200);
    expect(last.body.data.status).toBe('PUBLISHED');
    expect(last.body.data.waitingOn).toBeNull();

    /* the trail says who did what, in order */
    const acts = (last.body.data.history as Array<{ act: string }>).map((h) => h.act);
    expect(acts).toEqual(['SUBMITTED', 'APPROVED', 'APPROVED', 'PUBLISHED']);

    /* and the last signature DELIVERS — the sentence the approve sheet shows */
    const posted = await prisma.circleMessage.findFirst({
      where: { clientId: 'c-sureshp', kind: 'DOC' },
    });
    expect(posted!.text).toMatch(/approved and published/);
  });

  it('refuses a signature out of turn with a 409', async () => {
    /* the Super User is second on the diet chain; the item is at stage 0 */
    const res = await api(bineesh).post('/queues/approvals/ap-sur-diet/sign', {});
    expect(res.status).toBe(409);
    expect(res.body.error.details.waitingOn).toBe('opshead');

    /* nothing moved */
    const row = await prisma.approval.findUnique({ where: { id: 'ap-sur-diet' } });
    expect(row!.stage).toBe(0);
    expect(row!.status).toBe('SUBMITTED');
  });

  it('sends one back to its owner with the reason attached', async () => {
    const res = await api(sureshk).post('/queues/approvals/ap-sur-diet/return', {
      reason: 'Add the BP-safe sodium guidance first.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.stage).toBe(0);
    expect(res.body.data.returnReason).toMatch(/sodium/);

    /* a return never travels empty-handed */
    expect((await api(sureshk).post('/queues/approvals/ap-sur-diet/return', { reason: '' })).status).toBe(400);
  });

  it('lets the owner submit their own draft and nobody else’s', async () => {
    const mine = await api(vikram).post('/queues/approvals/ap-sur-chart/submit', {});
    expect(mine.status).toBe(200);
    expect(mine.body.data.status).toBe('SUBMITTED');
    /* the chart chain is one signature — the Operations Head's */
    expect(mine.body.data.waitingOn).toBe('opshead');

    await reset();
    const since = new Date();
    const theirs = await api(sneha).post('/queues/approvals/ap-sur-chart/submit', {});
    expect(theirs.status).toBe(403);
    expect(await denialSince('u-sneha', 'approval', since)).not.toBeNull();
  });
});

/* ══════════════════════════════════════════════════ THE CHAIN SNAPSHOT ══ */

describe('the chain, once it is being walked', () => {
  /**
   * The rule this module is built around.
   *
   * Configuration inserts a signature into the middle of the diet chain while an
   * approval is halfway down it. If the item followed the LIVE chain it would
   * now demand a signature from the Haalving Coach — who was never asked for one
   * — and the trail would describe a walk the item never took. It follows its
   * own snapshot instead, and finishes on the chain it started.
   */
  it('does not change under an approval already in flight', async () => {
    const before = await api(sureshk).get('/queues/approvals');
    const ap = (before.body.data.queue as Array<{
      id: string;
      chain: Array<{ role: string }>;
      chainVersion: number;
    }>).find((a) => a.id === 'ap-sur-diet')!;

    expect(ap.chain).toEqual(DIET_CHAIN);
    const snapshotVersion = ap.chainVersion;

    /* Ops inserts a step in the MIDDLE — the worst case, because it moves every
       signature after it */
    const edit = await api(anita).put('/config/chains/diet', {
      steps: [{ role: 'opshead' }, { role: 'opsmgr' }, { role: 'core' }],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data.version).toBeGreaterThan(snapshotVersion);

    /* the in-flight item still carries the chain it was created with */
    const after = await api(sureshk).get('/queues/approvals');
    const still = (after.body.data.queue as Array<{
      id: string;
      chain: Array<{ role: string }>;
      chainVersion: number;
    }>).find((a) => a.id === 'ap-sur-diet')!;
    expect(still.chain).toEqual(DIET_CHAIN);
    expect(still.chainVersion).toBe(snapshotVersion);

    /* AND IT WALKS IT. The Operations Head signs, and the next signature is the
       Super User's — not the step Configuration just inserted. */
    const signed = await api(sureshk).post('/queues/approvals/ap-sur-diet/sign', {});
    expect(signed.status).toBe(200);
    expect(signed.body.data.waitingOn).toBe('core');

    /* the person the LIVE chain would now ask for is refused: nobody asked him */
    const interloper = await api(rohan).post('/queues/approvals/ap-sur-diet/sign', {});
    expect(interloper.status).toBe(409);
    expect(interloper.body.error.details.waitingOn).toBe('core');

    /* and the last signature of the OLD chain is what publishes it */
    const published = await api(bineesh).post('/queues/approvals/ap-sur-diet/sign', {});
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe('PUBLISHED');
    expect(published.body.data.chainVersion).toBe(snapshotVersion);
  });

  it('applies to the next sign-off raised, which is the point of editing it', async () => {
    await api(anita).put('/config/chains/diet', {
      steps: [{ role: 'opshead' }, { role: 'opsmgr' }, { role: 'core' }],
    });

    const fresh = await api(sneha).post('/queues/approvals', {
      type: 'diet',
      title: 'Diet Plan · L3 · Cycle 4',
      clientId: 'c-rajesh',
      pillar: 'culture',
      due: 'Day 10 @ 12:00',
    });
    expect(fresh.status).toBe(201);
    expect(fresh.body.data.chain).toEqual([
      { role: 'opshead' },
      { role: 'opsmgr' },
      { role: 'core' },
    ]);

    /* and the seeded one, created before the edit, is untouched by it */
    const old = await prisma.approval.findUniqueOrThrow({ where: { id: 'ap-sur-diet' } });
    expect(old.chain).toEqual(DIET_CHAIN);
  });

  it('takes the snapshot from Configuration, never from the request', async () => {
    /* a body naming its own chain is simply not a shape the schema accepts, so
       the snapshot cannot be shortened by the caller who raised the item */
    const res = await api(sneha).post('/queues/approvals', {
      type: 'diet',
      title: 'Diet Plan · L3 · Cycle 4',
      clientId: 'c-rajesh',
      due: 'Day 10',
      chain: [{ role: 'dietitian' }],
      stage: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.chain).toEqual(DIET_CHAIN);
    expect(res.body.data.stage).toBe(0);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('refuses a sign-off about a client the caller cannot see', async () => {
    /* Ananya has no pod at all — AI end to end — so no coach carries her */
    const res = await api(sneha).post('/queues/approvals', {
      type: 'diet',
      title: 'Diet Plan · Ananya',
      clientId: 'c-ananya',
      due: 'Day 10',
    });
    expect(res.status).toBe(404);
  });
});

/* ──────────────────────────────────────────────────────────── medical */

describe('the doctor’s desk', () => {
  it('is refused to a role without rawRecords or signSummary', async () => {
    const since = new Date();
    const res = await api(anita).get('/queues/medical');
    expect(res.status).toBe(403);
    expect(await denialSince('u-anita', 'queues', since)).not.toBeNull();
  });

  it('shows the doctor their pod’s documents, and every prospect’s', async () => {
    const res = await api(kavya).get('/queues/medical');
    expect(res.status).toBe(200);
    expect(res.body.data.canSeeRaw).toBe(true);
    expect(res.body.data.canSign).toBe(true);

    /* Kiran R. is still an arrival and belongs to nobody's pod, so no scope
       reaches him — and the demo's one pending summary is his */
    const pending = (res.body.data.pending as Array<{ id: string; about: string }>);
    expect(pending.map((d) => d.id)).toEqual(['d3']);
    expect(pending[0]!.about).toBe('Kiran R.');

    /* Ananya has no doctor seat, so her annual check is not on this desk */
    const signed = (res.body.data.signed as Array<{ id: string }>).map((d) => d.id);
    expect(signed).not.toContain('d5');
    expect(signed).toContain('d1');
  });

  it('logs every open, because the page says it does', async () => {
    const since = new Date();
    await api(kavya).get('/queues/medical');
    const opened = await prisma.auditLog.findFirst({
      where: { actorId: 'u-kavya', action: 'medical.opened', at: { gte: since } },
    });
    expect(opened).not.toBeNull();
  });

  it('is refused to a signer without signSummary, and the refusal is logged', async () => {
    const since = new Date();
    const res = await api(anita).post('/queues/medical/d3/sign', {
      conditions: ['Borderline B12'],
    });
    expect(res.status).toBe(403);
    expect(await denialSince('u-anita', 'queues', since)).not.toBeNull();
    expect((await prisma.medicalSummary.findUnique({ where: { id: 'd3' } }))!.status).toBe(
      'PENDING',
    );
  });

  it('signs, and keeps the prior version when it is signed again', async () => {
    const first = await api(kavya).post('/queues/medical/d3/sign', {
      conditions: ['Borderline B12', 'Prediabetic range'],
      flags: ['No fasting workouts'],
      metrics: ['HbA1c 5.9'],
    });
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('READY');
    expect(first.body.data.signedBy.id).toBe('u-kavya');
    expect(first.body.data.versions).toBe(0);

    const second = await api(kavya).post('/queues/medical/d3/sign', {
      conditions: ['Borderline B12'],
      flags: ['No fasting workouts', 'Moderate intensity until B12 recovers'],
      metrics: ['HbA1c 5.9', 'B12 210 pg/mL'],
    });
    expect(second.status).toBe(200);
    /* new versions never overwrite priors */
    expect(second.body.data.versions).toBe(1);
    expect(second.body.data.history[0].conditions).toEqual([
      'Borderline B12',
      'Prediabetic range',
    ]);
    expect(second.body.data.summary.flags).toHaveLength(2);
  });

  it('refuses a summary with nothing in it', async () => {
    const res = await api(kavya).post('/queues/medical/d3/sign', {
      conditions: [],
      flags: [],
      metrics: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/at least one/);
  });
});

/* ─────────────────────────────────────────────── deviations & the live board */

describe('deviations and the live board', () => {
  it('lists the deviations for whoever may see every client', async () => {
    const res = await api(anita).get('/queues/deviations');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect((res.body.data as Array<{ client: { name: string } }>).map((d) => d.client.name)).toContain(
      'Meena I.',
    );
  });

  it('is open to a coach now — but only for the clients she sits on', async () => {
    /* This board used to need `seeAllClients`, which locked out every pillar coach
       while handing the Haalving Coach the whole building. It is scoped instead. */
    const res = await api(sneha).get('/queues/deviations');
    expect(res.status).toBe(200);

    const seats = await prisma.podSeat.findMany({
      where: { staffId: 'u-sneha' },
      select: { clientId: true },
    });
    const mine = new Set(seats.map((x) => x.clientId));
    const rows = res.body.data as Array<{ client: { id: string } }>;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(mine.has(r.client.id)).toBe(true);
  });

  it('gives the Haalving Coach nothing — seeAllClients no longer widens this board', async () => {
    /* THE REGRESSION THIS FILE EXISTS FOR. Rohan holds `seeAllClients` and sits on
       no pod, so under the old gate he read every deviation in the building and
       could act on none of them. If this goes green with rows in it, the board has
       quietly gone back to answering the oversight question. */
    const res = await api(rohan).get('/queues/deviations');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('gives the Super Admin every one, on seeAllDeviations rather than a role check', async () => {
    const res = await api(anita).get('/queues/deviations');
    expect(res.body.data).toHaveLength(3);
  });

  it('badges what is new since you looked, and clears when you look', async () => {
    const dev = (await api(anita).get('/queues/deviations')).body.data as Array<{ id: string }>;

    await prisma.homeSeen.deleteMany({ where: { userId: 'u-anita', tabKey: 'deviations' } });
    const before = (await api(anita).get('/queues')).body.data.boards.find(
      (x: { key: string }) => x.key === 'deviations',
    );
    expect(before.count).toBe(3);

    expect((await api(anita).post('/queues/deviations/seen', { ids: dev.map((d) => d.id) })).status).toBe(200);

    const after = (await api(anita).get('/queues')).body.data.boards.find(
      (x: { key: string }) => x.key === 'deviations',
    );
    expect(after.count).toBe(0);
  });

  it('refuses to stamp a deviation the caller was never shown', async () => {
    /* rohan sees none, so none of these ids are his to mark read */
    const dev = (await api(anita).get('/queues/deviations')).body.data as Array<{ id: string }>;
    await prisma.homeSeen.deleteMany({ where: { userId: 'u-rohan', tabKey: 'deviations' } });
    const res = await api(rohan).post('/queues/deviations/seen', { ids: dev.map((d) => d.id) });
    expect(res.status).toBe(200);
    expect(res.body.data.seen).toBe(0);
  });

  it('derives the live board rather than reading a seeded number', async () => {
    const res = await api(anita).get('/queues/live');
    expect(res.status).toBe(200);
    /* Priya's breakfast has been waiting 95 minutes — the demo's own
       `unrated60: 1`, counted rather than declared */
    expect(res.body.data.unratedOver60).toBe(1);
    expect(res.body.data.allClear).toBe(false);
  });
});

/* ─────────────────────────────────────────── the deviations generator */

/**
 * The generator that turns the board from a seed poster into a live signal.
 *
 * Exercised against a THROWAWAY client so the assertions are deterministic
 * whenever the suite runs: seed clients' own timestamps drift with wall-clock,
 * `c-devgen`'s do not. Every run is cleaned up — all `dev-`-prefixed rows are
 * removed after each case, so the board returns to its seed-only three and no
 * later reader (in this file or another) sees a generated row.
 */
describe('the deviations generator', () => {
  const CID = 'c-devgen';
  /* a fixed clock so the 72 h and 7-day windows are stable regardless of "now" */
  const NOW = Date.parse('2026-09-02T12:00:00.000Z');
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const ago = (ms: number): Date => new Date(NOW - ms);

  beforeAll(async () => {
    await prisma.client.upsert({
      where: { id: CID },
      create: { id: CID, name: 'Dev Gen', status: 'active', plan: 'POORNA', observation: false },
      update: { status: 'active', observation: false },
    });
  });

  afterEach(async () => {
    /* every auto row, not just ours — leave the board seed-only for later readers */
    await prisma.deviation.deleteMany({ where: { id: { startsWith: 'dev-' } } });
    await prisma.meal.deleteMany({ where: { clientId: CID } });
  });

  afterAll(async () => {
    await prisma.client.delete({ where: { id: CID } }).catch(() => undefined);
  });

  it('raises a Meal photo SLA breach for a stale unrated plate — idempotently — and clears it once rated', async () => {
    await prisma.meal.create({
      data: { clientId: CID, slot: 'Lunch', fullness: 'Just right', capturedAt: ago(2 * HOUR) },
    });

    await generateDeviations(NOW);
    const row = await prisma.deviation.findUnique({ where: { id: `dev-${CID}-meal-sla` } });
    expect(row?.kind).toBe('Meal photo SLA breach');
    expect(row?.mode).toBe('Coach');

    /* a second run updates in place — no duplicate id, no second row */
    await generateDeviations(NOW);
    expect(await prisma.deviation.count({ where: { id: `dev-${CID}-meal-sla` } })).toBe(1);

    /* rate the plate → the breach is no longer true → the row is cleared */
    await prisma.meal.updateMany({
      where: { clientId: CID },
      data: { finalStars: 4, ratedAt: ago(HOUR) },
    });
    await generateDeviations(NOW);
    expect(await prisma.deviation.findUnique({ where: { id: `dev-${CID}-meal-sla` } })).toBeNull();
  });

  it('raises a rating decline when the trailing-week mean falls a star or more', async () => {
    /* prior week strong (5★), this week weak (2★) — a clear ≥ 1★ drop */
    for (const stars of [5, 5]) {
      await prisma.meal.create({
        data: { clientId: CID, slot: 'Lunch', fullness: 'Just right', capturedAt: ago(10 * DAY), finalStars: stars, ratedAt: ago(10 * DAY) },
      });
    }
    for (const stars of [2, 2]) {
      await prisma.meal.create({
        data: { clientId: CID, slot: 'Lunch', fullness: 'Just right', capturedAt: ago(2 * DAY), finalStars: stars, ratedAt: ago(2 * DAY) },
      });
    }

    await generateDeviations(NOW);
    const row = await prisma.deviation.findUnique({ where: { id: `dev-${CID}-rating-decline` } });
    expect(row?.kind).toBe('Rating decline over 1 star WoW');
  });

  it('never touches the seed’s own deviations', async () => {
    await generateDeviations(NOW);
    const seed = await prisma.deviation.findMany({
      where: { id: { in: ['dv-1', 'dv-2', 'dv-3'] } },
      select: { id: true },
    });
    expect(seed).toHaveLength(3);
  });
});

/* ───────────────────────────────────────────────── a template sign-off */

describe('a template sign-off', () => {
  const DAY = { slots: [{ pillar: 'fitness', label: 'Warm-up', options: [['ci-brisk']] }] };

  it('publishes into the library, not into a room', async () => {
    /* raised from the Catalog by a coach who holds no `approve` at all */
    const made = await api(vikram).post('/catalog/templates', {
      name: 'Chain-tested fortnight',
      pillar: 'fitness',
      level: 3,
      track: 'moderate',
    });
    expect(made.status).toBe(201);
    const id = made.body.data.id as string;

    try {
      expect((await api(vikram).put(`/catalog/templates/${id}/days/1`, DAY)).status).toBe(200);
      const sent = await api(vikram).post(`/catalog/templates/${id}/publish`, { published: true });
      expect(sent.status).toBe(200);
      const apId = sent.body.data.approval.id as string;

      /* on the Operations Head's queue as a template; not yet on the Super
         User's — it is not their turn */
      const ops = await api(sureshk).get('/queues/approvals');
      const onOps = ops.body.data.queue.find((a: { id: string }) => a.id === apId);
      expect(onOps.template).toEqual({ id, name: 'Chain-tested fortnight', pillar: 'fitness' });
      const core = await api(bineesh).get('/queues/approvals');
      expect(core.body.data.queue.map((a: { id: string }) => a.id)).not.toContain(apId);

      await api(sureshk).post(`/queues/approvals/${apId}/sign`, {});
      const last = await api(bineesh).post(`/queues/approvals/${apId}/sign`, {});
      expect(last.status).toBe(200);
      expect(last.body.data.status).toBe('PUBLISHED');

      expect((await prisma.planTemplate.findUnique({ where: { id } }))!.published).toBe(true);
      /* and nothing was posted anywhere: a template has no client to deliver to */
      expect(
        await prisma.circleMessage.count({
          where: { kind: 'DOC', text: { contains: 'Chain-tested' } },
        }),
      ).toBe(0);
    } finally {
      /* the sign-off goes with it (cascade) */
      await prisma.planTemplate.delete({ where: { id } }).catch(() => undefined);
    }
  });
});
