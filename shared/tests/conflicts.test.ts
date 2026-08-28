import { describe, expect, it } from 'vitest';

import {
  availFits,
  availWindows,
  busyAt,
  conflicts,
  firstFreeSlot,
  fmtTime,
  hmToMin,
  isoOfRd,
  occursOn,
  onLeaveAt,
  outsideHours,
  wdOf,
  type SchedTask,
  type SchedUser,
  type World,
} from '../src/conflicts.js';

/* A fixed Wednesday so every weekday assertion is stable. 2026-08-26 is a Wed. */
const NOW = new Date(2026, 7, 26, 10, 0, 0);

/** Vikram's real split shift — the only one on the demo bench. */
const vikram: SchedUser = {
  id: 'u-vikram',
  name: 'Vikram S.',
  avail: {
    mon: [['06:00', '10:00'], ['17:00', '21:00']],
    tue: [['06:00', '10:00'], ['17:00', '21:00']],
    wed: [['06:00', '10:00'], ['17:00', '21:00']],
    thu: [['06:00', '10:00'], ['17:00', '21:00']],
    fri: [['06:00', '10:00'], ['17:00', '21:00']],
    sat: [['06:00', '10:00']],
    sun: null,
  },
};

/** Lakshmi keeps a single shift, so the two shapes stay contrasted. */
const lakshmi: SchedUser = {
  id: 'u-lakshmi',
  name: 'Lakshmi N.',
  avail: {
    mon: ['06:00', '12:00'],
    tue: ['06:00', '12:00'],
    wed: ['06:00', '12:00'],
    thu: ['06:00', '12:00'],
    fri: ['06:00', '12:00'],
    sat: ['07:00', '11:00'],
    sun: null,
  },
};

const meera: SchedUser = {
  id: 'u-meera',
  name: 'Meera J.',
  avail: {
    mon: ['14:00', '21:00'],
    tue: ['14:00', '21:00'],
    wed: ['14:00', '21:00'],
    thu: ['14:00', '21:00'],
    fri: ['14:00', '21:00'],
    sat: null,
    sun: null,
  },
};

const ai: SchedUser = { id: 'u-ai', name: 'Your AI coach', ai: true };

const users = [vikram, lakshmi, meera, ai];

function task(over: Partial<SchedTask> & Pick<SchedTask, 'id'>): SchedTask {
  return {
    title: 'Session',
    day: 0,
    start: 18 * 60,
    dur: 60,
    assignees: ['u-vikram'],
    recur: null,
    exc: {},
    done: {},
    ...over,
  };
}

const world = (over: World = {}): World => ({ users, now: NOW, ...over });

/* ----------------------------------------------------------- time helpers */

describe('time helpers', () => {
  it('parses a clock and refuses anything that is not one', () => {
    expect(hmToMin('06:00')).toBe(360);
    expect(hmToMin('6:05')).toBe(365);
    expect(hmToMin('23:59')).toBe(1439);
    expect(hmToMin('24:00')).toBeNull();
    expect(hmToMin('bodyweight')).toBeNull();
    expect(hmToMin('')).toBeNull();
    expect(hmToMin(null)).toBeNull();
  });

  it('speaks the schedule clock voice', () => {
    expect(fmtTime(0)).toBe('12:00 am');
    expect(fmtTime(360)).toBe('6:00 am');
    expect(fmtTime(720)).toBe('12:00 pm');
    expect(fmtTime(1110)).toBe('6:30 pm');
    /* wraps rather than throwing, so arithmetic past midnight still reads */
    expect(fmtTime(1440 + 90)).toBe('1:30 am');
  });

  it('walks weekdays from the injected clock, not the wall', () => {
    expect(wdOf(0, NOW)).toBe('wed');
    expect(wdOf(1, NOW)).toBe('thu');
    expect(wdOf(-1, NOW)).toBe('tue');
    expect(wdOf(4, NOW)).toBe('sun');
  });

  it('builds ISO dates in local time, never through UTC', () => {
    /* the bug this guards: toISOString() on local midnight IST reports the
       previous day, so a term would end a day early */
    const lateNight = new Date(2026, 7, 26, 23, 45, 0);
    expect(isoOfRd(0, lateNight)).toBe('2026-08-26');
    expect(isoOfRd(1, lateNight)).toBe('2026-08-27');
  });
});

/* ----------------------------------------------------------- availability */

