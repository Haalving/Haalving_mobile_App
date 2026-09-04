import type { Prisma } from '@prisma/client';
import { PILLAR_KEYS, pillarForRole, stageRoleOf, type ChainStep } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import * as audit from './audit.service.js';
import * as config from './config.service.js';
import * as queues from './queues.service.js';

/**
 * The Catalog — five item libraries, and the templates built out of them.
 *
 * THE SHAPE OF THE PAGE IS THE SHAPE OF THE IDEA: the libraries are INGREDIENTS
 * and a template is a RECIPE. A template names one pillar, one level and one
 * activity category, and holds one day per day of the cycle.
 *
 * Three tiers, and the demo is emphatic that they are not the same thing:
 *   a LIBRARY is an aisle — an item is in exactly one
 *   a CATEGORY is the shelf — an item sits on exactly one
 *   a TAG is a sticker on the jar — an item carries any number, and they cut
 *     across aisles and shelves
 * Categories and tags are read ONLY through config.service, which is where
 * Configuration edits them.
 */

export interface Actor {
  id: string;
  role: string;
}

/**
 * MOTIVATION IS A FIFTH LIBRARY, NOT A FIFTH PILLAR.
 *
 * `PILLARS` stays at four — the product is built on four and nothing here may
 * quietly make it five. Nobody's pillar owns motivation, so `pillarForRole` never
 * points at it and editing it falls through to `editAnyCatalog`: Ops and the Super
 * User author the films, pillar coaches read them.
 */
export const LIBRARY_KEYS = [...PILLAR_KEYS, 'motivation'] as const;

const LIBRARY_NAMES: Record<string, string> = {
  fitness: 'Fitness',
  yoga: 'Yoga',
  culture: 'Nutrition',
  wellness: 'Mind Wellness',
  motivation: 'Motivation',
};

export function libraryName(key: string): string {
  return LIBRARY_NAMES[key] ?? key;
}

export function isLibrary(key: string): boolean {
  return (LIBRARY_KEYS as readonly string[]).includes(key);
}

/**
 * May this person author in this library?
 *
 * A pillar coach owns their own aisle and reads the rest; `editAnyCatalog` opens
 * all five. The check is the same matrix the builder and the client record carry,
 * so a dietitian who may write a food cannot rewrite a yoga asana.
 */
export async function canEditLibrary(actor: Actor, library: string): Promise<boolean> {
  if (await can(actor.role, 'editAnyCatalog')) return true;
  if (!(await can(actor.role, 'editCatalog'))) return false;
  return pillarForRole(actor.role) === library;
}

async function requireEdit(actor: Actor, library: string, what: string): Promise<void> {
  if (await canEditLibrary(actor, library)) return;
  await audit.record({
    actorId: actor.id,
    action: 'denied',
    subjectType: 'catalog',
    subjectId: library,
    reason: what,
    meta: { role: actor.role },
  });
  throw ApiError.forbidden('That library is not yours to author.');
}

/* -------------------------------------------------------------- reading */

interface ItemMedia {
  image?: string | null;
  video?: string | null;
}

interface ItemBody {
  tags?: string[];
  instructions?: string;
  media?: ItemMedia | null;
  /** what to watch for; free text, optional */
  caution?: string;
  /** anything else worth knowing; free text, optional */
  notes?: string;
  /** per-portion macros the template editor sums into an option's reading */
  nutrients?: Record<string, unknown> | null;
  dose?: Record<string, unknown> | null;
  portion?: Record<string, unknown> | null;
  [k: string]: unknown;
}

