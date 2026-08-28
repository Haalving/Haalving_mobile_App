import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DEFAULT_CHAINS } from '@haalving/shared';

import { prisma } from '../src/config/prisma.js';
import * as config from '../src/services/config.service.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * Configuration, exercised through the API.
 *
 * The load-bearing assertion is the one about VERSIONS: an Ops edit must not move
 * a client who is already mid-cycle. Everything else on this page is a list.
 */

const here = dirname(fileURLToPath(import.meta.url));
const demo = JSON.parse(readFileSync(join(here, '../prisma/demo-seed.json'), 'utf8')) as {
  flowTemplates: Array<{
    id: string; name: string; desc: string | null; trigger: string; defaultOn: boolean;
    steps: Array<{ after: number | null; on: number | null; at: number; title: string; text: string }>;
  }>;
  clientFlows: Record<string, Record<string, boolean>>;
};
const SEEDED_FLOWS = demo.flowTemplates.map((t) => t.id);

let anita: Session; /* Super Admin — manageConfig */
let bineesh: Session; /* Super User — has the nav, cannot write */
let vikram: Session; /* Fitness Coach — no nav at all */

async function reset(): Promise<void> {
  /* every shape a test created; version 1 is the seed's */
  await prisma.client.updateMany({ data: { shapeVersion: 1 } });
  await prisma.programShape.deleteMany({ where: { version: { gt: 1 } } });

  for (const [kind, steps] of Object.entries(DEFAULT_CHAINS)) {
    await prisma.approvalChain.updateMany({
      where: { kind: kind as never },
      data: { steps: steps as never, version: 1 },
    });
  }

  await prisma.slaConfig.updateMany({
    data: { replyTargetMin: 15, notifyAfterMin: 10, escalateAfterMin: 15, escalateToRole: 'admin' },
  });
  await prisma.leaveConfig.updateMany({ data: { approverRole: 'admin' } });

  await prisma.catalogCategory.deleteMany({ where: { seeded: false } });
  await prisma.catalogTag.deleteMany({ where: { slug: { notIn: ['weight loss', 'diabetes', 'pcod', 'muscle building', 'stress', 'sleep'] } } });
  await prisma.notifRule.deleteMany({ where: { title: 'Sleep nudge' } });
  /*
   * The templates are RESTORED, not merely pruned: one test legitimately deletes a
   * seeded template (after pausing it, which is the only way that is allowed), and
   * the next test has to find it back.
   */
  await prisma.flowTemplate.deleteMany({ where: { id: { notIn: SEEDED_FLOWS } } });
  for (const [i, t] of demo.flowTemplates.entries()) {
    const data = {
      name: t.name,
      desc: t.desc,
      trigger: t.trigger as never,
      defaultOn: t.defaultOn,
      enabled: true,
      position: i,
    };
    await prisma.flowTemplate.upsert({ where: { id: t.id }, create: { id: t.id, ...data }, update: data });
    await prisma.flowStep.deleteMany({ where: { templateId: t.id } });
    for (const [j, st] of t.steps.entries()) {
      await prisma.flowStep.create({
        data: { templateId: t.id, after: st.after, on: st.on, at: st.at, title: st.title, text: st.text, position: j },
      });
    }
  }
  await prisma.clientFlow.deleteMany({});
  for (const [clientId, map] of Object.entries(demo.clientFlows)) {
    for (const [templateId, on] of Object.entries(map)) {
      if (!SEEDED_FLOWS.includes(templateId)) continue;
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) continue;
      await prisma.clientFlow.create({ data: { clientId, templateId, on: !!on } });
    }
  }

  /* the cache would otherwise answer with what the last test wrote */
  await config.invalidate(...Object.values(config.CACHE_KEYS));
}

beforeAll(async () => {
  await clearRateLimits();
  [anita, bineesh, vikram] = await Promise.all([
    loginStaff('anita'),
    loginStaff('bineesh'),
    loginStaff('vikram'),
  ]);
});

afterAll(async () => {
  await reset();
  await closeConnections();
});

beforeEach(reset);

