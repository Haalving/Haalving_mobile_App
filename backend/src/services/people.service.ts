import {
  DEPTS,
  POD_SEATS,
  allTags,
  ago,
  levelLabel,
  stripDerived,
  type SchedUser,
} from '@haalving/shared';

import { prisma } from '../config/prisma.js';
import { can } from '../middleware/authorize.js';
import { ApiError } from '../utils/apiResponse.js';
import { toISODate, todayISO } from '../utils/dates.js';
import * as audit from './audit.service.js';
import { seatLabel } from './client.service.js';
import { clientScopeWhere, loadScoper } from './scope.service.js';

/**
 * People & Access — the team, the seats, and who may change either.
 *
 * The Day 1 page built the staff list, the create/edit sheet and the role picker;
 * this completes it. `user.service.ts` still owns creating and updating a person —
 * this module owns the READING the page does (which is where the derived tags
 * live), deactivation, and the team feed.
 */

export interface Actor {
  id: string;
  role: string;
}

const canManage = (a: Actor) => can(a.role, 'managePeople');

/**
 * Refuse, and log it.
 *
 * The console says "Super Admin only. This attempt was logged." — a promise only
 * the server can keep.
 */
async function deny(actor: Actor, what: string, subjectId: string | null): Promise<never> {
  await audit.record({
    actorId: actor.id,
    action: 'denied',
    subjectType: 'people',
    subjectId,
    reason: what,
    meta: { role: actor.role },
  });
  throw ApiError.forbidden('Super Admin only. This attempt was logged.');
}

/* ------------------------------------------------------------- the staff */

/**
 * Whether somebody is on approved leave today.
 *
 * THE HOOK, now plugged in. This returned an empty set while Time & Cover was
 * unbuilt; the leave board has since landed, so the `On leave` tag fires off the
 * real rows — the demo's own test (`console-people.js:130`): status approved, and
 * today inside `[from, to]` with both ends inclusive.
 *
 * APPROVED ALONE. A leave still walking its chain is a request, not an absence,
 * and tagging a coach who may yet be declined would take them off the pickers for
 * a week nobody has agreed to.
 *
 * Both columns are `@db.Date`, so they carry midnight UTC and comparing them to a
 * midnight-UTC "today" is an exact day comparison rather than a clock one.
 */
async function onLeaveToday(staffIds: string[]): Promise<Set<string>> {
  if (!staffIds.length) return new Set<string>();
  const today = new Date(`${todayISO()}T00:00:00.000Z`);
  const rows = await prisma.leave.findMany({
    where: {
      staffId: { in: staffIds },
      status: 'APPROVED',
      from: { lte: today },
      to: { gte: today },
    },
    select: { staffId: true },
  });
  return new Set(rows.map((r) => r.staffId));
}

/** How many clients each person actually holds a seat on. */
async function allocatedCounts(): Promise<Map<string, number>> {
  const seats = await prisma.podSeat.findMany({
    where: { staffId: { not: null } },
    select: { staffId: true, clientId: true },
  });
  const byStaff = new Map<string, Set<string>>();
  for (const s of seats) {
    if (!s.staffId) continue;
    /* DISTINCT CLIENTS, not seats: one person holding two seats on one pod carries
       one client, and counting seats would read as two */
    const set = byStaff.get(s.staffId) ?? new Set<string>();
    set.add(s.clientId);
    byStaff.set(s.staffId, set);
  }
  return new Map([...byStaff].map(([k, v]) => [k, v.size]));
}

export interface StaffRow {
  id: string;
  name: string;
  email: string | null;
  role: string;
  roleTitle: string;
  dept: string | null;
  deptLabel: string | null;
  level: number | null;
  levelLabel: string;
  subtitle: string | null;
  joinedAt: string | null;
  allocated: number;
  tags: string[];
  typedTags: string[];
  inactive: boolean;
  /**
   * The declared week, as stored. The detail card draws the strip from it, so it
   * travels with the row rather than costing a second request per person opened
   * — and it is nobody's secret: the whole point of the page is who works when.
   */
  avail: unknown;
  /** `IST · UTC+5:30` on the card: the label and the offset it restates. */
  tzo: number;
  tzLabel: string;
  /** Only for `managePeople` — see `redact`. */
  memo?: string | null;
  emergency?: unknown;
  cvName?: string | null;
}