function shapeItem(i: Prisma.CatalogItemGetPayload<Record<string, never>>) {
  const body = (i.body as ItemBody | null) ?? {};
  return {
    id: i.id,
    library: i.pillar,
    name: i.name,
    track: i.track,
    level: i.level,
    archived: i.archived,
    tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
    instructions: typeof body.instructions === 'string' ? body.instructions : '',
    media: (body.media as ItemMedia | null) ?? null,
    caution: typeof body.caution === 'string' ? body.caution : '',
    notes: typeof body.notes === 'string' ? body.notes : '',
    /* surfaced so the template editor can read an option's kcal/protein; the demo
       kept these on every food item and computed the plate from them */
    nutrients: (body.nutrients as Record<string, unknown> | null) ?? null,
    dose: (body.dose as Record<string, unknown> | null) ?? null,
    portion: (body.portion as Record<string, unknown> | null) ?? null,
  };
}

/**
 * The whole page in one call: five libraries, the templates, and the shelves and
 * stickers Configuration owns.
 *
 * ARCHIVED ITEMS ARE INCLUDED and flagged rather than filtered away. A template
 * written last month may name one, and a page that silently omitted it would show
 * a recipe with a missing ingredient and no explanation.
 */
/* ------------------------------------------------ the template chain */

/**
 * What the Catalog needs to know about a template's sign-off: enough to print
 * "With Operations Head" / "Returned" and to lock the editor while it is out.
 */
const TEMPLATE_APPROVAL = {
  id: true,
  status: true,
  stage: true,
  chain: true,
  returnReason: true,
  ownerId: true,
  createdAt: true,
} satisfies Prisma.ApprovalSelect;

type TemplateApproval = Prisma.ApprovalGetPayload<{ select: typeof TEMPLATE_APPROVAL }>;

/** The newest sign-off per template rides along on every template read. */
const TEMPLATE_INCLUDE = {
  /* WHO WROTE IT is on the card — "By Sneha M." — because a template is a
     piece of authorship somebody is answerable for, not an anonymous row.
     Nullable: the author may have been deactivated since. */
  createdBy: { select: { id: true, name: true } },
  /* the id breaks a same-millisecond tie, so "newest" is deterministic */
  approvals: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: TEMPLATE_APPROVAL },
} satisfies Prisma.PlanTemplateInclude;

type TemplateRow = Prisma.PlanTemplateGetPayload<{ include: typeof TEMPLATE_INCLUDE }>;

/** Role titles are live (People & Access renames seats); a chain step is a key. */
async function roleTitles(): Promise<Record<string, string>> {
  const rows = await prisma.role.findMany({ select: { key: true, title: true } });
  return Object.fromEntries(rows.map((r) => [r.key, r.title]));
}

function chainOf(ap: { chain: Prisma.JsonValue }): ChainStep[] {
  return (ap.chain as unknown as ChainStep[] | null) ?? [];
}

/**
 * The sign-off as the Catalog prints it. `waitingOn` is a role key only while
 * it is SUBMITTED — the same rule `queues.service.stageRole` applies, so the
 * Catalog and the board can never name different signers for one item.
 */
/**
 * The sign-off as the Catalog prints it. `waitingOn` is a role key only while
 * it is SUBMITTED — the same rule `queues.service.stageRole` applies, so the
 * Catalog and the board can never name different signers for one item.
 *
 * THE RETURN NOTE IS FOR THE PEOPLE WHO CAN ACT ON IT: the owner, and whoever
 * may edit the library it sits in. Every other reader gets the state and the
 * signer, which is all the pill needs.
 */
function approvalSummary(
  ap: TemplateApproval | null,
  titles: Record<string, string>,
  seesReason: boolean,
) {
  if (!ap) return null;
  const waitingOn = ap.status === 'SUBMITTED' ? stageRoleOf(chainOf(ap), ap.stage) : null;
  return {
    id: ap.id,
    status: ap.status,
    stage: ap.stage,
    waitingOn,
    waitingOnTitle: waitingOn ? (titles[waitingOn] ?? waitingOn) : null,
    returnReason: seesReason ? ap.returnReason : null,
  };
}

function shapeTemplate(t: TemplateRow, titles: Record<string, string>, actor: Actor, editable: boolean) {
  const latest = t.approvals[0] ?? null;
  return {
    id: t.id,
    name: t.name,
    pillar: t.pillar,
    level: t.level,
    track: t.track,
    days: t.days,
    notes: t.notes,
    published: t.published,
    createdBy: t.createdBy,
    approval: approvalSummary(latest, titles, editable || latest?.ownerId === actor.id),
  };
}

