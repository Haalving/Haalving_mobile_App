import { ROLE_GROUPS, clientIdOfPodGroup, podGroupId } from '@haalving/shared';

import { prisma } from '../config/prisma.js';

/**
 * The groups a task can be addressed to.
 *
 * RESOLVED AT READ TIME, never stored. A task holds group IDS, so membership
 * stays live: reallocate a pod and its meetings follow, hire a yoga coach and
 * they inherit the yoga team's standing sessions. A stored member list would be
 * a snapshot of a bench that has since changed, and the meeting would keep
 * inviting somebody who left.
 *
 * The cover-aware seam is `seatHolder` in scope.service — when the leave board
 * lands, a pod group resolves through the cover and every meeting follows the
 * seat rather than the absent person.
 */

export interface ResolvedGroup {
  id: string;
  name: string;
  memberIds: string[];
  /** Present on a pod group, so the console can label it by client. */
  clientId?: string;
  /**
   * May the CALLER book this whole group? Absent when nobody asked — `listGroups()`
   * with no argument answers the old, unscoped question, which is what every read
   * that only wants names still wants.
   */
  bookable?: boolean;
}

/** Active staff only — a group must never invite a departed account. */
async function activeStaff(): Promise<Array<{ id: string; role: string }>> {
  const rows = await prisma.user.findMany({
    where: { status: 'active', role: { not: 'client' } },
    select: { id: true, role: true },
  });
  return rows.map((r) => ({ id: r.id, role: r.role as string }));
}

/**
 * Every group, with its members.
 *
 * A pod group exists for each client who actually has a seat filled — a client
 * with an empty pod would otherwise offer a group that resolves to nobody, and a
 * task addressed to nobody never appears on anyone's grid.
 */
/**
 * The bookable-groups rule: a group is bookable only if EVERY member is.
 *
 * Booking "Fitness team" books four coaches, so a seat that may not put time on a
 * coach's calendar may not do it wholesale either. That means the pillar benches
 * and every client pod go unbookable for anyone but the Super Admin — pods contain
 * coaches by definition — while Operations and Management stay.
 *
 * FLAGGED, NOT FILTERED, for the same reason the staff list is: these names label
 * tiles for tasks somebody else booked, and dropping them would blank those.
 */
export async function listGroups(bookableIds?: Set<string>): Promise<ResolvedGroup[]> {
  const staff = await activeStaff();
  const mark = (memberIds: string[]) =>
    !bookableIds || memberIds.every((id) => bookableIds.has(id));

  const out: ResolvedGroup[] = ROLE_GROUPS.map((g) => {
    const memberIds = staff.filter((u) => !g.roles || g.roles.includes(u.role)).map((u) => u.id);
    return { id: g.id, name: g.name, memberIds, bookable: mark(memberIds) };
  });

  const clients = await prisma.client.findMany({
    where: { pod: { some: { staffId: { not: null } } } },
    select: { id: true, name: true, pod: { select: { staffId: true } } },
    orderBy: { name: 'asc' },
  });

  for (const c of clients) {
    const memberIds = [
      ...new Set(c.pod.map((p) => p.staffId).filter((v): v is string => !!v)),
    ];
    out.push({
      id: podGroupId(c.id),
      /* the demo labels it by FIRST name — "Rajesh's pod" */
      name: `${c.name.split(' ')[0]}’s pod`,
      memberIds,
      clientId: c.id,
      bookable: mark(memberIds),
    });
  }

  return out;
}

/** One group's members. Unknown groups resolve to nobody rather than throwing. */
export async function resolve(groupId: string): Promise<string[]> {
  const roleGroup = ROLE_GROUPS.find((g) => g.id === groupId);
  if (roleGroup) {
    const staff = await activeStaff();
    return staff.filter((u) => !roleGroup.roles || roleGroup.roles.includes(u.role)).map((u) => u.id);
  }

  const clientId = clientIdOfPodGroup(groupId);
  if (!clientId) return [];

  const seats = await prisma.podSeat.findMany({
    where: { clientId, staffId: { not: null } },
    select: { staffId: true },
  });
  return [...new Set(seats.map((s) => s.staffId).filter((v): v is string => !!v))];
}

/**
 * Resolve many groups at once, deduped.
 *
 * The grid asks this for every task on the page, so it is one query per distinct
 * group rather than one per task — a week of a pod's meetings would otherwise be
 * fourteen identical lookups.
 */
export async function resolveMany(groupIds: string[]): Promise<Map<string, string[]>> {
  const unique = [...new Set(groupIds)];
  const out = new Map<string, string[]>();
  if (!unique.length) return out;

  const all = await listGroups();
  const byId = new Map(all.map((g) => [g.id, g.memberIds]));
  for (const id of unique) out.set(id, byId.get(id) ?? []);
  return out;
}

/**
 * Everyone bound to a task: the named individuals plus every group's members,
 * deduped.
 *
 * `taskPeople` in the demo. The order matters only for display, so the named
 * assignees come first — they are the people the task was actually written for.
 */
export function peopleOfTask(
  assigneeIds: string[],
  groupIds: string[],
  groups: Map<string, string[]>,
): string[] {
  const out = [...assigneeIds];
  for (const g of groupIds) {
    for (const id of groups.get(g) ?? []) if (!out.includes(id)) out.push(id);
  }
  return out;
}
