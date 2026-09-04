import type { CatalogItem } from '@/features/catalog/queries';
import { groupSum, optId, optX, type MacroSum } from '@/features/catalog/slotMath';
import type {
  PlanDose,
  PlanSlot,
  PlanTargets,
  PlanTemplateDay,
  PlanTemplateFull,
  PlanView,
} from '@/features/clients/queries';

/**
 * The Plan tab's pure readings, ported from the demo (console-clients.js
 * `effectiveDay` / `isEdited` / `dayKeys`, core.js `HV.doseOf` / `HV.slotSum` /
 * `HV.tplTargetsOn` / `HV.nutTargetsFor`).
 *
 * Every reader here takes a VIEW — the ticket when one is open, else live —
 * because the console reads the ticket. Which of the two it is was decided on
 * the server; nothing here looks at `ticket` or `live` directly.
 */

export function dayKeys(t: PlanTemplateFull | null | undefined): number[] {
  return Object.keys(t?.days ?? {})
    .map(Number)
    .sort((a, b) => a - b);
}

/** one pillar's day for this client: the coach's override wins, else the template's day */
export function effectiveDay(
  v: PlanView,
  t: PlanTemplateFull | null,
  d: number,
): PlanTemplateDay | null {
  const tplDay = t?.days?.[String(d)];
  const o = v.overrides?.[String(d)];
  if (o && o.slots) return { ...(tplDay ?? {}), slots: o.slots };
  return tplDay ?? null;
}

export function isEdited(v: PlanView, d: number): boolean {
  const o = v.overrides?.[String(d)];
  return !!(o && o.slots);
}

/**
 * A slot's value for one field, in three rungs: the CLIENT'S own number set on
 * their assignment (it beats the plan's days the same way their hour beats
 * slot.time on the clock), else what the coach set on THIS slot, else the
 * catalogue item's own default. That is what lets one exercise be prescribed
 * 3x10 at level 1 and 4x15 at level 4 without duplicating it in the library —
 * and 12 reps for the one knee that asked.
 */
export function doseOf(
  slot: Pick<PlanSlot, 'options' | 'dose'> | null | undefined,
  key: string,
  byId: Map<string, CatalogItem>,
  assign?: { dose?: PlanDose | null } | null,
): unknown {
  const mine = (assign?.dose ?? {}) as Record<string, unknown>;
  if (mine[key] !== undefined && mine[key] !== '') return mine[key];
  const own = (slot?.dose ?? {}) as Record<string, unknown>;
  if (own[key] !== undefined && own[key] !== '') return own[key];
  const first = slot?.options?.[0] ?? [];
  for (const e of first) {
    const it = byId.get(optId(e));
    const d = it?.dose as Record<string, unknown> | null | undefined;
    if (d && d[key] !== undefined && d[key] !== '') return d[key];
  }
  return undefined;
}

/**
 * The plate's reading is the FIRST option group's — that is the option the
 * client is being asked to eat, and alternatives are alternatives, not extra
 * food.
 */
export function slotSum(slot: PlanSlot, byId: Map<string, CatalogItem>): MacroSum {
  return groupSum(slot.options?.[0] ?? [], byId);
}

/**
 * A template's targets for one day. Targets live ON THE DAY: a day that states
 * none INHERITS from the nearest earlier day that did — the composer's prefill
 * rule and the read rule, one rule, so what the coach saw while typing day 3 is
 * exactly what day 9 resolves to.
 */
export function tplTargetsOn(
  t: PlanTemplateFull | null | undefined,
  day: number,
  cycleDays: number,
): PlanTargets | null {
  if (!t) return null;
  for (let d = Math.max(1, Math.min(day || 1, cycleDays)); d >= 1; d--) {
    const tg = t.days?.[String(d)]?.targets;
    if (tg && tg.kcal) return tg;
  }
  return null;
}

export type TargetSrc = 'client' | 'template' | 'derived';
export interface ResolvedTargets extends Required<PlanTargets> {
  src: TargetSrc;
}

/* the demo's nutrition split defaults — carbs at half of energy, fat at 27%,
   fibre at 14 g per 1000 kcal — which the console has no configuration for yet */
const SPLIT = { carbs: 0.5, fat: 0.27, fibrePer1000: 14 };

/**
 * The day's nutrition targets, resolved in ONE place — three rungs, per field,
 * so a coach can author as little or as much as they like and the panel always
 * has a number:
 *
 *   1. this client's own override on the assignment
 *   2. the assigned template's targets for THIS day (stated or inherited)
 *   3. derived — 1800 kcal, protein at 20% of energy, the split above
 *
 * LIVE fields only, as the demo reads them: an unapproved draft must not move a
 * client's dials. NULL when nothing is approved and nothing is stated — an
 * assigned template with no targets DOES get the derivation, because there is a
 * real prescribed plate to measure.
 */
export function nutTargetsFor(
  live: PlanView,
  t: PlanTemplateFull | null,
  day: number,
  cycleDays: number,
): ResolvedTargets | null {
  const ov = live.targets ?? {};
  const tt = tplTargetsOn(t, day, cycleDays) ?? {};
  if (!ov.kcal && !tt.kcal && !live.templateId) return null;
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

/**
 * The library's items for one pillar, the client's category first — `catalogFor`.
 * When nothing in the library is filed under the track, every category is
 * offered and `all` says so, so the editor can say it out loud.
 */
export function catalogFor(
  items: CatalogItem[],
  track: string | null | undefined,
): { items: CatalogItem[]; all: boolean } {
  const fit = items.filter((i) => i.track === track);
  return { items: fit.length ? fit : items, all: !fit.length };
}

/**
 * Save-time canonicalisation, shared by the Day sheet's writer — drop empty
 * option groups, ×1 back to the bare id, an empty dose gone. Returns the label
 * of the first slot left with no options, which refuses the save.
 */
export function pruneSlots(slots: PlanSlot[], fallbackLabel: string): { slots: PlanSlot[]; bad: string | null } {
  let bad: string | null = null;
  const out = slots.map((slot) => {
    const options = (slot.options ?? [])
      .filter((grp) => grp.length)
      .map((grp) => grp.map((en) => (optX(en) === 1 ? optId(en) : en)));
    if (!options.length && !bad) bad = slot.label || fallbackLabel;
    const next: PlanSlot = { ...slot, options };
    if (next.dose && !Object.keys(next.dose).length) delete next.dose;
    return next;
  });
  return { slots: out, bad };
}
