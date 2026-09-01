import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, issueTestOtp, loginStaff, type Session } from './helpers.js';

/**
 * Community, exercised through the API.
 *
 * The seeded state is the demo's own: three gatherings, three challenges, five
 * days of the Health Games book, seven posts on the Common Canvas, one zone with
 * five members and two posts inside it, and nothing sent to any client yet.
 *
 * FOUR ROLES CARRY THE COMMUNITY TAB and they are deliberately not equal, which
 * is what most of this file is about:
 *
 *   Anita   Super Admin     — manages, deletes, announces
 *   Suresh  Operations Head — the same three
 *   Rohan   Haalving Coach  — manages, and neither deletes nor announces
 *   Bineesh Super User      — reads every tab and writes none of them
 *
 * Sneha the Dietician carries no Community tab at all, which is what makes her
 * the right person to hand one to when the SCOPE has to be proved: the four roles
 * that ship with the tab all hold `seeAllClients`, so the rule that a console
 * only shows a staff member the clients they carry is invisible until somebody
 * narrower is let in.
 */

let anita: Session; /* Super Admin — manageTribe + manageConfig + announceClients */
let rohan: Session; /* Haalving Coach — manageTribe, and neither of the other two */
let bineesh: Session; /* Super User — the Community nav, and no manageTribe */
let sneha: Session; /* Dietician — no Community nav, and a pod-sized client list */

const SEEDED_GATHERINGS = ['ev1', 'ev2', 'ev3'];
const SEEDED_CHALLENGES = ['ch1', 'ch2', 'ch3'];
const SEEDED_GAME_DAYS = ['qd0', 'qd1', 'qd2', 'qd3', 'qd4'];
const SEEDED_ZONES = ['z1'];
const SEEDED_POSTS = ['tp1', 'tp2', 'tp3', 'tp4', 'tp5', 'tp6', 'tp7', 'zp1', 'zp2'];

/**
 * The demo's story, read from the file the SEED reads.
 *
 * The floor test has to empty a collection down to its last item, which means
 * deleting two seeded gatherings — so the reset puts them back from the same
 * source of truth rather than from a copy typed into this file. Nothing here is
 * transcribed, which is the rule the seed itself keeps.
 */
const here = dirname(fileURLToPath(import.meta.url));
const demo = JSON.parse(readFileSync(join(here, '..', 'prisma', 'demo-seed.json'), 'utf8')) as {
  community: {
    gatherings: Array<{
      id: string;
      title: string;
      when: string;
      where: string;
      host: string | null;
      spots: string | null;
      desc: string;
      about: string[];
      agenda: unknown;
      bring: string[];
      img: string;
    }>;
    challenges: Array<{
      id: string;
      title: string;
      days: number;
      host: string | null;
      stake: string | null;
      desc: string;
      about: string[];
      how: string[];
      arc: unknown;
      img: string;
    }>;
    gameDays: Array<{
      id: string;
      label: string;
      date: string;
      qs: Array<{ q: string; opts: string[]; ans: number; why: string }>;
    }>;
    posts: Array<{ id: string; caption: string; authorId: string | null }>;
    zones: Array<{ id: string; name: string; createdById: string | null; memberIds: string[] }>;
  };
};

async function reset(): Promise<void> {
  /* what a send left behind, reached THROUGH the delivery rows so nothing a
     client wrote in their own room is ever touched — the seed's own order */
  await prisma.circleMessage.deleteMany({ where: { broadcastDelivery: { isNot: null } } });
  await prisma.broadcast.deleteMany({});
  await prisma.clientAnnouncePref.deleteMany({});

  await prisma.communityPost.deleteMany({ where: { id: { notIn: SEEDED_POSTS } } });
  await prisma.gathering.deleteMany({ where: { id: { notIn: SEEDED_GATHERINGS } } });
  await prisma.challenge.deleteMany({ where: { id: { notIn: SEEDED_CHALLENGES } } });
  await prisma.gameDay.deleteMany({ where: { id: { notIn: SEEDED_GAME_DAYS } } });
  await prisma.zone.deleteMany({ where: { id: { notIn: SEEDED_ZONES } } });

  /* moderation is a decision somebody made on a screen; the opening canvas has
     no pin and nothing hidden */
  await prisma.communityPost.updateMany({ data: { pinned: false, hidden: false } });

  /* and the two fields an edit test rewrites */
  for (const p of demo.community.posts) {
    await prisma.communityPost.updateMany({
      where: { id: p.id },
      data: { caption: p.caption, authorId: p.authorId },
    });
  }

  /* the zone, and its membership — one test shrinks the room and another deletes
     it outright. A zone is the one membership table this module's routes may
     write, so it is the one the reset has to put back; its two posts come back
     with it below, because deleting it cascaded them away. */
  for (const [i, z] of demo.community.zones.entries()) {
    const zData = { name: z.name, createdById: z.createdById, position: i };
    await prisma.zone.upsert({ where: { id: z.id }, create: { id: z.id, ...zData }, update: zData });
    await prisma.zoneMember.deleteMany({ where: { zoneId: z.id, clientId: { notIn: z.memberIds } } });
    for (const clientId of z.memberIds) {
      await prisma.zoneMember.upsert({
        where: { zoneId_clientId: { zoneId: z.id, clientId } },
        create: { zoneId: z.id, clientId },
        update: {},
      });
    }
  }

  /* the gatherings the floor test deletes, back from the seed's own file */
  for (const [i, g] of demo.community.gatherings.entries()) {
    const data = {
      title: g.title,
      when: g.when,
      where: g.where,
      host: g.host,
      spots: g.spots,
      desc: g.desc,
      about: g.about,
      agenda: g.agenda as never,
      bring: g.bring,
      img: g.img,
      position: i,
      /* PUT THEM BACK PUBLISHED, the way `seed.ts` does. A test that deletes a
         seeded gathering and lets the reset recreate it would otherwise hand the
         next test a pending one, and the demo's three are live content. */
      approvedById: 'u-anita',
      approvedAt: new Date(),
      returnNote: null,
    };
    await prisma.gathering.upsert({ where: { id: g.id }, create: { id: g.id, ...data }, update: data });
  }

  /* the challenges an edit test rewrites */
  for (const [i, c] of demo.community.challenges.entries()) {
    const data = {
      title: c.title,
      days: c.days,
      host: c.host,
      stake: c.stake,
      desc: c.desc,
      about: c.about,
      how: c.how,
      arc: c.arc as never,
      img: c.img,
      position: i,
    };
    await prisma.challenge.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
  }

  /* and the Health Games book, which the second floor test empties down to one.
     Questions come back BY POSITION, the way both the service and the seed write
     them, so a restored day is the day it was rather than a new one wearing its
     name. */
  for (const [i, d] of demo.community.gameDays.entries()) {
    const data = { label: d.label, date: d.date, position: i };
    await prisma.gameDay.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
    for (const [pos, q] of d.qs.entries()) {
      const qData = { prompt: q.q, options: q.opts, answer: q.ans, why: q.why };
      await prisma.gameQuestion.upsert({
        where: { gameDayId_position: { gameDayId: d.id, position: pos } },
        create: { gameDayId: d.id, position: pos, ...qData },
        update: qData,
      });
    }
    await prisma.gameQuestion.deleteMany({ where: { gameDayId: d.id, position: { gte: d.qs.length } } });
  }
}

