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

/** The demo's own templates, which the seed restores and no test may remove. */
const SEEDED_TEMPLATES = [
  'tp-nut-l1',
  'tp-nut-l2',
  'tp-fit-l1',
  'tp-fit-l3m',
  'tp-yog-l1',
  'tp-mnd-l1',
  'tp-mot-l1',
];

const MADE: string[] = [];
const TEMPLATES: string[] = [];

async function reset(): Promise<void> {
  if (MADE.length) {
    await prisma.catalogItem.deleteMany({ where: { id: { in: MADE } } });
    MADE.length = 0;
  }
  /*
   * ONLY WHAT A TEST MADE.
   *
   * This used to be `deleteMany({})`, which was harmless while the seed created
   * no templates — it now creates seven, and a blanket wipe would leave the
   * database missing the demo's story after any test run. A suite that has to
   * scorch the table to be repeatable is a suite that cannot be run twice
   * alongside anything else.
   */
  await prisma.planTemplate.deleteMany({ where: { id: { notIn: SEEDED_TEMPLATES } } });
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
  put: (p: string, b: object) =>
    request(app).put(`/api/v1${p}`).set(...auth(s.accessToken)).send(b),
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

  it('carries an item’s media, caution and notes through save and a partial edit', async () => {
    const made = await api(vikram).post(
      '/catalog/items',
      item({
        name: 'Media movement',
        media: { image: 'img/tasks/x.webp', video: 'https://youtu.be/abc' },
        caution: 'Stop if it hurts.',
        notes: 'Morning is best.',
      }),
    );
    expect(made.status).toBe(201);
    MADE.push(made.body.data.id);
    expect(made.body.data.media).toEqual({ image: 'img/tasks/x.webp', video: 'https://youtu.be/abc' });
    expect(made.body.data.caution).toBe('Stop if it hurts.');
    expect(made.body.data.notes).toBe('Morning is best.');

    /* a patch that names only the title must leave media/caution/notes intact */
    const patched = await api(vikram).patch(`/catalog/items/${made.body.data.id}`, { name: 'Renamed' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.caution).toBe('Stop if it hurts.');
    expect(patched.body.data.notes).toBe('Morning is best.');
    expect(patched.body.data.media).toEqual({ image: 'img/tasks/x.webp', video: 'https://youtu.be/abc' });
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

  it('saves one day of the cycle and reads it back in the rich slot shape', async () => {
    const made = await api(vikram).post('/catalog/templates', tpl());
    const id = made.body.data.id;
    TEMPLATES.push(id);

    const day = {
      slots: [
        {
          pillar: 'fitness',
          label: 'Warm-up',
          options: [['ci-brisk', { id: 'ci-squat', x: 2 }]],
          dose: { sets: 3 },
        },
      ],
      targets: { kcal: 0 },
    };
    expect((await api(vikram).put(`/catalog/templates/${id}/days/1`, day)).status).toBe(200);

    const page = await api(vikram).get('/catalog');
    const t = page.body.data.templates.find((x: { id: string }) => x.id === id);
    expect(t.days['1'].slots[0].label).toBe('Warm-up');
    /* the A/B/C grammar survives: a bare id and a {id,x} portion, verbatim */
    expect(t.days['1'].slots[0].options[0]).toEqual(['ci-brisk', { id: 'ci-squat', x: 2 }]);
  });

  it('refuses the rich days shape being sent as the old {day,items} array', async () => {
    const res = await api(vikram).post('/catalog/templates', tpl({ days: [{ day: 1, items: [] }] }));
    expect(res.status).toBe(400);
  });

  it('freezes a published template — a day-save is refused until it is duplicated', async () => {
    const made = await api(vikram).post('/catalog/templates', tpl());
    const id = made.body.data.id;
    TEMPLATES.push(id);
    await api(vikram).post(`/catalog/templates/${id}/publish`, { published: true });

    const res = await api(vikram).put(`/catalog/templates/${id}/days/1`, { slots: [] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEMPLATE_PUBLISHED');
  });

  it('duplicates a template into a fresh draft that carries its days', async () => {
    const made = await api(vikram).post('/catalog/templates', tpl({ name: 'To copy' }));
    const id = made.body.data.id;
    TEMPLATES.push(id);
    await api(vikram).put(`/catalog/templates/${id}/days/1`, {
      slots: [{ pillar: 'fitness', label: 'Warm-up', options: [['ci-brisk']] }],
    });

    const dup = await api(vikram).post(`/catalog/templates/${id}/duplicate`);
    expect(dup.status).toBe(201);
    TEMPLATES.push(dup.body.data.id);
    expect(dup.body.data.published).toBe(false);
    expect(dup.body.data.name).toBe('To copy (copy)');
    expect(dup.body.data.days['1'].slots[0].label).toBe('Warm-up');
  });
});
