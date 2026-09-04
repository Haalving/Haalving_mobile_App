import { optId, optX, to24, type OptionEntry } from './slots.js';

/**
 * THE PLATE — what a prescribed day of Nutrition actually says, read once.
 *
 * The console already draws this on a client's Plan tab: the day's meals, each
 * with its dishes, its clock and its reading ("225 kcal · 5.5 g"), under a
 * targets line taken from the assigned template. The client app must show the
 * SAME plate, and the only way two surfaces can be guaranteed to agree about a
 * number is to compute it in one place. That place is here.
 *
 * Ported from the demo's `HV.groupSum` / `HV.slotSum` / `HV.plateFor` /
 * `HV.nutTargetsFor` / `HV.doseOf` (core.js:110-171, 751-799, 871-927) and kept
 * field-for-field in step with the console's `planMath.ts`, which was ported from
 * the same lines.
 *
 * THE ONE RULE THAT GOVERNS EVERY FUNCTION BELOW: a slot's options are
 * ALTERNATIVES, and only the first is being asked for. It decides the reading,
 * the dose and the row; the rest are offered instead of it, never as well as it.
 * A plate that summed every alternative would tell a client to eat three
 * breakfasts.
 */

/** What this module needs of a catalogue item. Deliberately less than the row. */
export interface PlateItem {
  id: string;
  name: string;
  nutrients?: {
    kcal?: number | string | null;
    protein?: number | string | null;
    carbs?: number | string | null;
    fat?: number | string | null;
    fibre?: number | string | null;
  } | null;
  media?: { image?: string | null; ref?: string | null } | null;
  dose?: Record<string, unknown> | null;
}

export interface MacroSum {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

const ZERO = (): MacroSum => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });

/**
 * ANY SLOT-SHAPED THING, deliberately loose.
 *
 * These functions are called with a template's own `Slot`, with the calendar
 * engine's `CalSlot` (whose `options` is `unknown`, because the calendar only
 * cares that a slot EXISTS), and with rows read straight out of a Json column.
 * Typing the parameter as the strictest of those would force a cast at every
 * call site, and a cast is exactly the thing that stops being checked when the
 * shape moves. `groupsOf` does the narrowing once, defensively, instead.
 */
export interface SlotLike {
  options?: unknown;
  dose?: unknown;
}

/** A slot's option groups, or nothing — never a throw on a malformed row. */
export function groupsOf(slot: SlotLike | null | undefined): OptionEntry[][] {
  const groups = slot?.options;
  if (!Array.isArray(groups)) return [];
  return groups.map((g) => (Array.isArray(g) ? (g as OptionEntry[]) : []));
}

/** Sum one option's items × portions into a macro reading. */
export function groupSum(
  entries: readonly OptionEntry[] | null | undefined,
  byId: Map<string, PlateItem>,
): MacroSum {
  const acc = ZERO();
  for (const e of entries ?? []) {
    const n = byId.get(optId(e))?.nutrients ?? {};
    const x = optX(e);
    acc.kcal += (Number(n.kcal) || 0) * x;
    acc.protein += (Number(n.protein) || 0) * x;
    acc.carbs += (Number(n.carbs) || 0) * x;
    acc.fat += (Number(n.fat) || 0) * x;
    acc.fibre += (Number(n.fibre) || 0) * x;
  }
  return acc;
}

/**
 * The plate's reading for one slot — the FIRST option group's.
 *
 * The comment the console carries on the same line is the reason: "that is the
 * option the client is being asked to eat, and alternatives are alternatives,
 * not extra food."
 */
export function slotSum(slot: SlotLike | null | undefined, byId: Map<string, PlateItem>): MacroSum {
  return groupSum(groupsOf(slot)[0], byId);
}

/** "Idli ×2" — the ×N only when it earns it, never a redundant ×1. */
function entryName(e: OptionEntry, byId: Map<string, PlateItem>): string {
  const id = optId(e);
  const name = byId.get(id)?.name ?? id;
  const x = optX(e);
  return x > 1 ? `${name} ×${x}` : name;
}

/**
 * THE DISH LINE, in the client's words: "Idli ×2 + Coconut chutney or Plain dosa
 * + Coconut chutney or Oats bowl".
 *
 * Two joins and nothing else — `+` inside an option because those foods are
 * eaten together, `or` between options because they are the same meal cooked
 * differently. The console prefixes each group with "Option A/B/C" because a
 * coach is choosing between them; the client is not choosing on a console, they
 * are reading their plate, so the letters are left off here. The grammar
 * underneath is identical, which is the point of sharing it.
 */
export function dishLine(slot: SlotLike | null | undefined, byId: Map<string, PlateItem>): string {
  return groupsOf(slot)
    .map((group) => (group ?? []).map((e) => entryName(e, byId)).filter(Boolean).join(' + '))
    .filter(Boolean)
    .join(' or ');
}

/** The picture for a slot — the LEAD item's, the one the reading is taken from. */
export function slotImage(slot: SlotLike | null | undefined, byId: Map<string, PlateItem>): string | null {
  const lead = byId.get(optId(groupsOf(slot)[0]?.[0]));
  return lead?.media?.image ?? lead?.media?.ref ?? null;
}

/**
 * MORNING · AFTERNOON · EVENING — the band a meal sits under.
 *
 * Built on `to24`, NOT on the demo's own hour parser. That one requires an am/pm
 * suffix (`core.js:3475`) while every seeded template writes a 24-hour clock, so
 * in the demo every template-driven slot silently collapses into a single
 * "Morning" band. `to24` reads both forms, so the three bands actually work here.
 * A slot with no clock at all sorts into Morning, which is where an unhoured meal
 * belongs on a day that reads top to bottom.
 */
