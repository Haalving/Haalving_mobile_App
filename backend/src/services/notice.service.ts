import type { AttentionSeverity, NoticeKind, Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { activeCovers, resolveSeat } from './covers.service.js';
import type { Scoper } from './scope.service.js';

/**
 * THE SWEEPS' OUTBOX — its write side, and the page a person reads it on.
 *
 * A notice is one sentence addressed to ONE PERSON. That is the whole model, and
 * it is why nothing in this file takes a client-scope clause: `toId` already IS
 * the scope, decided by the flow that wrote the row, so every read here filters
 * to the caller and there is nothing else to filter by.
 *
 * WHY `dedupeKey` IS THE POINT OF THIS FILE. The SLA lines on the work board
 * were synthesised at READ TIME and handed out pre-seen (digest.service.ts said
 * so out loud), for one honest reason: a sweep that wrote them would write them
 * again on every run, and by Friday one late plate would be five identical rows.
 * `@@unique([toId, dedupeKey])` removes that reason. A keyed raise UPSERTS, so
 * the 08:00 job can run at 08:00, again after a restart, and again by hand, and
 * one person still holds one notice about one condition. A one-off — a leave
 * decision, a birthday — passes no key at all and writes freely, because
 * Postgres does not collide nulls.
 *
 * A RE-RUN DOES NOT REFRESH THE LIFECYCLE. An upsert updates the wording and
 * leaves `status`, `seenAt` and `acknowledgedAt` alone: a notice somebody read on
 * Tuesday must not be unread again on Wednesday just because the condition has
 * not been fixed yet. The one exception is `reopen`, and it is a different fact.
 */

/* --------------------------------------------------------------- the write */

export interface RaiseNoticeInput {
  /** Everybody who should be told. De-duplicated here, so callers may be sloppy. */
  toIds: string[];
  kind: NoticeKind;
  /** The sentence. What the work board prints, on its own, for every old row. */
  text: string;
  title?: string | null;
  severity?: AttentionSeverity | null;
  clientId?: string | null;
  attentionId?: string | null;
  relatedLogId?: string | null;
  /**
   * Built from the rule and its SUBJECT — `noLogs:c-meena`, never from the date.
   * Omitted for a one-off, which is the ordinary case for anything a person did.
   */
  dedupeKey?: string | null;
  /** The seat or role this was addressed at, when it was raised for one. */
  targetRole?: string | null;
  /**
   * A RECURRENCE, not a repeat.
   *
   * A repeat is the same condition still standing, and it must not disturb a
   * notice somebody has already read. A recurrence is the condition coming BACK
   * after the ticket about it was closed — a different event, which the reader
   * has never seen — so the row under that key is stood back up: unread again,
   * dated now. The caller knows which of the two it is holding, because a
   * recurrence is the raise that just created a fresh ticket.
   */
  reopen?: boolean;
}

/**
 * Write one notice per recipient, and at most one per recipient per condition.
 *
 * Reports what it did rather than nothing: the 08:00 job logs the morning's
 * numbers, and "wrote 40, 3 of them new" is the line that tells a reader the
 * dedupe is working.
 */
export async function raise(input: RaiseNoticeInput): Promise<{ written: number; created: number }> {
  const to = [...new Set(input.toIds.filter(Boolean))];
  if (!to.length) return { written: 0, created: 0 };

  const body = {
    kind: input.kind,
    text: input.text,
    title: input.title ?? null,
    severity: input.severity ?? null,
    clientId: input.clientId ?? null,
    attentionId: input.attentionId ?? null,
    relatedLogId: input.relatedLogId ?? null,
    targetRole: input.targetRole ?? null,
  };

  const key = input.dedupeKey ?? null;

  if (!key) {
    await prisma.notice.createMany({ data: to.map((toId) => ({ toId, ...body })) });
    return { written: to.length, created: to.length };
  }

  /* asked BEFORE the upserts, so the answer describes the state this run found
     rather than the one it is about to leave behind */
  const already = await prisma.notice.findMany({
    where: { toId: { in: to }, dedupeKey: key },
    select: { toId: true },
  });
  const had = new Set(already.map((r) => r.toId));

  /* the recurrence stamp. `createdAt` is what a card reads "Xh ago" from, so a
     notice standing back up has to be dated now or it arrives already stale. */
  const stood = input.reopen
    ? { status: 'UNREAD' as const, seenAt: null, acknowledgedAt: null, createdAt: new Date() }
    : {};

  for (const toId of to) {
    await prisma.notice.upsert({
      where: { toId_dedupeKey: { toId, dedupeKey: key } },
      create: { toId, dedupeKey: key, ...body },
      update: { ...body, ...stood },
    });
  }

  return { written: to.length, created: to.filter((id) => !had.has(id)).length };
}

/**
 * Who is carrying these clients today — the audience for a sweep's notice.
 *
 * COVER-AWARE, through `covers.service` and nothing else. Reading `PodSeat.staffId`
 * here would tell a coach on approved leave that their client has gone quiet and
 * tell the person actually holding the seat nothing at all, which is the exact
 * failure `resolveSeat` exists to prevent.
 *
 * Keyed by client, and each entry carries the SEAT as well as the person: a
 * notice records which seat it was addressed at, so the board can still say who
 * it was meant for after somebody else has taken that seat.
 */
export async function podRecipients(
  clientIds: string[],
  seats?: readonly string[],
): Promise<Map<string, Array<{ staffId: string; seat: string }>>> {
  const out = new Map<string, Array<{ staffId: string; seat: string }>>();
  if (!clientIds.length) return out;

  const [rows, covers] = await Promise.all([
    prisma.podSeat.findMany({
      where: {
        clientId: { in: clientIds },
        ...(seats ? { seat: { in: seats as never[] } } : {}),
      },
      select: { clientId: true, seat: true, staffId: true },
    }),
    activeCovers(),
  ]);

  for (const r of rows) {
    const { staffId } = resolveSeat(covers, r.clientId, r.seat as string, r.staffId);
    if (!staffId) continue;
    const entry = { staffId, seat: r.seat as string };
    const held = out.get(r.clientId);
    if (held) held.push(entry);
    else out.set(r.clientId, [entry]);
  }

  return out;
}

/**
 * Everybody on a role's bench — the SLA ladder's escalate-to, as recipients.
 *
 * COMPARED IN JAVASCRIPT, not in the `where`, and `leave.service.approvers` does
 * the same for the same reason: `escalateToRole` is free text in `SlaConfig`, so
 * an Ops edit naming a role that is not in the enum would make this query THROW
 * rather than find nobody — and the sweep would lose the notice it had already
 * decided to send.
 */
export async function roleRecipients(role: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { status: 'active', role: { not: 'client' } },
    select: { id: true, role: true },
  });
  return rows.filter((r) => (r.role as string) === role).map((r) => r.id);
}

