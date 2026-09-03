import { prisma } from '../../config/prisma.js';
import { daysSince, digestClients } from './sources.js';
import type { DigestEntryInput, DigestRule } from './types.js';

/**
 * The first five days, counted.
 *
 * Days 1-5 are observation: no ratings, no levels, only watching
 * (schema.prisma:310). So the line a coach wants is not a verdict, it is a
 * COUNT — how far into the window, and how many plates have actually arrived.
 *
 * THE PHOTOS ARE COUNTED, NOT READ OFF THE BLOB. `Client.culturePhotos` carries
 * `{ uploaded, of, min }`, but `uploaded` is a number somebody maintains and the
 * plates are rows with timestamps; counting the rows is the reading that cannot
 * drift.
 *
 * ITS `of` IS NOT THIS TARGET, either, and reaching for it was the first thing
 * this rule got wrong. That number is the NUTRITION GATE for a whole level —
 * thirty-three plates across fourteen days — and measuring a five-day window
 * against it reported a client on their first week as twenty-six photos behind.
 * The window has its own expectation, and it is the demo's ten.
 *
 * ON PACE IS PRO-RATA, and it is why this rule sometimes wears a pill. Seven of
 * ten photos on day 3 of 5 is ahead; two of ten on day 4 is a conversation that
 * needs to happen before the window closes, and printing "no action needed"
 * over it would be the digest reassuring somebody about a client it should be
 * pointing at. The demo's line is unflagged because the demo's client is on
 * pace, not because this window never earns a flag.
 */

/** The window, in days. The demo's own five. */
export const OBSERVATION_DAYS = 5;
/** Plates the window expects — the demo's ten, across the five days. */
export const WINDOW_TARGET = 10;

/** "1 day" / "3 days" — a count nobody has to read twice. */
const days = (n: number): string => `${n} day${n === 1 ? '' : 's'}`;

export const observationRule: DigestRule = {
  key: 'observation',
  about: 'counts an observation client’s days and plates, and says whether they are on pace',

  async run(date: Date, only?: string[]): Promise<DigestEntryInput[]> {
    const clients = (await digestClients(only)).filter((c) => c.observation);
    if (!clients.length) return [];

    const counts = await prisma.meal.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clients.map((c) => c.id) }, photo: { not: null } },
      _count: { _all: true },
    });
    const photos = new Map(counts.map((c) => [c.clientId, c._count._all]));

    const out: DigestEntryInput[] = [];

    for (const [i, c] of clients.entries()) {
      const started = c.onboardedAt ?? c.createdAt;
      /* day 1 is the day they joined, not the day after */
      const day = Math.min(daysSince(started, date) + 1, OBSERVATION_DAYS);
      if (day < 1) continue;

      const uploaded = photos.get(c.id) ?? 0;
      const expected = (WINDOW_TARGET * day) / OBSERVATION_DAYS;
      const onPace = uploaded >= expected;

      out.push({
        clientId: c.id,
        flag: onPace ? null : 'MED',
        text:
          `Observation day ${day} of ${OBSERVATION_DAYS}, with ${uploaded} of ${WINDOW_TARGET} meal photos in. ` +
          (onPace
            ? 'On pace; no action needed.'
            : `Behind pace — ${Math.ceil(expected - uploaded)} short with ${days(OBSERVATION_DAYS - day)} left.`),
        evidence: ['observation counter', 'meal photos'],
        position: i,
      });
    }

    return out;
  },
};