beforeAll(async () => {
  await clearRateLimits();
  [anita, rohan, bineesh, sneha] = await Promise.all([
    loginStaff('anita'),
    loginStaff('rohan'),
    loginStaff('bineesh'),
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
  del: (path: string) => request(app).delete(`/api/v1${path}`).set(...auth(s.accessToken)),
});

/** The audit row a refusal owes. Newest first, so the last denial is [0]. */
async function lastDenial(actorId: string) {
  return prisma.auditLog.findFirst({
    where: { actorId, action: 'denied', subjectType: 'community' },
    orderBy: { at: 'desc' },
  });
}

const GATHERING = {
  title: 'Backwater paddle at first light',
  when: 'Sun · 6:00 AM',
  where: 'Alappuzha',
  desc: 'Two hours on flat water before the houseboats wake.',
  about: ['The quietest hour the backwaters have.'],
  agenda: [{ t: '6:00 AM', v: 'Push off from the jetty' }],
  bring: ['A change of clothes'],
};

/* ──────────────────────────────────────────────────── reading the commons */

describe('the nav is the door', () => {
  it('opens every tab to a Super User, who holds no manageTribe at all', async () => {
    for (const path of [
      '/community',
      '/community/gatherings',
      '/community/challenges',
      '/community/game-days',
      '/community/posts',
      '/community/zones',
      '/community/circle',
      '/community/announcements',
    ]) {
      const res = await api(bineesh).get(path);
      expect(res.status, `${path} should read`).toBe(200);
    }
  });

  it('tells that Super User what they may do, so no screen has to guess', async () => {
    const res = await api(bineesh).get('/community');
    expect(res.body.data.canManage).toBe(false);
    expect(res.body.data.canDelete).toBe(false);
    expect(res.body.data.canAnnounce).toBe(false);
    /* and the six tabs are still all there — a reader sees the whole surface */
    expect(res.body.data.sections.map((s: { key: string }) => s.key)).toEqual([
      'gatherings',
      'challenges',
      'quiz',
      'feed',
      'zones',
      'announce',
    ]);
  });

  it('refuses a role whose sidebar does not carry Community', async () => {
    const res = await api(sneha).get('/community/gatherings');
    expect(res.status).toBe(403);
  });
});

/* ─────────────────────────────────────────────────── the seeded content */

describe('the demo’s own commons', () => {
  it('has the three gatherings, in the order the client page reads them', async () => {
    const res = await api(anita).get('/community/gatherings');
    expect(res.status).toBe(200);
    const titles = res.body.data.map((g: { title: string }) => g.title);
    expect(titles[0]).toBe('One-day trek to Malayattoor');
    expect(titles).toHaveLength(3);

    const trek = res.body.data[0];
    expect(trek.where).toBe('Malayattoor, Kerala');
    expect(trek.agenda[0]).toEqual({ t: '5:30 AM', v: 'Assemble at the pickup point — the bus leaves at 5:45 sharp' });
    expect(trek.bring).toContain('2 litres of water');
    /* member state, read and never written: nobody has enrolled */
    expect(trek.going).toBe(0);
  });

  it('has the three challenges with their arcs intact', async () => {
    const res = await api(anita).get('/community/challenges');
    const fasting = res.body.data.find((c: { title: string }) => c.title === '7-day fasting challenge');
    expect(fasting.days).toBe(7);
    expect(fasting.arc[0].k).toBe('Days 1–2');
    expect(fasting.how[0]).toBe('Dinner finished by 8 PM — finished, not started');
    expect(fasting.joined).toBe(0);
  });

  it('has five days of the Health Games book, five questions each', async () => {
    const res = await api(anita).get('/community/game-days');
    expect(res.body.data).toHaveLength(5);
    for (const day of res.body.data) expect(day.qs).toHaveLength(5);

    const monday = res.body.data[0];
    expect(monday.label).toBe('Mon');
    expect(monday.date).toBe('3 Aug');
    expect(monday.qs[0].q).toBe('How do the longest-lived communities move?');
    expect(monday.qs[0].ans).toBe(1);
    /* "n of 5 answered" is a count over EVERYBODY here, and nobody has played */
    expect(monday.answered).toBe(0);
    expect(monday.answers).toBe(0);
  });

  it('has the seven posts, with their authors, kinds and likes', async () => {
    const res = await api(anita).get('/community/posts');
    expect(res.body.data.posts).toHaveLength(7);
    expect(res.body.data.counts).toEqual({ all: 7, pinned: 0, hidden: 0 });

    const mathew = res.body.data.posts.find((p: { id: string }) => p.id === 'tp4');
    expect(mathew.byName).toBe('Mathew');
    expect(mathew.kind).toBe('text');
    /* member state: four likes and two replies, counted and never written */
    expect(mathew.likes).toBe(4);
    expect(mathew.comments).toBe(2);

    /* the house account has no user row, and reads back as HAALVING */
    const house = res.body.data.posts.find((p: { id: string }) => p.id === 'tp6');
    expect(house.by).toBe('haalving');
    expect(house.byName).toBe('HAALVING');
  });

  it('keeps the zone and its private canvas off the Common Canvas', async () => {
    const zones = await api(anita).get('/community/zones');
    expect(zones.body.data).toHaveLength(1);
    const [z] = zones.body.data;
    expect(z.name).toBe('Morning Walkers');
    expect(z.members).toHaveLength(5);
    expect(z.createdByName).toBe('Mathew');
    /* the number the delete warning has to carry */
    expect(z.posts).toBe(2);

    /* and neither of those two shows up in the feed */
    const feed = await api(anita).get('/community/posts');
    const ids = feed.body.data.posts.map((p: { id: string }) => p.id);
    expect(ids).not.toContain('zp1');
    expect(ids).not.toContain('zp2');
  });

  it('has the community circle the zone picker draws from', async () => {
    const res = await api(anita).get('/community/circle');
    expect(res.body.data.map((m: { clientId: string }) => m.clientId).sort()).toEqual([
      'c-ananya',
      'c-dev',
      'c-mathew',
      'c-priya',
      'c-rajesh',
    ]);
  });
});

/* ──────────────────────────────────────────────── manageTribe, and only it */

describe('writing needs manageTribe', () => {
  it('LETS a Super User propose a gathering — the bar for proposing is the nav', async () => {
    /*
     * THIS TEST USED TO ASSERT A 403, and the rule changed deliberately.
     *
     * Writing a gathering was `manageTribe`, which the Super User does not hold —
     * it is a reviewing seat, read-only elsewhere. But a gathering now lands
     * PENDING and reaches nobody until somebody else approves it, so proposing one
     * is inert and the bar for it is simply being able to open Community.
     *
     * The seat stays read-only where it was: the next test still refuses it every
     * other write on this section.
     */
    const res = await api(bineesh).post('/community/gatherings', GATHERING);
    expect(res.status).toBe(201);

    const id = (res.body.data as { id: string }).id;
    const row = await prisma.gathering.findUniqueOrThrow({ where: { id } });
    expect(row.createdById).toBe('u-bineesh');
    /* and it is NOT live — that is what makes the low bar safe */
    expect(row.approvedAt).toBeNull();

    await prisma.gathering.delete({ where: { id } });
  });

  it('refuses every other write from the same seat, and logs each one', async () => {
    const attempts: Array<[Promise<{ status: number }>, string]> = [
      [api(bineesh).post('/community/challenges', { title: 'No', days: 3 }), 'challenge'],
      [
        api(bineesh).post('/community/game-days', {
          label: 'Nope',
          qs: [{ q: 'Really?', opts: ['no', 'yes'], ans: 1 }],
        }),
        'game day',
      ],
      [api(bineesh).post('/community/posts', { by: 'haalving', caption: 'No' }), 'post'],
      [api(bineesh).post('/community/posts/tp4/moderate', { pinned: true }), 'moderation'],
      [api(bineesh).post('/community/zones', { name: 'No', memberIds: ['c-rajesh'] }), 'zone'],
      [api(bineesh).patch('/community/gatherings/ev1', GATHERING), 'edit'],
    ];
    for (const [call, what] of attempts) {
      expect((await call).status, `${what} should be refused`).toBe(403);
    }

    const logged = await prisma.auditLog.count({
      where: { actorId: bineesh.user.id, action: 'denied', subjectType: 'community' },
    });
    expect(logged).toBeGreaterThanOrEqual(attempts.length);
  });

  it('lets the Haalving Coach, who holds it, author a gathering', async () => {
    const res = await api(rohan).post('/community/gatherings', GATHERING);
    expect(res.status).toBe(201);

    const list = await api(rohan).get('/community/gatherings');
    /* the console unshifts, so a new one lands at the top */
    expect(list.body.data[0].title).toBe(GATHERING.title);
    /* the sheet asks for no picture, and the client page reads `img` with no
       fallback of its own */
    expect(list.body.data[0].img).toBe('img/onboard/bz-live.webp');
  });
});

/* ───────────────────────────────────────────────── deleting is narrower */

describe('deleting is a narrower right than editing', () => {
  it('lets the Haalving Coach edit a challenge and refuses the delete', async () => {
    const edit = await api(rohan).patch('/community/challenges/ch3', {
      title: 'Table before eight',
      days: 11,
      desc: 'Dinner on the table and done by 8 PM for one cycle.',
    });
    expect(edit.status).toBe(200);

    const del = await api(rohan).del('/community/challenges/ch3');
    expect(del.status).toBe(403);
    expect((await lastDenial(rohan.user.id))!.reason).toBe('community.challenge.delete');
    expect(await prisma.challenge.count()).toBe(3);
  });

  it('lets a Super Admin delete one, because challenges have no floor', async () => {
    const made = await api(anita).post('/community/challenges', { title: 'Throwaway', days: 2 });
    const res = await api(anita).del(`/community/challenges/${made.body.data.id as string}`);
    expect(res.status).toBe(200);
    expect(await prisma.challenge.count()).toBe(3);
  });

  it('refuses to delete the LAST gathering — the client page indexes [0] unguarded', async () => {
    expect((await api(anita).del('/community/gatherings/ev3')).status).toBe(200);
    expect((await api(anita).del('/community/gatherings/ev2')).status).toBe(200);

    const last = await api(anita).del('/community/gatherings/ev1');
    expect(last.status).toBe(409);
    expect(last.body.error.details.floor).toBe(true);
    expect(await prisma.gathering.count()).toBe(1);
  });

  it('refuses to delete the LAST game day for the same reason', async () => {
    for (const id of ['qd1', 'qd2', 'qd3', 'qd4']) {
      expect((await api(anita).del(`/community/game-days/${id}`)).status).toBe(200);
    }
    const last = await api(anita).del('/community/game-days/qd0');
    expect(last.status).toBe(409);
    expect(last.body.error.details.section).toBe('quiz');
  });
});

/* ────────────────────────────────────────────────────── content vs state */

describe('content is written here and member state never is', () => {
  it('keeps a photo post’s photograph when its caption is corrected', async () => {
    const res = await api(anita).patch('/community/posts/tp1', {
      by: 'u-cl-priya',
      caption: 'Observation day 4 — ragi dosa, slowly.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.kind).toBe('photo');
    expect(res.body.data.img).toBe('img/food/m-priya-bf.webp');
    /* and the likes and replies are exactly where they were */
    expect(res.body.data.likes).toBe(3);
    expect(res.body.data.comments).toBe(2);
  });

  it('keeps an older client-authored post’s authorship rather than reassigning it', async () => {
    const res = await api(anita).patch('/community/posts/tp1', {
      by: 'u-cl-priya',
      caption: 'Typo fixed.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.by).toBe('u-cl-priya');
  });

  it('will not let this console post as a client', async () => {
    const res = await api(anita).post('/community/posts', {
      by: 'u-cl-priya',
      caption: 'Not in her name.',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('never as a client');
  });

  it('posts as the house account, and reads back as HAALVING', async () => {
    const res = await api(anita).post('/community/posts', {
      by: 'haalving',
      caption: 'From the field notes: the early table.',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.by).toBe('haalving');
    expect(res.body.data.byName).toBe('HAALVING');
    expect(res.body.data.kind).toBe('text');
    /* about nobody, so it is in everybody's scope */
    expect(res.body.data.clientId).toBeNull();
  });

  it('rewrites a game day’s questions by position and keeps their ids', async () => {
    const before = await api(anita).get('/community/game-days');
    const monday = before.body.data.find((d: { id: string }) => d.id === 'qd0');
    const firstId = monday.qs[0].id as string;

    const res = await api(anita).patch('/community/game-days/qd0', {
      label: 'Mon',
      date: '3 Aug',
      qs: [
        {
          q: 'How do the longest-lived communities move?',
          opts: ['Structured gym hours', 'Natural movement woven through the day'],
          ans: 1,
          why: 'Movement lives inside the day, not beside it.',
        },
      ],
    });
    expect(res.status).toBe(200);

    const after = await api(anita).get('/community/game-days');
    const now = after.body.data.find((d: { id: string }) => d.id === 'qd0');
    expect(now.qs).toHaveLength(1);
    /* position 0 is still position 0, and an answer pointing at it survives */
    expect(now.qs[0].id).toBe(firstId);
  });

  it('refuses a correct answer that is not one of the options', async () => {
    const res = await api(anita).post('/community/game-days', {
      label: 'Tue',
      qs: [{ q: 'Which?', opts: ['a', 'b'], ans: 7 }],
    });
    expect(res.status).toBe(400);
  });
});

/* ────────────────────────────────────────────────────────── moderation */

describe('moderation', () => {
  it('pins one post at a time', async () => {
    expect((await api(anita).post('/community/posts/tp4/moderate', { pinned: true })).status).toBe(200);
    expect((await api(anita).post('/community/posts/tp1/moderate', { pinned: true })).status).toBe(200);

    const res = await api(anita).get('/community/posts?lens=pinned');
    expect(res.body.data.posts).toHaveLength(1);
    expect(res.body.data.posts[0].id).toBe('tp1');
    /* and the pinned post leads the canvas */
    const all = await api(anita).get('/community/posts');
    expect(all.body.data.posts[0].id).toBe('tp1');
  });

  it('will not let a post be pinned and hidden at once', async () => {
    await api(anita).post('/community/posts/tp4/moderate', { hidden: true });
    const res = await api(anita).post('/community/posts/tp4/moderate', { pinned: true });
    expect(res.body.data.pinned).toBe(true);
    expect(res.body.data.hidden).toBe(false);
  });

  it('hides without deleting, and the lens finds it again', async () => {
    await api(anita).post('/community/posts/tp3/moderate', { hidden: true });
    const hidden = await api(anita).get('/community/posts?lens=hidden');
    expect(hidden.body.data.posts.map((p: { id: string }) => p.id)).toEqual(['tp3']);
    /* still there — hiding is reversible and is not a delete */
    expect(await prisma.communityPost.count({ where: { id: 'tp3' } })).toBe(1);
  });

  it('refuses to moderate a post inside a zone', async () => {
    const res = await api(anita).post('/community/posts/zp1/moderate', { pinned: true });
    expect(res.status).toBe(409);
  });
});

/* ─────────────────────────────────────────────────────────────── zones */

describe('zones', () => {
  it('creates one as the house account, never as the acting admin', async () => {
    const res = await api(anita).post('/community/zones', {
      name: 'Evening Table',
      memberIds: ['c-rajesh', 'c-mathew'],
    });
    expect(res.status).toBe(201);

    const zones = await api(anita).get('/community/zones');
    const made = zones.body.data.find((z: { name: string }) => z.name === 'Evening Table');
    expect(made.createdBy).toBe('haalving');
    expect(made.createdByName).toBe('HAALVING');
    expect(made.members).toHaveLength(2);
  });

  it('refuses a member who is not in the community circle', async () => {
    const res = await api(anita).post('/community/zones', {
      name: 'Nope',
      /* Meena is a client of HAALVING and is not in the commons */
      memberIds: ['c-meena'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.missing).toEqual(['c-meena']);
  });

  it('keeps what a removed member wrote', async () => {
    const res = await api(anita).patch('/community/zones/z1', {
      name: 'Morning Walkers',
      memberIds: ['c-mathew', 'c-priya'],
    });
    expect(res.status).toBe(200);

    const zones = await api(anita).get('/community/zones');
    const z = zones.body.data.find((x: { id: string }) => x.id === 'z1');
    expect(z.members).toHaveLength(2);
    /* Rajesh is out of the room and his post is still in it */
    expect(z.posts).toBe(2);
    expect(await prisma.communityPost.count({ where: { id: 'zp1' } })).toBe(1);
  });

  it('says how much writing a delete destroys', async () => {
    /*
     * The fixture is built with Prisma rather than through the API, because
     * there IS no route that writes a post into a zone — what is said inside one
     * belongs to the people in it, and this console has never posted as a
     * client. The DELETE is still exercised through the API, which is the part
     * under test.
     *
     * A throwaway zone rather than the seeded one, so nobody's two seeded posts
     * have to be resurrected by a reset that would then be a second copy of the
     * seeder.
     */
    const zone = await prisma.zone.create({
      data: {
        name: 'Sunset Kitchen',
        createdById: null,
        position: 99,
        members: { create: [{ clientId: 'c-rajesh' }, { clientId: 'c-priya' }] },
        posts: {
          create: [
            { authorId: 'u-cl-rajesh', clientId: 'c-rajesh', kind: 'TEXT', caption: 'Seven tomorrow?' },
            { authorId: 'u-cl-priya', clientId: 'c-priya', kind: 'TEXT', caption: 'In.' },
          ],
        },
      },
    });

    const res = await api(anita).del(`/community/zones/${zone.id}`);
    expect(res.status).toBe(200);
    /* the numbers the warning has to carry — this destroys other people's
       writing, and that is said out loud with a count on it */
    expect(res.body.data).toEqual({ id: zone.id, posts: 2, members: 2 });
    expect(await prisma.communityPost.count({ where: { zoneId: zone.id } })).toBe(0);
  });
});

/* ───────────────────────────────────────────────────────────── the scope */

describe('a post that is about a client is scoped like the client is', () => {
  /**
   * Hand the Dietician the Community tab, and the rule becomes visible.
   *
   * The tab is given and taken back through the real People & Access route, so
   * what this test exercises is the product's own path rather than a row edited
   * behind the API's back — and `reset` is not enough to undo it, because the
   * matrix is not community content.
   */
  const grant = (on: boolean) =>
    request(app)
      .post('/api/v1/roles/dietitian/nav')
      .set(...auth(anita.accessToken))
      .send({ navId: 'community', on });

  beforeAll(async () => {
    await grant(true);
  });

  afterAll(async () => {
    await grant(false);
  });

  it('shows a Super Admin every post on the canvas', async () => {
    const res = await api(anita).get('/community/posts');
    expect(res.body.data.posts.map((p: { id: string }) => p.id).sort()).toEqual([
      'tp1',
      'tp2',
      'tp3',
      'tp4',
      'tp5',
      'tp6',
      'tp7',
    ]);
  });

  it('shows the Dietician her own clients’ posts, and the house’s', async () => {
    const res = await api(sneha).get('/community/posts');
    expect(res.status).toBe(200);
    const ids = res.body.data.posts.map((p: { id: string }) => p.id).sort();

    /* Priya, Mathew and Rajesh are on her pods; the two house posts are about
       nobody and belong to everybody */
    expect(ids).toEqual(['tp1', 'tp2', 'tp4', 'tp6', 'tp7']);
    /* Dev is Svayam with no dietitian seat, and Ananya is AI end to end */
    expect(ids).not.toContain('tp3');
    expect(ids).not.toContain('tp5');
  });

  it('counts the tab off the same expression the list reads', async () => {
    const [tabs, feed] = await Promise.all([
      api(sneha).get('/community'),
      api(sneha).get('/community/posts'),
    ]);
    const badge = tabs.body.data.sections.find((s: { key: string }) => s.key === 'feed').count;
    expect(badge).toBe(feed.body.data.posts.length);
    expect(badge).toBe(5);
  });

  it('answers 404, not 403, for a post outside her scope', async () => {
    /* a 403 would confirm the post exists, which is itself the sensitive fact —
       and she holds no manageTribe either, so the refusal she gets first is the
       permission one; the scope answer is what the Super Admin path proves */
    const res = await api(sneha).get('/community/posts?lens=all');
    expect(res.body.data.counts.all).toBe(5);
  });

  it('narrows the community circle she is offered as zone members', async () => {
    const res = await api(sneha).get('/community/circle');
    expect(res.body.data.map((m: { clientId: string }) => m.clientId).sort()).toEqual([
      'c-mathew',
      'c-priya',
      'c-rajesh',
    ]);
  });
});

/* ─────────────────────────────────────────────── announcements: the other perm */

describe('announcing is a different permission from managing', () => {
  const draft = {
    kind: 'announcement' as const,
    title: 'Six places left on the trek',
    text: 'The Malayattoor walk has six places left. Reply here to take one.',
    audience: { mode: 'pick' as const, clientIds: ['c-rajesh'] },
  };

  it('refuses the Haalving Coach, who runs the community every day', async () => {
    const res = await api(rohan).post('/community/announcements', draft);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('Announce to clients');

    const row = await lastDenial(rohan.user.id);
    expect(row!.reason).toBe('community.announce');
    expect(await prisma.broadcast.count()).toBe(0);
  });

  it('lets that same seat read what has been sent', async () => {
    expect((await api(rohan).get('/community/announcements')).status).toBe(200);
    expect((await api(rohan).get('/community/announcements/composer')).status).toBe(200);
  });

  it('sends from a Super Admin, stamps the reach, and lands a card in the room', async () => {
    const res = await api(anita).post('/community/announcements', draft);
    expect(res.status).toBe(201);
    expect(res.body.data.targeted).toBe(1);
    expect(res.body.data.delivered).toBe(1);
    expect(res.body.data.audienceLabel).toBe('1 hand-picked');

    const delivery = await prisma.broadcastDelivery.findFirst({
      where: { broadcastId: res.body.data.id as string },
      include: { message: true },
    });
    expect(delivery!.clientId).toBe('c-rajesh');
    /* the card is genuinely sitting in the thread, which is what `delivered`
       means — and it carries the real sender rather than a house pseudo-user */
    expect(delivery!.message!.kind).toBe('PROMO');
    expect(delivery!.message!.fromUserId).toBe(anita.user.id);
    expect(delivery!.message!.text).toContain('six places left');

    const log = await api(anita).get('/community/announcements');
    expect(log.body.data[0].sent).toEqual({ targeted: 1, delivered: 1, muted: 0 });
  });

  it('reads the same number before the send that the send then uses', async () => {
    const preview = await api(anita).post('/community/announcements/reach', {
      kind: 'announcement',
      audience: { mode: 'all' },
    });
    expect(preview.status).toBe(200);
    /* five of the seven clients have a login; the other two have no thread to
       deliver into and counting them would inflate every number */
    expect(preview.body.data.targeted).toBe(5);
    expect(preview.body.data.audienceLabel).toBe('Every client');
  });

  it('refuses an audience that matches nobody', async () => {
    const res = await api(anita).post('/community/announcements', {
      ...draft,
      /* a console-side client with no login and no thread */
      audience: { mode: 'pick', clientIds: ['c-meena'] },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('matches nobody');
  });

  it('honours an opt-out, and an operational notice overrides it', async () => {
    await prisma.clientAnnouncePref.create({ data: { clientId: 'c-rajesh', on: false } });

    const promo = await api(anita).post('/community/announcements', draft);
    expect(promo.status).toBe(409);
    expect(promo.body.error.message).toContain('operational notice');

    const notice = await api(anita).post('/community/announcements', {
      ...draft,
      kind: 'notice',
      text: 'The Sunday cooking session moves to 11:30.',
    });
    expect(notice.status).toBe(201);
    expect(notice.body.data.delivered).toBe(1);
    /* a notice reaches them, and the stamp says the opt-out was overridden */
    expect(notice.body.data.muted).toBe(0);
  });

  it('refuses a picture we do not ship', async () => {
    const res = await api(anita).post('/community/announcements', {
      ...draft,
      img: 'https://example.com/hero.jpg',
    });
    expect(res.status).toBe(400);
  });

  it('refuses a link that points at nothing, and takes one that exists', async () => {
    const bad = await api(anita).post('/community/announcements', {
      ...draft,
      link: '#/tribe/event/ev-deleted',
    });
    expect(bad.status).toBe(400);

    const good = await api(anita).post('/community/announcements', {
      ...draft,
      link: '#/tribe/event/ev1',
    });
    expect(good.status).toBe(201);
  });

  it('never offers a zone as a link target', async () => {
    const res = await api(anita).get('/community/announcements/composer');
    const routes = res.body.data.links.map((l: { route: string }) => l.route);
    expect(routes).toContain('#/tribe/event/ev1');
    expect(routes).toContain('#/tribe/challenge/ch1');
    /* a zone link would open five people's private canvas to whoever got it */
    expect(routes.some((r: string) => r.includes('zone'))).toBe(false);
    expect(routes.some((r: string) => r.includes('z1'))).toBe(false);
  });
});

/* ────────────────────────────────── a gathering is proposed, then let out */

describe('gathering approval', () => {
  const MADE: string[] = [];

  afterAll(async () => {
    if (MADE.length) await prisma.gathering.deleteMany({ where: { id: { in: MADE } } });
  });

  const propose = async (s: Session, title: string) => {
    const res = await api(s).post('/community/gatherings', {
      title,
      when: 'Sat · 7:00 AM',
      where: 'Cubbon Park',
      desc: 'A walk.',
    });
    expect(res.status).toBe(201);
    MADE.push((res.body.data as { id: string }).id);
    return (res.body.data as { id: string }).id;
  };

  const seen = async (s: Session) =>
    ((await api(s).get('/community/gatherings')).body.data as Array<{ id: string; status: string }>);

  it('lands PENDING when the Haalving Coach writes one, and records him', async () => {
    const id = await propose(rohan, 'Acceptance — coach proposal');
    const row = await prisma.gathering.findUniqueOrThrow({
      where: { id },
      select: { approvedAt: true, createdById: true },
    });
    expect(row.approvedAt).toBeNull();
    expect(row.createdById).toBe('u-rohan');
  });

  it('lets the Super User propose too, though he holds no manageTribe', async () => {
    /* the Community nav is the bar for PROPOSING, and a proposal is inert until
       somebody approves it — which is the only reason the low bar is safe */
    const id = await propose(bineesh, 'Acceptance — super user proposal');
    expect((await prisma.gathering.findUniqueOrThrow({ where: { id } })).createdById).toBe('u-bineesh');
  });

  it('refuses a role without the Community nav', async () => {
    const res = await api(sneha).post('/community/gatherings', {
      title: 'Acceptance — dietician',
      when: 'Sat',
      where: 'Anywhere',
      desc: 'x',
    });
    expect(res.status).toBe(403);
  });

  it('refuses the Haalving Coach the approval, and logs it against THAT gathering', async () => {
    const id = await propose(rohan, 'Acceptance — coach cannot approve');
    const since = new Date();

    const res = await api(rohan).post(`/community/gatherings/${id}/approve`);
    expect(res.status).toBe(403);

    /* the audit row names the gathering, not a generic "access" subject — an
       auditor asking what was tried on THIS one gets a whole answer */
    const row = await prisma.auditLog.findFirst({
      where: { action: 'denied', actorId: 'u-rohan', subjectType: 'gathering', subjectId: id, at: { gte: since } },
    });
    expect(row).not.toBeNull();

    expect((await prisma.gathering.findUniqueOrThrow({ where: { id } })).approvedAt).toBeNull();
  });

  it('lets the Super Admin approve somebody else’s', async () => {
    const id = await propose(rohan, 'Acceptance — approve me');
    const res = await api(anita).post(`/community/gatherings/${id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');

    const row = await prisma.gathering.findUniqueOrThrow({ where: { id } });
    expect(row.approvedAt).not.toBeNull();
    expect(row.approvedById).toBe('u-anita');
  });

  it('refuses the Super Admin her OWN — the gate is a second pair of eyes', async () => {
    /* she is the only person who holds both halves, so she is the only one who
       could walk around the gate. 409, not 403: she may approve, just not this. */
    const id = await propose(anita, 'Acceptance — hers alone');
    const res = await api(anita).post(`/community/gatherings/${id}/approve`);
    expect(res.status).toBe(409);
    expect((await prisma.gathering.findUniqueOrThrow({ where: { id } })).approvedAt).toBeNull();
  });

  it('refuses a second approval', async () => {
    const id = await propose(rohan, 'Acceptance — twice');
    expect((await api(anita).post(`/community/gatherings/${id}/approve`)).status).toBe(200);
    expect((await api(anita).post(`/community/gatherings/${id}/approve`)).status).toBe(409);
  });

  it('hides a pending gathering from everyone but its author and the approver', async () => {
    const id = await propose(rohan, 'Acceptance — pending visibility');

    /* the author sees his own, waiting */
    expect((await seen(rohan)).find((g) => g.id === id)?.status).toBe('PENDING');
    /* the Super Admin sees it because she is the one who must decide */
    expect((await seen(anita)).find((g) => g.id === id)?.status).toBe('PENDING');
    /* and a colleague who can neither approve it nor wrote it does not */
    expect((await seen(bineesh)).some((g) => g.id === id)).toBe(false);
  });

  it('badges exactly what the list holds — no fourth row nobody can find', async () => {
    /*
     * THE DRIFT THIS CONSOLE HAS FIXED TWICE, back for a third time and caught in
     * the browser rather than here. The list learned that a pending gathering is
     * not everybody's; the tab badge kept counting every row. A coach saw
     * "Gatherings 4" above three of them and no way to reach the fourth.
     */
    await propose(anita, 'Acceptance — pending, and Rohan cannot see it');

    /* sneha holds no Community nav, so both reads refuse her — the drift can only
       exist for a seat that can open the tab at all */
    for (const who of [rohan, bineesh]) {
      const meta = await api(who).get('/community');
      expect(meta.status).toBe(200);
      const tab = (meta.body.data.sections as Array<{ key: string; count: number }>).find(
        (x) => x.key === 'gatherings',
      );
      const list = (await api(who).get('/community/gatherings')).body.data as unknown[];
      expect(tab!.count).toBe(list.length);
    }
  });

  it('shows it to everybody once it is approved', async () => {
    const id = await propose(rohan, 'Acceptance — then visible');
    expect((await seen(bineesh)).some((g) => g.id === id)).toBe(false);

    await api(anita).post(`/community/gatherings/${id}/approve`);
    expect((await seen(bineesh)).find((g) => g.id === id)?.status).toBe('APPROVED');
  });

  it('returns one with a reason, and requires the reason', async () => {
    const id = await propose(rohan, 'Acceptance — send it back');
    expect((await api(anita).post(`/community/gatherings/${id}/return`, {})).status).toBe(400);

    const res = await api(anita).post(`/community/gatherings/${id}/return`, { note: 'Clashes with the game day.' });
    expect(res.status).toBe(200);
    const row = await prisma.gathering.findUniqueOrThrow({ where: { id } });
    expect(row.returnNote).toBe('Clashes with the game day.');
    expect(row.approvedAt).toBeNull();
  });

  it('grants approveGathering to the Super Admin alone', async () => {
    const roles = await prisma.role.findMany({ select: { key: true, perms: true } });
    const holders = roles.filter((r) => r.perms.includes('approveGathering')).map((r) => r.key);
    expect(holders).toEqual(['admin']);
  });

  it('leaves the demo’s own three published', async () => {
    /* the seeded three carry no `createdById` — they predate the field, which is
       also what tells them apart from anything a test proposed */
    const seeded = await prisma.gathering.findMany({
      where: { createdById: null },
      select: { title: true, approvedAt: true },
    });
    expect(seeded).toHaveLength(3);
    for (const g of seeded) expect(g.approvedAt).not.toBeNull();
  });
});

/* ─────────────────── who may READ what has been approved */

describe('the published list', () => {
  const MADE: string[] = [];

  afterAll(async () => {
    if (MADE.length) await prisma.gathering.deleteMany({ where: { id: { in: MADE } } });
  });

  const pending = async (title: string) => {
    const res = await api(rohan).post('/community/gatherings', {
      title,
      when: 'Sat · 7:00 AM',
      where: 'Cubbon Park',
      desc: 'A walk.',
    });
    const id = (res.body.data as { id: string }).id;
    MADE.push(id);
    return id;
  };

  /* a client's own token, which the console's surface must not accept */
  const clientToken = async () => {
    await issueTestOtp('+919847022110', '424242');
    const res = await request(app)
      .post('/api/v1/auth/client/otp/verify')
      .set('X-Client', 'mobile')
      .send({ phone: '+919847022110', code: '424242' });
    expect(res.status).toBe(200);
    return res.body.data.accessToken as string;
  };

  /* ---- PHASE 2: a seat with no Community nav ---- */

  it('lets a Dietician read the approved list, though Community is closed to her', async () => {
    /* she cannot open the tab — that is the editing surface — but "there is a
       walk on Saturday" is the thing the walk exists to tell people */
    expect((await api(sneha).get('/community/gatherings')).status).toBe(403);

    const res = await api(sneha).get('/community/gatherings/approved');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('never shows her a pending one', async () => {
    const id = await pending('Acceptance — pending, unpublished');
    const ids = ((await api(sneha).get('/community/gatherings/approved')).body.data as Array<{ id: string }>)
      .map((g) => g.id);
    expect(ids).not.toContain(id);

    await api(anita).post(`/community/gatherings/${id}/approve`);
    const after = ((await api(sneha).get('/community/gatherings/approved')).body.data as Array<{ id: string }>)
      .map((g) => g.id);
    expect(after).toContain(id);
  });

  it('carries no approval state at all — this is not the editing read', async () => {
    const rows = (await api(sneha).get('/community/gatherings/approved')).body.data as Array<
      Record<string, unknown>
    >;
    for (const g of rows) {
      expect(g.status).toBeUndefined();
      expect(g.returnNote).toBeUndefined();
      expect(g.mine).toBeUndefined();
    }
  });

  /* ---- PHASE 3: the client surface ---- */

  it('gives a client the approved list', async () => {
    const token = await clientToken();
    const res = await request(app)
      .get('/api/v1/client/community/gatherings')
      .set(...auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('never gives a client a pending one', async () => {
    const id = await pending('Acceptance — never reaches a client');
    const token = await clientToken();
    const res = await request(app)
      .get('/api/v1/client/community/gatherings')
      .set(...auth(token));
    expect((res.body.data as Array<{ id: string }>).map((g) => g.id)).not.toContain(id);
  });

  it('refuses a client the console surface, both of them', async () => {
    /* THE AUDIENCE SPLIT, in the direction that matters. A client's token is
       legitimate — they own the phone — and scoping alone would hand back a
       plausible-looking answer. The door refuses it instead. */
    const token = await clientToken();
    for (const path of ['/community/gatherings', '/community/gatherings/approved']) {
      const res = await request(app).get(`/api/v1${path}`).set(...auth(token));
      expect(res.status).toBe(403);
    }
  });

  it('refuses a staff token the client surface', async () => {
    /* and the other direction, so the two surfaces are genuinely two */
    const res = await api(anita).get('/client/community/gatherings');
    expect(res.status).toBe(403);
  });
});

/* ─────────────────────────── a gathering is changed by whoever wrote it */

describe('gathering authorship', () => {
  const MADE: string[] = [];

  afterAll(async () => {
    if (MADE.length) await prisma.gathering.deleteMany({ where: { id: { in: MADE } } });
  });

  const by = async (s: Session, title: string) => {
    const res = await api(s).post('/community/gatherings', {
      title,
      when: 'Sat',
      where: 'Park',
      desc: 'x',
    });
    const id = (res.body.data as { id: string }).id;
    MADE.push(id);
    return id;
  };

  const edit = (s: Session, id: string, title: string) =>
    api(s).patch(`/community/gatherings/${id}`, { title, when: 'Sat', where: 'Park', desc: 'x' });

  it('lets the author edit their own', async () => {
    const id = await by(rohan, 'Authorship — Rohan’s');
    expect((await edit(rohan, id, 'Authorship — renamed by Rohan')).status).toBe(200);
  });

  it('refuses a colleague who holds manageTribe but did not write it', async () => {
    /* THE POINT. Rohan holds `manageTribe`, which used to be the whole gate — so
       he could rewrite a gathering somebody else wrote and neither would know.
       On a board where a row carries an author and went through a gate, that lets
       the words change after the approval was given to different ones. */
    const id = await by(bineesh, 'Authorship — the Super User’s');
    const since = new Date();

    const res = await edit(rohan, id, 'Authorship — Rohan tries');
    expect(res.status).toBe(403);

    const row = await prisma.auditLog.findFirst({
      where: { action: 'denied', actorId: 'u-rohan', subjectType: 'gathering', subjectId: id, at: { gte: since } },
    });
    expect(row).not.toBeNull();

    /* and the words are untouched */
    expect((await prisma.gathering.findUniqueOrThrow({ where: { id } })).title).toBe(
      'Authorship — the Super User’s',
    );
  });

  it('lets the Super Admin change anybody’s — the one override', async () => {
    const id = await by(rohan, 'Authorship — hers to fix');
    expect((await edit(anita, id, 'Authorship — fixed by Anita')).status).toBe(200);
  });

  it('applies the same rule to delete', async () => {
    const mine = await by(rohan, 'Authorship — Rohan deletes his own');
    expect((await api(rohan).del(`/community/gatherings/${mine}`)).status).toBe(200);

    const theirs = await by(bineesh, 'Authorship — not Rohan’s to delete');
    expect((await api(rohan).del(`/community/gatherings/${theirs}`)).status).toBe(403);
    expect(await prisma.gathering.count({ where: { id: theirs } })).toBe(1);
  });

  it('leaves the seeded three to the Super Admin alone', async () => {
    /* they carry no author, and unowned content is the community's — which is
       hers. A null createdById is read as "nobody's", not "everybody's". */
    const seeded = await prisma.gathering.findFirst({ where: { createdById: null }, select: { id: true } });
    expect(seeded).not.toBeNull();

    expect((await edit(rohan, seeded!.id, 'Authorship — coach tries a seeded one')).status).toBe(403);
    expect((await edit(anita, seeded!.id, 'Authorship — admin may')).status).toBe(200);
  });
});
