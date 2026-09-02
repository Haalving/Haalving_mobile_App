import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Prisma } from '@prisma/client';
import {
  CHAIN_KINDS,
  DEFAULT_CHAINS,
  DEFAULT_SHAPE,
  flowOn as flowOnFor,
  type ChainKind,
  type ChainStep,
  type ProgramShape,
} from '@haalving/shared';

import { prisma } from '../config/prisma.js';

/** The three the `Track` enum actually holds. */
const TRACK_KEYS = ['sedentary', 'moderate', 'active'];
import { redis } from '../config/redis.js';

/**
 * THE READ SIDE OF CONFIGURATION.
 *
 * No module reads a config table directly. Everything — the meals queue, the
 * approvals board, the notification jobs, the flow sweep, the Catalog page and the
 * client's Automations pad — comes through here, so that when Ops changes a number
 * there is exactly one place it can fail to take effect.
 *
 * THE READERS, and what each consults. The ones marked [WIRED] are calling it
 * now; the rest inherit the same contract on the day they land:
 *   meals queue        -> getSla()            reply target, nudge, escalation  [WIRED]
 *   Time & Cover       -> getLeaveConfig()    who signs leave        [WIRED]
 *   approvals board    -> getChainSnapshot()  snapshotted at creation  [WIRED]
 *   notification jobs  -> getNotifRules()     enabled rules only
 *   flow sweep         -> getFlowTemplates(), flowOn(clientId, templateId)
 *   Catalog page       -> getCategories(), getTags()
 *   cycle engine       -> getShapeFor(client) the version THEY started on
 *
 * TWO CLOCKS, deliberately not blurred. The SHAPE is versioned and pinned per
 * client, because a cycle must not change under somebody's feet halfway through.
 * The SERVICE numbers are live, because a reply target nobody is waiting on is
 * just a number in a table.
 */

/* --------------------------------------------------------------- cache */

/**
 * Thirty seconds, invalidated on every write.
 *
 * Short enough that a forgotten invalidation self-heals within a page load, and a
 * Redis failure skips the cache rather than failing the read — a configuration
 * that cannot be read is a product that cannot answer a request.
 */
const TTL = 30;
const key = (k: string) => `config:${k}`;

async function cached<T>(k: string, load: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key(k));
    if (hit) return JSON.parse(hit) as T;
  } catch {
    /* a cache that is down is not an answer */
  }
  const value = await load();
  try {
    await redis.set(key(k), JSON.stringify(value), 'EX', TTL);
  } catch {
    /* likewise */
  }
  return value;
}

/** Called by every write in `config.write.service`. */
export async function invalidate(...keys: string[]): Promise<void> {
  try {
    await redis.del(...keys.map(key));
  } catch {
    /* the TTL is the backstop */
  }
}

export const CACHE_KEYS = {
  shape: 'shape',
  sla: 'sla',
  leave: 'leave',
  /* `chains-v2` rather than `chains`: the cached value now carries each chain's
     VERSION alongside its steps, and a key holding the old shape would be read
     back for up to the TTL as a chain with no steps — which is a chain that
     publishes on the first signature. A new key simply lets the old one expire. */
  chains: 'chains-v2',
  notif: 'notif',
  flows: 'flows',
  catalog: 'catalog',
  reference: 'reference',
} as const;

/* --------------------------------------------------------- reference content

   The programme curriculum and the level-review criteria the plan derivation
   reads. Reference content — not per-client, not user state — so it is NOT a
   store: it lives in the seed artifact the demo was extracted into, and is served
   here behind the same cache as everything else in config. The demo treats it the
   same way, refilling `program`/`cultureCriteria`/`bodyCriteria` from the seed on
   every boot rather than persisting them.

   `../../prisma/demo-seed.json` resolves the same from src (tsx) and dist: both
   sit two levels under the package root, where prisma/ lives beside them. */
const SEED_REF_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'prisma',
  'demo-seed.json',
);

let seedRef: Record<string, unknown> | null = null;
function loadSeedRef(): Record<string, unknown> {
  if (!seedRef) seedRef = JSON.parse(readFileSync(SEED_REF_PATH, 'utf8')) as Record<string, unknown>;
  return seedRef;
}

export type ReferenceName = 'program' | 'cultureCriteria' | 'bodyCriteria';

/** One reference blob — the programme, or a level-review criteria set. Cached. */
export async function getReference<T = unknown>(name: ReferenceName): Promise<T> {
  return cached(`${CACHE_KEYS.reference}:${name}`, async () => loadSeedRef()[name] as T);
}

/* --------------------------------------------------------------- shape */

