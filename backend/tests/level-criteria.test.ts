import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import * as config from '../src/services/config.service.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * THE LEVEL-UP RULES ARE WRITTEN IN CONFIGURATION, NOT SHIPPED.
 *
 * The Super Admin writes a rulebook and the configuration read carries it, with
 * who wrote it and when; a coach is refused. The dev seed's wellness rulebook
 * is put back afterwards so the rest of the suite reads what it expects.
 */

let admin: Session;
let coach: Session;
let before: unknown;

const WELLNESS = {
  '1': { sleep: '7–8 h', screen: '2 h', practice: 'Nightly wind-down breath · 2 min' },
  '2': { sleep: '7–8 h', screen: '1.5 h', practice: 'Guided downshift · 20 min on session days' },
};

beforeAll(async () => {
  await clearRateLimits();
  [admin, coach] = await Promise.all([loginStaff('anita'), loginStaff('sneha')]);
  before = (await prisma.levelCriteria.findUnique({ where: { key: 'wellness' } }))?.body ?? null;
});

afterAll(async () => {
  if (before === null) await prisma.levelCriteria.deleteMany({ where: { key: 'wellness' } });
  else await prisma.levelCriteria.update({ where: { key: 'wellness' }, data: { body: before as object } });
  await config.invalidate(config.CACHE_KEYS.levels);
  await prisma.auditLog.deleteMany({ where: { action: 'config.levels.changed', subjectId: 'wellness' } });
  await closeConnections();
});

describe('level-up rules', () => {
  it('the Super Admin writes the Peace rulebook and the configuration read carries it, signed', async () => {
    const res = await request(app)
      .put('/api/v1/config/levels')
      .set(...auth(admin.accessToken))
      .send({ key: 'wellness', body: WELLNESS });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.wellness['2'].screen).toBe('1.5 h');
    expect(res.body.data.written.wellness.by).toBe(admin.user.name);

    const cfg = await request(app).get('/api/v1/config').set(...auth(admin.accessToken));
    expect(cfg.status).toBe(200);
    expect(cfg.body.data.levels.wellness['1'].practice).toBe('Nightly wind-down breath · 2 min');
  });

  it('refuses a malformed rulebook', async () => {
    const res = await request(app)
      .put('/api/v1/config/levels')
      .set(...auth(admin.accessToken))
      .send({ key: 'body', body: { bar: 'x' } });
    expect(res.status).toBe(400);
  });

  it('a coach cannot write the rules', async () => {
    const res = await request(app)
      .put('/api/v1/config/levels')
      .set(...auth(coach.accessToken))
      .send({ key: 'wellness', body: WELLNESS });
    expect(res.status).toBe(403);
  });

  it('offers the paper rulebook to editors only, as a draft', async () => {
    const ok = await request(app).get('/api/v1/config/levels/rulebook').set(...auth(admin.accessToken));
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.data.culture.gates)).toBe(true);
    const no = await request(app).get('/api/v1/config/levels/rulebook').set(...auth(coach.accessToken));
    expect(no.status).toBe(403);
  });
});
