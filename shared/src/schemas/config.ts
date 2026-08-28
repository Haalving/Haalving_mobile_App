import { z } from 'zod';

import { CHAIN_KINDS } from '../chains.js';
import { FLOW_TRIGGERS } from '../flows.js';
import { roleEnum } from './common.js';

/**
 * Configuration's bodies, one per tab.
 *
 * The SHAPE rules are not restated here. `validateProgram` returns sentences a
 * human reads and several of them name the offending number back — a Zod message
 * cannot do that, and two sets of rules would be one set too many. So the schema
 * asserts only that the numbers are numbers, and the service asks
 * `validateProgram` for the verdict.
 */

export const programShapeSchema = z.object({
  levels: z.number().int(),
  cycleDays: z.number().int(),
  reviewDay: z.number().int(),
  restDays: z.array(z.number().int()).max(30),
  meetingDay: z.number().int(),
  termDays: z.number().int(),
  sessions: z.object({
    fitness: z.number().int(),
    yoga: z.number().int(),
    mind: z.number().int(),
  }),
});
export type ProgramShapeInput = z.infer<typeof programShapeSchema>;

/**
 * The service numbers, which are read LIVE — no versioning, no delay. The meals
 * queue and Time & Cover consult them on every request, so a change here is in
 * force on the next one.
 */
export const serviceConfigSchema = z
  .object({
    replyTargetMin: z.number().int().min(1).max(1440).optional(),
    notifyAfterMin: z.number().int().min(0).max(1440).optional(),
    escalateAfterMin: z.number().int().min(0).max(1440).optional(),
    escalateToRole: roleEnum.optional(),
    approverRole: roleEnum.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type ServiceConfigInput = z.infer<typeof serviceConfigSchema>;

export const chainKindEnum = z.enum(CHAIN_KINDS as unknown as [string, ...string[]]);

export const setChainSchema = z.object({
  steps: z.array(z.object({ role: roleEnum })).max(10),
});
export type SetChainInput = z.infer<typeof setChainSchema>;

/* -------------------------------------------------------- notifications */

export const createNotifRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  /* FREE TEXT on purpose: the jobs interpret the schedules they know and store
     the rest. A closed enum here would mean a new cadence needed a deploy before
     Ops could even write it down. */
  schedule: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
});
export type CreateNotifRuleInput = z.infer<typeof createNotifRuleSchema>;

export const updateNotifRuleSchema = z
  .object({
    schedule: z.string().trim().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    audience: z.string().trim().min(1).max(60).optional(),
    channel: z.string().trim().min(1).max(60).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateNotifRuleInput = z.infer<typeof updateNotifRuleSchema>;

/* ---------------------------------------------------------- automations */

export const flowTriggerEnum = z.enum(FLOW_TRIGGERS as unknown as [string, ...string[]]);

export const createFlowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  desc: z.string().trim().max(500).nullish(),
  trigger: flowTriggerEnum,
  defaultOn: z.boolean().default(false),
});
export type CreateFlowInput = z.infer<typeof createFlowSchema>;

export const updateFlowSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    desc: z.string().trim().max(500).nullish(),
    trigger: flowTriggerEnum.optional(),
    defaultOn: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateFlowInput = z.infer<typeof updateFlowSchema>;

export const flowStepSchema = z.object({
  after: z.number().int().min(0).max(3650).nullish(),
  on: z.number().int().min(1).max(365).nullish(),
  /** Minutes from midnight. */
  at: z.number().int().min(0).max(1439),
  title: z.string().trim().min(1).max(160),
  text: z.string().trim().min(1).max(4000),
});
export type FlowStepInput = z.infer<typeof flowStepSchema>;

/* ------------------------------------------------------------- catalog */

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const renameCategorySchema = createCategorySchema;

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;
