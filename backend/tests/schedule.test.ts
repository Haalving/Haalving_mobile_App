import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { addDays, todayISO, weekdayOf } from '@haalving/shared';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * The Schedule, exercised through the API.
 *
 * The seeded week is written relative to the day the seed ran, so these tests
 * work in offsets from today rather than fixed dates — a suite pinned to
 * 2026-08-24 would pass once and rot.
 */

const here = dirname(fileURLToPath(import.meta.url));
const seeded = (
  JSON.parse(readFileSync(join(here, '../prisma/demo-seed.json'), 'utf8')) as {
    tasks: Array<{ id: string; allowOverlap: boolean }>;
  }
).tasks;

let anita: Session; /* Super Admin — allocate, seeAllClients */
let vikram: Session; /* Fitness Coach — neither: locked to his own lens */
let sneha: Session; /* Dietician */
let lakshmi: Session; /* Yoga Coach — the person NOT on the test task */
/* the booking rule's two sides: Rohan allocates but is not the Super Admin, and
   Suresh is another allocator — the one colleague Rohan may book. */
let rohan: Session;
let sureshk: Session;

const TODAY = todayISO();
const D = (n: number) => addDays(TODAY, n);

/**
 * The tests book into a window everybody involved actually works.
 *
 * Vikram keeps a SPLIT shift (06:00-10:00 and 17:00-21:00) and Sneha works
 * 07:00-15:00, so their only common ground is 07:00-10:00 — and NOBODY works
 * Sunday, which means a daily series that spans one is correctly refused on
 * hours. Both facts are the product behaving properly, and a fixture that ignored
 * them would be testing the engine's patience rather than its rules.
 *
 * So: everything anchors on the next MONDAY at 09:00, and recurring tests run
 * Monday to Thursday. Anchoring on a weekday rather than on "today" also stops
 * the suite passing or failing depending on which day of the week it is run.
 */
const MON = (() => {
  let d = TODAY;
  /* 1 = Monday, in the UTC reckoning shared/schedule.ts uses */
  while (weekdayOf(d) !== 1) d = addDays(d, 1);
  return d;
})();
const M = (n: number) => addDays(MON, n);
/** 09:00 — inside Vikram's morning window and Sneha's day, and clear of the
 *  seeded 08:00 session, which ends exactly as this begins. */
const AT = 9 * 60;

/** Tasks these tests create, cleaned up between runs. */
const MADE: string[] = [];

async function cleanup(): Promise<void> {
  if (MADE.length) {
    await prisma.task.deleteMany({ where: { id: { in: MADE } } });
    MADE.length = 0;
  }
  /* anything a test created without recording, plus every response/exception the
     seeded tasks picked up */
  await prisma.task.deleteMany({ where: { createdBy: { role: { not: 'admin' } } } });
  await prisma.taskResponse.deleteMany({});
  await prisma.taskProposal.deleteMany({});
  await prisma.taskDone.deleteMany({});
  await prisma.taskException.deleteMany({});

  /*
   * And put the seeded tasks' own permission back.
   *
   * The both-sides overlap test has to flip allowOverlap on a SEEDED booking to
   * prove rule 1 needs two consenting tasks — and without this the very next
   * test, which proves one side is not enough, inherited that permission and
   * passed for the wrong reason.
   */
  await prisma.task.updateMany({
    where: { id: { in: seeded.filter((t) => !t.allowOverlap).map((t) => t.id) } },
    data: { allowOverlap: false },
  });
}

beforeAll(async () => {
  await clearRateLimits();
  [anita, vikram, sneha, lakshmi, rohan, sureshk] = await Promise.all([
    loginStaff('anita'),
    loginStaff('vikram'),
    loginStaff('sneha'),
    loginStaff('lakshmi'),
    loginStaff('rohan'),
    loginStaff('sureshk'),
  ]);
});

afterAll(async () => {
  await cleanup();
  await closeConnections();
});

beforeEach(cleanup);

