/**
 * Local-time date helpers.
 *
 * NEVER `toISOString()` for a calendar date: it converts to UTC first, so local
 * midnight in IST reports as the PREVIOUS day. In this product that is not a
 * cosmetic bug — a term would end a day early, the cycle day would roll at
 * 05:30, and every night between 18:30 and midnight would misreport.
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

/** Midnight local on the given ISO date — the right value to store as a Date. */
export function startOfDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
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