/* ---------------------------------------------------------------- the read */

export interface NoticeCard {
  id: string;
  kind: NoticeKind;
  severity: AttentionSeverity | null;
  title: string | null;
  text: string;
  client: { id: string; name: string } | null;
  /** ISO — the card prints "X ago" from it. */
  createdAt: string;
  status: 'UNREAD' | 'READ' | 'ACKNOWLEDGED';
  /** The WORK BOARD's stamp, kept beside `status` because they are not the same. */
  seen: boolean;
  acknowledgedAt: string | null;
  /** The ticket this announces, when a sweep raised one — the click-through. */
  attentionId: string | null;
}

export interface ListNoticesInput {
  unreadOnly?: boolean | undefined;
  kind?: NoticeKind | undefined;
  severity?: AttentionSeverity | undefined;
  clientId?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}

const CARD = {
  id: true,
  kind: true,
  severity: true,
  title: true,
  text: true,
  createdAt: true,
  status: true,
  seenAt: true,
  acknowledgedAt: true,
  attentionId: true,
  client: { select: { id: true, name: true } },
} satisfies Prisma.NoticeSelect;

function card(r: Prisma.NoticeGetPayload<{ select: typeof CARD }>): NoticeCard {
  return {
    id: r.id,
    kind: r.kind,
    severity: r.severity,
    title: r.title,
    text: r.text,
    client: r.client,
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    seen: r.seenAt !== null,
    acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
    attentionId: r.attentionId,
  };
}

