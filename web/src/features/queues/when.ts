import type { WorklistRow } from '@/features/queues/queries';

/**
 * "When to do" — the one place a work row's clock is put into words.
 *
 * It lives here rather than in a board because TWO screens read the same rows:
 * Work Queues shows the whole list, Home › Tasks shows the next one off the top
 * of it. When only the board could phrase a time, the Home card fell back to
 * `due` — which a booked row does not carry — and drew an EMPTY pill over a
 * meeting that had a perfectly good hour on it.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** yyyy-mm-dd in the reader's OWN timezone, so "today" matches their calendar. */
export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Today" / "Tomorrow" / "12 Sep" — the day a person reads, from an ISO one. */
export function dayLabel(iso: string): string {
  const now = new Date();
  if (iso === localISO(now)) return 'Today';
  if (iso === localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))) return 'Tomorrow';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const yy = y === now.getFullYear() ? '' : ` ${y}`;
  return `${d} ${MONTHS[m - 1]}${yy}`;
}

/** Minutes-since-midnight → "2:30 PM", the clock the Schedule writes. */
export function clock(min: number | null): string {
  if (min == null) return '';
  const h = Math.floor(min / 60);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(min % 60).padStart(2, '0')} ${ap}`;
}

/**
 * The "when to do" a row reads by — its day and hour when it has one, the
 * free-text deadline when it does not.
 *
 * A booked row's `due` is empty on purpose: its deadline IS its slot, and asking
 * somebody to type "today" next to a 3:30 PM meeting would be asking them to say
 * the same thing twice. So the slot answers first, and `due` is the fallback for
 * the slotless half of the table.
 */
export function whenLabel(w: WorklistRow): string {
  if (!w.date) return w.due;
  return [dayLabel(w.date), clock(w.startMin)].filter(Boolean).join(' · ');
}