/**
 * A template IN FLIGHT IS FROZEN, for the same reason a published one is: the
 * signers are signing the document they were shown, and a day edited under
 * them turns their signatures into signatures on something else. The refusal
 * names who is holding it, as the board does ("With Operations Head"). The
 * question and the sentence are the board's own (`queues.service`), so the two
 * cannot disagree about whether a template is in flight.
 */
async function assertNotInFlight(t: { id: string; name: string }): Promise<void> {
  const busy = await queues.inFlightApproval(t.id);
  if (busy) throw await queues.inFlightRefusal(t.name, busy);
}

export async function readAll(actor: Actor) {
  const [items, templates, categories, tags, titles] = await Promise.all([
    prisma.catalogItem.findMany({ orderBy: [{ pillar: 'asc' }, { name: 'asc' }] }),
    prisma.planTemplate.findMany({
      orderBy: [{ pillar: 'asc' }, { level: 'asc' }, { name: 'asc' }],
      include: TEMPLATE_INCLUDE,
    }),
    config.getCategories(),
    config.getTags(),
    roleTitles(),
  ]);

  const libraries = LIBRARY_KEYS.map((k) => ({
    key: k,
    name: libraryName(k),
    canEdit: false as boolean,
    items: items.filter((i) => i.pillar === k).map(shapeItem),
  }));

  /* resolved once per library rather than per item — the answer cannot differ
     between two items on the same shelf */
  for (const lib of libraries) lib.canEdit = await canEditLibrary(actor, lib.key);
  const editable = new Set<string>(libraries.filter((l) => l.canEdit).map((l) => l.key));

  return {
    libraries,
    templates: templates.map((t) => shapeTemplate(t, titles, actor, editable.has(t.pillar))),
    categories,
    tags,
    canEditAny: await can(actor.role, 'editAnyCatalog'),
  };
}

/* -------------------------------------------------------------- writing */

export interface ItemInput {
  library: string;
  name: string;
  track?: string | null;
  level?: number | null;
  tags?: string[];
  instructions?: string;
  media?: ItemMedia | null;
  caution?: string;
  notes?: string;
  dose?: Record<string, unknown> | null;
  portion?: Record<string, unknown> | null;
}

/** A category must be one Configuration knows about, or the shelf does not exist. */
async function assertTrack(track: string | null | undefined): Promise<void> {
  if (!track) return;
  const categories = await config.getCategories();
  if (!categories.some((c) => c.key === track)) {
    throw ApiError.badRequest('There is no category with that key.', { track });
  }
}

export async function createItem(actor: Actor, input: ItemInput) {
  if (!isLibrary(input.library)) throw ApiError.badRequest('No such library.');
  await requireEdit(actor, input.library, 'catalog.createItem');
  await assertTrack(input.track);

  const row = await prisma.catalogItem.create({
    data: {
      /* the demo's own id shape, so a hand-written reference in a template keeps
         reading the way the seeded ones do */
      id: `ci-${Math.random().toString(36).slice(2, 10)}`,
      pillar: input.library,
      kind: input.library,
      name: input.name,
      track: input.track ?? null,
      level: input.level ?? null,
      body: {
        tags: input.tags ?? [],
        instructions: input.instructions ?? '',
        media: input.media ?? null,
        caution: input.caution ?? '',
        notes: input.notes ?? '',
        ...(input.dose ? { dose: input.dose } : {}),
        ...(input.portion ? { portion: input.portion } : {}),
      } as Prisma.InputJsonValue,
    },
  });

  await audit.record({
    actorId: actor.id,
    action: 'catalog.item_created',
    subjectType: 'catalogItem',
    subjectId: row.id,
    meta: { library: input.library, name: input.name },
  });
  return shapeItem(row);
}

