import type { DismissReason, FollowupStatus, Prisma } from '@prisma/client';
import { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import * as audit from './audit.service.js';
import { postMessage } from './circle.service.js';
import { followupDrafterRule } from './digest-rules/index.js';
import { canSeeClient, clientScopeWhere, type Scoper } from './scope.service.js';

type CreateFollowupInput = z.infer<typeof schemas.createFollowupSchema>;

/**
 * Follow-ups — the message somebody means to send a client, before it is sent.
 *
 * Ported from the Follow-ups tab of console-digest.js (draftHtml:601,
 * sendDraft:37, openDismiss:647, openSendAll:688). The demo has one road: the
 * copilot drafts, a scoped human presses Approve & send, and the text lands in
 * that client's Care Circle under the sender's name. This service has two, and
 * the second one is the reason the file is long.
 *
 *   AI draft     any human who carries the client may edit it, send it under
 *                their own name, or refuse it with a reason.
 *   COACH draft  a human wrote it, so it does not go out on that human's own
 *                say-so. It waits for someone holding `sendDigest`, who may
 *                approve it, return it with a note, or approve it with a last
 *                edit — and when it goes, IT GOES UNDER THE AUTHOR'S NAME while
 *                the row records who cleared it. See `approve`.
 *
 * EVERY RULE ABOVE IS ENFORCED HERE, not in the route. A route is one caller: the
 * console will have another, the mobile app a third, and the batch path in
 * `sendAll` a fourth. A check that lives in a handler is a check the next caller
 * does not inherit — and the thing being guarded is a message to a client, which
 * cannot be unsent.
 */

/* ------------------------------------------------------------- the row shape */

/** The Home tab these rows badge under. One of `SEEN_TABS` in digest.service.ts. */
const SEEN_TAB = 'followups';

/** The five reasons, as a set, so the runtime check below is a lookup. */
const DISMISS_REASONS = new Set<string>(schemas.DISMISS_REASONS);

/**
 * What a follow-up looks like to a reader — every name resolved, because the
 * whole point of the sent row is that it says both who wrote it and who cleared
 * it, and a screen holding two ids has to go and ask who they are.
 */
const draftRow = {
  id: true,
  clientId: true,
  text: true,
  originalText: true,
  status: true,
  source: true,
  returnNote: true,
  circleMessageId: true,
  createdAt: true,
  editedAt: true,
  approvedAt: true,
  sentAt: true,
  client: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  editedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  sentBy: { select: { id: true, name: true } },
} satisfies Prisma.FollowupDraftSelect;

/** The columns every decision in this file is made from. */
const draftGuard = {
  id: true,
  clientId: true,
  text: true,
  status: true,
  source: true,
  createdById: true,
} satisfies Prisma.FollowupDraftSelect;

/**
 * The order the tab reads in: what is waiting on ME first, then what is waiting
 * on its author, then the copilot's untouched suggestions, then the record of
 * what already went out.
 *
 * DISMISSED is ranked even though `list` filters it out — the map is total
 * because `Record<FollowupStatus, number>` makes TypeScript insist, which is how
 * a status added to the schema becomes a compile error here instead of a row
 * that silently sorts to the top.
 */
const STATUS_RANK: Record<FollowupStatus, number> = {
  PENDING_APPROVAL: 0,
  RETURNED: 1,
  DRAFT: 2,
  SENT: 3,
  DISMISSED: 4,
};

/* ------------------------------------------------------------------- guards */

/**
 * Follow-ups are a staff surface, and `clientScopeWhere` does not say so: for a
 * client it resolves to their OWN record, so every scope check in this file
 * would pass for them and they could draft messages to themselves. The role is
 * refused once, here, rather than remembered at ten call sites.
 */
function assertStaff(user: Scoper): void {
  if (user.role === 'client') throw ApiError.forbidden();
}

/**
 * Load a draft the caller may act on, or 404.
 *
 * Scoped through the same nested `client:` clause the list uses — never a fetch
 * followed by a comparison — so a draft about somebody else's client is not
 * merely rejected, it is never loaded.
 *
 * NOT FOUND rather than forbidden, for the reason `client.service.get` gives at
 * length: a 403 would confirm the row exists, and "is there a follow-up drafted
 * about this person" is itself the sensitive fact.
 */
async function loadDraft(user: Scoper, id: string) {
  const scope = await clientScopeWhere(user);
  const row = await prisma.followupDraft.findFirst({
    where: { AND: [{ id }, { client: scope }] },
    select: draftGuard,
  });
  if (!row) throw ApiError.notFound('No such follow-up.');
  return row;
}

/** Read the row back in full after a write, so every caller gets one shape. */
function readBack(tx: Prisma.TransactionClient, id: string) {
  return tx.followupDraft.findUniqueOrThrow({ where: { id }, select: draftRow });
}

/* --------------------------------------------------------------------- read */

type DraftRow = Prisma.FollowupDraftGetPayload<{ select: typeof draftRow }>;

export type FollowupListRow = DraftRow & {
  /** Not yet seen by THIS user on the Follow-ups tab. Always false once sent. */
  fresh: boolean;
};

/**
 * Every open follow-up for the clients this caller may see.
 *
 * A RETURNED DRAFT IS A PRIVATE CONVERSATION between its author and the person
 * who sent it back. A coach reading the tab sees their own returned drafts and
 * nobody else's — being told, on a shared board, that a colleague's message was
 * bounced with a note is not information the board exists to carry. Approvers
 * are the exception and have to be: the return was their act, and a queue they
 * cannot see is a queue they cannot chase.
 *
 * The filter is one WHERE clause, `client: scope` nested, for the reason
 * `listAttention` states — a scope applied in JavaScript has already loaded the
 * rows it is about to throw away.
 */
export async function list(user: Scoper): Promise<FollowupListRow[]> {
  assertStaff(user);

  const scope = await clientScopeWhere(user);
  const approver = await can(user.role, 'sendDigest');

  const rows = await prisma.followupDraft.findMany({
    where: {
      AND: [
        { client: scope },
        /* a dismissal is final and the demo drops the card outright
           (console-digest.js:676); the row survives as training data, not as
           something a human has to keep declining */
        { status: { not: 'DISMISSED' } },
        approver ? {} : { OR: [{ status: { not: 'RETURNED' } }, { createdById: user.id }] },
      ],
    },
    select: draftRow,
  });

  const seenRow = await prisma.homeSeen.findUnique({
    where: { userId_tabKey: { userId: user.id, tabKey: SEEN_TAB } },
    select: { ids: true },
  });
  const seen = new Set(seenRow?.ids ?? []);

  /*
   * Sorted in JavaScript, on `createdAt` for every group INCLUDING the sent one.
   * Sorting the sent rows by `sentAt` instead would read a little better on its
   * own, but it means one list ordered by two different clocks, and a row that
   * jumps position at the moment it is sent is the kind of movement a reader
   * blames on themselves.
   */
  rows.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return rows.map((r) => ({
    ...r,
    /* a sent follow-up is a receipt, not news: it can never be New to anyone,
       and counting it would leave a badge nobody can drain by acting */
    fresh: r.status !== 'SENT' && !seen.has(r.id),
  }));
}

/* -------------------------------------------------------------------- write */

/**
 * Stamp one id into a user's seen bag for the Follow-ups tab.
 *
 * `markSeen` REPLACES the set — it is what a rendered page posts — so it cannot
 * be used to add a single id without telling the tab that everything else was
 * read too. This appends, and only ever for the person whose own act produced
 * the id.
 */
async function stampSeen(userId: string, id: string): Promise<void> {
  const row = await prisma.homeSeen.findUnique({
    where: { userId_tabKey: { userId, tabKey: SEEN_TAB } },
    select: { ids: true },
  });
  if (row?.ids.includes(id)) return;

  const ids = [...(row?.ids ?? []), id];
  await prisma.homeSeen.upsert({
    where: { userId_tabKey: { userId, tabKey: SEEN_TAB } },
    create: { userId, tabKey: SEEN_TAB, ids },
    update: { ids },
  });
}

/**
 * Write one by hand.
 *
 * FORBIDDEN, not not-found, for a client outside the caller's scope — the one
 * place in this file that answers that way. The tension with `loadDraft` above
 * is real and the split is deliberate: reading a draft by id is a probe, and
 * not-found is the only answer that does not confirm what was probed for.
 * Creating one is a caller naming a client they chose from their own console and
 * being told the truth about their own reach; a create that reported "no such
 * client" about somebody the roster has just listed reads as a broken page and
 * teaches people to retry.
 *
 * `sendNow` is honoured only for an approver, and IGNORED IN SILENCE otherwise —
 * the schema calls it a request rather than an instruction for exactly this. A
 * coach who ticks it has still done the useful thing: the draft is written and
 * queued for approval, which is what they wanted. Refusing the whole call would
 * lose the words they typed to make a point about a checkbox.
 */
export async function create(user: Scoper, input: CreateFollowupInput) {
  assertStaff(user);
  if (!(await canSeeClient(user, input.clientId))) {
    throw ApiError.forbidden('That client is not on your roster.');
  }

  const draft = await prisma.followupDraft.create({
    data: {
      clientId: input.clientId,
      text: input.text,
      /* the same string at creation, and `originalText` is never written again:
         the demo's toast promises "your edit is part of the record", and the
         promise is only true if the words edited FROM survive */
      originalText: input.text,
      status: 'PENDING_APPROVAL',
      source: 'COACH',
      createdById: user.id,
    },
    select: draftRow,
  });

  /*
   * Stamped into the author's own bag, and OUTSIDE the create, per the rule
   * audit.service states: a bookkeeping write must not be able to roll back the
   * act it describes. The stamp is why a draft is never "New" to the person who
   * just typed it — a badge for your own keystrokes is noise, and worse, it is
   * noise that makes the badge less believable when it is real.
   */
  await stampSeen(user.id, draft.id);

  if (input.sendNow && (await can(user.role, 'sendDigest'))) {
    /* the same approval path the button takes, so a one-step send and a
       two-step one leave identical rows — including the approver columns, which
       here happen to name the author as well */
    return approve(user, draft.id);
  }

  return draft;
}

/**
 * Rewrite the words.
 *
 * The two roads separate here. An AI draft has no author to offend, so anyone
 * carrying the client may reword it while it is still a draft. A coach's draft
 * belongs to its author until it is sent: an approver who disagrees with it
 * returns it with a note or fixes it AS THEY APPROVE (see `approve`), and does
 * not quietly edit somebody's message and leave it in their queue still reading
 * as theirs.
 *
 * `originalText` is untouched, always.
 */
export async function edit(user: Scoper, id: string, text: string) {
  assertStaff(user);
  const draft = await loadDraft(user, id);

  let editable: FollowupStatus[];
  if (draft.source === 'AI') {
    if (draft.status !== 'DRAFT') {
      throw ApiError.conflict('That draft has already been acted on.');
    }
    editable = ['DRAFT'];
  } else {
    if (draft.createdById !== user.id) {
      throw ApiError.forbidden('That draft belongs to the person who wrote it.');
    }
    if (draft.status !== 'PENDING_APPROVAL' && draft.status !== 'RETURNED') {
      throw ApiError.conflict('That draft can no longer be edited.');
    }
    editable = ['PENDING_APPROVAL', 'RETURNED'];
  }

  return prisma.$transaction(async (tx) => {
    /* the status is re-asserted in the update, as in `send`: an edit that landed
       a moment after a colleague sent the draft would leave the row holding
       words the client never received, under a status that says they did */
    const claimed = await tx.followupDraft.updateMany({
      where: { id, status: { in: editable } },
      data: { text, editedById: user.id, editedAt: new Date() },
    });
    if (claimed.count === 0) throw ApiError.conflict('That draft can no longer be edited.');

    return readBack(tx, id);
  });
}

/**
 * Send an AI draft, under the sender's own name. `sendDraft`, console-digest.js:37.
 *
 * One transaction, because the message and the draft's SENT state are the same
 * fact told twice: a message in the room with the draft still reading DRAFT
 * would be sent again by the next person to open the tab, and a draft reading
 * SENT with no message is a nudge everybody believes was delivered.
 *
 * The status is re-asserted in the UPDATE rather than trusted from the read
 * above. Two people looking at the same console tab is the normal case, not the
 * exotic one, and between the read and the write there is room for both of them
 * to press Send — the guarded update makes the loser's whole transaction, message
 * included, disappear instead of posting the client the same nudge twice.
 *
 * The audit row is written after the commit, not inside it, following the rule
 * audit.service.ts sets out: a failed log must not roll back a legitimate act.
 */
export async function send(user: Scoper, id: string) {
  assertStaff(user);
  const draft = await loadDraft(user, id);

  if (draft.source !== 'AI') {
    throw ApiError.conflict('A written follow-up goes out through approval.');
  }
  if (draft.status !== 'DRAFT') {
    throw ApiError.conflict('That draft is not waiting to be sent.');
  }

  const now = new Date();
  const row = await prisma.$transaction(async (tx) => {
    const message = await postMessage(
      draft.clientId,
      { fromUserId: user.id, fromKind: 'STAFF', kind: 'TEXT', text: draft.text },
      tx,
    );

    const claimed = await tx.followupDraft.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'SENT', sentById: user.id, sentAt: now, circleMessageId: message.id },
    });
    if (claimed.count === 0) throw ApiError.conflict('That draft has already been sent.');

    return readBack(tx, id);
  });

  await audit.record({
    actorId: user.id,
    action: 'followup.sent',
    subjectType: 'followup',
    subjectId: id,
    meta: { clientId: row.clientId, circleMessageId: row.circleMessageId },
  });

  return row;
}

