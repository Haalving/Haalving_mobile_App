import type { DigestRule } from './types.js';

/**
 * Review day. Suresh P. sits on cycle day 12 in the seed, with his pack ready.
 *
 * NOT BUILT YET. It returns [] and will keep returning [] until the level-review pack exists — the CLIENT side is already here (Client.cycleDay against ProgramShape.reviewDay), so this rule is the closest to buildable; what it still lacks is the pack to point at. Needs: LevelReview / Approval.
 *
 * Returning an empty list rather than throwing is deliberate: `buildFor` runs
 * every rule, and one unbuilt source must not empty the whole digest.
 */
export const levelReviewRule: DigestRule = {
  key: 'levelReview',
  about: 'flags the clients whose review day is today',

  async run(_date: Date): Promise<[]> {
    return [];
  },
};
