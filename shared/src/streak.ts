/**
 * THE STREAK — ported from the demo's Today card (client-today.js:785).
 *
 * One flame a day, lit when that day's sessions are all done. A rest day carries
 * no sessions, so nothing on it can break the streak — its flame stays lit. Today
 * does not break it either: a day still being lived is not a day lost.
 *
 * `days` is the run of kept days ending on (but not requiring) today; `kept` is the
 * last seven cycle-days, oldest first, ending on today — the row the seven flames
 * draw.
 *
 * THE BOUNDARY. The demo walks back across cycle edges through `calendarsPast`; this
 * port walks the CURRENT cycle only and treats day 0 and earlier as unkept. Where a
 * past cycle ran a shortfall — the demo marks it missed newest-first, so the last
 * day of the previous cycle is the first to fall — the two agree exactly, because
 * the streak breaks at that edge regardless. A caller that later has real
 * past-cycle completion can extend this without changing its shape.
 */

import type { CalDay } from './calendar.js';

export interface Streak {
  /** the run of kept days ending at (or just before) today */
  days: number;
  /** the last seven cycle-days, oldest first, ending on today */
  kept: boolean[];
}

/** A day is kept when every session on it is done; a day with none is kept. */
const dayKept = (e: CalDay | undefined): boolean =>
  !!e && e.items.every((i) => i.status === 'done');

/**
 * The streak for a client sitting on `clientDay` of a cycle drawn as `cal`
 * (one entry per cycle-day, 1-indexed by `day`).
 */
export function streak(cal: readonly CalDay[], clientDay: number): Streak {
  const byDay = new Map(cal.map((d) => [d.day, d]));

  /* the count: walk back from today. A kept day extends it; a broken day ends it,
     UNLESS that day is today — a day still in progress has not been lost yet. */
  let days = 0;
  for (let d = clientDay; d >= 1; d--) {
    if (dayKept(byDay.get(d))) days += 1;
    else if (d !== clientDay) break;
  }

  /* the seven flames, oldest first, ending on today. Days off the front of the
     cycle belong to a previous cycle this port does not draw, so they are unlit. */
  const kept: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = clientDay - i;
    kept.push(d >= 1 ? dayKept(byDay.get(d)) : false);
  }

  return { days, kept };
}
