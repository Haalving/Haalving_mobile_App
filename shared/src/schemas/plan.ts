import { z } from 'zod';

import { TEMPLATE_PILLARS } from '../slots.js';

/**
 * The client record's Plan tab — every write lands on the TICKET.
 *
 * Calling a template, editing a day, setting the client's own hour, dose or
 * targets: each is staged on a draft the console reads and the client app does
 * not. "Approve — publish" and "Discard draft" take no body; they are the two
 * ways a ticket leaves.
 */

/** The pillar in the path — the four pillars and the motivation library. */
export const planPillarParam = z.object({
  pillar: z.enum(TEMPLATE_PILLARS),
});
export type PlanPillarParam = z.infer<typeof planPillarParam>;

/** The cycle-day in the path. The programme shape bounds the real range; 60 is the ceiling. */
export const planDayParam = z.object({
  day: z.coerce.number().int().min(1).max(60),
});
export type PlanDayParam = z.infer<typeof planDayParam>;

/**
 * A clock the way `<input type="time">` hands it over — zero-padded 24h. `''` and
 * null both mean "not set", which on a write means CLEAR: hand the client back to
 * the template's own times.
 */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const timeValue = z.union([hhmm, z.literal(''), z.null()]);

/**
 * The client's own numbers over the plan's. `weight` and `focus` are TEXT — "5 kg
 * each", "bodyweight" and "hips, spine" are all real prescriptions. `.strict()`
 * so a typo'd key cannot ride along and silently mean nothing.
 */
export const doseSchema = z
  .object({
    sets: z.number().int().min(0).optional(),
    reps: z.number().int().min(0).optional(),
    rpe: z.number().int().min(0).max(10).optional(),
    mins: z.number().int().min(0).optional(),
    count: z.number().int().min(0).optional(),
    weight: z.string().max(60).optional(),
    focus: z.string().max(60).optional(),
  })
  .strict();
export type PlanDose = z.infer<typeof doseSchema>;

/** The five numbers the Nutrient Panel reads. */
export const targetsSchema = z
  .object({
    kcal: z.number().int().min(0).optional(),
    protein: z.number().int().min(0).optional(),
    carbs: z.number().int().min(0).optional(),
    fat: z.number().int().min(0).optional(),
    fibre: z.number().int().min(0).optional(),
  })
  .strict();
export type PlanTargets = z.infer<typeof targetsSchema>;

/**
 * "Call a template" — stage a published template of this pillar on the ticket.
 * The hour and the dose ride along from the same sheet; the server stages each
 * only when it differs from what is live.
 */
export const callPlanSchema = z.object({
  templateId: z.string().min(1),
  time: timeValue.optional(),
  dose: doseSchema.nullable().optional(),
});
export type CallPlanInput = z.infer<typeof callPlanSchema>;
/** Kept under its old name for anything that imported the assign shape. */
export type AssignPlanInput = CallPlanInput;

/**
 * One entry of an option: a bare item id, or `{ id, x }` for more than one
 * portion. `x` is bounded the way the editor cycles it (×1 → ×2 → ×3) with room
 * for a hand-typed larger plate; the service canonicalises `x: 1` to the bare id.
 */
const entrySchema = z.union([
  z.string().min(1),
  z.object({ id: z.string().min(1), x: z.number().int().min(1).max(9).optional() }),
]);

/**
 * A slot's clock, written the way a coach writes it — '8:00', '19:30',
 * '6:30 pm' — or '' for none. It reaches the client app as the plate's time,
 * so free text is refused here rather than printed on a phone.
 */
const slotTime = z.union([
  z.string().regex(/^(\d{1,2}):(\d{2})(\s*[ap]\.?m\.?)?$/i, 'A time like 8:00 or 6:30 pm.'),
  z.literal(''),
]);

/** A slot: a label, a clock, the A/B/C options, the pillar's own fields. */
export const planSlotSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  time: slotTime.optional(),
  options: z.array(z.array(entrySchema).min(1)).min(1),
  dose: z.record(z.union([z.number(), z.string()])).optional(),
});
export type PlanSlotInput = z.infer<typeof planSlotSchema>;

/** "Edit day" — the day's slots, saved WHOLE onto the ticket's overrides. */
export const planDaySchema = z.object({
  slots: z.array(planSlotSchema).max(12),
});
export type PlanDayInput = z.infer<typeof planDaySchema>;

/**
 * The client's own hour, dose or daily targets — each staged when present,
 * cleared when '' / null. At least one has to be there, or the call says nothing.
 */
export const planTuneSchema = z
  .object({
    time: timeValue.optional(),
    dose: doseSchema.nullable().optional(),
    targets: targetsSchema.nullable().optional(),
  })
  .refine((v) => 'time' in v || 'dose' in v || 'targets' in v, {
    message: 'Send a time, a dose or targets.',
  });
export type PlanTuneInput = z.infer<typeof planTuneSchema>;

/** "Save as new template" — the live plan, overrides baked in, as a draft. */
export const saveAsTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type SaveAsTemplateInput = z.infer<typeof saveAsTemplateSchema>;
