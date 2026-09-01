/**
 * THE COACH MARKETPLACE — reference content, one place.
 *
 * These are the coaches a client can browse and request, per pillar. Like the
 * program and the meal plans, this is CONTENT rather than user state: it does not
 * belong to any one client and it is not written from the app, so it lives as a
 * typed module the service reads, not a table a migration owns. The demo carries
 * the identical list in `data.js` (`coachMarket`).
 *
 * `staffId` is set only on the four coaches who actually hold pod seats in the
 * seeded cast — that id is what lets the service mark a coach as the client's OWN
 * (their pod's holder for that pillar) rather than someone to connect with. The
 * marketplace list itself is the same for everyone; only the `mine` flag, added in
 * the service from the caller's pod, differs.
 *
 * Pillar keys are the product's own (`culture` displays as "Nutrition",
 * `wellness` as "Mind Wellness"); never rename them.
 */

export interface MarketCoach {
  id: string;
  /** set only for a coach who holds a pod seat in the seed — drives the `mine` flag */
  staffId?: string;
  name: string;
  title: string;
  years: number;
  rating: number;
  clients: number;
  /** rupees per month */
  price: number;
  spec: string[];
  line: string;
}

export const COACH_MARKET: Record<string, MarketCoach[]> = {
  fitness: [
    { id: 'co-vikram', staffId: 'u-vikram', name: 'Vikram S.', title: 'Fitness Expert', years: 12, rating: 4.9, clients: 260, price: 9000, spec: ['Strength', 'Injury-safe training', 'Metabolic health'], line: 'Twelve years of strength coaching without a training injury on his watch — form first, load second.' },
    { id: 'co-arjun', name: 'Arjun P.', title: 'Fitness Expert', years: 8, rating: 4.8, clients: 180, price: 7500, spec: ['Fat loss', 'Running', 'Home training'], line: 'Turned 180 desk-bound beginners into steady movers — home blocks that survive busy weeks.' },
    { id: 'co-farhan', name: 'Farhan A.', title: 'Fitness Expert', years: 6, rating: 4.7, clients: 120, price: 6000, spec: ['Beginners', 'Mobility', 'Strength'], line: 'Endlessly patient with first-timers — the coach for the person who has never held a dumbbell.' },
  ],
  culture: [
    { id: 'co-sneha', staffId: 'u-sneha', name: 'Sneha M.', title: 'Nutrition Expert', years: 10, rating: 4.9, clients: 240, price: 8500, spec: ['Diabetes-safe plates', 'South Indian kitchens', 'Weight loss'], line: 'Rebuilds the food you already love into the plan you actually follow — no imported diets.' },
    { id: 'co-divya', name: 'Divya R.', title: 'Nutrition Expert', years: 7, rating: 4.8, clients: 150, price: 7000, spec: ['PCOS nutrition', 'Gut health', 'Family meals'], line: 'One plan the whole family can eat — hormone-aware plates that never need a second kitchen.' },
    { id: 'co-kavitha', name: 'Kavitha S.', title: 'Nutrition Expert', years: 9, rating: 4.7, clients: 190, price: 6500, spec: ['Vegetarian protein', 'Meal prep', 'Sustainable habits'], line: 'Protein-complete vegetarian eating, planned Sunday to Sunday — habits that hold at month six.' },
  ],
  yoga: [
    { id: 'co-lakshmi', staffId: 'u-lakshmi', name: 'Lakshmi N.', title: 'Yoga Expert', years: 14, rating: 4.9, clients: 300, price: 8000, spec: ['Hatha', 'Mobility', 'Breath work'], line: 'Fourteen years of live teaching — she reads a room of one as closely as a shala of forty.' },
    { id: 'co-ishaan', name: 'Ishaan V.', title: 'Yoga Expert', years: 9, rating: 4.8, clients: 170, price: 6500, spec: ['Ashtanga', 'Back care', 'Flexibility'], line: 'Back-care first: half his practice was built for people who sit ten hours a day.' },
    { id: 'co-anju', name: 'Anju T.', title: 'Yoga Expert', years: 6, rating: 4.7, clients: 110, price: 5500, spec: ['Gentle yoga', 'Balance', 'Beginners'], line: 'Gentle, exact, unhurried — the teacher for a body that needs convincing, not conquering.' },
  ],
  wellness: [
    { id: 'co-meera', staffId: 'u-meera', name: 'Meera J.', title: 'Mind Wellness Coach', years: 11, rating: 4.9, clients: 220, price: 7500, spec: ['Sleep', 'Yoga nidra', 'Stress'], line: 'Sleep is her craft — eleven years of turning racing evenings into quiet nights.' },
    { id: 'co-rahul', name: 'Rahul B.', title: 'Mind Wellness Coach', years: 8, rating: 4.8, clients: 140, price: 6000, spec: ['Meditation', 'Screen habits', 'Focus'], line: 'A former product manager who rebuilt his own attention — and now coaches yours.' },
    { id: 'co-sara', name: 'Sara F.', title: 'Mind Wellness Coach', years: 7, rating: 4.7, clients: 130, price: 5500, spec: ['Breath work', 'Evening rituals', 'Calm'], line: 'Ten quiet minutes, twice a day — her clients keep the ritual years after they stop needing her.' },
  ],
};

/** The pod-seat key that carries each pillar's coach (culture → dietitian, wellness → mind). */
export const PILLAR_POD_SEAT: Record<string, string> = {
  fitness: 'fitness',
  culture: 'dietitian',
  yoga: 'yoga',
  wellness: 'mind',
};
