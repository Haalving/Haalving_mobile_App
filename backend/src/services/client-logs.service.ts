import { pillarName } from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { canSeeClient, type Scoper } from './scope.service.js';

/**
 * THE CLIENT RECORD'S MERGED LOG — one chronological read of everything the client
 * has done and everything the team has done to their record.
 *
 * The demo builds this on the client (console-client-record.js `collect`) by walking
 * ten in-memory arrays; here the same ten sources are ten indexed reads, merged and
 * time-sorted once. Each entry carries a BUCKET so the tab's chips (Client / Team /
 * Plan / Medical) filter without a second query, and the counts are computed here so
 * the chips can show them before the list is filtered.
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

export interface ClientLogs {
  entries: LogEntry[];
  counts: Record<'all' | LogBucket, number>;
}

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

export async function clientLogs(user: Scoper, clientId: string): Promise<ClientLogs> {
  if (!(await canSeeClient(user, clientId))) throw ApiError.notFound('No such client.');

  const [circle, meals, moods, dones, plans, events, medical, audit, client] = await Promise.all([
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

  /* newest first — ISO strings sort chronologically */
  entries.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));

  const counts: Record<'all' | LogBucket, number> = { all: entries.length, client: 0, team: 0, plan: 0, medical: 0 };
  for (const x of entries) counts[x.bucket] += 1;

  return { entries, counts };
}
