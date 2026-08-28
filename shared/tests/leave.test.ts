import { describe, expect, it } from 'vitest';

import {
  ACT_LABELS,
  LEAVE_ACTS,
  benchLoad,
  bench,
  canWithdraw,
  coverActive,
  coverPillText,
  isHardClash,
  leaveStatusTone,
  loadWords,
  nextStatusAfterResponse,
  onApprovedLeave,
  overlaps,
  staffForSeat,
  statusAfterPlan,
  whyNot,
  type BenchMember,
  type CoverResponseState,
  type LeaveLike,
} from '../src/leave.js';
import type { Conflict } from '../src/conflicts.js';

/**
 * The bench, the four steps, and the date-only cover.
 *
 * The transition worth the most attention is the one that goes BACKWARDS: a
 * decline has to send the whole plan back, or the leave strands in a state with
 * no button anywhere.
 */

const WINDOW = { from: '2026-08-30', to: '2026-09-01' };

const vikram: BenchMember = { id: 'u-vikram', name: 'Vikram S.', role: 'fitness', dept: 'fitness', level: 1 };
const arjun: BenchMember = { id: 'u-arjun', name: 'Arjun Nair', role: 'fitness', dept: 'fitness', level: 1 };
const nikhil: BenchMember = { id: 'u-nikhil', name: 'Nikhil P.', role: 'fitness', dept: 'fitness', level: 2 };
const bala: BenchMember = { id: 'u-bala', name: 'Bala K.', role: 'fitness', dept: 'fitness', level: 1 };

const members = [vikram, nikhil, arjun, bala];

const conflict = (type: Conflict['type']): Conflict[] => [
  { type, whoId: 'u-x', who: 'X', detail: 'something' },
];

describe('overlaps', () => {
  it('is inclusive at both ends', () => {
    expect(overlaps({ from: '2026-08-30', to: '2026-09-01' }, { from: '2026-09-01', to: '2026-09-05' })).toBe(true);
    expect(overlaps({ from: '2026-08-30', to: '2026-09-01' }, { from: '2026-09-02', to: '2026-09-05' })).toBe(false);
    /* a single day touching the far end still overlaps */
    expect(overlaps({ from: '2026-08-30', to: '2026-08-30' }, { from: '2026-08-30', to: '2026-08-30' })).toBe(true);
  });
});

describe('onApprovedLeave', () => {
  const leaves: LeaveLike[] = [
    { staffId: 'u-nikhil', status: 'APPROVED', from: '2026-08-31', to: '2026-09-02' },
    { staffId: 'u-bala', status: 'PENDING', from: '2026-08-30', to: '2026-09-01' },
  ];

  it('counts an approved overlap', () => {
    expect(onApprovedLeave('u-nikhil', WINDOW, leaves)).toBe(true);
  });

  /* a PENDING application is not yet a fact about somebody's diary */
  it('ignores anything not approved', () => {
    expect(onApprovedLeave('u-bala', WINDOW, leaves)).toBe(false);
  });

  it('ignores an approved leave that does not overlap', () => {
    expect(
      onApprovedLeave('u-nikhil', { from: '2026-10-01', to: '2026-10-02' }, leaves),
    ).toBe(false);
  });
});

describe('bench', () => {
  it('excludes the applicant', () => {
    expect(bench(vikram, members, [], WINDOW).map((m) => m.id)).not.toContain('u-vikram');
  });

  it('excludes anyone on approved leave across the window', () => {
    const leaves: LeaveLike[] = [
      { staffId: 'u-arjun', status: 'APPROVED', from: '2026-08-31', to: '2026-09-05' },
    ];
    expect(bench(vikram, members, leaves, WINDOW).map((m) => m.id)).toEqual(['u-bala', 'u-nikhil']);
  });

  it('sorts the applicant’s own level first, then by level, then by name', () => {
    /* Vikram is L1: Arjun and Bala (both L1) come before Nikhil (L2), and the two
       L1s are alphabetical */
    expect(bench(vikram, members, [], WINDOW).map((m) => m.name)).toEqual([
      'Arjun Nair',
      'Bala K.',
      'Nikhil P.',
    ]);
  });

  it('puts the other L2s first for an L2 applicant', () => {
    const alsoL2: BenchMember = { ...bala, id: 'u-l2', name: 'Zoe L.', level: 2 };
    const out = bench(nikhil, [...members, alsoL2], [], WINDOW);
    expect(out[0]!.id).toBe('u-l2');
  });

  /*
   * DELIBERATELY NOT FILTERED ON BUSY. A coach booked solid is still a choice a
   * human might make after moving something; `loadWords` says so instead, so the
   * board informs rather than decides.
   */
  it('keeps somebody who is busy, and lets loadWords say so', () => {
    expect(bench(vikram, members, [], WINDOW).map((m) => m.id)).toContain('u-arjun');
    expect(loadWords(benchLoad([true, true, true, true]))).toBe(' · clashes with all 4');
  });
});

describe('benchLoad and loadWords', () => {
  it('reads the three cases the demo words', () => {
    expect(loadWords(benchLoad([false, false, false, false]))).toBe(' · free for all 4');
    expect(loadWords(benchLoad([true, true, false, false]))).toBe(' · 2 of 4 clash');
    expect(loadWords(benchLoad([true, true]))).toBe(' · clashes with all 2');
  });

  it('says nothing when there is nothing to take', () => {
    expect(loadWords(benchLoad([]))).toBe('');
  });

  it('counts', () => {
    expect(benchLoad([true, false, false])).toEqual({ free: 2, clashes: 1, total: 3 });
  });
});

