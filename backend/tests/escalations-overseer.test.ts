import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../src/config/prisma.js';
import {
  MISSED_PLATES,
  WORK_OVERDUE_DAYS,
} from '../src/services/digest-rules/escalations.rule.js';
import { raiseFor } from '../src/services/escalations.service.js';
import { clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * THE OVERSEER'S TWO CONDITIONS — the 08:00 sweep's newest step.
 *
 * A client who stops sending plates, and a coach whose rule-raised work has
 * stood undone for two days, both reach the Super Admin as a ticket and a
 * notice, and the bell on every page of the console counts the notice. This
 * puts one client with both conditions in front of the sweep and reads back
 * exactly who was told, and as what.
 *
 * The client has a plate two days back — RATED, so the SLA ladder has nothing
 * to chase about it — and nothing since. That is one completed day with no
 * plate (at least three meals in a row) without being three days of silence,
 * so the plates rule speaks and the quiet rule does not.
 */

const DAY = 86_400_000;

let anita: Session; /* Super Admin — the overseer, role `admin` */
let vikram: Session; /* Fitness Coach — carries the client, holds the task */

let clientId: string;
let taskId: string;

beforeAll(async () => {
  await clearRateLimits();
  [anita, vikram] = await Promise.all([loginStaff('anita'), loginStaff('vikram')]);

  const c = await prisma.client.create({
    data: {
      name: 'Ported acceptance — overseer, plates stopped',
      plan: 'POORNA',
      status: 'active',
      onboardedAt: new Date(Date.now() - 30 * DAY),
    },
    select: { id: true },
  });
  clientId = c.id;

  await prisma.podSeat.create({
    data: { clientId, seat: 'fitness', staffId: vikram.user.id },
  });

  await prisma.meal.create({
    data: {
      clientId,
      slot: 'Lunch',
      fullness: 'Just right',
      capturedAt: new Date(Date.now() - 2 * DAY),
      finalStars: 4,
    },
  });

  /* the coach's task, raised by a rule a day past the allowance and never done */
  const t = await prisma.task.create({
    data: {
      title: 'Allocate cycle 5 template for the overseer test client',
      kind: 'INTERNAL',
      workType: 'TASK',
      clientId,
      pillar: 'culture',
      ownerId: vikram.user.id,
      assigneeIds: [vikram.user.id],
      due: 'by day 1 · 2026-09-11',
      pill: 'warn',
      sourceRule: 'cyclePlan:4',
      createdAt: new Date(Date.now() - (WORK_OVERDUE_DAYS + 1) * DAY),
    },
    select: { id: true },
  });
  taskId = t.id;
});

afterAll(async () => {
  /* in the order the foreign keys allow */
  await prisma.notice.deleteMany({ where: { clientId } });
  await prisma.attention.deleteMany({ where: { clientId } });
  await prisma.clientLog.deleteMany({ where: { clientId } });
  await prisma.task.deleteMany({ where: { clientId } });
  await prisma.meal.deleteMany({ where: { clientId } });
  await prisma.podSeat.deleteMany({ where: { clientId } });
  await prisma.digestEntry.deleteMany({ where: { clientId } });
  await prisma.client.delete({ where: { id: clientId } });
  await closeConnections();
});

describe('the overseer hears about missed plates and overdue coach work', () => {
  it('raises both tickets and tells the right people, as the right thing', async () => {
    const counts = await raiseFor(new Date(), [clientId]);
    expect(counts.attentions).toBe(2);
    /* neither condition owns a timeline row — the plates and the task are rows already */
    expect(counts.logs).toBe(0);

    const plates = await prisma.attention.findUnique({
      where: { dedupeKey: `missedPlates:${clientId}` },
    });
    expect(plates?.severity).toBe('HIGH');
    expect(plates?.status).toBe('OPEN');
    expect(plates?.source).toBe('missedPlates');
    expect(plates?.description).toContain(`${MISSED_PLATES} meals missed in a row`);

    const work = await prisma.attention.findUnique({
      where: { dedupeKey: `workOverdue:${taskId}` },
    });
    expect(work?.severity).toBe('HIGH');
    expect(work?.status).toBe('OPEN');
    expect(work?.source).toBe('workOverdue');
    expect(work?.title).toContain('Coach work overdue');
    expect(work?.description).toContain(vikram.user.name);
    expect(work?.description).toContain('by day 1');

    /* the Super Admin's outbox: one line per condition, filed under her role */
    const hers = await prisma.notice.findMany({ where: { toId: anita.user.id, clientId } });
    expect(hers.map((n) => n.dedupeKey).sort()).toEqual(
      [`missedPlates:${clientId}`, `workOverdue:${taskId}`].sort(),
    );
    expect(hers.every((n) => n.targetRole === 'admin' && n.status === 'UNREAD')).toBe(true);
    const herPlates = hers.find((n) => n.dedupeKey === `missedPlates:${clientId}`);
    const herWork = hers.find((n) => n.dedupeKey === `workOverdue:${taskId}`);
    expect(herPlates?.kind).toBe('CLIENT_RISK');
    expect(herPlates?.attentionId).toBe(plates?.id);
    expect(herWork?.kind).toBe('TASK');
    expect(herWork?.attentionId).toBe(work?.id);

    /* the coach: the plates as the seat he holds, the work as its owner */
    const his = await prisma.notice.findMany({ where: { toId: vikram.user.id, clientId } });
    expect(his.find((n) => n.dedupeKey === `missedPlates:${clientId}`)?.targetRole).toBe('fitness');
    expect(his.find((n) => n.dedupeKey === `workOverdue:${taskId}`)?.targetRole).toBe('owner');
  });

  it('runs again and still holds one of each', async () => {
    const again = await raiseFor(new Date(), [clientId]);
    expect(again).toEqual({ attentions: 0, notices: 0, logs: 0 });
    expect(await prisma.attention.count({ where: { clientId } })).toBe(2);
    expect(await prisma.notice.count({ where: { toId: anita.user.id, clientId } })).toBe(2);
  });

  it('raises nothing once the work is done and a plate has arrived today', async () => {
    await prisma.taskDone.create({
      data: { taskId, date: new Date(), byId: vikram.user.id },
    });
    await prisma.meal.create({
      data: { clientId, slot: 'Breakfast', fullness: 'Just right', capturedAt: new Date(), finalStars: 4 },
    });
    /* the standing rows are cleared so a fresh run has to earn them again */
    await prisma.notice.deleteMany({ where: { clientId } });
    await prisma.attention.deleteMany({ where: { clientId } });

    const counts = await raiseFor(new Date(), [clientId]);
    expect(counts).toEqual({ attentions: 0, notices: 0, logs: 0 });
  });
});
