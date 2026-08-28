import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ROLES } from '@haalving/shared';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * People & Access — the three refusals that keep the console usable, and the
 * matrix edits that take effect on the next request.
 */

let anita: Session; /* Super Admin — managePeople, broadcast */
let vikram: Session; /* Fitness Coach — neither */
let sneha: Session; /* Dietician — no broadcast either */
let sureshk: Session; /* Ops Head — HAS the nav and cannot write: the read-only seat */
let bineesh: Session; /* Super User (core) — the other read-only seat */

/** Put the matrix and the feed back the way the seed leaves them. */
async function reset(): Promise<void> {
  for (const [key, def] of Object.entries(ROLES)) {
    /* `client` is a shell, not a console seat — it carries no nav and no perms */
    if (!('nav' in def)) continue;
    await prisma.role.updateMany({
      where: { key },
      data: {
        title: def.title,
        nav: [...def.nav] as never,
        perms: [...def.perms] as never,
        home: def.home,
      },
    });
  }
  /* roles a test created */
  await prisma.role.deleteMany({ where: { key: { startsWith: 'r-' } } });
  await prisma.teamPost.deleteMany({ where: { id: { notIn: ['tf1', 'tf2'] } } });
  await prisma.teamFeedRead.deleteMany({});
  await prisma.user.updateMany({
    where: { role: { not: 'client' } },
    data: { status: 'active', deactivatedAt: null },
  });
  await prisma.capacity.updateMany({ where: { staffId: 'u-vikram' }, data: { declared: 50 } });
}

beforeAll(async () => {
  await clearRateLimits();
  [anita, vikram, sneha, sureshk, bineesh] = await Promise.all([
    loginStaff('anita'),
    loginStaff('vikram'),
    loginStaff('sneha'),
    loginStaff('sureshk'),
    loginStaff('bineesh'),
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

/* ────────────────────────────────────────────────────────── the staff */

describe('GET /people/staff', () => {
  it('gives the whole bench with derived tags', async () => {
    const res = await api(anita).get('/people/staff');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(5);

    const vik = res.body.data.find((r: { id: string }) => r.id === 'u-vikram');
    expect(vik.roleTitle).toBe('Fitness Coach');
    /* Vikram keeps a split shift in the seed, and carries clients */
    expect(vik.tags).toContain('Split shift');
    expect(vik.tags).not.toContain('Unallocated');
    expect(vik.allocated).toBeGreaterThan(0);
  });

  it('marks the people with no seats Unallocated', async () => {
    const res = await api(anita).get('/people/staff');
    const rohan = res.body.data.find((r: { id: string }) => r.id === 'u-rohan');
    expect(rohan.allocated).toBe(0);
    expect(rohan.tags).toContain('Unallocated');
  });

  it('keeps the memo and the emergency contact from anybody without managePeople', async () => {
    /*
     * SURESH K, the Ops Head — not a coach. A Fitness Coach has no `people` nav at
     * all and never reaches this page; the read-only seats are the ones that DO
     * carry the nav without managePeople, and they are who the redaction is for.
     */
    const mine = await api(anita).get('/people/staff');
    expect(Object.keys(mine.body.data[0])).toContain('memo');

    const theirs = await api(sureshk).get('/people/staff');
    expect(theirs.status).toBe(200);
    /* the compact card: same people, fewer fields */
    expect(Object.keys(theirs.body.data[0])).not.toContain('memo');
    expect(Object.keys(theirs.body.data[0])).not.toContain('emergency');
    expect(theirs.body.data.length).toBe(mine.body.data.length);
  });

  it('does not open for a coach at all — the page is not on their sidebar', async () => {
    expect((await api(vikram).get('/people/staff')).status).toBe(403);
  });

  it('counts the headcount the way the card reads it', async () => {
    const res = await api(anita).get('/people/headcount');
    expect(res.body.data.total).toBeGreaterThan(5);
    /* the Leave model does not exist yet, so nobody is on leave */
    expect(res.body.data.onLeave).toBe(0);
  });
});

/* ────────────────────────────────────────────────────── deactivation */

describe('deactivation', () => {
  it('refuses a Super Admin switching off their own account', async () => {
    const res = await api(anita).post('/people/staff/u-anita/deactivate');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/your own account/);
  });

  it('refuses while the person still holds pod seats, and names the clients', async () => {
    const res = await api(anita).post('/people/staff/u-vikram/deactivate');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HAS_SEATS');
    expect(res.body.error.details.clients.length).toBeGreaterThan(0);
    expect(res.body.error.details.clients[0]).toHaveProperty('name');
  });

  it('switches off somebody with no seats, and revokes their sessions', async () => {
    const res = await api(anita).post('/people/staff/u-rohan/deactivate');
    expect(res.status).toBe(200);

    const row = await prisma.user.findUnique({ where: { id: 'u-rohan' } });
    expect(row!.status).toBe('inactive');
    expect(row!.deactivatedAt).not.toBeNull();

    const live = await prisma.refreshToken.count({ where: { userId: 'u-rohan', revokedAt: null } });
    expect(live).toBe(0);
  });

  it('refuses a read-only seat, and logs the attempt', async () => {
    const res = await api(sureshk).post('/people/staff/u-rohan/deactivate');
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Super Admin only. This attempt was logged.');

    const logged = await prisma.auditLog.findFirst({
      where: { action: 'denied', subjectType: 'people', actorId: 'u-sureshk' },
      orderBy: { at: 'desc' },
    });
    expect(logged).not.toBeNull();
  });

  it('reactivates', async () => {
    await api(anita).post('/people/staff/u-rohan/deactivate');
    const res = await api(anita).post('/people/staff/u-rohan/reactivate');
    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: 'u-rohan' } }))!.status).toBe('active');
  });
});

