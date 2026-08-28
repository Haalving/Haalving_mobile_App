import { describe, expect, it } from 'vitest';

import {
  KINDS,
  ROLE_GROUPS,
  ROLE_PILLAR,
  addDays,
  clientIdOfPodGroup,
  dayNumber,
  expandRange,
  fmtShortTime,
  isGroupTask,
  isKnownGroupId,
  layoutLanes,
  occursOnDate,
  podGroupId,
  respSummary,
  whoIndex,
  type ScheduleTask,
} from '../src/schedule.js';

/**
 * Recurrence, exceptions and lanes — the three things the grid cannot get wrong
 * without lying about somebody's week.
 */

const base: ScheduleTask = {
  id: 't1',
  title: 'Morning session',
  kind: 'session',
  date: '2026-08-24', // a Monday
  startMin: 7 * 60,
  durMin: 60,
  recurFreq: 'none',
  assigneeIds: ['u-vikram'],
  groupIds: [],
};

const on = (t: ScheduleTask, d: string) => occursOnDate(t, d);
const dates = (t: ScheduleTask, from: string, to: string) =>
  expandRange([t], from, to).map((o) => o.date);

describe('occursOn — the pattern', () => {
  it('a one-off happens on its day and no other', () => {
    expect(on(base, '2026-08-24')).not.toBeNull();
    expect(on(base, '2026-08-25')).toBeNull();
    expect(on(base, '2026-08-23')).toBeNull();
  });

  it('daily runs every day from its anchor', () => {
    const t = { ...base, recurFreq: 'daily' as const };
    expect(dates(t, '2026-08-24', '2026-08-30')).toHaveLength(7);
    /* and never before the anchor */
    expect(dates(t, '2026-08-20', '2026-08-25')).toEqual(['2026-08-24', '2026-08-25']);
  });

  it('alternate days skips every other one', () => {
    const t = { ...base, recurFreq: 'alt' as const };
    expect(dates(t, '2026-08-24', '2026-08-30')).toEqual([
      '2026-08-24',
      '2026-08-26',
      '2026-08-28',
      '2026-08-30',
    ]);
  });

  it('weekly lands on the same weekday', () => {
    const t = { ...base, recurFreq: 'weekly' as const };
    expect(dates(t, '2026-08-24', '2026-09-15')).toEqual([
      '2026-08-24',
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
    ]);
  });

  it('stops at `until`, inclusive', () => {
    const t = { ...base, recurFreq: 'daily' as const, recurUntil: '2026-08-26' };
    expect(dates(t, '2026-08-24', '2026-08-30')).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
    ]);
  });

  /*
   * The reason `dayNumber` counts in UTC. 2026-03-29 is when Europe puts its
   * clocks forward; local arithmetic makes that gap 23 hours, `gap % 2` flips,
   * and an alternate-day series silently skips or repeats a day — once a year,
   * in one hemisphere.
   */
  it('counts alternate days correctly across a daylight-saving boundary', () => {
    const t = { ...base, date: '2026-03-27', recurFreq: 'alt' as const };
    expect(dates(t, '2026-03-27', '2026-04-02')).toEqual([
      '2026-03-27',
      '2026-03-29',
      '2026-03-31',
      '2026-04-02',
    ]);
  });
});

