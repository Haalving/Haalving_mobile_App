import { WD, availWindows, type SchedUser } from './conflicts.js';
import { NAV_ITEMS, NAV_KEYS, PERMS, type NavKey, type Perm } from './rbac.js';

/**
 * People & Access — the vocabulary the page names things with.
 *
 * Ported from `console-people.js`. The MATRIX itself is not here: it lives in
 * `rbac.ts` and, at runtime, in the Role table. This file is labels and derived
 * facts — the human words for a permission key, and the tags a person's record
 * implies rather than states.
 */

/**
 * The display label for every permission key.
 *
 * KEYS NEVER CHANGE; only these labels are human text. Renaming a key orphans it
 * in every stored Role row and silently removes access — which is why `broadcast`
 * keeps its name even though its label had to grow to tell it apart from
 * `announceClients`: one posts to the STAFF feed on this page, the other reaches
 * clients' own threads from Community.
 */
export const PERM_LABELS: Record<string, string> = {
  seeAllClients: 'See all clients',
  seeDeptClients: 'See department clients',
  approve: 'Sign approvals',
  allocate: 'Allocate team',
  overrideCapacity: 'Override capacity',
  editRules: 'Edit rules',
  finalizeLevel: 'Finalize levels',
  sendDigest: 'Bulk-send digest',
  keyInBody: 'Key in body records',
  rawRecords: 'Raw medical records',
  signSummary: 'Sign health summaries',
  rateMeals: 'Rate meals',
  buildDiet: 'Build diets',
  buildCharts: 'Build charts',
  editCatalog: 'Edit own catalog',
  editAnyCatalog: 'Edit all catalogs',
  editTemplates: 'Edit templates',
  assignPlan: 'Assign client plans',
  manageTribe: 'Manage community',
  assignPod: 'Assign pod seats',
  broadcast: 'Post team announcements',
  announceClients: 'Announce to clients',
  approveLeave: 'Approve leave',
  reassignLeave: 'Run leave reallocation',
  /* the five this port added beyond the demo's matrix. Without a line here the
     People & Access chip prints the raw key, which is how a permission ends up
     looking like a leftover to whoever has to grant it. */
  ownsOnboarding: 'Run onboarding',
  seeAllDeviations: 'See all deviations',
  bookAnyone: 'Book anyone’s calendar',
  approveCommunity: 'Approve community content',
  managePeople: 'Manage people & roles',
  manageConfig: 'Manage configuration',
  /* the door into any session room, including client sessions nobody put this
     person on. Everyone else reaches a room by being ON the task, so this is the
     one seat that needs a perm rather than a participant test — and it is a perm,
     not a role literal, so the matrix can move it. */
  joinAnySession: 'Join any session',
};

export function permLabel(key: string): string {
  return PERM_LABELS[key] ?? key;
}

/**
 * The sidebar's own labels, read from NAV_ITEMS rather than restated.
 *
 * The chip row on the Roles tab and the sidebar itself must never disagree about
 * what an item is called, and there is only one way to guarantee that.
 */
export const NAV_LABELS: Record<string, string> = Object.fromEntries(
  NAV_KEYS.map((k) => [k, NAV_ITEMS[k].label]),
);

export function navLabel(key: string): string {
  return NAV_LABELS[key] ?? key;
}

/** A permission the matrix knows about. Anything else is refused at the edge. */
export function isPerm(v: string): v is Perm {
  return (PERMS as readonly string[]).includes(v);
}

export function isNavKey(v: string): v is NavKey {
  return (NAV_KEYS as readonly string[]).includes(v);
}

/* ------------------------------------------------------------ the guard */

/**
 * THE NO-LOCKOUT GUARD.
 *
 * These two seats on the admin role can never be switched off, or a Super Admin
 * could strand every seat — including their own — with nobody left who can open
 * this page to undo it. The console renders the chips disabled; the API refuses
 * as well, because a disabled chip is a hint and this is the rule.
 */
export function isGuardedNav(roleKey: string, navId: string): boolean {
  return roleKey === 'admin' && navId === 'people';
}

export function isGuardedPerm(roleKey: string, permId: string): boolean {
  return roleKey === 'admin' && permId === 'managePeople';
}

/* ------------------------------------------------------------- the seat */

/** `L1 · senior`, `L2`. Level 2 is the bench that covers for others. */
export const LEVELS: Record<number, string> = {
  1: 'L1 · senior',
  2: 'L2',
};

export const LEVEL_KEYS = [1, 2] as const;

