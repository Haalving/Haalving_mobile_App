import type { DigestRule } from './types.js';

/**
 * A plate still waiting on a human. Mathew's seeded line names it: 'lunch awaiting rating (SLA 38 min)'.
 *
 * NOT BUILT YET. It returns [] and will keep returning [] until there is a meal queue — it reads the unrated meals against SlaConfig.replyTargetMin and writes the overdue ones. Needs: Meal, and SlaConfig, which already exists.
 *
 * Returning an empty list rather than throwing is deliberate: `buildFor` runs
 * every rule, and one unbuilt source must not empty the whole digest.
 */
export const slaPendingRule: DigestRule = {
  key: 'slaPending',
  about: 'names plates past the reply target',

  async run(_date: Date): Promise<[]> {
    return [];
  },
};
