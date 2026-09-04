import { z } from 'zod';

import { attentionSeverityEnum } from './attention.js';

/**
 * Notices — the sweeps' outbox, as a query and two doors.
 *
 * A notice is addressed to ONE PERSON by the flow that wrote it, so there is no
 * body here that names a recipient and no filter that names one either: the
 * caller is the recipient, taken from the token, and a query that could ask for
 * somebody else's outbox would be a scope hole wearing a query parameter.
 *
 * Nothing here raises a notice. Sweeps do that, from inside the server, through
 * `notice.service.raise` — and a body that could post one would let anybody
 * address anybody in the building under the sweep's name.
 */

/**
 * The kinds, MIRRORING the Prisma enum and appended to in the same order.
 *
 * A hand-written union is exactly how `CLIENT_RISK` and `SLA_BREACH` arrived
 * late — so this list exists to be validated against, is exported as an array
 * for the console's icon map to read, and is the one place a new kind is typed
 * on this side of the wire.
 */
export const NOTICE_KINDS = [
  'LEAVE',
  'SLA',
  'REMINDER',
  'CELEBRATION',
  'TASK',
  'CLIENT_RISK',
  'SLA_BREACH',
] as const;
export const noticeKindEnum = z.enum(NOTICE_KINDS);
export type NoticeKindKey = (typeof NOTICE_KINDS)[number];

/**
 * A notice's own lifecycle — NOT `seenAt`, which the work board stamps for the
 * whole list after paint. Two boards, two meanings of "read", two columns.
 */
export const NOTICE_STATUSES = ['UNREAD', 'READ', 'ACKNOWLEDGED'] as const;
export const noticeStatusEnum = z.enum(NOTICE_STATUSES);
export type NoticeStatusKey = (typeof NOTICE_STATUSES)[number];

/**
 * A flag as it survives a query string.
 *
 * NOT `z.coerce.boolean()`, which is the trap this line exists to avoid: every
 * non-empty string is truthy, so `?unreadOnly=false` would coerce to TRUE and
 * the caller would get the opposite of what they asked for, silently.
 */
const queryFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/**
 * The Home › Notices page, as a query.
 *
 * The cursor is opaque to everybody but the service: it is the id of the last
 * row of the previous page, and nothing outside `notice.service.ts` may assume
 * that, because the day the board's order changes is the day it stops being true.
 */
export const listNoticesQuery = z.object({
  /** The badge's own list — what is still waiting to be looked at. */
  unreadOnly: queryFlag.optional(),
  kind: noticeKindEnum.optional(),
  severity: attentionSeverityEnum.optional(),
  clientId: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).max(200).optional(),
});
export type ListNoticesQuery = z.infer<typeof listNoticesQuery>;
