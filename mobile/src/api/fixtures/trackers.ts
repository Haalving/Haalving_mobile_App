import type { Trackers } from '@/api/client-app';

/**
 * FIXTURE — the client's tracker signals + nutrient ledger, as `GET /client/trackers`
 * will return them.
 *
 * TODO(route): GET /client/trackers — the day's readings (steps, active, calories,
 * sleep, screen, water) and the Nutrient Panel macros/micros. Listed in
 * docs/pixel/TODO.md "needs route". Values are Rajesh's from demo/app/js/data.js
 * (day 6): steps 6100/8000, active 38/60, actCal 210/350, sleep 6h40m/83%,
 * screen 96/120, water 5/8. Series colours are the tk-* tokens.
 */
export const trackersFixture: Trackers = {
  signals: [
    { key: 'steps', icon: 'walk', label: 'Steps', value: '6,100', sub: 'of 8,000', pct: 76, series: 'tkMove' },
    { key: 'active', icon: 'pulse', label: 'Active', value: '38 m', sub: 'of 60', pct: 63, series: 'tkTime' },
    { key: 'actCal', icon: 'flame', label: 'Calories', value: '210', sub: 'of 350', pct: 60, series: 'tkBurn' },
    { key: 'sleep', icon: 'moon', label: 'Sleep', value: '6 h 40 m', sub: '83%', pct: 83, series: 'tkRest' },
    { key: 'screen', icon: 'device', label: 'Screen', value: '1 h 36 m', sub: 'of 2 h', pct: 80, series: 'tkScreen' },
    { key: 'water', icon: 'drop', label: 'Water', value: '5', sub: 'of 8', pct: 63, series: 'tkWater' },
  ],
  macros: [
    { name: 'Protein', value: '26 / 73 g', state: 'bad' },
    { name: 'Carbs', value: '168 / 175 g', state: 'ok' },
    { name: 'Fat', value: '40 / 42 g', state: 'ok' },
    { name: 'Fibre', value: '11 / 20 g', state: 'bad' },
  ],
  micros: [
    { name: 'Vitamin D', value: '6 / 15 µg', state: 'bad' },
    { name: 'Vitamin B12', value: '1.5 / 2.2 µg', state: 'bad' },
    { name: 'Iron', value: '15 / 19 mg', state: 'bad' },
    { name: 'Calcium', value: '900 / 1000 mg', state: 'ok' },
    { name: 'Sodium', value: '2700 / 2000 mg', state: 'warn' },
  ],
};