export async function updateItem(actor: Actor, id: string, input: Partial<ItemInput>) {
  const before = await prisma.catalogItem.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such item.');
  await requireEdit(actor, before.pillar, 'catalog.updateItem');
  await assertTrack(input.track);

  const body = ((before.body as ItemBody | null) ?? {}) as ItemBody;
  const nextBody: ItemBody = {
    ...body,
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    ...(input.media !== undefined ? { media: input.media } : {}),
    ...(input.caution !== undefined ? { caution: input.caution } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.dose !== undefined ? { dose: input.dose } : {}),
    ...(input.portion !== undefined ? { portion: input.portion } : {}),
  };

  const row = await prisma.catalogItem.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.track !== undefined ? { track: input.track } : {}),
      ...(input.level !== undefined ? { level: input.level } : {}),
      body: nextBody as Prisma.InputJsonValue,
    },
  });

  await audit.record({
    actorId: actor.id,
    action: 'catalog.item_updated',
    subjectType: 'catalogItem',
    subjectId: id,
    meta: { before: shapeItem(before), after: shapeItem(row) } as Prisma.InputJsonValue,
  });
  return shapeItem(row);
}

/**
 * ARCHIVED, NEVER DELETED.
 *
 * A template written last month may name this item, and a client's plan may
 * already have carried it. Deleting the row would break both silently; archiving
 * keeps the reference readable and takes it out of the pickers.
 */
export async function archiveItem(actor: Actor, id: string, archived: boolean) {
  const before = await prisma.catalogItem.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such item.');
  await requireEdit(actor, before.pillar, 'catalog.archiveItem');

  const row = await prisma.catalogItem.update({ where: { id }, data: { archived } });
  await audit.record({
    actorId: actor.id,
    action: archived ? 'catalog.item_archived' : 'catalog.item_restored',
    subjectType: 'catalogItem',
    subjectId: id,
    meta: { name: before.name },
  });
  return shapeItem(row);
}

/* ------------------------------------------------------------ templates */

export interface TemplateInput {
  name: string;
  pillar: string;
  level: number;
  track: string;
  /** keyed "1".."60"; each day is its slots and optional per-day targets */
  days?: Record<string, { slots: unknown[]; targets?: unknown }>;
  notes?: string | null;
}

export async function createTemplate(actor: Actor, input: TemplateInput) {
  if (!isLibrary(input.pillar)) throw ApiError.badRequest('No such library.');
  await requireEdit(actor, input.pillar, 'catalog.createTemplate');
  await assertTrack(input.track);

  /* the level has to exist in the programme's own shape — a template for level 9
     of a seven-level programme is a template nobody can ever be given */
  const shape = await config.getShape();
  if (input.level < 1 || input.level > shape.levels) {
    throw ApiError.badRequest(
      `The programme has ${shape.levels} levels — level ${input.level} is not one of them.`,
      { level: input.level },
    );
  }

  const row = await prisma.planTemplate.create({
    data: {
      name: input.name,
      pillar: input.pillar,
      level: input.level,
      track: input.track,
      days: (input.days ?? {}) as unknown as Prisma.InputJsonValue,
      notes: input.notes ?? null,
      createdById: actor.id,
    },
  });

  await audit.record({
    actorId: actor.id,
    action: 'catalog.template_created',
    subjectType: 'planTemplate',
    subjectId: row.id,
    meta: { name: row.name, pillar: row.pillar, level: row.level },
  });
  return row;
}

export async function updateTemplate(actor: Actor, id: string, input: Partial<TemplateInput>) {
  const before = await prisma.planTemplate.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such template.');
  await requireEdit(actor, before.pillar, 'catalog.updateTemplate');
  await assertNotInFlight(before);
  await assertTrack(input.track);

  const row = await prisma.planTemplate.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.level !== undefined ? { level: input.level } : {}),
      ...(input.track !== undefined ? { track: input.track } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.days !== undefined
        ? { days: input.days as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });

  await audit.record({
    actorId: actor.id,
    action: 'catalog.template_updated',
    subjectType: 'planTemplate',
    subjectId: id,
    meta: { name: row.name },
  });
  return row;
}

