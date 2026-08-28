import { levelReviewRule } from './levelReview.rule.js';
import { mealRatingDeclineRule } from './mealRatingDecline.rule.js';
import { noLogsRule } from './noLogs.rule.js';
import { observationRule } from './observation.rule.js';
import { slaPendingRule } from './slaPending.rule.js';
import type { DigestRule } from './types.js';

/**
 * The rules, IN THE ORDER THEY WRITE.
 *
 * Order matters and is not alphabetical: it is the `position` a line gets within
 * its flag group, so two MED lines keep this sequence. Loudest source first —
 * silence, then a falling rating, then an overdue plate, then the scheduled
 * things that are not problems at all.
 */
export const DIGEST_RULES: DigestRule[] = [
  noLogsRule,
  mealRatingDeclineRule,
  slaPendingRule,
  levelReviewRule,
  observationRule,
];

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
