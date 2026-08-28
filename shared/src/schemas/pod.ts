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
  /** Recorded on the audit row. A seat change is a change of who is answerable. */
  reason: z.string().trim().max(500).optional(),
});
export type AssignPodSeatInput = z.infer<typeof assignPodSeatSchema>;

export const podSeatParam = z.object({
  pillarKey: podSeatEnum,
});
export type PodSeatParam = z.infer<typeof podSeatParam>;
