/**
 * The approval chains — the sequence of signatures an item collects before it
 * publishes, and the LAST signature is what publishes it.
 *
 * Ported from `CHAIN_LABELS` / `CHAIN_ORDER` (console-config.js:292-300) and the
 * six seeded chains in data.js:1542. `template` is the seventh: the demo's view
 * adds it with a default of Ops Head then Super User, because a plan template
 * that published on one signature would let a single person change what every
 * future client is given.
 */

export const CHAIN_KINDS = [
  'team',
  'goalsheet',
  'diet',
  'chart',
  'level',
  'calendar',
  'template',
] as const;

export type ChainKind = (typeof CHAIN_KINDS)[number];

export const CHAIN_LABELS: Record<ChainKind, string> = {
  team: 'Team allocation',
  goalsheet: 'Goal sheet',
  diet: 'Diet plan',
  chart: 'Workout / Yoga chart',
  level: 'Level review',
  calendar: 'Calendar',
  template: 'Plan template',
};

export interface ChainStep {
  role: string;
}

export const DEFAULT_CHAINS: Record<ChainKind, ChainStep[]> = {
  team: [{ role: 'opsmgr' }, { role: 'opshead' }, { role: 'core' }],
  goalsheet: [{ role: 'opsmgr' }, { role: 'core' }],
  diet: [{ role: 'opshead' }, { role: 'core' }],
  chart: [{ role: 'opshead' }],
  level: [{ role: 'opsmgr' }, { role: 'opshead' }],
  calendar: [{ role: 'opsmgr' }, { role: 'opshead' }],
  /* the view's own default — see the note above */
  template: [{ role: 'opshead' }, { role: 'core' }],
};

export function isChainKind(v: string): v is ChainKind {
  return (CHAIN_KINDS as readonly string[]).includes(v);
}

/**
 * A chain must be walkable.
 *
 * At least one step, every role real, and NO ROLE TWICE — a chain that asked the
 * same seat to sign twice would either block on the second (they already signed)
 * or accept one signature for two steps, and neither is a sequence of approvals.
 *
 * Returns the sentence, empty when valid.
 */
export function validateChain(steps: ChainStep[], roleKeys: readonly string[]): string {
  if (!steps.length) {
    return 'A chain needs at least one signature. Nothing was saved.';
  }
  const unknown = steps.find((s) => !roleKeys.includes(s.role));
  if (unknown) {
    return `There is no role called ${unknown.role}. Nothing was saved.`;
  }
  const seen = new Set<string>();
  for (const s of steps) {
    if (seen.has(s.role)) {
      return 'A role can only appear once in a chain. Nothing was saved.';
    }
    seen.add(s.role);
  }
  return '';
}
