import { describe, expect, it } from 'vitest';

import {
  DERIVED_TAGS,
  NAV_LABELS,
  NEW_JOINEE_DAYS,
  PERM_LABELS,
  allTags,
  ago,
  derivedTags,
  feedTagTone,
  isDerivedTag,
  isGuardedNav,
  isGuardedPerm,
  levelLabel,
  navLabel,
  permLabel,
  stripDerived,
  tagTone,
  type TagSubject,
} from '../src/people.js';
import { NAV_KEYS, PERMS, ROLES } from '../src/rbac.js';

/**
 * The derived tags, the no-lockout guard, and the labels.
 *
 * The tags are the interesting half: each has to fire on exactly its own
 * condition and nothing else, because they are also the Staff tab's FILTERS — a
 * tag that fires loosely hides people from a search that says it will find them.
 */

/** A record that triggers nothing at all: joined long ago, L1, single shifts. */
const plain: TagSubject = {
  joinedAt: '2020-01-01',
  level: 1,
  avail: { mon: ['09:00', '17:00'] },
  inactive: false,
};

const NOW = new Date(2026, 7, 28, 12, 0, 0);
const facts = (over: Partial<{ onLeaveToday: boolean; allocatedCount: number }> = {}) => ({
  onLeaveToday: false,
  allocatedCount: 3,
  now: NOW,
  ...over,
});

describe('derivedTags — each fires on exactly its condition', () => {
  it('gives a settled, allocated, single-shift L1 nothing at all', () => {
    expect(derivedTags(plain, facts())).toEqual([]);
  });

  it('New joinee — inside the window, and not a day beyond it', () => {
    const inside = { ...plain, joinedAt: '2026-08-01' };
    expect(derivedTags(inside, facts())).toContain('New joinee');

    /* exactly 183 days is OUT: the window is "fewer than", as the demo has it */
    const boundary = { ...plain, joinedAt: '2026-02-26' };
    const days = Math.floor(
      (NOW.getTime() - Date.parse('2026-02-26T00:00:00')) / 86_400_000,
    );
    expect(days).toBe(NEW_JOINEE_DAYS);
    expect(derivedTags(boundary, facts())).not.toContain('New joinee');
  });

  it('New joinee — a future joining date is somebody who has not started', () => {
    const notYet = { ...plain, joinedAt: '2026-12-01' };
    expect(derivedTags(notYet, facts())).not.toContain('New joinee');
  });

  it('New joinee — never, with no joining date recorded', () => {
    const unknown = { ...plain, joinedAt: null };
    expect(derivedTags(unknown, facts())).not.toContain('New joinee');
  });

  it('Bench cover — level 2 only', () => {
    expect(derivedTags({ ...plain, level: 2 }, facts())).toContain('Bench cover');
    expect(derivedTags({ ...plain, level: 1 }, facts())).not.toContain('Bench cover');
    expect(derivedTags({ ...plain, level: null }, facts())).not.toContain('Bench cover');
  });

  it('On leave — from the fact it is handed, never guessed', () => {
    expect(derivedTags(plain, facts({ onLeaveToday: true }))).toContain('On leave');
    expect(derivedTags(plain, facts({ onLeaveToday: false }))).not.toContain('On leave');
  });

  it('Unallocated — zero seats, and only zero', () => {
    expect(derivedTags(plain, facts({ allocatedCount: 0 }))).toContain('Unallocated');
    expect(derivedTags(plain, facts({ allocatedCount: 1 }))).not.toContain('Unallocated');
  });

  it('Split shift — any day with two windows', () => {
    const split: TagSubject = {
      ...plain,
      avail: { mon: [['06:00', '10:00'], ['17:00', '21:00']] },
    };
    expect(derivedTags(split, facts())).toContain('Split shift');
    /* one window on every day is not a split, however many days there are */
    const many: TagSubject = {
      ...plain,
      avail: { mon: ['09:00', '17:00'], tue: ['09:00', '17:00'], sat: ['08:00', '12:00'] },
    };
    expect(derivedTags(many, facts())).not.toContain('Split shift');
  });

  it('Split shift — a day off is not a split', () => {
    const withOff: TagSubject = { ...plain, avail: { mon: ['09:00', '17:00'], sun: null } };
    expect(derivedTags(withOff, facts())).not.toContain('Split shift');
  });

  it('Inactive — from the flag', () => {
    expect(derivedTags({ ...plain, inactive: true }, facts())).toContain('Inactive');
    expect(derivedTags(plain, facts())).not.toContain('Inactive');
  });

  it('stacks them all, in the declared order', () => {
    const everything: TagSubject = {
      joinedAt: '2026-08-20',
      level: 2,
      avail: { mon: [['06:00', '10:00'], ['17:00', '21:00']] },
      inactive: true,
    };
    expect(derivedTags(everything, facts({ onLeaveToday: true, allocatedCount: 0 }))).toEqual([
      'New joinee',
      'Bench cover',
      'On leave',
      'Unallocated',
      'Split shift',
      'Inactive',
    ]);
  });

  it('puts derived tags before typed ones', () => {
    expect(allTags({ ...plain, level: 2 }, ['First aid certified'], facts())).toEqual([
      'Bench cover',
      'First aid certified',
    ]);
  });
});