/**
 * Refuse an AI draft, with a reason. `openDismiss`, console-digest.js:647.
 *
 * AI DRAFTS ONLY. A dismissal is a training signal — the sheet promises "every
 * dismissal is logged so the copilot learns" — and there is nothing for the
 * copilot to learn from a human's draft being turned down. A coach's draft comes
 * back through `returnDraft`, which carries a note its author can act on, or is
 * withdrawn through `remove`.
 *
 * The reason is re-validated against the shared enum even though the parameter
 * is typed. The type is a compile-time claim about a value that arrived in a
 * request body, and an unrecognised reason stored here is a row that can never
 * be counted with the others.
 */
export async function dismiss(user: Scoper, id: string, reason: DismissReason) {
  assertStaff(user);

  if (!DISMISS_REASONS.has(reason)) {
    throw ApiError.badRequest('Say why this draft is being dismissed.', {
      reason: 'Not one of the five reasons',
    });
  }

  const draft = await loadDraft(user, id);
  if (draft.source !== 'AI') {
    throw ApiError.conflict('A written follow-up is returned or withdrawn, not dismissed.');
  }
  if (draft.status !== 'DRAFT') {
    throw ApiError.conflict('That draft has already been acted on.');
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.followupDraft.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'DISMISSED' },
    });
    if (claimed.count === 0) throw ApiError.conflict('That draft has already been acted on.');

    await tx.followupDismissal.create({
      data: {
        draftId: id,
        /* denormalised from the draft on purpose — see the model comment: a
           per-client count of refusals has to outlive the draft it came from */
        clientId: draft.clientId,
        reason,
        byId: user.id,
      },
    });

    return readBack(tx, id);
  });
}

