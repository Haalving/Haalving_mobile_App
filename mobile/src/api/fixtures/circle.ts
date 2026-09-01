import type { CircleThread } from '@/api/client-app';

/**
 * FIXTURE — the client's care-circle thread, as `GET /client/circle` will return
 * it (day-session, newest at the bottom).
 *
 * TODO(route): GET /client/circle — the thread read (serialised post rules.ts:
 * `teamonly` messages are dropped server-side and never reach here). Listed in
 * docs/pixel/TODO.md "needs route". Values are Rajesh's seeded thread from
 * demo/app/js/data.js (circles['c-rajesh']), minus the two teamonly rows.
 */
export const circleFixture: CircleThread = {
  sub: 'Your whole team reads this — Sneha, Vikram, Lakshmi, Meera, Dr. Kavya',
  hasHistory: true,
  messages: [
    {
      id: 'cm1',
      kind: 'card',
      mine: false,
      who: null,
      text: 'Dos & Don’ts · How we’ll work together',
      ago: '72 h ago',
    },
    {
      id: 'cm2',
      kind: 'meal',
      mine: true,
      who: null,
      text: 'Breakfast logged',
      ago: '5 h ago',
      mealId: 'm-raj-bf',
      slot: 'Breakfast',
      dishes: ['Besan chilla', 'Mint chutney'],
    },
    {
      id: 'cm3',
      kind: 'rating',
      mine: false,
      who: 'Sneha M. · Dietician',
      text: 'Breakfast rated 4 stars, voice note attached. Watch the fried sides at lunch!',
      ago: '4 h 48 m ago',
      stars: 4,
      voiceSec: 22,
    },
    {
      id: 'cm4',
      kind: 'text',
      mine: false,
      who: 'Vikram S. · Fitness Coach',
      text: 'See you at 6:30, Rajesh. Bands ready? We’re locking session 4 of 5 tonight.',
      ago: '2 h 10 m ago',
    },
    {
      id: 'cm5',
      kind: 'text',
      mine: true,
      who: null,
      text: 'Ready. Knee felt fine yesterday.',
      ago: '1 h 35 m ago',
    },
    {
      id: 'cm6',
      kind: 'meal',
      mine: true,
      who: null,
      text: 'Lunch logged',
      ago: '14 min ago',
      mealId: 'm-raj-lunch',
      slot: 'Lunch',
      dishes: ['Dal tadka', 'Jeera rice', 'Papad'],
    },
  ],
};