export async function deleteTemplate(actor: Actor, id: string) {
  const before = await prisma.planTemplate.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such template.');
  await requireEdit(actor, before.pillar, 'catalog.deleteTemplate');

  /*
   * A PUBLISHED template is not deletable here.
   *
   * Publishing is what makes a template something clients may already have been
   * given, and the `template` approval chain exists precisely because that is a
   * decision more than one person signs. Un-publishing is the reversible move, as
   * pausing is for an automation.
   */
  if (before.published) {
    throw new ApiError(
      409,
      'TEMPLATE_PUBLISHED',
      `${before.name} is published. Unpublish it first.`,
    );
  }
  /* and not while its signatures are being collected — the signers were shown
     a document, and deleting it under them is not a return */
  await assertNotInFlight(before);

  await prisma.planTemplate.delete({ where: { id } });
  await audit.record({
    actorId: actor.id,
    action: 'catalog.template_deleted',
    subjectType: 'planTemplate',
    subjectId: id,
    meta: { name: before.name },
  });
  return { ok: true };
}

/**
 * `POST /catalog/templates/:id/publish`.
 *
 * `{ published: true }` no longer publishes. It SENDS THE TEMPLATE UP THE
 * `template` CHAIN (Ops Head, then Super User — Configuration seeds it), and the
 * last signature on Work Queues › Approvals is what sets the flag
 * (`queues.service.sign`). That is the demo's shape (console-clients.js
 * `submitTemplate`, console-approvals.js:116) and the reason the chain exists:
 * publishing is what makes a template something clients can be put on, and that
 * is a decision more than one person signs.
 *
 * `{ published: false }` is still a direct act. Unpublishing is the reversible
 * move, and it needs no second signature to undo what two people signed for —
 * the same asymmetry as pausing an automation.
 */
export async function setTemplatePublished(actor: Actor, id: string, published: boolean) {
  const before = await prisma.planTemplate.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such template.');
  await requireEdit(actor, before.pillar, 'catalog.publishTemplate');

  if (published) return sendForApproval(actor, before);

  /* not while a sign-off is out on it — a signature given to a published
     template and then landing on an unpublished one would publish it again
     behind the coach's back */
  await assertNotInFlight(before);
  await prisma.planTemplate.update({ where: { id }, data: { published: false } });
  await audit.record({
    actorId: actor.id,
    action: 'catalog.template_unpublished',
    subjectType: 'planTemplate',
    subjectId: id,
    meta: { name: before.name },
  });
  /* the same shape the send answers with, so one route has one response */
  return readTemplateResult(actor, id, null);
}

/** `{ template, approval }` — the publish route's one answer, both directions. */
async function readTemplateResult(
  actor: Actor,
  id: string,
  approval: (Awaited<ReturnType<typeof queues.submit>> & { waitingOnTitle?: string | null }) | null,
) {
  const [row, titles] = await Promise.all([
    prisma.planTemplate.findUniqueOrThrow({ where: { id }, include: TEMPLATE_INCLUDE }),
    roleTitles(),
  ]);
  const template = shapeTemplate(row, titles, actor, await canEditLibrary(actor, row.pillar));
  return {
    template,
    approval: approval
      ? { ...approval, waitingOnTitle: approval.waitingOn ? (titles[approval.waitingOn] ?? approval.waitingOn) : null }
      : template.approval,
  };
}

/**
 * Raise the sign-off — or resubmit the one that came back.
 *
 * A returned template keeps its approval (status DRAFT, `returnReason` set) so
 * the trail reads as one conversation: submitted, returned with a reason,
 * resubmitted. That reuse is the owner's alone — `queues.submit` refuses anybody
 * else's draft — so a colleague sending a colleague's returned template up again
 * raises a fresh sign-off under their own name, which is the honest record.
 *
 * Nothing goes up empty: a template with no slot on any day is not a plan
 * anybody can sign for.
 */
