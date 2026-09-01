import type { Plan } from '@/api/client-app';

/**
 * FIXTURE — the client's plan hub, as `GET /client/plan` will return it.
 *
 * TODO(route): GET /client/plan — the plan read (cycle calendar, pillar levels,
 * goal ledger, daily targets, level-up criteria). Listed in docs/pixel/TODO.md
 * "needs route". Values are Rajesh's (cycle 3, day 6) from demo/app/js/data.js and
 * the program shape (14-day cycle, rest 5 & 10, review 12, meeting 14).
 *
 * Calendar marks are simplified to per-pillar status dots for this breadth pass;
 * the demo draws the pillar name inside a status ring per session (needs the
 * session catalogue).
 */
const D = (day: number, date: string, extra: Partial<Plan['calendar'][number]> = {}) => ({
  day,
  date,
  marks: [] as { pillar: string; status: 'ok' | 'miss' | 'up' }[],
  ...extra,
});

const done = (pillars: string[]) => pillars.map((pillar) => ({ pillar, status: 'ok' as const }));
const up = (pillars: string[]) => pillars.map((pillar) => ({ pillar, status: 'up' as const }));

export const planFixture: Plan = {
  cycle: 3,
  day: 6,
  sub: 'Cycle 3 · day 6 of 14',
  goal: 'Bring HbA1c under 6.5 and lose 8 kg',
  levels: { fitness: 3, culture: 2, yoga: 3, wellness: 4 },
  calendar: [
    D(1, '1 Sep', { past: true, marks: done(['fitness', 'culture']) }),
    D(2, '2 Sep', { past: true, marks: done(['yoga', 'culture']) }),
    D(3, '3 Sep', { past: true, marks: done(['fitness', 'culture']) }),
    D(4, '4 Sep', { past: true, marks: done(['yoga', 'culture']) }),
    D(5, '5 Sep', { rest: true, flag: 'Rest' }),
    D(6, '6 Sep', { today: true, marks: up(['fitness', 'yoga', 'culture']) }),
    D(7, '7 Sep', { marks: up(['fitness', 'culture']) }),
    D(8, '8 Sep', { marks: up(['yoga', 'culture']) }),
    D(9, '9 Sep', { marks: up(['fitness', 'wellness', 'culture']) }),
    D(10, '10 Sep', { rest: true, flag: 'Rest' }),
    D(11, '11 Sep', { marks: up(['yoga', 'culture']) }),
    D(12, '12 Sep', { review: true, flag: 'Review', marks: up(['fitness', 'culture']) }),
    D(13, '13 Sep', { marks: up(['yoga', 'culture']) }),
    D(14, '14 Sep', { meeting: true, flag: 'Meeting', marks: up(['culture']) }),
  ],
  tiles: [
    { key: 'culture', word: 'Diet' },
    { key: 'fitness', word: 'Fitness' },
    { key: 'yoga', word: 'Yoga' },
    { key: 'wellness', word: 'Mind Wellness' },
  ],
  daily: [
    { icon: 'walk', label: 'Steps', value: '8,000', sub: 'every day — counted from your phone or watch' },
    { icon: 'drop', label: 'Water', value: '8 glasses', sub: 'through the day' },
    { icon: 'moon', label: 'Sleep', value: '7–8 h', sub: 'the band that counts at review' },
    { icon: 'device', label: 'Screen', value: 'under 120 min', sub: 'the evening cap' },
  ],
  ledger: [
    { level: 'L1', target: '−1.0 kg', result: '−1.2 kg', state: 'ok', vsOk: true },
    { level: 'L2', target: '−1.0 kg', result: '−0.6 kg · carried', state: 'cur', vsOk: false },
    { level: 'L3', target: '−1.0 kg', state: 'todo' },
    { level: 'L4', target: '−1.5 kg', state: 'todo' },
    { level: 'L5', target: '−1.5 kg', state: 'todo' },
    { level: 'L6', target: '−1.0 kg', state: 'todo' },
    { level: 'L7', target: '−1.0 kg', state: 'todo' },
  ],
  levelup: [
    { key: 'fitness', title: 'Fitness · to L4', bar: 'min 4 of 5 sessions · 75% of level goals', ticked: 3, total: 5 },
    { key: 'culture', title: 'Nutrition · to L3', bar: '5 gates · min 25 of 33 photos · 80% on plan', ticked: 3, total: 5 },
    { key: 'yoga', title: 'Yoga · to L4', bar: '3 of 3 sessions · 75% of level goals', ticked: 2, total: 3 },
    { key: 'wellness', title: 'Mind Wellness · to L5', bar: 'mind session · sleep 7–8 h · screen cap', ticked: 2, total: 3 },
  ],
};
