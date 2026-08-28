import { z } from 'zod';

/**
 * Coach capacity — how many clients a coach carries.
 *
 * DECLARED, NEVER DERIVED. This is the rule the demo states in as many words:
 * "HV.store.capacity is a different question — how many clients a coach carries,
 * deliberately narrative (Vikram reads 50/50 FULL while carrying six) — and must
 * not be derived."
 *
 * Counting pod seats would make the number a fact about the database rather than
 * a decision by the person who runs the bench. A coach with six demo clients is
 * still full if their week is full. So `declared` is typed in and `load` is typed
 * in, and nothing in the API computes either from PodSeat rows.
 */
export const updateCapacitySchema = z.object({
  /** The ceiling this coach is willing to carry. */
  declared: z.number().int().min(0).max(500),
  /** What they are carrying now. Stated, not counted. */
  load: z.number().int().min(0).max(500).optional(),
  note: z.string().trim().max(280).nullish(),
});
export type UpdateCapacityInput = z.infer<typeof updateCapacitySchema>;

/**
 * Going past a declared ceiling is a decision somebody signs for. Only a role
 * holding `overrideCapacity` may, and the reason is stored on the audit row —
 * so "why is Vikram at 52 of 50" always has an answer with a name on it.
 */
export const overrideCapacitySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type OverrideCapacityInput = z.infer<typeof overrideCapacitySchema>;
