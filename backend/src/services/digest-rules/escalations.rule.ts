import type { AttentionSeverity, ClientLogType, NoticeKind, Prisma } from '@prisma/client';
import { slaReading } from '@haalving/shared';

import { prisma } from '../../config/prisma.js';
import * as config from '../config.service.js';
import { mealRatingDeclineRule } from './mealRatingDecline.rule.js';
import { noLogsRule } from './noLogs.rule.js';
import { digestClients } from './sources.js';

/**
 * WHAT THIS MORNING IS WORTH RAISING A TICKET ABOUT.
 *
 * The digest rules already find these conditions and write the one-line reading
 * a coach gets at 08:00. This finds the SAME conditions — by calling the same
 * rules, not by re-implementing them — and says what each one is worth as a
 * RECORD: a ticket somebody has to close, a notice somebody has to read, a log
 * row on the client's timeline, or some of the three.
 *
 * IT IS NOT A `DigestRule`, and it is deliberately absent from `DIGEST_RULES`,
 * for the reason `followupDrafter.rule.ts` gives at length about itself: a digest
 * rule produces one line per client per day, upserted on (date, clientId), and
 * `buildFor` would have to learn three unrelated tables to write what this
 * produces. It runs as its own step of the same 08:00 job, and
 * `escalations.service.raiseFor` is what actually writes the rows.
 *
 * TWO THINGS IT DOES NOT INHERIT FROM THE DIGEST, both on purpose:
 *
 *  - THE LOUDEST RULE DOES NOT KEEP THE CLIENT. One line per client per morning
 *    is a constraint on the digest (`@@unique([date, clientId])`) and a false one
 *    here: somebody who has gone quiet AND has a plate rotting in the queue has
 *    two problems, and closing one of them is not closing the other.
 *  - NOTHING IS KEYED BY THE DATE. `dedupeKey` is built from the rule and its
 *    SUBJECT, so a ticket survives the morning that raised it — which is the
 *    whole difference between a ticket and a digest line. A key that rolled over
 *    at midnight would just be a digest line with extra columns.
 */

/** Where a notice goes. `seats: null` is everybody carrying the client. */
export interface EscalationNotice {
  kind: NoticeKind;
  seats: readonly string[] | null;
  /** A whole role bench as well — the SLA ladder's escalate-to. */
  role: string | null;
}

/** The timeline row, for a condition that owns no table anywhere else. */
export interface EscalationLog {
  type: ClientLogType;
  facts: Prisma.InputJsonValue;
}

/** One condition, and what it is worth writing down. */
export interface EscalationInput {
  /** The rule that saw it — the first half of the key, and the ticket's `source`. */
  rule: string;
  clientId: string;
  /**
   * THE IDEMPOTENCY KEY, built here so it is built once. Rule plus subject, and
   * the subject is whatever the condition is actually about: a client who has
   * gone quiet, a plate that is late.
   */
  dedupeKey: string;
  title: string;
  /** The sentence a person reads — on the ticket, in the notice, on the log row. */
  text: string;
  evidence: string[];
  /** Null when the condition is worth telling somebody about and is not a ticket. */
  severity: AttentionSeverity | null;
  /** Null when nobody is told — the ticket is the whole of the record. */
  notice: EscalationNotice | null;
  /** Null when the event already owns a row somewhere else. */
  log: EscalationLog | null;
}

/**
 * The same shape as a `DigestRule` in everything but what it returns, so the job
 * can log both steps of the morning the same way.
 */
export interface EscalationRule {
  key: string;
  /** One line on what this watches, printed by the job's log. */
  about: string;
  run(date: Date, only?: string[]): Promise<EscalationInput[]>;
}

/**
 * The plate that has waited longest for each client, and how late it is.
 *
 * THE OLDEST PLATE SPEAKS FOR THE CLIENT, exactly as it does in
 * `slaPending.rule.ts`: a dietitian with three of somebody's meals in the queue
 * needs the worst number, not three tickets about one person on one morning.
 *
 * The lateness itself comes from `slaReading` — the same engine the meals board,
 * the deviations generator and the console's pills all read, so "breached" and
 * "escalated" mean here exactly what they mean on screen. The QUERY is this
 * file's own, which is the convention every caller of that engine follows.
 */
