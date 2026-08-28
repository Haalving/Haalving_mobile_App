import type { DigestRule } from './types.js';

/**
 * A falling meal rating. Rajesh carries this one: 'meal rating average down 1.2 stars week-over-week'.
 *
 * NOT BUILT YET. It returns [] and will keep returning [] until meals are rated — it compares the trailing 7-day mean star rating against the 7 days before it and flags MED on a drop of half a star or more. Needs: Meal (with its final rating and timestamp).
 *
 * Returning an empty list rather than throwing is deliberate: `buildFor` runs
 * every rule, and one unbuilt source must not empty the whole digest.
 */
export const mealRatingDeclineRule: DigestRule = {
  key: 'mealRatingDecline',
  about: 'watches the 7-day meal-rating average for a drop of >= 0.5 stars',

  async run(_date: Date): Promise<[]> {
    return [];
  },
};
