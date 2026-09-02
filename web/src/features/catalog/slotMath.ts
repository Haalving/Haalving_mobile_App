import type { CatalogItem, ItemNutrients, OptionEntry } from './queries';

/**
 * The option-entry grammar and the macro summer — ported verbatim from the demo
 * (`HV.optId` / `HV.optX` / `HV.groupSum`, core.js:115-171).
 *
 * An option is a list of items TAKEN TOGETHER; each is a bare id, or `{id, x}`
 * when a portion is eaten more than once. A plate's reading is the sum of its
 * items' per-portion nutrients times x — the demo kept `nutrients` on every food
 * item and read the plate from them, and the console now does the same.
 */

export const optId = (e: OptionEntry): string => (typeof e === 'string' ? e : (e?.id ?? ''));

export const optX = (e: OptionEntry): number => {
  const x = e && typeof e === 'object' ? Number(e.x) : 1;
  return x > 1 ? Math.round(x) : 1;
};

export interface MacroSum {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

/** Sum one option's items × portions into a macro reading. */
export function groupSum(entries: OptionEntry[], byId: Map<string, CatalogItem>): MacroSum {
  const acc: MacroSum = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
  for (const e of entries ?? []) {
    const n = (byId.get(optId(e))?.nutrients ?? {}) as ItemNutrients;
    const x = optX(e);
    acc.kcal += (Number(n.kcal) || 0) * x;
    acc.protein += (Number(n.protein) || 0) * x;
    acc.carbs += (Number(n.carbs) || 0) * x;
    acc.fat += (Number(n.fat) || 0) * x;
    acc.fibre += (Number(n.fibre) || 0) * x;
  }
  return acc;
}

/** 5.5 → "5.5", 210 → "210" — one decimal only when it earns it. */
export const r1 = (n: number): string =>
  Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);
