import { z } from 'zod';

import { seenTabEnum } from './common.js';

/**
 * Stamping a tab as seen.
 *
 * `ids` is the exact list that was ON SCREEN, not a timestamp — anything that
 * arrived while the page was open must still be new on the next visit. The cap
 * is generous but present: an unbounded array is an unbounded write.
 */
export const markSeenSchema = z.object({
  tab: seenTabEnum,
  ids: z.array(z.string().min(1).max(200)).max(2000),
});
export type MarkSeenInput = z.infer<typeof markSeenSchema>;
