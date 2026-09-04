import { z } from 'zod';

import { FLOW, stepDef } from '../onboardingFlow.js';
import { POD_SEATS } from '../pillars.js';
import { email, phone, planEnum } from './common.js';

/**
 * The bodies of the Onboarding rail.
 *
 * Request bodies speak the repo's lowercase vocabulary (`poorna`, `sales`) and
 * the service maps to the Prisma enum, exactly as `client.service.ts:49` does.
 * One convention, so no route has to remember which case it is in.
 */

/**
 * Where an arrival came from.
 *
 * `direct` is not one of the three a person picks. It is STAMPED by
 * `arrivals.addClientDirect` on somebody taken on off-system and put straight on
 * the roster without the twelve steps. The arrival is still written, because how
 * a client got here is a fact — and filing that person under `sales` would make
 * the trail claim a route they never took.
 */
export const ARRIVAL_SOURCES = ['sales', 'self', 'referral', 'direct'] as const;
export type ArrivalSource = (typeof ARRIVAL_SOURCES)[number];
export const arrivalSourceEnum = z.enum(ARRIVAL_SOURCES);

/**
 * The three a human actually picks, and the only three a body may name.
 *
 * Keeping this list separate rather than filtering `direct` out by exclusion is
 * what stops `POST /arrivals` minting a record that CLAIMS the twelve steps were
 * skipped and then walks them anyway — the two would be a contradiction on the
 * same row, and the console's New-arrival sheet would grow a fourth chip for a
 * source nobody chooses.
 */
export const PICKABLE_ARRIVAL_SOURCES = ['sales', 'self', 'referral'] as const;
export type PickableArrivalSource = (typeof PICKABLE_ARRIVAL_SOURCES)[number];
export const pickableArrivalSourceEnum = z.enum(PICKABLE_ARRIVAL_SOURCES);

/**
 * A step key, checked against the FLOW itself rather than a hand-kept list.
 *
 * A body naming a step that does not exist is a 422 at the edge, not a 409 from
 * the service — the difference matters, because a 409 means "not now" and this
 * means "never".
 */
export const stepKeyEnum = z.enum(FLOW.map((s) => s.key) as [string, ...string[]]);

export const podSeatKeyEnum = z.enum(POD_SEATS as unknown as [string, ...string[]]);

/* ------------------------------------------------------------ the arrival */

export const createArrivalSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phone.optional(),
  email: email.optional(),
  /* the ROUTE additionally refuses a plan that is not on sale — `launch` is a
     runtime fact about the business, not a shape, so it is not asserted here */
  plan: planEnum,
  source: pickableArrivalSourceEnum,
  note: z.string().trim().max(2000).optional(),
});
export type CreateArrivalInput = z.infer<typeof createArrivalSchema>;

export const updateArrivalSchema = z
  .object({
    plan: planEnum.optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.plan !== undefined || v.note !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateArrivalInput = z.infer<typeof updateArrivalSchema>;

/* -------------------------------------------------------------- the ticks */

/**
 * One task, on or off.
 *
 * `taskIndex` is cross-checked against the step it names, so `assessprep#99`
 * cannot reach the service. Without the refine the index is just an integer and
 * a typo would be stored as a tick on a task that does not exist — invisible in
 * the UI and permanently counted against `stepComplete`.
 */
export const tickSchema = z
  .object({
    stepKey: stepKeyEnum,
    taskIndex: z.number().int().min(0),
    on: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const s = stepDef(v.stepKey);
    if (v.taskIndex >= s.tasks.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['taskIndex'],
        message: `Step ${v.stepKey} has ${s.tasks.length} tasks`,
      });
    }
  });
export type TickInput = z.infer<typeof tickSchema>;

/* ---------------------------------------------------------- the team seats */

/**
 * The override that lets an allocation past a full bench.
 *
 * The reason is REQUIRED and has a floor, because it goes to the audit log and
 * "ok" is not an answer anybody can act on six weeks later. The demo's sheet
 * refuses an empty one with "A reason is required. It goes to the audit log." —
 * this is the same refusal, one layer down where it cannot be skipped.
 */
export const capacityOverrideSchema = z.object({
  staffId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});
export type CapacityOverrideInput = z.infer<typeof capacityOverrideSchema>;

export const allocateSchema = z.object({
  /* keyed the way PodSeat is keyed in this repo — POD_SEATS, not the pillar
     keys: `dietitian` holds the culture pillar's seat and `mind` the wellness
     pillar's, and the seat vocabulary is the one the table speaks */
  seats: z.record(podSeatKeyEnum, z.string().min(1)),
  override: capacityOverrideSchema.optional(),
});
export type AllocateInput = z.infer<typeof allocateSchema>;

/* ------------------------------------------------------------- the InBody */

/**
 * The InBody key-in. Every field is bounded to something a human body can
 * actually read — a typo of 1750 for a height in cm is the commonest key-in
 * error there is, and it silently poisons every BMI drawn from it.
 */
export const inbodySchema = z.object({
  weightKg: z.number().min(20).max(400),
  heightCm: z.number().min(80).max(250),
  bodyFatPct: z.number().min(1).max(80),
  skeletalMuscleKg: z.number().min(5).max(120),
  visceralFat: z.number().min(1).max(60),
});
export type InbodyInput = z.infer<typeof inbodySchema>;

/* ------------------------------------------------------------ the welcome */

export const welcomeSchema = z.object({
  /* the REVIEWED text — what the human actually approved, not the draft */
  text: z.string().trim().min(1).max(2000),
});
export type WelcomeInput = z.infer<typeof welcomeSchema>;

/* ------------------------------------------------- the deliberate exception */

/**
 * Adding a client DIRECTLY, without the twelve steps.
 *
 * The SOP is the rule and this is the documented exception to it: somebody
 * already sold and already known, who should not be made to walk the rail. So
 * the body carries one field the arrival body does not — a REASON, with a floor,
 * because it is the only record of why the SOP was skipped and "ok" is not an
 * answer anybody can act on six weeks later. The same argument as
 * `capacityOverrideSchema`, and a longer floor because this skips more.
 *
 * `phone` is REQUIRED here while `createArrivalSchema` leaves it optional: an
 * arrival is a person on a rail and can be chased by other means, but this call
 * mints a login on the spot, and a client signs in with their number. A client
 * created without one is an account nobody can ever reach.
 */
export const addClientDirectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone,
  email: email.optional(),
  /* as with an arrival, the SERVICE additionally refuses a plan that is not on
     sale — `launch` is a runtime fact about the business, not a shape */
  plan: planEnum,
  reason: z.string().trim().min(8).max(280),
  note: z.string().trim().max(2000).optional(),
});
export type AddClientDirectInput = z.infer<typeof addClientDirectSchema>;
