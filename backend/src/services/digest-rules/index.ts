/**
 * The digest rules, gathered.
 *
 * A barrel and nothing more: the order lives in `order.ts` so the drafter can
 * read the decoder without importing this file, which exports the drafter.
 */

export { DIGEST_RULES, RULE_STRIDE, ruleOf } from './order.js';
export type { DigestRule, DigestEntryInput } from './types.js';

/**
 * The follow-up drafter, exported ALONGSIDE the list rather than inside it.
 *
 * It is not a `DigestRule` — it produces FollowupDraft rows, not DigestEntry
 * rows — so `buildFor` cannot run it and does not try. It runs as its own step
 * in the same 08:00 job, after the build it reads. The file says why at length.
 */
export { followupDrafterRule } from './followupDrafter.rule.js';
export type { FollowupDrafterRule, FollowupDraftInput } from './followupDrafter.rule.js';

/**
 * The escalations sweep, exported the same way and for the same reason.
 *
 * It is not a `DigestRule` either — it produces tickets, notices and log rows,
 * which `buildFor` has no business upserting — and it CALLS two of the rules
 * above rather than joining them. Its own step in the same 08:00 job;
 * `escalations.service.raiseFor` is what writes what it finds.
 */
export { escalationsRule } from './escalations.rule.js';
export type { EscalationRule, EscalationInput } from './escalations.rule.js';

export { FOLLOWUP_TEMPLATES, draftText } from './followup-templates.js';
export type { FollowupTemplate, DraftFacts } from './followup-templates.js';
