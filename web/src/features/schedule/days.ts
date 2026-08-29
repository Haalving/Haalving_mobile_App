'use client';

import { H0, H1, SNAP_MIN, addDays, dayName, weekdayOf } from '@haalving/shared';

/**
 * The calendar's own reading of a date.
 *
 * EVERYTHING HERE PARSES THE ISO STRING rather than making a `Date`. The demo
 * counts in day-offsets from `Date.now()` and can afford local `Date` maths; a
 * port that speaks real dates cannot, because `new Date('2026-08-29')` is parsed
 * as UTC midnight and prints as the 28th anywhere west of Greenwich. The day
 * number in a range label would then be off by one for half the world, on half
 * the year — which is exactly the kind of bug that never shows up in review.
 *
 * `dayName` and `weekdayOf` come from `@haalving/shared` for the same reason:
 * they read the weekday in UTC off the same integer the recurrence rules count
 * with, so a tile's header and the pattern that put it there always agree.
 */

/** The demo's own abbreviations, in `toolbarHtml` (console-schedule.js:820). */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The day of the month, as a numeral. */
export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function monthShort(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
}

/**
 * The Monday of this date's week.
 *
 * `(weekday + 6) % 7` because `weekdayOf` counts Sunday as 0 and the week the
 * business runs on starts on Monday — the demo's `visibleDays` does the same
 * arithmetic on `getDay()` (console-schedule.js:546).
 */
export function mondayOf(iso: string): string {
  return addDays(iso, -((weekdayOf(iso) + 6) % 7));
}

/** The seven days of the anchored week, or the single anchored day. */
export function visibleDays(anchor: string, mode: 'day' | 'week'): string[] {
  if (mode === 'day') return [anchor];
  const mon = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/** `Today` · `Tomorrow` · `Yesterday` · `Mon 3` — the demo's `dayOpts` labels. */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return `${dayName(iso)} ${dayOfMonth(iso)}`;
}

/** The demo's day picker: a month either side of today, in real dates. */
export function dayChoices(today: string): string[] {
  return Array.from({ length: 29 }, (_, i) => addDays(today, i - 7));
}

/**
 * Every start the grid can draw: 07:00 to 20:45, on the snap.
 *
 * It stops a snap short of 21:00 because `startMinute` in the shared schema does
 * — a task that began at closing time could not have a length.
 */
export const TIME_CHOICES: number[] = (() => {
  const out: number[] = [];
  for (let m = H0 * 60; m <= H1 * 60 - SNAP_MIN; m += SNAP_MIN) out.push(m);
  return out;
})();

/** The demo's six lengths, and how it says them. */
export const DURATIONS = [15, 30, 45, 60, 90, 120];

export function durationLabel(min: number): string {
  return min < 60 ? `${min} min` : `${min / 60} h`;
}

/** The demo says people by first name everywhere on this screen. */
export function firstName(name: string): string {
  return String(name || '').split(' ')[0] ?? '';
}

/** Minutes since midnight, LOCAL — the now-line and the room door read this. */
export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}
