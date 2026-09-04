import type { ClientLogType } from '@prisma/client';
import { pillarName, type schemas } from '@haalving/shared';
import type { z } from 'zod';

import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { dateAdd, startOfDay } from '../utils/dates.js';
import { canSeeClient, type Scoper } from './scope.service.js';

/**
 * THE CLIENT RECORD'S MERGED LOG — one chronological read of everything the client
 * has done and everything the team has done to their record.
 *
 * The demo builds this on the client (console-client-record.js `collect`) by walking
 * ten in-memory arrays; here the same sources are indexed reads, merged and
 * time-sorted once. Each entry carries a BUCKET so the tab's chips (Client / Team /
 * Plan / Medical) filter without a second query, and the counts are computed here so
 * the chips can show them before the list is filtered.
 *
 * TEN OF THE ELEVEN SOURCES ARE STILL DERIVED, and that is the point of the whole
 * file: a meal, a mood, a ticked session and an approval each already own the table
 * that is the truth about them, so the timeline reads those tables rather than
 * keeping a second copy that drifts. `ClientLog` is the eleventh and the exception —
 * it holds the handful of events that own no table anywhere else (a sweep noticing
 * nothing happened, an attention changing hands), which is why it is a read here and
 * not a rewrite of the ten.
 *
 * SCOPE FIRST. A staff member sees this only for a client their scope reaches — the
 * same `canSeeClient` guard the record's `get` uses, and the same 404-not-403 so the
 * log cannot confirm a client they may not see even exists.
 */

export type LogBucket = 'client' | 'team' | 'plan' | 'medical';

export interface LogEntry {
  /** ISO timestamp; the list is newest-first and the tab groups by day from this */
  at: string;
  bucket: LogBucket;
  kind: string;
  icon: string;
  title: string;
  sub: string;
}

export interface LogPage {
  limit: number;
  /** Rows the filters match across every page — the list's length, not the page's. */
  total: number;
  hasMore: boolean;
  /** Hand straight back as `?cursor=`. Null on the last page. */
  nextCursor: string | null;
}

export interface ClientLogs {
  entries: LogEntry[];
  counts: Record<'all' | LogBucket, number>;
  pagination: LogPage;
}

type LogsQuery = z.infer<typeof schemas.clientLogsQuery>;

/**
 * What a stored row shows as, per type.
 *
 * The icons are the console's own names (`components/icons/Icon.tsx`) — a name it
 * does not carry falls back to the house glyph, which is a silent wrong answer, so
 * these four are checked against that file rather than invented.
 */
const STORED_ICON: Record<ClientLogType, string> = {
  INACTIVITY: 'clock',
  ATTENTION: 'flag',
  SYSTEM: 'gear',
  NOTE: 'pencil',
};

const ACT_WORD: Record<string, string> = {
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  RETURNED: 'returned',
  PUBLISHED: 'published',
};