/**
 * Approve a coach's draft and send it. THE POINT OF THE WHOLE FEATURE.
 *
 * The message goes out with `fromUserId` set to the DRAFT'S AUTHOR, never the
 * approver. That split is the feature, not an implementation detail: the client
 * is having a relationship with their coach, and a nudge that arrived signed by
 * the head of department would tell them their coach's messages are being
 * written by somebody else. Meanwhile the row records `approvedById` alongside
 * `sentById`, so internally the question "who let this go out" has an answer
 * with a name on it — which is the other half of the same bargain. Neither fact
 * is inferable from the other, which is why the schema keeps two columns.
 *
 * `text` is the approver's last word — a comma, a softened sentence — recorded
 * as `editedById` so the edit is attributed to the person who made it. Without
 * it a fix that small would cost a round trip through RETURNED and the coach's
 * next login, and the nudge would land a day late.
 */
export async function approve(user: Scoper, id: string, text?: string) {
  assertStaff(user);
  if (!(await can(user.role, 'sendDigest'))) throw ApiError.forbidden();

  /* scoped to the APPROVER: holding `sendDigest` says you may clear a draft, not
     that you may read one about a client outside your book */
  const draft = await loadDraft(user, id);

  if (draft.status !== 'PENDING_APPROVAL') {
    throw ApiError.conflict('That draft is not waiting for approval.');
  }
  /*
   * No author, no send. `createdById` is nullable — it is null for every AI
   * draft, and `onDelete: SetNull` empties it when a person leaves — and a
   * message cannot go out under a name that is not there. An AI draft in this
   * state is impossible today and would be a bug rather than a user's mistake,
   * but a departed author is neither, so both get the same honest refusal.
   */
  const authorId = draft.createdById;
  if (!authorId) {
    throw ApiError.conflict('That draft has no author to send it under.');
  }

  const body = text ?? draft.text;
  const now = new Date();

  const row = await prisma.$transaction(async (tx) => {
    const message = await postMessage(
      draft.clientId,
      { fromUserId: authorId, fromKind: 'STAFF', kind: 'TEXT', text: body },
      tx,
    );

    const claimed = await tx.followupDraft.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: {
        text: body,
        /* attributed only when the approver actually changed something — an
           `editedBy` on an untouched draft would claim a rewrite that never
           happened */
        ...(text ? { editedById: user.id, editedAt: now } : {}),
        status: 'SENT',
        approvedById: user.id,
        approvedAt: now,
        sentById: user.id,
        sentAt: now,
        circleMessageId: message.id,
      },
    });
    if (claimed.count === 0) throw ApiError.conflict('That draft has already been sent.');

    return readBack(tx, id);
  });

  await audit.record({
    actorId: user.id,
    action: 'followup.approved_and_sent',
    subjectType: 'followup',
    subjectId: id,
    /* both ids, because the row exists to answer both halves: it went out under
       the author's name, and the approver is who let it */
    meta: {
      authorId,
      approverId: user.id,
      clientId: row.clientId,
      circleMessageId: row.circleMessageId,
      edited: Boolean(text),
    },
  });

  return row;
}

