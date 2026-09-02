/**
 * THE SETTINGS SCREEN'S STATIC COPY, in one place.
 *
 * A settings row is two things: a label the demo wrote, and an on/off the client
 * chose. The words never change per client and are content, not data — so they
 * live here, and only the booleans come from the database (`ClientPrefs`,
 * `ClientAnnouncePref`). The mobile settings fixture was pixel-verified against
 * the demo; these strings are that fixture's, so the real route renders the same
 * screen the fixture did.
 *
 * CONSENTS CARRY NO TOGGLE. The demo shows both "Granted" with no withdraw path,
 * and the client type (`ConsentRow`) has no `on` — so they are display-only here
 * and the PATCH never touches them. `ClientPrefs.consents` exists for the day a
 * withdraw path does, and is deliberately not wired to anything yet.
 */

export const NOTIF_CATALOG = [
  { key: 'water', label: 'Water reminder', sub: 'Every 2 hours · 08:00–20:00', default: true },
  {
    key: 'workout',
    label: 'Workout reminder',
    sub: 'Day before + 60 min before each session',
    default: true,
  },
  { key: 'meals', label: 'Meal follow-ups', sub: '08:00 / 13:30 / 20:30', default: true },
  { key: 'sleep', label: 'Sleep wind-down', sub: 'Opt-in · a gentle nudge before bed', default: false },
] as const;

export type NotifKey = (typeof NOTIF_CATALOG)[number]['key'];
export const NOTIF_KEYS = NOTIF_CATALOG.map((n) => n.key) as [NotifKey, ...NotifKey[]];

export const CONSENT_CATALOG = [
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
] as const;

export const ANNOUNCE_COPY = {
  label: 'Offers, events and news',
  sub: 'Community invitations, new programmes and offers from HAALVING, in your Circle.',
} as const;
