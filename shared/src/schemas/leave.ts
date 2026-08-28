import { z } from 'zod';

import { LEAVE_STATUSES } from '../leave.js';
import { isoDate } from './common.js';

/**
 * Time & Cover's bodies.
 *
 * The state machine is NOT expressed here. Which transitions are legal depends on
 * where the record already stands and on who is asking, and both are facts only
 * the service holds — a schema that tried would be a second, weaker copy of
 * `nextStatusAfterResponse`.
 */

export const leaveStatusEnum = z.enum(LEAVE_STATUSES as unknown as [string, ...string[]]);

export const applyLeaveSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    /* required, and with a floor: "leave" is not a reason, and the cover board is
       read by whoever has to work the morning */
    reason: z.string().trim().min(3).max(500),
  })
  .refine((v) => v.from <= v.to, {
    message: 'The leave would end before it began',
    path: ['to'],
  });
export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>;

/**
 * The cover board, submitted whole.
 *
 * Both halves travel together because they are one arrangement: seats without
 * sessions leaves the appointments naming a coach who is away, and sessions
 * without seats leaves the clients riding on nobody.
 */
export const planCoverSchema = z.object({
  reallocations: z
    .array(z.object({ clientId: z.string().min(1), toId: z.string().min(1) }))
    .max(200),
  sessions: z
    .array(
      z.object({
        taskId: z.string().min(1),
        date: isoDate,
        toId: z.string().min(1),
      }),
    )
    .max(200),
});
export type PlanCoverInput = z.infer<typeof planCoverSchema>;

export const respondCoverSchema = z.object({
  accept: z.boolean(),
});
export type RespondCoverInput = z.infer<typeof respondCoverSchema>;

export const declineLeaveSchema = z.object({
  /* a decline without a reason is a decision the applicant cannot act on */
  reason: z.string().trim().min(3).max(500),
});
export type DeclineLeaveInput = z.infer<typeof declineLeaveSchema>;

export const leaveConfigSchema = z.object({
  approverRole: z.string().trim().min(1).max(60),
});
export type LeaveConfigInput = z.infer<typeof leaveConfigSchema>;
