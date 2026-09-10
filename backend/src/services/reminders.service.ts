import { prisma } from '../config/prisma.js';
import { minutesOfDay, todayISO } from '../utils/dates.js';
import * as groups from './groups.service.js';
import * as notice from './notice.service.js';
import { occurrencesOn } from './schedule.service.js';

/**
 * SESSION REMINDERS — the demo's second sweep, finally with somewhere to land.
 *
 * Everything booked on the Schedule reminds the people on it TWICE before it
 * starts: an hour out and half an hour out. Each reminder is a notice, so it
 * reaches the bell on the dashboard and Home › Notices, and carries the client
 * and the room link's whereabouts.
 *
 * ONCE PER PERSON PER OCCURRENCE PER MARK, however often the clock ticks. The
 * job runs every minute; the dedupe key on the notice (`sessionReminder:<task>:
 * <date>:<mark>`) is what makes that safe, and the row is looked for before it
 * is raised so a minute that has nothing new to say writes nothing at all.
 *
 * THE WINDOWS ARE RANGES, NOT INSTANTS. The hour mark fires anywhere between 60
 * and 31 minutes out, the half-hour mark anywhere between 30 and 1. A server that
 * was down at exactly 60 still says its piece at 52 — with the true number of
 * minutes in the sentence — rather than staying silent for having missed the
 * minute. Past the start nothing is sent: a reminder for something already
 * running is noise.
 *
 * WHAT IS REMINDED: sessions, meetings and the tasks people book themselves.
 * `internal` and `duty` rows — the rating windows and standing duties the rules and the
 * seed put on the grid — are not, because two notices a day per duty per person
 * would drown the reminders that matter.
 */

/** Minutes before the start at which a reminder goes out, loudest last. */
export const REMINDER_MARKS = [60, 30] as const;

function clock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export interface ReminderCounts {
  /** occurrences on today's grid that were looked at */
  checked: number;
  /** notices actually written (new rows, not refreshes) */
  raised: number;
}

export async function remindUpcoming(now: Date = new Date()): Promise<ReminderCounts> {
  const today = todayISO(now);
  const nowMin = minutesOfDay(now);
  const occs = await occurrencesOn(today);
  let raised = 0;

  for (const o of occs) {
    if (o.task.kind === 'internal' || o.task.kind === 'duty') continue;
    const until = o.startMin - nowMin;
    if (until <= 0) continue;

    for (const [i, mark] of REMINDER_MARKS.entries()) {
      /* the window this mark owns: (next mark, this mark] */
      const floor = REMINDER_MARKS[i + 1] ?? 0;
      if (until > mark || until <= floor) continue;

      const key = `sessionReminder:${o.task.id}:${o.date}:${mark}`;
      const already = await prisma.notice.findFirst({ where: { dedupeKey: key }, select: { id: true } });
      if (already) continue;

      const resolved = await groups.resolveMany(o.task.groupIds ?? []);
      const people = groups.peopleOfTask(o.assigneeIds, o.task.groupIds ?? [], resolved);
      if (!people.length) continue;

      const client = o.task.clientId
        ? await prisma.client.findUnique({ where: { id: o.task.clientId }, select: { name: true } })
        : null;

      const { created } = await notice.raise({
        toIds: people,
        kind: 'REMINDER',
        title: `${o.title} at ${clock(o.startMin)}`,
        text:
          `Starts in ${until} min` +
          (client ? ` · ${client.name}` : '') +
          (o.link ? ' · the room link is on your work list.' : '.'),
        /* the half-hour is the one to act on; the hour is a heads-up */
        severity: mark === 30 ? 'WATCH' : 'INFO',
        clientId: o.task.clientId ?? null,
        dedupeKey: key,
      });
      raised += created;
    }
  }

  return { checked: occs.length, raised };
}
