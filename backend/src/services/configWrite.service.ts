import type { Prisma } from '@prisma/client';
import {
  CHAIN_KINDS,
  DEFAULT_CHAINS,
  STORABLE_ROLE_KEYS,
  validateChain,
  validateProgram,
  validateTemplate,
  type ChainKind,
  type ChainStep,
  type ProgramShape,
} from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import * as audit from './audit.service.js';
import * as config from './config.service.js';

/**
 * Configuration's WRITE side.
 *
 * Split from `config.service` on purpose: that module is read by half the product
 * and must stay cheap to import, while this one is reached only from the page's
 * own routes. It also keeps the gate in one place — every function here starts by
 * asking the same question.
 */

export interface Actor {
  id: string;
  role: string;
}

/** The demo's own sentence, and the audit row that makes it true. */
const GATE_TOAST = 'Super Admin or Operations Head only. This attempt was logged.';

async function gate(actor: Actor, what: string, subjectId: string | null): Promise<void> {
  if (await can(actor.role, 'manageConfig')) return;
  await audit.record({
    actorId: actor.id,
    action: 'denied',
    subjectType: 'config',
    subjectId,
    reason: what,
    meta: { role: actor.role },
  });
  throw ApiError.forbidden(GATE_TOAST);
}

/** Every write is audited with before and after. */
async function record(
  actor: Actor,
  tab: string,
  subjectId: string | null,
  before: unknown,
  after: unknown,
) {
  await audit.record({
    actorId: actor.id,
    action: `config.${tab}.changed`,
    subjectType: 'config',
    subjectId,
    meta: { before, after } as Prisma.InputJsonValue,
  });
}

/* -------------------------------------------------------------- program */

/**
 * A new SHAPE VERSION, never an edit of the old one.
 *
 * Existing clients keep the version their cycle started on; only somebody starting
 * a cycle after this moment walks the new one. That is why this INSERTS rather
 * than updates — an update would silently move every client mid-cycle, which is
 * the one thing rule 2 exists to prevent.
 */
export async function setProgram(actor: Actor, input: ProgramShape) {
  await gate(actor, 'config.program', null);

  const sentence = validateProgram(input);
  if (sentence) throw ApiError.badRequest(sentence, { program: sentence });

  const before = await config.getShape();

  const row = await prisma.programShape.create({
    data: {
      levels: input.levels,
      cycleDays: input.cycleDays,
      reviewDay: input.reviewDay,
      restDays: [...input.restDays],
      meetingDay: input.meetingDay,
      termDays: input.termDays,
      sessions: input.sessions as unknown as Prisma.InputJsonValue,
      createdById: actor.id,
    },
  });

  await config.invalidate(config.CACHE_KEYS.shape);
  await record(actor, 'program', String(row.version), before, { ...input, version: row.version });

  return { version: row.version, shape: await config.getShape() };
}

/* -------------------------------------------------------------- service */

export async function setService(
  actor: Actor,
  input: {
    replyTargetMin?: number;
    notifyAfterMin?: number;
    escalateAfterMin?: number;
    escalateToRole?: string;
    approverRole?: string;
  },
) {
  await gate(actor, 'config.service', null);

  const before = { ...(await config.getSla()), ...(await config.getLeaveConfig()) };

  const sla = {
    ...(input.replyTargetMin !== undefined ? { replyTargetMin: input.replyTargetMin } : {}),
    ...(input.notifyAfterMin !== undefined ? { notifyAfterMin: input.notifyAfterMin } : {}),
    ...(input.escalateAfterMin !== undefined ? { escalateAfterMin: input.escalateAfterMin } : {}),
    ...(input.escalateToRole !== undefined ? { escalateToRole: input.escalateToRole } : {}),
  };

  if (Object.keys(sla).length) {
    await prisma.slaConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...sla },
      update: sla,
    });
    await config.invalidate(config.CACHE_KEYS.sla);
  }

  if (input.approverRole !== undefined) {
    await prisma.leaveConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', approverRole: input.approverRole },
      update: { approverRole: input.approverRole },
    });
    await config.invalidate(config.CACHE_KEYS.leave);
  }

  const after = { ...(await config.getSla()), ...(await config.getLeaveConfig()) };
  await record(actor, 'service', null, before, after);
  return after;
}

