'use client';

import { FLOW, stepComplete, stepIndex, tickedCount, type FlowRecord } from '@haalving/shared';

import { Icon } from '@/components/icons/Icon';
import { Num } from '@/components/ui';

/**
 * How a step reads — ported from `stepState` / `stepMeta` / `stepDotIcon`
 * (console-pipeline.js:622-651).
 *
 * ONE PLACE DECIDES, so the crumb, the row and the tick handler can never
 * disagree about what state a step is in. The record's own position is its
 * `step` field and nothing else; everything below is derived from that and the
 * ticks, by the shared helpers both sides of the wire already use.
 */

export type StepState = 'done' | 'gap' | 'now' | 'lock';

export function stepState(rec: FlowRecord, i: number): StepState {
  const cur = stepIndex(rec.step);
  if (i < cur) return stepComplete(rec, FLOW[i]!) ? 'done' : 'gap';
  return i === cur ? 'now' : 'lock';
}

/** The step's second line — its count, in the words its state calls for. */
export function StepMeta({ rec, i }: { rec: FlowRecord; i: number }) {
  const s = FLOW[i]!;
  const st = stepState(rec, i);
  const done = tickedCount(rec, s);
  const open = s.tasks.length - done;
  const word = s.tasks.length === 1 ? 'task' : 'tasks';

  if (st === 'gap') {
    return (
      <>
        <Num>{open}</Num> open {open === 1 ? 'task' : 'tasks'} — this step was closed, and an edit
        re-opened it
      </>
    );
  }
  if (st === 'done') {
    return (
      <>
        <Num>{s.tasks.length}</Num> {word} complete
      </>
    );
  }
  if (st === 'now') {
    return (
      <>
        <Num>{done}</Num> of <Num>{s.tasks.length}</Num> done
      </>
    );
  }
  return (
    <>
      <Num>{s.tasks.length}</Num> {word} · locked until step <Num>{i}</Num> closes
    </>
  );
}

/**
 * The dot's mark: a warning on a hole, a tick on a closed step, the step's own
 * numeral on the open one, and a padlock on everything ahead.
 */
export function StepDot({ rec, i }: { rec: FlowRecord; i: number }) {
  const st = stepState(rec, i);
  if (st === 'gap') return <Icon name="warn" />;
  if (st === 'done') return <Icon name="check" />;
  if (st === 'now') return <Num>{i + 1}</Num>;
  return <Icon name="lock" />;
}