export type DayPart = 'Morning' | 'Afternoon' | 'Evening';

export function partOfDay(time: string | null | undefined): DayPart {
  const hhmm = to24(time);
  const h = hhmm ? Number(hhmm.slice(0, 2)) : 0;
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}

/**
 * A slot's value for one field, in three rungs: the client's own number on their
 * assignment, else what the coach set on THIS slot, else the lead item's own
 * default. That is what lets one exercise be prescribed 3×10 at level 1 and 4×15
 * at level 4 without duplicating it in the library.
 */
export function doseOf(
  slot: SlotLike | null | undefined,
  key: string,
  byId: Map<string, PlateItem>,
  assign?: { dose?: Record<string, unknown> | null } | null,
): unknown {
  const mine = (assign?.dose ?? {}) as Record<string, unknown>;
  if (mine[key] !== undefined && mine[key] !== '') return mine[key];
  const own = (slot?.dose ?? {}) as Record<string, unknown>;
  if (own[key] !== undefined && own[key] !== '') return own[key];
  for (const e of groupsOf(slot)[0] ?? []) {
    const d = byId.get(optId(e))?.dose;
    if (d && d[key] !== undefined && d[key] !== '') return d[key];
  }
  return undefined;
}

/* ------------------------------------------------------------------ targets */

export interface PlanTargets {
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fibre?: number | null;
}

export type TargetSrc = 'client' | 'template' | 'derived';

export interface ResolvedTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  src: TargetSrc;
}

/* the demo's nutrition split — carbs at half of energy, fat at 27%, fibre at
   14 g per 1000 kcal. The same three numbers the console derives from. */
const SPLIT = { carbs: 0.5, fat: 0.27, fibrePer1000: 14 };

/**
 * A template's targets for one day. Targets live ON THE DAY, and a day that
 * states none INHERITS from the nearest earlier day that did — the composer's
 * prefill rule and the read rule are one rule, so what a coach saw while typing
 * day 3 is exactly what day 9 resolves to.
 */
export function tplTargetsOn(
  days: Record<string, { targets?: PlanTargets | null } | undefined> | null | undefined,
  day: number,
  cycleDays: number,
): PlanTargets | null {
  if (!days) return null;
  for (let d = Math.max(1, Math.min(day || 1, cycleDays)); d >= 1; d--) {
    const tg = days[String(d)]?.targets;
    if (tg && tg.kcal) return tg;
  }
  return null;
}

/**
 * The day's nutrition targets, in three rungs per field: the client's own
 * override, then the assigned template's targets for this day, then a derivation
 * from 1800 kcal.
 *
 * NULL IS THE OBSERVATION ANSWER. A client with nothing assigned and nothing
 * stated has no target, and inventing 1800 for them would print a goal nobody
 * set against a plate that does not exist. An assigned template with no stated
 * targets DOES get the derivation — there is a real prescribed plate to measure.
 */
export function nutTargetsFor(
  live: { templateId?: string | null; targets?: PlanTargets | null } | null | undefined,
  days: Record<string, { targets?: PlanTargets | null } | undefined> | null | undefined,
  day: number,
  cycleDays: number,
): ResolvedTargets | null {
  const ov = live?.targets ?? {};
  const tt = tplTargetsOn(days, day, cycleDays) ?? {};
  if (!ov.kcal && !tt.kcal && !live?.templateId) return null;
  const kcal = ov.kcal || tt.kcal || 1800;
  return {
    kcal,
    protein: ov.protein || tt.protein || Math.round((kcal * 0.2) / 4),
    carbs: ov.carbs || tt.carbs || Math.round((kcal * SPLIT.carbs) / 4),
    fat: ov.fat || tt.fat || Math.round((kcal * SPLIT.fat) / 9),
    fibre: ov.fibre || tt.fibre || Math.round((kcal / 1000) * SPLIT.fibrePer1000),
    src: ov.kcal ? 'client' : tt.kcal ? 'template' : 'derived',
  };
}

/** 5.5 → "5.5", 210 → "210" — one decimal only when it earns it. */
export const r1 = (n: number): string =>
  Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);

/* ---------------------------------------------------------------- one slot */

/** One prescribed slot, described for a screen: what, when, and what it comes to. */
export interface DescribedSlot {
  /** the slot's own name — "Breakfast", "Strength (bands)" */
  slot: string;
  /** the template's suggested clock, or null */
  time: string | null;
  /** "Idli ×2 + Coconut chutney or Plain dosa + Coconut chutney" */
  dish: string;
  /** the FIRST option's reading; null when the items carry no nutrients */
  kcal: number | null;
  protein: number | null;
  image: string | null;
  part: DayPart;
}

/**
 * A slot as a screen needs to read it.
 *
 * Today's plate and My Plan's full-cycle view are the same prescription seen at
 * two zoom levels, so they describe a slot through one function — otherwise the
 * fortnight view and the day view could name the same meal differently, which is
 * exactly the class of bug this module exists to make impossible.
 */
export function describeSlot(
  slot: (SlotLike & { label?: string; time?: string }) | null | undefined,
  byId: Map<string, PlateItem>,
  fallbackLabel = 'Meal',
): DescribedSlot {
  const sum = slotSum(slot, byId);
  return {
    slot: slot?.label?.trim() || fallbackLabel,
    time: slot?.time ?? null,
    dish: dishLine(slot, byId),
    /* a zero would print "0 kcal" against a real meal, so an unknown reading is
       absent rather than nil */
    kcal: sum.kcal || null,
    protein: sum.protein || null,
    image: slotImage(slot, byId),
    part: partOfDay(slot?.time),
  };
}
