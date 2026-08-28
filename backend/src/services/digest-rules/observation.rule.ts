import type { DigestRule } from './types.js';

/**
 * The observation window. Priya is on day 3 of 5, and the line exists to say nothing is wrong.
 *
 * NOT BUILT YET. It returns [] and will keep returning [] until the meal-photo counter exists — Client.observation and Client.cycleDay are already here, but the '7 of 10 meal photos in' half needs the photos. Needs: Meal.
 *
 * Returning an empty list rather than throwing is deliberate: `buildFor` runs
 * every rule, and one unbuilt source must not empty the whole digest.
 */
export const observationRule: DigestRule = {
  key: 'observation',
  about: 'reports progress through the observation window, usually unflagged',

  async run(_date: Date): Promise<[]> {
    return [];
  },
};
