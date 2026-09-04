import { z } from 'zod';

import { isoDate } from './common.js';

/**
 * The client record's merged log, as a query.
 *
 * The list behind it is DERIVED — eleven live sources merged and time-sorted on
 * every request — and that fact decides the shape of everything below.
 */

/** The tab's four chips. The same words `client-logs.service.ts` tags each row with. */
export const logBucketEnum = z.enum(['client', 'team', 'plan', 'medical']);
export type LogBucketKey = z.infer<typeof logBucketEnum>;

/**
 * `<the ISO timestamp of the last row sent>|<how many rows stamped that same
 * instant went with it>`
 *
 * A KEYSET CURSOR RATHER THAN AN OFFSET, and on a derived list that is not a
 * preference. The timeline is rebuilt from its eleven sources every request, so a
 * meal logged while somebody is paging would push every row below it down by one
 * and they would read the same entry twice — an offset is a promise about a list
 * that is holding still. A timestamp holds: anything newer than the cursor is
 * skipped on the way past. The tie count settles the one case a timestamp cannot,
 * which is two entries stamped the same millisecond.
 *
 * Issued by the server and handed straight back. The regex is what a rejected
 * cursor gets answered with — a 400 before the eleven reads, not a silent page 1.
 */
export const logCursor = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|\d+$/,
    'That is not a cursor this list handed out.',
  );

export const clientLogsQuery = z
  .object({
    bucket: logBucketEnum.optional(),
    /**
     * Local calendar days, BOTH ENDS INCLUSIVE — the window a date picker hands
     * over, and a `to` that excluded its own day would drop everything the reader
     * did on the day they asked about.
     */
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: logCursor.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'A window has to end after it starts',
    path: ['to'],
  });
export type ClientLogsQuery = z.infer<typeof clientLogsQuery>;