/* ────────────────────────────────────────────────── roles & the guard */

describe('the matrix', () => {
  it('renames a role, and the new title reaches the person holding it', async () => {
    const res = await api(anita).patch('/roles/dietitian', { title: 'Nutritionist' });
    expect(res.status).toBe(200);

    /* Sneha's own /me reads the Role table, so her next request carries it */
    const me = await api(sneha).get('/me');
    expect(me.body.data.role.title).toBe('Nutritionist');
  });

  it('changes the title and NOTHING else — the key is what everything points at', async () => {
    await api(anita).patch('/roles/dietitian', { title: 'Nutritionist' });
    const row = await prisma.role.findUnique({ where: { key: 'dietitian' } });
    expect(row!.key).toBe('dietitian');
    expect(row!.perms).toEqual([...(ROLES.dietitian as { perms: readonly string[] }).perms]);
    /* and Sneha still holds the same key */
    expect((await prisma.user.findUnique({ where: { id: 'u-sneha' } }))!.role).toBe('dietitian');
  });

  it('refuses to take People & Access off the Super Admin', async () => {
    const res = await api(anita).post('/roles/admin/nav', { navId: 'people', on: false });
    expect(res.status).toBe(409);
    expect(res.body.error.details.guarded).toBe(true);
    /* and the row is untouched */
    expect((await prisma.role.findUnique({ where: { key: 'admin' } }))!.nav).toContain('people');
  });

  it('refuses to take managePeople off the Super Admin', async () => {
    const res = await api(anita).post('/roles/admin/perm', { perm: 'managePeople', on: false });
    expect(res.status).toBe(409);
    expect((await prisma.role.findUnique({ where: { key: 'admin' } }))!.perms).toContain(
      'managePeople',
    );
  });

  it('re-points home when the page it named is switched off', async () => {
    const before = await prisma.role.findUnique({ where: { key: 'fitness' } });
    expect(before!.home).toBe('#/home');

    const res = await api(anita).post('/roles/fitness/nav', { navId: 'home', on: false });
    expect(res.status).toBe(200);

    const after = await prisma.role.findUnique({ where: { key: 'fitness' } });
    expect(after!.nav).not.toContain('home');
    /* not left pointing at a page the sidebar no longer carries */
    expect(after!.home).not.toBe('#/home');
    expect(after!.home).toBe(`#/${after!.nav[0]}`);
  });

  it('takes a nav item away and gives it back', async () => {
    /* `catalog`, not `community`: a Fitness Coach never had Community — DAY1.md
       says so in as many words — so toggling it would have proved nothing. */
    await api(anita).post('/roles/fitness/nav', { navId: 'catalog', on: false });
    expect((await prisma.role.findUnique({ where: { key: 'fitness' } }))!.nav).not.toContain(
      'catalog',
    );
    await api(anita).post('/roles/fitness/nav', { navId: 'catalog', on: true });
    expect((await prisma.role.findUnique({ where: { key: 'fitness' } }))!.nav).toContain('catalog');
  });

  it('creates a role from a base with identical nav and perms and its own key', async () => {
    const res = await api(anita).post('/roles', { title: 'Wellness Lead', baseKey: 'mind' });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toBe('r-wellnesslead');

    const base = await prisma.role.findUnique({ where: { key: 'mind' } });
    const made = await prisma.role.findUnique({ where: { key: 'r-wellnesslead' } });
    expect(made!.nav).toEqual(base!.nav);
    expect(made!.perms).toEqual(base!.perms);
    expect(made!.home).toBe(base!.home);
    expect(made!.title).toBe('Wellness Lead');
  });

  it('suffixes rather than overwriting an existing key', async () => {
    await api(anita).post('/roles', { title: 'Wellness Lead', baseKey: 'mind' });
    const again = await api(anita).post('/roles', { title: 'Wellness Lead', baseKey: 'mind' });
    expect(again.status).toBe(201);
    expect(again.body.data.key).toBe('r-wellnesslead2');
  });

  it('refuses every matrix write from somebody without managePeople', async () => {
    for (const [path, body] of [
      ['/roles/fitness', { title: 'Anything' }],
      ['/roles/fitness/nav', { navId: 'home', on: false }],
      ['/roles/fitness/perm', { perm: 'allocate', on: true }],
      ['/roles', { title: 'New', baseKey: 'mind' }],
    ] as const) {
      const res =
        path === '/roles/fitness'
          ? await api(sureshk).patch(path, body as { title: string })
          : await api(sureshk).post(path, body);
      expect(res.status, `${path} should be refused`).toBe(403);
    }
  });

  it('takes effect on the NEXT request, not after a deploy', async () => {
    const before = await api(vikram).get('/me');
    expect(before.body.data.role.nav).toContain('catalog');

    await api(anita).post('/roles/fitness/nav', { navId: 'catalog', on: false });

    /* the 30-second cache is invalidated on the write, so this is the very next
       request rather than the one after the TTL */
    const after = await api(vikram).get('/me');
    expect(after.body.data.role.nav).not.toContain('catalog');
  });
});

