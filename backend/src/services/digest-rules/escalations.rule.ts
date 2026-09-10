import type { AttentionSeverity, ClientLogType, NoticeKind, Prisma } from '@prisma/client';
import { slaReading } from '@haalving/shared';

import { prisma } from '../../config/prisma.js';
import * as config from '../config.service.js';
import { mealRatingDeclineRule } from './mealRatingDecline.rule.js';
import { noLogsRule } from './noLogs.rule.js';
import { dateAdd, startOfDay, toISODate, todayISO } from '../../utils/dates.js';
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
  /** Whole role benches as well — the SLA ladder's escalate-to, the overseer. */
  roles: readonly string[];
  /** Named people — a task's owner — filed under the seat name `owner`. */
  users?: readonly string[];
}

/**
 * THE OVERSEER — who is told when the coaches' own work slips, and when a
 * client stops sending plates. The Super Admin's role key: the seat that owns
 * onboarding, allocates pods and answers for the roster.
 */
const OVERSEER_ROLE = 'admin';

/** Days a rule-raised task may stand undone before the overseer is told. */
export const WORK_OVERDUE_DAYS = 2;

/**
 * Rule-raised work the SLA ladder already escalates on its own clock — a plate
 * waiting for a rating is chased by `mealSla` above, minute by minute, and a
 * second ticket about the same plate two days later would be the same fact
 * told twice.
 */
const WORK_OWNED_BY_SLA = ['mealRating'];

/** Plates a day asks for at the least — breakfast, lunch, dinner. */
const PLATES_A_DAY = 3;
/** Plates missed in a row that earn a ticket. */
export const MISSED_PLATES = 3;

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