/* --------------------------------------------------------------- chains */

export async function setChain(actor: Actor, kind: ChainKind, steps: ChainStep[]) {
  await gate(actor, 'config.chains', kind);

  const sentence = validateChain(steps, STORABLE_ROLE_KEYS);
  if (sentence) throw ApiError.badRequest(sentence, { chain: sentence });

  const before = await config.getChain(kind);
  const existing = await prisma.approvalChain.findUnique({ where: { kind: kind as never } });

  const row = await prisma.approvalChain.upsert({
    where: { kind: kind as never },
    create: {
      kind: kind as never,
      steps: steps as unknown as Prisma.InputJsonValue,
      updatedById: actor.id,
    },
    update: {
      steps: steps as unknown as Prisma.InputJsonValue,
      /* the version is what an approval's snapshot records, so a reader can tell
         which chain an in-flight item walked */
      version: (existing?.version ?? 0) + 1,
      updatedById: actor.id,
    },
  });

  await config.invalidate(config.CACHE_KEYS.chains);
  await record(actor, 'chains', kind, before, steps);
  return { kind, steps, version: row.version };
}

/* -------------------------------------------------------- notifications */

export async function createNotifRule(
  actor: Actor,
  input: { name: string; schedule: string; enabled: boolean },
) {
  await gate(actor, 'config.notifications', null);

  const clash = await prisma.notifRule.findUnique({ where: { title: input.name } });
  if (clash) throw ApiError.conflict('There is already a rule with that name.');

  const count = await prisma.notifRule.count();
  const row = await prisma.notifRule.create({
    data: {
      title: input.name,
      schedule: input.schedule,
      enabled: input.enabled,
      /* new rules go to everyone over Push until somebody narrows them */
      audience: 'All',
      channel: 'Push',
      position: count,
    },
  });

  await config.invalidate(config.CACHE_KEYS.notif);
  await record(actor, 'notifications', row.id, null, input);
  return row;
}

export async function updateNotifRule(
  actor: Actor,
  id: string,
  input: { schedule?: string; enabled?: boolean; audience?: string; channel?: string },
) {
  await gate(actor, 'config.notifications', id);
  const before = await prisma.notifRule.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such rule.');

  const row = await prisma.notifRule.update({ where: { id }, data: input });
  await config.invalidate(config.CACHE_KEYS.notif);
  await record(actor, 'notifications', id, before, row);
  return row;
}

export async function deleteNotifRule(actor: Actor, id: string) {
  await gate(actor, 'config.notifications', id);
  const before = await prisma.notifRule.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such rule.');

  await prisma.notifRule.delete({ where: { id } });
  await config.invalidate(config.CACHE_KEYS.notif);
  await record(actor, 'notifications', id, before, null);
  return { ok: true };
}

/* ----------------------------------------------------------- automations */

export async function createFlow(
  actor: Actor,
  input: { name: string; desc?: string | null; trigger: string; defaultOn: boolean },
) {
  await gate(actor, 'config.flows', null);
  const count = await prisma.flowTemplate.count();
  const row = await prisma.flowTemplate.create({
    data: {
      name: input.name,
      desc: input.desc ?? null,
      trigger: input.trigger as never,
      defaultOn: input.defaultOn,
      position: count,
    },
  });
  await config.invalidate(config.CACHE_KEYS.flows);
  await record(actor, 'flows', row.id, null, input);
  /* a new template starts with no steps and sends nothing until one is added */
  return { ...row, steps: [] };
}

export async function updateFlow(
  actor: Actor,
  id: string,
  input: {
    name?: string;
    desc?: string | null;
    trigger?: string;
    defaultOn?: boolean;
    enabled?: boolean;
  },
) {
  await gate(actor, 'config.flows', id);
  const before = await prisma.flowTemplate.findUnique({ where: { id }, include: { steps: true } });
  if (!before) throw ApiError.notFound('No such template.');

  /* changing the trigger changes which clock every step reads, so the steps have
     to still make sense against the new one */
  if (input.trigger && input.trigger !== before.trigger) {
    const shape = await config.getShape();
    const sentence = validateTemplate(
      { trigger: input.trigger as never, steps: before.steps },
      shape,
    );
    if (sentence) throw ApiError.badRequest(sentence, { flow: sentence });
  }

  const row = await prisma.flowTemplate.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.desc !== undefined ? { desc: input.desc } : {}),
      ...(input.trigger !== undefined ? { trigger: input.trigger as never } : {}),
      ...(input.defaultOn !== undefined ? { defaultOn: input.defaultOn } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });
  await config.invalidate(config.CACHE_KEYS.flows);
  await record(actor, 'flows', id, before, row);
  return row;
}

