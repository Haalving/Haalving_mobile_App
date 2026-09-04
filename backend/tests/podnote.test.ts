import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import clientRoutes from '../src/routes/client.routes.js';
import { app, auth, clearRateLimits, closeConnections, issueTestOtp, loginStaff, type Session } from './helpers.js';

/**
 * POD NOTES — the private panel, and the wall around it.
 *
 * Half this file is CRUD and authorship. The other half is one assertion said
 * three ways, because it is the assertion the feature lives or dies on: a note
 * written about a client must never be readable BY that client. It is checked
 * against the answers the server actually gives (every GET the client surface
 * registers, walked), against the door (a client token on the console route), and
 * against the SOURCE (no client-facing file so much as names the table) — because
 * a leak could arrive through any of the three and a test of one would not see it.
 */

const RAJESH_PHONE = '+919847022110';

/** A string that could only have come from a pod note. */
const MARKER = `pod-note-canary-${Date.now()}`;

let anita: Session; /* Super Admin — seeAllClients AND managePeople */
let sneha: Session; /* Dietician — sits on Rajesh's pod, not on Dev's */
let vikram: Session; /* Fitness Coach — sits on Rajesh's pod too, but wrote nothing */
let rajesh: string; /* the client the notes are ABOUT */
let runStartedAt: Date;

async function clientToken(phone: string, code: string): Promise<string> {
  await issueTestOtp(phone, code);
  const res = await request(app)
    .post('/api/v1/auth/client/otp/verify')
    .set('X-Client', 'mobile')
    .send({ phone, code });
  expect(res.status, `otp verify for ${phone}`).toBe(200);
  return res.body.data.accessToken as string;
}

const get = (token: string, path: string) =>
  request(app)
    .get(`/api/v1${path}`)
    .set(...auth(token));

const post = (token: string, path: string, body?: object) =>
  request(app)
    .post(`/api/v1${path}`)
    .set(...auth(token))
    .send(body ?? {});

const patch = (token: string, path: string, body: object) =>
  request(app)
    .patch(`/api/v1${path}`)
    .set(...auth(token))
    .send(body);

const del = (token: string, path: string) =>
  request(app)
    .delete(`/api/v1${path}`)
    .set(...auth(token));

/** Write one straight into the table, for the tests that need a note to already exist. */
async function seedNote(clientId: string, authorId: string, content: string): Promise<string> {
  const row = await prisma.podNote.create({ data: { clientId, authorId, content }, select: { id: true } });
  return row.id;
}

beforeAll(async () => {
  runStartedAt = new Date();
  await clearRateLimits();
  [anita, sneha, vikram, rajesh] = await Promise.all([
    loginStaff('anita'),
    loginStaff('sneha'),
    loginStaff('vikram'),
    clientToken(RAJESH_PHONE, '454545'),
  ]);
});

/* the OTP door is rate limited and this suite opens it once, but staff login shares
   the same bucket — the other suites in a full run have already spent some of it */
beforeEach(clearRateLimits);

afterAll(async () => {
  /* only the rows this run wrote, on the two records it wrote them to. A HARD
     delete, which is the opposite of what the service does on purpose: the product
     keeps a deleted note because it is the record of a decision, and a test fixture
     is not a decision. Audit rows are left alone — the log is append-only by design
     and a test that erased it would be lying about that. */
  await prisma.podNote.deleteMany({
    where: { clientId: { in: ['c-rajesh', 'c-meena'] }, createdAt: { gte: runStartedAt } },
  });
  await closeConnections();
});

/* ───────────────────────────────────────────────────────────── the panel */