describe('availWindows', () => {
  it('reads a single range and a split shift through the same door', () => {
    expect(availWindows(lakshmi, 'wed')).toEqual([[360, 720]]);
    expect(availWindows(vikram, 'wed')).toEqual([
      [360, 600],
      [1020, 1260],
    ]);
  });

  it('returns nothing for a day off', () => {
    expect(availWindows(vikram, 'sun')).toEqual([]);
    expect(availWindows(meera, 'sat')).toEqual([]);
  });

  it('drops a malformed or inverted range rather than trusting it', () => {
    const broken: SchedUser = {
      id: 'u-x',
      name: 'X',
      avail: { wed: [['17:00', '09:00'], ['bad', '10:00'], ['09:00', '12:00']] },
    };
    expect(availWindows(broken, 'wed')).toEqual([[540, 720]]);
  });

  it('sorts windows by start so the first is genuinely the earliest', () => {
    const shuffled: SchedUser = {
      id: 'u-y',
      name: 'Y',
      avail: { wed: [['17:00', '21:00'], ['06:00', '10:00']] },
    };
    expect(availWindows(shuffled, 'wed')).toEqual([
      [360, 600],
      [1020, 1260],
    ]);
  });
});

describe('availFits', () => {
  it('requires ONE window to hold the whole session', () => {
    /* 9:30-10:30 straddles the gap in Vikram's split shift: that is two
       half-sessions with his lunch in the middle, not a session that fits */
    expect(availFits(vikram, 'wed', 9 * 60 + 30, 60)).toBe(false);
    expect(availFits(vikram, 'wed', 8 * 60, 60)).toBe(true);
    expect(availFits(vikram, 'wed', 18 * 60, 60)).toBe(true);
  });

  it('refuses a session that runs past the end of the window', () => {
    expect(availFits(lakshmi, 'wed', 11 * 60 + 30, 60)).toBe(false);
    expect(availFits(lakshmi, 'wed', 11 * 60, 60)).toBe(true);
  });

  it('lets the AI and the undeclared through — neither keeps hours', () => {
    expect(availFits(ai, 'sun', 3 * 60, 60)).toBe(true);
    expect(availFits({ id: 'u-z', name: 'Z' }, 'sun', 3 * 60, 60)).toBe(true);
  });
});

/* ------------------------------------------------------------ occurrences */

describe('occursOn', () => {
  it('places a one-off on its own day only', () => {
    const t = task({ id: 't1', day: 2 });
    expect(occursOn(t, 2)).not.toBeNull();
    expect(occursOn(t, 1)).toBeNull();
    expect(occursOn(t, 3)).toBeNull();
  });

  it('walks daily, alternate and weekly series', () => {
    const daily = task({ id: 't2', day: 0, recur: { freq: 'daily', until: 3 } });
    expect([0, 1, 2, 3].every((rd) => occursOn(daily, rd))).toBe(true);
    expect(occursOn(daily, 4)).toBeNull();

    const alt = task({ id: 't3', day: 1, recur: { freq: 'alt', until: 7 } });
    expect(occursOn(alt, 3)).not.toBeNull();
    expect(occursOn(alt, 4)).toBeNull();

    const weekly = task({ id: 't4', day: 0, recur: { freq: 'weekly', until: 21 } });
    expect(occursOn(weekly, 7)).not.toBeNull();
    expect(occursOn(weekly, 8)).toBeNull();
  });

  it('honours a cancelled occurrence', () => {
    const t = task({ id: 't5', day: 0, recur: { freq: 'alt', until: 6 }, exc: { 2: { cancelled: true } } });
    expect(occursOn(t, 0)).not.toBeNull();
    expect(occursOn(t, 2)).toBeNull();
    expect(occursOn(t, 4)).not.toBeNull();
  });

  it('lets an exception move the time and swap the coach', () => {
    const t = task({
      id: 't6',
      day: 0,
      start: 18 * 60,
      exc: { 0: { start: 19 * 60, dur: 30, assignees: ['u-nikhil'], title: 'Cover session' } },
    });
    const occ = occursOn(t, 0)!;
    /* the cover must reach the grid, the digest and the client's plan from one
       write, so every reader takes the OCCURRENCE, never the task */
    expect(occ.start).toBe(19 * 60);
    expect(occ.dur).toBe(30);
    expect(occ.assignees).toEqual(['u-nikhil']);
    expect(occ.title).toBe('Cover session');
    expect(occ.edited).toBe(true);
  });
});

/* --------------------------------------------------------------- busyAt */

