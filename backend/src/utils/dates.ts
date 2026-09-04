/**
 * Local-time date helpers.
 *
 * NEVER `toISOString()` for a calendar date: it converts to UTC first, so local
 * midnight in IST reports as the PREVIOUS day. In this product that is not a
 * cosmetic bug — a term would end a day early, the cycle day would roll at
 * 05:30, and every night between 18:30 and midnight would misreport.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO KINDS OF MIDNIGHT LIVE IN THIS FILE, AND THEY ARE NOT INTERCHANGEABLE.
 * Picking the wrong one is silent, and in IST it is wrong for the last five and
 * a half hours of every single day.
 *
 *   `calendarDay(iso)`  ->  UTC midnight.   For a `@db.Date` COLUMN.
 *   `startOfDay(iso)`   ->  local midnight. For a TIMESTAMP boundary.
 *
 * A `@db.Date` column is a CALENDAR DAY — "4 September", a date somebody writes
 * on a form. It carries no zone, and Prisma round-trips it through the UTC date
 * part of the JS `Date` it is given, so 2026-09-04 built as LOCAL midnight in
 * IST is 2026-09-03T18:30Z and the column stores THIRD September. Build every
 * one of them with `calendarDay`.
 *
 * The `@db.Date` columns, listed so a new caller can check their own without
 * reading the whole schema: `DigestEntry.date`, `Task.date`, `Task.recurUntil`,
 * `TaskException.date`, `TaskDone.date`, `TaskProposal.date`, `Leave.from`,
 * `Leave.to`, `LeaveSessionCover.date`, `PodCover.from`, `PodCover.to`.
 *
 * A plain `DateTime` column is an INSTANT — `User.joinedAt`, `Client.termStart`,
 * `Client.onboardedAt`, `Meal.capturedAt`. "Since the start of today" for one of
 * those means the moment the day began HERE, which is exactly `startOfDay`.
 * Those callers are correct as they stand and must not be converted.
 *
 * The bug this rule was written from: the work list QUERIED `Task.date` with
 * `startOfDay` while the schedule WROTE it in UTC, so after 18:30 the board
 * showed yesterday's rows and hid today's booked session.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function dateAdd(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
}

/**
 * Midnight LOCAL on the given ISO date — the instant this day began here.
 *
 * The lower bound of a TIMESTAMP window, and nothing else: "plates captured
 * today", "ratings since this morning". NEVER the value of a `@db.Date` column —
 * see the rule at the top of this file, and use `calendarDay` for those.
 */
export function startOfDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/**
 * Midnight UTC on the given ISO date — the value of a `@db.Date` column.
 *
 * The whole of the argument is at the top of this file. In one line: a calendar
 * day has no zone, Prisma reads and writes the column by the UTC date part, and
 * a day built any other way is off by one for half the evening.
 *
 * The one implementation. `schedule.service.ts` had a private `asDate` doing
 * this, and a second copy of a rule this quiet is a second chance to get it
 * wrong.
 */
export function calendarDay(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Minutes since local midnight — the axis every schedule rule is written on. */
export function minutesOfDay(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** `'15m'`, `'24h'`, `'30d'` -> milliseconds. Used for token lifetimes. */
export function parseDuration(v: string): number {
  const m = /^(\d+)([smhd])$/.exec(v);
  if (!m) throw new Error(`Not a duration: ${v}`);
  const n = Number(m[1]);
  const unit = m[2] as 's' | 'm' | 'h' | 'd';
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return n * mult;
}

export function daysAgo(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export function minutesAgo(mins: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - mins * 60_000);
}