interface LatePlate {
  /** The meal's own id — the subject half of the key this condition dedupes on. */
  id: string;
  clientId: string;
  slot: string;
  elapsedMin: number;
  escalated: boolean;
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
async function latePlates(date: Date, only?: string[]): Promise<{
  sla: Awaited<ReturnType<typeof config.getSla>>;
  late: LatePlate[];
}> {
  const [clients, sla] = await Promise.all([digestClients(only), config.getSla()]);
  if (!clients.length) return { sla, late: [] };

  const byId = new Map(clients.map((c) => [c.id, c]));

  const waiting = await prisma.meal.findMany({
    where: { clientId: { in: clients.map((c) => c.id) }, finalStars: null },
    select: { id: true, clientId: true, slot: true, capturedAt: true },
    orderBy: { capturedAt: 'asc' },
  });

  const late: LatePlate[] = [];
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

/**
 * THE COACHES' OWN WORK, WHEN IT SLIPS.
 *
 * A rule puts a task on a coach's desk — "allocate cycle 5's template for
 * Rajesh D." on day 13 — and for two days that is between the coach and their
 * list. Past that the client is about to open an empty day, and the person who
 * answers for the roster has to know. So every rule-raised, client-bound piece
 * of work still standing after `WORK_OVERDUE_DAYS` becomes a ticket on the
 * client and a notice to the overseer and to the coach holding it.
 *
 * Undated rows only: a dated row is a session or a duty on the Schedule, with
 * its own done-per-day rhythm, and "not done for two days" is not a fact about
 * it. And nothing the SLA ladder already chases — see `WORK_OWNED_BY_SLA`.
 */
async function overdueCoachWork(date: Date, only?: string[]): Promise<EscalationInput[]> {
  const before = new Date(date.getTime() - WORK_OVERDUE_DAYS * 86_400_000);
  const tasks = await prisma.task.findMany({
    where: {
      sourceRule: { not: null },
      date: null,
      clientId: only ? { in: only } : { not: null },
      client: { is: { status: 'active' } },
      createdAt: { lte: before },
      dones: { none: {} },
    },
    select: {
      id: true,
      title: true,
      due: true,
      createdAt: true,
      clientId: true,
      sourceRule: true,
      ownerId: true,
      owner: { select: { name: true } },
    },
  });

  const out: EscalationInput[] = [];
  for (const t of tasks) {
    const rule = t.sourceRule ?? '';
    if (!t.clientId || WORK_OWNED_BY_SLA.some((p) => rule.startsWith(p))) continue;
    const days = Math.floor((date.getTime() - t.createdAt.getTime()) / 86_400_000);
    out.push({
      rule: 'workOverdue',
      clientId: t.clientId,
      /* keyed on the TASK: two pieces of work on one client are two tickets,
         and a task done and raised again next cycle is a new one */
      dedupeKey: `workOverdue:${t.id}`,
      title: `Coach work overdue: ${t.title}`,
      text:
        (t.owner ? `${t.owner.name} has held` : 'Nobody holds') +
        ` “${t.title}” for ${days} days and it is not done` +
        (t.due ? ` (${t.due}).` : '.'),
      evidence: ['work list', rule],
      severity: 'HIGH',
      /* the overseer, and the coach it is sitting with — not the whole pod,
         whose other seats have their own work */
      notice: {
        kind: 'TASK',
        seats: [],
        roles: [OVERSEER_ROLE],
        users: t.ownerId ? [t.ownerId] : [],
      },
      log: null,
    });
  }
  return out;
}

/**
 * PLATES NOT COMING IN.
 *
 * The product asks for a photograph of every meal, and `MISSED_PLATES` of them
 * in a row is when the pod AND the overseer are told, as a ticket somebody has
 * to close. Counted in COMPLETED DAYS, the way `noMealDay` counts: the sweep
 * runs before breakfast, so today can never be judged, and a completed day with
 * no plate is at least `PLATES_A_DAY` meals missed back to back — breakfast,
 * lunch and dinner. A plate logged this morning clears it: there is nothing to
 * chase.
 *
 * A CLIENT ALREADY FLAGGED QUIET IS LEFT TO THAT TICKET. Three days of nothing
 * at all is the louder, longer condition and it already reaches the pod; a
 * second ticket saying "and no plates either" would be the same silence twice.
 */
async function missedPlates(
  date: Date,
  only: string[] | undefined,
  quiet: ReadonlySet<string>,
): Promise<EscalationInput[]> {
  const clients = await digestClients(only);
  if (!clients.length) return [];

  const today = todayISO(date);
  const daysNeeded = Math.max(1, Math.ceil(MISSED_PLATES / PLATES_A_DAY));

  const meals = await prisma.meal.findMany({
    where: {
      clientId: { in: clients.map((c) => c.id) },
      capturedAt: { gte: startOfDay(dateAdd(today, -daysNeeded)) },
    },
    select: { clientId: true, capturedAt: true },
  });
  /* bucketed by LOCAL calendar day — see noMealDay.rule.ts for why not UTC */
  const days = new Map<string, Set<string>>();
  for (const m of meals) {
    const set = days.get(m.clientId);
    if (set) set.add(toISODate(m.capturedAt));
    else days.set(m.clientId, new Set([toISODate(m.capturedAt)]));
  }

  const out: EscalationInput[] = [];
  for (const c of clients) {
    if (c.observation || quiet.has(c.id)) continue;
    const mine = days.get(c.id) ?? new Set<string>();
    if (mine.has(today)) continue;
    /* never a day that precedes the client */
    const firstDay = toISODate(c.onboardedAt ?? c.createdAt);
    let missedDays = 0;
    for (let back = 1; back <= daysNeeded; back += 1) {
      const iso = dateAdd(today, -back);
      if (iso < firstDay || mine.has(iso)) break;
      missedDays += 1;
    }
    if (missedDays < daysNeeded) continue;
    out.push({
      rule: 'missedPlates',
      clientId: c.id,
      dedupeKey: `missedPlates:${c.id}`,
      title: 'Meals not being logged',
      text:
        `No plate logged ${daysNeeded === 1 ? 'yesterday' : `in the last ${daysNeeded} days`}` +
        ` — at least ${missedDays * PLATES_A_DAY} meals missed in a row — and nothing yet today.`,
      evidence: ['meal log'],
      severity: 'HIGH',
      /* the whole pod, and the overseer */
      notice: { kind: 'CLIENT_RISK', seats: null, roles: [OVERSEER_ROLE] },
      log: null,
    });
  }
  return out;
}

export const escalationsRule: EscalationRule = {
  key: 'escalations',
  about:
    'raises the tickets, notices and log rows this morning has earned — silence, falling ratings, late plates, missed plates, overdue coach work',

  async run(date: Date, only?: string[]): Promise<EscalationInput[]> {
    const [quiet, falling, plates, overdue] = await Promise.all([
      /* THE RULES ARE CALLED, NOT COPIED. What counts as silence — three days, a
         plate or the client's own message, the observation window exempt — is
         one paragraph of product policy and it lives in noLogs.rule.ts. A second
         copy here would drift on the first day somebody tuned the threshold. */
      noLogsRule.run(date, only),
      mealRatingDeclineRule.run(date, only),
      latePlates(date, only),
      overdueCoachWork(date, only),
    ]);
    /* after the silence rule has spoken — it decides who this one leaves alone */
    const unfed = await missedPlates(date, only, new Set(quiet.map((e) => e.clientId)));

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
        notice: { kind: 'CLIENT_RISK', seats: null, roles: [] },
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
          roles: m.escalated ? [plates.sla.escalateToRole] : [],
        },
        log: null,
      });
    }

    out.push(...overdue, ...unfed);

    return out;
  },
};
