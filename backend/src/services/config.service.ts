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
 * THE READERS, and what each will consult (none of them built yet; this is the
 * contract they inherit):
 *   meals queue        -> getSla()            reply target, nudge, escalation
 *   Time & Cover       -> getLeaveConfig()    who signs leave        [WIRED]
 *   approvals board    -> getChain(kind)      snapshotted at creation
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
  chains: 'chains',
  notif: 'notif',
  flows: 'flows',
  catalog: 'catalog',
} as const;

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

async function allChains(): Promise<Record<ChainKind, ChainStep[]>> {
  return cached(CACHE_KEYS.chains, async () => {
    const rows = await prisma.approvalChain.findMany();
    const out = {} as Record<ChainKind, ChainStep[]>;
    for (const k of CHAIN_KINDS) {
      const row = rows.find((r) => (r.kind as string) === k);
      out[k] = row ? ((row.steps as unknown as ChainStep[]) ?? []) : DEFAULT_CHAINS[k];
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
  return (await allChains())[kind] ?? [];
}

export async function getChains(): Promise<Record<ChainKind, ChainStep[]>> {
  return allChains();
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
