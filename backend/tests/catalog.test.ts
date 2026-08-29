import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { prisma } from '../src/config/prisma.js';
import { app, auth, clearRateLimits, closeConnections, loginStaff, type Session } from './helpers.js';

/**
 * The Catalog, exercised through the API.
 *
 * The rule worth the most attention is who may author WHERE: a pillar coach owns
 * one aisle and reads the other four, and `editAnyCatalog` opens all five.
 */

let anita: Session; /* Super Admin — editAnyCatalog */
let vikram: Session; /* Fitness Coach — editCatalog, fitness only */
let lakshmi: Session; /* Yoga Coach — editCatalog, yoga only */

const MADE: string[] = [];
const TEMPLATES: string[] = [];

async function reset(): Promise<void> {
  if (MADE.length) {
    await prisma.catalogItem.deleteMany({ where: { id: { in: MADE } } });
    MADE.length = 0;
  }
  await prisma.planTemplate.deleteMany({});
  TEMPLATES.length = 0;
  /* anything a test archived */
  await prisma.catalogItem.updateMany({ where: { archived: true }, data: { archived: false } });
}

beforeAll(async () => {
  await clearRateLimits();
  [anita, vikram, lakshmi] = await Promise.all([
    loginStaff('anita'),
    loginStaff('vikram'),
    loginStaff('lakshmi'),
  ]);
});

afterAll(async () => {
  await reset();
  await closeConnections();
});

beforeEach(reset);

const api = (s: Session) => ({
  get: (p: string) => request(app).get(`/api/v1${p}`).set(...auth(s.accessToken)),
  post: (p: string, b?: object) =>
    request(app).post(`/api/v1${p}`).set(...auth(s.accessToken)).send(b ?? {}),
  patch: (p: string, b: object) =>
    request(app).patch(`/api/v1${p}`).set(...auth(s.accessToken)).send(b),
  del: (p: string) => request(app).delete(`/api/v1${p}`).set(...auth(s.accessToken)),
});

/* ──────────────────────────────────────────────────────── the libraries */

describe('GET /catalog', () => {
  it('gives five libraries with the seeded items', async () => {
    const res = await api(anita).get('/catalog');
    expect(res.status).toBe(200);

    const keys = res.body.data.libraries.map((l: { key: string }) => l.key);
    /* MOTIVATION IS A FIFTH LIBRARY, NOT A FIFTH PILLAR */
    expect(keys).toEqual(['fitness', 'culture', 'yoga', 'wellness', 'motivation']);

    const total = res.body.data.libraries.reduce(
      (n: number, l: { items: unknown[] }) => n + l.items.length,
      0,
    );
    expect(total).toBe(56);
  });

  it('shapes an item with its tags and instructions lifted out of the body', async () => {
    const res = await api(anita).get('/catalog');
    const fitness = res.body.data.libraries.find((l: { key: string }) => l.key === 'fitness');
    const item = fitness.items[0];
    expect(item).toHaveProperty('tags');
    expect(item).toHaveProperty('instructions');
    expect(typeof item.instructions).toBe('string');
  });

  it('tells a pillar coach which aisle is theirs', async () => {
    const res = await api(vikram).get('/catalog');
    const byKey = Object.fromEntries(
      res.body.data.libraries.map((l: { key: string; canEdit: boolean }) => [l.key, l.canEdit]),
    );
    expect(byKey.fitness).toBe(true);
    expect(byKey.yoga).toBe(false);
    expect(byKey.culture).toBe(false);
    /* nobody's pillar owns the films */
    expect(byKey.motivation).toBe(false);
    expect(res.body.data.canEditAny).toBe(false);
  });

  it('opens all five for editAnyCatalog', async () => {
    const res = await api(anita).get('/catalog');
    expect(res.body.data.libraries.every((l: { canEdit: boolean }) => l.canEdit)).toBe(true);
    expect(res.body.data.canEditAny).toBe(true);
  });

  it('carries the shelves and stickers Configuration owns', async () => {
    const res = await api(anita).get('/catalog');
    expect(res.body.data.categories.map((c: { key: string }) => c.key)).toEqual([
      'sedentary',
      'moderate',
      'active',
    ]);
    expect(res.body.data.tags.length).toBeGreaterThan(0);
  });
});

/* ───────────────────────────────────────────────────────────── authoring */

