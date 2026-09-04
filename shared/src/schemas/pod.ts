import { z } from 'zod';

import { podSeatEnum } from './common.js';

/**
 * A client's pod — one seat per role, and the seats are keyed by STAFF ROLE, not
 * by pillar: `dietitian` (not `culture`) and `mind` (not `wellness`).
 *
 * That is not a slip. `HV.staffFor(client, roleKey)` and `HV.myClients()` both
 * look a seat up by role key, so renaming either would break client scoping for
 * every coach in the product.
 *
 * `staffId: null` is a real, meaningful value — it means the AI holds the seat.
 * `HV.staff()` returns an AI pseudo-user for a missing or 'u-ai' id, so an
 * unfilled pillar renders as the AI without any screen special-casing it. On a
 * Svayam client the pod is DELIBERATELY sparse.
 */
export const assignPodSeatSchema = z.object({
  /** null hands the seat back to the AI. */
  staffId: z.string().min(1).nullable(),
  /**
   * Recorded on the audit row and read out in the pod's own thread. A seat
   * change is a change of who is answerable, and taking a client off a coach is
   * feedback about that coach — if nobody is made to type it, the only record of
   * why is nothing.
   *
   * OPTIONAL HERE, CONDITIONALLY REQUIRED IN THE SERVICE. Whether a reason is
   * owed depends on who currently holds the seat — replacing a human owes one,
   * filling an empty or AI seat replaces nobody and owes nothing — and that is a
   * fact about the row in the database, not about this body. So the shape check
   * lives here (trimmed, 4–500 characters if given at all, which rejects the
   * one-word "n/a" that a required field otherwise collects) and
   * `assignPodSeat` enforces the condition.
   */
  reason: z.string().trim().min(4).max(500).optional(),
});
export type AssignPodSeatInput = z.infer<typeof assignPodSeatSchema>;

export const podSeatParam = z.object({
  pillarKey: podSeatEnum,
});
export type PodSeatParam = z.infer<typeof podSeatParam>;