/**
 * RULE 7's refusal.
 *
 * A template anybody is switched on for cannot be deleted — the messages would
 * stop with no record of why, and nobody would know until a client asked. Pausing
 * says the same thing reversibly, which is what the sentence points at.
 */
export async function deleteFlow(actor: Actor, id: string) {
  await gate(actor, 'config.flows', id);
  const before = await prisma.flowTemplate.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such template.');

  const reach = await config.flowReach(id);
  if (reach.on > 0) {
    throw new ApiError(
      409,
      'FLOW_IN_USE',
      `${before.name} is switched on for ${reach.on} client${reach.on === 1 ? '' : 's'}. Pause it instead.`,
      reach,
    );
  }

  await prisma.flowTemplate.delete({ where: { id } });
  await config.invalidate(config.CACHE_KEYS.flows);
  await record(actor, 'flows', id, before, null);
  return { ok: true };
}

export async function addStep(
  actor: Actor,
  templateId: string,
  input: { after?: number | null; on?: number | null; at: number; title: string; text: string },
) {
  await gate(actor, 'config.flows', templateId);
  const t = await prisma.flowTemplate.findUnique({
    where: { id: templateId },
    include: { steps: true },
  });
  if (!t) throw ApiError.notFound('No such template.');

  const shape = await config.getShape();
  const sentence = validateTemplate({ trigger: t.trigger as never, steps: [input] }, shape);
  if (sentence) throw ApiError.badRequest(sentence, { step: sentence });

  const row = await prisma.flowStep.create({
    data: {
      templateId,
      after: input.after ?? null,
      on: input.on ?? null,
      at: input.at,
      title: input.title,
      text: input.text,
      position: t.steps.length,
    },
  });
  await config.invalidate(config.CACHE_KEYS.flows);
  await record(actor, 'flows', templateId, null, input);
  return row;
}

export async function updateStep(
  actor: Actor,
  templateId: string,
  stepId: string,
  input: { after?: number | null; on?: number | null; at?: number; title?: string; text?: string },
) {
  await gate(actor, 'config.flows', templateId);
  const t = await prisma.flowTemplate.findUnique({ where: { id: templateId } });
  const before = await prisma.flowStep.findUnique({ where: { id: stepId } });
  if (!t || !before) throw ApiError.notFound('No such step.');

  const merged = { ...before, ...input };
  const shape = await config.getShape();
  const sentence = validateTemplate({ trigger: t.trigger as never, steps: [merged] }, shape);
  if (sentence) throw ApiError.badRequest(sentence, { step: sentence });

  const row = await prisma.flowStep.update({ where: { id: stepId }, data: input });
  await config.invalidate(config.CACHE_KEYS.flows);
  await record(actor, 'flows', templateId, before, row);
  return row;
}

export async function deleteStep(actor: Actor, templateId: string, stepId: string) {
  await gate(actor, 'config.flows', templateId);
  const before = await prisma.flowStep.findUnique({ where: { id: stepId } });
  if (!before) throw ApiError.notFound('No such step.');
  await prisma.flowStep.delete({ where: { id: stepId } });
  await config.invalidate(config.CACHE_KEYS.flows);
  await record(actor, 'flows', templateId, before, null);
  return { ok: true };
}

/* -------------------------------------------------------------- catalog */

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export async function createCategory(actor: Actor, name: string) {
  await gate(actor, 'config.catalog', null);
  const key = slugOf(name);
  if (!key) throw ApiError.badRequest('That name has no letters in it.');

  const clash = await prisma.catalogCategory.findUnique({ where: { key } });
  if (clash) throw ApiError.conflict('There is already a category with that key.');

  const count = await prisma.catalogCategory.count();
  const row = await prisma.catalogCategory.create({
    data: { key, name, seeded: false, position: count },
  });
  await config.invalidate(config.CACHE_KEYS.catalog);
  await record(actor, 'catalog', key, null, { key, name });
  return row;
}

