import type { CoachMarket } from '@/api/client-app';

/**
 * FIXTURE — the coach marketplace, as `GET /client/coaches` will return it, keyed
 * by pillar. `mine` marks the client's current coach for that pillar (resolved
 * server-side from the pod); here it is set for Rajesh's pod (fitness→Vikram,
 * culture→Sneha, yoga→Lakshmi, wellness→Meera).
 *
 * TODO(route): GET /client/coaches — the marketplace read. Listed in
 * docs/pixel/TODO.md "needs route". Values from demo/app/js/data.js coachMarket.
 */
export const coachesFixture: CoachMarket = {
  fitness: [
    { id: 'co-vikram', name: 'Vikram S.', title: 'Fitness Expert', years: 12, rating: 4.9, clients: 260, price: 9000, spec: ['Strength', 'Injury-safe training', 'Metabolic health'], line: 'Twelve years of strength coaching without a training injury on his watch — form first, load second.', mine: true },
    { id: 'co-arjun', name: 'Arjun P.', title: 'Fitness Expert', years: 8, rating: 4.8, clients: 180, price: 7500, spec: ['Fat loss', 'Running', 'Home training'], line: 'Turned 180 desk-bound beginners into steady movers — home blocks that survive busy weeks.', mine: false },
    { id: 'co-farhan', name: 'Farhan A.', title: 'Fitness Expert', years: 6, rating: 4.7, clients: 120, price: 6000, spec: ['Beginners', 'Mobility', 'Strength'], line: 'Endlessly patient with first-timers — the coach for the person who has never held a dumbbell.', mine: false },
  ],
  culture: [
    { id: 'co-sneha', name: 'Sneha M.', title: 'Nutrition Expert', years: 10, rating: 4.9, clients: 240, price: 8500, spec: ['Diabetes-safe plates', 'South Indian kitchens', 'Weight loss'], line: 'Rebuilds the food you already love into the plan you actually follow — no imported diets.', mine: true },
    { id: 'co-divya', name: 'Divya R.', title: 'Nutrition Expert', years: 7, rating: 4.8, clients: 150, price: 7000, spec: ['PCOS nutrition', 'Gut health', 'Family meals'], line: 'One plan the whole family can eat — hormone-aware plates that never need a second kitchen.', mine: false },
    { id: 'co-kavitha', name: 'Kavitha S.', title: 'Nutrition Expert', years: 9, rating: 4.7, clients: 190, price: 6500, spec: ['Vegetarian protein', 'Meal prep', 'Sustainable habits'], line: 'Protein-complete vegetarian eating, planned Sunday to Sunday — habits that hold at month six.', mine: false },
  ],
  yoga: [
    { id: 'co-lakshmi', name: 'Lakshmi N.', title: 'Yoga Expert', years: 14, rating: 4.9, clients: 300, price: 8000, spec: ['Hatha', 'Mobility', 'Breath work'], line: 'Fourteen years of live teaching — she reads a room of one as closely as a shala of forty.', mine: true },
    { id: 'co-ishaan', name: 'Ishaan V.', title: 'Yoga Expert', years: 9, rating: 4.8, clients: 170, price: 6500, spec: ['Ashtanga', 'Back care', 'Flexibility'], line: 'Back-care first: half his practice was built for people who sit ten hours a day.', mine: false },
    { id: 'co-anju', name: 'Anju T.', title: 'Yoga Expert', years: 6, rating: 4.7, clients: 110, price: 5500, spec: ['Gentle yoga', 'Balance', 'Beginners'], line: 'Gentle, exact, unhurried — the teacher for a body that needs convincing, not conquering.', mine: false },
  ],
  wellness: [
    { id: 'co-meera', name: 'Meera J.', title: 'Mind Wellness Coach', years: 11, rating: 4.9, clients: 220, price: 7500, spec: ['Sleep', 'Yoga nidra', 'Stress'], line: 'Sleep is her craft — eleven years of turning racing evenings into quiet nights.', mine: true },
    { id: 'co-rahul', name: 'Rahul B.', title: 'Mind Wellness Coach', years: 8, rating: 4.8, clients: 140, price: 6000, spec: ['Meditation', 'Screen habits', 'Focus'], line: 'A former product manager who rebuilt his own attention — and now coaches yours.', mine: false },
    { id: 'co-sara', name: 'Sara F.', title: 'Mind Wellness Coach', years: 7, rating: 4.7, clients: 130, price: 5500, spec: ['Breath work', 'Evening rituals', 'Calm'], line: 'Ten quiet minutes, twice a day — her clients keep the ritual years after they stop needing her.', mine: false },
  ],
};
