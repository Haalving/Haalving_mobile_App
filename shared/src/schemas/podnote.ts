import { z } from 'zod';

/**
 * Pod notes — the private panel on a client record's Overview.
 *
 * SHAPE ONLY, as everywhere else in this folder. Who may write one, who may edit
 * somebody else's, and whether the note an id names belongs to the client in the
 * path are all questions about ROWS rather than about the request, and
 * `podnote.service.ts` answers them.
 */

/**
 * The same 4 000-character ceiling a circle message carries.
 *
 * Not an arbitrary number twice: they are the two private lanes about one client,
 * and a limit that differed between them would be a difference nobody could
 * explain to the coach who hit it.
 */
const noteContent = z
  .string()
  .trim()
  .min(1, 'Write the note first.')
  .max(4000, 'That is longer than the next specialist will read.');

export const createPodNoteSchema = z.object({ content: noteContent });
export type CreatePodNoteInput = z.infer<typeof createPodNoteSchema>;

/**
 * An edit REPLACES the note. There is no partial here because there is only one
 * field a human owns — a PATCH that could omit `content` would be a PATCH that
 * changes nothing, and the panel has no second thing to change.
 */
export const updatePodNoteSchema = z.object({ content: noteContent });
export type UpdatePodNoteInput = z.infer<typeof updatePodNoteSchema>;

export const podNoteParam = z.object({ noteId: z.string().min(1) });
export type PodNoteParam = z.infer<typeof podNoteParam>;
