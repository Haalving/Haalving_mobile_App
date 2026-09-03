import { prisma } from '../../config/prisma.js';
import * as config from '../config.service.js';
import { digestClients } from './sources.js';
import type { DigestEntryInput, DigestRule } from './types.js';

/**
 * A plate still waiting for a person, past the minutes it was promised.
 *
 * THE SAME CLOCK THE MEALS BOARD READS — `Meal.capturedAt` against
 * `SlaConfig.replyTargetMin`, live from config rather than a constant, so
 * changing the promise in Configuration changes what the digest calls late on
 * the same morning. Two screens disagreeing about whether lunch is overdue is
 * the exact drift a shared clock exists to prevent.
 *
 * A PLATE IS WAITING EXACTLY WHILE IT HAS NO STARS FROM A PERSON. `finalStars`
 * alone tests that (schema.prisma:1928); an AI pre-score is not a rating and
 * does not stop the clock.
 *
 * The OLDEST waiting plate speaks for the client. A coach with three of somebody's
 * meals in the queue needs the worst number, not three lines about one person —
 * and the digest keeps one line per client per morning anyway.
 */

export const slaPendingRule: DigestRule = {
  key: 'slaPending',
  about: 'flags a client with a plate past its rating SLA',

  async run(date: Date, only?: string[]): Promise<DigestEntryInput[]> {
    const clients = await digestClients(only);
    if (!clients.length) return [];

    const sla = await config.getSla();
    const dueBy = new Date(date.getTime() - sla.replyTargetMin * 60_000);

    const waiting = await prisma.meal.findMany({
      where: {
        clientId: { in: clients.map((c) => c.id) },
        finalStars: null,
        capturedAt: { lt: dueBy },
      },
      select: { clientId: true, slot: true, capturedAt: true },
      orderBy: { capturedAt: 'asc' },
    });
    if (!waiting.length) return [];

    /* oldest first from the query, so the first plate seen for a client is the
       one that has waited longest */
    const oldest = new Map<string, (typeof waiting)[number]>();
    for (const m of waiting) if (!oldest.has(m.clientId)) oldest.set(m.clientId, m);

    const out: DigestEntryInput[] = [];

    for (const [i, c] of clients.entries()) {
      const m = oldest.get(c.id);
      if (!m) continue;

      const overBy = Math.round((date.getTime() - m.capturedAt.getTime()) / 60_000) - sla.replyTargetMin;

      out.push({
        clientId: c.id,
        flag: 'MED',
        text: `${m.slot} awaiting rating — ${overBy} min past the ${sla.replyTargetMin}-minute promise.`,
        evidence: ['meal queue', 'SLA config'],
        position: i,
      });
    }

    return out;
  },
};
