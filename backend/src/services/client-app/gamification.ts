import { Prisma } from '@prisma/client';

import { prisma } from '../../config/prisma.js';
import { calendarDay, dateAdd, todayISO } from '../../utils/dates.js';

/**
 * THE STREAK IS DAYS THE APP WAS OPENED, AND EACH ONE IS TEN COINS.
 *
 * The streak used to be derived from kept sessions, which read as broken on a
 * phone: a client who opened the app every morning saw no fire because a coach
 * had not ticked a class. The habit being built is showing up, so that is what
 * is counted — `POST /client/checkin` runs when the app opens, writes one
 * `client_visits` row for the calendar day, and the first visit of a day is
 * worth `COINS_PER_DAY`. Every coin goes through the ledger with a reason;
 * `Client.coins` is the running sum, moved in the same transaction.
 */
export const COINS_PER_DAY = 10;
export const VISIT_REASON = 'dailyVisit';

/** How far back a run is followed — a year of daily openings is already a story. */
const LOOKBACK_DAYS = 400;

export interface Streak {
  /** the run of opened days ending today (today still counts while it is being lived) */
  days: number;
  /** the last seven calendar days, oldest first, ending on today */
  kept: boolean[];
}

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** The run and the seven flames, from the visit rows alone. */
export async function visitStreak(clientId: string, now: string = todayISO()): Promise<Streak> {
  const rows = await prisma.clientVisit.findMany({
    where: { clientId, date: { gte: calendarDay(dateAdd(now, -LOOKBACK_DAYS)) } },
    select: { date: true },
  });
  const seen = new Set(rows.map((r) => isoOf(r.date)));

  const kept: boolean[] = [];
  for (let i = 6; i >= 0; i -= 1) kept.push(seen.has(dateAdd(now, -i)));

  /* walk back from today. A day not yet opened does not end the run when it is
     today — that day is still being lived; any earlier gap does. */
  let days = 0;
  for (let i = 0; i <= LOOKBACK_DAYS; i += 1) {
    if (seen.has(dateAdd(now, -i))) days += 1;
    else if (i > 0) break;
  }
  return { days, kept };
}

/**
 * The app opened today. Idempotent within a day: the first call writes the
 * visit and the coins, every later one answers with the same balance.
 */
export async function checkIn(clientId: string, now: string = todayISO()) {
  const date = calendarDay(now);
  let awarded = 0;
  try {
    awarded = await prisma.$transaction(async (tx) => {
      const seen = await tx.clientVisit.findUnique({
        where: { clientId_date: { clientId, date } },
        select: { id: true },
      });
      if (seen) return 0;
      await tx.clientVisit.create({ data: { clientId, date } });
      await tx.coinEntry.create({ data: { clientId, amount: COINS_PER_DAY, reason: VISIT_REASON, date } });
      await tx.client.update({ where: { id: clientId }, data: { coins: { increment: COINS_PER_DAY } } });
      return COINS_PER_DAY;
    });
  } catch (e) {
    /* two opens in the same instant race to the unique index; the loser simply
       did not award — the winner already has */
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
  }
  const [streak, c] = await Promise.all([
    visitStreak(clientId, now),
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { coins: true } }),
  ]);
  return { coins: c.coins, streak, awarded };
}