const api = (s: Session) => ({
  get: (p: string) => request(app).get(`/api/v1${p}`).set(...auth(s.accessToken)),
  put: (p: string, b: object) => request(app).put(`/api/v1${p}`).set(...auth(s.accessToken)).send(b),
  patch: (p: string, b: object) =>
    request(app).patch(`/api/v1${p}`).set(...auth(s.accessToken)).send(b),
  post: (p: string, b?: object) =>
    request(app).post(`/api/v1${p}`).set(...auth(s.accessToken)).send(b ?? {}),
  del: (p: string) => request(app).delete(`/api/v1${p}`).set(...auth(s.accessToken)),
});

const SHAPE = {
  levels: 7,
  cycleDays: 14,
  reviewDay: 12,
  restDays: [5, 10],
  meetingDay: 14,
  termDays: 90,
  sessions: { fitness: 5, yoga: 3, mind: 1 },
};

/* ─────────────────────────────────────────────────────────── the gate */

describe('the gate', () => {
  it('lets a Super User read the whole page', async () => {
    const res = await api(bineesh).get('/config');
    expect(res.status).toBe(200);
    expect(res.body.data.program.cycleDays).toBe(14);
    expect(res.body.data.chains).toHaveLength(7);
  });

  it('refuses a Super User every write, and logs it', async () => {
    const res = await api(bineesh).put('/config/program', SHAPE);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(
      'Super Admin or Operations Head only. This attempt was logged.',
    );

    const logged = await prisma.auditLog.findFirst({
      where: { action: 'denied', subjectType: 'config', actorId: 'u-bineesh' },
      orderBy: { at: 'desc' },
    });
    expect(logged).not.toBeNull();
  });

  it('does not open at all for a coach — the page is not on their sidebar', async () => {
    expect((await api(vikram).get('/config')).status).toBe(403);
  });
});

/* ─────────────────────────────────────────────── the shape, versioned */

