import { levelReviewRule } from './levelReview.rule.js';
import { mealRatingDeclineRule } from './mealRatingDecline.rule.js';
import { noLogsRule } from './noLogs.rule.js';
import { observationRule } from './observation.rule.js';
import { slaPendingRule } from './slaPending.rule.js';
import type { DigestRule } from './types.js';

/**
 * The rules, IN THE ORDER THEY WRITE.
 *
 * Order matters and is not alphabetical. It decides two things: the `position` a
 * line gets within its flag group, so two MED lines keep this sequence — and,
 * because one client may have only one line a morning, WHICH RULE KEEPS A CLIENT
 * when two of them have something to say. Loudest source first: silence, then a
 * falling rating, then an overdue plate, then the scheduled things that are not
 * problems at all.
 *
 * THIS FILE HOLDS THE ORDER AND NOTHING ELSE, apart from the decoder that reads
 * it back. The follow-up drafter needs the decoder, and the barrel next door
 * exports the drafter — so if the two lived together the drafter and the barrel
 * would import each other in a circle.
 */
export const DIGEST_RULES: DigestRule[] = [
  noLogsRule,
  mealRatingDeclineRule,
  slaPendingRule,
  levelReviewRule,
  observationRule,
];

/**
 * How much room each rule gets inside `position`.
 *
 * IT IS THIS WIDE ON PURPOSE. The first version used a hundred, which read
 * nicely and broke silently: a rule numbers its lines by the client's place in
 * the roster, so the hundred-and-first client's line landed in the NEXT rule's
 * range and was read back as having been written by a rule that never saw them.
 * A hundred thousand is past any roster a pod-based programme will hold, and
 * five rules times that is nowhere near a 32-bit integer.
 */
export const RULE_STRIDE = 100_000;

/**
 * Which rule wrote a line, read back off its `position`.
 *
 * `buildFor` encodes the rule's index as `i * RULE_STRIDE`, so the index is
 * recoverable and no column is needed for it. THIS IS A DERIVED FACT, not a
 * stored one, and the trade is worth being plain about: reordering the list
 * above re-labels every line already written for today. That is survivable
 * because the digest is rebuilt from scratch each morning and costs nothing
 * until then — but if a second reader ever needs the rule for something a PERSON
 * acts on, it should become a column rather than growing a second decoder
 * somewhere else.
 */
export function ruleOf(position: number): string | null {
  return DIGEST_RULES[Math.floor(position / RULE_STRIDE)]?.key ?? null;
}
