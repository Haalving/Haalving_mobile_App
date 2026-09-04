import { randomUUID } from 'node:crypto';

import type { AttentionSeverity, AttentionStatus, Prisma } from '@prisma/client';
import type { schemas } from '@haalving/shared';
import type { z } from 'zod';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import * as audit from './audit.service.js';
import { canSeeClient, clientScopeWhere, type Scoper } from './scope.service.js';

/**
 * ATTENTION — a problem about one client that stays open until somebody closes it.
 *
 * NOT A WIDER `DigestEntry`, and the difference is lifetime. A digest entry is
 * this morning's one-line reading of a client: one row per client per day
 * (`@@unique([date, clientId])`), loudest rule wins, rebuilt at 08:00 and again
 * after any rating. Hanging a status on that row would mean an unresolved
 * problem silently vanishing at tomorrow's rebuild, and the unique constraint
 * would put two concurrent issues into a fight over one row.
 *
 * An attention is a TICKET. It outlives many mornings, carries an assignee and a
 * resolution, and two of them can stand on one client at once. So the rules write
 * BOTH — the morning line the Dashboard reads, and the ticket Home › Attention
 * works — and neither is a copy of the other.
 *
 * THREE RULES RUN THROUGH EVERYTHING BELOW.
 *
 * 1. SCOPE IS A WHERE CLAUSE, never a filter applied after the query. Every read
 *    and every write here nests `clientScopeWhere` as `{ client: scope }`, so a
 *    ticket about somebody else's client is not merely rejected — it is never
 *    loaded. A count, an export or a join that forgets cannot exist, because
 *    there is nothing to forget.
 *
 * 2. A CLIENT OUTSIDE SCOPE IS A 404, never a 403. "Is somebody worried about
 *    this person" is itself the sensitive fact, and a forbidden would answer it.
 *    A PERMISSION failure is different — it is about the caller rather than about
 *    the row — so it refuses with 403 and writes the audit row the console
 *    promises ("This access attempt was logged").
 *
 * 3. THE TRANSITION IS THE PRODUCT. Every move writes a `ClientLog` row so the
 *    record's Logs tab can say "Attention resolved by Anita R.", and an
 *    `audit.record` so the trail can say it six months later. A close is owed a
 *    reason for the same reason a pod seat changing hands is: a close nobody had
 *    to explain is a close nobody can audit.
 */

type ListQuery = z.infer<typeof schemas.listAttentionsQuery>;
type CreateInput = z.infer<typeof schemas.createAttentionSchema>;
type PatchInput = z.infer<typeof schemas.patchAttentionSchema>;
type Action = PatchInput['action'];

/* ------------------------------------------------------------- the row shape */

/**
 * What a ticket looks like to a reader — every id resolved, because a board that
 * holds three ids has to go and ask who they are, and the whole point of the
 * resolution columns is that they say who closed it.
 */
const attentionRow = {
  id: true,
  clientId: true,
  severity: true,
  status: true,
  title: true,
  description: true,
  source: true,
  evidence: true,
  dedupeKey: true,
  assignedToId: true,
  relatedLogId: true,
  dueAt: true,
  resolvedAt: true,
  resolutionReason: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, role: true } },
  resolvedBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.AttentionSelect;

export type AttentionRow = Prisma.AttentionGetPayload<{ select: typeof attentionRow }>;

export interface AttentionPage {
  rows: AttentionRow[];
  /** The whole filtered set, not the page — the tab's badge counts work, not rows shown. */
  total: number;
  /** Null on the last page. Opaque: the caller hands it back, never reads it. */
  nextCursor: string | null;
}

/** The three a ticket is still somebody's problem in. */
const LIVE: AttentionStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'];

/**
 * Loudest first, then newest, then by id.
 *
 * The id is not decoration. It makes the order TOTAL, which is what lets the
 * cursor below name a single row unambiguously — two tickets raised in the same
 * millisecond at the same severity would otherwise swap places between pages and
 * one of them would never be read.
 */
