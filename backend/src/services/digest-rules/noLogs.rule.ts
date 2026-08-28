import type { DigestRule } from './types.js';

/**
 * Three days of silence. The loudest line the digest can write, and the one Meena carries in the seed.
 *
 * NOT BUILT YET. It returns [] and will keep returning [] until there is something to be silent ABOUT — it reads the newest of a client's meals, weigh-ins and their own circle messages, and flags HIGH when the newest is more than 72 hours old. Needs: Meal, WeightLog, CircleMessage.
 *
 * Returning an empty list rather than throwing is deliberate: `buildFor` runs
 * every rule, and one unbuilt source must not empty the whole digest.
 */
export const noLogsRule: DigestRule = {
  key: 'noLogs',
  about: 'flags a client who has logged nothing for three days',

  async run(_date: Date): Promise<[]> {
    return [];
  },
};