const api = (s: Session) => ({
  list: (q: string) => request(app).get(`/api/v1/schedule?${q}`).set(...auth(s.accessToken)),
  groups: () => request(app).get('/api/v1/schedule/groups').set(...auth(s.accessToken)),
  create: (body: object, dry = false) =>
    request(app)
      .post(`/api/v1/schedule/tasks${dry ? '?dryRun=1' : ''}`)
      .set(...auth(s.accessToken))
      .send(body),
  patch: (id: string, body: object) =>
    request(app)
      .patch(`/api/v1/schedule/tasks/${id}`)
      .set(...auth(s.accessToken))
      .send(body),
  post: (path: string, body?: object) =>
    request(app)
      .post(`/api/v1/schedule${path}`)
      .set(...auth(s.accessToken))
      .send(body ?? {}),
  del: (id: string, q: string) =>
    request(app).delete(`/api/v1/schedule/tasks/${id}?${q}`).set(...auth(s.accessToken)),
});

const week = `from=${D(0)}&to=${D(13)}`;

/** A task nobody else's hours or bookings collide with. */
const internal = (over: Partial<Record<string, unknown>> = {}) => ({
  title: 'Pod sync',
  kind: 'internal',
  date: MON,
  startMin: AT,
  durMin: 30,
  recurFreq: 'none',
  assigneeIds: ['u-vikram', 'u-sneha'],
  groupIds: [],
  allowOverlap: false,
  ...over,
});

/**
 * For the tests that move a task around the day.
 *
 * Anita works 09:00-18:00, so there is room to drag inside her day. The default
 * fixture cannot be dragged far: Vikram and Sneha only overlap 07:00-10:00, and
 * 14:00 falls in the gap between his morning and evening shifts.
 */
const movable = (over: Partial<Record<string, unknown>> = {}) =>
  internal({ assigneeIds: ['u-anita'], groupIds: [], ...over });

async function make(s: Session, body: object): Promise<string> {
  const res = await api(s).create(body);
  expect(res.status).toBe(201);
  MADE.push(res.body.data.id);
  return res.body.data.id as string;
}

/* ──────────────────────────────────────────────────────────── the lens */

describe('GET /schedule — the lens', () => {
  it('gives an allocator the whole team', async () => {
    const res = await api(anita).list(week);
    expect(res.status).toBe(200);
    expect(res.body.data.canWiden).toBe(true);
    expect(res.body.data.occurrences.length).toBeGreaterThan(0);
    /* more than one person's work is on it */
    const everyone = new Set(res.body.data.occurrences.flatMap((o: { people: string[] }) => o.people));
    expect(everyone.size).toBeGreaterThan(1);
  });

  it('locks a coach to himself even when he asks for somebody else', async () => {
    const res = await api(vikram).list(`${week}&people=u-anita`);
    expect(res.status).toBe(200);
    /* rule 5 is enforced on the SERVER: the answer is his own week, not an error */
    expect(res.body.data.lens).toEqual(['u-vikram']);
    expect(res.body.data.canWiden).toBe(false);
    for (const o of res.body.data.occurrences) {
      expect(o.people).toContain('u-vikram');
    }
  });

  it('keeps a task on every attendee’s grid — the lens is an OR', async () => {
    const id = await make(anita, internal());
    for (const who of [vikram, sneha]) {
      const res = await api(who).list(week);
      expect(res.body.data.occurrences.some((o: { taskId: string }) => o.taskId === id)).toBe(true);
    }
  });

  it('refuses a range longer than a fortnight', async () => {
    expect((await api(anita).list(`from=${D(0)}&to=${D(20)}`)).status).toBe(400);
  });
});

/* ────────────────────────────────────────────────────────── the groups */

describe('GET /schedule/groups', () => {
  it('has the eight role groups and one per pod', async () => {
    const res = await api(anita).groups();
    expect(res.status).toBe(200);
    const ids = res.body.data.map((g: { id: string }) => g.id);
    expect(ids.slice(0, 8)).toEqual([
      'g-all',
      'g-ops',
      'g-core',
      'g-doc',
      'g-diet',
      'g-fit',
      'g-yoga',
      'g-mind',
    ]);
    expect(ids.some((i: string) => i.startsWith('g-pod-'))).toBe(true);
  });

  it('resolves a pod group to that client’s current seats', async () => {
    const seats = await prisma.podSeat.findMany({
      where: { clientId: 'c-rajesh', staffId: { not: null } },
      select: { staffId: true },
    });
    const expected = new Set(seats.map((s) => s.staffId));

    const res = await api(anita).groups();
    const pod = res.body.data.find((g: { id: string }) => g.id === 'g-pod-c-rajesh');
    expect(new Set(pod.memberIds)).toEqual(expected);
  });

  it('creates one task whose people resolve to the pod', async () => {
    const id = await make(anita, internal({ assigneeIds: [], groupIds: ['g-pod-c-rajesh'] }));
    const res = await api(anita).list(week);
    const occ = res.body.data.occurrences.find((o: { taskId: string }) => o.taskId === id);

    const seats = await prisma.podSeat.findMany({
      where: { clientId: 'c-rajesh', staffId: { not: null } },
      select: { staffId: true },
    });
    expect(new Set(occ.people)).toEqual(new Set(seats.map((s) => s.staffId)));
    /* ONE row, however many people it resolves to */
    expect(await prisma.task.count({ where: { id } })).toBe(1);
  });
});