const BOARD_ORDER: Prisma.AttentionOrderByWithRelationInput[] = [
  { severity: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];

/* ------------------------------------------------------------------ refusals */

/**
 * Refuse, and write the row that makes the console's promise true. The same
 * helper `queues.service.ts` opens with, and for the same reason: no permission
 * refusal in this file throws without passing through here.
 */
async function deny(
  user: Scoper,
  what: string,
  subjectId: string | null,
  message: string,
): Promise<never> {
  await audit.record({
    actorId: user.id,
    action: 'denied',
    subjectType: 'attention',
    subjectId,
    reason: what,
    meta: { role: user.role },
  });
  throw ApiError.forbidden(message);
}

/**
 * Attention is a staff surface, and `clientScopeWhere` does not say so: for a
 * client it resolves to their OWN record, so every scope check below would pass
 * for them and they would be reading — and closing — the tickets the pod raised
 * about them. Refused once, here, rather than remembered at six call sites.
 */
function assertStaff(user: Scoper): void {
  if (user.role === 'client') throw ApiError.forbidden();
}

/**
 * Load a ticket the caller may act on, or 404.
 *
 * Scoped through the same nested `client:` clause the list uses — never a fetch
 * followed by a comparison — so the row about a client out of reach is never
 * read into memory in the first place.
 */
async function load(user: Scoper, id: string): Promise<AttentionRow> {
  const scope = await clientScopeWhere(user);
  const row = await prisma.attention.findFirst({
    where: { AND: [{ id }, { client: scope }] },
    select: attentionRow,
  });
  if (!row) throw ApiError.notFound('No such attention item.');
  return row;
}

/* --------------------------------------------------------------------- read */

/**
 * The board.
 *
 * `status` DEFAULTS TO THE LIVE THREE and `ALL` is how a caller asks past that.
 * The default is stated here rather than in the schema so it can be said out
 * loud: a ticket board is a list of work, and a closed ticket is not work — but a
 * caller who asks for everything must get everything, which a schema default
 * would quietly have taken away.
 *
 * A `clientId` naming somebody outside the caller's scope returns an EMPTY page
 * rather than a 404. It is a filter, not a lookup: narrowing a list you are
 * allowed to read to a row that is not in it is honestly answered by nothing,
 * and answering 404 would turn the filter into an existence oracle.
 */
export async function list(user: Scoper, q: ListQuery): Promise<AttentionPage> {
  assertStaff(user);

  const scope = await clientScopeWhere(user);
  const where: Prisma.AttentionWhereInput = {
    AND: [
      { client: scope },
      q.status ? (q.status === 'ALL' ? {} : { status: q.status }) : { status: { in: LIVE } },
      q.severity ? { severity: q.severity } : {},
      q.clientId ? { clientId: q.clientId } : {},
      /* `me` is the board's own "mine" chip — resolved from the token, so it can
         never mean somebody else's queue however the query was written */
      q.assignedToId ? { assignedToId: q.assignedToId === 'me' ? user.id : q.assignedToId } : {},
    ],
  };

  /*
   * ONE ROW MORE THAN ASKED FOR is how the page learns whether there is another:
   * a count would answer a different question (how many are there) and a page
   * that guessed from it would be wrong the moment somebody closed a ticket
   * between the two queries.
   */
  const [rows, total] = await Promise.all([
    prisma.attention.findMany({
      where,
      select: attentionRow,
      orderBy: BOARD_ORDER,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    }),
    prisma.attention.count({ where }),
  ]);

  const page = rows.slice(0, q.limit);
  return {
    rows: page,
    total,
    nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/**
 * The record's own panel.
 *
 * The 404 here is a real lookup rather than a filter — the caller named this one
 * client — so it goes through `canSeeClient` and answers not-found, which is the
 * only answer that does not confirm the client exists.
 */
export async function listForClient(
  user: Scoper,
  clientId: string,
  q: ListQuery,
): Promise<AttentionPage> {
  assertStaff(user);
  if (!(await canSeeClient(user, clientId))) throw ApiError.notFound('No such client.');

  /* the path is the subject; a body naming a different client cannot widen it */
  return list(user, { ...q, clientId });
}

/* -------------------------------------------------------------------- raise */

export interface RaiseInput {
  clientId: string;
  /** Built from the RULE and its SUBJECT (`noLogs:c-meena`), never from the date. */
  dedupeKey: string;
  source: string;
  severity: AttentionSeverity;
  title: string;
  description: string;
  evidence?: string[];
  assignedToId?: string | null;
  relatedLogId?: string | null;
  dueAt?: Date | null;
}

/**
 * Raise a ticket for a condition, or refresh the one already standing for it.
 *
 * THE ONE HELPER THE DEDUPE RULE LIVES IN, so the 08:00 sweep and a human raise
 * cannot drift into two different answers about what counts as the same problem.
 * It takes no `Scoper` on purpose: the sweep has no caller, and a scope check
 * here would either have to be faked for it or skipped by it. Scope belongs to
 * `create` below, which is the door a person comes through.
 *
 * A REPEAT UPDATES, IT DOES NOT INSERT. The sweep re-detects the same conditions
 * every morning; the unique `dedupeKey` is what makes that safe, and it is a
 * database fact rather than a code convention. The refresh deliberately touches
 * only the WORDS — severity, title, description, evidence — and never the status,
 * the assignee or the resolution: a ticket somebody picked up yesterday does not
 * go back to OPEN because the condition is still true this morning. That it is
 * still true is the whole reason it is still open.
 *
 * A CLOSED TICKET IS NEVER REVIVED. Closing one retires its key (see `act`), so
 * a condition that returns after a resolution finds no row to update and earns a
 * NEW ticket — which is right, because a recurrence is news.
 *
 * `created` is returned rather than inferred by the caller, because the sweep
 * has a decision to make with it: a new ticket is worth a notice, and the same
 * ticket for the fourth morning running is not.
 */
export async function raise(input: RaiseInput): Promise<{ row: AttentionRow; created: boolean }> {
  const words = {
    severity: input.severity,
    title: input.title,
    description: input.description,
    evidence: input.evidence ?? [],
  };

  const standing = await prisma.attention.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true },
  });

  if (standing) {
    const row = await prisma.attention.update({
      where: { id: standing.id },
      data: words,
      select: attentionRow,
    });
    return { row, created: false };
  }

  try {
    const row = await prisma.attention.create({
      data: {
        clientId: input.clientId,
        dedupeKey: input.dedupeKey,
        source: input.source,
        assignedToId: input.assignedToId ?? null,
        relatedLogId: input.relatedLogId ?? null,
        dueAt: input.dueAt ?? null,
        ...words,
      },
      select: attentionRow,
    });
    return { row, created: true };
  } catch (e) {
    /* two sweeps racing, or a sweep racing a human: Postgres settles it on the
       unique index and the loser refreshes the winner's row, which is the same
       answer it would have given a moment earlier */
    if ((e as { code?: string }).code !== 'P2002') throw e;
    const row = await prisma.attention.update({
      where: { dedupeKey: input.dedupeKey },
      data: words,
      select: attentionRow,
    });
    return { row, created: false };
  }
}