/**
 * Send a coach's draft back, with a note.
 *
 * The note is the whole act — a draft returned with nothing said is a draft its
 * author has to guess at — so it is stored on the row where the author will read
 * it, and repeated into the audit trail's `reason`, which is the column that
 * exists for exactly this kind of answerable "why".
 */
export async function returnDraft(user: Scoper, id: string, note: string) {
  assertStaff(user);
  if (!(await can(user.role, 'sendDigest'))) throw ApiError.forbidden();

  const draft = await loadDraft(user, id);
  if (draft.status !== 'PENDING_APPROVAL') {
    throw ApiError.conflict('That draft is not waiting for approval.');
  }

  const row = await prisma.$transaction(async (tx) => {
    /* guarded like `send` and for a sharper reason: a return that landed after
       a second approver had already sent the draft would mark a message the
       client has read as waiting for its author to fix */
    const claimed = await tx.followupDraft.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: { status: 'RETURNED', returnNote: note },
    });
    if (claimed.count === 0) throw ApiError.conflict('That draft is not waiting for approval.');

    return readBack(tx, id);
  });

  await audit.record({
    actorId: user.id,
    action: 'followup.returned',
    subjectType: 'followup',
    subjectId: id,
    reason: note,
    meta: { authorId: draft.createdById, clientId: draft.clientId },
  });

  return row;
}

