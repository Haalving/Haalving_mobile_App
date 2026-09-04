/**
 * THE SLOT GRAMMAR — ported verbatim from `HV.slotSpec`, `HV.specFor`, `HV.optId`
 * and `HV.optX` (demo core.js:60-125), with the demo's `to24` (console-clients.js).
 *
 * A template's day is a list of SLOTS; a slot is a list of OPTIONS; an option is
 * a list of ITEMS taken together. "Items inside one option are taken together;
 * separate options are alternatives" — that sentence is the whole of it, and
 * every surface that reads or writes a day (the Catalog's template editor, the
 * client record's Plan tab, the calendar engine, the client app's plate) reads
 * it through here so the grammar can only ever change in one place.
 *
 * The five entries are the four pillars plus the motivation LIBRARY — a fifth
 * shelf for templates, not a fifth pillar. `PILLARS` stays at four.
 */

export const TEMPLATE_PILLARS = ['culture', 'fitness', 'yoga', 'wellness', 'motivation'] as const;
export type TemplatePillar = (typeof TEMPLATE_PILLARS)[number];

export function isTemplatePillar(v: string): v is TemplatePillar {
  return (TEMPLATE_PILLARS as readonly string[]).includes(v);
}

/** One of a pillar's own fields — sets and reps for a session, a note for a meal. */
export interface SlotField {
  k: string;
  t: string;
  kind: 'num' | 'text';
  ph?: string;
  max?: number;
}

export interface SlotSpec {
  /** the display name — `culture` says "Nutrition", `wellness` says "Mind Wellness" */
  name: string;
  /** what one slot is called: a Meal, a Session, a Practice, a Film */
  slotWord: string;
  /** what one item is called: a food, an exercise, an asana, a practice, a film */
  itemWord: string;
  /** whether a slot carries a clock */
  time: boolean;
  /** the pillar's palette class, so ported markup carries the same hook */
  cls: string;
  /** the usual names for a new slot, offered as a datalist */
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

/** The spec for a pillar — falling back to fitness, exactly as the demo does. */
export function specFor(p: string): SlotSpec {
  return (SLOT_SPEC as Record<string, SlotSpec>)[p] ?? SLOT_SPEC.fitness;
}

/**
 * An option-group entry is a bare item id ('ci-idli') or, when the coach asks
 * for more than one portion, `{ id: 'ci-idli', x: 2 }`. These two are the ONLY
 * way to read an entry — every consumer of `slot.options` goes through them, so
 * the grammar can grow in one place. `x: 1` is canonicalised back to the bare
 * string on save; a missing or nonsense x reads as 1.
 */
export type OptionEntry = string | { id: string; x?: number };

export function optId(e: OptionEntry | null | undefined): string {
  return typeof e === 'string' ? e : (e?.id ?? '');
}

export function optX(e: OptionEntry | null | undefined): number {
  const x = e && typeof e === 'object' ? Number(e.x) : 1;
  return x > 1 ? Math.round(x) : 1;
}

/** One slot of a day, as a template's `days[n].slots` and a plan's overrides hold it. */
export interface Slot {
  label?: string;
  time?: string;
  /** the A/B/C alternatives — each a list of items taken together */
  options: OptionEntry[][];
  /** the pillar's own fields for this slot — sets and reps, a note */
  dose?: Record<string, unknown>;
}

/** The pillars that run as booked SESSIONS and carry a client's own hour and dose. */
export function isSessionPillar(p: string): boolean {
  return p === 'fitness' || p === 'yoga' || p === 'wellness';
}

/**
 * A coach's clock to the form control's — '6:30 pm', '19:30' or '' to 'HH:MM'.
 *
 * Seeded slots are written the way a coach speaks — '6:30 pm' as readily as
 * '19:30'. Reading only the 24-hour form meant the form control came up empty and
 * Save then wrote that emptiness over a real time. Anything that is not a clock
 * reads as '', which every caller treats as "no time".
 */
export function to24(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i.exec(String(t ?? '').trim());
  if (!m) return '';
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (/^p/i.test(m[3]) ? 12 : 0);
  if (h > 23 || Number(m[2]) > 59) return '';
  return `${h < 10 ? '0' : ''}${h}:${m[2]}`;
}
