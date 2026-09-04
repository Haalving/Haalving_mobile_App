import type { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import * as audit from './audit.service.js';
import { canSeeClient, type Scoper } from './scope.service.js';

/**
 * POD NOTES — the private panel on a client record's Overview.
 *
 * WHAT THEY ARE, and are not. Not the `TEAMONLY` circle lane, though both are
 * private to the pod: that lane is a CONVERSATION about a client in time order,
 * posted and replied to. A pod note is a FACT SOMEBODY MAINTAINS — standing
 * context for whoever picks this client up next, edited rather than answered, and
 * read before the next specialist opens their mouth rather than scrolled to.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THIS FILE EXISTS TO KEEP: A NOTE NEVER REACHES THE CLIENT IT IS
 * ABOUT. Three separate facts keep it, because one of them will eventually be
 * edited by somebody who has not read this comment:
 *
 *   1. Every route into here is `staffOnly` — the same door that keeps a client's
 *      legitimate token out of the console surface entirely.
 *   2. `assertStaff` refuses the `client` role a second time, and that is not
 *      belt-and-braces for its own sake. `canSeeClient` resolves a client to
 *      their OWN record and answers TRUE, so scoping alone would hand somebody
 *      the notes written about them and the request would look correct on the
 *      way past.
 *   3. THE WORDS ARE COPIED NOWHERE. Writing a note posts no circle message,
 *      raises no notice and files no `ClientLog` row; the audit row it does write
 *      carries the note's id and never its content. So "can a client read one" is
 *      a question about ONE table, settled by grep, rather than a question about
 *      every place the text was also filed.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SOFT DELETE, ALWAYS. A note somebody acted on is the record of why they acted:
 * `deletedAt` takes it off the panel and leaves it in the record, so a coach who
 * removes a line cannot remove the reason a decision was made.
 */

type CreateInput = z.infer<typeof schemas.createPodNoteSchema>;
type UpdateInput = z.infer<typeof schemas.updatePodNoteSchema>;

/** The row the Overview panel draws. `author` is null once its writer has left. */
export interface PodNoteRow {
  id: string;
  content: string;
  author: { id: string; name: string; role: string } | null;
  createdAt: string;
  /** Stamped only by a human edit, so the panel can say "edited" and mean it. */
  editedAt: string | null;
}

/* ------------------------------------------------------------------ guards */

/**
 * A pod note is a staff object, and `canSeeClient` alone does not say so — see
 * fact 2 in the note at the top of this file.
 */
function assertStaff(user: Scoper): void {
  if (user.role === 'client') throw ApiError.forbidden();
}

/** 404, never 403: a refusal that confirmed the client existed would be an answer. */
async function assertReachable(user: Scoper, clientId: string): Promise<void> {
  assertStaff(user);
  if (!(await canSeeClient(user, clientId))) throw ApiError.notFound('No such client.');
}

/**
 * Refuse, and write the row that makes the refusal a fact. The same shape
 * `queues.service.ts` uses, for the same reason: the console tells people access
 * attempts are logged, and only the server can make that true.
 */
async function deny(user: Scoper, what: string, noteId: string, message: string): Promise<never> {
  await audit.record({
    actorId: user.id,
    action: 'denied',
    subjectType: 'podNote',
    subjectId: noteId,
    reason: what,
    meta: { role: user.role },
  });
  throw ApiError.forbidden(message);
}

const shape = (n: {
  id: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; name: string; role: string } | null;
}): PodNoteRow => ({
  id: n.id,
  content: n.content,
  author: n.author,
  createdAt: n.createdAt.toISOString(),
  editedAt: n.editedAt?.toISOString() ?? null,
});

const SELECT = {
  id: true,
  content: true,
  createdAt: true,
  editedAt: true,
  author: { select: { id: true, name: true, role: true } },
} as const;

/**
 * The note this act is about, or a 404.
 *
 * `clientId` is in the WHERE rather than compared afterwards, so a note id from
 * another client's record reads as missing instead of as forbidden — the id in
 * the path is a value the caller picked, and the scope was granted over the
 * CLIENT. A deleted note is missing too: the row survives for the record, not for
 * a second edit.
 */
