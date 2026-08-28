/**
 * The two plans — ported from `HV.PLANS` (data.js:155) with `HV.aiLeads` and
 * `HV.humanPillar`.
 *
 * These replaced the three-plan Black / Grey / White model (TJ, 16 Aug 2026);
 * those keys no longer exist anywhere, and demo/app/README.md still describing
 * them is stale.
 *
 * The invariant the whole product is built on: *the coach's judgement sits above
 * the AI's assistance*. A Poorna client never sees an AI rating directly, and the
 * coach conversations Poorna produces are the training material for Svayam.
 */

export const PLAN_KEYS = ['poorna', 'svayam'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanDef {
  key: PlanKey;
  name: string;
  tag: string;
  /** Who speaks to whom. The one-line statement of the plan's shape. */
  flow: string;
  /**
   * Whether this plan can actually be sold today. Svayam is `false` for the
   * first launch — onboarding renders it as "Opening soon" and refuses the tap.
   * Flipping this one flag opens the second door everywhere.
   */
  launch: boolean;
  desc: string;
}

export const PLANS = {
  poorna: {
    key: 'poorna',
    name: 'HAALVING Poorna',
    tag: 'Four pillars, four dedicated coaches',
    flow: 'AI -> Coach -> Client',
    launch: true,
    desc:
      'A dedicated coach on each of the four pillars — Nutrition, Fitness, Yoga and Mind Wellness — ' +
      'coordinated by your Haalving Coach, with a doctor above them all. AI works only in the background, ' +
      'giving your coaches data and holistic analysis; every coach applies their own judgement over it.',
  },
  svayam: {
    key: 'svayam',
    name: 'HAALVING Svayam',
    tag: 'AI-guided, add coaches as you like',
    flow: 'AI -> Client',
    launch: false,
    desc:
      'The HAALVING AI coaches you directly — daily plans, meal readings and check-ins. ' +
      'Add a human coach to any pillar whenever you want more. Safety escalations always reach a human.',
  },
} as const satisfies Record<PlanKey, PlanDef>;

/** The plans a client may actually be sold today. `HV.plansOnSale`. */
export function plansOnSale(): PlanKey[] {
  return PLAN_KEYS.filter((k) => PLANS[k].launch);
}

export interface PlanCarrier {
  plan?: string | null;
  humanPillars?: readonly string[] | null;
}

/**
 * Does the AI speak to this client directly? Poorna: never — it briefs the
 * coaches instead. Svayam: yes. One test, so no screen re-derives it.
 * `HV.aiLeads`.
 */
export function aiLeads(c: PlanCarrier | null | undefined): boolean {
  return !!c && c.plan === 'svayam';
}

/**
 * Is this pillar carried by a human for this client? Poorna is all four by
 * definition; Svayam only where a coach was added. PILLAR keys, not role keys.
 * `HV.humanPillar`.
 */
export function humanPillar(c: PlanCarrier | null | undefined, pillarKey: string): boolean {
  if (!c) return false;
  if (c.plan === 'poorna') return true;
  return (c.humanPillars ?? []).includes(pillarKey);
}

export function planName(key: string): string {
  return (PLANS as Record<string, PlanDef>)[key]?.name ?? key;
}

export function isPlanKey(v: string): v is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(v);
}
