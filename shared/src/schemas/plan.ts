import { z } from 'zod';

import { PILLAR_KEYS } from '../pillars.js';

/**
 * Assigning a client to a plan template.
 *
 * `templateId: null` is a real value and not an omission — it CLEARS the plan
 * while leaving the pillar open, which is the demo's "called, but the client has
 * no plan" state. A DELETE would remove the row and lose that distinction.
 */
export const assignPlanSchema = z.object({
  templateId: z.string().min(1).nullable(),
  /**
   * A plan is a draft until somebody stands behind it, so this DEFAULTS TO TRUE.
   * Publishing is its own call: choosing a template is a coach thinking, taking it
   * out of draft is the moment it becomes what the client is actually on.
   */
  draft: z.boolean().optional(),
});
export type AssignPlanInput = z.infer<typeof assignPlanSchema>;

/** The pillar in the path. Four, and never the fifth library. */
export const planPillarParam = z.object({
  pillar: z.enum(PILLAR_KEYS as unknown as [string, ...string[]]),
});
export type PlanPillarParam = z.infer<typeof planPillarParam>;