/**
 * The compact card everybody else sees.
 *
 * A coach can open a colleague's card to find their bench and their hours; they
 * cannot read the Super Admin's memo about them, their emergency contact, or their
 * CV. Redacted HERE rather than in the console, because a field the browser was
 * sent is a field the browser has.
 */
function redact(row: StaffRow): StaffRow {
  const { memo: _m, emergency: _e, cvName: _c, ...rest } = row;
  return rest;
}

export async function listStaff(actor: Actor): Promise<StaffRow[]> {
  const [users, roles, allocated] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: 'client' } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
    prisma.role.findMany({ select: { key: true, title: true } }),
    allocatedCounts(),
  ]);

  const titles = new Map(roles.map((r) => [r.key, r.title]));
  const leave = await onLeaveToday(users.map((u) => u.id));
  const manage = await canManage(actor);

  const rows = users.map((u) => {
    const typed = u.tags;
    const subject = {
      /* toISODate, never toISOString: the date is stored as local midnight, so
         converting to UTC first reports the day before — a joining date that
         reads a day early, and a New joinee tag that expires a day early. */
      joinedAt: u.joinedAt ? toISODate(u.joinedAt) : null,
      level: u.level,
      avail: u.avail as SchedUser['avail'],
      inactive: u.status !== 'active',
    };
    const facts = {
      onLeaveToday: leave.has(u.id),
      allocatedCount: allocated.get(u.id) ?? 0,
    };

    const row: StaffRow = {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as string,
      roleTitle: titles.get(u.role as string) ?? (u.role as string),
      dept: u.dept as string | null,
      deptLabel: u.dept ? ((DEPTS as Record<string, string>)[u.dept] ?? null) : null,
      level: u.level,
      levelLabel: levelLabel(u.level),
      subtitle: u.subtitle,
      joinedAt: subject.joinedAt,
      allocated: facts.allocatedCount,
      tags: allTags(subject, typed, facts),
      typedTags: typed,
      inactive: subject.inactive,
      avail: subject.avail,
      tzo: u.tzo,
      tzLabel: u.tzLabel,
      memo: u.memo,
      emergency: u.emergency,
      cvName: u.cvName,
    };
    return manage ? row : redact(row);
  });

  return rows;
}

/* --------------------------------------------------- the employee record */

/** One line under ALLOCATED CLIENTS on the record sheet. */
export interface StaffClient {
  id: string;
  name: string;
  /** The pod seat they hold on that client — `dietitian`, `admin`, `opshead`… */
  seat: string;
  /** What the console calls it: `dietitian` reads "Nutrition", `admin` "Haalving Coach". */
  seatLabel: string;
  status: string;
}

/**
 * The staff card PLUS the clients they carry — the record sheet, not the list row.
 *
 * `listStaff` deliberately does not carry this: it would be one pod query per
 * person on the bench to fill a column the table does not have. The names are
 * per-record detail and are fetched when a record is opened.
 */
export interface StaffRecord extends StaffRow {
  clients: StaffClient[];
  /** How many of their clients the CALLER may not see. Never negative. */
  clientsHidden: number;
}

/** Where a seat sits in the console's own seat order. */
function seatRank(seat: string): number {
  const i = (POD_SEATS as readonly string[]).indexOf(seat);
  return i < 0 ? POD_SEATS.length : i;
}

/**
 * The clients somebody carries, THROUGH THE CALLER'S SCOPE.
 *
 * The `allocated` COUNT is already on every row of the table this record opened
 * from, so `clientsHidden` reveals nothing new — the NAMES are what scope
 * protects. An HoD opening a coach's record therefore reads their own bench's
 * clients by name and a count of the rest ("3 more are outside what you can
 * see"), rather than a list that quietly pretends to be the whole book.
 *
 * The scope goes in as a WHERE fragment on the joined client rather than a
 * filter applied to the rows afterwards — `scope.service` states why in full,
 * and the short version is that a clause cannot be forgotten by the query it is
 * part of.
 *
 * ONE ROW PER CLIENT, not per seat, because `allocated` counts DISTINCT clients
 * (`allocatedCounts`): somebody holding two seats on one pod carries one client,
 * and listing both would drive `allocated - clients.length` negative on a record
 * where nothing is hidden at all.
 */