describe('busyAt', () => {
  it('finds an overlap and names the task', () => {
    const w = world({ tasks: [task({ id: 'a', start: 18 * 60, dur: 60, title: 'Fitness session' })] });
    const hits = busyAt(['u-vikram'], 0, 18 * 60 + 30, 60, w);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'busy', whoId: 'u-vikram', detail: 'Fitness session', taskId: 'a' });
  });

  it('treats abutting sessions as free', () => {
    const w = world({ tasks: [task({ id: 'a', start: 18 * 60, dur: 60 })] });
    expect(busyAt(['u-vikram'], 0, 19 * 60, 60, w)).toHaveLength(0);
    expect(busyAt(['u-vikram'], 0, 17 * 60, 60, w)).toHaveLength(0);
  });

  it('ignores a task the caller is moving', () => {
    const w = world({ tasks: [task({ id: 'a' })], exceptIds: ['a'] });
    expect(busyAt(['u-vikram'], 0, 18 * 60, 60, w)).toHaveLength(0);
  });

  it('lets a rhythm through in both directions — it is not an appointment', () => {
    const rhythm = task({ id: 'r', rhythm: true, title: 'Daily reminder sweep' });
    const w = world({ tasks: [rhythm] });
    /* holds no capacity */
    expect(busyAt(['u-vikram'], 0, 18 * 60, 60, w)).toHaveLength(0);
    /* and blocks none: a real session lands on top of it freely */
    expect(conflicts(['u-vikram'], 0, 18 * 60, 60, w)).toHaveLength(0);
  });

  it('needs BOTH sides to permit an overlap', () => {
    const permissive = task({ id: 'p', allowOverlap: true });
    const strict = task({ id: 's', allowOverlap: false });

    /* both say yes -> allowed */
    expect(busyAt(['u-vikram'], 0, 18 * 60, 60, world({ tasks: [permissive], allowOverlap: true }))).toHaveLength(0);
    /* the incoming task says yes, the one it lands on does not -> refused.
       A task that permits overlap cannot force itself on top of one that does not. */
    expect(busyAt(['u-vikram'], 0, 18 * 60, 60, world({ tasks: [strict], allowOverlap: true }))).toHaveLength(1);
    /* the one it lands on says yes, the incoming task does not -> refused */
    expect(busyAt(['u-vikram'], 0, 18 * 60, 60, world({ tasks: [permissive], allowOverlap: false }))).toHaveLength(1);
  });

  it('reports each person once even when several tasks clash', () => {
    const w = world({
      tasks: [task({ id: 'a', start: 18 * 60 }), task({ id: 'b', start: 18 * 60 + 15 })],
    });
    const hits = busyAt(['u-vikram'], 0, 18 * 60, 60, w);
    expect(hits).toHaveLength(2);
    expect(new Set(hits.map((h) => h.taskId))).toEqual(new Set(['a', 'b']));
  });

  it('asks the caller how to expand a group', () => {
    const t = task({ id: 'g', assignees: [] });
    const w = world({ tasks: [t], peopleOf: () => ['u-lakshmi', 'u-meera'] });
    const hits = busyAt(['u-meera'], 0, 18 * 60, 60, w);
    expect(hits.map((h) => h.whoId)).toEqual(['u-meera']);
  });
});

/* -------------------------------------------------- hours, leave, the union */

describe('outsideHours', () => {
  it('refuses an hour outside the declared week and says what it is', () => {
    const hits = outsideHours(['u-lakshmi'], 0, 18 * 60, 60, world());
    expect(hits).toHaveLength(1);
    expect(hits[0]?.detail).toBe('works 6:00 am-12:00 pm');
  });

  it('names both halves of a split shift', () => {
    const hits = outsideHours(['u-vikram'], 0, 12 * 60, 60, world());
    expect(hits[0]?.detail).toBe('works 6:00 am-10:00 am and 5:00 pm-9:00 pm');
  });

  it('says so plainly on a day off', () => {
    /* rd 4 from a Wednesday is Sunday */
    const hits = outsideHours(['u-vikram'], 4, 8 * 60, 60, world());
    expect(hits[0]?.detail).toBe('is off that day');
  });

  it('never refuses the AI', () => {
    expect(outsideHours(['u-ai'], 4, 3 * 60, 60, world())).toHaveLength(0);
  });
});

describe('onLeaveAt', () => {
  const leaves = [
    { staffId: 'u-sneha', status: 'approved', from: '2026-08-26', to: '2026-08-27' },
    { staffId: 'u-lakshmi', status: 'pending', from: '2026-08-26', to: '2026-08-27' },
  ];

  it('blocks approved leave and nothing else', () => {
    expect(onLeaveAt(['u-sneha'], 0, world({ leaves }))).toHaveLength(1);
    /* a pending request is not yet a fact about the person */
    expect(onLeaveAt(['u-lakshmi'], 0, world({ leaves }))).toHaveLength(0);
  });

  it('expires by date alone, so approved leave needs no cleanup job', () => {
    expect(onLeaveAt(['u-sneha'], 1, world({ leaves }))).toHaveLength(1);
    expect(onLeaveAt(['u-sneha'], 2, world({ leaves }))).toHaveLength(0);
  });
});

