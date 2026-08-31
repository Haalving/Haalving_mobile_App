import { z } from 'zod';

import { MAX_VOICE_SEC, MIN_VOICE_SEC } from '../queues.js';
import { pillarEnum } from './common.js';
import { chainKindEnum } from './config.js';

/**
 * Work Queues — the bodies the six boards accept.
 *
 * These schemas assert SHAPE and nothing that depends on the row. Whether a
 * signature is the caller's to give, whether a rating below five stars carries
 * the note it owes, and whether a summary has anything in it to sign are all
 * decided in `queues.service.ts`, because each of them is a question about the
 * record rather than about the request — and a rule split across two files is a
 * rule that will one day be enforced by only one of them.
 *
 * The one exception is the voice note's floor and cap. Those are properties of
 * the RECORDER, not of the meal, so they belong on the request: a body claiming
 * a four-second voice note is describing a recording the console cannot make.
 */

/* ---------------------------------------------------------------- work list */

/**
 * The chip row above the work list (console-ops.js:47), as a query.
 *
 * Every filter is optional and `status` is NOT defaulted here, even though the
 * console opens on Open: a default in the schema would mean a caller asking for
 * everything silently got only the open rows. The service defaults it instead,
 * where the choice can be stated out loud.
 */
export const worklistQuery = z.object({
  status: z.enum(['OPEN', 'DONE', 'ALL']).optional(),
  pillar: pillarEnum.optional(),
  type: z.enum(['TASK', 'RATING', 'REVIEW', 'REPORT']).optional(),
  /** Only honoured for a caller who can see everybody's work — see the service. */
  ownerId: z.string().min(1).max(200).optional(),
});
export type WorklistQuery = z.infer<typeof worklistQuery>;

/* ---------------------------------------------------------------- approvals */

/**
 * Raising one.
 *
 * `type` is the CHAIN KIND, because on an approval they are the same thing —
 * a diet plan collects the diet chain and there is no third option. There is
 * deliberately no `chain` field and no `stage`: the chain is snapshotted by the
 * service from Configuration's current one, and a request that could name its
 * own chain could name a shorter one.
 *
 * `ownerId` is absent for the same reason. The owner is the caller.
 *
 * Either a `clientId` or a `prospect` — the service refuses a sign-off about
 * nobody, and a goal sheet for somebody who has not been onboarded yet is a real
 * and common case (data.js:1645).
 */
export const createApprovalSchema = z.object({
  type: chainKindEnum,
  title: z.string().trim().min(1).max(200),
  clientId: z.string().min(1).max(200).nullish(),
  prospect: z.string().trim().min(1).max(120).nullish(),
  pillar: pillarEnum.nullish(),
  /** In the requester's own words — 'Day 10 @ 12:00'. See the column's comment. */
  due: z.string().trim().min(1).max(120),
  /** The copilot's proposal. Empty is honest when nothing drafted it. */
  aiDraft: z.string().trim().max(4000).default(''),
});
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;

/**
 * A note on a signature.
 *
 * OPTIONAL, and the sheet says so — "Note (optional) — travels with the audit
 * trail". A signature is a decision on its own; making somebody type a sentence
 * to agree would fill the trail with the word "ok".
 */
export const approvalNoteSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type ApprovalNoteInput = z.infer<typeof approvalNoteSchema>;

/**
 * Returning one to its owner.
 *
 * The reason is REQUIRED — "A return never travels empty-handed: the owner sees
 * exactly what to fix" (console-approvals.js:136), and the demo's own button
 * stays disabled until something is typed. Here it is the rule rather than the
 * button's opinion.
 */
export const returnApprovalSchema = z.object({
  reason: z.string().trim().min(1, 'Say what needs changing').max(1000),
});
export type ReturnApprovalInput = z.infer<typeof returnApprovalSchema>;

/* -------------------------------------------------------------------- meals */

/**
 * A human rating on a plate.
 *
 * `stars` is one to five and nothing else: the star row offers five and the AI's
 * pre-score is a ghost behind them, never a sixth option. There is deliberately
 * no field for "confirm the AI's score" — a one-tap confirm and an override are
 * the same act with the same body, and which of the two it was is read by
 * comparing `stars` against the pre-score already on the row.
 */
export const rateMealSchema = z.object({
  stars: z.number().int().min(1).max(5),
  /**
   * The coaching note. Required below five stars, but not HERE: whether it is
   * required depends on the star count and on whether a voice note came with it,
   * and the service asks `ratingNoteSatisfied` once for all three.
   */
  note: z.string().trim().max(2000).optional(),
  /**
   * Seconds of recorded voice. The floor and the cap are the recorder's own,
   * printed under the button as "10 s min · 30 s cap" — a body outside them
   * describes a recording that could not have been made.
   */
  voiceSec: z.number().int().min(MIN_VOICE_SEC).max(MAX_VOICE_SEC).optional(),
});
export type RateMealInput = z.infer<typeof rateMealSchema>;

/* ------------------------------------------------------------------ medical */

/** One line of a health summary — a condition, a flag or a metric. */
const summaryLine = z.string().trim().min(1).max(200);

/**
 * Signing a health summary.
 *
 * THE THREE GROUPS ARE THE WHOLE SUMMARY (console-medical.js:29) and each may be
 * empty — a knee MRI has a flag and no metric worth trending. What may not
 * happen is signing all three empty, and that is the service's check rather than
 * a `refine` here: the demo says it in a sentence a person reads ("Add at least
 * one condition, flag or metric before signing"), and the service is where this
 * port keeps sentences that name what to do next.
 *
 * `flags` is the one group with a second life: the chart and diet builders read
 * it to exclude what a client must not be given, which is why a contraindication
 * is a line in a list rather than a paragraph of prose.
 */
export const signSummarySchema = z.object({
  conditions: z.array(summaryLine).max(50).default([]),
  flags: z.array(summaryLine).max(50).default([]),
  metrics: z.array(summaryLine).max(50).default([]),
});
export type SignSummaryInput = z.infer<typeof signSummarySchema>;

/* ------------------------------------------------------- creating work */

/**
 * A line of work somebody puts on a desk.
 *
 * `ownerId` IS REQUIRED and there is no default. Assigning to yourself is the
 * common case, but making it implicit would mean a slip of the finger silently
 * files somebody else's job under your name — and the queue's whole premise is
 * that a row names one accountable person. The console fills it with the caller
 * by default; the body still has to say so.
 *
 * There is deliberately NO `status`: work is created open, and closing it is the
 * `done` door, which records who closed it and when.
 *
 * There is also no `sourceRule`. A person typing a task is not a rule, and a
 * body that could claim to be one would let the audit trail be forged from
 * outside.
 */
export const createWorkSchema = z.object({
  text: z.string().trim().min(1, 'Say what needs doing.').max(400),
  ownerId: z.string().trim().min(1).max(200),
  clientId: z.string().trim().min(1).max(200).nullish(),
  pillar: pillarEnum.nullish(),
  type: z.enum(['TASK', 'RATING', 'REVIEW', 'REPORT']).default('TASK'),
  /**
   * The deadline as a person says it — "today", "13:00 · 23 min". Free text for
   * the reason the column is: the three the demo carries are read against three
   * different clocks.
   */
  due: z.string().trim().max(60).default('today'),
  /** The tone that label wears. The console offers these three. */
  pill: z.enum(['info', 'warn', 'bad']).default('info'),
});
export type CreateWorkInput = z.infer<typeof createWorkSchema>;