describe('occursOn — exceptions', () => {
  const daily = { ...base, recurFreq: 'daily' as const };

  it('a cancelled exception hides that day and only that day', () => {
    const t = { ...daily, exceptions: [{ date: '2026-08-26', cancelled: true }] };
    expect(on(t, '2026-08-26')).toBeNull();
    expect(on(t, '2026-08-25')).not.toBeNull();
    expect(on(t, '2026-08-27')).not.toBeNull();
    expect(dates(t, '2026-08-24', '2026-08-30')).toHaveLength(6);
  });

  it('overrides start, length, title, link and notes for that day', () => {
    const t: ScheduleTask = {
      ...daily,
      link: 'https://meet/base',
      notes: 'base notes',
      exceptions: [
        {
          date: '2026-08-26',
          startMin: 10 * 60,
          durMin: 30,
          title: 'Moved session',
          link: 'https://meet/once',
          notes: 'just this once',
        },
      ],
    };
    const o = on(t, '2026-08-26')!;
    expect(o.startMin).toBe(600);
    expect(o.durMin).toBe(30);
    expect(o.title).toBe('Moved session');
    expect(o.link).toBe('https://meet/once');
    expect(o.notes).toBe('just this once');
    expect(o.edited).toBe(true);

    /* the day either side is untouched */
    const before = on(t, '2026-08-25')!;
    expect(before.startMin).toBe(420);
    expect(before.title).toBe('Morning session');
    expect(before.edited).toBe(false);
  });

  it('swaps the coach for one occurrence, which is how a leave cover lands', () => {
    const t: ScheduleTask = {
      ...daily,
      assigneeIds: ['u-vikram', 'u-sneha'],
      exceptions: [{ date: '2026-08-26', coachSwap: { fromId: 'u-vikram', toId: 'u-divya' } }],
    };
    expect(on(t, '2026-08-26')!.assigneeIds).toEqual(['u-divya', 'u-sneha']);
    /* every other day still reads the seat's own holder */
    expect(on(t, '2026-08-27')!.assigneeIds).toEqual(['u-vikram', 'u-sneha']);
  });

  it('leaves the roster alone when the swapped-out coach is not on the task', () => {
    const t: ScheduleTask = {
      ...daily,
      exceptions: [{ date: '2026-08-26', coachSwap: { fromId: 'u-nobody', toId: 'u-divya' } }],
    };
    expect(on(t, '2026-08-26')!.assigneeIds).toEqual(['u-vikram']);
  });

  it('reads done per date, not per task', () => {
    const t = { ...daily, doneDates: ['2026-08-25'] };
    expect(on(t, '2026-08-25')!.done).toBe(true);
    expect(on(t, '2026-08-26')!.done).toBe(false);
  });
});

describe('layoutLanes', () => {
  const occ = (id: string, startMin: number, durMin: number) =>
    occursOnDate({ ...base, id, startMin, durMin }, '2026-08-24')!;

  it('keeps a sequential day in one lane', () => {
    const { lanes, occs } = layoutLanes([occ('a', 420, 60), occ('b', 540, 60)]);
    expect(lanes).toBe(1);
    expect(occs.map((o) => o.lane)).toEqual([0, 0]);
  });

  it('opens a lane per overlapping tile', () => {
    /* 7:00-8:00, 7:30-8:30, 7:50-8:50 — genuinely three deep. Note 'c' has to
       start BEFORE 8:00: a tile beginning exactly as another ends does not
       overlap it, and correctly reuses its lane (the case below). */
    const { lanes, occs } = layoutLanes([
      occ('a', 420, 60),
      occ('b', 450, 60),
      occ('c', 470, 60),
    ]);
    expect(lanes).toBe(3);
    expect(occs.map((o) => o.lane)).toEqual([0, 1, 2]);
    /* every tile is told the column's width, so they all agree */
    expect(occs.every((o) => o.lanes === 3)).toBe(true);
  });

  it('reuses a lane once its tile has ended', () => {
    const { lanes, occs } = layoutLanes([occ('a', 420, 60), occ('b', 450, 60), occ('c', 540, 30)]);
    expect(lanes).toBe(2);
    expect(occs.map((o) => o.lane)).toEqual([0, 1, 0]);
  });

  it('keeps two short back-to-back tiles apart by the 25-minute visual floor', () => {
    /* 07:00-07:15 then 07:15-07:30: the DATA does not overlap, but a 15-minute
       tile is drawn ~18px tall and two of them would bleed together */
    const { lanes } = layoutLanes([occ('a', 420, 15), occ('b', 435, 15)]);
    expect(lanes).toBe(2);
  });

  it('sorts by start so the lane walk is deterministic', () => {
    const { occs } = layoutLanes([occ('late', 540, 30), occ('early', 420, 30)]);
    expect(occs.map((o) => o.task.id)).toEqual(['early', 'late']);
  });
});

