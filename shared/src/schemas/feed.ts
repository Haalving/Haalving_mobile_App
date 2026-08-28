import { z } from 'zod';

import { FEED_TAGS } from '../people.js';

/** The team feed — staff only. Client announcements are a different perm and a
 *  different surface (Community), and they are deliberately not this. */

export const feedTagEnum = z.enum(FEED_TAGS as unknown as [string, ...string[]]);

export const createPostSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  tag: feedTagEnum.default('general'),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;