async function latePlates(date: Date, only?: string[]) {
  const [clients, sla] = await Promise.all([digestClients(only), config.getSla()]);
  if (!clients.length) return { sla, late: [] as Array<{ clientId: string; id: string; slot: string; elapsedMin: number; escalated: boolean }> };

  const byId = new Map(clients.map((c) => [c.id, c]));

  const waiting = await prisma.meal.findMany({
    where: { clientId: { in: clients.map((c) => c.id) }, finalStars: null },
    select: { id: true, clientId: true, slot: true, capturedAt: true },
    orderBy: { capturedAt: 'asc' },
  });

  const late: Array<{ clientId: string; id: string; slot: string; elapsedMin: number; escalated: boolean }> = [];
  const claimed = new Set<string>();

  for (const m of waiting) {
    if (claimed.has(m.clientId)) continue;
    const c = byId.get(m.clientId);
    if (!c) continue;

    const reading = slaReading(
      sla,
      { capturedAtMs: m.capturedAt.getTime(), rated: false, observation: c.observation },
      date.getTime(),
    );
    /* null is an observation capture — on the board to be seen, not to be
       hurried — and a plate inside its promise is not late at all */
    if (!reading?.breached) continue;

    claimed.add(m.clientId);
    late.push({
      clientId: m.clientId,
      id: m.id,
      slot: m.slot,
      elapsedMin: reading.elapsedMin,
      escalated: reading.escalated,
    });
  }

  return { sla, late };
}

export const escalationsRule: EscalationRule = {
  key: 'escalations',
  about: 'raises the tickets, notices and log rows this morning has earned',

  async run(date: Date, only?: string[]): Promise<EscalationInput[]> {
    const [quiet, falling, plates] = await Promise.all([
      /* THE RULES ARE CALLED, NOT COPIED. What counts as silence — three days, a
         plate or the client's own message, the observation window exempt — is
         one paragraph of product policy and it lives in noLogs.rule.ts. A second
         copy here would drift on the first day somebody tuned the threshold. */
      noLogsRule.run(date, only),
      mealRatingDeclineRule.run(date, only),
      latePlates(date, only),
    ]);

    const out: EscalationInput[] = [];

    for (const e of quiet) {
      out.push({
        rule: 'noLogs',
        clientId: e.clientId,
        dedupeKey: `noLogs:${e.clientId}`,
        title: 'Client has gone quiet',
        text: e.text,
        evidence: e.evidence,
        severity: 'HIGH',
        /* the WHOLE pod: silence is not one seat's problem, and the coach who
           happens to hold the fitness seat may be the one who can reach them */
        notice: { kind: 'CLIENT_RISK', seats: null, role: null },
        /*
         * THE ONE CONDITION THAT OWNS NO TABLE. Every other line in this file is
         * about a row that exists — a plate, a rating — and the timeline already
         * merges those. "Nothing happened for three days" is a fact about an
         * ABSENCE, so if the sweep does not write it down, nothing did.
         */
        log: { type: 'INACTIVITY', facts: { rule: 'noLogs', evidence: e.evidence } },
      });
    }

    for (const e of falling) {
      out.push({
        rule: 'mealRatingDecline',
        clientId: e.clientId,
        dedupeKey: `mealRatingDecline:${e.clientId}`,
        title: 'Meal ratings are falling',
        text: e.text,
        evidence: e.evidence,
        /*
         * WATCH, and no notice. A trend over two weeks is something to carry into
         * the next conversation, not something to interrupt a morning with — and
         * a sweep that pinged somebody about every drift would train the pod to
         * stop reading their notices, which costs more than this line is worth.
         */
        severity: 'WATCH',
        notice: null,
        log: null,
      });
    }

    for (const m of plates.late) {
      const overBy = m.elapsedMin - plates.sla.replyTargetMin;
      out.push({
        rule: 'mealSla',
        clientId: m.clientId,
        /*
         * KEYED ON THE PLATE, not on the client. A client whose lunch was late on
         * Monday and whose dinner is late on Thursday has been let down twice, and
         * a client-keyed row would report the second as the first still standing.
         */
        dedupeKey: `mealSla:${m.id}`,
        title: m.escalated ? 'Plate escalated past its SLA' : 'Plate past its rating promise',
        text: `${m.slot} awaiting rating — ${overBy} min past the ${plates.sla.replyTargetMin}-minute promise.`,
        evidence: ['meal queue', 'SLA config'],
        /*
         * A TICKET ONLY ONCE THE LADDER HAS ESCALATED. Breaching the reply target
         * is what the notice is for: the dietitian is being told their queue is
         * late, and most of those are rated within the hour. A ticket somebody
         * must close belongs to the plate that went past the nudge AND the
         * escalation window — the point at which the demo's own ladder stops
         * asking the seat and starts telling the role above it.
         */
        severity: m.escalated ? 'HIGH' : null,
        notice: {
          kind: 'SLA_BREACH',
          seats: ['dietitian'],
          role: m.escalated ? plates.sla.escalateToRole : null,
        },
        log: null,
      });
    }

    return out;
  },
};