/**
 * Raise one by hand.
 *
 * THE GATE IS SCOPE, and scope for a raise means what it means everywhere else in
 * this console: a `seeAllClients` seat may raise about anybody, an HoD about
 * their bench's book of work, a coach about the clients whose pod they sit on.
 * That is exactly `canSeeClient`, so it is asked rather than reimplemented as a
 * permission list that would drift from it.
 *
 * A HUMAN RAISE IS NEVER A REPEAT, which is why its dedupe key is unique by
 * construction. Two coaches noticing two different things about one client are
 * two tickets, and collapsing them because both were typed on a Tuesday would
 * lose one of the two problems. The dedupe machinery exists for the sweep, which
 * genuinely does ask the same question every morning.
 */
export async function create(user: Scoper, input: CreateInput): Promise<AttentionRow> {
  assertStaff(user);
  if (!(await canSeeClient(user, input.clientId))) throw ApiError.notFound('No such client.');

  if (input.assignedToId) await assertAssignable(user, input.clientId, input.assignedToId);

  const { row } = await raise({
    clientId: input.clientId,
    dedupeKey: `manual:${input.clientId}:${randomUUID()}`,
    source: 'manual',
    severity: input.severity,
    title: input.title,
    description: input.description,
    evidence: input.evidence,
    assignedToId: input.assignedToId ?? null,
    dueAt: input.dueAt ?? null,
  });

  await writeLog(user.id, row, 'Attention raised', input.title, {
    action: 'raise',
    severity: row.severity,
    assignedToId: row.assignedToId ?? null,
  });
  await audit.record({
    actorId: user.id,
    action: 'attention.raised',
    subjectType: 'attention',
    subjectId: row.id,
    meta: { clientId: row.clientId, severity: row.severity, source: row.source },
  });

  return row;
}

/* -------------------------------------------------------------------- write */

