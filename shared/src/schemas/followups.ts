import { z } from 'zod';

/**
 * Follow-ups — the message somebody means to send a client, before it is sent.
 *
 * These bodies validate the WORDS and nothing else. Whether a draft may go out,
 * whether it needs an approver first, and what the client's room does with it
 * are decisions the service makes from the row's own source and status — which
 * is why neither `source` nor `status` appears in any schema here. A request
 * body that could name them would let a coach post an AI draft and skip the
 * review step the whole feature is built around.
 */

/**
 * The text of a draft, wherever it is written or rewritten.
 *
 * Trimmed BEFORE the length check, so a body of spaces is empty rather than
 * long and `min(1)` means what it says. 600 characters is a deliberate ceiling
 * rather than a generous one: the demo's own drafts (data.js:1769) run to two
 * sentences, and a follow-up that needs more than a paragraph is a conversation
 * someone should be having in the client's room instead.
 */
const followupText = z
  .string()
  .trim()
  .min(1, 'A follow-up needs something to say')
  .max(600, 'Keep a follow-up under 600 characters');

/**
 * Writing one by hand.
 *
 * `sendNow` is a REQUEST, not an instruction: a coach's own draft still needs an
 * approver, so the service is free to record a submission where this asked for a
 * send. It lives on the create body rather than behind a second endpoint because
 * for the roles that may do both, writing and sending is one action
 * (console-digest.js:37) — and splitting it would leave a half-written draft in
 * the database every time the second call failed.
 */
export const createFollowupSchema = z.object({
  clientId: z.string().min(1),
  text: followupText,
  sendNow: z.boolean().optional(),
});
export type CreateFollowupInput = z.infer<typeof createFollowupSchema>;

/**
 * Editing one.
 *
 * The text and only the text. `originalText` is set once when the draft is
 * created and never written again — the demo promises "your edit is part of the
 * record", and that promise is only true if the words edited FROM survive — so
 * no request body may name that column.
 */
export const editFollowupSchema = z.object({
  text: followupText,
});
export type EditFollowupInput = z.infer<typeof editFollowupSchema>;

/**
 * The five dismissal reasons, in the demo's order and its wording
 * (console-digest.js:647).
 *
 * A CLOSED list, on purpose. A dismissal is a training signal — the reason a
 * copilot draft was refused is counted, and free text cannot be counted. The
 * order is kept because it is the order the picker offers them in.
 */
export const DISMISS_REASONS = [
  'ALREADY_HANDLED_IN_PERSON',
  'CLIENT_REACHED_OUT_FIRST',
  'NOT_THE_RIGHT_MOMENT',
  'TONE_NEEDS_REWORK',
  'DUPLICATE_NUDGE',
] as const;

export const dismissReasonEnum = z.enum(DISMISS_REASONS);

/** Refusing an AI draft. The reason is required — an uncounted dismissal teaches nothing. */
export const dismissFollowupSchema = z.object({
  reason: dismissReasonEnum,
});
export type DismissFollowupInput = z.infer<typeof dismissFollowupSchema>;

/**
 * Sending one back to its author.
 *
 * The note is REQUIRED and short. A draft returned with nothing said is a draft
 * the author has to guess at, and the note is the thing they will edit against;
 * 300 characters keeps it a correction rather than a rewrite of the draft in the
 * margin.
 */
export const returnFollowupSchema = z.object({
  note: z.string().trim().min(1, 'Say what needs changing').max(300),
});
export type ReturnFollowupInput = z.infer<typeof returnFollowupSchema>;

/**
 * Approving one, with the approver's last word.
 *
 * `text` is optional and means "approve THESE words instead". An approver who
 * only wants to fix a comma should not have to send the draft back for it and
 * wait for a round trip; left out, the draft goes as its author wrote it.
 */
export const approveFollowupSchema = z.object({
  text: followupText.optional(),
});
export type ApproveFollowupInput = z.infer<typeof approveFollowupSchema>;

/**
 * Send-all, from the digest.
 *
 * The EXACT ids that were on screen, never "send every draft that is ready" —
 * the same rule `markSeenSchema` follows in home.ts, and for the same reason: a
 * draft that arrived while the page was open must not go to a client because
 * somebody pressed a button that predated it. The cap bounds the write and sits
 * far above the largest console anyone reads in one sitting.
 */
export const sendAllFollowupsSchema = z.object({
  ids: z.array(z.string().min(1).max(200)).min(1).max(200),
});
export type SendAllFollowupsInput = z.infer<typeof sendAllFollowupsSchema>;