/** 'client.status_changed' -> 'Status changed' */
function humanizeAction(action: string): string {
  const tail = action.includes('.') ? action.slice(action.indexOf('.') + 1) : action;
  const words = tail.replace(/[._]/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
}

export async function clientLogs(user: Scoper, clientId: string, q: LogsQuery): Promise<ClientLogs> {
  if (!(await canSeeClient(user, clientId))) throw ApiError.notFound('No such client.');

  const [circle, meals, moods, dones, plans, events, medical, audit, stored, client] = await Promise.all([
    prisma.circleMessage.findMany({
      where: { clientId, kind: { not: 'MEAL' } },
      select: { fromKind: true, fromUserId: true, kind: true, text: true, createdAt: true },
    }),
    prisma.meal.findMany({
      where: { clientId },
      select: { slot: true, dishes: true, finalStars: true, capturedAt: true },
    }),
    prisma.clientMood.findMany({
      where: { clientId },
      select: { mood: true, note: true, createdAt: true },
    }),
    prisma.taskDone.findMany({
      where: { task: { clientId } },
      select: { at: true, byId: true, task: { select: { title: true, pillar: true } } },
    }),
    prisma.clientPlan.findMany({
      where: { clientId, assignedAt: { not: null } },
      select: { pillar: true, assignedAt: true, assignedById: true, templateId: true },
    }),
    prisma.approvalEvent.findMany({
      where: { approval: { clientId } },
      select: { act: true, byId: true, at: true, approval: { select: { title: true } } },
    }),
    prisma.medicalSummary.findMany({
      where: { clientId },
      select: { title: true, kind: true, byId: true, signedAt: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { subjectId: clientId, subjectType: 'client' },
      select: { action: true, actorId: true, at: true },
    }),
    /* the eleventh source, and the only STORED one — see the note at the top */
    prisma.clientLog.findMany({
      where: { clientId },
      select: { type: true, title: true, description: true, actorId: true, createdAt: true },
    }),
    prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }),
  ]);

  /* resolve every staff id these rows name, in one query */
  const ids = new Set<string>();
  for (const m of circle) if (m.fromUserId) ids.add(m.fromUserId);
  for (const d of dones) if (d.byId) ids.add(d.byId);
  for (const p of plans) if (p.assignedById) ids.add(p.assignedById);
  for (const ev of events) if (ev.byId) ids.add(ev.byId);
  for (const m of medical) if (m.byId) ids.add(m.byId);
  for (const a of audit) if (a.actorId) ids.add(a.actorId);
  for (const l of stored) if (l.actorId) ids.add(l.actorId);
  const users = ids.size
    ? await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const who = (id: string | null | undefined): string => (id ? (nameOf.get(id) ?? 'the team') : 'the team');
  const firstName = (client?.name ?? 'the client').split(' ')[0] ?? 'the client';

  const entries: LogEntry[] = [];
  const push = (at: Date, bucket: LogBucket, kind: string, icon: string, title: string, sub: string): void => {
    entries.push({ at: at.toISOString(), bucket, kind, icon, title, sub });
  };

  /* 1 · the conversation (client lane vs team lane; the meal lands richer below) */
  for (const m of circle) {
    const fromClient = m.fromKind === 'CLIENT';
    const author =
      fromClient ? `${firstName} wrote` : m.fromKind === 'AI' ? 'Your AI coach wrote' : `${who(m.fromUserId)} wrote`;
    push(
      m.createdAt,
      fromClient ? 'client' : 'team',
      'msg',
      m.kind === 'DOC' ? 'doc' : 'chat',
      author,
      String(m.text ?? '').slice(0, 140),
    );
  }
  /* 2 · meals */
  for (const m of meals) {
    push(
      m.capturedAt,
      'client',
      'meal',
      'leaf',
      `${m.slot} logged`,
      m.dishes.join(' · ') + (m.finalStars != null ? ` · rated ${m.finalStars}★` : ' · awaiting rating'),
    );
  }
  /* 3 · moods */
  for (const m of moods) push(m.createdAt, 'client', 'mood', 'heart', `Mood · ${m.mood}`, m.note ?? '');
  /* 4 · sessions the client marked done */
  for (const d of dones) {
    const p = d.task.pillar ? `${pillarName(d.task.pillar)} · ` : '';
    push(d.at, 'client', 'session', 'check', `${d.task.title} done`, p.trim());
  }
  /* 5 · plan assignments (per pillar) */
  for (const p of plans) {
    if (p.assignedAt) {
      /* `assignedAt` is written on approve, so a row that carries one went live then;
         a template since removed from under it reads as drafted rather than live */
      push(p.assignedAt, 'plan', 'plan', 'doc', `${pillarName(p.pillar)} plan ${p.templateId ? 'set live' : 'drafted'}`, `by ${who(p.assignedById)}`);
    }
  }
  /* 6 · the approval chain moving (submitted / returned / approved / published) */
  for (const ev of events) {
    push(ev.at, 'plan', 'approval', 'check', ev.approval.title, `${ACT_WORD[ev.act] ?? ev.act.toLowerCase()} by ${who(ev.byId)}`);
  }
  /* 7 · medical summaries filed */
  for (const m of medical) {
    push(m.signedAt ?? m.createdAt, 'medical', 'doc', 'doc', `${m.title} filed`, m.byId ? `${m.kind} · ${who(m.byId)}` : m.kind);
  }
  /* 8 · record-level staff acts with no other home */
  for (const a of audit) push(a.at, 'team', 'audit', 'lock', humanizeAction(a.action), who(a.actorId));

  /*
   * 9 · the stored rows — a sweep, an attention changing hands, a system act.
   *
   * ALL FOUR TYPES LAND IN `team`, INACTIVITY INCLUDED, and that is what the
   * `client` chip is worth: it answers "what has this person DONE", and a sweep
   * noticing that they did nothing is the building talking about them, not them.
   * Filing an absence under their own name would put a row they never wrote into
   * the one lane that is theirs.
   */
  for (const l of stored) {
    const sub = [l.description, l.actorId ? who(l.actorId) : null].filter(Boolean).join(' · ');
    push(l.createdAt, 'team', l.type.toLowerCase(), STORED_ICON[l.type], l.title, sub);
  }

  /*
   * NEWEST FIRST — ISO strings sort chronologically — AND TIES BROKEN BY THE ROW'S
   * OWN TEXT, which is the half that makes the cursor safe.
   *
   * `at` alone is not a total order: two sources can stamp the same millisecond,
   * and none of the eleven reads asks for an ORDER BY, so Postgres is entitled to
   * hand the same rows back in a different order on the next request. That is
   * invisible in a list drawn whole and fatal in one that is PAGED — the cursor
   * counts how many entries sharing a timestamp have already gone out, and a count
   * is only a position if those entries stay in the same order. Comparing the
   * strings directly rather than through `localeCompare`, because the order has to
   * be the same on every machine that runs this.
   */
  const rank = (e: LogEntry): string => `${e.kind} ${e.title} ${e.sub}`;
  entries.sort((x, y) => {
    if (x.at !== y.at) return x.at < y.at ? 1 : -1;
    const a = rank(x);
    const b = rank(y);
    return a < b ? -1 : a > b ? 1 : 0;
  });

  /*
   * THE WINDOW IS APPLIED HERE RATHER THAN IN THE ELEVEN READS, deliberately.
   *
   * Each source keeps its own timestamp column and one of them is a FALLBACK PAIR
   * (`signedAt ?? createdAt`), so pushing the window down would be eleven separate
   * chances to be off by one — against a list whose length is one client's history,
   * where there is nothing to win. `to` is INCLUSIVE, so the upper bound is the
   * start of the following day and the comparison is strict.
   */
  const from = q.from ? startOfDay(q.from).toISOString() : null;
  const to = q.to ? startOfDay(dateAdd(q.to, 1)).toISOString() : null;
  const inWindow =
    from || to ? entries.filter((e) => (!from || e.at >= from) && (!to || e.at < to)) : entries;

  /*
   * THE CHIPS COUNT THE WINDOW, NEVER THE PAGE. A chip that moved as somebody
   * paged would be reporting how far they had scrolled rather than what the record
   * holds — and it is counted before `bucket` narrows, because the whole job of a
   * chip is to show its total before it is pressed.
   */
  const counts: Record<'all' | LogBucket, number> = {
    all: inWindow.length,
    client: 0,
    team: 0,
    plan: 0,
    medical: 0,
  };
  for (const x of inWindow) counts[x.bucket] += 1;

  const rows = q.bucket ? inWindow.filter((e) => e.bucket === q.bucket) : inWindow;

  /*
   * THE CURSOR, WALKED. `<at>|<ties already sent>` — the shape `schemas.logCursor`
   * validates, and the reason it is a timestamp rather than an offset is written
   * there. Everything strictly newer than the cursor is skipped however much of it
   * has landed since the last page, then the entries stamped that same instant that
   * already went out.
   */
  let start = 0;
  if (q.cursor) {
    const [at, tie] = q.cursor.split('|') as [string, string];
    while (start < rows.length && (rows[start] as LogEntry).at > at) start += 1;
    start += Number(tie);
  }

  const page = rows.slice(start, start + q.limit);
  const end = start + page.length;
  const last = page[page.length - 1];
  const hasMore = end < rows.length;

  let nextCursor: string | null = null;
  if (last && hasMore) {
    let tie = 0;
    for (let i = end - 1; i >= 0 && (rows[i] as LogEntry).at === last.at; i -= 1) tie += 1;
    nextCursor = `${last.at}|${tie}`;
  }

  return { entries: page, counts, pagination: { limit: q.limit, total: rows.length, hasMore, nextCursor } };
}
