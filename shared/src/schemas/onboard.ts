import { z } from 'zod';

import { phone, planEnum } from './common.js';

/**
 * THE PUBLIC ONBOARDING BODY.
 *
 * How someone with NO account creates one, from the app's first-run deck — so it
 * is token-less, and the fields are only what a self-arrival actually needs: a
 * name, the number the account is keyed on, the plan they chose, and the line they
 * wrote about why. The plan is validated for shape here and for "actually on sale"
 * in the service (Svayam is not, this launch), the same split the console's
 * arrival create uses.
 */
export const onboardSchema = z.object({
  name: z.string().trim().min(2).max(120),
  /* REQUIRED — the account and the login are both keyed on the phone; an arrival
     may omit it (a coach took it by hand) but a self-sign-up cannot. */
  phone,
  plan: planEnum.optional(),
  /* "What brings you here" — kept as the arrival's note, optional like the demo's */
  goal: z.string().trim().max(280).optional(),
});
export type OnboardInput = z.infer<typeof onboardSchema>;
