import { z } from 'zod';

import { email, isoDate, phone, pillarLevels, planEnum } from './common.js';

/**
 * The client record.
 *
 * `sex` and `gender` are TWO DIFFERENT FIELDS and must stay that way. `sex` is
 * CLINICAL — the Vital Panel reads it to choose lab reference bands
 * (haemoglobin, ferritin and creatinine have different normal ranges for male and
 * female bodies) and the BMR formula uses it. `gender` is IDENTITY, and `address`
 * is how this person asked to be addressed. Merging them silently moves a
 * client's lab reference bands, which nobody notices until it matters.
 *
 * `age` is NOT authoritative — it is derived from `dob` by `cycle.ageOf()`. The
 * stored number survives only so a record with no date of birth still reads.
 */

/* the demo's own three, verbatim — console-clients.js STATUS_FILTERS. 'inactive'
   rather than 'ended': a lapsed term is a win-back call waiting to be made. */
export const clientStatusEnum = z.enum(['active', 'paused', 'inactive']);
export const sexEnum = z.enum(['M', 'F']);
export const trackEnum = z.enum(['sedentary', 'moderate', 'active']);

export const createClientSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    /** The client's own login. A console-side record may have none. */
    phone: phone.optional(),
    email: email.optional(),
    code: z.string().trim().max(40).optional(),
    designation: z.string().trim().max(120).optional(),

    /* clinical */
    sex: sexEnum,
    dob: isoDate.optional(),
    heightCm: z.number().min(50).max(260).optional(),
    weightKg: z.number().min(20).max(400).optional(),
    health: z.array(z.string().trim().min(1).max(200)).max(40).optional(),

    /* identity, kept apart from the clinical fields on purpose */
    gender: z.string().trim().max(40).optional(),
    address: z.string().trim().max(60).optional(),
    location: z.string().trim().max(160).optional(),

    plan: planEnum.default('poorna'),
    /**
     * Which pillars a human coaches. Poorna is all four by definition, so this
     * only ever narrows a Svayam client — and `humanPillar()` reads it.
     */
    humanPillars: z.array(z.enum(['fitness', 'culture', 'yoga', 'wellness'])).default([]),
    track: trackEnum.default('sedentary'),

    joinedAt: isoDate.optional(),
    /** The ENGAGEMENT clock — 90 days by default, and not the programme clock. */
    termDays: z.number().int().min(1).max(3650).optional(),

    goal: z.string().trim().max(400).optional(),
    purpose: z.string().trim().max(400).optional(),
    tzo: z.number().min(-12).max(14).default(5.5),
  })
  .refine((v) => v.plan !== 'poorna' || v.humanPillars.length === 0 || v.humanPillars.length === 4, {
    message: 'A Poorna client is carried by a human on all four pillars, by definition',
    path: ['humanPillars'],
  });

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: phone.optional(),
    email: email.optional(),
    designation: z.string().trim().max(120).nullish(),
    sex: sexEnum.optional(),
    dob: isoDate.nullish(),
    heightCm: z.number().min(50).max(260).nullish(),
    weightKg: z.number().min(20).max(400).nullish(),
    health: z.array(z.string().trim().min(1).max(200)).max(40).optional(),
    gender: z.string().trim().max(40).nullish(),
    address: z.string().trim().max(60).nullish(),
    location: z.string().trim().max(160).nullish(),
    track: trackEnum.optional(),
    goal: z.string().trim().max(400).nullish(),
    purpose: z.string().trim().max(400).nullish(),
    tzo: z.number().min(-12).max(14).optional(),
    status: clientStatusEnum.optional(),
    /** Required by the API when `status` changes — a pause has a reason. */
    statusWhy: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' })
  .refine((v) => v.status === undefined || !!v.statusWhy, {
    message: 'Say why the status is changing — it goes on the record',
    path: ['statusWhy'],
  });

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

/**
 * A plan change moves who coaches this person, so it carries its own reason and
 * cannot ride along with an edited phone number.
 */
export const changePlanSchema = z.object({
  plan: planEnum,
  humanPillars: z.array(z.enum(['fitness', 'culture', 'yoga', 'wellness'])).default([]),
  reason: z.string().trim().min(3).max(500),
});
export type ChangePlanInput = z.infer<typeof changePlanSchema>;

/**
 * Levels move ONLY at the level review, and each pillar moves on its own. This
 * body therefore states four levels, never one — there is no headline level, and
 * a single number here would be the retired lowest-pillar rule in disguise.
 */
export const setLevelsSchema = z.object({
  levels: pillarLevels,
  reason: z.string().trim().min(3).max(500),
});
export type SetLevelsInput = z.infer<typeof setLevelsSchema>;

export const listClientsQuery = z.object({
  plan: planEnum.optional(),
  status: clientStatusEnum.optional(),
  /** Narrow to one coach's clients — scoping still applies on top. */
  staffId: z.string().min(1).optional(),
  q: z.string().trim().max(120).optional(),
});
export type ListClientsQuery = z.infer<typeof listClientsQuery>;