export function levelLabel(level: number | null | undefined): string {
  return level ? (LEVELS[level] ?? `L${level}`) : '—';
}

/* -------------------------------------------------------------- the tags */

/**
 * The six tags a record IMPLIES. Computed, never stored.
 *
 * A stored `Unallocated` would be wrong the moment somebody was given a client,
 * and nobody would think to clear it. Typed tags — "First aid certified" — are
 * the opposite: they are facts only a human knows, and those are stored.
 */
export const DERIVED_TAGS = [
  'New joinee',
  'Bench cover',
  'On leave',
  'Unallocated',
  'Split shift',
  'Inactive',
] as const;

export type DerivedTag = (typeof DERIVED_TAGS)[number];

/** Half a year, near enough — the demo's own number. */
export const NEW_JOINEE_DAYS = 183;

export function isDerivedTag(tag: string): boolean {
  return (DERIVED_TAGS as readonly string[]).includes(tag);
}

/**
 * Drop anything a person typed that the system already derives.
 *
 * Silently storing "On leave" would produce a tag that never clears and a filter
 * that lies — the chip would keep matching after the leave ended. The console
 * says so in an italic note rather than refusing the whole save.
 */
export function stripDerived(tags: string[]): string[] {
  return tags.map((t) => t.trim()).filter((t) => t.length > 0 && !isDerivedTag(t));
}

export interface TagSubject {
  /** ISO date, or null when it was never recorded. */
  joinedAt?: string | null;
  level?: number | null;
  /** The declared week, in the `avail` vocabulary. */
  avail?: SchedUser['avail'];
  inactive?: boolean;
}

export interface TagFacts {
  onLeaveToday: boolean;
  allocatedCount: number;
  /** Injected so a test can move the clock. */
  now?: Date;
}

function daysSince(isoDate: string, now: Date): number {
  const then = Date.parse(`${isoDate}T00:00:00`);
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/**
 * The tags this record implies today.
 *
 * PURE: the two facts it cannot know — whether they are on leave, and how many
 * clients they carry — are passed in, so the same function runs in the service
 * and in a test that has moved the clock.
 */
export function derivedTags(u: TagSubject, facts: TagFacts): string[] {
  const now = facts.now ?? new Date();
  const out: string[] = [];

  if (u.joinedAt) {
    const d = daysSince(u.joinedAt, now);
    /* `d >= 0` matters: a joining date in the FUTURE is somebody who has not
       started, not somebody who joined a very long time ago */
    if (d >= 0 && d < NEW_JOINEE_DAYS) out.push('New joinee');
  }
  if (Number(u.level) === 2) out.push('Bench cover');
  if (facts.onLeaveToday) out.push('On leave');
  if (!facts.allocatedCount) out.push('Unallocated');
  if (WD.some((k) => availWindows({ id: '', name: '', avail: u.avail }, k).length > 1)) {
    out.push('Split shift');
  }
  if (u.inactive) out.push('Inactive');

  return out;
}

/** Derived first, then the typed ones — the order the demo's chips read in. */
export function allTags(u: TagSubject, typed: string[], facts: TagFacts): string[] {
  return [...derivedTags(u, facts), ...typed];
}

/** The tone a tag's pill wears. Only three, and only these. */
export function tagTone(tag: string): 'warn' | 'info' | 'neutral' {
  if (tag === 'On leave' || tag === 'Unallocated') return 'warn';
  if (tag === 'New joinee') return 'info';
  return 'neutral';
}

/* ---------------------------------------------------------- the feed */

export const FEED_TAGS = ['general', 'policy', 'holiday'] as const;
export type FeedTag = (typeof FEED_TAGS)[number];

export const FEED_TAG_LABEL: Record<FeedTag, string> = {
  general: 'General',
  policy: 'Policy',
  holiday: 'Holiday',
};

/** Holiday reads as good news, policy as information, anything else as neutral. */
export function feedTagTone(tag: string): 'ok' | 'info' | 'neutral' {
  if (tag === 'holiday') return 'ok';
  if (tag === 'policy') return 'info';
  return 'neutral';
}

/**
 * `3 d ago` — the demo's `agoHtml`.
 *
 * Coarse on purpose: a team feed is read in glances, and "2 days ago" is the
 * answer somebody wants rather than "51 hours".
 */
export function ago(from: Date | string, now: Date = new Date()): string {
  const then = typeof from === 'string' ? new Date(from) : from;
  const mins = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}
