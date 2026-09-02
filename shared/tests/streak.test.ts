import { describe, expect, it } from 'vitest';

import { streak } from '../src/streak.js';
import type { CalDay, CalItem } from '../src/calendar.js';

/** a session item with a given status — only pillar/status matter to the streak */
const item = (pillar: string, status: string): CalItem => ({
  pillar,
  day: 0,
  label: `${pillar} session`,
  time: '',
  staffId: null,
  booked: false,
  status,
});

/** one cycle-day; `items` empty means a rest day, which is always kept */
const day = (d: number, items: CalItem[], today = false): CalDay => ({
  day: d,
  date: `Sep ${d}`,
  today,
  rest: items.length === 0,
  review: false,
  meeting: false,
  items,
  meals: [],
});

describe('streak', () => {
  it('counts the run ending at today and lights the seven flames (Rajesh, day 6)', () => {
    /* days 1–4 done, day 5 rest, day 6 today (in progress); the previous cycle is
       off the front and unlit */
    const cal: CalDay[] = [
      day(1, [item('fitness', 'done')]),
      day(2, [item('yoga', 'done')]),
      day(3, [item('fitness', 'done')]),
      day(4, [item('yoga', 'done')]),
      day(5, []),
      day(6, [item('fitness', 'today')], true),
      ...Array.from({ length: 8 }, (_, i) => day(7 + i, [item('fitness', 'planned')])),
    ];
    const s = streak(cal, 6);
    expect(s.days).toBe(5);
    expect(s.kept).toEqual([false, true, true, true, true, true, false]);
  });

  it('breaks the run on a missed day, but today in progress does not break it', () => {
    const cal: CalDay[] = [
      day(1, [item('fitness', 'done')]),
      day(2, [item('yoga', 'done')]),
      day(3, [item('fitness', 'missed')]),
      day(4, [item('yoga', 'done')]),
      day(5, [item('fitness', 'today')], true),
    ];
    const s = streak(cal, 5);
    /* day 5 today (skip), day 4 done (+1), day 3 missed (break) */
    expect(s.days).toBe(1);
  });

  it('counts today when today is already fully done', () => {
    const cal: CalDay[] = [
      day(1, [item('fitness', 'done')]),
      day(2, [item('yoga', 'done')]),
      day(3, [item('fitness', 'done')], true),
    ];
    const s = streak(cal, 3);
    expect(s.days).toBe(3);
    /* only three days exist; the four older flames fall to the previous cycle */
    expect(s.kept).toEqual([false, false, false, false, true, true, true]);
  });
});