/* ────────────────────────────────────────────────────────── capacity */

describe('capacity', () => {
  it('lists a row per seat with full derived from the two numbers', async () => {
    const res = await api(anita).get('/people/capacity');
    expect(res.status).toBe(200);
    const vik = res.body.data.find((r: { staffId: string }) => r.staffId === 'u-vikram');
    expect(vik).toMatchObject({ load: 50, cap: 50, full: true });
  });

  it('raises the ceiling and stops reading full', async () => {
    const res = await api(anita).patch('/people/capacity/u-vikram', { cap: 55 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ cap: 55, load: 50, full: false });

    const log = await prisma.auditLog.findFirst({
      where: { action: 'capacity.cap_changed', subjectId: 'u-vikram' },
      orderBy: { at: 'desc' },
    });
    expect(log!.meta).toMatchObject({ from: 50, to: 55 });
  });

  it('is live for the allocation picker on the next read', async () => {
    await api(anita).patch('/people/capacity/u-vikram', { cap: 55 });
    const arrival = await api(anita).get('/arrivals/p1');
    const vik = arrival.body.data.capacity.find((c: { staffId: string }) => c.staffId === 'u-vikram');
    expect(vik).toMatchObject({ cap: 55, full: false });
  });

  it('refuses without managePeople', async () => {
    const res = await api(sureshk).patch('/people/capacity/u-vikram', { cap: 99 });
    expect(res.status).toBe(403);
    expect((await prisma.capacity.findUnique({ where: { staffId: 'u-vikram' } }))!.declared).toBe(50);
  });
});

/* ─────────────────────────────────────────────────── announcements */

describe('the team feed', () => {
  it('opens unread for everybody', async () => {
    const res = await api(bineesh).get('/people/feed');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.unseen).toBe(2);
    expect(res.body.data.items[0].fresh).toBe(true);
    /* newest first, and the author's role title travels with it */
    expect(res.body.data.items[0].by.roleTitle).toBeTruthy();
  });

  it('refuses a post from somebody without broadcast', async () => {
    const res = await api(sneha).post('/people/feed', { text: 'Hello team', tag: 'general' });
    expect(res.status).toBe(403);
    expect(await prisma.teamPost.count()).toBe(2);
  });

  it('takes a post from a broadcaster and shows it as new to everybody else', async () => {
    await api(bineesh).post('/people/feed/seen');
    expect((await api(bineesh).get('/people/feed')).body.data.unseen).toBe(0);

    const posted = await api(anita).post('/people/feed', {
      text: 'Policy: photo SLA moves to 15 minutes.',
      tag: 'policy',
    });
    expect(posted.status).toBe(201);

    const seen = await api(bineesh).get('/people/feed');
    expect(seen.body.data.unseen).toBe(1);
    expect(seen.body.data.items[0].fresh).toBe(true);
    expect(seen.body.data.items[0].tag).toBe('policy');
    expect(seen.body.data.items[1].fresh).toBe(false);
  });

  it('drains to zero once read, and stays there', async () => {
    await api(bineesh).post('/people/feed/seen');
    expect((await api(bineesh).get('/people/feed')).body.data.unseen).toBe(0);
    /* idempotent — stamping twice is not an error and changes nothing */
    await api(bineesh).post('/people/feed/seen');
    expect((await api(bineesh).get('/people/feed')).body.data.unseen).toBe(0);
  });

  it('is per person — one reader draining does not drain another', async () => {
    await api(bineesh).post('/people/feed/seen');
    expect((await api(bineesh).get('/people/feed')).body.data.unseen).toBe(0);
    expect((await api(sureshk).get('/people/feed')).body.data.unseen).toBe(2);
  });

  /*
   * A COACH still learns about an announcement — just not on this page. The count
   * rides on Home, which is the only surface a Fitness Coach shares with the
   * Super Admin who wrote it.
   */
  it('reaches a coach through the Home badge instead', async () => {
    const before = await request(app).get('/api/v1/home/summary').set(...auth(vikram.accessToken));
    expect(before.body.data.fresh.notices).toBe(2);

    await api(anita).post('/people/feed', { text: 'One more', tag: 'general' });
    const after = await request(app).get('/api/v1/home/summary').set(...auth(vikram.accessToken));
    expect(after.body.data.fresh.notices).toBe(3);
  });
});
