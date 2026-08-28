import type { Conflict } from './conflicts.js';

/**
 * Time & Cover — the four steps a leave walks, and who can take the seat.
 *
 * Ported from `console-leave.js`. THE STATE MACHINE LIVES HERE and is applied by
 * the service; the web never decides a status. That matters more than usual on
 * this page, because the interesting transition is not the approval — it is the
 * one that goes BACKWARDS.
 *
 *   REASSIGN ──plan submitted──► ACCEPT ──all covers accept──► PENDING ──sign──► APPROVED
 *       ▲                          │                                              │
 *       └────any cover declines────┘                                              └──► DECLINED
 *
 * A HoD picking a name from a dropdown is not the same as that coach agreeing to
 * work the morning (TJ, 17 Aug 2026). So every named cover accepts before the
 * approver ever sees it, and ANY decline sends the whole plan back to the board —
 * without that route back, a decline strands the leave in a state with no button
 * anywhere.
 */

export const LEAVE_STATUSES = [
  'REASSIGN',
  'ACCEPT',
  'PENDING',
  'APPROVED',
  'DECLINED',
  'WITHDRAWN',
] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  REASSIGN: 'Cover plan due',
  ACCEPT: 'Waiting on covers',
  PENDING: 'Waiting on approval',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
};

export function leaveStatusTone(s: LeaveStatus): 'ok' | 'bad' | 'warn' | 'info' | 'neutral' {
  if (s === 'APPROVED') return 'ok';
  if (s === 'DECLINED') return 'bad';
  if (s === 'REASSIGN') return 'warn';
  if (s === 'WITHDRAWN') return 'neutral';
  return 'info';
}

/** A status the applicant may still walk away from. */
export function canWithdraw(s: LeaveStatus): boolean {
  return s === 'REASSIGN' || s === 'ACCEPT' || s === 'PENDING';
}

/* ------------------------------------------------------------- windows */

export interface DateWindow {
  from: string;
  to: string;
}

/** Inclusive on both ends — a one-day leave has `from === to`. */
export function overlaps(a: DateWindow, b: DateWindow): boolean {
  return a.from <= b.to && b.from <= a.to;
}

export interface LeaveLike extends DateWindow {
  staffId: string;
  status: LeaveStatus;
}

/**
 * Is this person on APPROVED leave across any part of the window?
 *
 * Approved only. A pending application is not yet a fact about somebody's diary,
 * and treating it as one would remove people from the bench for leave that may
 * still be declined.
 */
export function onApprovedLeave(staffId: string, window: DateWindow, leaves: LeaveLike[]): boolean {
  return leaves.some(
    (l) => l.staffId === staffId && l.status === 'APPROVED' && overlaps(l, window),
  );
}

/* --------------------------------------------------------------- bench */

export interface BenchMember {
  id: string;
  name: string;
  role: string;
  dept?: string | null;
  level?: number | null;
}

/**
 * Who can take the seat.
 *
 * Department members, minus the applicant, minus anyone already on approved leave
 * across the window. SAME LEVEL FIRST — an L1's clients should be offered another
 * L1 before the bench cover, and the order of a select is the recommendation
 * nobody reads as one.
 *
 * This does NOT filter on whether they are busy. A coach booked solid across the
 * window is still a legitimate choice a human might make after moving something;
 * `benchLoad` says so in words instead, so the board informs rather than decides.
 */
export function bench(
  applicant: BenchMember,
  members: BenchMember[],
  leaves: LeaveLike[],
  window: DateWindow,
): BenchMember[] {
  return members
    .filter((u) => u.id !== applicant.id && !onApprovedLeave(u.id, window, leaves))
    .sort((a, b) => {
      const sa = a.level === applicant.level ? 0 : 1;
      const sb = b.level === applicant.level ? 0 : 1;
      return sa - sb || (a.level ?? 9) - (b.level ?? 9) || a.name.localeCompare(b.name);
    });
}

export interface BenchLoad {
  free: number;
  clashes: number;
  total: number;
}

/** How much of the window this person could actually take. */
export function benchLoad(clashesPerSession: boolean[]): BenchLoad {
  const clashes = clashesPerSession.filter(Boolean).length;
  return { free: clashesPerSession.length - clashes, clashes, total: clashesPerSession.length };
}

/** ` · free for all 4`, ` · 2 of 4 clash`. Empty when there is nothing to take. */
export function loadWords(load: BenchLoad): string {
  if (!load.total) return '';
  if (load.clashes === 0) return ` · free for all ${load.total}`;
  if (load.free === 0) return ` · clashes with all ${load.total}`;
  return ` · ${load.clashes} of ${load.total} clash`;
}

/* ------------------------------------------------- why somebody cannot */

