import { z } from 'zod';

/**
 * Attention — the bodies the ticket board accepts.
 *
 * A ticket is not a digest line. The digest is written by the 08:00 round and
 * read; this is a record somebody OWNS until they close it, so every body here
 * is about a person taking an act rather than about a reading being refreshed.
 *
 * These schemas assert SHAPE and nothing that depends on the row. Whether the
 * caller may raise a ticket about this client, whether a close is owed a reason,
 * and whether an assignment may name somebody else are all decided in
 * `attention.service.ts` — the console is one caller, the 08:00 sweep is
 * another, and a rule enforced in a request body is a rule the sweep never sees.
 */

/**
 * The four, loudest last, because that is the order the enum is declared in and
 * the order `severity: 'desc'` therefore sorts by. Exported as an array so the
 * console's pills read from the same list the API validates against.
 */
export const ATTENTION_SEVERITIES = ['INFO', 'WATCH', 'HIGH', 'CRITICAL'] as const;
export const attentionSeverityEnum = z.enum(ATTENTION_SEVERITIES);
export type AttentionSeverityKey = (typeof ATTENTION_SEVERITIES)[number];

/**
 * The five, in the order a ticket walks them.
 *
 * RESOLVED and DISMISSED are both closed and are NOT the same close — the
 * condition was dealt with, versus it was never a problem — and the next
 * recurrence is read against the difference.
 */
export const ATTENTION_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
  'DISMISSED',
] as const;
export const attentionStatusEnum = z.enum(ATTENTION_STATUSES);
export type AttentionStatusKey = (typeof ATTENTION_STATUSES)[number];

/**
 * The five doors, and there is deliberately no sixth that names a status
 * directly.
 *
 * A body carrying `status: 'RESOLVED'` would be a client deciding a transition
 * is legal; an ACTION is a client asking for one and the service deciding. That
 * is what keeps "resolved without a reason" and "reopened by a PATCH" from being
 * expressible at all.
 */
export const ATTENTION_ACTIONS = ['acknowledge', 'start', 'resolve', 'dismiss', 'assign'] as const;
export const attentionActionEnum = z.enum(ATTENTION_ACTIONS);
export type AttentionActionKey = (typeof ATTENTION_ACTIONS)[number];

/**
 * The board's chip row and its page, as a query.
 *
 * `status` is NOT defaulted here, the same choice `worklistQuery` makes: a
 * default in the schema would mean a caller asking for everything silently got
 * only the live rows. The service defaults it, where the choice can be said out
 * loud — and `ALL` is how a caller asks past that default.
 *
 * The cursor is opaque to everyone but the service: it is the id of the last row
 * of the previous page, and nothing outside `attention.service.ts` may assume
 * that, because the day the board's order changes is the day it stops being true.
 */
export const listAttentionsQuery = z.object({
  status: z.enum([...ATTENTION_STATUSES, 'ALL']).optional(),
  severity: attentionSeverityEnum.optional(),
  clientId: z.string().min(1).max(200).optional(),
  /** `me` is resolved to the caller by the service — a board's "mine" chip. */
  assignedToId: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).max(200).optional(),
});
export type ListAttentionsQuery = z.infer<typeof listAttentionsQuery>;

/**
 * Raising one by hand.
 *
 * There is no `source` and no `dedupeKey`. Both are the SERVER'S account of
 * where a ticket came from: a body that could claim `source: 'noLogs'` would let
 * a person's opinion arrive wearing the sweep's name, and a body that could name
 * its own dedupe key could silence tomorrow's sweep by taking the key it needs.
 *
 * There is no `status` either — a ticket is raised OPEN, and closing it is the
 * PATCH door, which records who closed it, when, and why.
 */
export const createAttentionSchema = z.object({
  clientId: z.string().min(1).max(200),
  severity: attentionSeverityEnum,
  title: z.string().trim().min(1, 'Say what needs attention').max(200),
  description: z.string().trim().min(1, 'Say what is happening').max(2000),
  /**
   * The parts, unjoined — the row prints them with ' · ' between, exactly as a
   * digest line does. Optional because a human raising a ticket has usually just
   * said the whole of it in `description`.
   */
  evidence: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  /** Optional at birth: a ticket may be handed over later, and usually is. */
  assignedToId: z.string().min(1).max(200).nullish(),
  /**
   * A MOMENT, not a calendar day, which is why this is not `isoDate` — "by
   * Friday lunchtime" is a real thing to promise about a ticket and the product's
   * date strings cannot carry it.
   */
  dueAt: z.coerce.date().optional(),
});
export type CreateAttentionInput = z.infer<typeof createAttentionSchema>;

/**
 * Moving one.
 *
 * `resolutionReason` is OPTIONAL HERE AND CONDITIONALLY REQUIRED IN THE SERVICE,
 * the same split `assignPodSeatSchema` makes and for the same reason: which
 * actions owe a reason is a rule about the transition, not about the shape of
 * this body, and a rule stated in two files is a rule one of them will one day
 * stop enforcing. What lives here is the shape — trimmed, 4–500 characters if
 * given at all, which rejects the one-word "n/a" a required field otherwise
 * collects. `resolve` and `dismiss` demand one; the service says so in a sentence.
 *
 * `assignedToId` is `nullish` rather than optional so that null can mean
 * something: handing a ticket back to the pod is a real act, and it is not the
 * same as leaving the field out.
 */
export const patchAttentionSchema = z.object({
  action: attentionActionEnum,
  assignedToId: z.string().min(1).max(200).nullish(),
  resolutionReason: z.string().trim().min(4).max(500).optional(),
});
export type PatchAttentionInput = z.infer<typeof patchAttentionSchema>;