async function reachableNote(clientId: string, noteId: string) {
  const note = await prisma.podNote.findFirst({
    where: { id: noteId, clientId, deletedAt: null },
    select: { id: true, authorId: true },
  });
  if (!note) throw ApiError.notFound('No such note.');
  return note;
}

/**
 * Whose note is it to change.
 *
 * THE AUTHOR, OR `managePeople`. Standing context is maintained by the person who
 * knows the thing, so an edit is theirs; the second key exists because a note
 * outlives its author — somebody has to be able to correct a line left by a coach
 * who has since left the bench, and `managePeople` is already the seat that
 * answers for who is on it.
 */
async function assertMayChange(user: Scoper, note: { id: string; authorId: string | null }): Promise<void> {
  if (note.authorId && note.authorId === user.id) return;
  if (await can(user.role, 'managePeople')) return;
  await deny(user, 'podnote.not_author', note.id, 'Only the coach who wrote this note can change it.');
}

/* ------------------------------------------------------------------- reads */

/**
 * The panel, newest first.
 *
 * No pagination and no cursor, because standing context is not a feed: a record
 * carrying enough notes to page is a record whose notes have stopped being read,
 * and the answer to that is fewer notes rather than more scrolling.
 */
export async function list(user: Scoper, clientId: string): Promise<PodNoteRow[]> {
  await assertReachable(user, clientId);
  const rows = await prisma.podNote.findMany({
    where: { clientId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: SELECT,
  });
  return rows.map(shape);
}

/* ------------------------------------------------------------------ writes */

/**
 * Write one.
 *
 * Anybody whose scope reaches the client may — no permission gate, because the
 * pod IS the gate. A coach who sits on this client is exactly the person the next
 * specialist needs to hear from, and a permission on top of the seat would mean
 * the pillar coaches could read the panel and not add to it.
 */
export async function create(
  user: Scoper,
  clientId: string,
  input: CreateInput,
  ip?: string | null,
): Promise<PodNoteRow> {
  await assertReachable(user, clientId);

  const note = await prisma.podNote.create({
    data: { clientId, authorId: user.id, content: input.content },
    select: SELECT,
  });

  /* the id and the client, never the words — fact 3 at the top of this file */
  await audit.record({
    actorId: user.id,
    action: 'podnote.created',
    subjectType: 'podNote',
    subjectId: note.id,
    meta: { clientId },
    ip,
  });

  return shape(note);
}

/**
 * Edit one.
 *
 * `editedAt` is stamped here and only here. `updatedAt` moves for reasons a
 * reader does not care about, so the panel would call every row edited if it read
 * that one instead.
 */
export async function update(
  user: Scoper,
  clientId: string,
  noteId: string,
  input: UpdateInput,
  ip?: string | null,
): Promise<PodNoteRow> {
  await assertReachable(user, clientId);
  const existing = await reachableNote(clientId, noteId);
  await assertMayChange(user, existing);

  const note = await prisma.podNote.update({
    where: { id: noteId },
    data: { content: input.content, editedAt: new Date() },
    select: SELECT,
  });

  await audit.record({
    actorId: user.id,
    action: 'podnote.edited',
    subjectType: 'podNote',
    subjectId: noteId,
    meta: { clientId },
    ip,
  });

  return shape(note);
}

/**
 * Take one off the panel.
 *
 * A SOFT DELETE, and the WHERE carries `deletedAt: null` through `reachableNote`
 * so a second delete is a 404 rather than a silent re-stamp that moves the date
 * the record was closed.
 */
export async function remove(
  user: Scoper,
  clientId: string,
  noteId: string,
  ip?: string | null,
): Promise<{ id: string }> {
  await assertReachable(user, clientId);
  const existing = await reachableNote(clientId, noteId);
  await assertMayChange(user, existing);

  await prisma.podNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });

  await audit.record({
    actorId: user.id,
    action: 'podnote.deleted',
    subjectType: 'podNote',
    subjectId: noteId,
    meta: { clientId },
    ip,
  });

  return { id: noteId };
}