describe('whyNot', () => {
  it('reads busy before leave before hours', () => {
    expect(whyNot([])).toBe('free');
    expect(whyNot(conflict('busy'))).toBe('already booked');
    expect(whyNot(conflict('leave'))).toBe('on leave');
    expect(whyNot(conflict('hours'))).toBe('outside their hours');
  });

  it('reports the hardest reason when there is more than one', () => {
    expect(whyNot([...conflict('hours'), ...conflict('busy')])).toBe('already booked');
    expect(whyNot([...conflict('hours'), ...conflict('leave')])).toBe('on leave');
  });

  it('separates what rule 4 refuses from what it merely reports', () => {
    expect(isHardClash(conflict('busy'))).toBe(true);
    expect(isHardClash(conflict('leave'))).toBe(true);
    /* outside declared hours is the one a human may override */
    expect(isHardClash(conflict('hours'))).toBe(false);
    expect(isHardClash([])).toBe(false);
  });

  it('addresses the same reading to the person being asked', () => {
    expect(coverPillText([])).toEqual({ label: 'You are free', tone: 'ok' });
    expect(coverPillText(conflict('busy'))).toEqual({ label: 'Clashes for you', tone: 'bad' });
    expect(coverPillText(conflict('leave'))).toEqual({ label: 'You are on leave', tone: 'bad' });
    expect(coverPillText(conflict('hours'))).toEqual({ label: 'Outside your hours', tone: 'warn' });
  });
});

describe('the state machine', () => {
  const R = (o: Record<string, CoverResponseState>) => o;

  it('waits while anybody has not answered', () => {
    expect(nextStatusAfterResponse(R({ a: 'ACCEPTED', b: 'PENDING' }))).toBe('ACCEPT');
  });

  it('moves on when the LAST acceptance lands', () => {
    expect(nextStatusAfterResponse(R({ a: 'ACCEPTED', b: 'ACCEPTED' }))).toBe('PENDING');
    expect(nextStatusAfterResponse(R({ a: 'ACCEPTED' }))).toBe('PENDING');
  });

  it('sends the WHOLE plan back on a single decline', () => {
    expect(nextStatusAfterResponse(R({ a: 'DECLINED' }))).toBe('REASSIGN');
    /* even when everybody else had already said yes — a plan is one arrangement,
       and half of one covers nobody */
    expect(nextStatusAfterResponse(R({ a: 'ACCEPTED', b: 'ACCEPTED', c: 'DECLINED' }))).toBe(
      'REASSIGN',
    );
  });

  it('never reads an empty response set as complete', () => {
    expect(nextStatusAfterResponse({})).toBe('ACCEPT');
  });

  it('skips the accept step when nobody needs to cover anything', () => {
    expect(statusAfterPlan(0)).toBe('PENDING');
    expect(statusAfterPlan(1)).toBe('ACCEPT');
  });

  it('lets the applicant walk away until it is decided', () => {
    expect(canWithdraw('REASSIGN')).toBe(true);
    expect(canWithdraw('ACCEPT')).toBe(true);
    expect(canWithdraw('PENDING')).toBe(true);
    expect(canWithdraw('APPROVED')).toBe(false);
    expect(canWithdraw('DECLINED')).toBe(false);
  });

  it('tones each status once', () => {
    expect(leaveStatusTone('APPROVED')).toBe('ok');
    expect(leaveStatusTone('DECLINED')).toBe('bad');
    expect(leaveStatusTone('REASSIGN')).toBe('warn');
    expect(leaveStatusTone('PENDING')).toBe('info');
  });

  it('labels every act the history can record', () => {
    for (const a of LEAVE_ACTS) expect(ACT_LABELS[a]).toBeTruthy();
  });
});

describe('coverActive and staffForSeat', () => {
  const cover = { coverId: 'u-divya', from: '2026-08-26', to: '2026-08-28' };

  it('is true only inside the window, inclusive', () => {
    expect(coverActive(cover, '2026-08-25')).toBe(false);
    expect(coverActive(cover, '2026-08-26')).toBe(true);
    expect(coverActive(cover, '2026-08-27')).toBe(true);
    expect(coverActive(cover, '2026-08-28')).toBe(true);
    /* the morning after, the seat is its owner's again — no job runs */
    expect(coverActive(cover, '2026-08-29')).toBe(false);
  });

  it('is false for no cover at all', () => {
    expect(coverActive(null, '2026-08-27')).toBe(false);
    expect(coverActive(undefined, '2026-08-27')).toBe(false);
  });

  it('hands the seat to the cover while it runs and back afterwards', () => {
    expect(staffForSeat('u-sneha', [cover], '2026-08-27')).toBe('u-divya');
    expect(staffForSeat('u-sneha', [cover], '2026-08-29')).toBe('u-sneha');
    expect(staffForSeat('u-sneha', [], '2026-08-27')).toBe('u-sneha');
  });

  it('answers null for a seat nobody holds', () => {
    expect(staffForSeat(null, [], '2026-08-27')).toBeNull();
  });

  it('picks the cover in force when a seat has had several', () => {
    const old = { coverId: 'u-old', from: '2026-07-01', to: '2026-07-05' };
    expect(staffForSeat('u-sneha', [old, cover], '2026-08-27')).toBe('u-divya');
  });
});
