import { describe, expect, it } from 'vitest';

import {
  FLOW,
  FLOW_VERSION,
  canRunFlow,
  canTick,
  firstGap,
  healTicks,
  ownedBy,
  ownerTitle,
  phases,
  readyToFinish,
  stepComplete,
  stepDef,
  stepIndex,
  tickKey,
  tickedCount,
  type FlowRecord,
} from '../src/onboardingFlow.js';

/**
 * The flow maths, which both the service and the console read.
 *
 * These are the tests that stop a console and its server disagreeing about
 * whether somebody may be promoted — every assertion here is a rule the SOP
 * states and the API enforces.
 */

/** Every task of a step, ticked. */
function fill(step: string, upto?: number): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const n = upto ?? stepDef(step).tasks.length;
  for (let i = 0; i < n; i++) out[tickKey(step, i)] = true;
  return out;
}

/** A record standing on `step` with every earlier step properly closed. */
function at(step: string, extra: Record<string, boolean> = {}): FlowRecord {
  let ticks: Record<string, boolean> = {};
  for (let i = 0; i < stepIndex(step); i++) ticks = { ...ticks, ...fill(FLOW[i]!.key) };
  return { step, ticks: { ...ticks, ...extra } };
}

describe('the FLOW itself', () => {
  it('is the twelve steps of the SOP, in four phases', () => {
    expect(FLOW).toHaveLength(12);
    expect(FLOW_VERSION).toBe('HAAL/QMS/OP/2026/01/00');
    expect(phases().map((p) => p.name)).toEqual([
      'Client onboarding',
      'Assessment meeting',
      'Observation · 5 days',
      'Calendar meeting',
    ]);
  });

  it('keeps every step key unique, or tickKey would collide across steps', () => {
    expect(new Set(FLOW.map((s) => s.key)).size).toBe(FLOW.length);
  });

  it('carries the three acts on the tasks the console can actually do', () => {
    const acts = FLOW.flatMap((s) => s.tasks.map((t, i) => [s.key, i, t.act] as const)).filter(
      ([, , a]) => a,
    );
    expect(acts).toEqual([
      ['team', 0, 'capacity'],
      ['team', 2, 'inbody'],
      ['assessafter', 1, 'welcome'],
    ]);
  });

  it('carries a brief on exactly the two steps the SOP annexes one to', () => {
    expect(FLOW.filter((s) => s.brief).map((s) => s.key)).toEqual(['assessmeet', 'obs1']);
  });
});

describe('canTick — sequential, and enforced rather than suggested', () => {
  const p = at('assessafter');

  it('takes a tick on the current step', () => {
    expect(canTick(p, 'assessafter')).toBe(true);
  });

  /* the first load-bearing case: a tick on a LATER step is refused */
  it('refuses a tick on a later step', () => {
    expect(canTick(p, 'obs1')).toBe(false);
    expect(canTick(p, 'calafter')).toBe(false);
  });

  it('takes a correction on an earlier step', () => {
    expect(canTick(p, 'assessprep')).toBe(true);
  });

  it('refuses a step that is not in the flow at all', () => {
    expect(canTick(p, 'obs3')).toBe(false);
  });

  /*
   * The console's extra half: a closed step must be deliberately unlocked before
   * its boxes respond. Omitting the argument is the SERVER's reading, where the
   * lens does not exist — the two callers share one function and differ only in
   * what they pass.
   */
  it('honours the unlock lens when the console passes one', () => {
    expect(canTick(p, 'assessprep', 'assessprep')).toBe(true);
    expect(canTick(p, 'assessprep', null)).toBe(false);
    expect(canTick(p, 'assessprep', 'records')).toBe(false);
    /* the current step never needs unlocking */
    expect(canTick(p, 'assessafter', null)).toBe(true);
  });
});

describe('stepComplete — a step closes only when every task is ticked', () => {
  /* the second load-bearing case: one task left is not complete */
  it('is false with one task left', () => {
    const s = stepDef('assessafter');
    const p: FlowRecord = { step: 'assessafter', ticks: fill('assessafter', s.tasks.length - 1) };
    expect(tickedCount(p, s)).toBe(s.tasks.length - 1);
    expect(stepComplete(p, s)).toBe(false);
  });

  it('is true only when the last one lands', () => {
    const p: FlowRecord = { step: 'assessafter', ticks: fill('assessafter') };
    expect(stepComplete(p, stepDef('assessafter'))).toBe(true);
  });

  it('counts Kiran on step 5 the way the rail reads it — 3 of 10', () => {
    const p = at('assessafter', fill('assessafter', 3));
    expect(tickedCount(p, stepDef('assessafter'))).toBe(3);
    expect(stepDef('assessafter').tasks).toHaveLength(10);
  });
});

