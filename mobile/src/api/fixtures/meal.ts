import type { MealDetail } from '@/api/client-app';

/**
 * FIXTURE — a single meal, as `GET /client/meals/:id` will return it.
 *
 * TODO(route): GET /client/meals/:id — the meal-detail read (serialised, post
 * rules.ts: `final` present only after a human/AI rating; observation clients
 * never carry stars). Listed in docs/pixel/TODO.md "needs route". Values are
 * Rajesh's two seeded meals from demo/app/js/data.js (m-raj-bf rated, m-raj-lunch
 * pending). Photos are null here — the demo's `img/food/*.webp` are not bundled and
 * real photos will arrive as R2 URLs; the screen falls back to the bowl mark.
 */
export const mealFixtures: Record<string, MealDetail> = {
  'm-raj-bf': {
    id: 'm-raj-bf',
    slot: 'Breakfast',
    ago: '5 h ago',
    photo: null,
    dishes: ['Besan chilla', 'Mint chutney'],
    fullness: 'Just right',
    protein: 24,
    kcal: 380,
    observation: false,
    pendingLine: null,
    final: {
      stars: 4,
      byName: 'Sneha',
      isAI: false,
      voiceSec: 22,
      note: 'Lovely start, Rajesh! One tweak: swap the fried papad at lunch.',
      rubric: [
        { label: 'Plan match', value: '2 / 2 stars' },
        { label: 'Portion', value: '1 / 1 stars' },
        { label: 'Quality', value: '0 / 1 stars · fried item' },
        { label: 'Timing', value: '1 / 1 stars' },
      ],
    },
  },
  'm-raj-lunch': {
    id: 'm-raj-lunch',
    slot: 'Lunch',
    ago: '14 min ago',
    photo: null,
    dishes: ['Dal tadka', 'Jeera rice', 'Papad'],
    fullness: 'Just right',
    protein: 22,
    kcal: 610,
    observation: false,
    pendingLine: 'Sneha sees this exactly as you sent it. A rating usually lands within the hour.',
    final: null,
  },
};

/** The one the harness opens by default. */
export const mealFixtureDefault = mealFixtures['m-raj-bf']!;