async function allocatedClients(actor: Actor, staffId: string): Promise<StaffClient[]> {
  const scope = await clientScopeWhere(await loadScoper(actor));
  const seats = await prisma.podSeat.findMany({
    where: { staffId, client: scope },
    select: { seat: true, client: { select: { id: true, name: true, status: true } } },
    orderBy: [{ client: { name: 'asc' } }],
  });

  /* insertion order is the query's name-ascending order, and re-setting an
     existing key does not move it — so the two-seat case cannot reshuffle the list */
  const byClient = new Map<string, StaffClient>();
  for (const s of seats) {
    const seen = byClient.get(s.client.id);
    /* which of two seats gets printed is the console's seat order, not whichever
       row the database happened to return first */
    if (seen && seatRank(seen.seat) <= seatRank(s.seat)) continue;
    byClient.set(s.client.id, {
      id: s.client.id,
      name: s.client.name,
      seat: s.seat,
      seatLabel: seatLabel(s.seat),
      status: s.client.status,
    });
  }
  return [...byClient.values()];
}

export async function getStaff(actor: Actor, id: string): Promise<StaffRecord> {
  const all = await listStaff(actor);
  const row = all.find((r) => r.id === id);
  if (!row) throw ApiError.notFound('No such person.');

  const clients = await allocatedClients(actor, row.id);
  return {
    ...row,
    clients,
    /* clamped, because the count and the seats are two queries: a seat assigned
       between them would otherwise report a negative number of hidden clients */
    clientsHidden: Math.max(0, row.allocated - clients.length),
  };
}

/** "Total employees 12 · 1 on leave today" — the headcount card. */
export async function headcount(actor: Actor) {
  const rows = await listStaff(actor);
  return {
    total: rows.length,
    onLeave: rows.filter((r) => r.tags.includes('On leave')).length,
    inactive: rows.filter((r) => r.inactive).length,
  };
}

/* ------------------------------------------------------- deactivation */

/**
 * Switch somebody off.
 *
 * TWO REFUSALS, and both are about leaving the system usable. A Super Admin
 * cannot deactivate THEMSELVES, or the last one out locks the door behind them.
 * And nobody holding a pod seat can be switched off until those clients are
 * reallocated — the alternative is a client whose coach cannot sign in, which is
 * silent and would be discovered by the client.
 */
export async function deactivate(actor: Actor, id: string, ip?: string) {
  if (!(await canManage(actor))) await deny(actor, 'people.deactivate', id);

  if (id === actor.id) {
    throw ApiError.conflict('You cannot switch off your own account.');
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!user) throw ApiError.notFound('No such person.');

  const seats = await prisma.podSeat.findMany({
    where: { staffId: id },
    select: { seat: true, client: { select: { id: true, name: true } } },
  });
  if (seats.length) {
    throw new ApiError(
      409,
      'HAS_SEATS',
      `${user.name} still holds ${seats.length} seat${seats.length === 1 ? '' : 's'}. Reallocate first.`,
      {
        clients: [
          ...new Map(seats.map((s) => [s.client.id, { id: s.client.id, name: s.client.name }])).values(),
        ],
      },
    );
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { status: 'inactive', deactivatedAt: new Date() },
    });
    /* their sessions go with them — an account switched off that keeps a live
       refresh token is switched off in name only */
    await tx.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return updated;
  });

  await audit.record({
    actorId: actor.id,
    action: 'staff.deactivated',
    subjectType: 'user',
    subjectId: id,
    meta: { name: user.name },
    ip: ip ?? null,
  });
  return { id: row.id, inactive: true };
}

export async function reactivate(actor: Actor, id: string, ip?: string) {
  if (!(await canManage(actor))) await deny(actor, 'people.reactivate', id);

  const row = await prisma.user.update({
    where: { id },
    data: { status: 'active', deactivatedAt: null },
  });

  await audit.record({
    actorId: actor.id,
    action: 'staff.reactivated',
    subjectType: 'user',
    subjectId: id,
    meta: { name: row.name },
    ip: ip ?? null,
  });
  return { id: row.id, inactive: false };
}

/** Typed tags, with anything the system already derives removed. */
export function cleanTags(tags: string[]): string[] {
  return stripDerived(tags);
}

/* ------------------------------------------------------------ capacity */

