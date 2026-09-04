import { prisma } from '../config/prisma.js';
import { logger } from '../utils/logger.js';
import * as attention from './attention.service.js';
import { escalationsRule, type EscalationInput } from './digest-rules/escalations.rule.js';
import * as notice from './notice.service.js';

/**
 * Write what this morning's escalations rule found. The mirror of `draftFor`.
 *
 * `escalations.rule.ts` decides WHAT each condition is worth — a ticket, a
 * notice, a log row, and the key each of them dedupes on. This decides nothing;
 * it writes, in the one order the three records can be written in, and reports
 * the numbers the job logs.
 *
 * IDEMPOTENCY IS A DATABASE FACT HERE, NOT A CODE CONVENTION. Nothing below
 * checks whether it has run today. `Attention.dedupeKey` is unique and
 * `Notice.(toId, dedupeKey)` is unique, so a second run of the same morning
 * UPDATES the rows the first one wrote — and a third run started by hand after
 * a restart does the same. The one thing that is not a database fact is the log
 * row (a timeline is an append-only list and cannot dedupe itself), so the
 * INACTIVITY row is written only when the ticket beside it is genuinely new.
 *
 * THE ORDER IS FORCED BY THE FOREIGN KEYS AND BY THE MEANING, in that order:
 *
 *   1. the log row, because the ticket and the notice both point back at it
 *   2. the ticket, because the notice announces it and needs its id
 *   3. the notice, which is the only one of the three a person is interrupted by
 *
 * A NEW TICKET IS WORTH A NOTICE; THE FOURTH MORNING OF THE SAME ONE IS NOT.
 * That is what `created` off `attention.raise` is for, and it is also what makes
 * a RECURRENCE audible: closing a ticket retires its key, so a condition that
 * comes back gets a new ticket, `created` is true again, and the notice that had
 * been read is stood back up rather than quietly refreshed underneath somebody.
 */

export interface EscalationCounts {
  attentions: number;
  notices: number;
  logs: number;
}

/**
 * One condition, written down.
 *
 * Split out per escalation rather than batched, because the three writes are
 * chained — a log id into a ticket, a ticket id into a notice — and one client's
 * failure must not cost the rest of the roster its morning.
 */
async function writeOne(e: EscalationInput, counts: EscalationCounts): Promise<void> {
  /*
   * IS THIS CONDITION NEW? Asked of the ticket rather than of the log, because
   * the ticket is the row with the unique key on it. A closed ticket has already
   * had its key retired (`attention.service.act`), so a recurrence finds nothing
   * standing — the second half of the test is the belt to that braces, and costs
   * one comparison.
   */
  const standing = e.severity
    ? await prisma.attention.findUnique({
        where: { dedupeKey: e.dedupeKey },
        select: { status: true },
      })
    : null;
  const fresh = !standing || standing.status === 'RESOLVED' || standing.status === 'DISMISSED';

  let logId: string | null = null;
  if (e.log && fresh) {
    const row = await prisma.clientLog.create({
      data: {
        clientId: e.clientId,
        /* null: the writer was the 08:00 job, and naming a person here would put
           somebody's name on a decision nobody made */
        actorId: null,
        type: e.log.type,
        title: e.title,
        description: e.text,
        metadata: e.log.facts,
      },
      select: { id: true },
    });
    logId = row.id;
    counts.logs += 1;
  }

  let attentionId: string | null = null;
  let raised = false;
  if (e.severity) {
    const { row, created } = await attention.raise({
      clientId: e.clientId,
      dedupeKey: e.dedupeKey,
      source: e.rule,
      severity: e.severity,
      title: e.title,
      description: e.text,
      evidence: e.evidence,
      relatedLogId: logId,
    });
    attentionId = row.id;
    raised = created;
    if (created) counts.attentions += 1;
  }

  if (!e.notice) return;

  /*
   * ADDRESSED AT A SEAT, one raise per seat, so `targetRole` is true of every
   * row it writes. The board can then still say which seat a notice was meant
   * for after somebody else has taken it — which is the only reason that column
   * exists beside `toId`.
   */
  const bySeat = new Map<string, string[]>();
  const pod = await notice.podRecipients([e.clientId], e.notice.seats ?? undefined);
  for (const r of pod.get(e.clientId) ?? []) {
    const held = bySeat.get(r.seat);
    if (held) held.push(r.staffId);
    else bySeat.set(r.seat, [r.staffId]);
  }
  if (e.notice.role) {
    bySeat.set(e.notice.role, await notice.roleRecipients(e.notice.role));
  }

  for (const [seat, toIds] of bySeat) {
    const { created } = await notice.raise({
      toIds,
      kind: e.notice.kind,
      title: e.title,
      text: e.text,
      severity: e.severity,
      clientId: e.clientId,
      attentionId,
      relatedLogId: logId,
      /* the same key the ticket dedupes on: one person, one condition, one line
         in their outbox however many mornings it takes to fix */
      dedupeKey: e.dedupeKey,
      targetRole: seat,
      reopen: raised,
    });
    counts.notices += created;
  }
}

/**
 * Raise everything this morning has earned.
 *
 * `only` narrows the round to named clients, the same contract every digest rule
 * honours — it is what lets a test put one client in front of the sweep without
 * writing a ticket about the other two hundred.
 */
export async function raiseFor(date: Date = new Date(), only?: string[]): Promise<EscalationCounts> {
  const found = await escalationsRule.run(date, only);
  const counts: EscalationCounts = { attentions: 0, notices: 0, logs: 0 };

  for (const e of found) {
    try {
      await writeOne(e, counts);
    } catch (err) {
      /* one client's escalation failing must not cost the rest of the roster
         theirs — the same bargain `buildFor` strikes with a failing rule */
      logger.error(
        { rule: e.rule, clientId: e.clientId, err: (err as Error).message },
        'escalation failed',
      );
    }
  }

  return counts;
}
