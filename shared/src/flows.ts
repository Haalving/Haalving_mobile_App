import { cycleDays, type ProgramShape } from './cycle.js';

/**
 * Automations — the message sequences a client walks without anybody sending them.
 *
 * Ported from `flowTemplates` (data.js:2103) and the Automations tab
 * (console-config.js:684-848).
 *
 * Named AUTOMATION rather than Flow: `onboardingFlow.ts` already owns `FlowStep`
 * for the SOP's twelve steps, and the two are entirely different things. The word
 * "flow" is overloaded in this product — the routes and tables keep it because
 * that is what the demo and the page call them, and only the TYPES are renamed.
 *
 * TWO TRIGGERS, and the difference is which clock they read. `ENROL` counts days
 * from the day somebody joined, so it runs ONCE; `CYCLE_DAY` reads the cycle's own
 * day number, so it runs EVERY cycle. A welcome message wants the first, a
 * habit-a-week wants the second, and the two must never be conflated: an ENROL
 * step on "day 3" means three days after joining, while a CYCLE_DAY step on day 3
 * means the third day of every fortnight for as long as they stay.
 */

export const FLOW_TRIGGERS = ['ENROL', 'CYCLE_DAY'] as const;
export type FlowTrigger = (typeof FLOW_TRIGGERS)[number];

export const TRIGGER_LABELS: Record<FlowTrigger, string> = {
  ENROL: 'Once, from joining',
  CYCLE_DAY: 'Every cycle',
};

export interface AutomationStep {
  id?: string;
  /** ENROL: days after joining. */
  after?: number | null;
  /** CYCLE_DAY: the day of the cycle. */
  on?: number | null;
  /** Minutes from midnight. */
  at: number;
  title: string;
  text: string;
  position?: number;
}

export interface AutomationTemplate {
  id: string;
  name: string;
  desc?: string | null;
  trigger: FlowTrigger;
  /** Whether a NEW client is switched on for it. */
  defaultOn: boolean;
  /** The house switch. Pausing here stops it for everybody. */
  enabled: boolean;
  steps: AutomationStep[];
}

/** `Day 3 · 9:00 am` / `3 days after joining` — how a step's timing reads. */
export function stepWhen(trigger: FlowTrigger, step: AutomationStep): string {
  if (trigger === 'ENROL') {
    const d = step.after ?? 0;
    return d === 0 ? 'On joining' : `${d} day${d === 1 ? '' : 's'} after joining`;
  }
  return `Day ${step.on ?? 1} of the cycle`;
}

/**
 * Check a template and its steps.
 *
 * A CYCLE_DAY step must fall inside the cycle — a step on day 20 of a 14-day cycle
 * would simply never fire, silently, which is the worst way for an automation to
 * fail. An ENROL step has no such ceiling: "180 days after joining" is a perfectly
 * good anniversary message.
 *
 * Returns the sentence, empty when valid.
 */
export function validateTemplate(
  t: Pick<AutomationTemplate, 'trigger' | 'steps'>,
  shapeOverride?: Partial<ProgramShape> | null,
): string {
  const days = cycleDays(shapeOverride);

  for (const s of t.steps) {
    if (!Number.isInteger(s.at) || s.at < 0 || s.at > 1439) {
      return 'A step has to be sent at a real time of day. Nothing was saved.';
    }
    if (!s.title?.trim()) {
      return 'Every step needs a title. Nothing was saved.';
    }
    if (t.trigger === 'CYCLE_DAY') {
      const on = s.on ?? 0;
      if (!Number.isInteger(on) || on <= 0) {
        return 'A cycle step must name a day of the cycle. Nothing was saved.';
      }
      if (on > days) {
        return `A cycle step must fall inside the cycle — Day ${on} of a ${days}-day cycle doesn’t exist. Nothing was saved.`;
      }
    } else {
      const after = s.after ?? 0;
      if (!Number.isInteger(after) || after < 0) {
        return 'A step must be a whole number of days after joining. Nothing was saved.';
      }
    }
  }
  return '';
}

/**
 * Is this template on for this client?
 *
 * The per-client map is THIN — a row exists only where somebody has overridden
 * the template's own default. That is what keeps "switched on for 6 of 7" honest
 * without writing a row per client per template every time a template is added.
 */
export function flowOn(
  template: Pick<AutomationTemplate, 'defaultOn' | 'enabled'>,
  override: boolean | undefined,
): boolean {
  /* the house switch wins: pausing a template stops it for everybody, however
     many people have individually turned it on */
  if (!template.enabled) return false;
  return override ?? template.defaultOn;
}