/** Renaming is always safe — the name is only displayed; the KEY is what points. */
export async function renameCategory(actor: Actor, key: string, name: string) {
  await gate(actor, 'config.catalog', key);
  const before = await prisma.catalogCategory.findUnique({ where: { key } });
  if (!before) throw ApiError.notFound('No such category.');

  const row = await prisma.catalogCategory.update({ where: { key }, data: { name } });
  await config.invalidate(config.CACHE_KEYS.catalog);
  await record(actor, 'catalog', key, before.name, name);
  return row;
}

export async function deleteCategory(actor: Actor, key: string) {
  await gate(actor, 'config.catalog', key);
  const before = await prisma.catalogCategory.findUnique({ where: { key } });
  if (!before) throw ApiError.notFound('No such category.');

  /* the three shipped keys are what every item, template and client points at */
  if (before.seeded) {
    throw new ApiError(
      409,
      'CATEGORY_SEEDED',
      `${before.name} ships with the product and cannot be removed.`,
    );
  }

  const usage = await config.categoryUsage(key);
  const total = usage.items + usage.clients;
  if (total > 0) {
    throw new ApiError(
      409,
      'CATEGORY_IN_USE',
      `${before.name} is used by ${usage.items} item${usage.items === 1 ? '' : 's'} and ${usage.clients} client${usage.clients === 1 ? '' : 's'}.`,
      usage,
    );
  }

  await prisma.catalogCategory.delete({ where: { key } });
  await config.invalidate(config.CACHE_KEYS.catalog);
  await record(actor, 'catalog', key, before, null);
  return { ok: true };
}

export async function createTag(actor: Actor, name: string) {
  await gate(actor, 'config.catalog', null);
  const slug = name.trim().toLowerCase();

  /* case-insensitively unique: "PCOD" and "pcod" are one tag, and two of them
     would split every filter that uses it */
  const clash = await prisma.catalogTag.findUnique({ where: { slug } });
  if (clash) throw ApiError.conflict(`There is already a tag called ${clash.name}.`);

  const count = await prisma.catalogTag.count();
  const row = await prisma.catalogTag.create({
    data: { name: name.trim(), slug, position: count },
  });
  await config.invalidate(config.CACHE_KEYS.catalog);
  await record(actor, 'catalog', row.id, null, { name });
  return row;
}

export async function deleteTag(actor: Actor, id: string) {
  await gate(actor, 'config.catalog', id);
  const before = await prisma.catalogTag.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('No such tag.');

  const usage = await config.tagUsage(before.name);
  if (usage.items > 0) {
    throw new ApiError(
      409,
      'TAG_IN_USE',
      `${before.name} is on ${usage.items} item${usage.items === 1 ? '' : 's'}.`,
      usage,
    );
  }

  await prisma.catalogTag.delete({ where: { id } });
  await config.invalidate(config.CACHE_KEYS.catalog);
  await record(actor, 'catalog', id, before, null);
  return { ok: true };
}

/* ------------------------------------------------------- the whole page */

/** Everything the page needs in one call. */
export async function readAll() {
  const [shape, sla, leave, chains, notif, flows, categories, tags] = await Promise.all([
    config.getShape(),
    config.getSla(),
    config.getLeaveConfig(),
    config.getChains(),
    config.getNotifRules(),
    config.getFlowTemplates(),
    config.getCategories(),
    config.getTags(),
  ]);

  const usage: Record<string, { items: number; templates: number; clients: number }> = {};
  for (const c of categories) usage[c.key] = await config.categoryUsage(c.key);

  const tagUsage: Record<string, { items: number }> = {};
  for (const t of tags) tagUsage[t.id] = await config.tagUsage(t.name);

  const reach: Record<string, { on: number; live: number }> = {};
  for (const f of flows) reach[f.id] = await config.flowReach(f.id);

  return {
    program: shape,
    service: { ...sla, ...leave },
    chains: CHAIN_KINDS.map((k) => ({ kind: k, steps: chains[k] ?? DEFAULT_CHAINS[k] })),
    notifications: notif,
    flows,
    reach,
    categories,
    usage,
    tags,
    tagUsage,
  };
}
