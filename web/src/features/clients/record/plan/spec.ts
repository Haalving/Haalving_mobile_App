/**
 * The per-pillar slot grammar — `HV.slotSpec` / `HV.specFor` (demo core.js:84-111),
 * ported verbatim.
 *
 * A pillar's name, the word for one of its slots, the word for one of its
 * items, whether its slots carry a clock, its palette class, the labels it
 * offers a new slot, and the FIELDS a slot may carry (sets and reps for a
 * session, minutes and a focus for a practice, a note for a meal). The Plan
 * tab, the Call sheet and the Day sheet all read this one table, so a pillar
 * gains a field by one edit here and never a hunt through the views.
 *
 * The console keeps its own copy rather than reaching into `@haalving/shared`
 * for it (the contract allows either): the shared `slots.ts` is being written
 * in the same pass, and the tab must typecheck against what exists today.
 */

export const TEMPLATE_PILLARS = ['culture', 'fitness', 'yoga', 'wellness', 'motivation'] as const;
export type TemplatePillar = (typeof TEMPLATE_PILLARS)[number];

/** the pillars a client has a session clock for */
export const SESSION_P = ['fitness', 'yoga', 'wellness'] as const;
export function isSessionPillar(p: string): boolean {
  return (SESSION_P as readonly string[]).includes(p);
}

export interface SlotField {
  k: string;
  t: string;
  kind: 'num' | 'text';
  ph?: string;
  max?: number;
}
export interface SlotSpec {
  name: string;
  slotWord: string;
  itemWord: string;
  time: boolean;
  cls: string;
  defaults: string[];
  /** the plate's numbers are SUMMED from the chosen foods, never typed */
  sums?: boolean;
  /** one film a day and no more — a second would have nothing to mean */
  one?: boolean;
  fields: SlotField[];
}

export const SLOT_SPEC: Record<TemplatePillar, SlotSpec> = {
  culture: {
    name: 'Nutrition',
    slotWord: 'Meal',
    itemWord: 'food',
    time: true,
    cls: 'p-culture',
    defaults: ['Breakfast', 'Mid-morning', 'Lunch', 'Snack', 'Dinner'],
    /* the plate's numbers are SUMMED from the chosen foods, never typed — a
       coach who edits a total by hand has made it a claim, not a reading */
    sums: true,
    fields: [{ k: 'note', t: 'Note', kind: 'text', ph: 'e.g. finish by 7 pm' }],
  },
  fitness: {
    name: 'Fitness',
    slotWord: 'Session',
    itemWord: 'exercise',
    time: true,
    cls: 'p-fitness',
    defaults: ['Session', 'Warm-up', 'Cool-down'],
    /* weight is TEXT, not a number — "5 kg each", "bodyweight" and "red band"
       are all real prescriptions, and a unit-less bare number is not */
    fields: [
      { k: 'sets', t: 'Sets', kind: 'num' },
      { k: 'reps', t: 'Reps', kind: 'num' },
      { k: 'weight', t: 'Suggested weight', kind: 'text', ph: 'e.g. 5 kg or bodyweight' },
      { k: 'rpe', t: 'RPE', kind: 'num', max: 10 },
      { k: 'mins', t: 'Minutes', kind: 'num' },
    ],
  },
  yoga: {
    name: 'Yoga',
    slotWord: 'Practice',
    itemWord: 'asana',
    time: true,
    cls: 'p-yoga',
    defaults: ['Practice', 'Morning flow', 'Evening flow'],
    fields: [
      { k: 'count', t: 'Count', kind: 'num' },
      { k: 'sets', t: 'Sets', kind: 'num' },
      { k: 'mins', t: 'Minutes', kind: 'num' },
      { k: 'focus', t: 'Focus', kind: 'text', ph: 'e.g. hips, spine' },
    ],
  },
  wellness: {
    name: 'Mind Wellness',
    slotWord: 'Practice',
    itemWord: 'practice',
    time: true,
    cls: 'p-wellness',
    defaults: ['Wind-down', 'Counselling', 'Meditation'],
    fields: [
      { k: 'count', t: 'Count', kind: 'num' },
      { k: 'sets', t: 'Sets', kind: 'num' },
      { k: 'mins', t: 'Minutes', kind: 'num' },
    ],
  },
  motivation: {
    name: 'Motivation',
    slotWord: 'Film',
    itemWord: 'film',
    time: false,
    cls: 'p-motivation',
    defaults: ['Morning film'],
    one: true,
    fields: [],
  },
};

/** falls back to fitness, as the demo does */
export function specFor(p: string): SlotSpec {
  return SLOT_SPEC[p as TemplatePillar] ?? SLOT_SPEC.fitness;
}

/* Slot times are stored the way a coach writes them — '8:00', '19:30' — but
   <input type="time"> insists on a zero-padded HH:MM. Two tiny adapters, so
   the stored shape never has to change to suit a form control. */
export function to24(t: string | null | undefined): string {
  /* seeded slots are written the way a coach speaks — '6:30 pm' as readily
     as '19:30'. Reading only the 24-hour form meant the form control came up
     empty and Save then wrote that emptiness over a real time. */
  const m = /^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i.exec(String(t ?? '').trim());
  if (!m) return '';
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (/^p/i.test(m[3]) ? 12 : 0);
  if (h > 23 || Number(m[2]) > 59) return '';
  return `${h < 10 ? '0' : ''}${h}:${m[2]}`;
}
export function from24(t: string | null | undefined): string {
  const m = /^(\d{2}):(\d{2})$/.exec(String(t ?? ''));
  return m ? `${Number(m[1])}:${m[2]}` : '';
}

/** Option A, Option B … */
export const letter = (i: number): string => String.fromCharCode(65 + i);