async function sendForApproval(actor: Actor, t: { id: string; name: string; pillar: string; notes: string | null }) {
  /* published? in flight? empty? — the board's gates, asked here first so the
     refusal arrives before anything is written */
  await queues.assertTemplateSendable(t.id);

  const latest = await prisma.approval.findFirst({
    where: { templateId: t.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: TEMPLATE_APPROVAL,
  });

  let approval;
  if (latest && latest.status === 'DRAFT' && latest.ownerId === actor.id) {
    approval = await queues.submit(actor, latest.id);
  } else {
    /* a colleague's returned draft is superseded by this send: left behind it
       would sit on their "Returned" list for ever with no way to withdraw it */
    await prisma.approval.deleteMany({ where: { templateId: t.id, status: 'DRAFT' } });
    const made = await queues.create(actor, {
      type: 'template',
      templateId: t.id,
      pillar: t.pillar,
      title: `Template — ${t.name}`,
      due: 'This cycle',
      aiDraft: t.notes ?? '',
    });
    approval = await queues.submit(actor, made.id);
  }

  await audit.record({
    actorId: actor.id,
    action: 'catalog.template_sent_for_approval',
    subjectType: 'planTemplate',
    subjectId: t.id,
    meta: { name: t.name, approvalId: approval.id, waitingOn: approval.waitingOn },
  });

  return readTemplateResult(actor, t.id, approval);
}

/* --------------------------------------------------------- the day editor */

interface TemplateDayBody {
  slots: unknown[];
  targets?: unknown;
}

/**
 * Save ONE day of a template — the console's "Save day N".
 *
 * A published template is FROZEN: it may already be a client's live plan, so a
 * day cannot be edited until the template is duplicated (the demo's "Duplicate to
 * edit"). The day is merged into the `days` record by its string key, leaving the
 * other thirteen untouched, and the whole record is written back so the object
 * keeps the exact shape `slotsFor` reads.
 */
export async function saveTemplateDay(actor: Actor, id: string, day: number, input: TemplateDayBody) {
  const before = await prisma.planTemplate.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such template.');
  await requireEdit(actor, before.pillar, 'catalog.saveTemplateDay');
  if (before.published) {
    throw new ApiError(
      409,
      'TEMPLATE_PUBLISHED',
      `${before.name} is published — duplicate it to change anything.`,
    );
  }
  await assertNotInFlight(before);

  const days = { ...((before.days as Record<string, unknown> | null) ?? {}) };
  days[String(day)] = {
    slots: input.slots,
    ...(input.targets != null ? { targets: input.targets } : {}),
  };

  const row = await prisma.planTemplate.update({
    where: { id },
    data: { days: days as unknown as Prisma.InputJsonValue },
  });
  await audit.record({
    actorId: actor.id,
    action: 'catalog.template_day_saved',
    subjectType: 'planTemplate',
    subjectId: id,
    meta: { name: row.name, day },
  });
  return row;
}

/**
 * Duplicate a template into a fresh DRAFT — the "Duplicate to edit" a published
 * template offers. The copy carries the whole cycle (days + per-day targets) so
 * the author starts from the real thing, but it is unpublished and behind nobody's
 * signature yet. Named "… (copy)", the way the demo does.
 */
export async function duplicateTemplate(actor: Actor, id: string) {
  const before = await prisma.planTemplate.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such template.');
  await requireEdit(actor, before.pillar, 'catalog.duplicateTemplate');

  const row = await prisma.planTemplate.create({
    data: {
      name: `${before.name} (copy)`,
      pillar: before.pillar,
      level: before.level,
      track: before.track,
      days: (before.days ?? {}) as unknown as Prisma.InputJsonValue,
      notes: before.notes,
      published: false,
      createdById: actor.id,
    },
  });
  await audit.record({
    actorId: actor.id,
    action: 'catalog.template_duplicated',
    subjectType: 'planTemplate',
    subjectId: row.id,
    meta: { name: row.name, from: id },
  });
  return row;
}