describe('typed tags', () => {
  it('drops anything the system already derives', () => {
    expect(stripDerived(['First aid certified', 'On leave', 'Unallocated'])).toEqual([
      'First aid certified',
    ]);
  });

  it('trims, and drops what is left empty', () => {
    expect(stripDerived(['  Mentor  ', '   ', ''])).toEqual(['Mentor']);
  });

  it('knows every derived name', () => {
    for (const t of DERIVED_TAGS) expect(isDerivedTag(t)).toBe(true);
    expect(isDerivedTag('First aid certified')).toBe(false);
  });

  it('tones only three ways', () => {
    expect(tagTone('On leave')).toBe('warn');
    expect(tagTone('Unallocated')).toBe('warn');
    expect(tagTone('New joinee')).toBe('info');
    expect(tagTone('Bench cover')).toBe('neutral');
    expect(tagTone('Anything else')).toBe('neutral');
  });
});

describe('the no-lockout guard', () => {
  it('pins the People nav and managePeople on admin', () => {
    expect(isGuardedNav('admin', 'people')).toBe(true);
    expect(isGuardedPerm('admin', 'managePeople')).toBe(true);
  });

  it('guards nothing else, on admin or on any other role', () => {
    expect(isGuardedNav('admin', 'clients')).toBe(false);
    expect(isGuardedPerm('admin', 'allocate')).toBe(false);
    expect(isGuardedNav('opshead', 'people')).toBe(false);
    expect(isGuardedPerm('core', 'managePeople')).toBe(false);
  });

  /* the guard is only meaningful while admin actually holds both */
  it('guards seats the admin role really has', () => {
    expect(ROLES.admin?.nav).toContain('people');
    expect(ROLES.admin?.perms).toContain('managePeople');
  });
});

describe('the labels', () => {
  it('names every permission in the matrix', () => {
    for (const p of PERMS) {
      expect(PERM_LABELS[p], `no label for ${p}`).toBeTruthy();
      expect(permLabel(p)).not.toBe(p);
    }
  });

  it('names every nav item, from NAV_ITEMS rather than a second list', () => {
    for (const k of NAV_KEYS) expect(NAV_LABELS[k]).toBeTruthy();
    expect(navLabel('people')).toBe('People & Access');
  });

  it('falls back to the key rather than rendering blank', () => {
    expect(permLabel('somethingNew')).toBe('somethingNew');
    expect(navLabel('somethingNew')).toBe('somethingNew');
  });

  it('labels the two levels', () => {
    expect(levelLabel(1)).toBe('L1 · senior');
    expect(levelLabel(2)).toBe('L2');
    expect(levelLabel(null)).toBe('—');
  });

  it('tones the feed tags', () => {
    expect(feedTagTone('holiday')).toBe('ok');
    expect(feedTagTone('policy')).toBe('info');
    expect(feedTagTone('general')).toBe('neutral');
  });
});

describe('ago', () => {
  const now = new Date(2026, 7, 28, 12, 0, 0);
  const minus = (mins: number) => new Date(now.getTime() - mins * 60_000);

  it('reads coarsely, the way a feed is glanced at', () => {
    expect(ago(minus(0), now)).toBe('just now');
    expect(ago(minus(5), now)).toBe('5 m ago');
    expect(ago(minus(90), now)).toBe('1 h ago');
    expect(ago(minus(60 * 26), now)).toBe('1 d ago');
    expect(ago(minus(60 * 24 * 3), now)).toBe('3 d ago');
  });

  it('never reads negative when a clock is a little ahead', () => {
    expect(ago(new Date(now.getTime() + 5_000), now)).toBe('just now');
  });
});