describe('the program shape', () => {
  it('refuses a review day outside the cycle, in the demo’s words', async () => {
    const res = await api(anita).put('/config/program', { ...SHAPE, reviewDay: 15 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      'The level review must fall inside the cycle — Day 15 of a 14-day cycle doesn’t exist. Nothing was saved.',
    );
    /* nothing was saved */
    expect(await prisma.programShape.count()).toBe(1);
  });

  it('refuses rest days past the end of the cycle', async () => {
    const res = await api(anita).put('/config/program', { ...SHAPE, restDays: [5, 16, 20] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/day 16 & 20 is past Day 14/);
  });

  /*
   * RULE 2, and the whole reason the table is versioned: a valid save creates a
   * NEW version and leaves every client walking the one their cycle started on.
   */
  it('creates a NEW version and leaves existing clients on the old one', async () => {
    const res = await api(anita).put('/config/program', { ...SHAPE, reviewDay: 11 });
    expect(res.status).toBe(200);

    /* the number itself is a Postgres sequence and does not rewind when a test
       deletes its rows — what matters is that it MOVED and is now the current one */
    expect(res.body.data.version).toBeGreaterThan(1);
    expect((await config.getShape()).version).toBe(res.body.data.version);

    const still = await prisma.client.findMany({ select: { shapeVersion: true } });
    expect(still.every((c) => c.shapeVersion === 1)).toBe(true);
  });

  it('gives a mid-cycle client the shape they started on, not the new one', async () => {
    await api(anita).put('/config/program', { ...SHAPE, reviewDay: 11 });

    const rajesh = await prisma.client.findUnique({ where: { id: 'c-rajesh' } });
    const theirs = await config.getShapeFor(rajesh!);
    expect(theirs.reviewDay).toBe(12);
    expect(theirs.version).toBe(1);

    /* while the CURRENT shape has moved on */
    expect((await config.getShape()).reviewDay).toBe(11);
  });

  it('reads the current shape within a second of the write', async () => {
    await api(anita).put('/config/program', { ...SHAPE, reviewDay: 11 });
    expect((await config.getShape()).reviewDay).toBe(11);
  });

  it('audits before and after', async () => {
    await api(anita).put('/config/program', { ...SHAPE, reviewDay: 11 });
    const log = await prisma.auditLog.findFirst({
      where: { action: 'config.program.changed' },
      orderBy: { at: 'desc' },
    });
    const meta = log!.meta as { before: { reviewDay: number }; after: { reviewDay: number } };
    expect(meta.before.reviewDay).toBe(12);
    expect(meta.after.reviewDay).toBe(11);
  });
});

/* ──────────────────────────────────────────────── the service numbers */

describe('the service numbers', () => {
  /* LIVE, not versioned — the meals queue reads them on every request */
  it('is visible on the next read', async () => {
    const res = await api(anita).patch('/config/service', { replyTargetMin: 20 });
    expect(res.status).toBe(200);
    expect((await config.getSla()).replyTargetMin).toBe(20);
  });

  it('moves the leave approver, and Time & Cover reads the same row', async () => {
    await api(anita).patch('/config/service', { approverRole: 'opshead' });
    expect((await config.getLeaveConfig()).approverRole).toBe('opshead');

    const res = await api(anita).get('/leave/config');
    expect(res.body.data.approverRole).toBe('opshead');
  });

  it('refuses a role that does not exist', async () => {
    expect((await api(anita).patch('/config/service', { escalateToRole: 'wizard' })).status).toBe(400);
  });
});

/* ─────────────────────────────────────────────────────────── chains */

describe('chains', () => {
  it('refuses the same role twice', async () => {
    const res = await api(anita).put('/config/chains/diet', {
      steps: [{ role: 'opshead' }, { role: 'core' }, { role: 'opshead' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('A role can only appear once in a chain. Nothing was saved.');
  });

  it('refuses an empty chain', async () => {
    const res = await api(anita).put('/config/chains/diet', { steps: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('A chain needs at least one signature. Nothing was saved.');
  });

  it('saves a reordered chain and bumps its version', async () => {
    const res = await api(anita).put('/config/chains/diet', {
      steps: [{ role: 'core' }, { role: 'opshead' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(2);
    expect(await config.getChain('diet')).toEqual([{ role: 'core' }, { role: 'opshead' }]);
  });
});

/* ─────────────────────────────────────────────────── notifications */

describe('notifications', () => {
  it('adds a rule that goes to everyone over Push until narrowed', async () => {
    const res = await api(anita).post('/config/notifications', {
      name: 'Sleep nudge',
      schedule: 'Daily · 21:30',
      enabled: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.audience).toBe('All');
    expect(res.body.data.channel).toBe('Push');
  });

  it('refuses a duplicate name', async () => {
    await api(anita).post('/config/notifications', {
      name: 'Sleep nudge',
      schedule: 'Daily',
      enabled: true,
    });
    const again = await api(anita).post('/config/notifications', {
      name: 'Sleep nudge',
      schedule: 'Daily',
      enabled: true,
    });
    expect(again.status).toBe(409);
  });

  it('pauses a rule without deleting it', async () => {
    const rule = await prisma.notifRule.findFirst();
    const res = await api(anita).patch(`/config/notifications/${rule!.id}`, { enabled: false });
    expect(res.status).toBe(200);
    expect((await config.getNotifRules({ enabledOnly: true })).some((r) => r.id === rule!.id)).toBe(
      false,
    );
    /* still there, just paused */
    expect((await config.getNotifRules()).some((r) => r.id === rule!.id)).toBe(true);
  });

  it('deletes a rule', async () => {
    const made = await api(anita).post('/config/notifications', {
      name: 'Sleep nudge',
      schedule: 'Daily',
      enabled: true,
    });
    expect((await api(anita).del(`/config/notifications/${made.body.data.id}`)).status).toBe(200);
    expect(await prisma.notifRule.findUnique({ where: { id: made.body.data.id } })).toBeNull();
  });
});

/* ──────────────────────────────────────────────────── automations */

describe('automations', () => {
  it('refuses a cycle step past the end of the cycle', async () => {
    const res = await api(anita).post('/config/flows/fl-habits/steps', {
      on: 20,
      at: 480,
      title: 'Too late',
      text: 'Never fires',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Day 20 of a 14-day cycle doesn’t exist/);
  });

  it('takes a cycle step inside the cycle', async () => {
    const res = await api(anita).post('/config/flows/fl-habits/steps', {
      on: 10,
      at: 480,
      title: 'Halfway habit',
      text: 'Body',
    });
    expect(res.status).toBe(201);
  });

  /* RULE 7: pausing is reversible, deleting is not */
  it('refuses to delete a template anybody is switched on for', async () => {
    const res = await api(anita).del('/config/flows/fl-welcome');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FLOW_IN_USE');
    expect(res.body.error.message).toMatch(/Pause it instead\./);
    expect(await prisma.flowTemplate.findUnique({ where: { id: 'fl-welcome' } })).not.toBeNull();
  });

  it('pauses it instead, which stops it for everybody', async () => {
    const res = await api(anita).patch('/config/flows/fl-welcome', { enabled: false });
    expect(res.status).toBe(200);
    expect(await config.flowOn('c-rajesh', 'fl-welcome')).toBe(false);
    /* and now it can be deleted, because it reaches nobody */
    expect((await api(anita).del('/config/flows/fl-welcome')).status).toBe(200);
  });

  it('starts a new template with no steps, sending nothing', async () => {
    const res = await api(anita).post('/config/flows', {
      name: 'Anniversary',
      trigger: 'ENROL',
      defaultOn: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.steps).toEqual([]);
    /* off by default and reaching nobody, so it is deletable */
    expect((await api(anita).del(`/config/flows/${res.body.data.id}`)).status).toBe(200);
  });

  it('reads a per-client override over the template default', async () => {
    /* Mid-cycle check-in ships off by default */
    expect(await config.flowOn('c-rajesh', 'fl-checkin')).toBe(false);
    await prisma.clientFlow.create({
      data: { clientId: 'c-rajesh', templateId: 'fl-checkin', on: true },
    });
    await config.invalidate(config.CACHE_KEYS.flows);
    expect(await config.flowOn('c-rajesh', 'fl-checkin')).toBe(true);
    await prisma.clientFlow.deleteMany({ where: { clientId: 'c-rajesh', templateId: 'fl-checkin' } });
  });
});

/* ──────────────────────────────────────────────────────── catalog */

describe('catalog', () => {
  it('refuses to delete a category that ships with the product', async () => {
    const res = await api(anita).del('/config/categories/sedentary');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_SEEDED');
  });

  it('renames a category, which is always safe', async () => {
    const res = await api(anita).patch('/config/categories/moderate', { name: 'Moderately active' });
    expect(res.status).toBe(200);
    /* the KEY is what everything points at, and it has not moved */
    expect((await prisma.catalogCategory.findUnique({ where: { key: 'moderate' } }))!.name).toBe(
      'Moderately active',
    );
    await api(anita).patch('/config/categories/moderate', { name: 'Moderate' });
  });

  it('adds a category with a slug key, unused and therefore deletable', async () => {
    const res = await api(anita).post('/config/categories', { name: 'Athlete' });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toBe('athlete');
    expect(res.body.data.seeded).toBe(false);
    expect((await api(anita).del('/config/categories/athlete')).status).toBe(200);
  });

  it('refuses a tag that already exists in another case', async () => {
    const res = await api(anita).post('/config/tags', { name: 'pcod' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already a tag called PCOD/);
  });

  it('adds and removes a tag nothing uses', async () => {
    const made = await api(anita).post('/config/tags', { name: 'hypertension' });
    expect(made.status).toBe(201);
    expect((await api(anita).del(`/config/tags/${made.body.data.id}`)).status).toBe(200);
  });
});

/* ────────────────────────────────────────────────────────── plans */

describe('plans', () => {
  it('are product-defined and read straight from shared', async () => {
    const res = await api(anita).get('/config/plans');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { key: string }) => p.key)).toEqual(['poorna', 'svayam']);
    expect(res.body.data[0].name).toBe('HAALVING Poorna');
    /* Svayam is not on sale for this launch, and the tab says so */
    expect(res.body.data[1].launch).toBe(false);
  });
});