/** What each door does to the status. `assign` moves nobody — it moves the name. */
const NEXT: Record<Exclude<Action, 'assign'>, AttentionStatus> = {
  acknowledge: 'ACKNOWLEDGED',
  start: 'IN_PROGRESS',
  resolve: 'RESOLVED',
  dismiss: 'DISMISSED',
};

/**
 * Which statuses each door may be opened from.
 *
 * THERE IS NO REOPEN. A closed ticket stays closed and a condition that comes
 * back raises a new one — see `raise` — because "this happened again" and "this
 * was never finished" are different facts about a client and a reopen would
 * print them as one.
 */
const FROM: Record<Action, AttentionStatus[]> = {
  acknowledge: ['OPEN'],
  start: ['OPEN', 'ACKNOWLEDGED'],
  resolve: LIVE,
  dismiss: LIVE,
  assign: LIVE,
};

/** The sentence each refusal says, so a reader is told what already happened. */
const ALREADY: Record<Action, string> = {
  acknowledge: 'That item has already been picked up.',
  start: 'That item is already being worked.',
  resolve: 'That item is already closed.',
  dismiss: 'That item is already closed.',
  assign: 'A closed item is not somebody’s work any more.',
};

/** The line the record's Logs tab prints. The actor's name comes from `actorId`. */
const LOG_TITLE: Record<Action, string> = {
  acknowledge: 'Attention acknowledged',
  start: 'Attention picked up',
  resolve: 'Attention resolved',
  dismiss: 'Attention dismissed',
  assign: 'Attention assigned',
};

/**
 * The audit action, past tense, prefixed by the subject — the shape `pod.assign`
 * and `client.status_changed` already use.
 */
const AUDIT_ACTION: Record<Action, string> = {
  acknowledge: 'attention.acknowledged',
  start: 'attention.started',
  resolve: 'attention.resolved',
  dismiss: 'attention.dismissed',
  assign: 'attention.assigned',
};

/**
 * One timeline row for one act.
 *
 * WRITTEN HERE RATHER THAN DERIVED, because a transition owns no other table: the
 * attention row holds where the ticket stands NOW, and the answer to "who
 * acknowledged this, and when" would be gone the moment somebody resolved it.
 * Everything a client actually did already has a table, and none of it is copied
 * here — see the model's own comment.
 */
async function writeLog(
  actorId: string | null,
  row: AttentionRow,
  title: string,
  description: string,
  metadata: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.clientLog.create({
    data: {
      clientId: row.clientId,
      actorId,
      type: 'ATTENTION',
      title,
      description,
      metadata: { attentionId: row.id, ...(metadata as object) } as Prisma.InputJsonValue,
    },
  });
}

/**
 * May this person be handed this ticket?
 *
 * Two refusals, and both are about work getting done rather than about secrecy.
 * A deactivated seat cannot act, so a ticket filed there is a ticket nobody will
 * work — the argument `createWork` makes in as many words. And an assignee whose
 * scope does not reach the client cannot open the record the ticket is about, so
 * the hand-over would be a dead end with a name on it.
 */
async function assertAssignable(user: Scoper, clientId: string, assigneeId: string): Promise<void> {
  /*
   * THE PERMISSION IS ASKED FIRST, before the target is so much as looked up.
   *
   * Putting work on somebody ELSE'S list is the permission `createWork` gates on,
   * restated here rather than borrowed, so the two boards refuse the same act for
   * the same stated reason. Taking a ticket yourself needs nothing at all. Asking
   * it first is what keeps the two checks below — which describe a colleague and
   * the pods they sit on — from answering anything to a caller who may not name a
   * colleague in the first place.
   */
  if (assigneeId !== user.id && !(await can(user.role, 'seeAllClients'))) {
    await deny(
      user,
      'attention.assign',
      null,
      'Putting an item on somebody else’s list needs the permission that lets you see it.',
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, name: true, role: true, dept: true, status: true },
  });
  if (!target) throw ApiError.badRequest('No such person to give it to.');
  if (target.status !== 'active') {
    throw ApiError.badRequest('That person is not active — their queue is not being worked.');
  }

  const reaches = await canSeeClient(
    { id: target.id, role: target.role, dept: target.dept },
    clientId,
  );
  if (!reaches) {
    throw ApiError.badRequest(`${target.name} cannot open that client’s record.`, {
      assignedToId: 'Not on this client’s pod',
    });
  }
}