describe('acceptance', () => {
  it('needs acceptance with two people, or with any group', () => {
    expect(isGroupTask({ groupIds: [] }, ['a'])).toBe(false);
    expect(isGroupTask({ groupIds: [] }, ['a', 'b'])).toBe(true);
    /* a group counts even when it resolves to one person today */
    expect(isGroupTask({ groupIds: ['g-fit'] }, ['a'])).toBe(true);
  });

  it('counts acceptances and confirms only when everybody has', () => {
    expect(respSummary(['a', 'b'], {})).toEqual({ total: 2, accepted: 0, confirmed: false });
    expect(respSummary(['a', 'b'], { a: 'accepted' })).toEqual({
      total: 2,
      accepted: 1,
      confirmed: false,
    });
    expect(respSummary(['a', 'b'], { a: 'accepted', b: 'accepted' })).toEqual({
      total: 2,
      accepted: 2,
      confirmed: true,
    });
  });

  it('does not confirm a declined or held task', () => {
    expect(respSummary(['a', 'b'], { a: 'accepted', b: 'declined' }).confirmed).toBe(false);
    expect(respSummary(['a', 'b'], { a: 'accepted', b: 'hold' }).confirmed).toBe(false);
  });

  it('never confirms a task with nobody on it', () => {
    expect(respSummary([], {}).confirmed).toBe(false);
  });
});

describe('the vocabularies', () => {
  it("has the demo's four kinds", () => {
    expect(Object.keys(KINDS)).toEqual(['session', 'meeting', 'internal', 'duty']);
  });

  it('maps a coach role to the pillar its sessions wear', () => {
    expect(ROLE_PILLAR).toEqual({
      fitness: 'fitness',
      yoga: 'yoga',
      mind: 'wellness',
      dietitian: 'culture',
    });
  });

  it('has the eight role groups in the demo order', () => {
    expect(ROLE_GROUPS.map((g) => g.id)).toEqual([
      'g-all',
      'g-ops',
      'g-core',
      'g-doc',
      'g-diet',
      'g-fit',
      'g-yoga',
      'g-mind',
    ]);
    /* g-all is everybody, expressed as "no role filter" */
    expect(ROLE_GROUPS[0]!.roles).toBeNull();
  });

  it('round-trips a pod group id', () => {
    expect(podGroupId('c-rajesh')).toBe('g-pod-c-rajesh');
    expect(clientIdOfPodGroup('g-pod-c-rajesh')).toBe('c-rajesh');
    expect(clientIdOfPodGroup('g-fit')).toBeNull();
    expect(isKnownGroupId('g-fit')).toBe(true);
    expect(isKnownGroupId('g-pod-anything')).toBe(true);
    expect(isKnownGroupId('g-made-up')).toBe(false);
  });

  it('walks the whole colour ring before repeating', () => {
    const seen = new Set(Array.from({ length: 12 }, (_v, i) => whoIndex(i)));
    expect(seen.size).toBe(12);
    expect(whoIndex(0)).toBe(1);
  });
});

describe('the clock', () => {
  it('formats the way the demo does, dropping :00', () => {
    expect(fmtShortTime(7 * 60)).toBe('7 am');
    expect(fmtShortTime(12 * 60)).toBe('12 pm');
    expect(fmtShortTime(15 * 60 + 30)).toBe('3:30 pm');
    expect(fmtShortTime(0)).toBe('12 am');
  });

  it('counts days and walks them', () => {
    expect(dayNumber('2026-08-25') - dayNumber('2026-08-24')).toBe(1);
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});
