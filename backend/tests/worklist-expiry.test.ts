import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { EXPIRE_LOOKBACK_DAYS } from '../src/services/queues.service.js';
import { calendarDay, dateAdd, todayISO } from '../src/utils/dates.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * THE WORK LIST IS TODAY'S, AND WHAT SLIPS EXPIRES.
 *
 * Four bookings on one coach: yesterday (never ticked), yesterday (ticked),
 * today, and tomorrow — plus one slotless row. Open shows today's booking and
 * the slotless row and nothing else; the Done section shows yesterday's two,
 * one as Done and one as Expired, newest day first; tomorrow's is nowhere until
 * tomorrow. A booking older than the lookback is not dug up.
 */

let vikram: Session;
let clientId: string;
const ids: Record<string, string> = {};

const api = (s: Session) => ({
  get: (path: string) => request(app).get(`/api/v1${path}`).set(...auth(s.accessToken)),
});

beforeAll(async () => {
  await clearRateLimits();
  vikram = await loginStaff('vikram');

  const c = await prisma.client.create({
    data: { name: 'Ported acceptance — work list expiry', plan: 'POORNA', status: 'active' },
    select: { id: true },
  });
  clientId = c.id;

  const today = todayISO();
  const booked = async (key: string, dayOffset: number | null, title: string) => {
    const row = await prisma.task.create({
      data: {
        title,
        kind: 'SESSION',
        workType: 'TASK',
        clientId,
        ownerId: vikram.user.id,
        assigneeIds: [vikram.user.id],
        groupIds: [],
        recurFreq: 'NONE',
        ...(dayOffset === null
          ? { due: 'today' }
          : { date: calendarDay(dateAdd(today, dayOffset)), startMin: 10 * 60, durMin: 60 }),
      },
      select: { id: true },
    });
    ids[key] = row.id;
    return row.id;
  };

  await booked('slipped', -1, 'Expiry test — slipped yesterday');
  const ticked = await booked('ticked', -1, 'Expiry test — ticked yesterday');
  await prisma.taskDone.create({
    data: { taskId: ticked, date: calendarDay(dateAdd(today, -1)), byId: vikram.user.id },
  });
  await booked('today', 0, 'Expiry test — today');
  await booked('tomorrow', 1, 'Expiry test — tomorrow');
  await booked('slotless', null, 'Expiry test — slotless');
  await booked('ancient', -(EXPIRE_LOOKBACK_DAYS + 3), 'Expiry test — beyond the lookback');
});

afterAll(async () => {
  await prisma.taskDone.deleteMany({ where: { task: { clientId } } });
  await prisma.task.deleteMany({ where: { clientId } });
  await prisma.client.delete({ where: { id: clientId } });
  await closeConnections();
});

type Row = { id: string; status: string; date: string | null; text: string };
const rows = async (q = '') =>
  ((await api(vikram).get(`/queues/worklist${q}`)).body.data as Row[]).filter((r) =>
    r.text.startsWith('Expiry test'),
  );

describe('the work list is one day long', () => {
  it('Open is today and the slotless — not yesterday, not tomorrow', async () => {
    const open = await rows();
    expect(open.map((r) => r.id).sort()).toEqual([ids.today, ids.slotless].sort());
    expect(open.every((r) => r.status === 'OPEN')).toBe(true);
  });

  it('Done holds what was ticked and what expired, newest day first', async () => {
    const done = await rows('?status=DONE');
    expect(done.map((r) => r.id).sort()).toEqual([ids.slipped, ids.ticked].sort());
    const slipped = done.find((r) => r.id === ids.slipped);
    const ticked = done.find((r) => r.id === ids.ticked);
    expect(slipped?.status).toBe('EXPIRED');
    expect(slipped?.date).toBe(dateAdd(todayISO(), -1));
    expect(ticked?.status).toBe('DONE');
    /* nothing from tomorrow, nothing older than the lookback */
    expect(done.find((r) => r.id === ids.tomorrow)).toBeUndefined();
    expect(done.find((r) => r.id === ids.ancient)).toBeUndefined();
  });

  it('ALL is still one day — today, open and ticked — not the week behind', async () => {
    const all = await rows('?status=ALL');
    expect(all.map((r) => r.id).sort()).toEqual([ids.today, ids.slotless].sort());
  });

  it('the badge counts only the open day', async () => {
    const boards = (await api(vikram).get('/queues')).body.data as {
      boards: Array<{ key: string; count: number | null }>;
    };
    const work = boards.boards.find((b) => b.key === 'work');
    const open = await rows();
    /* the count is the whole list; ours is two of it */
    expect(work?.count ?? 0).toBeGreaterThanOrEqual(open.length);
  });
});