/** One row per seat on the Capacity tab. */
export async function listCapacity() {
  const [rows, roles] = await Promise.all([
    prisma.capacity.findMany({
      include: { staff: { select: { id: true, name: true, role: true, status: true } } },
      orderBy: { staff: { name: 'asc' } },
    }),
    prisma.role.findMany({ select: { key: true, title: true } }),
  ]);
  const titles = new Map(roles.map((r) => [r.key, r.title]));

  return rows
    .filter((c) => c.staff.status === 'active')
    .map((c) => ({
      staffId: c.staffId,
      name: c.staff.name,
      role: c.staff.role as string,
      roleLabel: titles.get(c.staff.role as string) ?? (c.staff.role as string),
      load: c.load,
      cap: c.declared,
      /* derived from the two numbers, never a third that can disagree */
      full: c.load >= c.declared,
    }));
}

export async function setCap(actor: Actor, staffId: string, cap: number, ip?: string) {
  if (!(await canManage(actor))) await deny(actor, 'people.setCap', staffId);

  const before = await prisma.capacity.findUnique({ where: { staffId } });
  if (!before) throw ApiError.notFound('No capacity record for that person.');

  const row = await prisma.capacity.update({ where: { staffId }, data: { declared: cap } });

  await audit.record({
    actorId: actor.id,
    action: 'capacity.cap_changed',
    subjectType: 'user',
    subjectId: staffId,
    meta: { from: before.declared, to: cap, load: row.load },
    ip: ip ?? null,
  });

  /* the allocation picker reads Capacity directly, so this is live on the next
     request — no cache to invalidate, deliberately */
  return { staffId, cap: row.declared, load: row.load, full: row.load >= row.declared };
}

/* ---------------------------------------------------------- the feed */

export async function listFeed(actor: Actor) {
  const [posts, mark, roles] = await Promise.all([
    prisma.teamPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { by: { select: { id: true, name: true, role: true } } },
    }),
    prisma.teamFeedRead.findUnique({ where: { userId: actor.id } }),
    prisma.role.findMany({ select: { key: true, title: true } }),
  ]);
  const titles = new Map(roles.map((r) => [r.key, r.title]));
  const since = mark?.lastSeenAt ?? new Date(0);

  const items = posts.map((p) => ({
    id: p.id,
    tag: p.tag.toLowerCase(),
    text: p.text,
    createdAt: p.createdAt.toISOString(),
    ago: ago(p.createdAt),
    by: p.by
      ? {
          id: p.by.id,
          name: p.by.name,
          roleTitle: titles.get(p.by.role as string) ?? (p.by.role as string),
        }
      : null,
    fresh: p.createdAt > since,
  }));

  return { items, unseen: items.filter((i) => i.fresh).length };
}

export async function post(actor: Actor, input: { text: string; tag: string }, ip?: string) {
  if (!(await can(actor.role, 'broadcast'))) {
    await deny(actor, 'feed.post', null);
  }

  const row = await prisma.teamPost.create({
    data: { byId: actor.id, tag: input.tag.toUpperCase() as never, text: input.text },
  });

  await audit.record({
    actorId: actor.id,
    action: 'feed.posted',
    subjectType: 'teamPost',
    subjectId: row.id,
    meta: { tag: row.tag },
    ip: ip ?? null,
  });

  /*
   * THE HOOK for client announcements. `announceClients` is a different
   * permission reaching a different surface — clients' own threads, from
   * Community — and it is deliberately not this call. A single "announce" that
   * chose its audience from a flag is one mistaken filter away from telling every
   * client something written for the bench.
   */

  return { id: row.id };
}

/**
 * Stamp the reader's mark.
 *
 * A TIMESTAMP rather than a list of ids, unlike HomeSeen: a feed is strictly
 * newest-first and append-only, so "everything before this moment" is the whole
 * answer and costs one row per person forever.
 */
export async function markFeedSeen(actor: Actor) {
  const now = new Date();
  await prisma.teamFeedRead.upsert({
    where: { userId: actor.id },
    create: { userId: actor.id, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
  return { lastSeenAt: now.toISOString() };
}

/** The Home tab badge's number, and the banner's post. */
export async function feedSummary(actor: Actor) {
  const { items, unseen } = await listFeed(actor);
  return { unseen, announcement: items[0] ?? null };
}
