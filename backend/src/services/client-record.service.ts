import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { canSeeClient, type Scoper } from './scope.service.js';

/**
 * THE CLIENT RECORD'S READ-ONLY PANELS — Trackers, Meetings, Documents.
 *
 * Each is one scoped read the console tab draws directly. The client populates
 * Trackers and Documents from the app (the Quick-add sheet and the Records Vault);
 * Meetings are the Schedule's own rows filtered to this client. All three take the
 * same `canSeeClient` guard the record does — a staff member sees a panel only for
 * a client their scope reaches, and a 404 (never 403) so it cannot confirm a client
 * they may not see even exists.
 */

async function assertReachable(user: Scoper, clientId: string): Promise<void> {
  if (!(await canSeeClient(user, clientId))) throw ApiError.notFound('No such client.');
}

/* ------------------------------------------------------------- trackers */

interface TrackerBlob {
  waterDone?: number;
  waterTarget?: number;
  steps?: number;
  stepsTarget?: number;
  sleep?: string;
  sleepPct?: number;
  mealsLogged?: number;
  mealsTarget?: number;
}

const inLakh = (n: number): string => n.toLocaleString('en-IN');

export interface TrackerCard {
  key: string;
  label: string;
  value: string;
  sub: string;
}
export interface SessionRing {
  pillar: string;
  label: string;
  done: number;
  target: number;
}

export async function clientTrackers(
  user: Scoper,
  clientId: string,
): Promise<{ cards: TrackerCard[]; compliance: number | null; sessions: SessionRing[] }> {
  await assertReachable(user, clientId);
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: { trackers: true, sessions: true, compliance: true },
  });
  if (!c) throw ApiError.notFound('No such client.');

  const t = (c.trackers ?? {}) as TrackerBlob;
  const cards: TrackerCard[] = [
    { key: 'water', label: 'Water', value: `${t.waterDone ?? 0} / ${t.waterTarget ?? 0}`, sub: 'glasses today' },
    { key: 'steps', label: 'Steps', value: inLakh(t.steps ?? 0), sub: `of ${inLakh(t.stepsTarget ?? 0)} target` },
    { key: 'sleep', label: 'Sleep', value: t.sleep ?? '—', sub: `${t.sleepPct ?? 0}% of need` },
    { key: 'meals', label: 'Meals logged', value: `${t.mealsLogged ?? 0} / ${t.mealsTarget ?? 0}`, sub: 'today' },
  ];

  /* the session rings equal the numbers the level-review engine uses — one source
     of truth. Keys are the pod vocabulary: fitness / yoga / mind. */
  const s = (c.sessions ?? {}) as Record<string, { done?: number; target?: number }>;
  const sessions: SessionRing[] = [
    { pillar: 'fitness', label: 'Fitness', done: s.fitness?.done ?? 0, target: s.fitness?.target ?? 0 },
    { pillar: 'yoga', label: 'Yoga', done: s.yoga?.done ?? 0, target: s.yoga?.target ?? 0 },
    { pillar: 'wellness', label: 'Mind', done: s.mind?.done ?? 0, target: s.mind?.target ?? 0 },
  ].filter((r) => r.target > 0 || r.done > 0);

  return { cards, compliance: c.compliance, sessions };
}

/* ------------------------------------------------------------- meetings */

export interface MeetingRow {
  id: string;
  title: string;
  /** ISO date (the day) */
  date: string | null;
  startMin: number | null;
  durMin: number | null;
  /** the join link, when the meeting has a room */
  link: string | null;
  coaches: string[];
}

export async function clientMeetings(user: Scoper, clientId: string): Promise<MeetingRow[]> {
  await assertReachable(user, clientId);
  const rows = await prisma.task.findMany({
    where: { clientId, kind: 'MEETING' },
    orderBy: [{ date: 'desc' }, { startMin: 'asc' }],
    select: { id: true, title: true, date: true, startMin: true, durMin: true, link: true, assigneeIds: true },
  });

  const ids = [...new Set(rows.flatMap((r) => r.assigneeIds))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date ? r.date.toISOString().slice(0, 10) : null,
    startMin: r.startMin,
    durMin: r.durMin,
    link: r.link,
    coaches: r.assigneeIds.map((id) => nameOf.get(id) ?? 'the team'),
  }));
}

/* ------------------------------------------------------------ documents */

export interface DocumentRow {
  id: string;
  title: string;
  kind: string;
  uploadedOn: string;
  /** true once a clinician has signed it */
  signed: boolean;
  by: string | null;
}

export async function clientDocuments(user: Scoper, clientId: string): Promise<DocumentRow[]> {
  await assertReachable(user, clientId);
  const rows = await prisma.medicalSummary.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, kind: true, uploadedOn: true, signedAt: true, byId: true },
  });

  const ids = [...new Set(rows.map((r) => r.byId).filter((v): v is string => !!v))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    uploadedOn: r.uploadedOn,
    signed: !!r.signedAt,
    by: r.byId ? (nameOf.get(r.byId) ?? null) : null,
  }));
}