describe('conflicts', () => {
  it('unions the three questions, most-blocking first', () => {
    const w = world({
      tasks: [task({ id: 'a', assignees: ['u-lakshmi'], start: 7 * 60, dur: 60 })],
      leaves: [{ staffId: 'u-lakshmi', status: 'approved', from: isoOfRd(0, NOW), to: isoOfRd(0, NOW) }],
    });
    /* 7:30 am clashes with the booking, she is on leave, and 7:30 IS inside her
       declared hours — so exactly two conflicts, busy before leave */
    const hits = conflicts(['u-lakshmi'], 0, 7 * 60 + 30, 60, w);
    expect(hits.map((h) => h.type)).toEqual(['busy', 'leave']);
  });

  it('narrows the hours check to the people named, never the invitees', () => {
    /* The whole-team meeting. No hour satisfies twelve windows at once —
       Lakshmi finishes at 12:00 and Meera starts at 14:00 — so enforcing hours
       on invitees would make the SOP's own meetings unschedulable. */
    const invitees = ['u-lakshmi', 'u-meera'];
    const both = conflicts(invitees, 0, 13 * 60, 60, world());
    expect(both.filter((h) => h.type === 'hours')).toHaveLength(2);

    const narrowed = conflicts(invitees, 0, 13 * 60, 60, world({ hoursFor: [] }));
    expect(narrowed.filter((h) => h.type === 'hours')).toHaveLength(0);
  });

  it('still binds busy and leave for everyone, however hoursFor is narrowed', () => {
    const w = world({
      hoursFor: [],
      tasks: [task({ id: 'a', assignees: ['u-meera'], start: 15 * 60, dur: 60 })],
      leaves: [{ staffId: 'u-lakshmi', status: 'approved', from: isoOfRd(0, NOW), to: isoOfRd(0, NOW) }],
    });
    const hits = conflicts(['u-lakshmi', 'u-meera'], 0, 15 * 60, 60, w);
    expect(hits.map((h) => h.type).sort()).toEqual(['busy', 'leave']);
  });
});

/* ------------------------------------------------------------ placement */

describe('firstFreeSlot', () => {
  it('takes the first free minute at or after the preference', () => {
    const start = firstFreeSlot('u-vikram', [0], 60, { ...world(), from: 17 * 60 });
    expect(start).toBe(17 * 60);
  });

  it('spills back through the working day when the preferred stretch fills', () => {
    const tasks = [
      task({ id: 'a', start: 17 * 60, dur: 60 }),
      task({ id: 'b', start: 18 * 60, dur: 60 }),
      task({ id: 'c', start: 19 * 60, dur: 60 }),
      task({ id: 'd', start: 20 * 60, dur: 60 }),
    ];
    const start = firstFreeSlot('u-vikram', [0], 60, { ...world({ tasks }), from: 17 * 60 });
    /* the evening window is full, so it falls back to the morning half of the
       split shift rather than inventing an out-of-hours slot */
    expect(start).toBe(6 * 60);
  });

  it('finds a minute that clears EVERY day of the series', () => {
    /* Vikram works 06:00-10:00 on Saturday but not the evening. rd 3 from a
       Wednesday is Saturday, so an alternate-day series covering it can only sit
       in the morning. */
    const start = firstFreeSlot('u-vikram', [0, 1, 3], 60, { ...world(), from: 17 * 60 });
    expect(start).not.toBeNull();
    expect(start! + 60).toBeLessThanOrEqual(10 * 60);
  });

  it('skips days the person does not work rather than failing the series', () => {
    /* rd 4 is Sunday — Vikram is off. The series still places on the other days. */
    const start = firstFreeSlot('u-vikram', [0, 4], 60, { ...world(), from: 18 * 60 });
    expect(start).toBe(18 * 60);
  });

  it('returns null when the series genuinely cannot be placed', () => {
    /* everyone is off on Sunday, so there is no minute to give back */
    expect(firstFreeSlot('u-vikram', [4], 60, world())).toBeNull();
    /* and a session longer than any single window never fits */
    expect(firstFreeSlot('u-vikram', [0], 6 * 60, world())).toBeNull();
  });

  it('never places a session the declared week cannot hold', () => {
    const start = firstFreeSlot('u-lakshmi', [0], 60, { ...world(), from: 18 * 60 });
    expect(start).not.toBeNull();
    expect(availFits(lakshmi, wdOf(0, NOW), start!, 60)).toBe(true);
  });
});
