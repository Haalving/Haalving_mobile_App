import { z } from 'zod';

import { phone, planEnum } from './common.js';

/**
 * THE PUBLIC ONBOARDING BODY — everything the app's five chapters ask for.
 *
 * How someone with NO account creates one, so it is token-less. It carries the
 * whole deck rather than a summary of it, and that is a deliberate correction:
 * the app used to collect goals, conditions, a fitness level, a height, a weight
 * and a body reading, then post the name, the number and the goals FLATTENED INTO
 * ONE STRING. Five chapters of answers went into the request and four fields came
 * out the other side. A person was asked to slide a tape for a number nobody
 * stored.
 *
 * EVERY FIELD PAST THE FIRST TWO IS OPTIONAL, because every chapter past the
 * first can be skipped, and the deck says "Skip" on each of them. An absent answer
 * is a real answer here — it means "not asked yet", which the assessment meeting
 * exists to finish.
 *
 * WHAT THE SERVER DOES NOT TAKE ON TRUST: the plan is checked for shape here and
 * for "actually on sale" in the service (Svayam is not, this launch), the same
 * split the console's arrival create uses.
 */

/**
 * How much training somebody has behind them, in the deck's own four words.
 *
 * It is NOT the client's `track`. Track is the programme's own axis
 * (sedentary/moderate/active) and is derived from this once, in the service —
 * two names for one idea would drift the day somebody adds a fifth level.
 */
export const FITNESS_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];
export const fitnessLevelEnum = z.enum(FITNESS_LEVELS);

/**
 * A body-composition reading, as a smart scale or an InBody report gives it.
 *
 * Percentages, and bounded as percentages — a 250% body-fat reading is a typo or
 * a mis-keyed unit, and storing it would put a nonsense number in front of the
 * doctor who reads this before the first calendar is built. Every one is optional
 * on its own: the deck's own line is "Skip — your coach adds these later".
 */
export const bodyCompositionSchema = z.object({
  fat: z.number().min(1).max(75).optional(),
  muscle: z.number().min(1).max(80).optional(),
  protein: z.number().min(1).max(40).optional(),
});
export type BodyComposition = z.infer<typeof bodyCompositionSchema>;

export const onboardSchema = z.object({
  name: z.string().trim().min(2).max(120),
  /* REQUIRED — the account and the login are both keyed on the phone; an arrival
     may omit it (a coach took it by hand) but a self-sign-up cannot. */
  phone,
  plan: planEnum.optional(),

  /**
   * The changes they want, capped at five because the deck caps it at five
   * ("Choose up to five"). A sixth would be a screen and a server disagreeing
   * about the same rule.
   */
  goals: z.array(z.string().trim().min(1).max(80)).max(5).optional(),

  /**
   * What their circle should hold — diabetes, blood pressure, a joint. The deck
   * is emphatic that "conditions shape the plan, they never exclude you from it",
   * and this is the field that reaches the doctor before the first calendar.
   */
  conditions: z.array(z.string().trim().min(1).max(80)).max(20).optional(),

  fitness: fitnessLevelEnum.optional(),

  /* the tapes. Bounded to what a person can actually be, for the same reason the
     body percentages are — a slider cannot send these, but a request can. */
  heightCm: z.number().min(80).max(250).optional(),
  weightKg: z.number().min(20).max(400).optional(),
  body: bodyCompositionSchema.optional(),

  /**
   * Free text, kept for the arrival's note.
   *
   * `goals` above replaced this as the structured answer; it stays because the
   * console's own arrival note is the same field, and because a person may one
   * day be given a box to write in rather than chips to tap.
   */
  goal: z.string().trim().max(280).optional(),
});
export type OnboardInput = z.infer<typeof onboardSchema>;

/**
 * The deck's fitness level, translated to the programme's track — the one place
 * the mapping exists.
 *
 * Three tracks and four levels, so it is not one-to-one: the two ends of "I have
 * trained for years" both land on `moderate`, because the programme's `active`
 * track is not something a person self-declares into on a sign-up form. It is a
 * reading a coach makes at the assessment, and putting somebody there on their own
 * say-so would prescribe them a load nobody has watched them lift.
 */
export function trackForFitness(level: FitnessLevel | null | undefined): 'sedentary' | 'moderate' {
  return level === 'advanced' || level === 'expert' ? 'moderate' : 'sedentary';
}