describe('pod notes — the panel', () => {
  it('writes one, and hands back the author and a clean editedAt', async () => {
    const res = await post(anita.accessToken, '/clients/c-rajesh/pod-notes', {
      content: 'Prefers early sessions — his shift starts at eleven.',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      content: 'Prefers early sessions — his shift starts at eleven.',
      author: { id: 'u-anita', name: 'Anita R.' },
      editedAt: null,
    });
    expect(res.body.data.id).toBeTruthy();
  });

  it('lists newest first, for every seat on the pod', async () => {
    await seedNote('c-rajesh', 'u-sneha', 'Lactose intolerant — the plan already accounts for it.');
    const res = await get(vikram.accessToken, '/clients/c-rajesh/pod-notes');
    expect(res.status).toBe(200);

    const rows = res.body.data as { content: string; createdAt: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.createdAt >= rows[i]!.createdAt).toBe(true);
    }
    expect(rows.map((r) => r.content)).toContain('Lactose intolerant — the plan already accounts for it.');
  });

  it('refuses an empty note before the database is touched', async () => {
    const res = await post(anita.accessToken, '/clients/c-rajesh/pod-notes', { content: '   ' });
    expect(res.status).toBe(400);
  });

  it('stamps editedAt on an edit, and only on an edit', async () => {
    const id = await seedNote('c-rajesh', 'u-sneha', 'Travels the first week of every month.');
    const before = await get(sneha.accessToken, '/clients/c-rajesh/pod-notes');
    const original = (before.body.data as { id: string; editedAt: string | null }[]).find((r) => r.id === id);
    expect(original?.editedAt).toBeNull();

    const res = await patch(sneha.accessToken, `/clients/c-rajesh/pod-notes/${id}`, {
      content: 'Travels the first week of every month — book around it.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('Travels the first week of every month — book around it.');
    expect(res.body.data.editedAt).toBeTruthy();
  });

  it('deletes softly — off the panel, still in the record', async () => {
    const id = await seedNote('c-rajesh', 'u-sneha', 'Duplicate of the line above.');

    expect((await del(sneha.accessToken, `/clients/c-rajesh/pod-notes/${id}`)).status).toBe(200);

    const after = await get(sneha.accessToken, '/clients/c-rajesh/pod-notes');
    expect((after.body.data as { id: string }[]).map((r) => r.id)).not.toContain(id);

    /* the row is still there, carrying the date it left the panel */
    const row = await prisma.podNote.findUnique({ where: { id }, select: { deletedAt: true } });
    expect(row?.deletedAt).toBeTruthy();

    /* and a second delete is a 404, not a re-stamp that moves that date */
    expect((await del(sneha.accessToken, `/clients/c-rajesh/pod-notes/${id}`)).status).toBe(404);
  });
});

/* ──────────────────────────────────────────────────────── who may change one */

describe('pod notes — authorship', () => {
  it('refuses a colleague on the same pod, and logs the attempt', async () => {
    const id = await seedNote('c-rajesh', 'u-sneha', 'Sneha wrote this one.');

    const res = await patch(vikram.accessToken, `/clients/c-rajesh/pod-notes/${id}`, { content: 'Vikram edits it.' });
    expect(res.status).toBe(403);

    const logged = await prisma.auditLog.findFirst({
      where: { action: 'denied', subjectType: 'podNote', subjectId: id, actorId: 'u-vikram' },
    });
    expect(logged).toBeTruthy();

    /* and the words are untouched */
    const row = await prisma.podNote.findUnique({ where: { id }, select: { content: true } });
    expect(row?.content).toBe('Sneha wrote this one.');
  });

  it('lets managePeople correct a note left by somebody else', async () => {
    const id = await seedNote('c-rajesh', 'u-sneha', 'Left behind by a coach who has moved on.');
    const res = await patch(anita.accessToken, `/clients/c-rajesh/pod-notes/${id}`, {
      content: 'Corrected by the Super Admin.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('Corrected by the Super Admin.');
  });

  it('refuses a colleague the delete too', async () => {
    const id = await seedNote('c-rajesh', 'u-sneha', 'Not Vikram’s to remove.');
    expect((await del(vikram.accessToken, `/clients/c-rajesh/pod-notes/${id}`)).status).toBe(403);
    const row = await prisma.podNote.findUnique({ where: { id }, select: { deletedAt: true } });
    expect(row?.deletedAt).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────── scope */

describe('pod notes — scope', () => {
  it('404s a client the caller may not see, on the read and on the write', async () => {
    /* Dev is Svayam with only Fitness bought, so his pod carries no dietitian seat */
    expect((await get(sneha.accessToken, '/clients/c-dev/pod-notes')).status).toBe(404);
    expect(
      (await post(sneha.accessToken, '/clients/c-dev/pod-notes', { content: 'Should never land.' })).status,
    ).toBe(404);
  });

  it('404s a note id borrowed from another client’s record', async () => {
    const id = await seedNote('c-meena', 'u-sneha', 'Meena’s note, not Rajesh’s.');
    /* the caller can see BOTH clients — the refusal is about the note belonging to
       the record in the path, which is why the id is in the WHERE and not compared
       after the row has already been loaded */
    const res = await patch(anita.accessToken, `/clients/c-rajesh/pod-notes/${id}`, { content: 'Moved.' });
    expect(res.status).toBe(404);
  });
});

/* ═══════════════════════════════════════════ THE WALL — a client sees none of it */

describe('pod notes never reach the client they are about', () => {
  /**
   * The GET routes the client surface registers, filled in where they take a
   * parameter.
   *
   * READ OFF THE ROUTER RATHER THAN LISTED, so a route added to the client surface
   * tomorrow is walked by this test without anybody remembering to add it here. A
   * parametrised path this map does not cover FAILS the test rather than being
   * skipped — a silently skipped route is exactly the hole this file exists to
   * close.
   */
  const FILLED: Record<string, string> = {
    '/client/plan/:pillar': '/client/plan/fitness',
  };

  let noteId: string;

  beforeAll(async () => {
    noteId = await seedNote('c-rajesh', 'u-sneha', `Do not show this to him. ${MARKER}`);
    /* the meal id the surface's one parametrised GET needs */
    const meal = await prisma.meal.findFirst({ where: { clientId: 'c-rajesh' }, select: { id: true } });
    FILLED['/client/meals/:id'] = `/client/meals/${meal?.id ?? 'none'}`;
  });

  it('refuses a client token the console route outright', async () => {
    /* `staffOnly`, so it is a 403 at the door — the service is never reached, and
       the scope that would have resolved him to his OWN record never runs */
    expect((await get(rajesh, '/clients/c-rajesh/pod-notes')).status).toBe(403);
    expect((await post(rajesh, '/clients/c-rajesh/pod-notes', { content: 'mine' })).status).toBe(403);
    expect((await patch(rajesh, `/clients/c-rajesh/pod-notes/${noteId}`, { content: 'mine' })).status).toBe(403);
    expect((await del(rajesh, `/clients/c-rajesh/pod-notes/${noteId}`)).status).toBe(403);
  });

  it('is absent from every GET the client surface answers', async () => {
    interface RouteLayer {
      route?: { path: string; methods: Record<string, boolean> };
    }
    const stack = (clientRoutes as unknown as { stack: RouteLayer[] }).stack;

    const paths: string[] = [];
    for (const layer of stack) {
      const route = layer.route;
      if (!route?.methods.get) continue;
      if (!route.path.includes(':')) {
        paths.push(route.path);
        continue;
      }
      const filled = FILLED[route.path];
      expect(filled, `${route.path} takes a parameter this test does not know how to fill`).toBeTruthy();
      paths.push(filled!);
    }

    /* the walk has to have actually walked something — an enumeration that silently
       found nothing would pass every assertion below it */
    expect(paths.length).toBeGreaterThanOrEqual(10);

    for (const path of paths) {
      const res = await get(rajesh, path);
      expect(res.status, path).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body, `${path} carried the note's words`).not.toContain(MARKER);
      expect(body.toLowerCase(), `${path} named the table`).not.toContain('podnote');
    }
  });

  it('is not named by any file the client surface is built from', async () => {
    /**
     * THE SOURCE-LEVEL HALF, and it is here because the walk above can only test
     * the routes that exist today against the data that exists today. A serialiser
     * that started including pod notes for a client with none would pass it.
     */
    const roots = [
      join(import.meta.dirname, '../src/services/client-app'),
      join(import.meta.dirname, '../src/routes/client.routes.ts'),
      join(import.meta.dirname, '../src/controllers/client-app.controller.ts'),
    ];

    const files: string[] = [];
    const walk = (p: string): void => {
      if (statSync(p).isDirectory()) {
        for (const entry of readdirSync(p)) walk(join(p, entry));
        return;
      }
      if (p.endsWith('.ts')) files.push(p);
    };
    for (const root of roots) walk(root);
    expect(files.length).toBeGreaterThanOrEqual(6);

    for (const file of files) {
      const src = readFileSync(file, 'utf8').toLowerCase();
      expect(src.includes('podnote'), `${file} names the pod-note table`).toBe(false);
      expect(src.includes('pod-notes'), `${file} names the pod-note route`).toBe(false);
    }
  });
});