describe('authoring an item', () => {
  const item = (over: Record<string, unknown> = {}) => ({
    library: 'fitness',
    name: 'Test movement',
    track: 'moderate',
    tags: ['weight loss'],
    instructions: 'Do the thing.',
    ...over,
  });

  it('lets a pillar coach write in their own aisle', async () => {
    const res = await api(vikram).post('/catalog/items', item());
    expect(res.status).toBe(201);
    MADE.push(res.body.data.id);
    expect(res.body.data.library).toBe('fitness');
    expect(res.body.data.tags).toEqual(['weight loss']);
  });

  it('refuses a pillar coach in somebody else’s aisle, and logs it', async () => {
    const res = await api(lakshmi).post('/catalog/items', item());
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/not yours to author/);

    const logged = await prisma.auditLog.findFirst({
      where: { action: 'denied', subjectType: 'catalog', actorId: 'u-lakshmi' },
      orderBy: { at: 'desc' },
    });
    expect(logged).not.toBeNull();
  });

  it('refuses a category Configuration has never heard of', async () => {
    const res = await api(vikram).post('/catalog/items', item({ track: 'athlete' }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/no category with that key/);
  });

  it('edits an item without losing the rest of its body', async () => {
    const made = await api(vikram).post('/catalog/items', item());
    MADE.push(made.body.data.id);

    const res = await api(vikram).patch(`/catalog/items/${made.body.data.id}`, {
      name: 'Renamed movement',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed movement');
    /* the instructions were not in the patch and must survive it */
    expect(res.body.data.instructions).toBe('Do the thing.');
    expect(res.body.data.tags).toEqual(['weight loss']);
  });

  /* ARCHIVED, NEVER DELETED — a template or a client plan may already name it */
  it('archives rather than deleting, and can restore', async () => {
    const made = await api(vikram).post('/catalog/items', item());
    MADE.push(made.body.data.id);

    const off = await api(vikram).post(`/catalog/items/${made.body.data.id}/archive`, {
      archived: true,
    });
    expect(off.status).toBe(200);
    expect(off.body.data.archived).toBe(true);
    /* still readable — a page that hid it would show a recipe with a missing
       ingredient and no explanation */
    expect(await prisma.catalogItem.findUnique({ where: { id: made.body.data.id } })).not.toBeNull();

    const on = await api(vikram).post(`/catalog/items/${made.body.data.id}/archive`, {
      archived: false,
    });
    expect(on.body.data.archived).toBe(false);
  });
});

/* ───────────────────────────────────────────────────────────── templates */

describe('templates', () => {
  const tpl = (over: Record<string, unknown> = {}) => ({
    name: 'Level 3 fitness fortnight',
    pillar: 'fitness',
    level: 3,
    track: 'moderate',
    days: [{ day: 1, items: [] }],
    ...over,
  });

  it('creates one against a real level of the programme', async () => {
    const res = await api(vikram).post('/catalog/templates', tpl());
    expect(res.status).toBe(201);
    TEMPLATES.push(res.body.data.id);
    expect(res.body.data.published).toBe(false);
  });

  it('refuses a level the programme does not have', async () => {
    const res = await api(vikram).post('/catalog/templates', tpl({ level: 9 }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/The programme has 7 levels/);
  });

  it('refuses a coach writing a template for another pillar', async () => {
    expect((await api(lakshmi).post('/catalog/templates', tpl())).status).toBe(403);
  });

  it('publishes, and then refuses deletion until it is unpublished', async () => {
    const made = await api(vikram).post('/catalog/templates', tpl());
    const id = made.body.data.id;

    await api(vikram).post(`/catalog/templates/${id}/publish`, { published: true });
    const refused = await api(vikram).del(`/catalog/templates/${id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('TEMPLATE_PUBLISHED');

    await api(vikram).post(`/catalog/templates/${id}/publish`, { published: false });
    expect((await api(vikram).del(`/catalog/templates/${id}`)).status).toBe(200);
  });

  it('appears on the page once created', async () => {
    const made = await api(vikram).post('/catalog/templates', tpl());
    TEMPLATES.push(made.body.data.id);

    const res = await api(anita).get('/catalog');
    expect(res.body.data.templates.some((t: { id: string }) => t.id === made.body.data.id)).toBe(
      true,
    );
  });
});
