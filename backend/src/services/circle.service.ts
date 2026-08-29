import type { MessageFromKind, MessageKind, Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';

/**
 * The Care Circle's write side — THE ONLY PLACE A CircleMessage IS WRITTEN.
 *
 * Nothing else in the codebase calls `prisma.circleMessage.create`, and nothing
 * else should: the sequence, the authorship rule and the notification that a
 * message eventually triggers are all properties of "a message was posted", and
 * a second writer is a second place for them to be got wrong. The seed touches
 * the table too, but only to DELETE the rows a previous run's drafts became.
 *
 * Ported from `HV.pushMsg` (core.js:1057). Reads, unread counts and the chat UI
 * are deliberately not here — a follow-up needs somewhere to LAND, and that is
 * all this file is for today.
 */

/**
 * The advisory-lock namespace for message sequencing.
 *
 * An arbitrary but FIXED number, chosen once. Postgres advisory locks share a
 * single global space, so the first argument keeps this lock from colliding with
 * any other advisory lock the application takes later — the second argument is
 * what actually distinguishes one client's room from another's.
 */
const SEQ_LOCK_NAMESPACE = 4201;

export interface PostMessageInput {
  /**
   * The human who sent it. NULL for a client's own line or an AI line — the
   * column's meaning, stated in schema.prisma, and enforced below.
   */
  fromUserId: string | null;
  fromKind: MessageFromKind;
  kind: MessageKind;
  text: string;
}

/**
 * Post one message into a client's room.
 *
 * HOW `seq` IS MADE SAFE, and why it is done this way.
 *
 * `seq` is per client and monotonic, so it is read (MAX + 1) before it is
 * written, and under Postgres's default READ COMMITTED two senders in the same
 * room can read the same maximum. The `(clientId, seq)` unique index catches
 * that, and the obvious answer is to retry on the unique violation — but retry
 * is exactly what this function cannot do. It accepts a caller's transaction so
 * a send is atomic with the draft update, and in Postgres a failed statement
 * poisons the whole transaction: there is nothing left to retry INTO. A retry
 * would have to be the caller's, around its entire transaction, which pushes a
 * detail of this table's sequencing into every future caller.
 *
 * So the race is prevented rather than detected. A transaction-scoped advisory
 * lock keyed on the client id serialises the writers of ONE room and nobody
 * else; it is taken inside whichever transaction we are in and released when
 * that transaction ends, however it ends. Two rooms still write in parallel.
 * `hashtext` can in principle collide, and the cost of a collision is that two
 * unrelated rooms take turns for a millisecond — a performance footnote, not a
 * correctness one, which is the right way round.
 *
 * The alternative considered was locking the client row itself (`FOR NO KEY
 * UPDATE`). It works, but it couples posting a message to editing a client's
 * profile: a long-running record edit would hold up the room, and vice versa.
 * Two facts that have nothing to do with each other should not queue behind one
 * lock.
 */
export async function postMessage(
  clientId: string,
  input: PostMessageInput,
  tx?: Prisma.TransactionClient,
) {
  /*
   * Authorship is an invariant of the column, not a user error, so these throw
   * plain errors: a STAFF row with no author, or a client line attributed to a
   * staff member, is a bug in the caller and deserves the 500 it gets rather
   * than a polite sentence that hides it.
   *
   * Note what this rules out: the copilot NEVER sends. It writes follow-up
   * drafts and a named human sends them, so every message a follow-up becomes
   * arrives here as STAFF with that human's id. `AI` stays in the enum for the
   * room's own AI lines, which are not follow-ups.
   */
  if (input.fromKind === 'STAFF' && !input.fromUserId) {
    throw new Error('circle.postMessage: a STAFF message must name its author.');
  }
  if (input.fromKind !== 'STAFF' && input.fromUserId) {
    throw new Error('circle.postMessage: only a STAFF message carries an author.');
  }

  const write = async (db: Prisma.TransactionClient) => {
    /* `$executeRaw` rather than `$queryRaw`: the lock function returns `void`,
       which is not a column Prisma can deserialise, and there is nothing here we
       want back anyway — the statement returning at all IS the lock */
    await db.$executeRaw`SELECT pg_advisory_xact_lock(${SEQ_LOCK_NAMESPACE}::int, hashtext(${clientId}))`;

    const last = await db.circleMessage.findFirst({
      where: { clientId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });

    const message = await db.circleMessage.create({
      data: {
        clientId,
        fromUserId: input.fromUserId,
        fromKind: input.fromKind,
        kind: input.kind,
        text: input.text,
        seq: (last?.seq ?? 0) + 1,
      },
      select: { id: true, clientId: true, seq: true, kind: true, createdAt: true },
    });

    /* ─────────────────── CLIENT PUSH NOTIFICATION HOOKS HERE ───────────────────
       When the mobile app has a device token, this is the message it announces.
       It does NOT belong at this line: we may be inside a caller's transaction
       that has not committed, and a push for a message that then rolled back
       cannot be recalled. The delivery is a post-commit act, so it hooks in as
       an outbox row written HERE inside the same transaction and drained by a
       job after it commits — which also gives quiet hours somewhere to live
       (22:00-07:00 for client traffic; see jobs/index.ts).
       ────────────────────────────────────────────────────────────────────────── */

    return message;
  };

  /*
   * Without a caller's transaction we open our own, because the advisory lock
   * lives and dies with a transaction: taken outside one it would be released
   * before the insert it is protecting.
   */
  return tx ? write(tx) : prisma.$transaction(write);
}

/* ═══════════════════════════════════════════════════════════════ the reads */

/**
 * A client's room, in two lanes.
 *
 * TWO LANES, ONE TABLE, AND THE SEPARATION IS THE WHOLE POINT. Everything a
 * client can see is `kind != TEAMONLY`; the scratch pad beside the record is
 * `kind == TEAMONLY` and the client never sees any of it. Splitting them into
 * two tables was the obvious alternative and is worse: they share a sequence, a
 * room and an author rule, and two tables would let a note be written into the
 * wrong one by a caller that simply picked the wrong model. Here the lane is a
 * value on the row, and this function is the only place the two are told apart.
 *
 * The team lane deliberately EXCLUDES the AI. The demo's own filter
 * (`console-clients.js:2471`) drops `fromId === 'ai'`: the pad is where people
 * think aloud to each other, and a machine's line in that lane reads as a
 * colleague's when it is not one.
 */
export interface ThreadMessage {
  id: string;
  seq: number;
  kind: MessageKind;
  fromKind: MessageFromKind;
  from: { id: string; name: string } | null;
  text: string;
  at: Date;
}

export async function thread(
  clientId: string,
  lane: 'client' | 'team',
): Promise<ThreadMessage[]> {
  const rows = await prisma.circleMessage.findMany({
    where: {
      clientId,
      ...(lane === 'team'
        ? { kind: 'TEAMONLY', fromKind: { not: 'AI' } }
        : { kind: { not: 'TEAMONLY' } }),
    },
    orderBy: { seq: 'asc' },
    select: {
      id: true,
      seq: true,
      kind: true,
      fromKind: true,
      text: true,
      createdAt: true,
      fromUser: { select: { id: true, name: true } },
    },
  });

  return rows.map((m) => ({
    id: m.id,
    seq: m.seq,
    kind: m.kind,
    fromKind: m.fromKind,
    from: m.fromUser,
    text: m.text,
    at: m.createdAt,
  }));
}