type ShapeRow = Prisma.ProgramShapeGetPayload<Record<string, never>>;

function toShape(row: ShapeRow): ProgramShape & { version: number } {
  const s = (row.sessions as { fitness: number; yoga: number; mind: number } | null) ?? DEFAULT_SHAPE.sessions;
  return {
    version: row.version,
    levels: row.levels,
    cycleDays: row.cycleDays,
    reviewDay: row.reviewDay,
    restDays: row.restDays,
    meetingDay: row.meetingDay,
    termDays: row.termDays,
    sessions: { fitness: s.fitness, yoga: s.yoga, mind: s.mind },
  };
}

/** The CURRENT shape, or a named version. */
export async function getShape(version?: number): Promise<ProgramShape & { version: number }> {
  if (version != null) {
    const row = await prisma.programShape.findUnique({ where: { version } });
    /* a version that has been pruned falls back to the current one rather than
       throwing — a client pinned to a missing shape must still render */
    if (row) return toShape(row);
  }
  return cached(CACHE_KEYS.shape, async () => {
    const row = await prisma.programShape.findFirst({ orderBy: { version: 'desc' } });
    return row ? toShape(row) : { ...DEFAULT_SHAPE, version: 0 };
  });
}

/**
 * The shape THIS client is walking.
 *
 * Rule 2 in one function: a client carries the version their current cycle started
 * on, and nothing recomputes mid-cycle. A client with no version pinned — one
 * created before versioning existed — reads the current shape, which is what they
 * were implicitly on anyway.
 */
export async function getShapeFor(client: { shapeVersion?: number | null }) {
  return getShape(client.shapeVersion ?? undefined);
}

/* ------------------------------------------------------------- service */

/** LIVE. The meals queue reads this on every request; there is no version delay. */
export async function getSla() {
  return cached(CACHE_KEYS.sla, async () => {
    const row = await prisma.slaConfig.findUnique({ where: { id: 'default' } });
    return {
      replyTargetMin: row?.replyTargetMin ?? 15,
      notifyAfterMin: row?.notifyAfterMin ?? 10,
      escalateAfterMin: row?.escalateAfterMin ?? 15,
      escalateToRole: row?.escalateToRole ?? 'admin',
    };
  });
}

export async function getLeaveConfig() {
  return cached(CACHE_KEYS.leave, async () => {
    const row = await prisma.leaveConfig.findUnique({ where: { id: 'default' } });
    return { approverRole: row?.approverRole ?? 'admin' };
  });
}

/* -------------------------------------------------------------- chains */

/**
 * A chain and the version it is on, which are one reading and are cached as one.
 *
 * The version is not decoration: it is what an approval's snapshot records, and
 * fetching it separately from the steps would open a window in which a snapshot
 * could pair one chain's steps with another edit's number.
 */
export interface ChainSnapshot {
  steps: ChainStep[];
  version: number;
}

async function allChains(): Promise<Record<ChainKind, ChainSnapshot>> {
  return cached(CACHE_KEYS.chains, async () => {
    const rows = await prisma.approvalChain.findMany();
    const out = {} as Record<ChainKind, ChainSnapshot>;
    for (const k of CHAIN_KINDS) {
      const row = rows.find((r) => (r.kind as string) === k);
      out[k] = row
        ? { steps: (row.steps as unknown as ChainStep[]) ?? [], version: row.version }
        : /* version 0 is the CODE default, which no edit has ever touched — a
             snapshot saying 0 is saying "the shipped chain", truthfully */
          { steps: DEFAULT_CHAINS[k], version: 0 };
    }
    return out;
  });
}

/**
 * The chain an item should collect.
 *
 * READ AT CREATION and snapshotted onto the approval, never read again while the
 * item is in flight — moving the goalposts under a half-signed item would either
 * lose a signature already given or demand one from somebody who was never asked.
 */
export async function getChain(kind: ChainKind): Promise<ChainStep[]> {
  return (await allChains())[kind]?.steps ?? [];
}

/**
 * The same chain, with the version an approval snapshots alongside it.
 *
 * `queues.service.create` is the only caller, and it is the only place in the
 * codebase that takes a snapshot.
 */
export async function getChainSnapshot(kind: ChainKind): Promise<ChainSnapshot> {
  return (await allChains())[kind] ?? { steps: [], version: 0 };
}

export async function getChains(): Promise<Record<ChainKind, ChainStep[]>> {
  const all = await allChains();
  return Object.fromEntries(
    CHAIN_KINDS.map((k) => [k, all[k]?.steps ?? []]),
  ) as Record<ChainKind, ChainStep[]>;
}

/* ------------------------------------------------------- notifications */

