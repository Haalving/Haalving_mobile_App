import { prisma } from '../../config/prisma.js';
import { startOfDay, todayISO } from '../../utils/dates.js';
import { digestClients } from './sources.js';
import type { DigestEntryInput, DigestRule } from './types.js';

/**
 * A rating that is falling, and today's plates against the three a day expects.
 *
 * TWO WINDOWS, NOT A TREND LINE. The last seven days against the seven before
 * them, each averaged over the plates a PERSON rated. A single bad plate does
 * not move a week's average far, which is the point: the line is for a coach
 * deciding where to spend an hour, not an alarm on one photograph.
 *
 * AI PRE-SCORES ARE NOT RATINGS and are excluded. `aiStars` is a suggestion
 * nobody has confirmed (schema.prisma:1913) — averaging it in would let the
 * scoring service, once there is one, silently write the digest.
 *
 * THE COMPARISON NEEDS BOTH SIDES. Two rated plates in each window is the floor;
 * below that "down from 4.2" is arithmetic on one meal wearing the authority of
 * a trend, and the rule says nothing instead.
 */

/** Days in each half of the comparison. */
const WINDOW_DAYS = 7;
/** Rated plates needed on each side before a difference means anything. */
const MIN_RATED = 2;
/** Stars of drop worth a coach's attention. Below this is noise. */
const DROP = 0.3;
/** The plates a day is expected to carry — Breakfast, Lunch, Dinner. */
const SLOTS_PER_DAY = 3;

const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
/** 3.5 not 3.50, and 4 not 4.0 — the demo's own number formatting. */
const stars = (n: number): string => (Math.round(n * 10) / 10).toString();

export const mealRatingDeclineRule: DigestRule = {
  key: 'mealRatingDecline',
  about: 'flags a client whose meal ratings are falling week on week',

  async run(date: Date, only?: string[]): Promise<DigestEntryInput[]> {
    const clients = await digestClients(only);
    if (!clients.length) return [];

    /* `date` is now; "logged today" needs the day it falls in. LOCAL midnight is
       correct here and must stay: this is compared against `Meal.capturedAt`, a
       plain timestamp, so the boundary wanted is the instant today began HERE. */
    const dayStart = startOfDay(todayISO(date));
    const recentFrom = new Date(date.getTime() - WINDOW_DAYS * 86_400_000);
    const priorFrom = new Date(date.getTime() - 2 * WINDOW_DAYS * 86_400_000);

    /* one read for every plate in both windows, split in memory — fourteen days
       of meals for a whole roster is a small table, and it saves a query per
       client per morning */
    const meals = await prisma.meal.findMany({
      where: {
        clientId: { in: clients.map((c) => c.id) },
        capturedAt: { gte: priorFrom },
      },
      select: { clientId: true, capturedAt: true, finalStars: true },
    });

    const byClient = new Map<string, typeof meals>();
    for (const m of meals) {
      const held = byClient.get(m.clientId);
      if (held) held.push(m);
      else byClient.set(m.clientId, [m]);
    }

    const out: DigestEntryInput[] = [];

    for (const [i, c] of clients.entries()) {
      if (c.observation) continue;
      const mine = byClient.get(c.id) ?? [];
      if (!mine.length) continue;

      const recent: number[] = [];
      const prior: number[] = [];
      let today = 0;

      for (const m of mine) {
        if (m.capturedAt >= dayStart) today += 1;
        if (m.finalStars == null) continue;
        if (m.capturedAt >= recentFrom) recent.push(m.finalStars);
        else prior.push(m.finalStars);
      }

      if (recent.length < MIN_RATED || prior.length < MIN_RATED) continue;

      const now = avg(recent);
      const was = avg(prior);
      if (was - now < DROP) continue;

      out.push({
        clientId: c.id,
        flag: 'MED',
        text:
          `Logged ${today}/${SLOTS_PER_DAY} meals today; ratings averaging ` +
          `${stars(now)} stars over the last week, down from ${stars(was)}.`,
        evidence: [`${recent.length} rated meals`, 'meal ratings'],
        position: i,
      });
    }

    return out;
  },
};