/**
 * Move a ticket.
 *
 * THE FIVE DOORS ARE ACTIONS, NOT A STATUS FIELD. A body that could name its own
 * status would be a client deciding which transitions are legal — including the
 * two this file exists to make impossible, a close with no reason and a reopen.
 *
 * A REASON IS OWED ON A CLOSE, and only there. `resolve` and `dismiss` are the
 * two acts that end a ticket, and the difference between them — dealt with,
 * versus never a problem — is exactly what the next recurrence will be read
 * against. Acknowledging costs nothing to explain and requiring a sentence there
 * would only teach people to type "ok". The schema checks the SHAPE of a reason
 * (trimmed, 4–500 characters); this checks whether one is due, the same split
 * `assignPodSeat` makes.
 */
export async function act(user: Scoper, id: string, input: PatchInput): Promise<AttentionRow> {
  assertStaff(user);
  const before = await load(user, id);
  const { action } = input;

  if (!FROM[action].includes(before.status)) throw ApiError.conflict(ALREADY[action]);

  const closing = action === 'resolve' || action === 'dismiss';
  const reason = input.resolutionReason?.trim();
  if (closing && !reason) {
    throw ApiError.badRequest(
      action === 'resolve' ? 'Say how this was resolved.' : 'Say why this is not a problem.',
      { resolutionReason: 'Required when an item is closed' },
    );
  }

  /* the caller has to have MEANT the field: leaving it out of an assign is a
     malformed request, while sending null is the real act of handing a ticket
     back to the pod */
  if (action === 'assign' && input.assignedToId === undefined) {
    throw ApiError.badRequest('Say who is taking this on.', { assignedToId: 'Required to assign' });
  }
  if (action === 'assign' && input.assignedToId) {
    await assertAssignable(user, before.clientId, input.assignedToId);
  }

  const now = new Date();
  const data: Prisma.AttentionUncheckedUpdateManyInput =
    action === 'assign'
      ? { assignedToId: input.assignedToId ?? null }
      : {
          status: NEXT[action],
          ...(closing
            ? {
                resolvedAt: now,
                resolvedById: user.id,
                resolutionReason: reason,
                /*
                 * THE KEY IS RETIRED, and this line is what makes a recurrence
                 * possible at all. `dedupeKey` is unique across the whole table,
                 * so a closed ticket still holding `noLogs:c-meena` would block
                 * the sweep from ever raising that condition again — the ticket
                 * would be closed and the client would go quiet in silence. The
                 * id makes the retired key unique and keeps the condition
                 * readable in it.
                 */
                dedupeKey: `${before.dedupeKey}#closed:${before.id}`,
              }
            : {}),
        };

  /*
   * THE STATUS IS RE-ASSERTED IN THE WRITE, not merely checked above. A colleague
   * resolving the same ticket in the second between the read and the update would
   * otherwise have their close overwritten by an acknowledgement, and the record
   * would say a closed problem was picked up.
   */
  const claimed = await prisma.attention.updateMany({
    where: { id, status: { in: FROM[action] } },
    data,
  });
  if (claimed.count === 0) throw ApiError.conflict(ALREADY[action]);

  const row = await prisma.attention.findUniqueOrThrow({ where: { id }, select: attentionRow });

  const handedTo = row.assignedTo?.name ?? null;
  await writeLog(
    user.id,
    row,
    action === 'assign' && !row.assignedToId ? 'Attention handed back to the pod' : LOG_TITLE[action],
    action === 'assign'
      ? handedTo
        ? `${row.title} — to ${handedTo}`
        : row.title
      : reason
        ? `${row.title} — ${reason}`
        : row.title,
    {
      action,
      from: before.status,
      to: row.status,
      severity: row.severity,
      ...(action === 'assign' ? { assignedToId: row.assignedToId ?? null } : {}),
      ...(reason ? { reason } : {}),
    },
  );

  /* OUTSIDE the write, per `audit.service`: a failed log must not roll back a
     legitimate act, and an act that landed must not be reported as failed */
  await audit.record({
    actorId: user.id,
    action: AUDIT_ACTION[action],
    subjectType: 'attention',
    subjectId: row.id,
    reason: reason ?? null,
    meta: {
      clientId: row.clientId,
      from: before.status,
      to: row.status,
      severity: row.severity,
      source: row.source,
      ...(action === 'assign'
        ? { from_assignee: before.assignedToId ?? null, to_assignee: row.assignedToId ?? null }
        : {}),
    },
  });

  return row;
}
