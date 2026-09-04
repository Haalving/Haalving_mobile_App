import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { dateAdd, startOfDay, todayISO } from '../src/utils/dates.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * THE RECORD'S MERGED LOG — its window, its chips and its cursor.
 *
 * The list is DERIVED: eleven live sources merged and time-sorted on every
 * request. Everything asserted below follows from that. The counts are counted
 * over the WINDOW rather than the page, because a chip that moved as somebody
 * scrolled would be reporting the scroll; the cursor is a TIMESTAMP rather than an
 * offset, because a meal logged mid-page would push an offset off by one and the
 * reader would see the same entry twice — so the paging test walks the whole list
 * in pages and checks it against one unpaged read, entry for entry.
 */

let anita: Session;
/** When this run began, so the stored rows it writes can be taken back out. */
let runStartedAt: Date;

/**
 * Five rows stamped the SAME instant, three minutes ago.
 *
 * The tie is the case the cursor exists to survive: a page boundary that falls
 * inside a group of entries carrying one timestamp cannot be resumed from the
 * timestamp alone. The seed puts a real one on the record so the walk below
 * crosses it rather than hoping the fixtures happened to collide.
 */
const TIE_AT = new Date(Date.now() - 3 * 60_000);

interface Entry {
  at: string;
  bucket: string;
  kind: string;
  icon: string;
  title: string;
  sub: string;
}
interface Page {
  entries: Entry[];
  counts: Record<string, number>;
  pagination: { limit: number; total: number; hasMore: boolean; nextCursor: string | null };
}

const logs = async (query = ''): Promise<{ status: number; body: { data: Page } }> =>
  request(app)
    .get(`/api/v1/clients/c-meena/logs${query}`)
    .set(...auth(anita.accessToken));

/** One entry's identity for a comparison — the list carries no ids of its own. */
const key = (e: Entry): string => `${e.at}|${e.kind}|${e.title}`;

beforeAll(async () => {
  runStartedAt = new Date();
  await clearRateLimits();
  anita = await loginStaff('anita');
  await prisma.clientLog.create({
    data: {
      clientId: 'c-meena',
      actorId: 'u-anita',
      type: 'ATTENTION',
      title: 'Attention resolved',
      description: 'Three days without a meal log — cleared after the call',
      metadata: { from: 'IN_PROGRESS', to: 'RESOLVED' },
    },
  });
  await prisma.clientLog.createMany({
    data: [1, 2, 3, 4, 5].map((n) => ({
      clientId: 'c-meena',
      type: 'SYSTEM' as const,
      title: `Nightly sweep ${n}`,
      createdAt: TIE_AT,
    })),
  });
});

afterAll(async () => {
  /* only the rows this run wrote, on the one record it wrote them to */
  await prisma.clientLog.deleteMany({ where: { clientId: 'c-meena', createdAt: { gte: runStartedAt } } });
  await prisma.clientLog.deleteMany({ where: { clientId: 'c-meena', createdAt: TIE_AT } });
  await closeConnections();
});

/* ────────────────────────────────────────────────── the eleventh source */