export type CoverReason = 'free' | 'already booked' | 'on leave' | 'outside their hours';

/**
 * Why this candidate cannot take that session, in the board's own words.
 *
 * ORDERED BY WHAT STOPS YOU. Being booked is a hard clash, being on leave is a
 * harder one, and being outside declared hours is the only case a human may
 * reasonably override — so it is reported last and, per rule 4, allowed.
 */
export function whyNot(conflicts: Conflict[]): CoverReason {
  if (!conflicts.length) return 'free';
  if (conflicts.some((c) => c.type === 'busy')) return 'already booked';
  if (conflicts.some((c) => c.type === 'leave')) return 'on leave';
  return 'outside their hours';
}

/** The same reading, addressed to the person being asked. */
export function coverPillText(conflicts: Conflict[]): {
  label: string;
  tone: 'ok' | 'bad' | 'warn';
} {
  if (!conflicts.length) return { label: 'You are free', tone: 'ok' };
  if (conflicts.some((c) => c.type === 'busy')) return { label: 'Clashes for you', tone: 'bad' };
  if (conflicts.some((c) => c.type === 'leave')) return { label: 'You are on leave', tone: 'bad' };
  return { label: 'Outside your hours', tone: 'warn' };
}

/** A cover that would be REFUSED by rule 4 — hours may be overridden, these not. */
export function isHardClash(conflicts: Conflict[]): boolean {
  return conflicts.some((c) => c.type === 'busy' || c.type === 'leave');
}

/* -------------------------------------------------------- the machine */

export type CoverResponseState = 'PENDING' | 'ACCEPTED' | 'DECLINED';

/**
 * Where the application stands after one person answers.
 *
 * The LAST acceptance moves it on; ANY decline sends the whole plan back. Note
 * that a decline returns REASSIGN even when others have already accepted — their
 * answers are discarded with the plan, because a plan is a whole arrangement and
 * half of one covers nobody.
 */
export function nextStatusAfterResponse(
  responses: Record<string, CoverResponseState>,
): LeaveStatus {
  const states = Object.values(responses);
  if (states.some((s) => s === 'DECLINED')) return 'REASSIGN';
  if (states.length > 0 && states.every((s) => s === 'ACCEPTED')) return 'PENDING';
  return 'ACCEPT';
}

/**
 * Where it stands the moment a board is submitted.
 *
 * A leave needing NO cover — nobody rides the seat and nothing is booked — skips
 * the accept step entirely rather than waiting on an empty set of acceptances,
 * which would never arrive.
 */
export function statusAfterPlan(namedCoverCount: number): LeaveStatus {
  return namedCoverCount > 0 ? 'ACCEPT' : 'PENDING';
}

/* --------------------------------------------------------- the cover */

export interface CoverWindow extends DateWindow {
  coverId: string;
}

/**
 * Is this cover the one in force today?
 *
 * COVERS SWITCH ON AND OFF BY DATE ALONE. There is no job that activates one in
 * the morning and retires it at night — the window is read at the moment somebody
 * asks, so a cover cannot be left switched on by a sweep that failed to run.
 */
export function coverActive(cover: CoverWindow | null | undefined, todayISO: string): boolean {
  return !!cover && cover.from <= todayISO && todayISO <= cover.to;
}

/**
 * Who actually holds this seat today.
 *
 * THE ONE RESOLVER. Every module that wants "the current responsible person"
 * comes through here — the client list's scope, the Schedule's groups, the
 * Onboarding capacity picker and the Attention tab — because the alternative is
 * each of them reading `PodSeat.staffId` and quietly disagreeing with the others
 * about who is on duty this week.
 */
export function staffForSeat(
  ownerId: string | null,
  covers: CoverWindow[],
  todayISO: string,
): string | null {
  const active = covers.find((c) => coverActive(c, todayISO));
  return active ? active.coverId : ownerId;
}

/* ----------------------------------------------------------- history */

export const LEAVE_ACTS = [
  'APPLIED',
  'REASSIGNED',
  'COVER_ACCEPTED',
  'COVER_DECLINED',
  'APPROVED',
  'DECLINED',
  'WITHDRAWN',
] as const;

export type LeaveAct = (typeof LEAVE_ACTS)[number];

/** The demo's `ACT_LABELS`, for the `.audit` lines under an application. */
export const ACT_LABELS: Record<LeaveAct, string> = {
  APPLIED: 'applied',
  REASSIGNED: 'cover planned',
  COVER_ACCEPTED: 'cover accepted',
  COVER_DECLINED: 'cover declined',
  APPROVED: 'approved',
  DECLINED: 'declined',
  WITHDRAWN: 'withdrawn',
};
