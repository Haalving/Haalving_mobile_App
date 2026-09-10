import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../src/config/prisma.js';
import { REMINDER_MARKS, remindUpcoming } from '../src/services/reminders.service.js';
import { calendarDay, todayISO } from '../src/utils/dates.js';
import { clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * SESSION REMINDERS — an hour out, then half an hour out, once each.
 *
 * One session booked for Vikram at a fixed minute; the job is run with a clock
 * handed to it, so the test can stand at 60, 45, 30 and 5 minutes before the
 * start and read back exactly what was said, and that a second tick at the same
 * mark says nothing. A booking starting in two hours, and a standing duty, are
 * left alone.
 */

let vikram: Session;
let clientId: string;
let sessionId: string;
let laterId: string;
let dutyId: string;

/** A clock standing `m` minutes before a start at `startMin` today. */
const at = (startMin: number, m: number): Date => {
  const [y, mo, d] = todayISO().split('-').map(Number);
  const before = startMin - m;
  return new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1, Math.floor(before / 60), before % 60, 0, 0);
};

/* 14:00 — inside the grid's 07:00–21:00 and far from midnight in any zone */
const START = 14 * 60;

beforeAll(async () => {
  await clearRateLimits();
  vikram = await loginStaff('vikram');

  const c = await prisma.client.create({
    data: { name: 'Ported acceptance — reminders', plan: 'POORNA', status: 'active' },
    select: { id: true },
  });
  clientId = c.id;

  const today = calendarDay(todayISO());
  const booked = async (title: string, kind: 'SESSION' | 'INTERNAL', startMin: number) =>
    (
      await prisma.task.create({
        data: {
          title,
          kind,
          clientId,
          date: today,
          startMin,
          durMin: 60,
          recurFreq: 'NONE',
          assigneeIds: [vikram.user.id],
          groupIds: [],
          link: 'https://meet.example/room',
        },
        select: { id: true },
      })
    ).id;

  sessionId = await booked('Reminder test session', 'SESSION', START);
  laterId = await booked('Reminder test — later', 'SESSION', START + 120);
  dutyId = await booked('Reminder test — standing duty', 'INTERNAL', START);
});

afterAll(async () => {
  await prisma.notice.deleteMany({ where: { clientId } });
  await prisma.task.deleteMany({ where: { clientId } });
  await prisma.client.delete({ where: { id: clientId } });
  await closeConnections();
});

const mine = (mark: number, id = sessionId) =>
  prisma.notice.findMany({
    where: { toId: vikram.user.id, dedupeKey: `sessionReminder:${id}:${todayISO()}:${mark}` },
  });

describe('a booking reminds the people on it twice', () => {
  it('says nothing more than an hour out', async () => {
    await remindUpcoming(at(START, 75));
    expect(await mine(60)).toHaveLength(0);
  });

  it('speaks at the hour mark, once', async () => {
    const first = await remindUpcoming(at(START, 60));
    expect(first.raised).toBe(1);
    const rows = await mine(60);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('REMINDER');
    expect(rows[0]?.severity).toBe('INFO');
    expect(rows[0]?.title).toBe('Reminder test session at 2:00 PM');
    expect(rows[0]?.text).toContain('Starts in 60 min');
    expect(rows[0]?.text).toContain('Ported acceptance — reminders');
    expect(rows[0]?.text).toContain('room link');
    expect(rows[0]?.clientId).toBe(clientId);

    /* the next tick inside the same window writes nothing */
    const again = await remindUpcoming(at(START, 45));
    expect(again.raised).toBe(0);
    expect(await mine(60)).toHaveLength(1);
    expect(await mine(30)).toHaveLength(0);
  });

  it('speaks again at the half-hour, louder, and then holds its peace', async () => {
    const half = await remindUpcoming(at(START, 30));
    expect(half.raised).toBe(1);
    const rows = await mine(30);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.severity).toBe('WATCH');
    expect(rows[0]?.text).toContain('Starts in 30 min');

    const late = await remindUpcoming(at(START, 5));
    expect(late.raised).toBe(0);
    /* two marks, two notices, and not a third */
    expect(
      await prisma.notice.count({
        where: { toId: vikram.user.id, dedupeKey: { startsWith: `sessionReminder:${sessionId}:` } },
      }),
    ).toBe(REMINDER_MARKS.length);
  });

  it('leaves a later booking and a standing duty alone', async () => {
    expect(await mine(60, laterId)).toHaveLength(0);
    expect(await mine(30, laterId)).toHaveLength(0);
    expect(await mine(60, dutyId)).toHaveLength(0);
    expect(await mine(30, dutyId)).toHaveLength(0);
  });

  it('says nothing once the session has started', async () => {
    const started = await remindUpcoming(at(START, -1));
    expect(started.raised).toBe(0);
  });
});
