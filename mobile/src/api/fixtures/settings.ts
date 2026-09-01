import type { ClientSettings } from '@/api/client-app';

/**
 * FIXTURE — the client's settings state, as `GET /client/settings` will return it.
 *
 * TODO(route): GET /client/settings (+ the PATCH writes) — notification toggles,
 * the announcements opt-out, and DPDP consents. Listed in docs/pixel/TODO.md
 * "needs route". Values are the demo defaults (notifPrefs: water/workout/meals on,
 * sleep off; announce on) and the two hard-coded consents. Consents are
 * "Granted" in the demo with no timestamp or withdraw path.
 */
export const settingsFixture: ClientSettings = {
  notif: [
    { key: 'water', label: 'Water reminder', sub: 'Every 2 hours · 08:00–20:00', on: true },
    { key: 'workout', label: 'Workout reminder', sub: 'Day before + 60 min before each session', on: true },
    { key: 'meals', label: 'Meal follow-ups', sub: '08:00 / 13:30 / 20:30', on: true },
    { key: 'sleep', label: 'Sleep wind-down', sub: 'Opt-in · a gentle nudge before bed', on: false },
  ],
  announce: {
    on: true,
    label: 'Offers, events and news',
    sub: 'Community invitations, new programmes and offers from HAALVING, in your Circle.',
  },
  consents: [
    {
      id: 'health',
      name: 'Health data processing',
      sub: 'Lets your care team see your trackers, plans and doctor-approved Health Summaries',
    },
    {
      id: 'mealai',
      name: 'Meal photo AI pre-scoring',
      sub: 'AI suggests a star rating for each meal photo; your dietitian always makes the final call',
    },
  ],
};