/**
 * Put a returned draft back in the queue.
 *
 * The author's act and nobody else's: an approver who could resubmit on someone's
 * behalf would be approving their own return, and the note they wrote would have
 * been answered by nobody.
 *
 * `returnNote` is cleared as it goes, per the schema's own note — a correction
 * that has since been made must not keep explaining a draft it no longer
 * describes.
 */
export async function resubmit(user: Scoper, id: string) {
  assertStaff(user);
  const draft = await loadDraft(user, id);

  if (draft.createdById !== user.id) {
    throw ApiError.forbidden('That draft belongs to the person who wrote it.');
  }
  if (draft.status !== 'RETURNED') {
    throw ApiError.conflict('That draft has not been returned to you.');
  }

  return prisma.followupDraft.update({
    where: { id },
    data: { status: 'PENDING_APPROVAL', returnNote: null },
    select: draftRow,
  });
}

/**
 * Withdraw a coach's draft before it goes anywhere.
 *
 * A real delete, and it leaves no trace on purpose: nothing was said to anyone,
 * and the row's only content is words its own author has decided against.
 * `FollowupDismissal` is not the place for it either — that table is what the
 * copilot learns from, and a human changing their mind about their own sentence
 * teaches it nothing.
 *
 * An approver may withdraw one too. They already hold the power to end the
 * draft's life by returning it and letting it sit; making them ask the author to
 * press the button would only leave stale rows in a queue.
 */
export async function remove(user: Scoper, id: string) {
  assertStaff(user);
  const draft = await loadDraft(user, id);

  if (draft.source !== 'COACH') {
    throw ApiError.conflict('An AI draft is dismissed with a reason, not deleted.');
  }
  if (draft.createdById !== user.id && !(await can(user.role, 'sendDigest'))) {
    throw ApiError.forbidden('That draft belongs to the person who wrote it.');
  }
  if (draft.status !== 'PENDING_APPROVAL' && draft.status !== 'RETURNED') {
    throw ApiError.conflict('A sent follow-up cannot be withdrawn.');
  }

  await prisma.followupDraft.delete({ where: { id } });
  return { id };
}

