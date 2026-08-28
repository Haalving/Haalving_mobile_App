/**
 * The four pillars — ported from `HV.PILLARS` (core.js:9) and the palette in
 * app.css.
 *
 * THE RULE THAT BITES: display names, pillar keys and staff role keys all differ
 * for the same pillar, and none of them may be renamed.
 *
 *   pillar key `culture`  displays as "Nutrition"      coached by role `dietitian`
 *   pillar key `wellness` displays as "Mind Wellness"  coached by role `mind`
 *
 * HAALVING Culture is the umbrella brand — Nutrition + Fitness + Yoga + Mind
 * Wellness — not a pillar. A client record carries both vocabularies at once:
 * `levels.wellness` but `pod.mind` and `sessions.mind`. Only `name` and
 * user-facing copy ever carry the display names.
 *
 * A pillar's colour appears ONLY in that pillar's own dial, dot, ribbon and
 * series. The moment it is used decoratively it stops being a signal.
 */

export const PILLAR_KEYS = ['fitness', 'culture', 'yoga', 'wellness'] as const;
export type PillarKey = (typeof PILLAR_KEYS)[number];

/**
 * The staff role that coaches each pillar. `CAL_ROLE` in core.js, and the only
 * legitimate translation between the two vocabularies.
 */
export const PILLAR_ROLE = {
  fitness: 'fitness',
  culture: 'dietitian',
  yoga: 'yoga',
  wellness: 'mind',
} as const satisfies Record<PillarKey, string>;

export type PillarRole = (typeof PILLAR_ROLE)[PillarKey];

/** The reverse map, for a seat that knows its role and needs its pillar. */
export const ROLE_PILLAR = {
  fitness: 'fitness',
  dietitian: 'culture',
  yoga: 'yoga',
  mind: 'wellness',
} as const satisfies Record<PillarRole, PillarKey>;

export interface PillarDef {
  key: PillarKey;
  /** The display name. `culture` says "Nutrition"; `wellness` says "Mind Wellness". */
  name: string;
  sub: string;
  /** The demo's CSS class — kept so ported markup carries the same hook. */
  cls: string;
  /** The staff role key that coaches this pillar. */
  role: PillarRole;
  /** Light-mode palette, verbatim from app.css `:root`. */
  color: string;
  colorDeep: string;
  colorWash: string;
  /** Dark-mode counterpart — a designed pair, never an inversion. */
  colorDark: string;
  colorDeepDark: string;
  colorWashDark: string;
}

export const PILLARS = {
  fitness: {
    key: 'fitness',
    name: 'Fitness',
    sub: 'Move without injury',
    cls: 'p-fitness',
    role: 'fitness',
    color: '#9E3B1E',
    colorDeep: '#6E2712',
    colorWash: '#F7EAE3',
    colorDark: '#E08055',
    colorDeepDark: '#F0A987',
    colorWashDark: '#2A1810',
  },
  culture: {
    key: 'culture',
    name: 'Nutrition',
    sub: 'The daily plate',
    cls: 'p-culture',
    role: 'dietitian',
    color: '#8A6210',
    colorDeep: '#5C4108',
    colorWash: '#F8F1DC',
    colorDark: '#D9A63F',
    colorDeepDark: '#EBC477',
    colorWashDark: '#2A2110',
  },
  yoga: {
    key: 'yoga',
    name: 'Yoga',
    sub: 'Strength in stillness',
    cls: 'p-yoga',
    role: 'yoga',
    color: '#3C5A31',
    colorDeep: '#283D21',
    colorWash: '#E9EFE4',
    colorDark: '#7FA36B',
    colorDeepDark: '#A3C191',
    colorWashDark: '#182413',
  },
  wellness: {
    key: 'wellness',
    name: 'Mind Wellness',
    sub: 'Mind & rest',
    cls: 'p-wellness',
    role: 'mind',
    color: '#3A386C',
    colorDeep: '#26244B',
    colorWash: '#EAE9F4',
    colorDark: '#8E8AD1',
    colorDeepDark: '#ADA9E2',
    colorWashDark: '#1B1A2E',
  },
} as const satisfies Record<PillarKey, PillarDef>;

/**
 * The pillars that run as booked SESSIONS. Nutrition is asynchronous — the
 * plate gets its own lane — and letting it into the session list breaks five
 * readers at once, `dayDone` and the coach brief among them.
 */
export const SESSION_PILLARS = ['fitness', 'yoga', 'wellness'] as const;

/**
 * The FIXED axis order of the HAALVING Index radar: Fitness top, Nutrition
 * right, Yoga bottom, Mind Wellness left. Re-ordering a radar's axes silently
 * changes its shape, so this never varies.
 */
export const INDEX_AXIS_ORDER = ['fitness', 'culture', 'yoga', 'wellness'] as const;

/**
 * Every seat on a client's pod, as the demo's `c.pod` actually keys them.
 *
 * NOTE these are STAFF ROLE keys, not pillar keys — `dietitian` (not `culture`)
 * and `mind` (not `wellness`) — because `HV.staffFor(client, roleKey)` and
 * `HV.myClients()` both look the seat up by role. Renaming either would break
 * client scoping for every coach.
 */
export const POD_SEATS = ['dietitian', 'fitness', 'yoga', 'mind', 'doctor', 'admin', 'opshead'] as const;
export type PodSeatKey = (typeof POD_SEATS)[number];

/** The four coach benches. `HV.DEPTS`, verbatim. */
export const DEPTS = {
  dietitian: 'Nutrition',
  fitness: 'Fitness',
  yoga: 'Yoga',
  mind: 'Mind Wellness',
} as const;
export type DeptKey = keyof typeof DEPTS;

export const DEPT_KEYS = Object.keys(DEPTS) as DeptKey[];

export function pillarName(key: string): string {
  return (PILLARS as Record<string, PillarDef>)[key]?.name ?? key;
}

/** The seat that carries a pillar: `culture` -> `dietitian`. */
export function roleForPillar(key: PillarKey): PillarRole {
  return PILLAR_ROLE[key];
}

/** The pillar a seat carries: `mind` -> `wellness`. Null for non-coach seats. */
export function pillarForRole(role: string): PillarKey | null {
  return (ROLE_PILLAR as Record<string, PillarKey>)[role] ?? null;
}

export function isPillarKey(v: string): v is PillarKey {
  return (PILLAR_KEYS as readonly string[]).includes(v);
}

export function isPodSeatKey(v: string): v is PodSeatKey {
  return (POD_SEATS as readonly string[]).includes(v);
}