/* ─────────────────────────────────────────────────────── the conflicts */

describe('conflicts', () => {
  const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

  /**
   * Vikram's first seeded session of the week ON A DAY HE ACTUALLY WORKS.
   *
   * The day filter is not fussiness — it is what makes the two tests below test
   * what they say. `allowOverlap` waives a BUSY clash and deliberately does not
   * waive an off-day one, so a fixture that happened to pick Vikram's Sunday
   * session got a truthful 409 ("is off that day") where the test expected a
   * 201, and the suite failed one day in seven with nothing wrong.
   *
   * Reading his declared week rather than hard-coding a weekday keeps this
   * honest if the seed's hours change: the question the fixture asks is "a day
   * this person works", and that is the question `avail` answers.
   */
  async function vikramSession() {
    const vikram = await prisma.user.findUniqueOrThrow({
      where: { id: 'u-vikram' },
      select: { avail: true },
    });
    const avail = (vikram.avail ?? {}) as Record<string, unknown>;
    const worksOn = (dateISO: string) => {
      const [y, m, d] = dateISO.split('-').map(Number);
      const key = WEEKDAY[new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()];
      const windows = key ? avail[key] : null;
      return Array.isArray(windows) && windows.length > 0;
    };

    const res = await api(anita).list(week);
    /*
     * Only a session at or after 07:00. The seed carries three client sessions at
     * 06:00 — the demo's own data, which its grid clips because the visible day
     * starts at seven — and the task sheet cannot create a task there, so booking
     * ONTO one would be refused by the schema before the conflict engine ever saw
     * it. The clash being tested is a real one either way.
     */
    const occ = res.body.data.occurrences.find(
      (o: { kind: string; people: string[]; startMin: number; date: string }) =>
        o.kind === 'session' &&
        o.people.includes('u-vikram') &&
        o.startMin >= 7 * 60 &&
        worksOn(o.date),
    );
    expect(
      occ,
      'the seed should give Vikram a session this week on a day he works',
    ).toBeTruthy();
    return occ as { taskId: string; date: string; startMin: number; durMin: number };
  }

  it('refuses a task landing on somebody’s existing booking', async () => {
    const s = await vikramSession();
    const res = await api(anita).create(
      internal({ date: s.date, startMin: s.startMin, durMin: 30, assigneeIds: ['u-vikram'] }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SCHEDULE_CONFLICT');
    expect(res.body.error.message).toMatch(/^Blocked — Vikram .*already holds/);
    expect(res.body.error.message).toMatch(/Tick “allow overlap” on the task to run both\./);
    expect(res.body.error.details.conflicts[0].type).toBe('busy');
  });

  it('allows it when BOTH sides opt in', async () => {
    const s = await vikramSession();
    /* rule 1 needs both: the existing booking has to agree as well */
    await prisma.task.update({ where: { id: s.taskId }, data: { allowOverlap: true } });

    const res = await api(anita).create(
      internal({
        date: s.date,
        startMin: s.startMin,
        durMin: 30,
        assigneeIds: ['u-vikram'],
        allowOverlap: true,
      }),
    );
    expect(res.status).toBe(201);
    MADE.push(res.body.data.id);
  });

  it('still refuses when only the incoming side opts in', async () => {
    const s = await vikramSession();
    const res = await api(anita).create(
      internal({
        date: s.date,
        startMin: s.startMin,
        durMin: 30,
        assigneeIds: ['u-vikram'],
        allowOverlap: true,
      }),
    );
    expect(res.status).toBe(409);
  });

  it('refuses a time outside a person’s declared hours', async () => {
    /*
     * SNEHA, not Vikram. She works 07:00-15:00, so 20:30 is genuinely outside her
     * day — whereas Vikram's split shift runs to 21:00 and 20:30 is squarely
     * inside it. Asserting a refusal against him would have been asserting a bug.
     */
    const res = await api(anita).create(
      internal({ startMin: 20 * 60 + 30, durMin: 30, assigneeIds: ['u-sneha'], groupIds: [] }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.details.conflicts.some((c: { type: string }) => c.type === 'hours')).toBe(
      true,
    );
  });

  it('binds declared hours to the ASSIGNEES, not to everyone a group drags in', async () => {
    /* rule 2: a group member's shift does not veto a meeting they were invited to
       by their bench rather than by name */
    const res = await api(anita).create(
      internal({
        startMin: 20 * 60 + 30,
        durMin: 30,
        assigneeIds: [],
        groupIds: ['g-diet'],
      }),
    );
    /* nobody is NAMED, so no hours are checked — and the dietitians' bench, whose
       day ended at 15:00, is not consulted about its own hours */
    expect(res.status).toBe(201);
    MADE.push(res.body.data.id);
  });

  it('never blocks on a daily duty — rhythm holds no capacity', async () => {
    /* built here rather than borrowed from the seed, so the assertion is about
       RHYTHM and not about whichever hours the seeded duty happened to sit in */
    const duty = await make(
      anita,
      movable({ kind: 'duty', title: 'Standing sweep', recurFreq: 'daily', recurUntil: M(3) }),
    );
    expect(duty).toBeTruthy();

    /* the same person, the same minute — and it lands, because a duty holds no
       capacity in either direction */
    const made = await api(anita).create(movable({ title: 'Real appointment' }));
    expect(made.status).toBe(201);
    MADE.push(made.body.data.id);
  });

  it('answers a dry run without writing anything', async () => {
    const s = await vikramSession();
    const before = await prisma.task.count();

    const res = await api(anita).create(
      internal({ date: s.date, startMin: s.startMin, durMin: 30, assigneeIds: ['u-vikram'] }),
      true,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(false);
    expect(res.body.data.conflicts.length).toBeGreaterThan(0);
    expect(await prisma.task.count()).toBe(before);
  });
});

/* ───────────────────────────────────────────────────────── acceptance */

describe('acceptance', () => {
  it('starts a two-person task open and confirms it only when both accept', async () => {
    const id = await make(anita, internal());

    const first = await api(vikram).post(`/tasks/${id}/respond`, { state: 'accepted' });
    expect(first.status).toBe(200);
    expect(first.body.data.resp).toMatchObject({ accepted: 1, total: 2, confirmed: false });

    const second = await api(sneha).post(`/tasks/${id}/respond`, { state: 'accepted' });
    expect(second.body.data.resp).toMatchObject({ accepted: 2, total: 2, confirmed: true });
  });

  it('refuses a response from somebody not on the task', async () => {
    const id = await make(anita, internal());
    const res = await api(lakshmi).post(`/tasks/${id}/respond`, { state: 'accepted' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/not on that task/);
  });

  it('refuses a response on a solo task — there is nobody to agree with', async () => {
    const id = await make(anita, internal({ assigneeIds: ['u-vikram'], groupIds: [] }));
    const res = await api(vikram).post(`/tasks/${id}/respond`, { state: 'accepted' });
    expect(res.status).toBe(409);
  });

  it('reports my own answer back to me and not to anybody else', async () => {
    const id = await make(anita, internal());
    await api(vikram).post(`/tasks/${id}/respond`, { state: 'hold' });

    const mine = await api(vikram).list(week);
    expect(mine.body.data.occurrences.find((o: { taskId: string }) => o.taskId === id).mine).toBe(
      'hold',
    );
    const theirs = await api(sneha).list(week);
    expect(theirs.body.data.occurrences.find((o: { taskId: string }) => o.taskId === id).mine).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────── editing */

describe('editing', () => {
  it('refuses a coach editing a task he is not on', async () => {
    const id = await make(anita, internal({ assigneeIds: ['u-sneha'], groupIds: [] }));
    const res = await api(vikram).patch(id, { title: 'Mine now', scope: 'series' });
    expect(res.status).toBe(403);

    const logged = await prisma.auditLog.findFirst({
      where: { action: 'schedule.denied', subjectId: id, actorId: 'u-vikram' },
      orderBy: { at: 'desc' },
    });
    expect(logged).not.toBeNull();
  });

  it('lets somebody bound to a task edit it', async () => {
    const id = await make(anita, internal());
    const res = await api(vikram).patch(id, { title: 'Renamed', scope: 'series' });
    expect(res.status).toBe(200);
    expect((await prisma.task.findUnique({ where: { id } }))!.title).toBe('Renamed');
  });

  it('writes an exception for one occurrence and leaves the series alone', async () => {
    const id = await make(anita, movable({ recurFreq: 'daily', recurUntil: M(3) }));
    const res = await api(anita).patch(id, {
      scope: 'occurrence',
      occurrenceDate: M(2),
      startMin: 11 * 60,
    });
    expect(res.status).toBe(200);

    const grid = await api(anita).list(week);
    const mine = grid.body.data.occurrences.filter((o: { taskId: string }) => o.taskId === id);
    expect(mine.find((o: { date: string }) => o.date === M(2)).startMin).toBe(660);
    expect(mine.find((o: { date: string }) => o.date === M(1)).startMin).toBe(AT);
    /* still ONE row */
    expect(await prisma.task.count({ where: { id } })).toBe(1);
  });
});

/* ────────────────────────────────────────────────────────── the drag */

describe('move', () => {
  it('changes the time in place on the same day', async () => {
    const id = await make(anita, movable());
    const res = await api(anita).post(`/tasks/${id}/move`, {
      fromDate: MON,
      toDate: MON,
      startMin: 14 * 60,
      durMin: 30,
      scope: 'occurrence',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.detached).toBe(false);
    expect((await prisma.task.findUnique({ where: { id } }))!.startMin).toBe(840);
  });

  it('detaches one occurrence of a series moved across days', async () => {
    const id = await make(anita, movable({ recurFreq: 'daily', recurUntil: M(3) }));

    const res = await api(anita).post(`/tasks/${id}/move`, {
      fromDate: M(2),
      toDate: M(3),
      startMin: 14 * 60,
      durMin: 30,
      scope: 'occurrence',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.detached).toBe(true);
    MADE.push(res.body.data.id);

    const grid = await api(anita).list(week);
    const series = grid.body.data.occurrences.filter((o: { taskId: string }) => o.taskId === id);
    /* the series is intact except for the day that left */
    expect(series.map((o: { date: string }) => o.date)).toEqual([M(0), M(1), M(3)]);
    /* and the moved day is now its own standalone task */
    const moved = grid.body.data.occurrences.find(
      (o: { taskId: string; startMin: number }) =>
        o.taskId === res.body.data.id && o.startMin === 840,
    );
    expect(moved.date).toBe(M(3));
    expect(moved.recurring).toBe(false);
  });

  it('snaps back on a clash rather than moving', async () => {
    const list = await api(anita).list(week);
    const session = list.body.data.occurrences.find(
      (o: { kind: string; people: string[]; startMin: number }) =>
        o.kind === 'session' && o.people.includes('u-vikram') && o.startMin >= 7 * 60,
    );
    const id = await make(anita, internal({ assigneeIds: ['u-vikram'], groupIds: [] }));

    const res = await api(anita).post(`/tasks/${id}/move`, {
      fromDate: MON,
      toDate: session.date,
      startMin: session.startMin,
      durMin: 30,
      scope: 'occurrence',
    });
    expect(res.status).toBe(409);
    /* nothing moved */
    const row = await prisma.task.findUnique({ where: { id } });
    expect(row!.startMin).toBe(AT);
  });
});

/* ────────────────────────────────────────────────────────── deletion */

describe('delete', () => {
  it('cancels one occurrence and keeps the rest', async () => {
    const id = await make(anita, internal({ recurFreq: 'daily', recurUntil: M(3) }));
    const res = await api(anita).del(id, `scope=occurrence&date=${M(2)}`);
    expect(res.status).toBe(200);

    const grid = await api(anita).list(week);
    const dates = grid.body.data.occurrences
      .filter((o: { taskId: string }) => o.taskId === id)
      .map((o: { date: string }) => o.date);
    expect(dates).toEqual([M(0), M(1), M(3)]);
    expect(await prisma.task.count({ where: { id } })).toBe(1);
  });

  it('removes the whole series', async () => {
    const id = await make(anita, internal({ recurFreq: 'daily', recurUntil: M(3) }));
    expect((await api(anita).del(id, 'scope=series')).status).toBe(200);
    expect(await prisma.task.count({ where: { id } })).toBe(0);
  });
});

/* ────────────────────────────────────────────────────────────── done */

describe('done', () => {
  it('writes exactly one row per date', async () => {
    const id = await make(anita, internal());
    await api(vikram).post(`/tasks/${id}/done`, { date: MON, done: true });
    await api(vikram).post(`/tasks/${id}/done`, { date: MON, done: true });
    expect(await prisma.taskDone.count({ where: { taskId: id } })).toBe(1);

    const grid = await api(anita).list(week);
    expect(grid.body.data.occurrences.find((o: { taskId: string }) => o.taskId === id).done).toBe(
      true,
    );
  });

  it('is a fact about the DATE, not the task', async () => {
    const id = await make(anita, internal({ recurFreq: 'daily', recurUntil: M(3) }));
    await api(vikram).post(`/tasks/${id}/done`, { date: M(1), done: true });

    const grid = await api(anita).list(week);
    const mine = grid.body.data.occurrences.filter((o: { taskId: string }) => o.taskId === id);
    expect(mine.find((o: { date: string }) => o.date === M(1)).done).toBe(true);
    expect(mine.find((o: { date: string }) => o.date === M(2)).done).toBe(false);
  });

  it('unticks', async () => {
    const id = await make(anita, internal());
    await api(vikram).post(`/tasks/${id}/done`, { date: MON, done: true });
    await api(vikram).post(`/tasks/${id}/done`, { date: MON, done: false });
    expect(await prisma.taskDone.count({ where: { taskId: id } })).toBe(0);
  });
});

/**
 * The first slot on `date` these people can genuinely meet in.
 *
 * Walks the two windows where their declared hours overlap and asks the server
 * — via the same dry run the task sheet uses for its live clash line — whether
 * each would be refused. Returns the first it approves.
 *
 * A test that picks a time out of the air agrees with the seed by luck, and the
 * seed's dates move with the day it is run.
 */
const freeSlot = async (
  s: Session,
  date: string,
  assigneeIds: string[],
  durMin: number,
): Promise<number> => {
  for (const startMin of [9 * 60, 9 * 60 + 15, 9 * 60 + 30, 17 * 60, 17 * 60 + 15, 17 * 60 + 30]) {
    const res = await api(s).create(internal({ date, startMin, durMin, assigneeIds }), true);
    if (res.status === 200 && res.body.data?.ok === true) return startMin;
  }
  throw new Error(
    `no free ${durMin}min slot on ${date} for ${assigneeIds.join(' + ')} — ` +
      'every overlap window is booked, which is itself worth looking at',
  );
};

describe('who you may book', () => {
  it('refuses an allocator putting a task on a coach’s calendar', async () => {
    /* Rohan holds `allocate`, so the old rule let him book anybody. The rule now
       is that you book yourself and other allocators — upward and sideways, never
       onto a coach, whose hours belong to the person running their pod. */
    const res = await api(rohan).create(internal({ assigneeIds: ['u-rohan', 'u-vikram'] }));
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/coach/i);
  });

  it('lets him book another allocator', async () => {
    const res = await api(rohan).create(
      internal({ assigneeIds: ['u-rohan', 'u-sureshk'], clientId: null }),
    );
    expect(res.status).toBe(201);
    MADE.push(res.body.data.id);
  });

  it('applies the same rule to the Operations Head — this is not about one seat', async () => {
    /* Suresh allocates too, and is likewise not the Super Admin. If the rule were
       really "everyone but opsmgr" this would pass and it should not. */
    const res = await api(sureshk).create(internal({ assigneeIds: ['u-sureshk', 'u-sneha'] }));
    expect(res.status).toBe(403);
  });

  it('refuses a client that is not on his pod', async () => {
    /* Rohan sits on no pod in the seeded cast, so every client is off it — which
       is the rule working, and the reason his client picker is empty. */
    const res = await api(rohan).create(
      internal({ assigneeIds: ['u-rohan'], clientId: 'c-meena' }),
    );
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/pod/i);
  });

  it('refuses nothing to the Super Admin — bookAnyone is the exemption', async () => {
    const res = await api(anita).create(
      internal({ assigneeIds: ['u-anita', 'u-vikram'], clientId: 'c-meena' }),
    );
    expect(res.status).toBe(201);
    MADE.push(res.body.data.id);
  });

  it('tells the sheet the same answer it will enforce', async () => {
    const res = await api(rohan).list(week);
    expect(res.status).toBe(200);
    const staff = res.body.data.staff as Array<{ id: string; bookable: boolean }>;
    const byId = new Map(staff.map((u) => [u.id, u.bookable]));
    /* himself and the allocators, and no coach */
    expect(byId.get('u-rohan')).toBe(true);
    expect(byId.get('u-sureshk')).toBe(true);
    expect(byId.get('u-anita')).toBe(true);
    expect(byId.get('u-vikram')).toBe(false);
    expect(byId.get('u-sneha')).toBe(false);
    /* and the whole list is still there, because `who` is a positional colour */
    expect(staff.length).toBeGreaterThan(5);
    expect(res.body.data.bookableClientIds).toEqual([]);
  });

  it('does not leak a calendar through ?client=', async () => {
    /* the lens filters PEOPLE, so an unscoped client filter walked straight past
       it. An id you may not see answers an empty week, not a refusal — a 403
       would confirm the client exists. */
    const mine = await api(vikram).list(`${week}&client=c-meena`);
    expect(mine.status).toBe(200);

    const off = await prisma.client.findFirst({
      where: { pod: { none: { staffId: 'u-vikram' } } },
      select: { id: true },
    });
    if (off) {
      const res = await api(vikram).list(`${week}&client=${off.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.occurrences).toHaveLength(0);
    }
  });
});

/* ───────────────────────────────────────────────────────── proposals */

describe('proposals', () => {
  it('reschedules the task and marks the proposer accepted when applied', async () => {
    /*
     * Anita and Vikram overlap at 09:00-10:00 and again 17:00-18:00, so the
     * proposal has to land in one of those — a proposal outside somebody's day
     * is correctly refused, which is a different test.
     *
     * THE TIME IS ASKED FOR, NOT ASSUMED. This used to hard-code 17:30 on that
     * reasoning, and 17:30 is inside the window — but the seed puts a "Progress
     * meeting · cycle-6 calendar" at 17:00-17:45 on a RELATIVE day, so whether it
     * sits on M(1) depends on which day the suite is run. It passed all week and
     * failed on Mondays. `?dryRun=1` runs the very same conflict check `apply`
     * runs, so a slot it approves is one apply cannot refuse.
     */
    const id = await make(anita, internal({ assigneeIds: ['u-anita', 'u-vikram'] }));

    const startMin = await freeSlot(anita, M(1), ['u-anita', 'u-vikram'], 30);

    const p = await api(vikram).post(`/tasks/${id}/propose`, {
      date: M(1),
      startMin,
      durMin: 30,
      note: 'after my last session',
    });
    expect(p.status).toBe(201);
    /* asking for a new time IS a response */
    const resched = await prisma.taskResponse.findFirst({
      where: { taskId: id, userId: 'u-vikram' },
    });
    expect(resched!.state).toBe('RESCHED');

    const applied = await api(anita).post(`/proposals/${p.body.data.id}/apply`);
    expect(applied.status).toBe(200);

    const row = await prisma.task.findUnique({ where: { id } });
    expect(row!.startMin).toBe(startMin);
    expect(row!.date!.toISOString().slice(0, 10)).toBe(M(1));

    const after = await prisma.taskResponse.findFirst({ where: { taskId: id, userId: 'u-vikram' } });
    expect(after!.state).toBe('ACCEPTED');
  });

  it('refuses a proposal from somebody not on the task', async () => {
    const id = await make(anita, internal());
    const res = await api(lakshmi).post(`/tasks/${id}/propose`, {
      date: M(1),
      startMin: 17 * 60 + 30,
      durMin: 30,
    });
    expect(res.status).toBe(409);
  });

  it('refuses to apply twice', async () => {
    const id = await make(anita, internal({ assigneeIds: ['u-anita', 'u-vikram'] }));
    const startMin = await freeSlot(anita, M(1), ['u-anita', 'u-vikram'], 30);
    const p = await api(vikram).post(`/tasks/${id}/propose`, {
      date: M(1),
      startMin,
      durMin: 30,
    });

    /* THE FIRST APPLY MUST LAND. A clash and an already-applied proposal both
       answer 409, so without this line a scheduling conflict would make the
       assertion below pass while testing nothing — which is how this read green
       on the days the seeded 17:00 meeting happened to fall elsewhere. */
    expect((await api(anita).post(`/proposals/${p.body.data.id}/apply`)).status).toBe(200);

    const again = await api(anita).post(`/proposals/${p.body.data.id}/apply`);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toContain('already been applied');
  });
});
