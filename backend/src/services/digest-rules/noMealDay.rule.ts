import { prisma } from '../../config/prisma.js';
import { dateAdd, startOfDay, toISODate, todayISO } from '../../utils/dates.js';
import { SILENCE_DAYS } from './noLogs.rule.js';
import { digestClients, lastSeenWords } from './sources.js';
import type { DigestEntryInput, DigestRule } from './types.js';

/**
 * A DAY THAT WENT BY WITHOUT A PLATE.
 *
 * The product asks a client for a photograph of what they ate. It is the one
 * artefact everything downstream is built from — the meals queue rates it, the
 * dietitian's kcal and protein come off it, the observation window counts ten of
 * them, and a rating is what lands back in the client's circle. So a whole day
 * with none is the smallest compliance gap worth a coach's morning, and until
 * this rule existed nothing said it out loud.
 *
 * WHY `noLogs` DOES NOT ALREADY COVER IT. That rule waits three days AND accepts
 * a circle message as a sign of life, on purpose: a client who writes to their
 * pod has not gone quiet. But a client who chats every day and never photographs
 * a plate is logging nothing this product can read, and `lastSeenByClient` keeps
 * marking them seen — so they were invisible to the digest for ever. This rule
 * watches the plate specifically, which is the half of that signal nobody
 * else is watching.
 *
 * IT MEASURES COMPLETED DAYS, NEVER TODAY, and that is the whole reason it is
 * safe to run at 08:00. The digest builds before breakfast: a rule asking
 * "has a plate arrived today" would answer no for the entire roster every single
 * morning, which is not a digest but a wall. Yesterday is the newest day that has
 * a true answer, so the run is counted backwards from there.
 *
 * A PLATE LOGGED TODAY CLEARS THE LINE ANYWAY. The line exists to make a coach
 * chase somebody; a client who has already logged this morning does not need
 * chasing, whatever yesterday looked like. Meal capture calls `refreshFor`, so
 * the line disappears within a second of the plate arriving rather than standing
 * over the coach's Home until tomorrow.
 *
 * THE ESCALATION SHARES `noLogs`' NUMBER. Three days is what this product has
 * already decided is loud, and importing that constant rather than restating it
 * means the two rules cannot drift apart into a system that shouts at three days
 * of silence and two days of missed plates.
 */

/**
 * How far back the run is counted, in completed days.
 *
 * A window rather than an open walk because the sentence has to stay honest: the
 * run is only exactly known when the window holds a plate to end it, and past
 * that the line says `7+` rather than a number it cannot stand behind. Seven also
 * keeps this one query small — a fortnight of plates for a whole roster read
 * every morning buys nothing the line would print.
 */
export const LOOKBACK_DAYS = 7;

export const noMealDayRule: DigestRule = {
  key: 'noMealDay',
  about: 'flags a client who let a whole day pass without logging a meal',

  async run(date: Date, only?: string[]): Promise<DigestEntryInput[]> {
    const clients = await digestClients(only);
    if (!clients.length) return [];

    const today = todayISO(date);

    /* one read for the roster, covering the window AND today — today's plates are
       what clear a client rather than flag them, so they have to be in the same
       answer */
    const meals = await prisma.meal.findMany({
      where: {
        clientId: { in: clients.map((c) => c.id) },
        /* `capturedAt` is a plain timestamp, so its window opens at LOCAL
           midnight — the instant that day began here. Not a `@db.Date`. */
        capturedAt: { gte: startOfDay(dateAdd(today, -LOOKBACK_DAYS)) },
      },
      select: { clientId: true, capturedAt: true },
    });

    /*
     * Bucketed by LOCAL calendar day, which is the only bucketing that answers
     * the question asked. `toISODate` reads the local fields; `toISOString` would
     * convert to UTC first and file every plate photographed between half past
     * six and midnight in Kolkata under the previous day — so a client who ate
     * dinner would be flagged for missing that day, and the day they actually
     * missed would look covered.
     */
    const days = new Map<string, Set<string>>();
    const newest = new Map<string, Date>();
    for (const m of meals) {
      const set = days.get(m.clientId);
      if (set) set.add(toISODate(m.capturedAt));
      else days.set(m.clientId, new Set([toISODate(m.capturedAt)]));

      const held = newest.get(m.clientId);
      if (!held || m.capturedAt > held) newest.set(m.clientId, m.capturedAt);
    }

    const out: DigestEntryInput[] = [];

    for (const [i, c] of clients.entries()) {
      /* observation clients are counted by their own rule, which reads the same
         photographs against the window's pace — two lines about one person's
         plates would be the same fact told twice, and the louder of them would
         take the client from the more useful one */
      if (c.observation) continue;

      const mine = days.get(c.id) ?? new Set<string>();

      /* already logged this morning: nothing to chase */
      if (mine.has(today)) continue;

      /*
       * NEVER FLAG A DAY THAT PRECEDES THE CLIENT. A client onboarded yesterday
       * evening has one completed day at most, and a client onboarded today has
       * none — counting calendar days without this would open a brand-new
       * client's first morning with a line about a week they were not here for.
       */
      const firstDay = toISODate(c.onboardedAt ?? c.createdAt);

      let missed = 0;
      for (let back = 1; back <= LOOKBACK_DAYS; back += 1) {
        const iso = dateAdd(today, -back);
        /* ISO dates compare correctly as strings, so no Date objects are made
           inside the walk */
        if (iso < firstDay) break;
        if (mine.has(iso)) break;
        missed += 1;
      }

      if (!missed) continue;

      /*
       * THE RUN IS ONLY EXACTLY KNOWN WHEN A PLATE ENDS IT.
       *
       * `missed` reaching the window means every completed day in it was empty,
       * and the last plate — if there ever was one — is older than anything read
       * here. So that case says `7+` and names no date: `newest` holds only what
       * is inside the window, and printing "last one 12 Oct" off a null, or
       * "none since joining" for a client who logged plenty a fortnight ago,
       * would both be the line inventing a fact it does not have.
       *
       * Below the window the run is bounded either by a plate (so `newest` has
       * it) or by the client's own first day (so every day since joining is in
       * the run, and saying that is exactly true).
       */
      const capped = missed >= LOOKBACK_DAYS;
      const last = newest.get(c.id) ?? null;

      out.push({
        clientId: c.id,
        /* the same threshold `noLogs` shouts at, so the two rules escalate on one
           number rather than each on its own */
        flag: missed >= SILENCE_DAYS ? 'HIGH' : 'MED',
        text: capped
          ? `No plate for ${LOOKBACK_DAYS}+ days running.`
          : missed === 1
            ? 'No plate logged yesterday, and nothing in yet today.'
            : `No plate for ${missed} days running. ${
                last ? `Last one ${lastSeenWords(last, date)}.` : 'None since joining.'
              }`,
        evidence: ['meal log', 'daily plate'],
        position: i,
      });
    }

    return out;
  },
};