export async function getNotifRules(opts: { enabledOnly?: boolean } = {}) {
  const rules = await cached(CACHE_KEYS.notif, async () => {
    const rows = await prisma.notifRule.findMany({ orderBy: [{ position: 'asc' }, { title: 'asc' }] });
    return rows.map((r) => ({
      id: r.id,
      name: r.title,
      detail: r.detail,
      schedule: r.schedule,
      audience: r.audience,
      channel: r.channel,
      enabled: r.enabled,
    }));
  });
  return opts.enabledOnly ? rules.filter((r) => r.enabled) : rules;
}

/* --------------------------------------------------------- automations */

export async function getFlowTemplates() {
  return cached(CACHE_KEYS.flows, async () => {
    const rows = await prisma.flowTemplate.findMany({
      orderBy: { position: 'asc' },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      desc: t.desc,
      trigger: t.trigger as 'ENROL' | 'CYCLE_DAY',
      defaultOn: t.defaultOn,
      enabled: t.enabled,
      steps: t.steps.map((s) => ({
        id: s.id,
        after: s.after,
        on: s.on,
        at: s.at,
        title: s.title,
        text: s.text,
        position: s.position,
      })),
    }));
  });
}

/**
 * Is this template on for this client?
 *
 * The per-client map is THIN — a row exists only where somebody overrode the
 * template's default — so this is a lookup with a fallback rather than a join, and
 * a changed default moves everybody who never chose.
 */
export async function flowOn(clientId: string, templateId: string): Promise<boolean> {
  const templates = await getFlowTemplates();
  const t = templates.find((x) => x.id === templateId);
  if (!t) return false;
  const override = await prisma.clientFlow.findUnique({
    where: { clientId_templateId: { clientId, templateId } },
    select: { on: true },
  });
  return flowOnFor(t, override?.on);
}

/** "Switched on for 6 of 7" — how far a template actually reaches. */
export async function flowReach(templateId: string): Promise<{ on: number; live: number }> {
  const [live, overrides, template] = await Promise.all([
    prisma.client.count({ where: { status: 'active' } }),
    prisma.clientFlow.findMany({ where: { templateId }, select: { on: true } }),
    prisma.flowTemplate.findUnique({ where: { id: templateId } }),
  ]);
  if (!template) return { on: 0, live };
  if (!template.enabled) return { on: 0, live };

  const offCount = overrides.filter((o) => !o.on).length;
  const onCount = overrides.filter((o) => o.on).length;
  const untouched = live - overrides.length;
  return { on: template.defaultOn ? untouched + onCount : onCount + 0 * offCount, live };
}

/* ------------------------------------------------------------- catalog */

export async function getCategories() {
  return cached(CACHE_KEYS.catalog, async () => {
    const rows = await prisma.catalogCategory.findMany({ orderBy: { position: 'asc' } });
    return rows.map((c) => ({ key: c.key, name: c.name, seeded: c.seeded }));
  });
}

export async function getTags() {
  const rows = await prisma.catalogTag.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] });
  return rows.map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
}

/**
 * What a category is used by — "3 items · 1 template · 2 clients".
 *
 * The count is what decides whether it may be deleted, so it is computed rather
 * than stored: a stored count is wrong the moment somebody archives an item, and
 * being wrong here means either refusing a safe delete or allowing one that
 * orphans a client's level book.
 */
export async function categoryUsage(key: string) {
  /*
   * A CLIENT CAN ONLY SIT ON ONE OF THE THREE SHIPPED TRACKS. `Client.track` is a
   * closed Postgres enum, so a category added here can never be assigned to a
   * person — which is precisely why the demo says a new category "falls back to
   * the Sedentary level book". Asking Postgres about a key the enum has never
   * heard of is not a zero, it is a type error, so the count is skipped and the
   * answer is the truthful zero.
   *
   * When a new category needs real clients on it, `track` becomes a foreign key
   * to this table and this branch disappears.
   */
  const isTrack = TRACK_KEYS.includes(key);
  const [items, clients] = await Promise.all([
    prisma.catalogItem.count({ where: { track: key } }),
    isTrack ? prisma.client.count({ where: { track: key as never } }) : Promise.resolve(0),
  ]);
  /* templates live in the catalog too, under their own kind */
  const templates = await prisma.catalogItem.count({ where: { track: key, kind: 'template' } });
  return { items, templates, clients };
}

export async function tagUsage(name: string) {
  /* tags are held inside each item's `body`, so this asks Postgres to look */
  const items = await prisma.catalogItem.count({
    where: { body: { path: ['tags'], array_contains: [name] } },
  });
  return { items };
}