/**
 * The batch path. `openSendAll`, console-digest.js:688.
 *
 * It takes THE IDS THAT WERE ON SCREEN and no filter of its own, because the
 * demo's sheet makes a promise — every message shown in full, any of them
 * untickable — and "send everything that is ready" would break that promise the
 * moment a draft arrived while the sheet was open.
 *
 * Each id goes through the SINGLE-DRAFT PATH above rather than a batch
 * reimplementation of it. That costs a few repeated scope reads and buys the one
 * thing that matters: the batch cannot drift from the button. An AI draft goes
 * as the caller; a coach's draft goes under its author's name with the caller
 * recorded as approver — which is what "send all" has to mean once two roads
 * exist.
 *
 * NOTHING HERE THROWS FOR ONE BAD ID. A batch that refused wholesale because one
 * card had been handled by a colleague thirty seconds earlier would make the
 * button unusable exactly when the console is busy, which is when it is used.
 * Those ids come back in `skipped` so the caller can say so.
 */
export async function sendAll(
  user: Scoper,
  ids: string[],
): Promise<{ sent: string[]; skipped: string[] }> {
  assertStaff(user);
  if (!(await can(user.role, 'sendDigest'))) throw ApiError.forbidden();

  const scope = await clientScopeWhere(user);
  const rows = await prisma.followupDraft.findMany({
    where: { AND: [{ id: { in: ids } }, { client: scope }] },
    select: { id: true, status: true, source: true },
  });
  const found = new Map(rows.map((r) => [r.id, r]));

  const sent: string[] = [];
  const skipped: string[] = [];

  /*
   * Sequential, not `Promise.all`. Two sends to the same client would queue
   * behind each other on the room's sequence lock anyway, and a batch that
   * failed halfway through in parallel would leave a result nobody can read back
   * against the list they ticked. The schema caps `ids` at 200.
   */
  for (const id of [...new Set(ids)]) {
    const row = found.get(id);
    if (!row) {
      /* out of scope, or gone since the sheet was drawn — either way not this
         caller's to send, and not an error worth losing the batch over */
      skipped.push(id);
      continue;
    }

    try {
      if (row.source === 'AI' && row.status === 'DRAFT') {
        await send(user, id);
      } else if (row.source === 'COACH' && row.status === 'PENDING_APPROVAL') {
        await approve(user, id);
      } else {
        skipped.push(id);
        continue;
      }
      sent.push(id);
    } catch (err) {
      /* the guarded updates in `send`/`approve` throw here when someone else got
         there first; anything else is worth a line in the log, since a batch
         swallowing a real failure is how a nudge silently never goes out */
      logger.warn({ id, err: (err as Error).message }, 'follow-up skipped in batch send');
      skipped.push(id);
    }
  }

  return { sent, skipped };
}

/* ------------------------------------------------------------ the build */

/**
 * Write what the copilot drafted this morning. The mirror of `buildFor`.
 *
 * The rule produces the words and this writes the rows, for the same reason the
 * digest is split that way: a rule that also wrote would be a rule that had to
 * know about statuses, authorship and the seen bag. Today it produces nothing
 * (see followupDrafter.rule.ts) and this loop runs zero times.
 *
 * IT NEVER STACKS. There is no unique key on (date, client) here — a client may
 * legitimately have two follow-ups in a day, written by two people — so the
 * guard is a read: if the copilot's last suggestion for this client is still
 * sitting unanswered, it does not add a second one behind it. A console showing
 * three untouched AI nudges for the same client is one nobody works through.
 *
 * Errors are left to the job, which logs them: there is one rule, and a caller
 * that swallowed its failure would report a quiet morning that never happened.
 */
export async function draftFor(date: Date): Promise<{ written: number; skipped: number }> {
  const produced = await followupDrafterRule.run(date);
  if (!produced.length) return { written: 0, skipped: 0 };

  const open = await prisma.followupDraft.findMany({
    where: {
      source: 'AI',
      status: 'DRAFT',
      clientId: { in: produced.map((p) => p.clientId) },
    },
    select: { clientId: true },
  });
  const waiting = new Set(open.map((o) => o.clientId));

  let written = 0;
  let skipped = 0;

  for (const entry of produced) {
    if (waiting.has(entry.clientId)) {
      skipped += 1;
      continue;
    }
    await prisma.followupDraft.create({
      data: {
        clientId: entry.clientId,
        text: entry.text,
        originalText: entry.text,
        status: 'DRAFT',
        source: 'AI',
        /* no author, which is the whole reason a human sits in front of it */
        createdById: null,
      },
    });
    /* within one run the copilot proposes at most one nudge per client, and the
       set is updated so a rule that ever returns two is held to that here */
    waiting.add(entry.clientId);
    written += 1;
  }

  return { written, skipped };
}