describe('firstGap — the hole an edit leaves behind', () => {
  it('is -1 on a record with nothing open behind it', () => {
    expect(firstGap(at('obs1'))).toBe(-1);
  });

  /* the third load-bearing case: an untick BEHIND the current step opens a gap */
  it('finds an untick behind the current step', () => {
    const p = at('assessafter');
    delete p.ticks[tickKey('assessprep', 0)];
    expect(firstGap(p)).toBe(stepIndex('assessprep'));
    expect(firstGap(p)).toBeGreaterThanOrEqual(0);
  });

  it('reports the EARLIEST hole when there are two', () => {
    const p = at('obs2');
    delete p.ticks[tickKey('assessprep', 0)];
    delete p.ticks[tickKey('obs1', 0)];
    expect(firstGap(p)).toBe(stepIndex('assessprep'));
  });

  it('ignores the current step — an unfinished open step is not a gap', () => {
    const p = at('assessafter', fill('assessafter', 3));
    expect(firstGap(p)).toBe(-1);
  });

  it('re-ticking clears it', () => {
    const p = at('assessafter');
    delete p.ticks[tickKey('assessprep', 0)];
    expect(firstGap(p)).toBeGreaterThanOrEqual(0);
    p.ticks[tickKey('assessprep', 0)] = true;
    expect(firstGap(p)).toBe(-1);
  });
});

describe('readyToFinish — the promotion gate', () => {
  const last = FLOW[FLOW.length - 1]!.key;

  it('is true on the last step with everything closed', () => {
    expect(readyToFinish(at(last, fill(last)))).toBe(true);
  });

  it('is false on the last step with a task still open', () => {
    const s = stepDef(last);
    expect(readyToFinish(at(last, fill(last, s.tasks.length - 1)))).toBe(false);
  });

  /*
   * The fourth load-bearing case, and the reason the second half of the rule
   * exists at all: promoting on a record with a hole in step 3 would mint a
   * client the SOP was never actually finished for.
   */
  it('is false while a gap exists, even standing on step 12 with step 12 complete', () => {
    const p = at(last, fill(last));
    expect(readyToFinish(p)).toBe(true);
    delete p.ticks[tickKey('assessprep', 0)];
    expect(stepComplete(p, stepDef(last))).toBe(true);
    expect(firstGap(p)).toBe(stepIndex('assessprep'));
    expect(readyToFinish(p)).toBe(false);
  });

  it('is false anywhere before the last step', () => {
    expect(readyToFinish(at('calmeet', fill('calmeet')))).toBe(false);
  });

  it('leaves Rahul short on calafter with 2 of 4', () => {
    const p = at('calafter', fill('calafter', 2));
    expect(readyToFinish(p)).toBe(false);
    p.ticks[tickKey('calafter', 2)] = true;
    p.ticks[tickKey('calafter', 3)] = true;
    expect(readyToFinish(p)).toBe(true);
  });
});

describe('the coach lens', () => {
  it('lets anyone with allocate or seeAllClients run the flow', () => {
    expect(canRunFlow(true, false)).toBe(true);
    expect(canRunFlow(false, true)).toBe(true);
    expect(canRunFlow(false, false)).toBe(false);
  });

  it('shows a coach their own lines and the team lines, nothing else', () => {
    expect(ownedBy('fitness', 'fitness')).toBe(true);
    expect(ownedBy('fitness', 'team')).toBe(true);
    expect(ownedBy('fitness', 'yoga')).toBe(false);
    /* `client` is not every coach's line — those are the ones ops chases */
    expect(ownedBy('fitness', 'client')).toBe(false);
  });

  it('shows everything when there is no lens', () => {
    expect(ownedBy(null, 'yoga')).toBe(true);
    expect(ownedBy(null, 'client')).toBe(true);
  });

  it('titles the two non-seat owners without consulting the role table', () => {
    const never = () => {
      throw new Error('should not be consulted');
    };
    expect(ownerTitle('team', never)).toBe('Team');
    expect(ownerTitle('client', never)).toBe('Client');
    expect(ownerTitle('fitness', () => 'Fitness Coach')).toBe('Fitness Coach');
    /* an unknown role falls back to its key rather than rendering blank */
    expect(ownerTitle('ghost', () => undefined)).toBe('ghost');
  });
});

describe('healTicks — the invariant, applied once', () => {
  it('backfills every step behind the current one', () => {
    const { ticks } = healTicks('assessprep', {});
    expect(ticks[tickKey('records', 0)]).toBe(true);
    expect(ticks[tickKey('team', 2)]).toBe(true);
    /* and not the step it is standing on */
    expect(ticks[tickKey('assessprep', 0)]).toBeUndefined();
  });

  it('does not mutate what it was given', () => {
    const before: Record<string, boolean> = {};
    healTicks('team', before);
    expect(before).toEqual({});
  });

  /*
   * The whole point of the `seen` counter: a deliberate untick must survive a
   * second pass, or healing would quietly re-fill the very hole a correction
   * was for.
   */
  it('leaves a deliberate untick alone on a second pass', () => {
    const first = healTicks('assessprep', {});
    const corrected = { ...first.ticks };
    delete corrected[tickKey('records', 0)];
    const second = healTicks('assessprep', corrected, first.seen);
    expect(second.ticks[tickKey('records', 0)]).toBeUndefined();
    expect(firstGap({ step: 'assessprep', ticks: second.ticks })).toBe(0);
  });

  it('backfills a task the SOP gained after the record walked past it', () => {
    /* pretend `team` was reckoned with when it had only 2 tasks */
    const { ticks } = healTicks('assessprep', {}, { records: 1, team: 2 });
    expect(ticks[tickKey('team', 2)]).toBe(true);
  });
});