describe('the stored rows join the ten derived ones', () => {
  it('puts an attention transition on the timeline, with the person who made it', async () => {
    const res = await logs('?limit=200');
    expect(res.status).toBe(200);

    const row = res.body.data.entries.find((e) => e.title === 'Attention resolved');
    expect(row, 'the stored row is missing from the merge').toBeTruthy();
    expect(row!.kind).toBe('attention');
    expect(row!.icon).toBe('flag');
    /* the description AND the actor, joined the way the rest of the file joins */
    expect(row!.sub).toBe('Three days without a meal log — cleared after the call · Anita R.');
  });

  it('files it under Team — the client bucket is what the client DID', async () => {
    const res = await logs('?bucket=client&limit=200');
    expect(res.body.data.entries.some((e) => e.title === 'Attention resolved')).toBe(false);

    const team = await logs('?bucket=team&limit=200');
    expect(team.body.data.entries.some((e) => e.title === 'Attention resolved')).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────── pagination */

describe('the log paginates', () => {
  it('answers a page, a total and a cursor, defaulting to fifty', async () => {
    const res = await logs();
    expect(res.status).toBe(200);
    const { entries, pagination } = res.body.data;
    expect(pagination.limit).toBe(50);
    expect(entries.length).toBeLessThanOrEqual(50);
    expect(entries.length).toBeLessThanOrEqual(pagination.total);
    expect(pagination.hasMore).toBe(entries.length < pagination.total);
    if (pagination.hasMore) expect(pagination.nextCursor).toBeTruthy();
    else expect(pagination.nextCursor).toBeNull();
  });

  it('walks the whole list in pages, with no entry repeated and none lost', async () => {
    const whole = await logs('?limit=200');
    /* the comparison is only honest if the unpaged read really is the whole list */
    expect(whole.body.data.pagination.hasMore, 'c-meena outgrew a 200-row read').toBe(false);
    const expected = whole.body.data.entries.map(key);

    const walked: string[] = [];
    let cursor: string | null = null;
    /* two at a time, so a page boundary lands INSIDE the five rows that share one
       timestamp — the only case the cursor's tie count is there for */
    for (let guard = 0; guard < 200; guard += 1) {
      const page: { body: { data: Page } } = await logs(
        `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      walked.push(...page.body.data.entries.map(key));
      cursor = page.body.data.pagination.nextCursor;
      if (!cursor) break;
    }

    expect(walked).toEqual(expected);
    /* and the tie really was crossed rather than sitting neatly on a boundary */
    const tied = expected.filter((k) => k.startsWith(TIE_AT.toISOString()));
    expect(tied).toHaveLength(5);
  });

  it('orders rows sharing one timestamp the same way every time', async () => {
    /*
     * WHAT THE CURSOR RESTS ON. None of the eleven reads asks for an ORDER BY, so
     * two rows stamped the same instant come back in whatever order Postgres feels
     * like — and a tie count is only a position if that order holds still. Read
     * twice and compare, because a sort that got this wrong would still look right
     * in any single answer.
     */
    const [a, b] = await Promise.all([logs('?limit=200'), logs('?limit=200')]);
    expect(a.body.data.entries.map(key)).toEqual(b.body.data.entries.map(key));
  });

  it('refuses a cursor it did not hand out, before the eleven reads', async () => {
    expect((await logs('?cursor=page-2')).status).toBe(400);
    expect((await logs('?cursor=2026-09-04|0')).status).toBe(400);
  });
});

/* ──────────────────────────────────────────────────── the chips and the window */

describe('the log filters', () => {
  it('narrows to one bucket, and every row obeys it', async () => {
    const res = await logs('?bucket=plan&limit=200');
    expect(res.status).toBe(200);
    for (const e of res.body.data.entries) expect(e.bucket).toBe('plan');
    expect(res.body.data.pagination.total).toBe(res.body.data.counts.plan);
  });

  it('counts the window rather than the page, so a chip shows its total', async () => {
    const res = await logs('?limit=1');
    const { counts, entries, pagination } = res.body.data;
    expect(entries).toHaveLength(1);
    expect(counts.all).toBe(counts.client! + counts.team! + counts.plan! + counts.medical!);
    /* the chip does not shrink to the page it is sitting above */
    expect(counts.all).toBeGreaterThanOrEqual(pagination.total);
  });

  it('counts the whole window even when a bucket is asked for', async () => {
    const all = await logs('?limit=200');
    const one = await logs('?bucket=team&limit=200');
    expect(one.body.data.counts).toEqual(all.body.data.counts);
    expect(one.body.data.pagination.total).toBe(all.body.data.counts.team);
  });

  it('takes a window, and takes it as both ends inclusive', async () => {
    const to = todayISO();
    const from = dateAdd(to, -2);
    const lo = startOfDay(from).toISOString();
    const hi = startOfDay(dateAdd(to, 1)).toISOString();

    const whole = await logs('?limit=200');
    expect(whole.body.data.pagination.hasMore).toBe(false);
    const expected = whole.body.data.entries.filter((e) => e.at >= lo && e.at < hi);

    const res = await logs(`?from=${from}&to=${to}&limit=200`);
    expect(res.status).toBe(200);
    expect(res.body.data.entries.map(key)).toEqual(expected.map(key));
    expect(res.body.data.counts.all).toBe(expected.length);
    /* today's stored row is inside a window that ends today — the inclusive half */
    expect(res.body.data.entries.some((e) => e.title === 'Attention resolved')).toBe(true);
  });

  it('answers an empty window with an empty list rather than everything', async () => {
    const day = dateAdd(todayISO(), -3650);
    const res = await logs(`?from=${day}&to=${day}`);
    expect(res.status).toBe(200);
    expect(res.body.data.entries).toHaveLength(0);
    expect(res.body.data.counts.all).toBe(0);
    expect(res.body.data.pagination).toMatchObject({ total: 0, hasMore: false, nextCursor: null });
  });

  it('refuses a window that ends before it starts', async () => {
    const res = await logs(`?from=${todayISO()}&to=${dateAdd(todayISO(), -1)}`);
    expect(res.status).toBe(400);
  });
});