/**
 * The caller's own outbox, newest first, one page at a time.
 *
 * PAGED BY CURSOR RATHER THAN BY OFFSET, because this list grows at the TOP. A
 * sweep raising three notices while somebody reads page two would push three
 * rows they have already read down into it, and `skip: 50` would show those
 * again while hiding three it had never shown. A cursor names a ROW, so the page
 * after it stays the page after it whatever arrives above.
 *
 * The tie-break on `id` is not decoration: every notice one sweep writes shares
 * a `createdAt` to the millisecond, and a cursor into an order that is not total
 * either repeats a row or skips one.
 */
export async function list(
  user: Scoper,
  q: ListNoticesInput,
): Promise<{ rows: NoticeCard[]; pagination: { limit: number; nextCursor: string | null } }> {
  const where: Prisma.NoticeWhereInput = {
    toId: user.id,
    ...(q.unreadOnly ? { status: 'UNREAD' } : {}),
    ...(q.kind ? { kind: q.kind } : {}),
    ...(q.severity ? { severity: q.severity } : {}),
    ...(q.clientId ? { clientId: q.clientId } : {}),
  };

  /* one more than asked for: whether there is another page is then a fact about
     the database rather than a guess from a page that came back full */
  const rows = await prisma.notice.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    select: CARD,
  });

  const page = rows.slice(0, q.limit);
  const nextCursor = rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null;

  return { rows: page.map(card), pagination: { limit: q.limit, nextCursor } };
}

/** What the Home badge reads. `status`, not `seenAt` — see the model's comment. */
export async function unreadCount(user: Scoper): Promise<{ unread: number }> {
  return { unread: await prisma.notice.count({ where: { toId: user.id, status: 'UNREAD' } }) };
}

/**
 * One of the caller's own notices, or nothing.
 *
 * A NOTICE ADDRESSED TO SOMEBODY ELSE IS A 404, never a 403 — the rule the
 * client-scoped routes follow, for the same reason: a refusal that distinguishes
 * "not yours" from "no such row" confirms the row exists to whoever asked.
 */
async function mine(user: Scoper, id: string) {
  const row = await prisma.notice.findFirst({ where: { id, toId: user.id }, select: CARD });
  if (!row) throw ApiError.notFound('No such notice.');
  return row;
}

/**
 * Read on Home.
 *
 * NOTHING IS AUDITED AND NOTHING IS LOGGED HERE. Opening a notice is not an act
 * on a client, it is a person looking at their own list, and a `ClientLog` row
 * per glance would bury the record's timeline in UI noise — which is precisely
 * what that timeline exists not to be.
 *
 * An ACKNOWLEDGED notice does not fall back to READ. Acknowledgement is the
 * further of the two states, and re-reading it is not an undo.
 */
export async function markRead(user: Scoper, id: string): Promise<NoticeCard> {
  const row = await mine(user, id);
  if (row.status !== 'UNREAD') return card(row);

  const next = await prisma.notice.update({
    where: { id: row.id },
    data: { status: 'READ' },
    select: CARD,
  });
  return card(next);
}

/**
 * "I have this."
 *
 * IDEMPOTENT, and `acknowledgedAt` keeps its FIRST value: the question that
 * column answers is when somebody took this on, and a second click is not a
 * second taking-on.
 */
export async function acknowledge(user: Scoper, id: string): Promise<NoticeCard> {
  const row = await mine(user, id);
  if (row.status === 'ACKNOWLEDGED') return card(row);

  const next = await prisma.notice.update({
    where: { id: row.id },
    data: { status: 'ACKNOWLEDGED', acknowledgedAt: row.acknowledgedAt ?? new Date() },
    select: CARD,
  });
  return card(next);
}
